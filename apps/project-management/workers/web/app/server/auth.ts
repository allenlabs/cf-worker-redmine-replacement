import { eq } from 'drizzle-orm';
import { type DB } from '~/db/client';
import { members, roles, users } from '~/db/schema';
import type { Env } from '~/lib/env';
import {
  type AuthContext,
  type Permission,
  ForbiddenError,
  UnauthorizedError,
  hasPermission,
} from '~/lib/permissions';
import {
  readSessionToken,
  verifySessionToken,
  type SessionPayload,
} from './session';

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

/**
 * Resolve the local users row for the holder of the given session cookie.
 * Returns null when the cookie is missing/expired/invalid, when the JWT
 * doesn't map to any local row yet (first-time SSO sign-in hasn't gone
 * through /auth/callback yet), or when the row is locked.
 */
export async function userFromSessionImpl(
  db: DB,
  env: Env,
  cookie: string | null,
): Promise<CurrentUser | null> {
  const token = readSessionToken(cookie);
  if (!token) return null;
  const payload = await verifySessionToken(env, token);
  if (!payload) return null;
  const row = await db.query.users.findFirst({
    where: eq(users.betterAuthUserId, payload.sub),
  });
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

/**
 * Find or create the local users row for a freshly-authenticated SSO user.
 * Called once at /auth/callback after the JWT has been verified.
 *
 * Lookup order:
 *   1. better_auth_user_id == payload.sub   (returning user)
 *   2. email == payload.email                (existing local user migrating
 *                                              from password / GitHub OAuth;
 *                                              we backfill the link)
 *   3. neither matches → INSERT new row     (truly new user; first-ever
 *                                              user gets admin=1 as the
 *                                              instance bootstrap)
 */
export async function findOrCreateUserBySsoImpl(
  db: DB,
  payload: SessionPayload,
): Promise<CurrentUser> {
  const email = payload.email?.toLowerCase().trim();

  // 1. Direct link by better_auth_user_id.  Cold-start connection-level
  // retries are handled centrally in `~/db/client` (the postgres.js client
  // is proxied to retry once on connection-shaped errors).
  const linked = await db.query.users.findFirst({
    where: eq(users.betterAuthUserId, payload.sub),
  });
  if (linked) return toCurrentUser(linked);

  // 2. Existing user matched by email — backfill the link.
  if (email) {
    const byEmail = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (byEmail) {
      await db
        .update(users)
        .set({ betterAuthUserId: payload.sub, lastLoginAt: new Date() })
        .where(eq(users.id, byEmail.id));
      /* v8 ignore next 2 */
      const refreshed =
        (await db.query.users.findFirst({ where: eq(users.id, byEmail.id) })) ?? byEmail;
      return toCurrentUser(refreshed);
    }
  }

  // 3. Brand-new user — derive login from email local-part, dedupe with a
  // numeric suffix if needed.  First user becomes the instance admin.
  if (!email) {
    throw new Error('Cannot create user without an email claim in the JWT.');
  }
  const baseLogin = email.split('@')[0]?.replace(/[^a-z0-9._-]+/gi, '') || 'user';
  const login = await pickAvailableLogin(db, baseLogin);
  const count = await db.select({ id: users.id }).from(users).limit(1);
  const isFirstUser = count.length === 0;
  const [name1 = '', ...nameRest] = (payload.name ?? '').trim().split(/\s+/);
  const [created] = await db
    .insert(users)
    .values({
      login,
      email,
      firstname: name1,
      lastname: nameRest.join(' '),
      betterAuthUserId: payload.sub,
      admin: isFirstUser,
      status: 'active',
      lastLoginAt: new Date(),
    })
    .returning();
  /* v8 ignore next */
  if (!created) throw new Error('Failed to insert new user.');
  return toCurrentUser(created);
}

async function pickAvailableLogin(db: DB, base: string): Promise<string> {
  for (let i = 0; i < 32; i++) {
    const candidate = i === 0 ? base : `${base}${i}`;
    const clash = await db.query.users.findFirst({ where: eq(users.login, candidate) });
    if (!clash) return candidate;
  }
  // Astronomically unlikely; bail with a timestamp suffix.
  /* v8 ignore next */
  return `${base}${Date.now()}`;
}

function toCurrentUser(row: typeof users.$inferSelect): CurrentUser {
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
// `requirePermission`, …) live in a sibling module: `./auth-runtime.server`.
// Importing them from there directly keeps this file free of SSR runtime
// imports, so it can be loaded from the wrangler integration test worker.
