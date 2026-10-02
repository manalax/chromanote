import { CalendarClock } from 'lucide-react';
import type { Priority, Tag } from '@/lib/api';
import { PRIORITIES, dueStatus, formatDue } from '@/lib/meta';
import { accentOf } from '@/lib/colors';
import { cn } from '@/lib/utils';

export function PriorityFlag({ priority, showLabel = false }: { priority: Priority; showLabel?: boolean }) {
  if (!priority) return null;
  const p = PRIORITIES[priority];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium" title={`${p.label} priority`}>
      <span className="size-2 rounded-full" style={{ background: p.color }} />
      {showLabel && p.label}
    </span>
  );
}

export function DueBadge({ dueAt, className }: { dueAt: string | null; className?: string }) {
  const status = dueStatus(dueAt);
  if (!dueAt || !status) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        status === 'overdue' && 'bg-red-500/15 text-red-700 dark:text-red-300',
        status === 'soon' && 'bg-amber-500/20 text-amber-800 dark:text-amber-200',
        status === 'later' && 'bg-current/10',
        className
      )}
      title={status === 'overdue' ? 'Overdue' : status === 'soon' ? 'Due soon' : 'Due'}
    >
      <CalendarClock className="size-3" />
      {status === 'overdue' ? 'Overdue · ' : ''}
      {formatDue(dueAt)}
    </span>
  );
}

export function TagChip({ tag, className }: { tag: Tag; className?: string }) {
  const accent = accentOf(tag.color) ?? '#888888';
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', className)}
      style={{ background: `color-mix(in oklab, ${accent} 18%, transparent)` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: accent }} />
      {tag.name}
    </span>
  );
}
