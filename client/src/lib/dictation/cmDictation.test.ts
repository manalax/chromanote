import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import { dictationExtension, editorDictation } from './cmDictation';

/** Just enough of an EditorView for the dictation helpers (state + dispatch). */
function fakeView(doc: string, cursor = doc.length) {
  const view = {
    state: EditorState.create({ doc, selection: { anchor: cursor }, extensions: dictationExtension }),
    dispatch(spec: TransactionSpec) {
      view.state = view.state.update(spec).state;
    },
  };
  return view as typeof view & EditorView;
}

function dictate(view: EditorView, words: string) {
  editorDictation.start(view);
  editorDictation.final(view, words);
  return editorDictation.end(view)!;
}

describe('editorDictation.replace', () => {
  it('replaces the dictated span with tidied text', () => {
    const view = fakeView('Notes: ');
    const span = dictate(view, 'hello world');
    expect(editorDictation.replace(view, span, 'Hello world.')).toBe(true);
    expect(view.state.doc.toString()).toBe('Notes: Hello world.');
  });

  it('follows the span when text is added before it while tidying', () => {
    const view = fakeView('');
    const span = dictate(view, 'second thought');
    view.dispatch({ changes: { from: 0, insert: 'first thought ' } });
    expect(editorDictation.replace(view, span, 'Second thought.')).toBe(true);
    expect(view.state.doc.toString()).toBe('first thought Second thought.');
  });

  it('keeps the raw words if they were edited while tidying', () => {
    const view = fakeView('');
    const span = dictate(view, 'hello world');
    view.dispatch({ changes: { from: 0, to: 5, insert: 'goodbye' } });
    expect(editorDictation.replace(view, span, 'Hello world.')).toBe(false);
    expect(view.state.doc.toString()).toBe('goodbye world');
  });
});
