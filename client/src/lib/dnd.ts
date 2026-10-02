import { KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

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

/** Sensors shared by the notes grid and board: mouse drag, touch long-press, keyboard. */
export function useNoteSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
}
