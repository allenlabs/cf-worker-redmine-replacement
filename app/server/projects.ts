import { createServerFn } from '@tanstack/react-start';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
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
  users,
  versions,
  wikis,
} from '~/db/schema';
import { slugify } from '~/lib/format';
import { ForbiddenError, UnauthorizedError } from '~/lib/permissions';
import { logActivity } from './activities';
import {
  buildAuthContext,
  getDb,
  getEnv,
  getCurrentUser,
  requirePermission,
  requireUser,
} from './auth';

const DEFAULT_MODULES = ['issue_tracking', 'time_tracking', 'wiki', 'files', 'gantt', 'roadmap'] as const;

export const listProjects = createServerFn({ method: 'GET' }).handler(async () => {
  const db = getDb();
  const me = await getCurrentUser();
  const rows = await db
    .select({
      id: projects.id,
      identifier: projects.identifier,
      name: projects.name,
      description: projects.description,
      isPublic: projects.isPublic,
      parentId: projects.parentId,
      status: projects.status,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .orderBy(projects.name);

  if (!me) {
    return rows.filter((p) => p.isPublic && p.status === 'active');
  }
  if (me.isAdmin) return rows;

  const ctx = await buildAuthContext(me.id);
  return rows.filter(
    (p) => p.isPublic || ctx.permissionsByProject[p.id]?.has('view_project'),
  );
});

export const getProject = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ identifier: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const db = getDb();
    const project = await db.query.projects.findFirst({
      where: eq(projects.identifier, data.identifier),
    });
    if (!project) throw new Error('Project not found');

    const me = await getCurrentUser();
    if (!project.isPublic) {
      if (!me) throw new UnauthorizedError();
      if (!me.isAdmin) {
        const ctx = await buildAuthContext(me.id);
        if (!ctx.permissionsByProject[project.id]?.has('view_project')) {
          throw new ForbiddenError();
        }
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
        .select({ count: issues.id })
        .from(issues)
        .innerJoin(issueStatuses, eq(issues.statusId, issueStatuses.id))
        .where(and(eq(issues.projectId, project.id), eq(issueStatuses.isClosed, false))),
      db
        .select({ count: issues.id })
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
      counts: {
        openIssues: openIssues.length,
        closedIssues: closedIssues.length,
      },
    };
  });

export const createProject = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        identifier: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-z0-9][a-z0-9_-]*$/, 'lowercase letters/numbers/-/_ only'),
        name: z.string().min(1).max(255),
        description: z.string().optional().default(''),
        homepage: z.string().optional().default(''),
        isPublic: z.boolean().optional().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const user = await requireUser();
    const db = getDb();

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

    // Enable all default modules.
    await db
      .insert(enabledModules)
      .values(DEFAULT_MODULES.map((m) => ({ projectId: project.id, name: m })));

    // Enable all default trackers.
    const allTrackers = await db.query.trackers.findMany();
    if (allTrackers.length > 0) {
      await db
        .insert(projectTrackers)
        .values(allTrackers.map((t) => ({ projectId: project.id, trackerId: t.id })));
    }

    // Add creator as Manager.
    const manager = await db.query.roles.findFirst({ where: eq(roles.name, 'Manager') });
    if (manager) {
      await db.insert(members).values({
        userId: user.id,
        projectId: project.id,
        roleId: manager.id,
      });
    }

    // Wiki bootstrap.
    await db.insert(wikis).values({ projectId: project.id });

    await logActivity({
      projectId: project.id,
      userId: user.id,
      kind: 'project_created',
      refId: project.id,
      title: `${user.login} created project ${project.name}`,
    });

    return project;
  });

export const updateProject = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        id: z.number(),
        name: z.string().min(1).max(255),
        description: z.string(),
        homepage: z.string(),
        isPublic: z.boolean(),
        status: z.enum(['active', 'closed', 'archived']),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requirePermission(data.id, 'edit_project');
    const db = getDb();
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
    return updated;
  });

export const deleteProject = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ id: z.number() }).parse(d))
  .handler(async ({ data }) => {
    await requirePermission(data.id, 'delete_project').catch(async () => {
      const u = await requireUser();
      if (!u.isAdmin) throw new ForbiddenError();
    });
    const db = getDb();
    await db.delete(projects).where(eq(projects.id, data.id));
    return { ok: true };
  });

export const suggestIdentifier = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ name: z.string() }).parse(d))
  .handler(async ({ data }) => slugify(data.name));
