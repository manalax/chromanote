import { useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import type { NoteSummary } from '@/lib/api';
import { cn } from '@/lib/utils';
import { MasonryGrid } from './MasonryGrid';
import { NoteCard } from './NoteCard';

/**
 * Cards don't slide around while dragging: with uneven masonry heights the
 * target would keep moving away from the pointer. Instead the card under the
 * pointer is highlighted and the order changes on drop.
 */
const noShiftStrategy = () => null;

/**
 * Mouse and pen only: touches go to the TouchSensor, whose long-press delay
 * lets a quick swipe scroll the page. (The default PointerSensor would claim
 * touches too, and the browser then cancels them as a scroll.)
 */
class MouseSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent: e }: React.PointerEvent) => e.pointerType !== 'touch' && e.isPrimary && e.button === 0,
    },
  ];
}

interface SortableNotesProps {
  notes: NoteSummary[];
  /** Called with the new order and the moved note's new neighbours. */
  onMove: (next: NoteSummary[], id: string, beforeId: string | null, afterId: string | null) => void;
}

export function SortableNotes({ notes, onMove }: SortableNotesProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  // The click that ends a drag must not open the note.
  const suppressClick = useRef(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const reset = () => {
    setActiveId(null);
    setOverId(null);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    reset();
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 0);
    if (!over || over.id === active.id) return;
    const from = notes.findIndex((n) => n.id === active.id);
    const to = notes.findIndex((n) => n.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(notes, from, to);
    onMove(next, String(active.id), next[to - 1]?.id ?? null, next[to + 1]?.id ?? null);
  };

  const active = notes.find((n) => n.id === activeId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={({ active }) => setActiveId(String(active.id))}
      onDragOver={({ over }) => setOverId(over ? String(over.id) : null)}
      onDragEnd={handleDragEnd}
      onDragCancel={reset}
    >
      <SortableContext items={notes.map((n) => n.id)} strategy={noShiftStrategy}>
        <div
          onClickCapture={(e) => {
            if (suppressClick.current) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          <MasonryGrid
            items={notes}
            getKey={(n) => n.id}
            renderItem={(n) => <SortableCard note={n} isTarget={!!activeId && overId === n.id && activeId !== n.id} />}
          />
        </div>
      </SortableContext>
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

function SortableCard({ note, isTarget }: { note: NoteSummary; isTarget: boolean }) {
  const { setNodeRef, attributes, listeners, isDragging } = useSortable({ id: note.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-roledescription="draggable note"
      className={cn(
        'cursor-grab rounded-xl transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-ring',
        // The original slot becomes a placeholder while its card is dragged.
        isDragging && 'opacity-30 outline-2 outline-dashed outline-offset-2 outline-muted-foreground',
        isTarget && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
      )}
    >
      <NoteCard note={note} />
    </div>
  );
}
