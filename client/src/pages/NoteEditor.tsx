import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Baseline,
  CalendarClock,
  Columns2,
  Eye,
  Flag,
  ImagePlus,
  Link2,
  PenLine,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Skeleton,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useIsMobile,
} from '@databricks/appkit-ui/react';
import { ApiError, api, type FontKey, type Note, type NoteRef, type Priority } from '@/lib/api';
import { DEFAULT_SURFACE, TEXT_SWATCHES, noteColors } from '@/lib/colors';
import { useData } from '@/lib/data';
import { FONTS, fontFamily } from '@/lib/fonts';
import { useSettings } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { ColorPicker } from '@/components/ColorPicker';
import { MarkdownEditor, type MarkdownEditorHandle } from '@/components/MarkdownEditor';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import { DueBadge, PriorityFlag, TagChip } from '@/components/NoteMeta';
import { PRIORITIES, formatDateTime, formatDue, formatRelative } from '@/lib/meta';
import { useNow } from '@/lib/useNow';
import { TagPicker } from '@/components/TagPicker';

const AUTOSAVE_MS = 800;
type View = 'split' | 'edit' | 'preview';
type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

/** ISO -> value for <input type="datetime-local"> in local time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NoteEditor() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { settings, isDark } = useSettings();
  const { refreshTitles, refreshTags } = useData();

  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [view, setView] = useState<View>('split');
  const [backlinks, setBacklinks] = useState<NoteRef[]>([]);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Latest unsaved text, read by the debounced/unmount flush.
  const pending = useRef<{ title?: string; body?: string }>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let cancelled = false;
    setNote(null);
    setError(null);
    pending.current = {};
    api
      .getNote(id)
      .then((n) => {
        if (cancelled) return;
        setNote(n);
        setTitle(n.title);
        setBody(n.body);
        setSaveState('saved');
        if (!n.title && !n.body) setView(isMobile ? 'edit' : 'split');
      })
      .catch(
        (err: Error) =>
          !cancelled && setError(err instanceof ApiError && err.status === 404 ? 'not-found' : err.message)
      );
    api
      .backlinks(id)
      .then((b) => !cancelled && setBacklinks(b))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reload when the note changes
  }, [id]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const patch = pending.current;
    if (patch.title === undefined && patch.body === undefined) return;
    pending.current = {};
    setSaveState('saving');
    try {
      const saved = await api.updateNote(id, patch);
      // Keep local text (the user may have typed since); take server metadata.
      setNote((n) => (n ? { ...saved, title: n.title, body: n.body } : saved));
      setSaveState(Object.keys(pending.current).length ? 'dirty' : 'saved');
      if (patch.title !== undefined) void refreshTitles();
    } catch {
      pending.current = { ...patch, ...pending.current };
      setSaveState('error');
    }
  }, [id, refreshTitles]);

  // Flush unsaved edits when leaving the note.
  useEffect(() => () => void flush(), [flush]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const queue = (patch: { title?: string; body?: string }) => {
    pending.current = { ...pending.current, ...patch };
    setSaveState('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
  };

  /** Immediate save for metadata (colour, font, priority, due, archive). */
  const saveMeta = async (patch: Parameters<typeof api.updateNote>[1]) => {
    if (!note) return;
    setNote({ ...note, ...patch } as Note);
    try {
      const saved = await api.updateNote(id, patch);
      setNote((n) => (n ? { ...saved, title: n.title, body: n.body } : saved));
    } catch (err) {
      toast.error((err as Error).message);
      setNote(note);
    }
  };

  const setTags = async (tagIds: string[]) => {
    try {
      const saved = await api.setNoteTags(id, tagIds);
      setNote((n) => (n ? { ...n, tags: saved.tags } : saved));
      void refreshTags();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const toggleArchive = async () => {
    if (!note) return;
    const archived = !note.archived_at;
    await flush();
    await saveMeta({ archived });
    toast.success(archived ? 'Note archived' : 'Note restored from archive');
    if (archived) void navigate('/');
  };

  const trash = async () => {
    await flush();
    try {
      await api.trashNote(id);
      void refreshTitles();
      toast('Moved to trash', {
        action: {
          label: 'Undo',
          onClick: () =>
            void api.restoreNote(id).then(() => {
              void refreshTitles();
              void navigate(`/notes/${id}`);
            }),
        },
      });
      void navigate('/');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (error) {
    return (
      <Empty className="mt-16">
        <EmptyHeader>
          <EmptyTitle>{error === 'not-found' ? 'Note not found' : "Couldn't open this note"}</EmptyTitle>
          <EmptyDescription>{error === 'not-found' ? 'It may have been deleted permanently.' : error}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" asChild>
            <Link to="/">Back to notes</Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  if (!note) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-[70vh] w-full rounded-2xl" />
      </div>
    );
  }

  const colors = noteColors(
    note.color ?? settings.default_note_color,
    note.text_color ?? settings.default_text_color,
    isDark
  );
  const surfaceBg = colors.bg ?? (isDark ? DEFAULT_SURFACE.dark : DEFAULT_SURFACE.light);
  const font = fontFamily(note.font ?? settings.default_font);
  const inTrash = !!note.deleted_at;
  const effectiveView: View = isMobile && view === 'split' ? 'edit' : view;

  const editor = (
    <div
      className="h-full cursor-text overflow-y-auto px-6 py-5"
      style={{ fontFamily: font }}
      onClick={(e) => e.target === e.currentTarget && editorRef.current?.focus()}
    >
      <MarkdownEditor
        ref={editorRef}
        value={body}
        noteId={note.id}
        placeholder="Start writing… use [[ to link a note, paste an image to upload it"
        onChange={(v) => {
          setBody(v);
          queue({ body: v });
        }}
      />
    </div>
  );

  const preview = (
    <div className="h-full overflow-y-auto px-6 py-5" style={{ fontFamily: font }}>
      {body.trim() ? (
        <MarkdownPreview markdown={body} />
      ) : (
        <p className="text-sm italic opacity-50">Nothing to preview yet.</p>
      )}
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <ArrowLeft className="size-4" /> Notes
          </Link>
        </Button>
        <SaveIndicator state={saveState} onRetry={() => void flush()} />
        <NoteDates createdAt={note.created_at} updatedAt={note.updated_at} />
        <div className="ml-auto flex items-center gap-1">
          <ToggleGroup
            type="single"
            size="sm"
            value={effectiveView}
            onValueChange={(v) => v && setView(v as View)}
            className="mr-1"
          >
            {!isMobile && (
              <ToggleGroupItem value="split" aria-label="Split view">
                <Columns2 className="size-4" />
              </ToggleGroupItem>
            )}
            <ToggleGroupItem value="edit" aria-label="Edit only">
              <PenLine className="size-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="preview" aria-label="Preview only">
              <Eye className="size-4" />
            </ToggleGroupItem>
          </ToggleGroup>
          {!inTrash && (
            <>
              <IconAction label={note.archived_at ? 'Unarchive' : 'Archive'} onClick={() => void toggleArchive()}>
                {note.archived_at ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
              </IconAction>
              <IconAction label="Move to trash" onClick={() => void trash()}>
                <Trash2 className="size-4" />
              </IconAction>
            </>
          )}
        </div>
      </div>

      {inTrash && (
        <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-2 text-sm">
          This note is in the trash and can&apos;t be edited.
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void api.restoreNote(note.id).then((n) => {
                setNote(n);
                void refreshTitles();
              })
            }
          >
            Restore
          </Button>
        </div>
      )}

      {/* Note surface */}
      <div
        className={cn(
          'flex flex-col overflow-hidden rounded-2xl border shadow-sm',
          !colors.bg && 'bg-card',
          !colors.fg && 'text-card-foreground',
          inTrash && 'pointer-events-none opacity-60'
        )}
        style={{
          background: colors.bg ?? undefined,
          color: colors.fg ?? undefined,
          borderColor: colors.bg ? 'color-mix(in oklab, currentColor 10%, transparent)' : undefined,
        }}
      >
        <div className="space-y-3 px-6 pt-6">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setNote({ ...note, title: e.target.value });
              queue({ title: e.target.value });
            }}
            placeholder="Untitled"
            aria-label="Note title"
            className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:opacity-40 md:text-3xl"
            style={{ fontFamily: font }}
          />
          <div className="-mx-2 flex flex-wrap items-center gap-0.5 text-current">
            <TagPicker selected={note.tags} onChange={(ids) => void setTags(ids)} />
            <PriorityPicker value={note.priority} onChange={(priority) => void saveMeta({ priority })} />
            <DuePicker value={note.due_at} onChange={(due_at) => void saveMeta({ due_at })} />
            <ColorPicker value={note.color} onChange={(color) => void saveMeta({ color })} />
            <ColorPicker
              value={note.text_color}
              onChange={(text_color) => void saveMeta({ text_color })}
              swatches={TEXT_SWATCHES}
              variant="text"
              surface={surfaceBg}
              label="Text colour"
              icon={<Baseline className="size-4" />}
            />
            <FontPicker value={note.font} onChange={(f) => void saveMeta({ font: f })} />
            <Button variant="ghost" size="sm" className="gap-2" onClick={() => fileInput.current?.click()}>
              <ImagePlus className="size-4" />
              <span className="hidden sm:inline">Image</span>
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = '';
                if (effectiveView === 'preview') setView(isMobile ? 'edit' : 'split');
                setTimeout(() => void editorRef.current?.uploadImages(files));
              }}
            />
          </div>
          {(note.tags.length > 0 || note.due_at || note.priority > 0) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {note.priority > 0 && (
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-xs"
                  style={{ background: 'color-mix(in oklab, currentColor 8%, transparent)' }}
                >
                  <PriorityFlag priority={note.priority} showLabel />
                </span>
              )}
              <DueBadge dueAt={note.due_at} />
              {note.tags.map((t) => (
                <TagChip key={t.id} tag={t} />
              ))}
            </div>
          )}
        </div>

        <div
          className="mt-4 h-[65vh] min-h-80 border-t"
          style={{ borderColor: 'color-mix(in oklab, currentColor 10%, transparent)' }}
        >
          {effectiveView === 'split' ? (
            <ResizablePanelGroup direction="horizontal" autoSaveId="chromanote-split">
              <ResizablePanel defaultSize={50} minSize={25}>
                {editor}
              </ResizablePanel>
              <ResizableHandle style={{ background: 'color-mix(in oklab, currentColor 10%, transparent)' }} />
              <ResizablePanel defaultSize={50} minSize={25}>
                {preview}
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : effectiveView === 'edit' ? (
            editor
          ) : (
            preview
          )}
        </div>
      </div>

      <Backlinks notes={backlinks} />
    </div>
  );
}

function NoteDates({ createdAt, updatedAt }: { createdAt: string; updatedAt: string }) {
  const now = useNow();
  return (
    <span className="hidden truncate text-xs text-muted-foreground md:inline">
      ·{' '}
      <time dateTime={createdAt} title={formatDateTime(createdAt)}>
        Created {new Date(createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
      </time>{' '}
      ·{' '}
      <time dateTime={updatedAt} title={formatDateTime(updatedAt)}>
        Last edited {formatRelative(updatedAt, now)}
      </time>
    </span>
  );
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === 'error') {
    return (
      <button onClick={onRetry} className="text-xs text-destructive underline-offset-2 hover:underline">
        Not saved. Retry
      </button>
    );
  }
  return (
    <span className="text-xs text-muted-foreground" aria-live="polite">
      {state === 'saved' ? 'Saved' : state === 'saving' ? 'Saving…' : 'Editing…'}
    </span>
  );
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={onClick} aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function PriorityPicker({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v) as Priority)}>
      <SelectTrigger
        size="sm"
        className="w-auto gap-2 border-none bg-transparent px-3 shadow-none hover:bg-black/5 dark:bg-transparent dark:hover:bg-white/10 [&>svg:last-child]:hidden"
        aria-label="Priority"
      >
        <Flag className="size-4" />
        <span className="hidden sm:inline">Priority</span>
      </SelectTrigger>
      <SelectContent>
        {[...PRIORITIES].reverse().map((p) => (
          <SelectItem key={p.value} value={String(p.value)}>
            {p.value > 0 ? (
              <span className="size-2 rounded-full" style={{ background: p.color }} />
            ) : (
              <span className="size-2" />
            )}
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DuePicker({ value, onChange }: { value: string | null; onChange: (iso: string | null) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2" aria-label="Due date">
          <CalendarClock className="size-4" />
          <span className="hidden sm:inline">{value ? formatDue(value) : 'Due'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3" align="start">
        <div className="text-xs font-medium text-muted-foreground">Due date</div>
        <Input
          key={value ?? 'none'}
          type="datetime-local"
          defaultValue={toLocalInput(value)}
          onChange={(e) => {
            if (e.target.value) onChange(new Date(e.target.value).toISOString());
          }}
        />
        <div className="flex flex-wrap gap-1.5">
          {[
            ['Today', 0],
            ['Tomorrow', 1],
            ['Next week', 7],
          ].map(([label, days]) => (
            <Button
              key={label}
              variant="outline"
              size="sm"
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() + (days as number));
                d.setHours(17, 0, 0, 0);
                onChange(d.toISOString());
              }}
            >
              {label}
            </Button>
          ))}
          {value && (
            <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
              <X className="size-3.5" /> Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FontPicker({ value, onChange }: { value: FontKey | null; onChange: (f: FontKey | null) => void }) {
  return (
    <Select value={value ?? 'default'} onValueChange={(v) => onChange(v === 'default' ? null : (v as FontKey))}>
      <SelectTrigger
        size="sm"
        className="w-auto gap-2 border-none bg-transparent px-3 shadow-none hover:bg-black/5 dark:bg-transparent dark:hover:bg-white/10 [&>svg:last-child]:hidden"
        aria-label="Font"
      >
        <Type className="size-4" />
        <span className="hidden sm:inline">Font</span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="default">Default</SelectItem>
        {FONTS.map((f) => (
          <SelectItem key={f.key} value={f.key}>
            <span style={{ fontFamily: f.family }}>{f.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Backlinks({ notes }: { notes: NoteRef[] }) {
  if (notes.length === 0) return null;
  return (
    <section className="px-1">
      <h2 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Link2 className="size-3.5" /> Linked from
      </h2>
      <div className="flex flex-wrap gap-2">
        {notes.map((n) => (
          <Link
            key={n.id}
            to={`/notes/${n.id}`}
            className="rounded-full border bg-card px-3 py-1 text-sm transition-colors hover:bg-accent"
          >
            {n.title || 'Untitled'}
          </Link>
        ))}
      </div>
    </section>
  );
}
