import { SignJWT, jwtVerify } from 'jose';
import type { Env } from '~/lib/env';

export const SESSION_COOKIE = 'cfr_session';
const SESSION_DAYS = 14;

export interface SessionPayload {
  sub: string; // user id (as string)
  login: string;
  admin: boolean;
  iat?: number;
  exp?: number;
}

function secretKey(env: Env): Uint8Array {
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.  Run `wrangler secret put JWT_SECRET`.');
  }
  return new TextEncoder().encode(env.JWT_SECRET);
}

export async function createSessionToken(
  env: Env,
  payload: Omit<SessionPayload, 'iat' | 'exp'>,
): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .setIssuer('cf-redmine')
    .sign(secretKey(env));
}

export async function verifySessionToken(
  env: Env,
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(env), { issuer: 'cf-redmine' });
    if (await isRevoked(env, token)) return null;
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export function cookieHeader(token: string, maxAgeDays = SESSION_DAYS): string {
  const maxAge = maxAgeDays * 24 * 60 * 60;
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

// Revoke a JWT before its natural expiration by storing its jti/token-hash in KV.
export async function revokeSession(env: Env, token: string): Promise<void> {
  const key = await tokenKey(token);
  await env.SESSION_KV.put(key, '1', { expirationTtl: SESSION_DAYS * 24 * 60 * 60 });
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
