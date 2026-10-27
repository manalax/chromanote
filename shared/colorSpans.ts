/**
 * Inline text colour, stored in a note body as `<span data-color="red">text</span>`
 * (a TEXT_SWATCHES key or a hex). The value is resolved at render time so it
 * adapts to the note surface and dark mode. Spans never nest or cross lines.
 */

/** Group 1 = colour, group 2 = inner text. */
const SPAN_SOURCE = '<span data-color="([^"<>\\n]+)">(.*?)</span>';
const spanRe = () => new RegExp(SPAN_SOURCE, 'g');

/** Leading block syntax (indent, quotes, list items, task boxes, headings) kept outside spans. */
const BLOCK_PREFIX_RE = /^\s*(?:(?:>\s?|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+(?:\[[ xX]\]\s+)?|#{1,6}\s+)\s*)*/;
const FENCE_RE = /^\s*(```|~~~)/;

export interface ColorSpan {
  from: number;
  to: number;
  innerFrom: number;
  innerTo: number;
  color: string;
}

/** Every colour span in a body, in document order. */
export function parseColorSpans(md: string): ColorSpan[] {
  return [...md.matchAll(spanRe())].map((m) => {
    const from = m.index ?? 0;
    const innerFrom = from + m[0].indexOf('>') + 1;
    return { from, to: from + m[0].length, innerFrom, innerTo: innerFrom + m[2].length, color: m[1] };
  });
}

/** Removes colour spans, keeping their text. */
export function stripColorSpans(md: string): string {
  return md.replace(spanRe(), '$2');
}

interface Char {
  ch: string;
  color: string | null;
}

/** A line split into its block prefix and coloured characters. */
interface ParsedLine {
  prefix: string;
  chars: Char[];
  /** Offset in the raw line of each char. */
  raw: number[];
}

function parseLine(line: string): ParsedLine {
  const prefix = line.match(BLOCK_PREFIX_RE)?.[0] ?? '';
  const chars: Char[] = [];
  const raw: number[] = [];
  const push = (text: string, start: number, color: string | null) => {
    for (let i = 0; i < text.length; i++) {
      chars.push({ ch: text[i], color });
      raw.push(start + i);
    }
  };
  let last = prefix.length;
  const content = line.slice(prefix.length);
  for (const m of content.matchAll(spanRe())) {
    const start = prefix.length + (m.index ?? 0);
    push(line.slice(last, start), last, null);
    push(m[2], start + m[0].indexOf('>') + 1, m[1]);
    last = start + m[0].length;
  }
  push(line.slice(last), last, null);
  return { prefix, chars, raw };
}

/** Number of chars before a raw offset; offsets inside tags or the prefix snap to the nearest char. */
const toPlain = (line: ParsedLine, offset: number) => line.raw.filter((r) => r < offset).length;

/** Serializes a line, returning its text and the raw offset of each char. */
function serialize(prefix: string, chars: Char[]): { text: string; raw: number[] } {
  let text = prefix;
  const raw: number[] = [];
  for (let i = 0; i < chars.length; ) {
    const color = chars[i].color;
    if (color) text += `<span data-color="${color}">`;
    for (; i < chars.length && chars[i].color === color; i++) {
      raw.push(text.length);
      text += chars[i].ch;
    }
    if (color) text += '</span>';
  }
  return { text, raw };
}

interface LineRange {
  start: number;
  line: string;
  parsed: ParsedLine;
  /** Selected char range within the line. */
  from: number;
  to: number;
}

/** The lines a selection touches (outside fenced code), with the selected chars of each. */
function selectedLines(md: string, from: number, to: number): LineRange[] {
  const lines: LineRange[] = [];
  let start = 0;
  let inFence = false;
  for (const line of md.split('\n')) {
    const end = start + line.length;
    const fence = FENCE_RE.test(line);
    // A selection ending at the start of a line doesn't touch that line.
    const touched = start < to && end >= from && !(to === start && from < to);
    if (touched && !inFence && !fence) {
      const parsed = parseLine(line);
      lines.push({
        start,
        line,
        parsed,
        from: toPlain(parsed, from - start),
        to: to >= end ? parsed.chars.length : toPlain(parsed, to - start),
      });
    }
    if (fence) inFence = !inFence;
    if (start > to) break;
    start = end + 1;
  }
  return lines.filter((l) => l.to > l.from);
}

/**
 * The colour covering all selected text: a colour, null when uncoloured, or
 * undefined when the selection mixes colours.
 */
export function selectionColor(md: string, from: number, to: number): string | null | undefined {
  const colors = new Set(
    selectedLines(md, from, to).flatMap((l) => l.parsed.chars.slice(l.from, l.to).map((c) => c.color))
  );
  if (colors.size === 0) return null;
  return colors.size === 1 ? [...colors][0] : undefined;
}

export interface ColorEdit {
  from: number;
  to: number;
  insert: string;
  /** The same text, re-selected after the edit. */
  selection: { anchor: number; head: number };
}

/**
 * Colours the selected text (or removes its colour when `color` is null),
 * splitting and merging spans so they never nest. Returns null when nothing
 * in the selection can be coloured.
 */
export function applyColor(md: string, from: number, to: number, color: string | null): ColorEdit | null {
  const lines = selectedLines(md, from, to);
  if (lines.length === 0) return null;
  const first = lines[0];
  const last = lines[lines.length - 1];
  const editFrom = first.start;
  const editTo = last.start + last.line.length;

  let insert = '';
  let anchor = 0;
  let head = 0;
  let pos = editFrom;
  for (const l of lines) {
    // Unselected lines between touched ones (fenced code) are kept verbatim.
    insert += md.slice(pos, l.start);
    const chars = l.parsed.chars.map((c, i) => (i >= l.from && i < l.to ? { ch: c.ch, color } : c));
    const out = serialize(l.parsed.prefix, chars);
    if (l === first) anchor = editFrom + insert.length + out.raw[l.from];
    if (l === last) head = editFrom + insert.length + out.raw[l.to - 1] + 1;
    insert += out.text;
    pos = l.start + l.line.length;
  }
  return { from: editFrom, to: editTo, insert, selection: { anchor, head } };
}
