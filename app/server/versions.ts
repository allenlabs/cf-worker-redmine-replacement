import { createServerFn } from '@tanstack/react-start';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { issueStatuses, issues, versions } from '~/db/schema';
import { getDb, requirePermission } from './auth';

export const listVersions = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ projectId: z.number() }).parse(d))
  .handler(async ({ data }) => {
    const db = getDb();
    const rows = await db.query.versions.findMany({
      where: eq(versions.projectId, data.projectId),
      orderBy: versions.dueDate,
    });
    const issueRows = await db
      .select({
        fixedVersionId: issues.fixedVersionId,
        statusIsClosed: issueStatuses.isClosed,
      })
      .from(issues)
      .innerJoin(issueStatuses, eq(issueStatuses.id, issues.statusId))
      .where(eq(issues.projectId, data.projectId));

    return rows.map((v) => {
      const inVersion = issueRows.filter((r) => r.fixedVersionId === v.id);
      const total = inVersion.length;
      const closed = inVersion.filter((r) => r.statusIsClosed).length;
      const pct = total === 0 ? 0 : Math.round((closed / total) * 100);
      return { ...v, totalIssues: total, closedIssues: closed, percent: pct };
    });
  });

export const createVersion = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        projectId: z.number(),
        name: z.string().min(1).max(255),
        description: z.string().optional().default(''),
        dueDate: z.string().nullable().optional(),
        sharing: z
          .enum(['none', 'descendants', 'hierarchy', 'tree', 'system'])
          .optional()
          .default('none'),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requirePermission(data.projectId, 'manage_versions');
    const db = getDb();
    const [v] = await db
      .insert(versions)
      .values({
        projectId: data.projectId,
        name: data.name,
        description: data.description,
        dueDate: data.dueDate ?? null,
        sharing: data.sharing,
      })
      .returning();
    return v;
  });

export const updateVersion = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        id: z.number(),
        projectId: z.number(),
        name: z.string(),
        description: z.string(),
        dueDate: z.string().nullable(),
        status: z.enum(['open', 'locked', 'closed']),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requirePermission(data.projectId, 'manage_versions');
    const db = getDb();
    await db
      .update(versions)
      .set({
        name: data.name,
        description: data.description,
        dueDate: data.dueDate,
        status: data.status,
      })
      .where(eq(versions.id, data.id));
    return { ok: true };
  });

export const deleteVersion = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ id: z.number(), projectId: z.number() }).parse(d))
  .handler(async ({ data }) => {
    await requirePermission(data.projectId, 'manage_versions');
    const db = getDb();
    await db.delete(versions).where(eq(versions.id, data.id));
    return { ok: true };
  });
