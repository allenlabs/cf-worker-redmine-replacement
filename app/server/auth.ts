import { eq } from 'drizzle-orm';
import { getWebRequest } from '@tanstack/react-start/server';
import { type DB, makeDb } from '~/db/client';
import { members, roles, users } from '~/db/schema';
import type { Env } from '~/lib/env';
import {
  type AuthContext,
  type Permission,
  ForbiddenError,
  UnauthorizedError,
  hasPermission,
} from '~/lib/permissions';
import { readSessionToken, verifySessionToken } from './session';

// TanStack Start exposes the Cloudflare env on the request event for the
// `cloudflare-module` preset.  We grab it via getWebRequest().
export function getEnv(): Env {
  const req = getWebRequest();
  // @ts-expect-error nitro adds cf.env on request
  const env: Env | undefined = req?.cf?.env ?? (globalThis as any).__env__;
  if (!env) {
    throw new Error(
      'Cloudflare env is not available.  Are you running under wrangler/vinxi-dev?',
    );
  }
  return env;
}

export function getDb(env: Env = getEnv()): DB {
  return makeDb(env.DB);
}

export interface CurrentUser {
  id: number;
  login: string;
  email: string;
  firstname: string;
  lastname: string;
  isAdmin: boolean;
  avatarUrl: string | null;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const env = getEnv();
  const req = getWebRequest();
  const cookie = req?.headers.get('cookie') ?? null;
  const token = readSessionToken(cookie);
  if (!token) return null;
  const payload = await verifySessionToken(env, token);
  if (!payload) return null;
  const db = getDb(env);
  const row = await db.query.users.findFirst({ where: eq(users.id, Number(payload.sub)) });
  if (!row || row.status !== 'active') return null;
  return {
    id: row.id,
    login: row.login,
    email: row.email,
    firstname: row.firstname,
    lastname: row.lastname,
    isAdmin: row.admin,
    avatarUrl: row.avatarUrl,
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new UnauthorizedError();
  return u;
}

export async function buildAuthContext(userId: number): Promise<AuthContext> {
  const env = getEnv();
  const db = getDb(env);
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new UnauthorizedError();

  const memberships = await db
    .select({
      projectId: members.projectId,
      permissions: roles.permissions,
    })
    .from(members)
    .innerJoin(roles, eq(members.roleId, roles.id))
    .where(eq(members.userId, userId));

  const permissionsByProject: Record<number, Set<Permission>> = {};
  for (const m of memberships) {
    const existing = permissionsByProject[m.projectId] ?? new Set<Permission>();
    for (const p of m.permissions as Permission[]) existing.add(p);
    permissionsByProject[m.projectId] = existing;
  }
  return { userId, isAdmin: user.admin, permissionsByProject };
}

export async function requirePermission(
  projectId: number,
  permission: Permission,
): Promise<{ user: CurrentUser; ctx: AuthContext }> {
  const user = await requireUser();
  const ctx = await buildAuthContext(user.id);
  if (!hasPermission(ctx, projectId, permission)) throw new ForbiddenError();
  return { user, ctx };
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isAdmin) throw new ForbiddenError('Admin only');
  return user;
}
