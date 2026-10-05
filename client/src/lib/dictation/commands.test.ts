import { describe, expect, it } from 'vitest';
import { applySpokenCommands, joinDictation } from './commands';

describe('applySpokenCommands', () => {
  it('turns punctuation words into punctuation with correct spacing', () => {
    expect(applySpokenCommands('hello comma world period how are you question mark')).toBe(
      'hello, world. How are you?'
    );
    expect(applySpokenCommands('wow exclamation point list colon one semicolon two full stop')).toBe(
      'wow! List: one; two.'
    );
  });

  it('handles line, paragraph and bullet commands', () => {
    expect(applySpokenCommands('first new line second new paragraph third')).toBe('first\nSecond\n\nThird');
    expect(applySpokenCommands('groceries colon bullet milk bullet point eggs')).toBe('groceries:\n- Milk\n- Eggs');
  });

  it('handles quotes', () => {
    expect(applySpokenCommands('she said open quote hi close quote')).toBe('she said "hi"');
  });

  it('is case-insensitive', () => {
    expect(applySpokenCommands('Done Period')).toBe('Done.');
  });

  it('leaves words that merely contain command words alone', () => {
    expect(applySpokenCommands('periodic commas are colonial')).toBe('periodic commas are colonial');
  });
});

describe('joinDictation', () => {
  it('adds a space between existing text and the phrase', () => {
    expect(joinDictation('Hello', 'world')).toBe(' world');
    expect(joinDictation('Hello ', 'world')).toBe('world');
  });

  it('capitalises at the start of the note, a sentence or a line', () => {
    expect(joinDictation('', 'hello')).toBe('Hello');
    expect(joinDictation('Done.', 'next one')).toBe(' Next one');
    expect(joinDictation('Line\n', 'next')).toBe('Next');
  });

  it('does not add a space before punctuation', () => {
    expect(joinDictation('Hello', 'comma there')).toBe(', there');
  });

  it('returns nothing for an empty phrase', () => {
    expect(joinDictation('Hi', '   ')).toBe('');
  });
});
