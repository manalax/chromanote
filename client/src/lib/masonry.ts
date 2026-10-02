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

/** Columns on the Custom order board (matches BOARD_COLUMNS on the server). */
export const BOARD_COLUMNS = 4;

/**
 * Which board columns each screen column shows. With fewer screen columns
 * than board columns they stack in order: at 2 screen columns, [0, 2] and [1, 3].
 */
export function boardLayout(screenCols: number, boardCols = BOARD_COLUMNS): number[][] {
  const n = Math.max(1, Math.min(screenCols, boardCols));
  const layout: number[][] = Array.from({ length: n }, () => []);
  for (let c = 0; c < boardCols; c++) layout[c % n].push(c);
  return layout;
}

/** Groups notes (already in custom order) into board columns, clamping stray column numbers. */
export function groupByColumn<T extends { id: string; board_col: number | null }>(
  items: T[],
  boardCols = BOARD_COLUMNS
): string[][] {
  const columns: string[][] = Array.from({ length: boardCols }, () => []);
  for (const item of items) {
    const c = Math.min(Math.max(item.board_col ?? 0, 0), boardCols - 1);
    columns[c].push(item.id);
  }
  return columns;
}
