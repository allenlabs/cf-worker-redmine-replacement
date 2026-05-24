import { createFileRoute } from '@tanstack/react-router';
import { captureImpl, captureSchema } from '~/server/inbox';
import { findUserBySsoImpl } from '~/server/users';
import { getDb, getEnv } from '~/server/auth-runtime.server';
import { readSessionToken, verifySessionToken } from '~/server/session.server';

/**
 * POST /api/capture
 *
 * Cookie-authenticated capture endpoint used by the in-browser extension's
 * background page and the mobile PWA's offline queue drain.  HMAC traffic
 * (CLI, third-party automation) goes to inbox-api.allen.company instead;
 * the impl is shared.
 */
export const Route = createFileRoute('/api/capture')({
  server: {
    handlers: {
      /* v8 ignore start — exercised by deploy smoke tests; impl coverage
         lives in tests/server/inbox.test.ts. */
      POST: async ({ request }) => {
        const env = getEnv();
        const cookie = request.headers.get('cookie');
        const token = readSessionToken(cookie);
        if (!token) return new Response('Unauthorized', { status: 401 });
        const payload = await verifySessionToken(env, token);
        if (!payload?.sub) return new Response('Unauthorized', { status: 401 });
        const db = getDb(env);
        const me = await findUserBySsoImpl(db, payload.sub);
        if (!me) return new Response('Unauthorized', { status: 401 });

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response('Invalid JSON', { status: 400 });
        }
        const parsed = captureSchema.safeParse(body);
        if (!parsed.success) {
          return new Response(
            JSON.stringify({ error: 'validation', issues: parsed.error.issues }),
            { status: 422, headers: { 'content-type': 'application/json' } },
          );
        }
        const created = await captureImpl(db, me.id, {
          ...parsed.data,
          source: parsed.data.source ?? 'web',
        });
        return new Response(JSON.stringify({ id: created.id }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      },
      /* v8 ignore stop */
    },
  },
});
