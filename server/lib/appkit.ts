import type { Application, Request, Response } from 'express';

export interface AppKitInstance {
  lakebase: {
    query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  };
  server: {
    extend(fn: (app: Application) => void): void;
  };
  files(volume: string): {
    upload(filePath: string, contents: Buffer, options?: { overwrite?: boolean }): Promise<void>;
  };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

/**
 * Identifies the requesting user. Databricks Apps injects the forwarded
 * identity headers; locally we fall back to DEV_USER so the app runs without
 * the Apps proxy.
 */
export function getUserId(req: Request): string {
  const header = req.header('x-forwarded-email') ?? req.header('x-forwarded-user');
  if (header) return header;
  if (process.env.NODE_ENV === 'development') return process.env.DEV_USER ?? 'local-dev';
  throw new HttpError(401, 'Missing user identity');
}

type Handler = (req: Request, res: Response) => Promise<void>;

/** Wraps an async route so thrown errors become JSON responses. */
export function route(label: string, fn: Handler): Handler {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error(`Failed to ${label}:`, err);
      if (!res.headersSent) res.status(500).json({ error: `Failed to ${label}` });
    }
  };
}
