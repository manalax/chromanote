import type { AppKitInstance } from './appkit';

/** A pause in writing at least this long ends a version: the next edit keeps the text as it was. */
export const IDLE_SECONDS = 60;

/** During continuous writing, a version is still kept at least this often. */
export const SNAPSHOT_INTERVAL_MINUTES = 10;

/** Revisions kept per note; older ones are pruned. */
export const MAX_REVISIONS = 100;

export type RevisionReason = 'edit' | 'rename' | 'link' | 'restore';

/**
 * Copies the note's current title and body into its history, before a write
 * replaces them. Autosaves are coalesced into bursts of writing: an `edit`
 * snapshots when the note was last saved more than IDLE_SECONDS ago (so each
 * burst's final text is kept), or when the newest revision is older than
 * SNAPSHOT_INTERVAL_MINUTES. Other reasons always snapshot. Nothing is stored for empty notes or when the text matches the
 * newest revision. Returns whether a revision was stored.
 */
export async function snapshotNote(
  appkit: AppKitInstance,
  userId: string,
  noteId: string,
  reason: RevisionReason
): Promise<boolean> {
  const { rows } = await appkit.lakebase.query<{ id: string }>(
    `WITH latest AS (
       SELECT title, body, created_at FROM chromanote.note_revisions
       WHERE note_id = $1 ORDER BY id DESC LIMIT 1
     )
     INSERT INTO chromanote.note_revisions (note_id, user_id, title, body, reason)
     SELECT n.id, n.user_id, n.title, n.body, $3
     FROM chromanote.notes n
     WHERE n.id = $1 AND n.user_id = $2 AND n.deleted_at IS NULL
       AND (n.title <> '' OR n.body <> '')
       AND NOT EXISTS (SELECT 1 FROM latest l WHERE l.title = n.title AND l.body = n.body)
       AND (
         $3 <> 'edit'
         OR n.updated_at < NOW() - make_interval(secs => $5)
         OR NOT EXISTS (SELECT 1 FROM latest l WHERE l.created_at > NOW() - make_interval(mins => $4))
       )
     RETURNING id`,
    [noteId, userId, reason, SNAPSHOT_INTERVAL_MINUTES, IDLE_SECONDS]
  );
  if (!rows[0]) return false;
  await appkit.lakebase.query(
    `DELETE FROM chromanote.note_revisions
     WHERE note_id = $1 AND id NOT IN (
       SELECT id FROM chromanote.note_revisions WHERE note_id = $1 ORDER BY id DESC LIMIT $2
     )`,
    [noteId, MAX_REVISIONS]
  );
  return true;
}
