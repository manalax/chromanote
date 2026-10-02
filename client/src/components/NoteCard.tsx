import { Link } from 'react-router';
import type { NoteSummary } from '@/lib/api';
import { noteColors } from '@/lib/colors';
import { fontFamily } from '@/lib/fonts';
import { useSettings } from '@/lib/settings';
import { formatDateTime, formatRelative, plainExcerpt } from '@/lib/meta';
import { useNow } from '@/lib/useNow';
import { cn } from '@/lib/utils';
import { DueBadge, PriorityFlag, TagChip } from './NoteMeta';

export function NoteCard({ note, to }: { note: NoteSummary; to?: string }) {
  const { settings, isDark } = useSettings();
  const colors = noteColors(
    note.color ?? settings.default_note_color,
    note.text_color ?? settings.default_text_color,
    isDark
  );
  const excerpt = plainExcerpt(note.excerpt);
  const now = useNow(60_000);

  return (
    <Link
      to={to ?? `/notes/${note.id}`}
      className={cn(
        'group block rounded-xl border p-4 transition-all',
        'hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        !colors.bg && 'bg-card',
        !colors.fg && 'text-card-foreground'
      )}
      style={{
        background: colors.bg ?? undefined,
        color: colors.fg ?? undefined,
        borderColor: colors.bg ? 'color-mix(in oklab, currentColor 10%, transparent)' : undefined,
      }}
    >
      <div className="flex items-start gap-2">
        <h3
          className={cn('flex-1 text-base font-semibold leading-snug', !note.title && 'italic opacity-50')}
          style={{ fontFamily: fontFamily(note.font ?? settings.default_font) }}
        >
          {note.title || 'Untitled'}
        </h3>
        <span className="mt-1.5">
          <PriorityFlag priority={note.priority} />
        </span>
      </div>
      {excerpt && (
        <p
          className="mt-2 line-clamp-[8] whitespace-pre-line text-sm leading-relaxed opacity-75"
          style={{ fontFamily: fontFamily(note.font ?? settings.default_font) }}
        >
          {excerpt}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <DueBadge dueAt={note.due_at} />
        {note.tags.map((t) => (
          <TagChip key={t.id} tag={t} />
        ))}
        <time
          dateTime={note.updated_at}
          title={`Created ${formatDateTime(note.created_at)} · Last edited ${formatDateTime(note.updated_at)}`}
          className="ml-auto whitespace-nowrap text-[11px] opacity-55"
        >
          Edited {formatRelative(note.updated_at, now)}
        </time>
      </div>
    </Link>
  );
}
