import { z } from 'zod';
import { parseWikilinks } from '../../shared/wikilinks';
import { type AppKitInstance, HttpError, getUserId, route } from '../lib/appkit';
import { removeChunks, scheduleReindex } from '../lib/rag';
import { positionBetween } from '../lib/order';
import { BOARD_COLUMNS, normTitle } from '../lib/schema';

const Id = z.string().uuid();
const Color = z.string().regex(/^(#[0-9a-fA-F]{6}|[a-z]+)$/);
const Font = z.enum(['inter', 'lora', 'mono', 'caveat']);
const Priority = z.number().int().min(0).max(4);

export const CreateNoteBody = z.object({
  title: z.string().max(300).default(''),
  body: z.string().max(500_000).default(''),
  color: Color.nullable().optional(),
  text_color: Color.nullable().optional(),
  font: Font.nullable().optional(),
  priority: Priority.optional(),
  due_at: z.string().datetime({ offset: true }).nullable().optional(),
  tagIds: z.array(Id).optional(),
  graph_x: z.number().finite().nullable().optional(),
  graph_y: z.number().finite().nullable().optional(),
});

const UpdateNoteBody = z
  .object({
    title: z.string().max(300),
    body: z.string().max(500_000),
    color: Color.nullable(),
    text_color: Color.nullable(),
    font: Font.nullable(),
    priority: Priority,
    due_at: z.string().datetime({ offset: true }).nullable(),
    archived: z.boolean(),
  })
  .partial();

const MoveBody = z.object({
  column: z
    .number()
    .int()
    .min(0)
    .max(BOARD_COLUMNS - 1),
  /** The note to place this one directly above, in `column`; null = bottom of the column. */
  before_id: Id.nullable(),
});

const ListQuery = z.object({
  q: z.string().trim().max(200).optional(),
  tag: Id.optional(),
  priority: z.coerce.number().int().min(0).max(4).optional(),
  due: z.enum(['overdue', 'soon', 'any']).optional(),
  status: z.enum(['active', 'archived', 'trash']).default('active'),
  sort: z.enum(['custom', 'updated', 'created', 'priority', 'due', 'title']).default('custom'),
});

const TAGS_JSON = `COALESCE((
  SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) ORDER BY lower(t.name))
  FROM chromanote.note_tags nt JOIN chromanote.tags t ON t.id = nt.tag_id
  WHERE nt.note_id = n.id), '[]'::json) AS tags`;

const SUMMARY_COLUMNS = `n.id, n.title, left(n.body, 600) AS excerpt, n.board_col, n.color, n.text_color, n.font, n.priority, n.due_at,
  n.archived_at, n.deleted_at, n.created_at, n.updated_at, ${TAGS_JSON}`;

const FULL_COLUMNS = `n.id, n.title, n.body, n.color, n.text_color, n.font, n.priority, n.due_at,
  n.archived_at, n.deleted_at, n.created_at, n.updated_at, ${TAGS_JSON}`;

const SORTS: Record<z.infer<typeof ListQuery>['sort'], string> = {
  custom: 'n.sort_order ASC NULLS LAST, n.updated_at DESC',
  updated: 'n.updated_at DESC',
  created: 'n.created_at DESC',
  priority: 'n.priority DESC, n.updated_at DESC',
  due: 'n.due_at ASC NULLS LAST, n.priority DESC',
  title: 'lower(n.title) ASC',
};

/** Days ahead that count as "due soon". */
const DUE_SOON_DAYS = 3;

export async function getNote(appkit: AppKitInstance, userId: string, id: string) {
  const { rows } = await appkit.lakebase.query(
    `SELECT ${FULL_COLUMNS} FROM chromanote.notes n WHERE n.id = $1 AND n.user_id = $2`,
    [id, userId]
  );
  if (!rows[0]) throw new HttpError(404, 'Note not found');
  return rows[0];
}

export async function syncLinks(appkit: AppKitInstance, noteId: string, body: string) {
  await appkit.lakebase.query('DELETE FROM chromanote.note_links WHERE source_id = $1', [noteId]);
  const targets = parseWikilinks(body);
  if (targets.length) {
    await appkit.lakebase.query(
      `INSERT INTO chromanote.note_links (source_id, target_title)
       SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
      [noteId, targets]
    );
  }
}

async function setTags(appkit: AppKitInstance, userId: string, noteId: string, tagIds: string[]) {
  await appkit.lakebase.query('DELETE FROM chromanote.note_tags WHERE note_id = $1', [noteId]);
  if (tagIds.length) {
    // Only tags owned by the user can be attached.
    await appkit.lakebase.query(
      `INSERT INTO chromanote.note_tags (note_id, tag_id)
       SELECT $1, t.id FROM chromanote.tags t WHERE t.user_id = $2 AND t.id = ANY($3::uuid[])
       ON CONFLICT DO NOTHING`,
      [noteId, userId, tagIds]
    );
  }
}

export async function createNote(appkit: AppKitInstance, userId: string, input: z.infer<typeof CreateNoteBody>) {
  const { rows } = await appkit.lakebase.query<{ id: string }>(
    // New notes go to the top of the custom order.
    `INSERT INTO chromanote.notes
       (user_id, title, body, color, text_color, font, priority, due_at, graph_x, graph_y, sort_order, board_col)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       (SELECT COALESCE(MIN(sort_order), 1) - 1 FROM chromanote.notes WHERE user_id = $1), 0)
     RETURNING id`,
    [
      userId,
      input.title.trim(),
      input.body,
      input.color ?? null,
      input.text_color ?? null,
      input.font ?? null,
      input.priority ?? 0,
      input.due_at ?? null,
      input.graph_x ?? null,
      input.graph_y ?? null,
    ]
  );
  const id = rows[0].id;
  if (input.tagIds?.length) await setTags(appkit, userId, id, input.tagIds);
  if (input.body) await syncLinks(appkit, id, input.body);
  if (input.title.trim() || input.body.trim()) scheduleReindex(appkit, id);
  return id;
}

export function parseId(raw: unknown): string {
  const parsed = Id.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, 'Invalid id');
  return parsed.data;
}

export function registerNoteRoutes(appkit: AppKitInstance) {
  appkit.server.extend((app) => {
    app.get(
      '/api/notes',
      route('list notes', async (req, res) => {
        const userId = getUserId(req);
        const parsed = ListQuery.safeParse(req.query);
        if (!parsed.success) throw new HttpError(400, 'Invalid query');
        const { q, tag, priority, due, status, sort } = parsed.data;

        const params: unknown[] = [userId];
        const where = ['n.user_id = $1'];
        if (status === 'trash') where.push('n.deleted_at IS NOT NULL');
        else
          where.push(
            'n.deleted_at IS NULL',
            status === 'archived' ? 'n.archived_at IS NOT NULL' : 'n.archived_at IS NULL'
          );

        let order = SORTS[sort];
        if (q) {
          params.push(q);
          const p = `$${params.length}`;
          where.push(`(n.search @@ websearch_to_tsquery('english', ${p}) OR n.title ILIKE '%' || ${p} || '%')`);
          // The chosen sort wins (so dragging within search results sticks); search
          // relevance only breaks ties.
          order = `${order}, ts_rank(n.search, websearch_to_tsquery('english', ${p})) DESC`;
        }
        if (tag) {
          params.push(tag);
          where.push(
            `EXISTS (SELECT 1 FROM chromanote.note_tags nt WHERE nt.note_id = n.id AND nt.tag_id = $${params.length})`
          );
        }
        if (priority !== undefined) {
          params.push(priority);
          where.push(`n.priority = $${params.length}`);
        }
        if (due === 'overdue') where.push('n.due_at < NOW()');
        if (due === 'soon') where.push(`n.due_at >= NOW() AND n.due_at < NOW() + INTERVAL '${DUE_SOON_DAYS} days'`);
        if (due === 'any') where.push('n.due_at IS NOT NULL');

        const { rows } = await appkit.lakebase.query(
          `SELECT ${SUMMARY_COLUMNS} FROM chromanote.notes n WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 500`,
          params
        );
        res.json(rows);
      })
    );

    app.get(
      '/api/notes/titles',
      route('list note titles', async (req, res) => {
        const userId = getUserId(req);
        const { rows } = await appkit.lakebase.query(
          `SELECT id, title FROM chromanote.notes
           WHERE user_id = $1 AND deleted_at IS NULL AND title <> '' ORDER BY updated_at DESC`,
          [userId]
        );
        res.json(rows);
      })
    );

    app.post(
      '/api/notes/resolve',
      route('resolve note', async (req, res) => {
        const userId = getUserId(req);
        const parsed = z.object({ title: z.string().trim().min(1).max(300) }).safeParse(req.body);
        if (!parsed.success) throw new HttpError(400, 'title is required');
        const { rows } = await appkit.lakebase.query<{ id: string }>(
          `SELECT id FROM chromanote.notes
           WHERE user_id = $1 AND deleted_at IS NULL AND ${normTitle('title')} = ${normTitle('$2')}
           ORDER BY created_at ASC LIMIT 1`,
          [userId, parsed.data.title]
        );
        if (rows[0]) {
          res.json({ id: rows[0].id, created: false });
          return;
        }
        const id = await createNote(appkit, userId, { title: parsed.data.title.replace(/\s+/g, ' '), body: '' });
        res.status(201).json({ id, created: true });
      })
    );

    app.delete(
      '/api/notes/trash',
      route('empty trash', async (req, res) => {
        const userId = getUserId(req);
        await appkit.lakebase.query('DELETE FROM chromanote.notes WHERE user_id = $1 AND deleted_at IS NOT NULL', [
          userId,
        ]);
        res.status(204).send();
      })
    );

    app.post(
      '/api/notes',
      route('create note', async (req, res) => {
        const userId = getUserId(req);
        const parsed = CreateNoteBody.safeParse(req.body ?? {});
        if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid note');
        const id = await createNote(appkit, userId, parsed.data);
        res.status(201).json(await getNote(appkit, userId, id));
      })
    );

    app.get(
      '/api/notes/:id',
      route('get note', async (req, res) => {
        res.json(await getNote(appkit, getUserId(req), parseId(req.params.id)));
      })
    );

    app.patch(
      '/api/notes/:id',
      route('update note', async (req, res) => {
        const userId = getUserId(req);
        const id = parseId(req.params.id);
        const parsed = UpdateNoteBody.safeParse(req.body);
        if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid update');
        const { archived, ...fields } = parsed.data;

        const sets: string[] = [];
        const params: unknown[] = [id, userId];
        for (const [key, value] of Object.entries(fields)) {
          params.push(key === 'title' && typeof value === 'string' ? value.trim() : value);
          sets.push(`${key} = $${params.length}`);
        }
        if (archived !== undefined) sets.push(`archived_at = ${archived ? 'COALESCE(archived_at, NOW())' : 'NULL'}`);
        if (sets.length === 0) throw new HttpError(400, 'Nothing to update');

        const { rows } = await appkit.lakebase.query(
          `UPDATE chromanote.notes SET ${sets.join(', ')}, updated_at = NOW()
           WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING id`,
          params
        );
        if (!rows[0]) throw new HttpError(404, 'Note not found');
        if (fields.body !== undefined) await syncLinks(appkit, id, fields.body);
        if (fields.body !== undefined || fields.title !== undefined) scheduleReindex(appkit, id);
        res.json(await getNote(appkit, userId, id));
      })
    );

    app.put(
      '/api/notes/:id/tags',
      route('set note tags', async (req, res) => {
        const userId = getUserId(req);
        const id = parseId(req.params.id);
        const parsed = z.object({ tagIds: z.array(Id) }).safeParse(req.body);
        if (!parsed.success) throw new HttpError(400, 'tagIds is required');
        await getNote(appkit, userId, id); // ownership check
        await setTags(appkit, userId, id, parsed.data.tagIds);
        await appkit.lakebase.query('UPDATE chromanote.notes SET updated_at = NOW() WHERE id = $1', [id]);
        res.json(await getNote(appkit, userId, id));
      })
    );

    app.delete(
      '/api/notes/:id',
      route('trash note', async (req, res) => {
        const userId = getUserId(req);
        const id = parseId(req.params.id);
        const { rows } = await appkit.lakebase.query(
          `UPDATE chromanote.notes SET deleted_at = NOW()
           WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING id`,
          [id, userId]
        );
        if (!rows[0]) throw new HttpError(404, 'Note not found');
        await removeChunks(appkit, id);
        res.status(204).send();
      })
    );

    app.post(
      '/api/notes/:id/restore',
      route('restore note', async (req, res) => {
        const userId = getUserId(req);
        const id = parseId(req.params.id);
        const { rows } = await appkit.lakebase.query(
          `UPDATE chromanote.notes SET deleted_at = NULL
           WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL RETURNING id`,
          [id, userId]
        );
        if (!rows[0]) throw new HttpError(404, 'Note not found in trash');
        scheduleReindex(appkit, id);
        res.json(await getNote(appkit, userId, id));
      })
    );

    app.delete(
      '/api/notes/:id/permanent',
      route('delete note', async (req, res) => {
        const userId = getUserId(req);
        const id = parseId(req.params.id);
        const { rows } = await appkit.lakebase.query(
          `DELETE FROM chromanote.notes WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL RETURNING id`,
          [id, userId]
        );
        if (!rows[0]) throw new HttpError(404, 'Note not found in trash');
        res.status(204).send();
      })
    );

    app.post(
      '/api/notes/:id/move',
      route('move note', async (req, res) => {
        const userId = getUserId(req);
        const id = parseId(req.params.id);
        const parsed = MoveBody.safeParse(req.body);
        if (!parsed.success) throw new HttpError(400, `column (0-${BOARD_COLUMNS - 1}) and before_id are required`);
        const { column, before_id } = parsed.data;
        if (before_id === id) throw new HttpError(400, 'A note cannot be placed above itself');

        // Sort key just above `before_id` (or at the bottom of the column).
        const target = async () => {
          const ids = [id, ...(before_id ? [before_id] : [])];
          const { rows } = await appkit.lakebase.query<{ id: string; sort_order: number; board_col: number }>(
            'SELECT id, sort_order, board_col FROM chromanote.notes WHERE user_id = $1 AND id = ANY($2::uuid[])',
            [userId, ids]
          );
          if (rows.length !== ids.length) throw new HttpError(404, 'Note not found');
          const before = rows.find((r) => r.id === before_id);
          if (before && before.board_col !== column) throw new HttpError(400, 'before_id is in a different column');
          const { rows: above } = await appkit.lakebase.query<{ sort_order: number | null }>(
            `SELECT MAX(sort_order) AS sort_order FROM chromanote.notes
             WHERE user_id = $1 AND board_col = $2 AND id <> $3 ${before ? 'AND sort_order < $4' : ''}`,
            before ? [userId, column, id, before.sort_order] : [userId, column, id]
          );
          return positionBetween(above[0]?.sort_order ?? null, before?.sort_order ?? null);
        };

        let position = await target();
        if (position === null) {
          // Neighbours too close together: renumber, then retry.
          await appkit.lakebase.query(
            `UPDATE chromanote.notes SET sort_order = r.rn
             FROM (SELECT id, row_number() OVER (ORDER BY sort_order ASC NULLS LAST, updated_at DESC) AS rn
                   FROM chromanote.notes WHERE user_id = $1) r
             WHERE chromanote.notes.id = r.id`,
            [userId]
          );
          position = (await target()) ?? 0;
        }
        // Moving is layout, not an edit, so updated_at is left alone.
        await appkit.lakebase.query(
          'UPDATE chromanote.notes SET sort_order = $3, board_col = $4 WHERE id = $1 AND user_id = $2',
          [id, userId, position, column]
        );
        res.json({ id, sort_order: position, board_col: column });
      })
    );

    app.get(
      '/api/notes/:id/backlinks',
      route('list backlinks', async (req, res) => {
        const userId = getUserId(req);
        const id = parseId(req.params.id);
        const { rows } = await appkit.lakebase.query(
          `SELECT DISTINCT src.id, src.title, src.color, src.updated_at
           FROM chromanote.notes target
           JOIN chromanote.note_links l ON l.target_title = ${normTitle('target.title')}
           JOIN chromanote.notes src ON src.id = l.source_id
           WHERE target.id = $1 AND target.user_id = $2 AND target.title <> ''
             AND src.user_id = $2 AND src.deleted_at IS NULL AND src.id <> target.id
           ORDER BY src.updated_at DESC`,
          [id, userId]
        );
        res.json(rows);
      })
    );
  });
}
