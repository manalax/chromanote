import { describe, expect, it } from 'vitest';
import { columnCount, distributeColumns } from './masonry';

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
