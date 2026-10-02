import { z } from 'zod';
import { type AppKitInstance, HttpError, getUserId, route } from '../lib/appkit';

const TagBody = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^(#[0-9a-fA-F]{6}|[a-z]+)$/),
});

const isUniqueViolation = (err: unknown) => (err as { code?: string }).code === '23505';

export function registerTagRoutes(appkit: AppKitInstance) {
  appkit.server.extend((app) => {
    app.get(
      '/api/tags',
      route('list tags', async (req, res) => {
        const { rows } = await appkit.lakebase.query(
          `SELECT t.id, t.name, t.color,
             (SELECT count(*)::int FROM chromanote.note_tags nt
              JOIN chromanote.notes n ON n.id = nt.note_id
              WHERE nt.tag_id = t.id AND n.deleted_at IS NULL) AS note_count
           FROM chromanote.tags t WHERE t.user_id = $1 ORDER BY lower(t.name)`,
          [getUserId(req)]
        );
        res.json(rows);
      })
    );

    app.post(
      '/api/tags',
      route('create tag', async (req, res) => {
        const parsed = TagBody.safeParse(req.body);
        if (!parsed.success) throw new HttpError(400, 'name and color are required');
        try {
          const { rows } = await appkit.lakebase.query(
            'INSERT INTO chromanote.tags (user_id, name, color) VALUES ($1, $2, $3) RETURNING id, name, color',
            [getUserId(req), parsed.data.name, parsed.data.color]
          );
          res.status(201).json({ ...rows[0], note_count: 0 });
        } catch (err) {
          if (isUniqueViolation(err)) throw new HttpError(409, 'A tag with that name already exists');
          throw err;
        }
      })
    );

    app.patch(
      '/api/tags/:id',
      route('update tag', async (req, res) => {
        const id = z.string().uuid().safeParse(req.params.id);
        const parsed = TagBody.partial().safeParse(req.body);
        if (!id.success || !parsed.success) throw new HttpError(400, 'Invalid tag update');
        try {
          const { rows } = await appkit.lakebase.query(
            `UPDATE chromanote.tags SET name = COALESCE($3, name), color = COALESCE($4, color)
             WHERE id = $1 AND user_id = $2 RETURNING id, name, color`,
            [id.data, getUserId(req), parsed.data.name ?? null, parsed.data.color ?? null]
          );
          if (!rows[0]) throw new HttpError(404, 'Tag not found');
          res.json(rows[0]);
        } catch (err) {
          if (isUniqueViolation(err)) throw new HttpError(409, 'A tag with that name already exists');
          throw err;
        }
      })
    );

    app.delete(
      '/api/tags/:id',
      route('delete tag', async (req, res) => {
        const id = z.string().uuid().safeParse(req.params.id);
        if (!id.success) throw new HttpError(400, 'Invalid id');
        const { rows } = await appkit.lakebase.query(
          'DELETE FROM chromanote.tags WHERE id = $1 AND user_id = $2 RETURNING id',
          [id.data, getUserId(req)]
        );
        if (!rows[0]) throw new HttpError(404, 'Tag not found');
        res.status(204).send();
      })
    );
  });
}
