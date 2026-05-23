import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { type TestDB, addManager, insertProject, insertUser, makeTestDb } from '../_setup/db';
import { members, roles } from '~/db/schema';
import {
  addMemberImpl,
  changeMemberRoleImpl,
  listAllUsersImpl,
  listMembersImpl,
  listRolesImpl,
  removeMemberImpl,
} from '~/server/members';

let db: TestDB;

beforeEach(async () => {
  db = await makeTestDb();
});

describe('member impls', () => {
  it('listRolesImpl returns the three seeded roles ordered by position', async () => {
    const rs = await listRolesImpl(db);
    expect(rs.map((r) => r.name)).toEqual(['Manager', 'Developer', 'Reporter']);
  });

  it('listAllUsersImpl excludes locked users', async () => {
    const a = await insertUser(db, { login: 'a', email: 'a@x' });
    await insertUser(db, { login: 'b', email: 'b@x', status: 'locked' });
    const users = await listAllUsersImpl(db);
    expect(users.map((u) => u.login)).toEqual(['a']);
    expect(users[0]!.id).toBe(a.id);
  });

  it('addMemberImpl is idempotent for the same triple', async () => {
    const u = await insertUser(db);
    const p = await insertProject(db);
    const dev = (await listRolesImpl(db)).find((r) => r.name === 'Developer')!;
    await addMemberImpl(db, { userId: u.id, projectId: p.id, roleId: dev.id });
    await addMemberImpl(db, { userId: u.id, projectId: p.id, roleId: dev.id });
    const rows = await db.query.members.findMany({ where: eq(members.userId, u.id) });
    expect(rows).toHaveLength(1);
  });

  it('listMembersImpl returns join data with role names', async () => {
    const u = await insertUser(db, { login: 'manager' });
    const p = await insertProject(db);
    await addManager(db, u.id, p.id);
    const rows = await listMembersImpl(db, p.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.login).toBe('manager');
    expect(rows[0]!.roleName).toBe('Manager');
  });

  it('changeMemberRoleImpl updates only the target member', async () => {
    const u = await insertUser(db);
    const p = await insertProject(db);
    await addManager(db, u.id, p.id);
    const m = (await listMembersImpl(db, p.id))[0]!;
    const dev = (await listRolesImpl(db)).find((r) => r.name === 'Developer')!;
    await changeMemberRoleImpl(db, m.id, dev.id);
    const updated = await db.query.members.findFirst({ where: eq(members.id, m.id) });
    expect(updated!.roleId).toBe(dev.id);
  });

  it('removeMemberImpl deletes the row', async () => {
    const u = await insertUser(db);
    const p = await insertProject(db);
    await addManager(db, u.id, p.id);
    const m = (await listMembersImpl(db, p.id))[0]!;
    await removeMemberImpl(db, m.id);
    expect(await db.query.members.findFirst({ where: eq(members.id, m.id) })).toBeUndefined();
  });
});
