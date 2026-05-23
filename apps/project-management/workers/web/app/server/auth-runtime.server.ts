// TanStack Start–aware helpers.  Split from `auth.ts` so that the testable
// `*Impl` functions can be imported without dragging in the SSR runtime.
//
// Coverage for this file comes from the wrangler integration tests in
// tests/workers/ (they exercise the same code paths via real HTTP requests).
/* v8 ignore start */
import { getRequest } from '@tanstack/react-start/server';
import { type DB, makeDb } from '~/db/client';
import type { Env } from '~/lib/env';
import {
  type AuthContext,
  type Permission,
  ForbiddenError,
  UnauthorizedError,
} from '~/lib/permissions';
import {
  buildAuthContextImpl,
  checkPermission,
  type CurrentUser,
  userFromSessionImpl,
} from './auth';

export function getEnv(): Env {
  const req = getRequest();
  const env: Env | undefined =
    (req as { cf?: { env?: Env } } | undefined)?.cf?.env ??
    (globalThis as { __env__?: Env }).__env__;
  if (!env) {
    throw new Error('Cloudflare env is not available.  Are you running under wrangler/vinxi-dev?');
  }
  return env;
}

export function getDb(env: Env = getEnv()): DB {
  return makeDb(env);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const env = getEnv();
  const req = getRequest();
  const cookie = req?.headers.get('cookie') ?? null;
  return userFromSessionImpl(getDb(env), env, cookie);
}

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new UnauthorizedError();
  return u;
}

export async function buildAuthContext(userId: number): Promise<AuthContext> {
  return buildAuthContextImpl(getDb(), userId);
}

export async function requirePermission(
  projectId: number,
  permission: Permission,
): Promise<{ user: CurrentUser; ctx: AuthContext }> {
  const user = await requireUser();
  const ctx = await buildAuthContext(user.id);
  checkPermission(ctx, projectId, permission);
  return { user, ctx };
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isAdmin) throw new ForbiddenError('Admin only');
  return user;
}

/* v8 ignore stop */
