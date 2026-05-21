import { createServerFn } from '@tanstack/react-start';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { type DB } from '~/db/client';
import { members, projects, roles, users } from '~/db/schema';
import { getDb, requirePermission, requireUser } from './auth-runtime.server';

export async function listMembersImpl(db: DB, projectId: number) {
  return db
    .select({
      id: members.id,
      userId: users.id,
      login: users.login,
      firstname: users.firstname,
      lastname: users.lastname,
      email: users.email,
      avatarUrl: users.avatarUrl,
      roleId: roles.id,
      roleName: roles.name,
      createdAt: members.createdAt,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .innerJoin(roles, eq(roles.id, members.roleId))
    .where(eq(members.projectId, projectId))
    .orderBy(users.login);
}

export async function listAllUsersImpl(db: DB) {
  return db
    .select({
      id: users.id,
      login: users.login,
      firstname: users.firstname,
      lastname: users.lastname,
      email: users.email,
    })
    .from(users)
    .where(eq(users.status, 'active'))
    .orderBy(users.login);
}

export async function listRolesImpl(db: DB) {
  return db.query.roles.findMany({ orderBy: roles.position });
}

export async function addMemberImpl(
  db: DB,
  data: { projectId: number; userId: number; roleId: number },
): Promise<{ ok: true }> {
  await db.insert(members).values(data).onConflictDoNothing();
  return { ok: true };
}

export async function removeMemberImpl(db: DB, memberId: number): Promise<{ ok: true }> {
  await db.delete(members).where(eq(members.id, memberId));
  return { ok: true };
}

export async function changeMemberRoleImpl(
  db: DB,
  memberId: number,
  roleId: number,
): Promise<{ ok: true }> {
  await db.update(members).set({ roleId }).where(eq(members.id, memberId));
  return { ok: true };
}

// ---------- wrappers ----------
// Exercised by wrangler integration tests in tests/workers/.
/* v8 ignore start */

export const listMembers = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => z.object({ projectId: z.number() }).parse(d))
  .handler(async ({ data }) => listMembersImpl(getDb(), data.projectId));

export const listAllUsers = createServerFn({ method: 'GET' }).handler(async () => {
  await requireUser();
  return listAllUsersImpl(getDb());
});

export const listRoles = createServerFn({ method: 'GET' }).handler(async () => {
  await requireUser();
  return listRolesImpl(getDb());
});

export const addMember = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) =>
    z
      .object({ projectId: z.number(), userId: z.number(), roleId: z.number() })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requirePermission(data.projectId, 'manage_members');
    return addMemberImpl(getDb(), data);
  });

export const removeMember = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => z.object({ memberId: z.number(), projectId: z.number() }).parse(d))
  .handler(async ({ data }) => {
    await requirePermission(data.projectId, 'manage_members');
    return removeMemberImpl(getDb(), data.memberId);
  });

export const changeMemberRole = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) =>
    z
      .object({ memberId: z.number(), projectId: z.number(), roleId: z.number() })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requirePermission(data.projectId, 'manage_members');
    return changeMemberRoleImpl(getDb(), data.memberId, data.roleId);
  });

/* v8 ignore stop */
