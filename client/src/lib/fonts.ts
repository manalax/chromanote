import type { FontKey } from './api';

export const FONTS: { key: FontKey; label: string; family: string }[] = [
  { key: 'inter', label: 'Sans', family: "'Inter', ui-sans-serif, system-ui, sans-serif" },
  { key: 'lora', label: 'Serif', family: "'Lora', ui-serif, Georgia, serif" },
  { key: 'mono', label: 'Mono', family: "'JetBrains Mono', ui-monospace, monospace" },
  { key: 'caveat', label: 'Handwritten', family: "'Caveat', cursive" },
];

export function fontFamily(key: FontKey | null | undefined): string | undefined {
  return FONTS.find((f) => f.key === key)?.family;
}
