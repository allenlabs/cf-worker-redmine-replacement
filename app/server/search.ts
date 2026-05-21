import { createServerFn } from '@tanstack/react-start';
import { and, eq, like, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { issues, projects, wikiPages, wikiRevisions, wikis } from '~/db/schema';
import {
  buildAuthContext,
  getCurrentUser,
  getDb,
} from './auth';

export const search = createServerFn({ method: 'GET' })
  .validator((d: unknown) =>
    z.object({ q: z.string().min(1), projectId: z.number().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const me = await getCurrentUser();
    const visibleProjectIds = await visibleProjects(me?.id, me?.isAdmin ?? false);

    const pattern = `%${data.q}%`;
    const issueConds = [
      or(like(issues.subject, pattern), like(issues.description, pattern)),
    ];
    if (data.projectId) issueConds.push(eq(issues.projectId, data.projectId));
    issueConds.push(sql`${issues.projectId} IN (${sql.join(
      visibleProjectIds.map((id) => sql`${id}`),
      sql`, `,
    )})`);

    const issueRows = visibleProjectIds.length
      ? await db
          .select({
            kind: sql<string>`'issue'`,
            id: issues.id,
            projectId: issues.projectId,
            title: issues.subject,
            snippet: issues.description,
            updatedAt: issues.updatedAt,
          })
          .from(issues)
          .where(and(...issueConds))
          .limit(50)
      : [];

    const wikiConds = [
      or(like(wikiPages.title, pattern), like(wikiRevisions.text, pattern)),
    ];
    if (data.projectId) wikiConds.push(eq(wikis.projectId, data.projectId));
    if (visibleProjectIds.length) {
      wikiConds.push(sql`${wikis.projectId} IN (${sql.join(
        visibleProjectIds.map((id) => sql`${id}`),
        sql`, `,
      )})`);
    }

    const wikiRows = visibleProjectIds.length
      ? await db
          .select({
            kind: sql<string>`'wiki'`,
            id: wikiPages.id,
            projectId: wikis.projectId,
            title: wikiPages.title,
            snippet: wikiRevisions.text,
            updatedAt: wikiPages.updatedAt,
          })
          .from(wikiPages)
          .innerJoin(wikis, eq(wikis.id, wikiPages.wikiId))
          .leftJoin(wikiRevisions, eq(wikiRevisions.id, wikiPages.currentRevisionId))
          .where(and(...wikiConds))
          .limit(50)
      : [];

    return { issues: issueRows, wikis: wikiRows };
  });

async function visibleProjects(userId: number | undefined, isAdmin: boolean): Promise<number[]> {
  const db = getDb();
  if (isAdmin) {
    const all = await db.select({ id: projects.id }).from(projects);
    return all.map((p) => p.id);
  }
  const pub = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.isPublic, true), eq(projects.status, 'active')));
  if (!userId) return pub.map((p) => p.id);
  const ctx = await buildAuthContext(userId);
  const set = new Set(pub.map((p) => p.id));
  for (const id of Object.keys(ctx.permissionsByProject)) set.add(Number(id));
  return Array.from(set);
}
