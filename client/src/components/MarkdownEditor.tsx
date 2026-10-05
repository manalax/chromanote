import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  autocompletion,
  completionKeymap,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Prec } from '@codemirror/state';
import { tags as t } from '@lezer/highlight';
import { EditorView, keymap } from '@codemirror/view';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useData } from '@/lib/data';
import { type DictatedSpan, dictationExtension, editorDictation } from '@/lib/dictation/cmDictation';

export interface MarkdownEditorHandle {
  insert: (text: string) => void;
  uploadImages: (files: File[]) => Promise<void>;
  focus: () => void;
  /** Live dictation into the editor at the cursor. */
  dictation: {
    start: () => void;
    interim: (text: string) => void;
    final: (text: string) => void;
    end: () => DictatedSpan | null;
    replace: (span: DictatedSpan, text: string) => boolean;
  };
}

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Note being edited; excluded from link suggestions. */
  noteId?: string;
  placeholder?: string;
}

// Markdown styling that follows the note's text colour (the default style uses
// fixed colours that ignore it and vanish on dark surfaces).
const faded = 'color-mix(in oklab, currentColor 55%, transparent)';
const markdownHighlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: '700' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], textDecoration: 'underline', textUnderlineOffset: '2px' },
  { tag: t.monospace, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: '0.9em' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: faded },
]);

const imageFiles = (list: FileList | null | undefined) =>
  Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor(
  { value, onChange, noteId, placeholder },
  ref
) {
  const cm = useRef<ReactCodeMirrorRef>(null);
  const { titles } = useData();
  // The completion source reads titles through a ref so the extension list
  // stays stable (re-creating extensions would reset the editor).
  const titlesRef = useRef(titles);
  useEffect(() => {
    titlesRef.current = titles;
  }, [titles]);

  const insert = (text: string) => {
    const view = cm.current?.view;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
    view.focus();
  };

  const uploadImages = async (files: File[]) => {
    for (const file of files) {
      const id = toast.loading(`Uploading ${file.name || 'image'}…`);
      try {
        const url = await api.uploadImage(file);
        const alt = (file.name || 'image').replace(/\.[^.]+$/, '').replace(/[[\]]/g, '');
        insert(`![${alt}](${url})\n`);
        toast.success('Image added', { id });
      } catch (err) {
        toast.error((err as Error).message, { id });
      }
    }
  };

  const uploadRef = useRef(uploadImages);
  useEffect(() => {
    uploadRef.current = uploadImages;
  });

  useImperativeHandle(ref, () => {
    const withView = <T,>(fn: (view: EditorView) => T, fallback: T) => {
      const view = cm.current?.view;
      return view ? fn(view) : fallback;
    };
    return {
      insert,
      uploadImages,
      focus: () => cm.current?.view?.focus(),
      dictation: {
        start: () => withView((v) => editorDictation.start(v), undefined),
        interim: (text) => withView((v) => editorDictation.interim(v, text), undefined),
        final: (text) => withView((v) => editorDictation.final(v, text), undefined),
        end: () => withView((v) => editorDictation.end(v), null),
        replace: (span, text) => withView((v) => editorDictation.replace(v, span, text), false),
      },
    };
  });

  const extensions = useMemo(() => {
    const wikilinkSource = (ctx: CompletionContext): CompletionResult | null => {
      const match = ctx.matchBefore(/\[\[[^[\]\n]*/);
      if (!match) return null;
      return {
        from: match.from + 2,
        options: titlesRef.current
          .filter((t) => t.id !== noteId)
          .map((t) => ({ label: t.title, type: 'text', apply: `${t.title}]]` })),
        validFor: /^[^[\]\n]*$/,
      };
    };

    // The callbacks below read refs only when CodeMirror fires them (typing,
    // paste, drop), never during render.
    /* eslint-disable react-hooks/refs */
    return [
      markdown({ base: markdownLanguage }),
      syntaxHighlighting(markdownHighlight),
      dictationExtension,
      EditorView.lineWrapping,
      autocompletion({ override: [wikilinkSource], icons: false, defaultKeymap: false }),
      // Above markdown's Enter handling so Enter accepts a suggestion.
      Prec.highest(keymap.of(completionKeymap)),
      EditorView.domEventHandlers({
        paste: (event) => {
          const files = imageFiles(event.clipboardData?.files);
          if (!files.length) return false;
          event.preventDefault();
          void uploadRef.current(files);
          return true;
        },
        drop: (event, view) => {
          const files = imageFiles(event.dataTransfer?.files);
          if (!files.length) return false;
          event.preventDefault();
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos !== null) view.dispatch({ selection: { anchor: pos } });
          void uploadRef.current(files);
          return true;
        },
      }),
    ];
    /* eslint-enable react-hooks/refs */
  }, [noteId]);

  return (
    <CodeMirror
      ref={cm}
      value={value}
      onChange={onChange}
      extensions={extensions}
      placeholder={placeholder}
      theme="none"
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        autocompletion: false,
        closeBrackets: false,
        syntaxHighlighting: false,
        searchKeymap: true,
      }}
      className="h-full"
      height="100%"
    />
  );
});
