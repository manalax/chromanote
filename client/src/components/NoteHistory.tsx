import { useEffect, useMemo, useState } from 'react';
import { History, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  ToggleGroup,
  ToggleGroupItem,
} from '@databricks/appkit-ui/react';
import { api, type Revision, type RevisionReason, type RevisionSummary } from '@/lib/api';
import { diffText } from '@/lib/diff';
import { formatDateTime, formatRelative } from '@/lib/meta';
import { cn } from '@/lib/utils';
import { MarkdownPreview } from './MarkdownPreview';

/** Revisions are the text as it was just before a change, so each label names that change. */
const REASONS: Record<RevisionReason, string> = {
  edit: 'Earlier edit',
  rename: 'Before rename',
  link: 'Before link update',
  restore: 'Before restore',
};

type Mode = 'changes' | 'preview';

interface NoteHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string;
  /** The note's current text, which revisions are compared against. */
  title: string;
  body: string;
  readOnly?: boolean;
  onRestore: (revision: Revision) => Promise<void>;
}

/** Side panel listing a note's past versions, with a diff, a preview and restore. */
export function NoteHistory({ open, onOpenChange, noteId, title, body, readOnly, onRestore }: NoteHistoryProps) {
  const [revisions, setRevisions] = useState<RevisionSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Revision | null>(null);
  const [mode, setMode] = useState<Mode>('changes');
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRevisions(null);
    setSelected(null);
    api
      .listRevisions(noteId)
      .then((list) => {
        if (cancelled) return;
        setRevisions(list);
        setSelectedId(list[0]?.id ?? null);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        toast.error(err.message);
        setRevisions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, noteId]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setSelected(null);
    api
      .getRevision(noteId, selectedId)
      .then((r) => !cancelled && setSelected(r))
      .catch((err: Error) => !cancelled && toast.error(err.message));
    return () => {
      cancelled = true;
    };
  }, [noteId, selectedId]);

  // Each part is keyed by its type and position in the combined text.
  const diff = useMemo(() => {
    let at = 0;
    return (selected ? diffText(selected.body, body) : []).map((part) => {
      const key = `${part.type}${at}`;
      at += part.text.length;
      return { ...part, key };
    });
  }, [selected, body]);

  const restore = async () => {
    if (!selected) return;
    setRestoring(true);
    try {
      await onRestore(selected);
      onOpenChange(false);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-3xl">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <History className="size-4" /> History
          </SheetTitle>
          <SheetDescription>
            A version is saved each time you pause writing for a minute, and every 10 minutes while you write. Compare
            an earlier version with the current note, or restore it.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <ScrollArea className="max-h-48 border-b sm:max-h-none sm:w-56 sm:shrink-0 sm:border-r sm:border-b-0">
            <ul className="p-2 text-sm">
              <li className="px-3 py-2 text-muted-foreground">
                <div className="font-medium text-foreground">Current</div>
                <div className="text-xs">The note as it is now</div>
              </li>
              {revisions === null &&
                Array.from({ length: 4 }, (_, i) => (
                  <li key={i} className="px-3 py-2">
                    <Skeleton className="h-9 w-full" />
                  </li>
                ))}
              {revisions?.length === 0 && (
                <li className="px-3 py-2 text-xs text-muted-foreground">
                  No earlier versions yet. They appear once you edit this note.
                </li>
              )}
              {revisions?.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setSelectedId(r.id)}
                    className={cn(
                      'w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-accent',
                      r.id === selectedId && 'bg-accent'
                    )}
                  >
                    <time dateTime={r.created_at} title={formatDateTime(r.created_at)} className="font-medium">
                      {formatRelative(r.created_at)}
                    </time>
                    <div className="truncate text-xs text-muted-foreground">
                      {REASONS[r.reason] ?? r.reason} · {r.chars.toLocaleString()} chars
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>

          <div className="flex min-h-0 flex-1 flex-col">
            {selectedId && (
              <div className="flex items-center gap-2 border-b px-4 py-2">
                <ToggleGroup type="single" size="sm" value={mode} onValueChange={(v) => v && setMode(v as Mode)}>
                  <ToggleGroupItem value="changes">Changes</ToggleGroupItem>
                  <ToggleGroupItem value="preview">Preview</ToggleGroupItem>
                </ToggleGroup>
                <Button
                  size="sm"
                  className="ml-auto gap-2"
                  disabled={!selected || readOnly || restoring}
                  onClick={() => void restore()}
                >
                  <RotateCcw className="size-4" /> Restore this version
                </Button>
              </div>
            )}
            <ScrollArea className="min-h-0 flex-1">
              <div className="px-4 py-4">
                {selectedId && !selected && <Skeleton className="h-40 w-full" />}
                {selected && mode === 'changes' && (
                  <>
                    {selected.title !== title && (
                      <p className="mb-3 text-sm">
                        <span className="text-muted-foreground">Title: </span>
                        <del className="rounded bg-red-500/15 px-0.5 text-red-700 dark:text-red-300">
                          {selected.title || 'Untitled'}
                        </del>{' '}
                        →{' '}
                        <ins className="rounded bg-green-500/15 px-0.5 text-green-700 no-underline dark:text-green-300">
                          {title || 'Untitled'}
                        </ins>
                      </p>
                    )}
                    {diff.every((p) => p.type === 'same') ? (
                      <p className="text-sm text-muted-foreground">
                        The text is the same as the current note
                        {selected.title !== title ? ', apart from the title.' : '.'}
                      </p>
                    ) : (
                      <>
                        <p className="mb-3 text-xs text-muted-foreground">
                          <span className="rounded bg-red-500/15 px-1 text-red-700 dark:text-red-300">Removed</span> and{' '}
                          <span className="rounded bg-green-500/15 px-1 text-green-700 dark:text-green-300">added</span>{' '}
                          since this version
                        </p>
                        <pre className="font-mono text-sm leading-relaxed break-words whitespace-pre-wrap">
                          {diff.map((part) =>
                            part.type === 'same' ? (
                              <span key={part.key}>{part.text}</span>
                            ) : part.type === 'del' ? (
                              <del key={part.key} className="rounded bg-red-500/15 text-red-700 dark:text-red-300">
                                {part.text}
                              </del>
                            ) : (
                              <ins
                                key={part.key}
                                className="rounded bg-green-500/15 text-green-700 no-underline dark:text-green-300"
                              >
                                {part.text}
                              </ins>
                            )
                          )}
                        </pre>
                      </>
                    )}
                  </>
                )}
                {selected && mode === 'preview' && (
                  <>
                    <h2 className="mb-3 text-xl font-semibold">{selected.title || 'Untitled'}</h2>
                    {selected.body.trim() ? (
                      <MarkdownPreview markdown={selected.body} />
                    ) : (
                      <p className="text-sm italic opacity-50">This version had no text.</p>
                    )}
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
