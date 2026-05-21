import { createServerFn } from '@tanstack/react-start';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  issues,
  projects,
  timeEntries,
  timeEntryActivities,
  users,
} from '~/db/schema';
import { logActivity } from './activities';
import { getDb, requirePermission, requireUser } from './auth';

export const listActivities = createServerFn({ method: 'GET' }).handler(async () => {
  const db = getDb();
  return db.query.timeEntryActivities.findMany({
    orderBy: timeEntryActivities.position,
  });
});

export const listTimeEntries = createServerFn({ method: 'GET' })
  .validator((d: unknown) =>
    z
      .object({
        projectId: z.number(),
        from: z.string().nullable().optional(),
        to: z.string().nullable().optional(),
        userId: z.number().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requirePermission(data.projectId, 'view_time_entries');
    const db = getDb();
    const conds = [eq(timeEntries.projectId, data.projectId)];
    if (data.from) conds.push(gte(timeEntries.spentOn, data.from));
    if (data.to) conds.push(lte(timeEntries.spentOn, data.to));
    if (data.userId) conds.push(eq(timeEntries.userId, data.userId));

    const rows = await db
      .select({
        id: timeEntries.id,
        hours: timeEntries.hours,
        comments: timeEntries.comments,
        spentOn: timeEntries.spentOn,
        createdAt: timeEntries.createdAt,
        userId: timeEntries.userId,
        userLogin: users.login,
        issueId: timeEntries.issueId,
        issueSubject: issues.subject,
        activityId: timeEntries.activityId,
        activityName: timeEntryActivities.name,
      })
      .from(timeEntries)
      .innerJoin(users, eq(users.id, timeEntries.userId))
      .innerJoin(timeEntryActivities, eq(timeEntryActivities.id, timeEntries.activityId))
      .leftJoin(issues, eq(issues.id, timeEntries.issueId))
      .where(and(...conds))
      .orderBy(desc(timeEntries.spentOn), desc(timeEntries.createdAt));

    const totalRow = await db
      .select({ total: sql<number>`coalesce(sum(${timeEntries.hours}), 0)` })
      .from(timeEntries)
      .where(and(...conds));

    return {
      entries: rows,
      total: Number(totalRow[0]?.total ?? 0),
    };
  });

export const createTimeEntry = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        projectId: z.number(),
        issueId: z.number().nullable().optional(),
        activityId: z.number(),
        hours: z.number().positive(),
        comments: z.string().optional().default(''),
        spentOn: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { user } = await requirePermission(data.projectId, 'log_time');
    const db = getDb();
    const [entry] = await db
      .insert(timeEntries)
      .values({
        projectId: data.projectId,
        issueId: data.issueId ?? null,
        userId: user.id,
        activityId: data.activityId,
        hours: data.hours,
        comments: data.comments,
        spentOn: data.spentOn,
      })
      .returning();
    await logActivity({
      projectId: data.projectId,
      userId: user.id,
      kind: 'time_logged',
      refId: entry.id,
      title: `${user.login} logged ${data.hours}h${data.issueId ? ` on #${data.issueId}` : ''}`,
      body: data.comments,
    });
    return entry;
  });

export const deleteTimeEntry = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ id: z.number(), projectId: z.number() }).parse(d))
  .handler(async ({ data }) => {
    const me = await requireUser();
    const db = getDb();
    const entry = await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, data.id) });
    if (!entry) return { ok: true };
    if (entry.userId !== me.id) {
      await requirePermission(data.projectId, 'edit_time_entries');
    }
    await db.delete(timeEntries).where(eq(timeEntries.id, data.id));
    return { ok: true };
  });
