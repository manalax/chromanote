import { describe, expect, it } from 'vitest';
import { mentionedTags } from './tagMatch';

const tags = [
  { id: '1', name: 'work' },
  { id: '2', name: 'Art' },
  { id: '3', name: 'side project' },
  { id: '4', name: 'c++' },
  { id: '5', name: 'café' },
];
const names = (q: string) => mentionedTags(q, tags).map((t) => t.name);

describe('mentionedTags', () => {
  it('matches whole words, case-insensitively', () => {
    expect(names('Summarise my WORK notes')).toEqual(['work']);
  });

  it('accepts a leading #', () => {
    expect(names('anything tagged #art?')).toEqual(['Art']);
  });

  it('does not match inside other words', () => {
    expect(names('where do I start? any homework?')).toEqual([]);
  });

  it('matches multi-word tags with flexible spacing', () => {
    expect(names('notes in my side   project')).toEqual(['side project']);
  });

  it('handles punctuation boundaries and special characters', () => {
    expect(names('(work), c++ and café.')).toEqual(['work', 'c++', 'café']);
  });

  it('returns nothing when there are no tags', () => {
    expect(mentionedTags('work', [])).toEqual([]);
  });
});
