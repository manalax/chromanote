import { describe, expect, it } from 'vitest';
import { chunkNote } from './chunk';

describe('chunkNote', () => {
  it('returns a single titled chunk for a short note', () => {
    expect(chunkNote('Groceries', 'Milk\n\nEggs')).toEqual(['# Groceries\n\nMilk\n\nEggs']);
  });

  it('returns nothing for an empty untitled note', () => {
    expect(chunkNote('', '  ')).toEqual([]);
  });

  it('indexes the title of a note with no body', () => {
    expect(chunkNote('Idea', '')).toEqual(['# Idea']);
  });

  it('strips images and unwraps wikilinks', () => {
    const [chunk] = chunkNote('T', 'See [[Other Note]] and [[X|the x]] ![alt](/img.png)');
    expect(chunk).toBe('# T\n\nSee Other Note and the x');
  });

  it('splits long notes into bounded chunks that all carry the title', () => {
    const para = 'Lorem ipsum dolor sit amet. '.repeat(20); // ~560 chars
    const chunks = chunkNote('Long', Array(6).fill(para).join('\n\n'));
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) {
      expect(c.startsWith('# Long\n\n')).toBe(true);
      expect(c.length).toBeLessThan(1400);
    }
  });

  it('hard-splits a single huge paragraph', () => {
    const chunks = chunkNote('Big', 'x'.repeat(5000));
    expect(chunks.length).toBeGreaterThanOrEqual(5);
  });
});
