import { createHash, randomUUID } from 'node:crypto';
import express from 'express';
import { type AppKitInstance, HttpError, getUserId, route } from '../lib/appkit';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/**
 * Uploads go through this route (not the files plugin's /upload) so the server
 * chooses the path: a per-user folder plus a random name. Images are served
 * back via the files plugin's /api/files/files/raw route.
 */
export function registerImageRoutes(appkit: AppKitInstance) {
  appkit.server.extend((app) => {
    app.post(
      '/api/images',
      express.raw({ type: Object.keys(EXTENSIONS), limit: MAX_IMAGE_BYTES }),
      route('upload image', async (req, res) => {
        const userId = getUserId(req);
        const ext = EXTENSIONS[(req.header('content-type') ?? '').split(';')[0].trim()];
        if (!ext) throw new HttpError(415, 'Only PNG, JPEG, GIF, WebP and AVIF images are supported');
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, 'Empty upload');

        const folder = createHash('sha256').update(userId).digest('hex').slice(0, 16);
        const path = `${folder}/${randomUUID()}.${ext}`;
        await appkit.files('files').upload(path, req.body);
        res.status(201).json({ url: `/api/files/files/raw?path=${encodeURIComponent(path)}` });
      })
    );
  });
}
