import { eq } from 'drizzle-orm';
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

export interface CurrentUser {
  id: number;
  login: string;
  email: string;
  firstname: string;
  lastname: string;
  isAdmin: boolean;
  avatarUrl: string | null;
}

// ---------- testable impls ----------

export async function buildAuthContextImpl(db: DB, userId: number): Promise<AuthContext> {
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

export async function userFromSessionImpl(
  db: DB,
  env: Env,
  cookie: string | null,
): Promise<CurrentUser | null> {
  const token = readSessionToken(cookie);
  if (!token) return null;
  const payload = await verifySessionToken(env, token);
  if (!payload) return null;
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

export function checkPermission(
  ctx: AuthContext,
  projectId: number,
  permission: Permission,
): void {
  if (!hasPermission(ctx, projectId, permission)) throw new ForbiddenError();
}

// The TanStack Start–aware runtime helpers (`getEnv`, `getCurrentUser`,
// `requirePermission`, …) live in a sibling module: `./auth-runtime`.
// Importing them from there directly keeps this file free of SSR runtime
// imports, so it can be loaded from the wrangler integration test worker.
