import { z } from 'zod';
import { addRelatedLink, normalizeTitle, parseWikilinks, renameLinks, unlinkTarget } from '../../shared/wikilinks';
import { type AppKitInstance, HttpError, getUserId, route } from '../lib/appkit';
import { scheduleReindex } from '../lib/rag';
import { normTitle } from '../lib/schema';
import { getNote, parseId, syncLinks } from './notes';

const Id = z.string().uuid();
const LinkBody = z.object({ source_id: Id, target_id: Id });
const PositionBody = z.object({
  x: z.number().finite().nullable(),
  y: z.number().finite().nullable(),
});

interface NoteText {
  id: string;
  title: string;
  body: string;
}

/** Loads live (non-trashed) notes owned by the user, or throws 404. */
async function ownedNotes(appkit: AppKitInstance, userId: string, ids: string[]): Promise<Map<string, NoteText>> {
  const { rows } = await appkit.lakebase.query<NoteText>(
    `SELECT id, title, body FROM chromanote.notes
     WHERE user_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL`,
    [userId, ids]
  );
  const found = new Map(rows.map((r) => [r.id, r]));
  if (ids.some((id) => !found.has(id))) throw new HttpError(404, 'Note not found');
  return found;
}

/** Saves a new body and refreshes its derived link rows and embeddings. */
async function saveBody(appkit: AppKitInstance, id: string, body: string) {
  await appkit.lakebase.query('UPDATE chromanote.notes SET body = $2, updated_at = NOW() WHERE id = $1', [id, body]);
  await syncLinks(appkit, id, body);
  scheduleReindex(appkit, id);
}

export function registerGraphRoutes(appkit: AppKitInstance) {
  appkit.server.extend((app) => {
    app.get(
      '/api/graph',
      route('build graph', async (req, res) => {
        const userId = getUserId(req);
        const nodes = await appkit.lakebase.query(
          `SELECT id, title, color, priority, graph_x, graph_y FROM chromanote.notes
           WHERE user_id = $1 AND deleted_at IS NULL AND archived_at IS NULL`,
          [userId]
        );
        const edges = await appkit.lakebase.query(
          `SELECT DISTINCT l.source_id AS source, tgt.id AS target
           FROM chromanote.note_links l
           JOIN chromanote.notes src ON src.id = l.source_id
           JOIN chromanote.notes tgt ON tgt.user_id = src.user_id AND ${normTitle('tgt.title')} = l.target_title
           WHERE src.user_id = $1 AND src.deleted_at IS NULL AND src.archived_at IS NULL
             AND tgt.deleted_at IS NULL AND tgt.archived_at IS NULL AND tgt.id <> src.id`,
          [userId]
        );
        res.json({ nodes: nodes.rows, edges: edges.rows });
      })
    );

    app.post(
      '/api/graph/links',
      route('link notes', async (req, res) => {
        const userId = getUserId(req);
        const parsed = LinkBody.safeParse(req.body);
        if (!parsed.success) throw new HttpError(400, 'source_id and target_id are required');
        const { source_id, target_id } = parsed.data;
        if (source_id === target_id) {
          res.json({ added: false, reason: 'self' });
          return;
        }
        const notes = await ownedNotes(appkit, userId, [source_id, target_id]);
        const source = notes.get(source_id)!;
        const target = notes.get(target_id)!;
        if (!target.title.trim()) throw new HttpError(400, 'Give the target note a title before linking to it');
        if (parseWikilinks(source.body).includes(normalizeTitle(target.title))) {
          res.json({ added: false, reason: 'exists' });
          return;
        }
        await saveBody(appkit, source_id, addRelatedLink(source.body, target.title));
        res.status(201).json({ added: true });
      })
    );

    app.delete(
      '/api/graph/links',
      route('unlink notes', async (req, res) => {
        const userId = getUserId(req);
        const parsed = LinkBody.safeParse(req.body);
        if (!parsed.success) throw new HttpError(400, 'source_id and target_id are required');
        const { source_id, target_id } = parsed.data;
        const notes = await ownedNotes(appkit, userId, [source_id, target_id]);
        const source = notes.get(source_id)!;
        const body = unlinkTarget(source.body, notes.get(target_id)!.title);
        if (body !== source.body) await saveBody(appkit, source_id, body);
        res.status(204).send();
      })
    );

    app.put(
      '/api/notes/:id/position',
      route('save node position', async (req, res) => {
        const userId = getUserId(req);
        const id = parseId(req.params.id);
        const parsed = PositionBody.safeParse(req.body);
        if (!parsed.success) throw new HttpError(400, 'x and y are required');
        // Positions are layout state, so they don't bump updated_at.
        const { rows } = await appkit.lakebase.query(
          `UPDATE chromanote.notes SET graph_x = $3, graph_y = $4
           WHERE id = $1 AND user_id = $2 RETURNING id`,
          [id, userId, parsed.data.x, parsed.data.y]
        );
        if (!rows[0]) throw new HttpError(404, 'Note not found');
        res.status(204).send();
      })
    );

    app.delete(
      '/api/graph/positions',
      route('reset layout', async (req, res) => {
        await appkit.lakebase.query(
          'UPDATE chromanote.notes SET graph_x = NULL, graph_y = NULL WHERE user_id = $1 AND graph_x IS NOT NULL',
          [getUserId(req)]
        );
        res.status(204).send();
      })
    );

    app.post(
      '/api/notes/:id/rename',
      route('rename note', async (req, res) => {
        const userId = getUserId(req);
        const id = parseId(req.params.id);
        const parsed = z.object({ title: z.string().trim().min(1).max(300) }).safeParse(req.body);
        if (!parsed.success) throw new HttpError(400, 'title is required');
        const newTitle = parsed.data.title.replace(/\s+/g, ' ');
        const note = (await ownedNotes(appkit, userId, [id])).get(id)!;

        await appkit.lakebase.query('UPDATE chromanote.notes SET title = $2, updated_at = NOW() WHERE id = $1', [
          id,
          newTitle,
        ]);
        scheduleReindex(appkit, id);

        // Point [[Old title]] links in the user's other notes at the new title.
        let rewritten = 0;
        if (note.title.trim() && normalizeTitle(note.title) !== normalizeTitle(newTitle)) {
          const { rows } = await appkit.lakebase.query<NoteText>(
            `SELECT DISTINCT n.id, n.title, n.body FROM chromanote.note_links l
             JOIN chromanote.notes n ON n.id = l.source_id
             WHERE n.user_id = $1 AND l.target_title = ${normTitle('$2')} AND n.id <> $3`,
            [userId, note.title, id]
          );
          for (const ref of rows) {
            const body = renameLinks(ref.body, note.title, newTitle);
            if (body !== ref.body) {
              await saveBody(appkit, ref.id, body);
              rewritten++;
            }
          }
        }
        res.json({ note: await getNote(appkit, userId, id), rewritten });
      })
    );
  });
}
