import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  closestCenter,
  pointerWithin,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { NoteSummary } from '@/lib/api';
import { useNoteSensors } from '@/lib/dnd';
import { boardLayout, columnCount, groupByColumn } from '@/lib/masonry';
import { cn } from '@/lib/utils';
import { NoteCard } from './NoteCard';

const COLUMN_PREFIX = 'column-';
const columnId = (c: number) => `${COLUMN_PREFIX}${c}`;
const isColumnId = (id: UniqueIdentifier) => String(id).startsWith(COLUMN_PREFIX);
const columnOf = (id: UniqueIdentifier) => Number(String(id).slice(COLUMN_PREFIX.length));

interface NotesBoardProps {
  /** Notes in custom order. */
  notes: NoteSummary[];
  /** Persist a move: `id` goes into `column`, directly above `beforeId` (null = bottom). */
  onMove: (id: string, column: number, beforeId: string | null) => Promise<void>;
}

/**
 * The Custom order board: a fixed number of columns, each holding its own
 * stack of notes. Columns may be empty; while dragging, empty columns show a
 * drop area.
 */
export function NotesBoard({ notes, onMove }: NotesBoardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [screenCols, setScreenCols] = useState(1);
  const sensors = useNoteSensors();
  const suppressClick = useRef(false);

  const byId = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  const saved = useMemo(() => groupByColumn(notes), [notes]);
  // While dragging (and until the server copy reloads), columns are edited locally.
  const [draft, setDraft] = useState<{ base: NoteSummary[]; columns: string[][] } | null>(null);
  const columns = draft && draft.base === notes ? draft.columns : saved;
  const columnsRef = useRef(columns);
  useLayoutEffect(() => {
    columnsRef.current = columns;
  }, [columns]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setScreenCols(columnCount(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const findColumn = (id: UniqueIdentifier) =>
    isColumnId(id) ? columnOf(id) : columnsRef.current.findIndex((col) => col.includes(String(id)));

  /**
   * Prefer the card under the pointer; when the pointer is in a column but
   * between cards, use the nearest card in that column; an empty column is a
   * target in its own right.
   */
  const collisionDetection: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    const card = hits.find((h) => !isColumnId(h.id));
    if (card) return [card];
    const column = hits.find((h) => isColumnId(h.id));
    if (!column) return closestCenter(args);
    const ids = new Set(columnsRef.current[columnOf(column.id)] ?? []);
    const inColumn = args.droppableContainers.filter((c) => ids.has(String(c.id)));
    return inColumn.length ? closestCenter({ ...args, droppableContainers: inColumn }) : [column];
  };

  const moveAcross = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = findColumn(active.id);
    const to = findColumn(over.id);
    if (from < 0 || to < 0 || from === to) return;
    const next = columnsRef.current.map((col) => [...col]);
    next[from] = next[from].filter((id) => id !== active.id);
    const overIndex = isColumnId(over.id) ? -1 : next[to].indexOf(String(over.id));
    next[to].splice(overIndex < 0 ? next[to].length : overIndex, 0, String(active.id));
    setDraft({ base: notes, columns: next });
  };

  const finish = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 0);
    if (!over) {
      setDraft(null);
      return;
    }
    const id = String(active.id);
    const column = findColumn(id);
    const next = columnsRef.current.map((col) => [...col]);
    if (!isColumnId(over.id) && findColumn(over.id) === column) {
      next[column] = arrayMove(next[column], next[column].indexOf(id), next[column].indexOf(String(over.id)));
    }
    const index = next[column].indexOf(id);
    const beforeId = next[column][index + 1] ?? null;
    const original = saved.findIndex((col) => col.includes(id));
    const unchanged = original === column && (saved[column][saved[column].indexOf(id) + 1] ?? null) === beforeId;
    if (unchanged) {
      setDraft(null);
      return;
    }
    setDraft({ base: notes, columns: next });
    onMove(id, column, beforeId).catch(() => setDraft(null));
  };

  const active = activeId ? byId.get(activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      // Empty columns only appear once a drag starts, so keep measuring.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={({ active }) => {
        setActiveId(String(active.id));
        setDraft({ base: notes, columns: columns.map((c) => [...c]) });
      }}
      onDragOver={moveAcross}
      onDragEnd={finish}
      onDragCancel={() => {
        setActiveId(null);
        setDraft(null);
      }}
    >
      <div
        ref={ref}
        className="flex items-start gap-4"
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {boardLayout(screenCols).map((boardCols) => (
          <div key={boardCols.join('-')} className="flex min-w-0 flex-1 flex-col gap-4">
            {boardCols.map((c) => (
              <BoardColumn key={c} column={c} ids={columns[c]} byId={byId} dragging={!!activeId} />
            ))}
          </div>
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'ease-out' }}>
        {active && (
          <div className="rotate-1 cursor-grabbing shadow-xl">
            <NoteCard note={active} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function BoardColumn({
  column,
  ids,
  byId,
  dragging,
}: {
  column: number;
  ids: string[];
  byId: Map<string, NoteSummary>;
  dragging: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId(column) });
  const empty = ids.length === 0;
  return (
    <SortableContext id={columnId(column)} items={ids} strategy={verticalListSortingStrategy}>
      <div
        ref={setNodeRef}
        data-board-column={column}
        className={cn('flex flex-col gap-4', empty && !dragging && 'hidden')}
        aria-label={`Column ${column + 1}`}
      >
        {ids.map((id) => {
          const note = byId.get(id);
          return note ? <BoardCard key={id} note={note} /> : null;
        })}
        {empty && dragging && (
          <div
            className={cn(
              'flex min-h-32 items-center justify-center rounded-xl border-2 border-dashed p-4 text-center text-sm transition-colors',
              isOver
                ? 'border-primary bg-primary/5 text-foreground'
                : 'border-muted-foreground/30 text-muted-foreground'
            )}
          >
            Drop a note here
          </div>
        )}
      </div>
    </SortableContext>
  );
}

function BoardCard({ note }: { note: NoteSummary }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: note.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-roledescription="draggable note"
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'cursor-grab rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring',
        // The card's slot stays as a dashed placeholder while it is dragged.
        isDragging && 'opacity-30 outline-2 outline-dashed outline-offset-2 outline-muted-foreground'
      )}
    >
      <NoteCard note={note} />
    </div>
  );
}
