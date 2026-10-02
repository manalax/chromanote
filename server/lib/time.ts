const DEFAULT_TIME_ZONE = 'UTC';

/** Returns `tz` if it's a valid IANA time zone, otherwise UTC. */
export function safeTimeZone(tz: unknown): string {
  if (typeof tz !== 'string' || !tz) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** Unambiguous date-time for the model, e.g. "Fri 2 Oct 2026, 14:05". */
export function formatForModel(value: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date(value))
    .replace(/^(\w+),? /, '$1 ');
}
