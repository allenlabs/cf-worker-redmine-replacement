import { createServerFn } from '@tanstack/react-start';
import { and, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  issueCategories,
  issuePriorities,
  issueStatuses,
  issues,
  journalDetails,
  journals,
  projects,
  trackers,
  users,
  versions,
  watchers,
} from '~/db/schema';
import { logActivity } from './activities';
import {
  buildAuthContext,
  getDb,
  getCurrentUser,
  requirePermission,
  requireUser,
} from './auth';
import { ForbiddenError } from '~/lib/permissions';

const ISSUE_FIELDS = {
  trackerId: 'tracker',
  statusId: 'status',
  priorityId: 'priority',
  assignedToId: 'assigned_to',
  categoryId: 'category',
  fixedVersionId: 'fixed_version',
  parentId: 'parent',
  subject: 'subject',
  description: 'description',
  startDate: 'start_date',
  dueDate: 'due_date',
  estimatedHours: 'estimated_hours',
  doneRatio: 'done_ratio',
  isPrivate: 'is_private',
} as const;

async function ensureProjectAccess(projectId: number, perm: 'view_issues' | 'add_issues' | 'edit_issues' | 'delete_issues' | 'add_issue_notes') {
  const db = getDb();
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) throw new Error('Project not found');
  if (perm === 'view_issues' && project.isPublic) {
    const me = await getCurrentUser();
    if (me) {
      if (me.isAdmin) return;
      const ctx = await buildAuthContext(me.id);
      if (ctx.permissionsByProject[projectId]?.has('view_issues')) return;
    }
    return;
  }
  await requirePermission(projectId, perm);
}

export interface IssueRow {
  id: number;
  subject: string;
  trackerId: number;
  trackerName: string;
  trackerColor: string;
  statusId: number;
  statusName: string;
  statusColor: string;
  statusIsClosed: boolean;
  priorityId: number;
  priorityName: string;
  priorityColor: string;
  assigneeId: number | null;
  assigneeLogin: string | null;
  authorLogin: string;
  doneRatio: number;
  startDate: string | null;
  dueDate: string | null;
  updatedAt: Date;
}

export const listIssues = createServerFn({ method: 'GET' })
  .validator((d: unknown) =>
    z
      .object({
        projectId: z.number(),
        statusFilter: z.enum(['open', 'closed', 'all']).optional().default('open'),
        assignee: z.number().optional(),
        tracker: z.number().optional(),
        sort: z.enum(['updated', 'priority', 'id']).optional().default('updated'),
        q: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await ensureProjectAccess(data.projectId, 'view_issues');
    const db = getDb();
    const assigneeUsers = sql<string>`u_assignee.login`;
    const conditions = [eq(issues.projectId, data.projectId)];
    if (data.statusFilter === 'open') conditions.push(eq(issueStatuses.isClosed, false));
    else if (data.statusFilter === 'closed') conditions.push(eq(issueStatuses.isClosed, true));
    if (data.assignee !== undefined) conditions.push(eq(issues.assignedToId, data.assignee));
    if (data.tracker !== undefined) conditions.push(eq(issues.trackerId, data.tracker));
    if (data.q) {
      const pattern = `%${data.q}%`;
      conditions.push(
        sql`(${issues.subject} LIKE ${pattern} OR ${issues.description} LIKE ${pattern})`,
      );
    }
    const orderClause =
      data.sort === 'priority'
        ? desc(issuePriorities.position)
        : data.sort === 'id'
          ? desc(issues.id)
          : desc(issues.updatedAt);

    const rows = await db
      .select({
        id: issues.id,
        subject: issues.subject,
        trackerId: issues.trackerId,
        trackerName: trackers.name,
        trackerColor: trackers.color,
        statusId: issues.statusId,
        statusName: issueStatuses.name,
        statusColor: issueStatuses.color,
        statusIsClosed: issueStatuses.isClosed,
        priorityId: issues.priorityId,
        priorityName: issuePriorities.name,
        priorityColor: issuePriorities.color,
        assigneeId: issues.assignedToId,
        assigneeLogin: assigneeUsers,
        authorLogin: users.login,
        doneRatio: issues.doneRatio,
        startDate: issues.startDate,
        dueDate: issues.dueDate,
        updatedAt: issues.updatedAt,
      })
      .from(issues)
      .innerJoin(trackers, eq(trackers.id, issues.trackerId))
      .innerJoin(issueStatuses, eq(issueStatuses.id, issues.statusId))
      .innerJoin(issuePriorities, eq(issuePriorities.id, issues.priorityId))
      .innerJoin(users, eq(users.id, issues.authorId))
      .leftJoin(sql`users AS u_assignee`, sql`u_assignee.id = ${issues.assignedToId}`)
      .where(and(...conditions))
      .orderBy(orderClause)
      .limit(200);

    return rows as IssueRow[];
  });

export const getIssue = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ id: z.number() }).parse(d))
  .handler(async ({ data }) => {
    const db = getDb();
    const issue = await db.query.issues.findFirst({ where: eq(issues.id, data.id) });
    if (!issue) throw new Error('Issue not found');
    await ensureProjectAccess(issue.projectId, 'view_issues');

    const [project, tracker, status, priority, author, assignee, category, version, parent, children, journalRows, watcherRows] =
      await Promise.all([
        db.query.projects.findFirst({ where: eq(projects.id, issue.projectId) }),
        db.query.trackers.findFirst({ where: eq(trackers.id, issue.trackerId) }),
        db.query.issueStatuses.findFirst({ where: eq(issueStatuses.id, issue.statusId) }),
        db.query.issuePriorities.findFirst({ where: eq(issuePriorities.id, issue.priorityId) }),
        db.query.users.findFirst({ where: eq(users.id, issue.authorId) }),
        issue.assignedToId
          ? db.query.users.findFirst({ where: eq(users.id, issue.assignedToId) })
          : null,
        issue.categoryId
          ? db.query.issueCategories.findFirst({ where: eq(issueCategories.id, issue.categoryId) })
          : null,
        issue.fixedVersionId
          ? db.query.versions.findFirst({ where: eq(versions.id, issue.fixedVersionId) })
          : null,
        issue.parentId
          ? db.query.issues.findFirst({ where: eq(issues.id, issue.parentId) })
          : null,
        db
          .select({
            id: issues.id,
            subject: issues.subject,
            doneRatio: issues.doneRatio,
            statusName: issueStatuses.name,
            statusIsClosed: issueStatuses.isClosed,
          })
          .from(issues)
          .innerJoin(issueStatuses, eq(issueStatuses.id, issues.statusId))
          .where(eq(issues.parentId, issue.id)),
        db
          .select({
            id: journals.id,
            notes: journals.notes,
            createdAt: journals.createdAt,
            userId: journals.userId,
            userLogin: users.login,
          })
          .from(journals)
          .innerJoin(users, eq(users.id, journals.userId))
          .where(eq(journals.issueId, issue.id))
          .orderBy(journals.createdAt),
        db.select({ userId: watchers.userId }).from(watchers).where(eq(watchers.issueId, issue.id)),
      ]);

    const journalIds = journalRows.map((j) => j.id);
    const details = journalIds.length
      ? await db
          .select()
          .from(journalDetails)
          .where(inArray(journalDetails.journalId, journalIds))
      : [];

    const detailsByJournal = new Map<number, typeof details>();
    for (const d of details) {
      const list = detailsByJournal.get(d.journalId) ?? [];
      list.push(d);
      detailsByJournal.set(d.journalId, list);
    }

    return {
      issue,
      project,
      tracker,
      status,
      priority,
      author,
      assignee,
      category,
      version,
      parent,
      children,
      journals: journalRows.map((j) => ({
        ...j,
        details: detailsByJournal.get(j.id) ?? [],
      })),
      watchers: watcherRows.map((w) => w.userId),
    };
  });

const createSchema = z.object({
  projectId: z.number(),
  trackerId: z.number(),
  subject: z.string().min(1).max(255),
  description: z.string().optional().default(''),
  statusId: z.number().optional(),
  priorityId: z.number().optional(),
  assignedToId: z.number().nullable().optional(),
  categoryId: z.number().nullable().optional(),
  fixedVersionId: z.number().nullable().optional(),
  parentId: z.number().nullable().optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  estimatedHours: z.number().nullable().optional(),
  doneRatio: z.number().int().min(0).max(100).optional().default(0),
});

export const createIssue = createServerFn({ method: 'POST' })
  .validator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data }) => {
    const { user } = await requirePermission(data.projectId, 'add_issues');
    const db = getDb();

    const defaultStatus =
      data.statusId ??
      (await db.query.issueStatuses.findFirst({ where: eq(issueStatuses.isDefault, true) }))?.id;
    const defaultPriority =
      data.priorityId ??
      (await db.query.issuePriorities.findFirst({ where: eq(issuePriorities.isDefault, true) }))
        ?.id;

    if (!defaultStatus || !defaultPriority) {
      throw new Error('Default status or priority is missing — run db seed.');
    }

    const [created] = await db
      .insert(issues)
      .values({
        projectId: data.projectId,
        trackerId: data.trackerId,
        subject: data.subject,
        description: data.description,
        statusId: defaultStatus,
        priorityId: defaultPriority,
        authorId: user.id,
        assignedToId: data.assignedToId ?? null,
        categoryId: data.categoryId ?? null,
        fixedVersionId: data.fixedVersionId ?? null,
        parentId: data.parentId ?? null,
        startDate: data.startDate ?? null,
        dueDate: data.dueDate ?? null,
        estimatedHours: data.estimatedHours ?? null,
        doneRatio: data.doneRatio,
      })
      .returning();

    await logActivity({
      projectId: data.projectId,
      userId: user.id,
      kind: 'issue_created',
      refId: created.id,
      title: `${user.login} opened issue #${created.id}: ${created.subject}`,
    });

    return created;
  });

const updateSchema = z.object({
  id: z.number(),
  notes: z.string().optional().default(''),
  changes: z.record(z.any()).optional().default({}),
});

export const updateIssue = createServerFn({ method: 'POST' })
  .validator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data }) => {
    const db = getDb();
    const current = await db.query.issues.findFirst({ where: eq(issues.id, data.id) });
    if (!current) throw new Error('Issue not found');

    // Updating issue fields requires `edit_issues`; adding only a note requires
    // `add_issue_notes`.
    const hasChanges = Object.keys(data.changes).length > 0;
    const noteOnly = !hasChanges && data.notes.length > 0;
    const { user } = noteOnly
      ? await requirePermission(current.projectId, 'add_issue_notes')
      : await requirePermission(current.projectId, 'edit_issues');

    // Validate which keys we accept.
    const accepted = new Set(Object.keys(ISSUE_FIELDS));
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data.changes)) {
      if (accepted.has(k)) patch[k] = v;
    }

    let updated = current;
    const detailRows: Array<{
      property: string;
      prop_key: string;
      oldValue: string | null;
      newValue: string | null;
    }> = [];

    if (Object.keys(patch).length > 0) {
      const closedStatus = await db.query.issueStatuses.findFirst({
        where: and(eq(issueStatuses.isClosed, true), eq(issueStatuses.isDefault, false)),
      });
      const willClose =
        patch.statusId !== undefined &&
        Number(patch.statusId) === closedStatus?.id;
      const result = await db
        .update(issues)
        .set({
          ...patch,
          updatedAt: new Date(),
          closedAt: willClose ? new Date() : current.closedAt,
        })
        .where(eq(issues.id, data.id))
        .returning();
      updated = result[0]!;

      for (const [k, v] of Object.entries(patch)) {
        const old = (current as Record<string, unknown>)[k];
        if (String(old ?? '') === String(v ?? '')) continue;
        detailRows.push({
          property: 'attr',
          prop_key: ISSUE_FIELDS[k as keyof typeof ISSUE_FIELDS],
          oldValue: old == null ? null : String(old),
          newValue: v == null ? null : String(v),
        });
      }
    }

    if (data.notes.length > 0 || detailRows.length > 0) {
      const [journal] = await db
        .insert(journals)
        .values({ issueId: data.id, userId: user.id, notes: data.notes })
        .returning();
      if (detailRows.length > 0) {
        await db
          .insert(journalDetails)
          .values(detailRows.map((d) => ({ ...d, journalId: journal.id })));
      }
      await logActivity({
        projectId: current.projectId,
        userId: user.id,
        kind: data.notes.length > 0 ? 'comment_added' : 'issue_updated',
        refId: data.id,
        title:
          data.notes.length > 0
            ? `${user.login} commented on #${data.id}: ${current.subject}`
            : `${user.login} updated #${data.id}: ${current.subject}`,
      });
    }

    return updated;
  });

export const watchIssue = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ id: z.number(), watch: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const db = getDb();
    if (data.watch) {
      await db.insert(watchers).values({ issueId: data.id, userId: user.id }).onConflictDoNothing();
    } else {
      await db
        .delete(watchers)
        .where(and(eq(watchers.issueId, data.id), eq(watchers.userId, user.id)));
    }
    return { ok: true };
  });

export const deleteIssue = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ id: z.number() }).parse(d))
  .handler(async ({ data }) => {
    const db = getDb();
    const issue = await db.query.issues.findFirst({ where: eq(issues.id, data.id) });
    if (!issue) throw new Error('Issue not found');
    await requirePermission(issue.projectId, 'delete_issues');
    await db.delete(issues).where(eq(issues.id, data.id));
    return { ok: true };
  });
