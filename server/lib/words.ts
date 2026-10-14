/** Lower-cased words with punctuation stripped (Unicode-aware). */
export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}

/** Word-level edit distance (insertions, deletions, substitutions). */
export function wordDistance(a: string[], b: string[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = curr;
  }
  return prev[b.length];
}

/**
 * True when `edited` keeps essentially the same words as `original` (only
 * punctuation, capitals and spacing may differ). `tolerance` is the share of
 * words allowed to differ, e.g. a recognition slip the tidy-up fixed.
 */
export function sameWords(original: string, edited: string, tolerance = 0.1): boolean {
  const a = normalizeWords(original);
  const b = normalizeWords(edited);
  if (a.length === 0) return b.length === 0;
  return wordDistance(a, b) / Math.max(a.length, b.length) <= tolerance;
}

/** Fallback title: the first few words of the transcript. */
export function titleFromTranscript(transcript: string, maxLength = 60): string {
  const firstLine = transcript
    .trim()
    .split(/\n/)[0]
    .replace(/^[-\s]+/, '');
  const sentence = firstLine.split(/(?<=[.?!])\s/)[0].replace(/[.?!,;:]+$/, '');
  if (sentence.length <= maxLength) return sentence;
  const cut = sentence.slice(0, maxLength);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 20)).trimEnd()}…`;
}

/** A voice note's title: the whole dictation on one line, shortened only if over `maxLength`. */
export function titleFromDictation(transcript: string, maxLength = 300): string {
  const line = transcript
    .split(/\n/)
    .map((l) => l.replace(/^[-\s]+/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (line.length <= maxLength) return line;
  const cut = line.slice(0, maxLength - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 20)).trimEnd()}…`;
}
