import { describe, expect, it } from 'vitest';
import { boardLayout, columnCount, distributeColumns, groupByColumn } from './masonry';

describe('distributeColumns', () => {
  it('deals items round-robin so order reads left to right', () => {
    expect(distributeColumns([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([
      [1, 4, 7],
      [2, 5],
      [3, 6],
    ]);
  });

  it('puts everything in one column when cols is 1 (or invalid)', () => {
    expect(distributeColumns(['a', 'b'], 1)).toEqual([['a', 'b']]);
    expect(distributeColumns(['a', 'b'], 0)).toEqual([['a', 'b']]);
  });

  it('leaves extra columns empty when there are few items', () => {
    expect(distributeColumns(['a'], 3)).toEqual([['a'], [], []]);
  });
});

describe('columnCount', () => {
  it('adds columns as the container widens', () => {
    expect(columnCount(400)).toBe(1);
    expect(columnCount(600)).toBe(2);
    expect(columnCount(900)).toBe(3);
    expect(columnCount(1200)).toBe(4);
  });
});

describe('boardLayout', () => {
  it('shows each board column in its own screen column when there is room', () => {
    expect(boardLayout(4)).toEqual([[0], [1], [2], [3]]);
  });

  it('stacks board columns in order on narrower screens', () => {
    expect(boardLayout(2)).toEqual([
      [0, 2],
      [1, 3],
    ]);
    expect(boardLayout(3)).toEqual([[0, 3], [1], [2]]);
    expect(boardLayout(1)).toEqual([[0, 1, 2, 3]]);
  });
});

describe('groupByColumn', () => {
  it('keeps order within each column and clamps out-of-range columns', () => {
    const notes = [
      { id: 'a', board_col: 1 },
      { id: 'b', board_col: 0 },
      { id: 'c', board_col: 1 },
      { id: 'd', board_col: 9 },
      { id: 'e', board_col: null },
    ];
    expect(groupByColumn(notes)).toEqual([['b', 'e'], ['a', 'c'], [], ['d']]);
  });
});
