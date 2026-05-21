/// <reference types="@cloudflare/vitest-pool-workers" />
import { env, reset, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
// Vite's `?raw` suffix inlines the file contents as a string at build time,
// so the SQL is available inside the Workers runtime (which has no fs).
import migrationSql from '../../drizzle/0001_initial.sql?raw';
import seedSql from '../../drizzle/seed.sql?raw';

function splitSql(sql: string): string[] {
  return sql
    .split(/;\s*\n/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--') && !s.startsWith('PRAGMA'));
}

beforeEach(async () => {
  // Clear all D1/KV/R2 state from any previous test, then re-create schema.
  await reset();
  for (const stmt of splitSql(migrationSql + '\n' + seedSql)) {
    await (env as any).DB.exec(stmt.replace(/\s+/g, ' '));
  }
});

describe('worker smoke', () => {
  it('GET /api/whoami returns null user when no cookie is set', async () => {
    const res = await SELF.fetch('http://x.test/api/whoami');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: unknown };
    expect(body.user).toBeNull();
  });

  it('POST /api/signup creates a user, issues a JWT cookie, and whoami can read it', async () => {
    const signup = await SELF.fetch('http://x.test/api/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'alice', password: 'hunter22' }),
    });
    expect(signup.status).toBe(200);
    const setCookie = signup.headers.get('set-cookie')!;
    expect(setCookie).toContain('cfr_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');

    const me = await SELF.fetch('http://x.test/api/whoami', {
      headers: { cookie: setCookie },
    });
    const body = (await me.json()) as { user: { login: string; isAdmin: boolean } | null };
    expect(body.user?.login).toBe('alice');
    expect(body.user?.isAdmin).toBe(false);
  });

  it('GET /api/sessions/verify accepts a real session and rejects a forged one', async () => {
    const signup = await SELF.fetch('http://x.test/api/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'sessy', password: 'hunter22' }),
    });
    const cookie = signup.headers.get('set-cookie')!;

    const ok = await SELF.fetch('http://x.test/api/sessions/verify', { headers: { cookie } });
    expect(((await ok.json()) as { valid: boolean }).valid).toBe(true);

    const bad = await SELF.fetch('http://x.test/api/sessions/verify', {
      headers: { cookie: 'cfr_session=not-a-real-jwt' },
    });
    expect(((await bad.json()) as { valid: boolean }).valid).toBe(false);

    const none = await SELF.fetch('http://x.test/api/sessions/verify');
    expect(((await none.json()) as { valid: boolean }).valid).toBe(false);
  });

  it('POST /api/password/check verifies stored hashes', async () => {
    await SELF.fetch('http://x.test/api/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'hashy', password: 'hunter22' }),
    });
    const good = await SELF.fetch('http://x.test/api/password/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'hashy', password: 'hunter22' }),
    });
    expect(((await good.json()) as { ok: boolean }).ok).toBe(true);

    const wrong = await SELF.fetch('http://x.test/api/password/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'hashy', password: 'WRONG' }),
    });
    expect(((await wrong.json()) as { ok: boolean }).ok).toBe(false);

    const unknown = await SELF.fetch('http://x.test/api/password/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'ghost', password: 'anything' }),
    });
    expect(((await unknown.json()) as { ok: boolean; reason?: string }).reason).toBe('unknown user');
  });

  it('R2 bindings round-trip bytes', async () => {
    const put = await SELF.fetch('http://x.test/api/r2/put?key=hello.txt', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'hello R2',
    });
    expect(put.status).toBe(200);
    const get = await SELF.fetch('http://x.test/api/r2/get?key=hello.txt');
    expect(await get.text()).toBe('hello R2');
    const miss = await SELF.fetch('http://x.test/api/r2/get?key=nope');
    expect(miss.status).toBe(404);
  });

  it('KV bindings round-trip strings with TTL', async () => {
    await SELF.fetch('http://x.test/api/kv/set?key=k1', { method: 'POST', body: 'v1' });
    const get = await SELF.fetch('http://x.test/api/kv/get?key=k1');
    expect(((await get.json()) as { value: string }).value).toBe('v1');

    const miss = await SELF.fetch('http://x.test/api/kv/get?key=missing');
    expect(((await miss.json()) as { value: string | null }).value).toBeNull();
  });
});
