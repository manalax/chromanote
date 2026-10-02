import type { Priority } from './api';

export const PRIORITIES: { value: Priority; label: string; color: string }[] = [
  { value: 0, label: 'None', color: 'transparent' },
  { value: 1, label: 'Low', color: '#94a3b8' },
  { value: 2, label: 'Medium', color: '#3b8fdc' },
  { value: 3, label: 'High', color: '#ee7a45' },
  { value: 4, label: 'Urgent', color: '#e0364f' },
];

const SOON_MS = 3 * 24 * 60 * 60 * 1000;

export function dueStatus(dueAt: string | null): 'overdue' | 'soon' | 'later' | null {
  if (!dueAt) return null;
  const diff = new Date(dueAt).getTime() - Date.now();
  if (diff < 0) return 'overdue';
  return diff < SOON_MS ? 'soon' : 'later';
}

export function formatDue(dueAt: string): string {
  const d = new Date(dueAt);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
    hour: hasTime ? 'numeric' : undefined,
    minute: hasTime ? '2-digit' : undefined,
  });
}

/** Turns markdown into a plain-text excerpt for cards. */
export function plainExcerpt(md: string, max = 280): string {
  const text = md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/g, (_m, t: string, l?: string) => l ?? t)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '☐ ')
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, '• ')
    .replace(/[*_~`>]/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Short relative time: "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then a date. */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const then = new Date(iso);
  const diff = Math.max(0, now - then.getTime());
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const sameYear = then.getFullYear() === new Date(now).getFullYear();
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' });
}

/** Full local date and time, e.g. for tooltips. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
