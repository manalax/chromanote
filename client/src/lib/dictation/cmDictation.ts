import { isolateHistory } from '@codemirror/commands';
import { StateEffect, StateField, Transaction, type Extension } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { joinDictation } from './commands';

interface Range {
  from: number;
  to: number;
}

interface DictationState {
  /** Everything dictated in this session (finished phrases + current interim). */
  session: Range | null;
  /** The in-progress phrase, shown faded until it is final. */
  interim: Range | null;
  /** Ended sessions awaiting their tidy-up; kept in step with later edits. */
  pending: PendingSpan[];
}

interface PendingSpan extends Range {
  id: number;
}

const setSession = StateEffect.define<Range | null>();
const setInterim = StateEffect.define<Range | null>();
const addPending = StateEffect.define<PendingSpan>();
const removePending = StateEffect.define<number>();

const mapRange = (r: Range | null, tr: Transaction): Range | null =>
  r && { from: tr.changes.mapPos(r.from, -1), to: tr.changes.mapPos(r.to, 1) };

/** Maps a finished span so text typed right at either edge stays outside it. */
const mapPendingSpan = (p: PendingSpan, tr: Transaction): PendingSpan => {
  const from = tr.changes.mapPos(p.from, 1);
  return { ...p, from, to: Math.max(from, tr.changes.mapPos(p.to, -1)) };
};

let nextPendingId = 0;

const dictationField = StateField.define<DictationState>({
  create: () => ({ session: null, interim: null, pending: [] }),
  update(value, tr) {
    let next: DictationState = {
      session: mapRange(value.session, tr),
      interim: mapRange(value.interim, tr),
      pending: tr.docChanged ? value.pending.map((p) => mapPendingSpan(p, tr)) : value.pending,
    };
    for (const e of tr.effects) {
      if (e.is(setSession)) next = { ...next, session: e.value };
      if (e.is(setInterim)) next = { ...next, interim: e.value };
      if (e.is(addPending)) next = { ...next, pending: [...next.pending, e.value] };
      if (e.is(removePending)) next = { ...next, pending: next.pending.filter((p) => p.id !== e.value) };
    }
    return next;
  },
  provide: (field) =>
    EditorView.decorations.from(field, (value) =>
      value.interim && value.interim.to > value.interim.from
        ? Decoration.set([
            Decoration.mark({ class: 'cm-dictation-interim' }).range(value.interim.from, value.interim.to),
          ])
        : Decoration.none
    ),
});

export const dictationExtension: Extension = dictationField;

export interface DictatedSpan extends Range {
  /** Identifies the span for `replace`, which follows it through later edits. */
  id: number;
  text: string;
}

const textBefore = (view: EditorView, pos: number) => view.state.doc.sliceString(Math.max(0, pos - 200), pos);

/** Editor-side dictation: live interim text, final phrases, and tidy-up replacement. */
export const editorDictation = {
  start(view: EditorView) {
    const pos = view.state.selection.main.to;
    view.dispatch({
      effects: [setSession.of({ from: pos, to: pos }), setInterim.of(null)],
      selection: { anchor: pos },
    });
  },

  interim(view: EditorView, text: string) {
    const { session, interim } = view.state.field(dictationField);
    if (!session) return;
    const at = interim ?? { from: session.to, to: session.to };
    const before = textBefore(view, at.from);
    const shown = text.trim() ? (before && !/\s$/.test(before) ? ' ' : '') + text.trim() : '';
    view.dispatch({
      changes: { from: at.from, to: at.to, insert: shown },
      effects: setInterim.of(shown ? { from: at.from, to: at.from + shown.length } : null),
      selection: { anchor: at.from + shown.length },
      // Interim text is provisional: keep it out of undo history.
      annotations: Transaction.addToHistory.of(false),
      scrollIntoView: true,
    });
  },

  final(view: EditorView, text: string) {
    const { session, interim } = view.state.field(dictationField);
    if (!session) return;
    const at = interim ?? { from: session.to, to: session.to };
    if (interim) {
      // Remove the provisional text without recording it in history.
      view.dispatch({
        changes: { from: interim.from, to: interim.to },
        effects: setInterim.of(null),
        annotations: Transaction.addToHistory.of(false),
      });
    }
    const insert = joinDictation(textBefore(view, at.from), text);
    if (!insert) return;
    view.dispatch({
      changes: { from: at.from, insert },
      selection: { anchor: at.from + insert.length },
      userEvent: 'input.dictate',
      scrollIntoView: true,
    });
  },

  /** Ends the session and returns what was dictated (without any leftover interim text). */
  end(view: EditorView): DictatedSpan | null {
    const { session, interim } = view.state.field(dictationField);
    if (interim) {
      view.dispatch({
        changes: { from: interim.from, to: interim.to },
        annotations: Transaction.addToHistory.of(false),
      });
    }
    const current = view.state.field(dictationField).session ?? session;
    if (!current || current.to <= current.from) {
      view.dispatch({ effects: [setSession.of(null), setInterim.of(null)] });
      return null;
    }
    const span = { from: current.from, to: current.to, id: nextPendingId++ };
    view.dispatch({ effects: [setSession.of(null), setInterim.of(null), addPending.of(span)] });
    return { ...span, text: view.state.doc.sliceString(span.from, span.to) };
  },

  /**
   * Swaps in tidied text as its own undo step (so one undo restores the raw
   * words). Skipped if the user has edited that text in the meantime.
   */
  replace(view: EditorView, span: DictatedSpan, text: string): boolean {
    // Where the span is now, after any edits made while the tidy-up ran.
    const at = view.state.field(dictationField).pending.find((p) => p.id === span.id);
    const drop = removePending.of(span.id);
    if (!at || view.state.doc.sliceString(at.from, at.to) !== span.text) {
      view.dispatch({ effects: drop });
      return false;
    }
    view.dispatch({
      changes: { from: at.from, to: at.to, insert: text },
      effects: drop,
      userEvent: 'input.dictate.tidy',
      // Its own undo step, even if it lands right after the last phrase.
      annotations: isolateHistory.of('full'),
    });
    return true;
  },

  /** Stops tracking a span that won't be replaced. */
  release(view: EditorView, span: DictatedSpan) {
    view.dispatch({ effects: removePending.of(span.id) });
  },
};
