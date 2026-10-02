import type { AppKitInstance } from './appkit';
import { chunkNote } from './chunk';
import { normTitle } from './schema';
import { embed } from './serving';

const REINDEX_DELAY_MS = 3000;
const pending = new Map<string, NodeJS.Timeout>();

const toVector = (v: number[]) => `[${v.join(',')}]`;

export async function reindexNote(appkit: AppKitInstance, noteId: string): Promise<void> {
  const { rows } = await appkit.lakebase.query<{ user_id: string; title: string; body: string }>(
    'SELECT user_id, title, body FROM chromanote.notes WHERE id = $1 AND deleted_at IS NULL',
    [noteId]
  );
  const note = rows[0];
  if (!note) {
    await removeChunks(appkit, noteId);
    return;
  }
  const chunks = chunkNote(note.title, note.body);
  const vectors = chunks.length ? await embed(chunks) : [];

  // Embed first, then swap, so the note stays searchable while embedding runs.
  await appkit.lakebase.query('DELETE FROM chromanote.note_chunks WHERE note_id = $1', [noteId]);
  if (chunks.length) {
    await appkit.lakebase.query(
      `INSERT INTO chromanote.note_chunks (note_id, user_id, chunk_index, content, embedding)
       SELECT $1, $2, i - 1, c, e::vector
       FROM unnest($3::text[], $4::text[]) WITH ORDINALITY AS t(c, e, i)`,
      [noteId, note.user_id, chunks, vectors.map(toVector)]
    );
  }
}

/** Debounces reindexing so rapid autosaves only embed once. */
export function scheduleReindex(appkit: AppKitInstance, noteId: string): void {
  clearTimeout(pending.get(noteId));
  pending.set(
    noteId,
    setTimeout(() => {
      pending.delete(noteId);
      reindexNote(appkit, noteId).catch((err) =>
        console.error(`[rag] Failed to reindex note ${noteId}:`, (err as Error).message)
      );
    }, REINDEX_DELAY_MS)
  );
}

export async function removeChunks(appkit: AppKitInstance, noteId: string): Promise<void> {
  clearTimeout(pending.get(noteId));
  pending.delete(noteId);
  await appkit.lakebase.query('DELETE FROM chromanote.note_chunks WHERE note_id = $1', [noteId]);
}

export interface RetrievedChunk {
  note_id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
  due_at: Date | null;
  content: string;
  score: number;
}

const CHUNK_COLUMNS = `c.note_id, n.title, n.created_at, n.updated_at, n.due_at, c.content`;

/** Embeds a question once so it can be reused by several retrieval queries. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embed([text]);
  return vector;
}

export async function retrieveSimilar(
  appkit: AppKitInstance,
  userId: string,
  vector: number[],
  k = 6
): Promise<RetrievedChunk[]> {
  const { rows } = await appkit.lakebase.query<RetrievedChunk>(
    `SELECT ${CHUNK_COLUMNS}, 1 - (c.embedding <=> $2::vector) AS score
     FROM chromanote.note_chunks c
     JOIN chromanote.notes n ON n.id = c.note_id
     WHERE c.user_id = $1 AND n.deleted_at IS NULL
     ORDER BY c.embedding <=> $2::vector
     LIMIT $3`,
    [userId, toVector(vector), k]
  );
  return rows;
}

/**
 * For notes carrying any of `tagIds`, returns each note's chunk closest to the
 * question (the most recently edited `limit` notes), best match first.
 */
export async function retrieveTagged(
  appkit: AppKitInstance,
  userId: string,
  vector: number[],
  tagIds: string[],
  limit = 10
): Promise<RetrievedChunk[]> {
  if (!tagIds.length) return [];
  const { rows } = await appkit.lakebase.query<RetrievedChunk>(
    `SELECT * FROM (
       SELECT DISTINCT ON (c.note_id) ${CHUNK_COLUMNS}, 1 - (c.embedding <=> $2::vector) AS score
       FROM chromanote.note_chunks c
       JOIN chromanote.notes n ON n.id = c.note_id
       WHERE c.user_id = $1 AND n.deleted_at IS NULL
         AND n.id IN (
           SELECT n2.id FROM chromanote.notes n2
           WHERE n2.user_id = $1 AND n2.deleted_at IS NULL
             AND EXISTS (SELECT 1 FROM chromanote.note_tags nt WHERE nt.note_id = n2.id AND nt.tag_id = ANY($3::uuid[]))
           ORDER BY n2.updated_at DESC
           LIMIT $4
         )
       ORDER BY c.note_id, c.embedding <=> $2::vector
     ) best
     ORDER BY score DESC`,
    [userId, toVector(vector), tagIds, limit]
  );
  return rows;
}

export interface NoteDetails {
  tags: string[];
  priority: number;
  archived: boolean;
  links_to: string[];
  linked_from: string[];
}

const LINK_LIST_LIMIT = 8;

/** Current tags, priority, archive state and links for notes, read at question time. */
export async function loadNoteMeta(
  appkit: AppKitInstance,
  userId: string,
  noteIds: string[]
): Promise<Map<string, NoteDetails>> {
  if (!noteIds.length) return new Map();
  const { rows } = await appkit.lakebase.query<NoteDetails & { id: string }>(
    `SELECT n.id, n.priority, n.archived_at IS NOT NULL AS archived,
       COALESCE((SELECT array_agg(t.name ORDER BY lower(t.name))
                 FROM chromanote.note_tags nt JOIN chromanote.tags t ON t.id = nt.tag_id
                 WHERE nt.note_id = n.id), '{}') AS tags,
       COALESCE((SELECT array_agg(title) FROM (
                   SELECT DISTINCT tgt.title FROM chromanote.note_links l
                   JOIN chromanote.notes tgt ON tgt.user_id = n.user_id AND tgt.deleted_at IS NULL
                     AND ${normTitle('tgt.title')} = l.target_title AND tgt.id <> n.id
                   WHERE l.source_id = n.id LIMIT ${LINK_LIST_LIMIT}) x), '{}') AS links_to,
       COALESCE((SELECT array_agg(title) FROM (
                   SELECT DISTINCT src.title FROM chromanote.note_links l
                   JOIN chromanote.notes src ON src.id = l.source_id AND src.user_id = n.user_id
                     AND src.deleted_at IS NULL AND src.id <> n.id
                   WHERE n.title <> '' AND l.target_title = ${normTitle('n.title')} LIMIT ${LINK_LIST_LIMIT}) y), '{}') AS linked_from
     FROM chromanote.notes n
     WHERE n.user_id = $1 AND n.id = ANY($2::uuid[])`,
    [userId, noteIds]
  );
  return new Map(rows.map(({ id, ...details }) => [id, details]));
}
