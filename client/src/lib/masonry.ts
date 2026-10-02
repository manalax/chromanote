/** Container widths (px) at which another column is added. */
const COLUMN_BREAKPOINTS = [560, 840, 1100];

export function columnCount(width: number): number {
  return 1 + COLUMN_BREAKPOINTS.filter((bp) => width >= bp).length;
}

/**
 * Deals items into columns round-robin (item i → column i % cols), so the
 * order reads left→right across columns, Keep-style.
 */
export function distributeColumns<T>(items: T[], cols: number): T[][] {
  const columns: T[][] = Array.from({ length: Math.max(1, cols) }, () => []);
  items.forEach((item, i) => columns[i % columns.length].push(item));
  return columns;
}
