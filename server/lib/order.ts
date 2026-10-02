/** Below this gap between neighbours, a midpoint loses precision and the list is renumbered. */
export const MIN_ORDER_GAP = 1e-9;

/**
 * Sort key for an item dropped between two neighbours (ascending order).
 * `before` is the key of the item that ends up just above, `after` just below;
 * either is null at the ends. Returns null when the gap is too small, meaning
 * the caller should renumber and retry.
 */
export function positionBetween(before: number | null, after: number | null): number | null {
  if (before === null && after === null) return 0;
  if (before === null) return after! - 1;
  if (after === null) return before + 1;
  if (after - before < MIN_ORDER_GAP) return null;
  return (before + after) / 2;
}
