import { describe, expect, it } from 'vitest';
import { normalizeWords, sameWords, titleFromTranscript } from './words';

describe('normalizeWords', () => {
  it('lowercases and strips punctuation but keeps apostrophes inside words', () => {
    expect(normalizeWords("Hello, World! Don't stop.")).toEqual(['hello', 'world', "don't", 'stop']);
  });
});

describe('sameWords', () => {
  it('accepts punctuation, capitalisation and paragraph changes', () => {
    expect(
      sameWords(
        'so the plan is we launch on friday then we review on monday',
        'So the plan is: we launch on Friday.\n\nThen we review on Monday.'
      )
    ).toBe(true);
  });

  it('rejects rewrites that change or drop words', () => {
    expect(sameWords('we launch on friday', 'The launch happens Friday')).toBe(false);
    expect(sameWords('one two three four five', 'one two three')).toBe(false);
  });

  it('tolerates a small fix in a long passage', () => {
    const raw = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
    expect(sameWords(raw, raw.replace('word5', 'fixed'))).toBe(true);
  });

  it('handles empty input', () => {
    expect(sameWords('', '')).toBe(true);
    expect(sameWords('', 'something')).toBe(false);
  });
});

describe('titleFromTranscript', () => {
  it('uses the first sentence', () => {
    expect(titleFromTranscript('Call the plumber tomorrow. Also buy milk.')).toBe('Call the plumber tomorrow');
  });

  it('shortens long sentences at a word boundary', () => {
    const t = titleFromTranscript(
      'this is a very long run on sentence that keeps going and going without any punctuation at all'
    );
    expect(t.length).toBeLessThanOrEqual(61);
    expect(t.endsWith('…')).toBe(true);
  });
});
