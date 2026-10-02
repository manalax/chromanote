import { describe, expect, it } from 'vitest';
import { positionBetween } from './order';

describe('positionBetween', () => {
  it('places an item between two neighbours', () => {
    expect(positionBetween(1, 2)).toBe(1.5);
  });

  it('places an item at the start or end', () => {
    expect(positionBetween(null, 3)).toBe(2);
    expect(positionBetween(7, null)).toBe(8);
  });

  it('handles an empty neighbourhood', () => {
    expect(positionBetween(null, null)).toBe(0);
  });

  it('asks for a renumber when neighbours are too close (or out of order)', () => {
    expect(positionBetween(1, 1 + 1e-12)).toBeNull();
    expect(positionBetween(2, 2)).toBeNull();
    expect(positionBetween(3, 1)).toBeNull();
  });

  it('keeps finding room across many repeated inserts', () => {
    let lo = 1;
    const hi = 2;
    for (let i = 0; i < 25; i++) {
      const mid = positionBetween(lo, hi)!;
      expect(mid).toBeGreaterThan(lo);
      expect(mid).toBeLessThan(hi);
      lo = mid;
    }
  });
});
