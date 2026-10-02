import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SURFACE,
  NOTE_SWATCHES,
  TEXT_SWATCHES,
  contrastRatio,
  noteSurface,
  readableText,
  textColor,
} from './colors';

describe('readableText', () => {
  it('picks dark text on light backgrounds and light text on dark ones', () => {
    expect(readableText('#ffffff')).toBe('#18181b');
    expect(readableText('#101010')).toBe('#fafafa');
  });
});

describe('note palette', () => {
  it('keeps every swatch readable (WCAG AA) in both themes', () => {
    for (const s of NOTE_SWATCHES) {
      for (const bg of [s.light, s.dark]) {
        expect(contrastRatio(bg, readableText(bg))).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('noteSurface', () => {
  it('returns null for no colour', () => {
    expect(noteSurface(null, false)).toBeNull();
  });

  it('uses a custom hex as-is in light mode', () => {
    expect(noteSurface('#ffcc00', false)?.bg).toBe('#ffcc00');
  });

  it('derives a dark, readable surface for a custom hex in dark mode', () => {
    const surface = noteSurface('#ffcc00', true)!;
    expect(surface.bg).not.toBe('#ffcc00');
    expect(contrastRatio(surface.bg, surface.fg)).toBeGreaterThanOrEqual(4.5);
    expect(surface.fg).toBe('#fafafa');
  });
});

describe('textColor', () => {
  it('returns null when no text colour is set', () => {
    expect(textColor(null, '#ffffff', false)).toBeNull();
  });

  it('uses the light-surface variant of a palette colour in light mode', () => {
    expect(textColor('blue', '#ffffff', false)).toBe('#1d4ed8');
  });

  it('keeps every text swatch readable on every note colour in both themes', () => {
    for (const t of TEXT_SWATCHES) {
      for (const n of [...NOTE_SWATCHES, { light: DEFAULT_SURFACE.light, dark: DEFAULT_SURFACE.dark }]) {
        for (const [bg, dark] of [
          [n.light, false],
          [n.dark, true],
        ] as const) {
          expect(contrastRatio(textColor(t.key, bg, dark)!, bg)).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('lightens a dark custom colour on a dark surface', () => {
    const fg = textColor('#1a237e', '#1c1c1f', true)!;
    expect(fg).not.toBe('#1a237e');
    expect(contrastRatio(fg, '#1c1c1f')).toBeGreaterThanOrEqual(4.5);
  });

  it('darkens a pale custom colour on a light surface', () => {
    const fg = textColor('#fff59d', '#ffffff', false)!;
    expect(contrastRatio(fg, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
});
