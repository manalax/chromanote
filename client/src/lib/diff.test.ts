import { describe, expect, it } from 'vitest';
import { diffText } from './diff';

describe('diffText', () => {
  it('reports identical text as unchanged', () => {
    expect(diffText('a\nb\n', 'a\nb\n')).toEqual([{ type: 'same', text: 'a\nb\n' }]);
  });

  it('handles empty sides', () => {
    expect(diffText('', 'new')).toEqual([{ type: 'add', text: 'new' }]);
    expect(diffText('old', '')).toEqual([{ type: 'del', text: 'old' }]);
    expect(diffText('', '')).toEqual([]);
  });

  it('finds added and removed lines', () => {
    expect(diffText('one\ntwo\nthree\n', 'one\nthree\nfour\n')).toEqual([
      { type: 'same', text: 'one\n' },
      { type: 'del', text: 'two\n' },
      { type: 'same', text: 'three\n' },
      { type: 'add', text: 'four\n' },
    ]);
  });

  it('highlights changed words within a line', () => {
    expect(diffText('the quick brown fox\n', 'the slow brown fox\n')).toEqual([
      { type: 'same', text: 'the ' },
      { type: 'del', text: 'quick' },
      { type: 'add', text: 'slow' },
      { type: 'same', text: ' brown fox\n' },
    ]);
  });

  it('rebuilds both texts from the parts', () => {
    const before = '# Title\n\nSome text here.\n- item one\n- item two\n';
    const after = '# New title\n\nSome more text here.\n- item two\n- item three\n';
    const parts = diffText(before, after);
    const join = (skip: string) =>
      parts
        .filter((p) => p.type !== skip)
        .map((p) => p.text)
        .join('');
    expect(join('add')).toBe(before);
    expect(join('del')).toBe(after);
  });

  it('falls back to whole blocks for very large changes', () => {
    const before = Array.from({ length: 3000 }, (_, i) => `a${i}\n`).join('');
    const after = Array.from({ length: 3000 }, (_, i) => `b${i}\n`).join('');
    expect(diffText(before, after)).toEqual([
      { type: 'del', text: before.slice(0, -1) },
      { type: 'add', text: after.slice(0, -1) },
      { type: 'same', text: '\n' },
    ]);
  });
});
