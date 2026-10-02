import { describe, expect, it } from 'vitest';
import { formatRelative } from './meta';

describe('formatRelative', () => {
  const now = new Date('2026-10-02T12:00:00').getTime();
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('describes recent times in words', () => {
    expect(formatRelative(ago(20_000), now)).toBe('just now');
    expect(formatRelative(ago(5 * 60_000), now)).toBe('5 min ago');
    expect(formatRelative(ago(3 * 3_600_000), now)).toBe('3 h ago');
    expect(formatRelative(ago(26 * 3_600_000), now)).toBe('yesterday');
    expect(formatRelative(ago(4 * 86_400_000), now)).toBe('4 days ago');
  });

  it('falls back to a date after a week, adding the year only when it differs', () => {
    expect(formatRelative(new Date('2026-09-01T10:00:00').toISOString(), now)).not.toMatch(/2026/);
    expect(formatRelative(new Date('2025-09-01T10:00:00').toISOString(), now)).toMatch(/2025/);
  });

  it('treats clock skew (future times) as just now', () => {
    expect(formatRelative(new Date(now + 5_000).toISOString(), now)).toBe('just now');
  });
});
