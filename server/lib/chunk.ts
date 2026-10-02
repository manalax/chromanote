const TARGET_CHARS = 1000;
const OVERLAP_CHARS = 150;

/** Removes markdown noise that carries no meaning for retrieval. */
function clean(body: string): string {
  return body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[\[([^[\]|\n]+?)\|([^[\]\n]+?)\]\]/g, '$2') // aliased wikilinks -> label
    .replace(/\[\[([^[\]\n]+?)\]\]/g, '$1') // wikilinks -> title
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Splits a long block on sentence boundaries so no piece exceeds the target. */
function splitLong(block: string): string[] {
  if (block.length <= TARGET_CHARS) return [block];
  const sentences = block.match(/[^.!?\n]+[.!?]*\s*/g) ?? [block];
  const pieces: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > TARGET_CHARS) {
      pieces.push(current.trim());
      current = '';
    }
    // A single run-on "sentence" longer than the target is hard-split.
    for (let i = 0; i < sentence.length; i += TARGET_CHARS) {
      const part = sentence.slice(i, i + TARGET_CHARS);
      if (current && current.length + part.length > TARGET_CHARS) {
        pieces.push(current.trim());
        current = '';
      }
      current += part;
    }
  }
  if (current.trim()) pieces.push(current.trim());
  return pieces;
}

/**
 * Chunks a note for embedding: paragraphs are packed up to ~1000 chars with a
 * small overlap, and each chunk is prefixed with the note title so retrieval
 * keeps the note's context.
 */
export function chunkNote(title: string, body: string): string[] {
  const heading = title.trim() || 'Untitled';
  const blocks = clean(body)
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .flatMap(splitLong);

  if (blocks.length === 0) return title.trim() ? [`# ${heading}`] : [];

  const chunks: string[] = [];
  let current = '';
  for (const block of blocks) {
    if (current && current.length + block.length + 2 > TARGET_CHARS) {
      chunks.push(current);
      current = current.slice(-OVERLAP_CHARS).replace(/^\S*\s/, '');
    }
    current = current ? `${current}\n\n${block}` : block;
  }
  if (current) chunks.push(current);

  return chunks.map((c) => `# ${heading}\n\n${c}`);
}
