// Minimal HTTP worker used only by the wrangler integration tests in
// `tests/workers/`.  It exercises the runtime auth/session/password helpers
// inside a real Workers runtime + Miniflare D1 — proof that those code paths
// work end-to-end (cookies, WebCrypto, JOSE JWT, D1 driver).
//
// The TanStack Start `createServerFn` wrappers are NOT mounted here: doing so
// pulls in the TanStack Start SSR runtime, which Vite can only resolve once
// the @tanstack/start-plugin-core Vite plugin has set up `#tanstack-router-entry`.
// For the integration tests we just need to prove the leaf primitives behave.

import { eq } from 'drizzle-orm';
import { makeDb } from '~/db/client';
import { users } from '~/db/schema';
import type { Env } from '~/lib/env';
import { userFromSessionImpl } from '~/server/auth';
import { hashPassword, verifyPassword } from '~/server/password';
import {
  cookieHeader,
  createSessionToken,
  readSessionToken,
  verifySessionToken,
} from '~/server/session';

const json = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const db = makeDb(env.DB);
    const cookie = req.headers.get('cookie');

    if (url.pathname === '/api/whoami' && req.method === 'GET') {
      const me = await userFromSessionImpl(db, env, cookie);
      return json({ user: me });
    }

    if (url.pathname === '/api/signup' && req.method === 'POST') {
      const { login, password, admin } = (await req.json()) as {
        login: string;
        password: string;
        admin?: boolean;
      };
      const { hash, salt } = await hashPassword(password);
      const [u] = await db
        .insert(users)
        .values({
          login,
          email: `${login}@example.test`,
          passwordHash: hash,
          passwordSalt: salt,
          admin: admin ?? false,
        })
        .returning();
      const token = await createSessionToken(env, {
        sub: String(u.id),
        login: u.login,
        admin: u.admin,
      });
      return json(
        { ok: true, id: u.id },
        { headers: { 'set-cookie': cookieHeader(token) } },
      );
    }

    if (url.pathname === '/api/sessions/verify' && req.method === 'GET') {
      const token = readSessionToken(cookie);
      if (!token) return json({ valid: false });
      const payload = await verifySessionToken(env, token);
      return json({ valid: !!payload, payload });
    }

    if (url.pathname === '/api/password/check' && req.method === 'POST') {
      const { login, password } = (await req.json()) as {
        login: string;
        password: string;
      };
      const row = await db.query.users.findFirst({ where: eq(users.login, login) });
      if (!row) return json({ ok: false, reason: 'unknown user' });
      const ok = await verifyPassword(password, row.passwordHash, row.passwordSalt);
      return json({ ok });
    }

    if (url.pathname === '/api/r2/put' && req.method === 'POST') {
      const key = url.searchParams.get('key')!;
      const data = await req.arrayBuffer();
      await env.FILES.put(key, data, {
        httpMetadata: { contentType: req.headers.get('content-type') ?? 'text/plain' },
      });
      return json({ ok: true, key, size: data.byteLength });
    }

    if (url.pathname === '/api/r2/get' && req.method === 'GET') {
      const key = url.searchParams.get('key')!;
      const obj = await env.FILES.get(key);
      if (!obj) return new Response('Not found', { status: 404 });
      return new Response(await obj.text(), { status: 200 });
    }

    if (url.pathname === '/api/kv/set' && req.method === 'POST') {
      const key = url.searchParams.get('key')!;
      const value = await req.text();
      await env.SESSION_KV.put(key, value, { expirationTtl: 60 });
      return json({ ok: true });
    }

    if (url.pathname === '/api/kv/get' && req.method === 'GET') {
      const key = url.searchParams.get('key')!;
      const value = await env.SESSION_KV.get(key);
      return json({ value });
    }

    return new Response('not found', { status: 404 });
  },
};
