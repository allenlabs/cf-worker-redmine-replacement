import { beforeEach, describe, expect, it } from 'vitest';
import { type TestDB, addManager, insertProject, insertUser, makeTestDb } from '../_setup/db';
import { makeTestEnv } from '../_setup/env';
import { ForbiddenError, UnauthorizedError } from '~/lib/permissions';
import {
  buildAuthContextImpl,
  checkPermission,
  userFromSessionImpl,
} from '~/server/auth';
import { cookieHeader, createSessionToken, revokeSession } from '~/server/session';

let db: TestDB;

beforeEach(() => {
  db = makeTestDb();
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
    const cookie = cookieHeader('not-a-real-jwt');
    expect(await userFromSessionImpl(db, env, cookie)).toBeNull();
  });

  it('returns the user for a valid session', async () => {
    const u = await insertUser(db);
    const env = makeTestEnv();
    const token = await createSessionToken(env, { sub: String(u.id), login: u.login, admin: false });
    const cookie = cookieHeader(token);
    const me = await userFromSessionImpl(db, env, cookie);
    expect(me).not.toBeNull();
    expect(me!.id).toBe(u.id);
    expect(me!.login).toBe(u.login);
  });

  it('returns null when session was revoked', async () => {
    const u = await insertUser(db);
    const env = makeTestEnv();
    const token = await createSessionToken(env, { sub: String(u.id), login: u.login, admin: false });
    await revokeSession(env, token);
    const cookie = cookieHeader(token);
    expect(await userFromSessionImpl(db, env, cookie)).toBeNull();
  });

  it('returns null when the user is locked', async () => {
    const u = await insertUser(db, { status: 'locked' });
    const env = makeTestEnv();
    const token = await createSessionToken(env, { sub: String(u.id), login: u.login, admin: false });
    expect(await userFromSessionImpl(db, env, cookieHeader(token))).toBeNull();
  });

  it('returns null when payload points to a deleted user', async () => {
    const env = makeTestEnv();
    const token = await createSessionToken(env, { sub: '9999', login: 'ghost', admin: false });
    expect(await userFromSessionImpl(db, env, cookieHeader(token))).toBeNull();
  });
});
