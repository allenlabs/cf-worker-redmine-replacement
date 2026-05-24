import { createServerFn } from '@tanstack/react-start';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { type DB } from '~/db/client';
import {
  enabledModules,
  issueCategories,
  issues,
  issueStatuses,
  members,
  projectTrackers,
  projects,
  roles,
  trackers,
  versions,
  wikis,
} from '~/db/schema';
import { slugify } from '~/lib/format';
import {
  type AuthContext,
  ForbiddenError,
  UnauthorizedError,
} from '~/lib/permissions';
import { logActivityImpl } from './activities';
import { type CurrentUser } from './auth';
import { buildAuthContext, getDb, getCurrentUser, requirePermission, requireUser } from './auth-runtime.server';
import { getRefData } from './ref-data';

const DEFAULT_MODULES = [
  'issue_tracking',
  'time_tracking',
  'wiki',
  'files',
  'gantt',
  'roadmap',
] as const;

export const createProjectSchema = z.object({
  identifier: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, 'lowercase letters/numbers/-/_ only'),
  name: z.string().min(1).max(255),
  description: z.string().optional().default(''),
  homepage: z.string().optional().default(''),
  isPublic: z.boolean().optional().default(false),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  id: z.number(),
  name: z.string().min(1).max(255),
  description: z.string(),
  homepage: z.string(),
  isPublic: z.boolean(),
  status: z.enum(['active', 'closed', 'archived']),
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

// ---------- impls (testable without TanStack Start runtime) ----------

export async function listProjectsImpl(
  db: DB,
  me: CurrentUser | null,
  ctx: AuthContext | null,
): Promise<Array<typeof projects.$inferSelect>> {
  const rows = await db.select().from(projects).orderBy(projects.name);
  if (!me) return rows.filter((p) => p.isPublic && p.status === 'active');
  if (me.isAdmin) return rows;
  return rows.filter(
    (p) => p.isPublic || ctx?.permissionsByProject[p.id]?.has('view_project'),
  );
}

export async function getProjectImpl(
  db: DB,
  me: CurrentUser | null,
  ctx: AuthContext | null,
  identifier: string,
) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.identifier, identifier),
  });
  if (!project) throw new Error('Project not found');
  if (!project.isPublic) {
    if (!me) throw new UnauthorizedError();
    if (!me.isAdmin && !ctx?.permissionsByProject[project.id]?.has('view_project')) {
      throw new ForbiddenError();
    }
  }
  const [trackerRows, modules, vers, cats, openIssues, closedIssues] = await Promise.all([
    db
      .select({ id: trackers.id, name: trackers.name, color: trackers.color })
      .from(projectTrackers)
      .innerJoin(trackers, eq(trackers.id, projectTrackers.trackerId))
      .where(eq(projectTrackers.projectId, project.id)),
    db
      .select({ name: enabledModules.name })
      .from(enabledModules)
      .where(eq(enabledModules.projectId, project.id)),
    db.query.versions.findMany({
      where: eq(versions.projectId, project.id),
      orderBy: versions.dueDate,
    }),
    db.query.issueCategories.findMany({ where: eq(issueCategories.projectId, project.id) }),
    db
      .select({ id: issues.id })
      .from(issues)
      .innerJoin(issueStatuses, eq(issues.statusId, issueStatuses.id))
      .where(and(eq(issues.projectId, project.id), eq(issueStatuses.isClosed, false))),
    db
      .select({ id: issues.id })
      .from(issues)
      .innerJoin(issueStatuses, eq(issues.statusId, issueStatuses.id))
      .where(and(eq(issues.projectId, project.id), eq(issueStatuses.isClosed, true))),
  ]);

  return {
    ...project,
    trackers: trackerRows,
    modules: modules.map((m) => m.name),
    versions: vers,
    categories: cats,
    counts: { openIssues: openIssues.length, closedIssues: closedIssues.length },
  };
}

export async function createProjectImpl(
  db: DB,
  user: CurrentUser,
  data: CreateProjectInput,
): Promise<typeof projects.$inferSelect> {
  const existing = await db.query.projects.findFirst({
    where: eq(projects.identifier, data.identifier),
  });
  if (existing) throw new Error(`Identifier "${data.identifier}" is already used.`);

  const [project] = await db
    .insert(projects)
    .values({
      identifier: data.identifier,
      name: data.name,
      description: data.description,
      homepage: data.homepage,
      isPublic: data.isPublic,
    })
    .returning();
  /* v8 ignore next */
  if (!project) throw new Error(`failed to create project ${data.identifier}`);

  await db
    .insert(enabledModules)
    .values(DEFAULT_MODULES.map((m) => ({ projectId: project.id, name: m })));

  const refData = await getRefData(db);
  if (refData.trackers.length > 0) {
    await db
      .insert(projectTrackers)
      .values(refData.trackers.map((t) => ({ projectId: project.id, trackerId: t.id })));
  }

  const manager = refData.roles.find((r) => r.name === 'Manager');
  if (manager) {
    await db
      .insert(members)
      .values({ userId: user.id, projectId: project.id, roleId: manager.id });
  }

  await db.insert(wikis).values({ projectId: project.id }).onConflictDoNothing();

  await logActivityImpl(db, {
    projectId: project.id,
    userId: user.id,
    kind: 'project_created',
    refId: project.id,
    title: `${user.login} created project ${project.name}`,
  });

  return project;
}

export async function updateProjectImpl(
  db: DB,
  data: UpdateProjectInput,
): Promise<typeof projects.$inferSelect> {
  const [updated] = await db
    .update(projects)
    .set({
      name: data.name,
      description: data.description,
      homepage: data.homepage,
      isPublic: data.isPublic,
      status: data.status,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, data.id))
    .returning();
  if (!updated) throw new Error('Project not found');
  return updated;
}

export async function deleteProjectImpl(db: DB, id: number): Promise<{ ok: true }> {
  await db.delete(projects).where(eq(projects.id, id));
  return { ok: true };
}

// ---------- TanStack Start wrappers ----------
// Exercised by wrangler integration tests in tests/workers/.  Unit tests
// target the *Impl helpers above directly.
/* v8 ignore start */

export const listProjects = createServerFn({ method: 'GET' }).handler(async () => {
  const me = await getCurrentUser();
  const ctx = me ? await buildAuthContext(me.id) : null;
  return listProjectsImpl(getDb(), me, ctx);
});

export const getProject = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => z.object({ identifier: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const me = await getCurrentUser();
    const ctx = me ? await buildAuthContext(me.id) : null;
    return getProjectImpl(getDb(), me, ctx, data.identifier);
  });

export const createProject = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => createProjectSchema.parse(d))
  .handler(async ({ data }) => {
    const user = await requireUser();
    return createProjectImpl(getDb(), user, data);
  });

export const updateProject = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => updateProjectSchema.parse(d))
  .handler(async ({ data }) => {
    await requirePermission(data.id, 'edit_project');
    return updateProjectImpl(getDb(), data);
  });

export const deleteProject = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => z.object({ id: z.number() }).parse(d))
  .handler(async ({ data }) => {
    await requirePermission(data.id, 'delete_project').catch(async () => {
      const u = await requireUser();
      if (!u.isAdmin) throw new ForbiddenError();
    });
    return deleteProjectImpl(getDb(), data.id);
  });

export const suggestIdentifier = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => z.object({ name: z.string() }).parse(d))
  .handler(async ({ data }) => slugify(data.name));

/* v8 ignore stop */
