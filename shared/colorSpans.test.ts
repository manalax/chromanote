import { describe, expect, it } from 'vitest';
import { applyColor, parseColorSpans, selectionColor, stripColorSpans } from './colorSpans';

/** Applies the colour to the text between the first pair of `|` markers. */
function color(marked: string, value: string | null) {
  const from = marked.indexOf('|');
  const to = marked.indexOf('|', from + 1) - 1;
  const md = marked.replace(/\|/g, '');
  const edit = applyColor(md, from, to, value);
  if (!edit) return { text: md, selected: '' };
  const text = md.slice(0, edit.from) + edit.insert + md.slice(edit.to);
  return { text, selected: text.slice(edit.selection.anchor, edit.selection.head) };
}

describe('applyColor', () => {
  it('wraps the selected text', () => {
    expect(color('Meeting is |tomorrow| at 9', 'red')).toEqual({
      text: 'Meeting is <span data-color="red">tomorrow</span> at 9',
      selected: 'tomorrow',
    });
  });

  it('splits a span when recolouring part of it', () => {
    expect(color('<span data-color="red">tomorrow |at 9|</span>', 'blue').text).toBe(
      '<span data-color="red">tomorrow </span><span data-color="blue">at 9</span>'
    );
  });

  it('removes colour from part of a span', () => {
    expect(color('<span data-color="red">a |b| c</span>', null).text).toBe(
      '<span data-color="red">a </span>b<span data-color="red"> c</span>'
    );
  });

  it('merges with adjacent spans of the same colour', () => {
    expect(color('<span data-color="red">a</span>| b|', 'red').text).toBe('<span data-color="red">a b</span>');
  });

  it('treats a selection covering a whole span, tags included, as its text', () => {
    expect(color('x |<span data-color="red">y</span>| z', 'blue')).toEqual({
      text: 'x <span data-color="blue">y</span> z',
      selected: 'y',
    });
  });

  it('wraps each line separately and keeps block markers outside', () => {
    expect(color('|# Title\n- [ ] task\n1. step|', 'green').text).toBe(
      '# <span data-color="green">Title</span>\n- [ ] <span data-color="green">task</span>\n1. <span data-color="green">step</span>'
    );
  });

  it('skips fenced code', () => {
    expect(color('|a\n```\ncode\n```\nb|', 'red').text).toBe(
      '<span data-color="red">a</span>\n```\ncode\n```\n<span data-color="red">b</span>'
    );
  });

  it('ignores a selection that ends at the start of the next line', () => {
    expect(color('|one\n|two', 'red').text).toBe('<span data-color="red">one</span>\ntwo');
  });

  it('returns null when nothing can be coloured', () => {
    expect(applyColor('# \n', 0, 2, 'red')).toBeNull();
  });
});

describe('selectionColor', () => {
  const md = '<span data-color="red">ab</span>cd';
  it('reports a single colour, null for plain text, undefined when mixed', () => {
    expect(selectionColor(md, 23, 25)).toBe('red');
    expect(selectionColor(md, 32, 34)).toBeNull();
    expect(selectionColor(md, 23, 34)).toBeUndefined();
  });
});

describe('parseColorSpans', () => {
  it('locates spans and their inner text', () => {
    const md = 'x <span data-color="#1d4ed8">hi</span>';
    const [span] = parseColorSpans(md);
    expect(span.color).toBe('#1d4ed8');
    expect(md.slice(span.innerFrom, span.innerTo)).toBe('hi');
    expect(span.to).toBe(md.length);
  });
});

describe('stripColorSpans', () => {
  it('keeps the inner text', () => {
    expect(stripColorSpans('a <span data-color="red">b</span> c')).toBe('a b c');
  });
});
