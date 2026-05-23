import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type TestDB,
  addManager,
  insertProject,
  insertUser,
  makeTestDb,
} from '../_setup/db';
import { makeTestEnv } from '../_setup/env';
import { primeJwks, signTestJwt } from '../_setup/jwt';
import { users } from '~/db/schema';
import { ForbiddenError, UnauthorizedError } from '~/lib/permissions';
import {
  buildAuthContextImpl,
  checkPermission,
  findOrCreateUserBySsoImpl,
  userFromSessionImpl,
} from '~/server/auth';
import { cookieHeader } from '~/server/session';

let db: TestDB;

beforeEach(async () => {
  db = makeTestDb();
  await primeJwks(makeTestEnv());
});

describe('buildAuthContextImpl', () => {
  it('collects permissions across memberships', async () => {
    const u = await insertUser(db);
    const p1 = await insertProject(db, { identifier: 'p1' });
    const p2 = await insertProject(db, { identifier: 'p2' });
    await addManager(db, u.id, p1.id);
    await addManager(db, u.id, p2.id);
    const ctx = await buildAuthContextImpl(db, u.id);
    expect(ctx.userId).toBe(u.id);
    expect(ctx.isAdmin).toBe(false);
    expect(ctx.permissionsByProject[p1.id]?.has('manage_members')).toBe(true);
    expect(ctx.permissionsByProject[p2.id]?.has('view_project')).toBe(true);
  });

  it('marks admins via the user row', async () => {
    const u = await insertUser(db, { admin: true });
    const ctx = await buildAuthContextImpl(db, u.id);
    expect(ctx.isAdmin).toBe(true);
  });

  it('throws Unauthorized when user is missing', async () => {
    await expect(buildAuthContextImpl(db, 9999)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('checkPermission', () => {
  it('passes when permission is present', () => {
    const ctx = {
      userId: 1,
      isAdmin: false,
      permissionsByProject: { 1: new Set(['view_issues' as const]) },
    };
    expect(() => checkPermission(ctx, 1, 'view_issues')).not.toThrow();
  });

  it('throws Forbidden when permission missing', () => {
    const ctx = { userId: 1, isAdmin: false, permissionsByProject: {} };
    expect(() => checkPermission(ctx, 1, 'view_issues')).toThrow(ForbiddenError);
  });
});

describe('userFromSessionImpl', () => {
  it('returns null when cookie missing', async () => {
    expect(await userFromSessionImpl(db, makeTestEnv(), null)).toBeNull();
  });

  it('returns null when cookie present but token invalid', async () => {
    const env = makeTestEnv();
    expect(await userFromSessionImpl(db, env, cookieHeader('not-a-real-jwt'))).toBeNull();
  });

  it('returns the user when JWT.sub matches better_auth_user_id', async () => {
    const u = await insertUser(db, { betterAuthUserId: 'ba-user-1' });
    const env = makeTestEnv();
    const token = await signTestJwt(env, { sub: 'ba-user-1', email: u.email });
    const me = await userFromSessionImpl(db, env, cookieHeader(token));
    expect(me?.id).toBe(u.id);
    expect(me?.login).toBe(u.login);
  });

  it('returns null when JWT.sub has no matching better_auth_user_id', async () => {
    await insertUser(db, { betterAuthUserId: 'ba-user-1' });
    const env = makeTestEnv();
    const token = await signTestJwt(env, { sub: 'unlinked-ba-user' });
    expect(await userFromSessionImpl(db, env, cookieHeader(token))).toBeNull();
  });

  it('returns null when the matched user is locked', async () => {
    await insertUser(db, { betterAuthUserId: 'ba-user-1', status: 'locked' });
    const env = makeTestEnv();
    const token = await signTestJwt(env, { sub: 'ba-user-1' });
    expect(await userFromSessionImpl(db, env, cookieHeader(token))).toBeNull();
  });
});

describe('findOrCreateUserBySsoImpl', () => {
  it('returns the linked user when better_auth_user_id matches', async () => {
    const existing = await insertUser(db, { betterAuthUserId: 'linked-1' });
    const out = await findOrCreateUserBySsoImpl(db, {
      sub: 'linked-1',
      email: 'unused@example.com',
    });
    expect(out.id).toBe(existing.id);
  });

  it('backfills the link onto an existing user matched by email', async () => {
    const existing = await insertUser(db, { email: 'migrating@example.com' });
    const out = await findOrCreateUserBySsoImpl(db, {
      sub: 'fresh-uuid',
      email: 'Migrating@Example.Com',
      name: 'Mig User',
    });
    expect(out.id).toBe(existing.id);
    const refreshed = await db.query.users.findFirst({ where: eq(users.id, existing.id) });
    expect(refreshed?.betterAuthUserId).toBe('fresh-uuid');
  });

  it('creates a brand-new user with admin=true when none exist yet', async () => {
    const out = await findOrCreateUserBySsoImpl(db, {
      sub: 'first-user',
      email: 'first@example.com',
      name: 'First User',
    });
    expect(out.email).toBe('first@example.com');
    expect(out.firstname).toBe('First');
    expect(out.lastname).toBe('User');
    expect(out.isAdmin).toBe(true);
  });

  it('creates a new user (non-admin) when other users already exist', async () => {
    await insertUser(db, { admin: true });
    const out = await findOrCreateUserBySsoImpl(db, {
      sub: 'second-user',
      email: 'second@example.com',
    });
    expect(out.isAdmin).toBe(false);
  });

  it('dedupes the login when the email local-part is already taken', async () => {
    await insertUser(db, { login: 'taken', email: 'someone-else@example.com' });
    const out = await findOrCreateUserBySsoImpl(db, {
      sub: 'sso-uuid',
      email: 'taken@example.com',
    });
    expect(out.login).toBe('taken1');
  });

  it('throws when the JWT has no email claim and the user is brand-new', async () => {
    await expect(
      findOrCreateUserBySsoImpl(db, { sub: 'no-email-uuid' }),
    ).rejects.toThrow(/email/);
  });
});
