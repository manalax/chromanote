import { z } from 'zod';
import { type AppKitInstance, HttpError, getUserId, route } from '../lib/appkit';

const Color = z.string().regex(/^(#[0-9a-fA-F]{6}|[a-z]+)$/);

const SettingsBody = z
  .object({
    theme: z.enum(['system', 'light', 'dark']),
    bg_color: Color.nullable(),
    default_font: z.enum(['inter', 'lora', 'mono', 'caveat']),
    default_note_color: Color.nullable(),
    default_text_color: Color.nullable(),
  })
  .partial();

const DEFAULTS = {
  theme: 'system',
  bg_color: null,
  default_font: 'inter',
  default_note_color: null,
  default_text_color: null,
};
const COLUMNS = 'theme, bg_color, default_font, default_note_color, default_text_color';

export function registerSettingsRoutes(appkit: AppKitInstance) {
  appkit.server.extend((app) => {
    app.get(
      '/api/settings',
      route('load settings', async (req, res) => {
        const userId = getUserId(req);
        const { rows } = await appkit.lakebase.query(
          `SELECT ${COLUMNS} FROM chromanote.user_settings WHERE user_id = $1`,
          [userId]
        );
        res.json({ user: userId, ...(rows[0] ?? DEFAULTS) });
      })
    );

    app.put(
      '/api/settings',
      route('save settings', async (req, res) => {
        const userId = getUserId(req);
        const parsed = SettingsBody.safeParse(req.body);
        if (!parsed.success) throw new HttpError(400, 'Invalid settings');
        const s = { ...DEFAULTS, ...parsed.data };
        // Upsert only the provided fields; unspecified fields keep their stored value.
        const provided = Object.keys(parsed.data);
        const updates = provided.map((k) => `${k} = EXCLUDED.${k}`).concat('updated_at = NOW()');
        const { rows } = await appkit.lakebase.query(
          `INSERT INTO chromanote.user_settings (user_id, ${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id) DO UPDATE SET ${updates.join(', ')}
           RETURNING ${COLUMNS}`,
          [userId, s.theme, s.bg_color, s.default_font, s.default_note_color, s.default_text_color]
        );
        res.json({ user: userId, ...rows[0] });
      })
    );
  });
}
