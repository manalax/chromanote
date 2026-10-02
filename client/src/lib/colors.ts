/**
 * Colour model. A stored colour is either a palette key (e.g. "rose") or a
 * custom hex. Palette keys have hand-tuned light and dark variants; custom hex
 * colours are used as-is in light mode and re-derived (darker, desaturated)
 * in dark mode so they stay readable.
 */

interface Swatch {
  key: string;
  label: string;
  light: string;
  dark: string;
  /** Saturated tone for dots, chips and graph nodes. */
  accent: string;
}

export const NOTE_SWATCHES: Swatch[] = [
  { key: 'sand', label: 'Sand', light: '#f3eee4', dark: '#2b2822', accent: '#b39a6b' },
  { key: 'rose', label: 'Rose', light: '#fbe4e6', dark: '#3a2327', accent: '#e05a6d' },
  { key: 'coral', label: 'Coral', light: '#fde6d8', dark: '#3b2a20', accent: '#ee7a45' },
  { key: 'amber', label: 'Amber', light: '#fbf0c9', dark: '#36301a', accent: '#d9a514' },
  { key: 'lime', label: 'Lime', light: '#e9f5d0', dark: '#27311c', accent: '#7cb342' },
  { key: 'mint', label: 'Mint', light: '#d9f3e6', dark: '#1d3229', accent: '#2fae7b' },
  { key: 'sky', label: 'Sky', light: '#dcecfb', dark: '#1c2b3a', accent: '#3b8fdc' },
  { key: 'indigo', label: 'Indigo', light: '#e3e4fb', dark: '#25263d', accent: '#5c64d9' },
  { key: 'lavender', label: 'Lavender', light: '#efe3f8', dark: '#30243a', accent: '#a160cf' },
  { key: 'slate', label: 'Slate', light: '#e6e9ed', dark: '#262a30', accent: '#6b7787' },
];

export const BACKGROUND_SWATCHES: Swatch[] = [
  { key: 'paper', label: 'Paper', light: '#f8f6f1', dark: '#141412', accent: '#d8d2c4' },
  { key: 'mist', label: 'Mist', light: '#f1f4f7', dark: '#11151a', accent: '#c8d2dc' },
  { key: 'sage', label: 'Sage', light: '#eff3ec', dark: '#121611', accent: '#c4d1bc' },
  { key: 'blush', label: 'Blush', light: '#f9f0ef', dark: '#181212', accent: '#e3cbc8' },
  { key: 'dusk', label: 'Dusk', light: '#f2f0f8', dark: '#13121a', accent: '#cdc7e0' },
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export const isHex = (v: string) => HEX_RE.test(v);

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s * 100, l * 100];
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Near-black or near-white, whichever reads better on the given background. */
export function readableText(bg: string): string {
  const dark = '#18181b';
  const light = '#fafafa';
  return contrastRatio(bg, dark) >= contrastRatio(bg, light) ? dark : light;
}

/** Derives a dark-mode surface from a custom colour, keeping its hue. */
function darkVariant(hex: string, lightness: number): string {
  const [h, s] = rgbToHsl(hexToRgb(hex));
  return `hsl(${Math.round(h)} ${Math.round(Math.min(s, 30))}% ${lightness}%)`;
}

function hslToHex(hsl: string): string {
  const [h, s, l] = hsl.match(/[\d.]+/g)!.map(Number);
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export interface Surface {
  bg: string;
  fg: string;
  accent: string;
}

function resolve(swatches: Swatch[], value: string | null | undefined, isDark: boolean, darkL: number): Surface | null {
  if (!value) return null;
  const swatch = swatches.find((s) => s.key === value) ?? NOTE_SWATCHES.find((s) => s.key === value);
  if (swatch) {
    const bg = isDark ? swatch.dark : swatch.light;
    return { bg, fg: readableText(bg), accent: swatch.accent };
  }
  if (!isHex(value)) return null;
  const bg = isDark ? hslToHex(darkVariant(value, darkL)) : value;
  return { bg, fg: readableText(bg), accent: value };
}

export const noteSurface = (value: string | null | undefined, isDark: boolean) =>
  resolve(NOTE_SWATCHES, value, isDark, 18);

export const backgroundSurface = (value: string | null | undefined, isDark: boolean) =>
  resolve(BACKGROUND_SWATCHES, value, isDark, 8);

/** Saturated tone for small marks (tag dots, graph nodes). */
export function accentOf(value: string | null | undefined): string | null {
  if (!value) return null;
  return NOTE_SWATCHES.find((s) => s.key === value)?.accent ?? (isHex(value) ? value : null);
}

/** Text colours: `light` is used on light surfaces, `dark` on dark ones. */
export const TEXT_SWATCHES: Swatch[] = [
  { key: 'graphite', label: 'Graphite', light: '#52525b', dark: '#a1a1aa', accent: '#71717a' },
  { key: 'red', label: 'Red', light: '#b91c1c', dark: '#fca5a5', accent: '#dc2626' },
  { key: 'orange', label: 'Orange', light: '#c2410c', dark: '#fdba74', accent: '#ea580c' },
  { key: 'brown', label: 'Brown', light: '#854d0e', dark: '#fcd34d', accent: '#a16207' },
  { key: 'green', label: 'Green', light: '#15803d', dark: '#86efac', accent: '#16a34a' },
  { key: 'teal', label: 'Teal', light: '#0f766e', dark: '#5eead4', accent: '#0d9488' },
  { key: 'blue', label: 'Blue', light: '#1d4ed8', dark: '#93c5fd', accent: '#2563eb' },
  { key: 'indigo', label: 'Indigo', light: '#4338ca', dark: '#a5b4fc', accent: '#4f46e5' },
  { key: 'purple', label: 'Purple', light: '#7e22ce', dark: '#d8b4fe', accent: '#9333ea' },
  { key: 'pink', label: 'Pink', light: '#be185d', dark: '#f9a8d4', accent: '#db2777' },
];

/** Default card surfaces (approximations of --card) used when a note has no colour. */
export const DEFAULT_SURFACE = { light: '#ffffff', dark: '#1c1c1f' };

const MIN_TEXT_CONTRAST = 4.5;

/** Lightens or darkens a colour (keeping its hue) until it reads on `bg`. */
export function ensureContrast(hex: string, bg: string): string {
  if (contrastRatio(hex, bg) >= MIN_TEXT_CONTRAST) return hex;
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  const step = luminance(bg) < 0.18 ? 3 : -3; // dark bg -> lighten, light bg -> darken
  for (let lightness = l + step; lightness >= 0 && lightness <= 100; lightness += step) {
    const candidate = hslToHex(`hsl(${h} ${s}% ${lightness}%)`);
    if (contrastRatio(candidate, bg) >= MIN_TEXT_CONTRAST) return candidate;
  }
  return readableText(bg);
}

/**
 * Resolves a stored text colour (palette key or hex) against the surface it
 * sits on. Returns null when no text colour is set, so the default applies.
 */
export function textColor(value: string | null | undefined, bg: string, isDark: boolean): string | null {
  if (!value) return null;
  const swatch = TEXT_SWATCHES.find((s) => s.key === value);
  const base = swatch ? (isDark ? swatch.dark : swatch.light) : isHex(value) ? value : null;
  return base ? ensureContrast(base, bg) : null;
}

/** Background and text colour for a note, combining its colours with the user's defaults. */
export function noteColors(
  noteColor: string | null | undefined,
  noteTextColor: string | null | undefined,
  isDark: boolean
): { bg: string | null; fg: string | null } {
  const surface = noteSurface(noteColor, isDark);
  const bg = surface?.bg ?? (isDark ? DEFAULT_SURFACE.dark : DEFAULT_SURFACE.light);
  return { bg: surface?.bg ?? null, fg: textColor(noteTextColor, bg, isDark) ?? surface?.fg ?? null };
}
