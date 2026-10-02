import { describe, expect, it } from 'vitest';
import { formatForModel, safeTimeZone } from './time';

describe('safeTimeZone', () => {
  it('accepts valid IANA zones', () => {
    expect(safeTimeZone('Australia/Sydney')).toBe('Australia/Sydney');
  });

  it('falls back to UTC for missing or invalid zones', () => {
    expect(safeTimeZone(undefined)).toBe('UTC');
    expect(safeTimeZone('Mars/Olympus')).toBe('UTC');
    expect(safeTimeZone(42)).toBe('UTC');
  });
});

describe('formatForModel', () => {
  it('formats in the given time zone with weekday and 24h time', () => {
    const at = '2026-10-02T03:05:00Z';
    expect(formatForModel(at, 'UTC')).toBe('Fri 2 Oct 2026, 03:05');
    expect(formatForModel(at, 'Australia/Sydney')).toBe('Fri 2 Oct 2026, 13:05');
  });
});
