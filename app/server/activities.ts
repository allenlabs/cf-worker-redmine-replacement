import { desc, eq, and } from 'drizzle-orm';
import { activities, projects, users } from '~/db/schema';
import { getDb, getEnv } from './auth';

type Kind =
  | 'issue_created'
  | 'issue_updated'
  | 'issue_closed'
  | 'comment_added'
  | 'wiki_edited'
  | 'time_logged'
  | 'project_created';

export async function logActivity(input: {
  projectId: number | null;
  userId: number;
  kind: Kind;
  refId?: number | null;
  title: string;
  body?: string;
}): Promise<void> {
  const db = getDb(getEnv());
  await db.insert(activities).values({
    projectId: input.projectId ?? null,
    userId: input.userId,
    kind: input.kind,
    refId: input.refId ?? null,
    title: input.title,
    body: input.body ?? '',
  });
}

export interface ActivityRow {
  id: number;
  kind: Kind;
  title: string;
  body: string;
  createdAt: Date;
  refId: number | null;
  projectId: number | null;
  projectName: string | null;
  userId: number;
  userLogin: string;
}

export async function listActivities(opts: {
  projectId?: number;
  limit?: number;
}): Promise<ActivityRow[]> {
  const db = getDb(getEnv());
  const where = opts.projectId !== undefined ? eq(activities.projectId, opts.projectId) : undefined;
  const rows = await db
    .select({
      id: activities.id,
      kind: activities.kind,
      title: activities.title,
      body: activities.body,
      createdAt: activities.createdAt,
      refId: activities.refId,
      projectId: activities.projectId,
      projectName: projects.name,
      userId: activities.userId,
      userLogin: users.login,
    })
    .from(activities)
    .leftJoin(projects, eq(projects.id, activities.projectId))
    .innerJoin(users, eq(users.id, activities.userId))
    .where(where)
    .orderBy(desc(activities.createdAt))
    .limit(opts.limit ?? 50);
  return rows as ActivityRow[];
}
