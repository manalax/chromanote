import type { AppKitInstance } from './appkit';

export const EMBEDDING_DIM = 1024;

/** Columns on the notes board (see shared order: board_col, then sort_order). */
export const BOARD_COLUMNS = 4;

/** SQL twin of normalizeTitle() in shared/wikilinks.ts. */
export const normTitle = (col: string) => `regexp_replace(lower(trim(${col})), '\\s+', ' ', 'g')`;

function addColumn(table: string, column: string, type: string) {
  return `DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'chromanote' AND table_name = '${table}' AND column_name = '${column}'
    ) THEN
      ALTER TABLE chromanote.${table} ADD COLUMN ${column} ${type};
    END IF;
  END $$`;
}

const STATEMENTS = [
  `CREATE EXTENSION IF NOT EXISTS vector`,
  `CREATE SCHEMA IF NOT EXISTS chromanote`,
  `CREATE TABLE IF NOT EXISTS chromanote.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    color TEXT,
    font TEXT,
    priority SMALLINT NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 4),
    due_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    search TSVECTOR GENERATED ALWAYS AS (
      setweight(to_tsvector('english', title), 'A') || setweight(to_tsvector('english', body), 'B')
    ) STORED
  )`,
  `CREATE INDEX IF NOT EXISTS notes_user_updated_idx ON chromanote.notes (user_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS notes_user_title_idx ON chromanote.notes (user_id, ${normTitle('title')})`,
  `CREATE INDEX IF NOT EXISTS notes_search_idx ON chromanote.notes USING GIN (search)`,
  `CREATE TABLE IF NOT EXISTS chromanote.tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tags_user_name_idx ON chromanote.tags (user_id, lower(name))`,
  `CREATE TABLE IF NOT EXISTS chromanote.note_tags (
    note_id UUID NOT NULL REFERENCES chromanote.notes(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES chromanote.tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
  )`,
  // Links are stored by lower-cased target title so they resolve as soon as a
  // note with that title exists (including notes created or renamed later).
  `CREATE TABLE IF NOT EXISTS chromanote.note_links (
    source_id UUID NOT NULL REFERENCES chromanote.notes(id) ON DELETE CASCADE,
    target_title TEXT NOT NULL,
    PRIMARY KEY (source_id, target_title)
  )`,
  `CREATE INDEX IF NOT EXISTS note_links_target_idx ON chromanote.note_links (target_title)`,
  `CREATE TABLE IF NOT EXISTS chromanote.note_chunks (
    id BIGSERIAL PRIMARY KEY,
    note_id UUID NOT NULL REFERENCES chromanote.notes(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(${EMBEDDING_DIM}) NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS note_chunks_user_idx ON chromanote.note_chunks (user_id)`,
  `CREATE INDEX IF NOT EXISTS note_chunks_embedding_idx ON chromanote.note_chunks USING hnsw (embedding vector_cosine_ops)`,
  `CREATE TABLE IF NOT EXISTS chromanote.user_settings (
    user_id TEXT PRIMARY KEY,
    theme TEXT NOT NULL DEFAULT 'system',
    bg_color TEXT,
    default_font TEXT NOT NULL DEFAULT 'inter',
    default_note_color TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS chromanote.chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS chats_user_idx ON chromanote.chats (user_id, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS chromanote.chat_messages (
    id BIGSERIAL PRIMARY KEY,
    chat_id UUID NOT NULL REFERENCES chromanote.chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    sources JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS chat_messages_chat_idx ON chromanote.chat_messages (chat_id, id)`,
  // Columns added after the first release. ALTER TABLE needs table ownership
  // even when it would be a no-op, so only alter when the column is missing.
  addColumn('notes', 'text_color', 'TEXT'),
  addColumn('user_settings', 'default_text_color', 'TEXT'),
  addColumn('user_settings', 'dictation_lang', 'TEXT'),
  addColumn('notes', 'graph_x', 'DOUBLE PRECISION'),
  addColumn('notes', 'graph_y', 'DOUBLE PRECISION'),
  addColumn('notes', 'sort_order', 'DOUBLE PRECISION'),
  // Notes without a custom position start in last-edited order (only touches NULLs).
  `UPDATE chromanote.notes SET sort_order = r.rn
   FROM (
     SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY updated_at DESC) AS rn
     FROM chromanote.notes WHERE sort_order IS NULL
   ) r
   WHERE chromanote.notes.id = r.id`,
  `CREATE INDEX IF NOT EXISTS notes_user_sort_idx ON chromanote.notes (user_id, sort_order)`,
  // Board column (0..BOARD_COLUMNS-1) for the Custom order board. Existing notes
  // are dealt round-robin in custom order, matching the previous masonry layout.
  addColumn('notes', 'board_col', 'SMALLINT'),
  `UPDATE chromanote.notes SET board_col = (r.rn - 1) % ${BOARD_COLUMNS}
   FROM (
     SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY sort_order ASC NULLS LAST, updated_at DESC) AS rn
     FROM chromanote.notes WHERE board_col IS NULL
   ) r
   WHERE chromanote.notes.id = r.id`,
];

export async function setupSchema(appkit: AppKitInstance) {
  try {
    for (const sql of STATEMENTS) {
      await appkit.lakebase.query(sql);
    }
    console.log('[lakebase] Schema chromanote is ready');
  } catch (err) {
    console.warn('[lakebase] Schema setup failed:', (err as Error).message);
    console.warn('[lakebase] Routes will be registered but may return errors');
  }
}
