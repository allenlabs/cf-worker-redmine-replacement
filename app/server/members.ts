import { createServerFn } from '@tanstack/react-start';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { members, projects, roles, users } from '~/db/schema';
import { getDb, requirePermission, requireUser } from './auth';

export const listMembers = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ projectId: z.number() }).parse(d))
  .handler(async ({ data }) => {
    const db = getDb();
    const rows = await db
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
      .where(eq(members.projectId, data.projectId))
      .orderBy(users.login);
    return rows;
  });

export const listAllUsers = createServerFn({ method: 'GET' }).handler(async () => {
  await requireUser();
  const db = getDb();
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
});

export const listRoles = createServerFn({ method: 'GET' }).handler(async () => {
  await requireUser();
  const db = getDb();
  return db.query.roles.findMany({ orderBy: roles.position });
});

export const addMember = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        projectId: z.number(),
        userId: z.number(),
        roleId: z.number(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requirePermission(data.projectId, 'manage_members');
    const db = getDb();
    await db
      .insert(members)
      .values(data)
      .onConflictDoNothing();
    return { ok: true };
  });

export const removeMember = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ memberId: z.number(), projectId: z.number() }).parse(d))
  .handler(async ({ data }) => {
    await requirePermission(data.projectId, 'manage_members');
    const db = getDb();
    await db.delete(members).where(eq(members.id, data.memberId));
    return { ok: true };
  });

export const changeMemberRole = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        memberId: z.number(),
        projectId: z.number(),
        roleId: z.number(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requirePermission(data.projectId, 'manage_members');
    const db = getDb();
    await db.update(members).set({ roleId: data.roleId }).where(eq(members.id, data.memberId));
    return { ok: true };
  });
