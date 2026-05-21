import { createServerFn } from '@tanstack/react-start';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { issueCategories } from '~/db/schema';
import { getDb, requirePermission } from './auth';

export const listCategories = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ projectId: z.number() }).parse(d))
  .handler(async ({ data }) => {
    const db = getDb();
    return db.query.issueCategories.findMany({
      where: eq(issueCategories.projectId, data.projectId),
      orderBy: issueCategories.name,
    });
  });

export const createCategory = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        projectId: z.number(),
        name: z.string().min(1).max(255),
        assignedToId: z.number().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requirePermission(data.projectId, 'manage_categories');
    const db = getDb();
    const [c] = await db
      .insert(issueCategories)
      .values({
        projectId: data.projectId,
        name: data.name,
        assignedToId: data.assignedToId ?? null,
      })
      .returning();
    return c;
  });

export const deleteCategory = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ id: z.number(), projectId: z.number() }).parse(d))
  .handler(async ({ data }) => {
    await requirePermission(data.projectId, 'manage_categories');
    const db = getDb();
    await db.delete(issueCategories).where(eq(issueCategories.id, data.id));
    return { ok: true };
  });
