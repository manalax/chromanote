/** Matches [[Target]] and [[Target|label]]. Group 1 = target, group 2 = label. */
export const WIKILINK_RE = /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/g;

const FENCED_CODE_RE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
const INLINE_CODE_RE = /`[^`\n]*`/g;

export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Returns the unique, normalized link targets in a markdown body, ignoring code. */
export function parseWikilinks(body: string): string[] {
  const text = body.replace(FENCED_CODE_RE, '').replace(INLINE_CODE_RE, '');
  const targets = new Set<string>();
  for (const match of text.matchAll(WIKILINK_RE)) {
    const target = normalizeTitle(match[1]);
    if (target) targets.add(target);
  }
  return [...targets];
}

const CODE_RE = /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g;
const RELATED_RE = /^Related:\s*/i;
const RELATED_SEPARATOR = ' · ';

/** Applies `fn` to the parts of a markdown body that are not code. */
function mapText(body: string, fn: (text: string) => string): string {
  let out = '';
  let last = 0;
  for (const m of body.matchAll(CODE_RE)) {
    out += fn(body.slice(last, m.index)) + m[0];
    last = (m.index ?? 0) + m[0].length;
  }
  return out + fn(body.slice(last));
}

const sameTarget = (raw: string, title: string) => normalizeTitle(raw) === normalizeTitle(title);

/**
 * Adds [[title]] to the note's "Related:" footer (the last non-empty line),
 * creating the footer if needed.
 */
export function addRelatedLink(body: string, title: string): string {
  const link = `[[${title.trim()}]]`;
  const trimmed = body.replace(/\s+$/, '');
  const lines = trimmed.split('\n');
  const lastLine = lines[lines.length - 1];
  if (trimmed && RELATED_RE.test(lastLine)) {
    const rest = lastLine.replace(RELATED_RE, '').trim();
    lines[lines.length - 1] = `Related: ${rest ? rest + RELATED_SEPARATOR : ''}${link}`;
    return lines.join('\n');
  }
  return trimmed ? `${trimmed}\n\nRelated: ${link}` : `Related: ${link}`;
}

/**
 * Removes links to `title`: entries on a "Related:" line are deleted (and the
 * line too if it ends up empty); links elsewhere become plain text (their
 * label, or the title). Code is left untouched.
 */
export function unlinkTarget(body: string, title: string): string {
  const result = mapText(body, (text) =>
    text
      .split('\n')
      .flatMap((line) => {
        if (!RELATED_RE.test(line)) return [line];
        const items = line
          .replace(RELATED_RE, '')
          .split(/\s*[·,]\s*/)
          .map((s) => s.trim())
          .filter(Boolean);
        const kept = items.filter((item) => {
          const m = /^\[\[([^[\]|\n]+?)(?:\|[^[\]\n]+?)?\]\]$/.exec(item);
          return !(m && sameTarget(m[1], title));
        });
        if (kept.length === items.length) return [line];
        return kept.length ? [`Related: ${kept.join(RELATED_SEPARATOR)}`] : [];
      })
      .join('\n')
      .replace(WIKILINK_RE, (m, target: string, label?: string) =>
        sameTarget(target, title) ? (label ?? target).trim() : m
      )
  );
  if (result === body) return body;
  // Removing a footer line can leave extra blank lines behind.
  return result.replace(/\n{3,}/g, '\n\n').replace(/\n+$/, body.endsWith('\n') ? '\n' : '');
}

/** Points links at `oldTitle` to `newTitle`, keeping any labels. Code is left untouched. */
export function renameLinks(body: string, oldTitle: string, newTitle: string): string {
  return mapText(body, (text) =>
    text.replace(WIKILINK_RE, (m, target: string, label?: string) =>
      sameTarget(target, oldTitle) ? `[[${newTitle.trim()}${label ? `|${label}` : ''}]]` : m
    )
  );
}
