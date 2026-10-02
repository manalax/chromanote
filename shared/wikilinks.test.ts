import { describe, expect, it } from 'vitest';
import { addRelatedLink, normalizeTitle, parseWikilinks, renameLinks, unlinkTarget } from './wikilinks';

describe('parseWikilinks', () => {
  it('extracts unique normalized targets', () => {
    expect(parseWikilinks('See [[Project Alpha]] and [[project  alpha]] and [[Ideas]]')).toEqual([
      'project alpha',
      'ideas',
    ]);
  });

  it('uses the target, not the label, of aliased links', () => {
    expect(parseWikilinks('[[Meeting Notes|last meeting]]')).toEqual(['meeting notes']);
  });

  it('ignores links inside code', () => {
    const body = 'real [[A]]\n```\n[[B]]\n```\ninline `[[C]]` done';
    expect(parseWikilinks(body)).toEqual(['a']);
  });

  it('ignores empty and malformed links', () => {
    expect(parseWikilinks('[[ ]] [[unclosed and [single]]')).toEqual([]);
  });
});

describe('normalizeTitle', () => {
  it('trims, collapses whitespace and lowercases', () => {
    expect(normalizeTitle('  Hello   World ')).toBe('hello world');
  });
});

describe('addRelatedLink', () => {
  it('adds a Related footer to a note without one', () => {
    expect(addRelatedLink('Some text\n', 'Beta')).toBe('Some text\n\nRelated: [[Beta]]');
  });

  it('creates the footer alone for an empty note', () => {
    expect(addRelatedLink('', 'Beta')).toBe('Related: [[Beta]]');
  });

  it('appends to an existing footer', () => {
    expect(addRelatedLink('Text\n\nRelated: [[A]]', 'B')).toBe('Text\n\nRelated: [[A]] · [[B]]');
  });

  it('does not treat a Related line in the middle as the footer', () => {
    expect(addRelatedLink('Related: [[A]]\n\nMore text', 'B')).toBe('Related: [[A]]\n\nMore text\n\nRelated: [[B]]');
  });
});

describe('unlinkTarget', () => {
  it('unwraps inline links to plain text, keeping labels', () => {
    expect(unlinkTarget('See [[Beta]] and [[beta|the beta]] and [[Gamma]]', 'Beta')).toBe(
      'See Beta and the beta and [[Gamma]]'
    );
  });

  it('removes entries from the Related footer', () => {
    expect(unlinkTarget('Text\n\nRelated: [[A]] · [[Beta]] · [[C]]', 'beta')).toBe('Text\n\nRelated: [[A]] · [[C]]');
  });

  it('drops the Related line when it becomes empty', () => {
    expect(unlinkTarget('Text\n\nRelated: [[Beta]]', 'Beta')).toBe('Text');
  });

  it('leaves code untouched', () => {
    const body = 'Use `[[Beta]]` syntax\n```\n[[Beta]]\n```\nand [[Beta]]';
    expect(unlinkTarget(body, 'Beta')).toBe('Use `[[Beta]]` syntax\n```\n[[Beta]]\n```\nand Beta');
  });
});

describe('renameLinks', () => {
  it('retargets links and keeps labels', () => {
    expect(renameLinks('[[Old Name]], [[old  name|label]], [[Other]]', 'Old Name', 'New Name')).toBe(
      '[[New Name]], [[New Name|label]], [[Other]]'
    );
  });

  it('leaves code untouched', () => {
    expect(renameLinks('`[[Old]]` [[Old]]', 'Old', 'New')).toBe('`[[Old]]` [[New]]');
  });
});

describe('unlinkTarget (no match)', () => {
  it('returns the body unchanged when nothing links to the title', () => {
    const body = 'Line one\n\n\n\nLine two\n';
    expect(unlinkTarget(body, 'Missing')).toBe(body);
  });
});
