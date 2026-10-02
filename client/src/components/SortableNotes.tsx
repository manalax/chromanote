import { useRef, useState } from 'react';
import { DndContext, DragOverlay, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import type { NoteSummary } from '@/lib/api';
import { useNoteSensors } from '@/lib/dnd';
import { cn } from '@/lib/utils';
import { MasonryGrid } from './MasonryGrid';
import { NoteCard } from './NoteCard';

/**
 * Auto-flowing masonry used for search results and non-custom sorts. Cards
 * don't slide around while dragging (with uneven heights the target would keep
 * moving away from the pointer); the card under the pointer is highlighted and
 * the dragged note is placed above it on the board when dropped.
 */
const noShiftStrategy = () => null;

interface SortableNotesProps {
  notes: NoteSummary[];
  /** Called when `id` is dropped onto the card `targetId`. */
  onDropOnto: (id: string, targetId: string) => void;
}

export function SortableNotes({ notes, onDropOnto }: SortableNotesProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  // The click that ends a drag must not open the note.
  const suppressClick = useRef(false);

  const sensors = useNoteSensors();

  const reset = () => {
    setActiveId(null);
    setOverId(null);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    reset();
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 0);
    if (!over || over.id === active.id) return;
    onDropOnto(String(active.id), String(over.id));
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
