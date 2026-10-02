export interface NamedTag {
  id: string;
  name: string;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Tags whose name appears in the question as a whole word or phrase
 * (case-insensitive, optional leading "#"). "art" does not match "start".
 */
export function mentionedTags<T extends NamedTag>(question: string, tags: T[]): T[] {
  return tags.filter((tag) => {
    const name = tag.name.trim();
    if (!name) return false;
    const words = name.split(/\s+/).map(escapeRegExp).join('\\s+');
    return new RegExp(`(?<![\\p{L}\\p{N}])#?${words}(?![\\p{L}\\p{N}])`, 'iu').test(question);
  });
}
