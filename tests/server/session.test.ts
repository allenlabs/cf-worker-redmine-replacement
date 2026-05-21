import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestEnv } from '../_setup/env';
import {
  SESSION_COOKIE,
  clearCookieHeader,
  cookieHeader,
  createSessionToken,
  readSessionToken,
  revokeSession,
  verifySessionToken,
} from '~/server/session';

describe('createSessionToken / verifySessionToken', () => {
  it('round-trips a session payload', async () => {
    const env = makeTestEnv();
    const token = await createSessionToken(env, { sub: '42', login: 'alice', admin: false });
    const payload = await verifySessionToken(env, token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('42');
    expect(payload!.login).toBe('alice');
    expect(payload!.admin).toBe(false);
    expect(typeof payload!.iat).toBe('number');
    expect(typeof payload!.exp).toBe('number');
  });

  it('rejects a tampered token', async () => {
    const env = makeTestEnv();
    const token = await createSessionToken(env, { sub: '1', login: 'a', admin: false });
    const munged = token.slice(0, -2) + 'XX';
    expect(await verifySessionToken(env, munged)).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const env1 = makeTestEnv({ JWT_SECRET: 'a-long-and-different-secret-1111111111111' });
    const env2 = makeTestEnv({ JWT_SECRET: 'a-long-and-different-secret-2222222222222' });
    const token = await createSessionToken(env1, { sub: '1', login: 'a', admin: false });
    expect(await verifySessionToken(env2, token)).toBeNull();
  });

  it('throws when JWT_SECRET is not configured', async () => {
    const env = makeTestEnv({ JWT_SECRET: '' });
    await expect(createSessionToken(env, { sub: '1', login: 'a', admin: false })).rejects.toThrow(
      /JWT_SECRET/,
    );
  });
});

describe('revokeSession', () => {
  it('causes a token to be rejected', async () => {
    const env = makeTestEnv();
    const token = await createSessionToken(env, { sub: '1', login: 'a', admin: false });
    expect(await verifySessionToken(env, token)).not.toBeNull();
    await revokeSession(env, token);
    expect(await verifySessionToken(env, token)).toBeNull();
  });
});

describe('cookie helpers', () => {
  it('cookieHeader sets HttpOnly, Secure, SameSite=Lax and Max-Age', () => {
    const h = cookieHeader('abc');
    expect(h.startsWith(`${SESSION_COOKIE}=abc;`)).toBe(true);
    expect(h).toContain('HttpOnly');
    expect(h).toContain('Secure');
    expect(h).toContain('SameSite=Lax');
    expect(h).toMatch(/Max-Age=\d+/);
  });

  it('cookieHeader respects custom maxAgeDays', () => {
    const h = cookieHeader('abc', 1);
    expect(h).toContain('Max-Age=86400');
  });

  it('clearCookieHeader uses Max-Age=0', () => {
    expect(clearCookieHeader()).toContain('Max-Age=0');
  });

  it('readSessionToken extracts the cookie from a header string', () => {
    expect(readSessionToken(`a=1; ${SESSION_COOKIE}=tok.value; other=x`)).toBe('tok.value');
  });

  it('readSessionToken returns null for missing cookie or null header', () => {
    expect(readSessionToken(null)).toBe(null);
    expect(readSessionToken('foo=bar')).toBe(null);
  });

  it('readSessionToken handles tokens containing "=" (base64 padding)', () => {
    expect(readSessionToken(`${SESSION_COOKIE}=abc==`)).toBe('abc==');
  });
});
