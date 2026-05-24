import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Env } from '~/lib/env';

/**
 * Session handling — verbatim port of focus / inbox session.server.ts with
 * the cookie name changed to `context_session`.
 *
 * Sign-in happens on auth.allen.company.  Context never sees the user's
 * password.  After /auth/callback exchanges the SSO code for an RS256 JWT,
 * we store the JWT in `context_session` and verify it via JWKS on every
 * request.  Cookie lifetime is bounded by the JWT's exp (1h); expiry
 * triggers a silent password-less round-trip through auth.allen.company.
 */

export const SESSION_COOKIE = 'context_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60; // 1h — matches auth-api JWT expiry.

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE_SECONDS,
};

export interface SessionPayload extends JWTPayload {
  sub: string;       // Better Auth user id (UUID string)
  email?: string;
  name?: string | null;
  role?: string | null;
  banned?: boolean | number | null;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(env: Env): ReturnType<typeof createRemoteJWKSet> {
  const base = env.AUTH_API_URL;
  if (!base) {
    throw new Error('AUTH_API_URL is not configured.');
  }
  const url = `${base.replace(/\/$/, '')}/.well-known/jwks.json`;
  let jwks = jwksCache.get(url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, jwks);
  }
  return jwks;
}

export async function verifySessionToken(
  env: Env,
  token: string,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    if (await isRevoked(env, token)) return null;
    const jwks = getJwks(env);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: env.AUTH_API_URL,
      audience: env.AUTH_API_URL,
    });
    /* v8 ignore next — auth-api always signs JWTs with a string `sub`;
       the guard exists so a misbehaving issuer can't trick us into
       returning a partial SessionPayload. */
    if (typeof payload.sub !== 'string') return null;
    return payload as SessionPayload;
  } catch (err) {
    /* v8 ignore next — `err instanceof Error` is almost always true in
       practice; the String(err) fallback only fires when something
       throws a non-Error (string, plain object), which JWKS / jose
       never do. */
    console.error(
      '[verifySessionToken] failed:',
      err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    );
    return null;
  }
}

export function cookieHeader(token: string, maxAge = SESSION_MAX_AGE_SECONDS): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearCookieHeader(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function readSessionToken(cookieString: string | null): string | null {
  if (!cookieString) return null;
  for (const part of cookieString.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === SESSION_COOKIE) return rest.join('=');
  }
  return null;
}

export async function revokeSession(env: Env, token: string): Promise<void> {
  const key = await tokenKey(token);
  await env.SESSION_KV.put(key, '1', { expirationTtl: SESSION_MAX_AGE_SECONDS });
}

async function isRevoked(env: Env, token: string): Promise<boolean> {
  const key = await tokenKey(token);
  return (await env.SESSION_KV.get(key)) !== null;
}

async function tokenKey(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const arr = new Uint8Array(digest);
  let hex = '';
  for (const b of arr) hex += b.toString(16).padStart(2, '0');
  return `revoked:${hex}`;
}

export function _setJwksForTests(
  authApiUrl: string,
  jwks: ReturnType<typeof createRemoteJWKSet>,
): void {
  const url = `${authApiUrl.replace(/\/$/, '')}/.well-known/jwks.json`;
  jwksCache.set(url, jwks);
}

export function _clearJwksCacheForTests(): void {
  jwksCache.clear();
}
