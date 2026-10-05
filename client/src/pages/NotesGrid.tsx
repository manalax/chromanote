import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { FileText, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@databricks/appkit-ui/react';
import { api, type NoteFilters, type NoteSummary, type Priority } from '@/lib/api';
import { accentOf } from '@/lib/colors';
import { useData } from '@/lib/data';
import { NotesBoard } from '@/components/NotesBoard';
import { VoiceNoteButton } from '@/components/VoiceNoteButton';
import { SortableNotes } from '@/components/SortableNotes';
import { PRIORITIES } from '@/lib/meta';

const ALL = 'all';

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function NotesGrid() {
  const navigate = useNavigate();
  const { tags, refreshTitles } = useData();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const debouncedQ = useDebounced(q, 250);
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [reload, setReload] = useState(0);

  const filters: NoteFilters = {
    q: debouncedQ.trim() || undefined,
    tag: params.get('tag') ?? undefined,
    priority: params.has('priority') ? (Number(params.get('priority')) as Priority) : undefined,
    due: (params.get('due') as NoteFilters['due']) ?? undefined,
    sort: (params.get('sort') as NoteFilters['sort']) ?? 'custom',
  };
  const filterKey = JSON.stringify(filters);
  const hasFilters = !!(filters.q || filters.tag || filters.priority !== undefined || filters.due);

  useEffect(() => {
    let cancelled = false;
    api
      .listNotes(JSON.parse(filterKey) as NoteFilters)
      .then((rows) => {
        if (cancelled) return;
        setNotes(rows);
        setError(null);
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [filterKey, reload]);

  // Keep the search text in the URL so it survives navigating back.
  useEffect(() => {
    setParams(
      (p) => {
        if (debouncedQ.trim()) p.set('q', debouncedQ.trim());
        else p.delete('q');
        return p;
      },
      { replace: true }
    );
  }, [debouncedQ, setParams]);

  const setParam = (key: string, value: string) =>
    setParams(
      (p) => {
        if (value === ALL) p.delete(key);
        else p.set(key, value);
        return p;
      },
      { replace: true }
    );

  const clearFilters = () => {
    setQ('');
    setParams({}, { replace: true });
  };

  // The Custom order board is shown for the unfiltered Custom sort.
  const boardMode = filters.sort === 'custom' && !hasFilters;

  const moveOnBoard = async (id: string, column: number, beforeId: string | null) => {
    try {
      await api.moveNote(id, column, beforeId);
    } catch (err) {
      toast.error((err as Error).message);
      throw err;
    } finally {
      setReload((n) => n + 1);
    }
  };

  /** In search results or other sorts: place the note above the card it was dropped on, then show the board. */
  const dropOnto = async (id: string, targetId: string) => {
    const target = notes?.find((n) => n.id === targetId);
    if (!target) return;
    try {
      await api.moveNote(id, target.board_col ?? 0, targetId);
      setQ('');
      setParams({}, { replace: true });
      toast('Moved. Showing your Custom order board');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const createNote = async () => {
    setCreating(true);
    try {
      const note = await api.createNote({});
      void refreshTitles();
      void navigate(`/notes/${note.id}`);
    } catch (err) {
      toast.error((err as Error).message);
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes"
            className="h-10 rounded-full border-transparent bg-card pl-9 shadow-sm focus-visible:border-border"
            aria-label="Search notes"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filters.tag ?? ALL} onValueChange={(v) => setParam('tag', v)}>
            <SelectTrigger size="sm" className="w-auto min-w-28 rounded-full bg-card" aria-label="Filter by tag">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All tags</SelectItem>
              {tags.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="size-2 rounded-full" style={{ background: accentOf(t.color) ?? '#888' }} />
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.priority !== undefined ? String(filters.priority) : ALL}
            onValueChange={(v) => setParam('priority', v)}
          >
            <SelectTrigger size="sm" className="w-auto min-w-28 rounded-full bg-card" aria-label="Filter by priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any priority</SelectItem>
              {[...PRIORITIES].reverse().map((p) => (
                <SelectItem key={p.value} value={String(p.value)}>
                  {p.value > 0 && <span className="size-2 rounded-full" style={{ background: p.color }} />}
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.due ?? ALL} onValueChange={(v) => setParam('due', v)}>
            <SelectTrigger size="sm" className="w-auto min-w-28 rounded-full bg-card" aria-label="Filter by due date">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any due date</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="soon">Due in 3 days</SelectItem>
              <SelectItem value="any">Has due date</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.sort} onValueChange={(v) => setParam('sort', v === 'custom' ? ALL : v)}>
            <SelectTrigger size="sm" className="w-auto min-w-28 rounded-full bg-card" aria-label="Sort notes">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Custom order</SelectItem>
              <SelectItem value="updated">Last edited</SelectItem>
              <SelectItem value="created">Newest</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="due">Due date</SelectItem>
              <SelectItem value="title">Title</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="rounded-full">
              <X className="size-4" /> Clear
            </Button>
          )}
          <VoiceNoteButton />
          <Button onClick={() => void createNote()} disabled={creating} className="rounded-full">
            <Plus className="size-4" /> New note
          </Button>
        </div>
      </div>

      {error ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Couldn&apos;t load notes</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
              Retry
            </Button>
          </EmptyContent>
        </Empty>
      ) : notes === null ? (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
          {[120, 180, 90, 150, 200, 110, 140, 170].map((h, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Skeleton key={i} className="mb-4 w-full break-inside-avoid rounded-xl" style={{ height: h }} />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <Empty className="mt-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText />
            </EmptyMedia>
            <EmptyTitle>{hasFilters ? 'No matching notes' : 'No notes yet'}</EmptyTitle>
            <EmptyDescription>
              {hasFilters
                ? 'Try a different search or clear the filters.'
                : 'Capture an idea, link notes with [[double brackets]], and ask the assistant about them.'}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {hasFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <Button onClick={() => void createNote()} disabled={creating}>
                <Plus className="size-4" /> Write your first note
              </Button>
            )}
          </EmptyContent>
        </Empty>
      ) : boardMode ? (
        <NotesBoard notes={notes} onMove={moveOnBoard} />
      ) : (
        <SortableNotes notes={notes} onDropOnto={(id, target) => void dropOnto(id, target)} />
      )}
    </div>
  );
}
