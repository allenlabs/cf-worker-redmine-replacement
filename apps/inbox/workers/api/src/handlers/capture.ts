import { Hono } from 'hono';
import { z } from 'zod';
import { captureImpl, captureSchema } from '../../../web/app/server/inbox';
import type { AppBindings } from '../context';

// POST /v1/capture
//
// Verified by the HMAC middleware; reads the validated payload from
// c.var.rawBody (already consumed by the middleware), parses against the
// shared captureSchema, and writes to `inbox.items` under the api_clients
// row's `user_id`.

export const captureRouter = new Hono<AppBindings>();

captureRouter.post('/', async (c) => {
  const raw = c.get('rawBody');
  const client = c.get('apiClient');
  const db = c.get('db');

  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    return c.json({ error: 'invalid JSON' }, 400);
  }

  const result = captureSchema.safeParse(parsed);
  if (!result.success) {
    return c.json(
      { error: 'validation', issues: z.treeifyError(result.error) },
      422,
    );
  }

  const created = await captureImpl(db, client.userId, {
    ...result.data,
    source: result.data.source ?? client.clientId,
  });
  return c.json({ id: created.id, capturedAt: created.capturedAt }, 201);
});
