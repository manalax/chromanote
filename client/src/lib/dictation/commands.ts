/**
 * Spoken punctuation and layout commands (English). Applied to each finished
 * phrase from the speech engine.
 */
const COMMANDS: [RegExp, string][] = [
  [/\bnew paragraph\b/gi, '\n\n'],
  [/\bnew ?line\b/gi, '\n'],
  [/\bbullet(?: point)?\b/gi, '\n- '],
  [/\b(?:full stop|period)\b/gi, '.'],
  [/\bcomma\b/gi, ','],
  [/\bquestion mark\b/gi, '?'],
  [/\bexclamation (?:mark|point)\b/gi, '!'],
  [/\bsemicolon\b/gi, ';'],
  [/\bcolon\b/gi, ':'],
  [/\bopen quote\b/gi, ' "\uE000'],
  [/\b(?:close|end) quote\b/gi, '\uE001"'],
];

export function applySpokenCommands(text: string): string {
  let out = text;
  for (const [re, replacement] of COMMANDS) out = out.replace(re, replacement);
  return (
    out
      // No space before punctuation or a closing quote.
      .replace(/[ \t]+([.,?!;:])/g, '$1')
      .replace(/[ \t]*\uE001/g, '')
      // No space after an opening quote.
      .replace(/\uE000[ \t]*/g, '')
      // One space after punctuation when a word follows on the same line.
      .replace(/([.,?!;:])(?=[^\s.,?!;:"'\n])/g, '$1 ')
      // Tidy whitespace around line breaks, keep the bullet's trailing space.
      .replace(/[ \t]*\n[ \t]*/g, '\n')
      .replace(/\n- ?/g, '\n- ')
      .replace(/[ \t]{2,}/g, ' ')
      // Capitalise the start of new sentences and lines within the phrase.
      .replace(/([.?!]\s+|\n- |\n)(\p{Ll})/gu, (_m, lead: string, ch: string) => lead + ch.toUpperCase())
  );
}

/**
 * Text to insert for a finished phrase given what comes before the cursor:
 * adds a separating space and capitalises at the start of a sentence or line.
 */
export function joinDictation(before: string, phrase: string): string {
  let text = applySpokenCommands(phrase.trim());
  if (!text) return '';
  const sentenceStart = before.trim() === '' || /[.?!]\s*$|\n\s*$/.test(before);
  if (sentenceStart)
    text = text.replace(/^(\s*-?\s*)(\p{Ll})/u, (_m, lead: string, ch: string) => lead + ch.toUpperCase());
  const needsSpace = before !== '' && !/\s$/.test(before) && !/^[\s.,?!;:]/.test(text);
  return (needsSpace ? ' ' : '') + text;
}
