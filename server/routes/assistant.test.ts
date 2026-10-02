import { describe, expect, it } from 'vitest';
import type { NoteDetails } from '../lib/rag';
import { type ContextInput, buildContext } from './assistant';

const note = (id: string, title: string, updated: string, due: string | null = null) => ({
  note_id: id,
  title,
  created_at: '2026-09-01T09:00:00Z',
  updated_at: updated,
  due_at: due,
});

const details = (d: Partial<NoteDetails>): NoteDetails => ({
  tags: [],
  priority: 0,
  archived: false,
  links_to: [],
  linked_from: [],
  ...d,
});

const alpha = note('a', 'Alpha', '2026-10-02T03:05:00Z', '2026-10-05T07:00:00Z');
const beta = note('b', 'Beta', '2026-10-02T04:00:00Z');
const gamma = note('c', 'Gamma', '2026-09-20T04:00:00Z');

const input = (over: Partial<ContextInput> = {}): ContextInput => ({
  chunks: [
    { ...alpha, content: 'Budget is 40k' },
    { ...alpha, content: 'Owner: Dana' },
  ],
  recent: [beta, alpha],
  details: new Map([
    ['a', details({ tags: ['launch', 'work'], priority: 3, links_to: ['Beta'], linked_from: ['Gamma', 'Delta'] })],
    ['b', details({ archived: true })],
  ]),
  tags: [
    { name: 'launch', note_count: 1 },
    { name: 'work', note_count: 2 },
  ],
  mentionedTags: [],
  ...over,
});

describe('buildContext', () => {
  it('numbers each note once across excerpts, tagged notes and the recent index', () => {
    const { sources } = buildContext(input({ chunks: [...input().chunks, { ...gamma, content: 'Tagged' }] }), 'UTC');
    expect(sources.map((s) => [s.n, s.note_id])).toEqual([
      [1, 'a'],
      [2, 'c'],
      [3, 'b'],
    ]);
  });

  it('renders live metadata and dates in the user time zone', () => {
    const { context } = buildContext(input(), 'Australia/Sydney');
    expect(context).toContain(
      '[1] "Alpha" (tags: launch, work · priority: High · created Tue 1 Sept 2026, 19:00 · ' +
        'last edited Fri 2 Oct 2026, 13:05 · due Mon 5 Oct 2026, 18:00 · links to: "Beta" · ' +
        'linked from: "Gamma", "Delta")\nBudget is 40k'
    );
  });

  it('omits empty metadata and marks archived notes', () => {
    const { context } = buildContext(input(), 'UTC');
    expect(context).toContain(
      '- [2] "Beta" (archived · created Tue 1 Sept 2026, 09:00 · last edited Fri 2 Oct 2026, 04:00)'
    );
  });

  it('lists the current tags with counts', () => {
    const { context } = buildContext(input(), 'UTC');
    expect(context).toContain('## Your tags\n\n- launch (1 note)\n- work (2 notes)');
  });

  it('says which tags the question mentioned', () => {
    const { context } = buildContext(input({ mentionedTags: ['work'] }), 'UTC');
    expect(context).toContain('The question mentions the tag(s): work.');
  });

  it('handles no matches and no tags', () => {
    const { context } = buildContext(input({ chunks: [], tags: [] }), 'UTC');
    expect(context).toContain('(No matching note text.)');
    expect(context).toContain('(No tags yet.)');
  });
});
