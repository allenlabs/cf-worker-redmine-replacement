import { Link, createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { and, desc, eq, sql } from 'drizzle-orm';
import { issuePriorities, issueStatuses, issues, projects, trackers, users, watchers } from '~/db/schema';
import { PriorityBadge, StatusBadge, TrackerBadge } from '~/components/badges';
import { formatDate, timeAgo } from '~/lib/format';
import { getCurrentUser, getDb } from '~/server/auth';
import { listActivities } from '~/server/activities';

const loadMyPage = createServerFn({ method: 'GET' }).handler(async () => {
  const me = await getCurrentUser();
  if (!me) return null;
  const db = getDb();
  const myAssigned = await db
    .select({
      id: issues.id,
      subject: issues.subject,
      projectId: issues.projectId,
      projectIdentifier: projects.identifier,
      projectName: projects.name,
      trackerName: trackers.name,
      trackerColor: trackers.color,
      statusName: issueStatuses.name,
      statusColor: issueStatuses.color,
      statusIsClosed: issueStatuses.isClosed,
      priorityName: issuePriorities.name,
      priorityColor: issuePriorities.color,
      dueDate: issues.dueDate,
      updatedAt: issues.updatedAt,
    })
    .from(issues)
    .innerJoin(projects, eq(projects.id, issues.projectId))
    .innerJoin(trackers, eq(trackers.id, issues.trackerId))
    .innerJoin(issueStatuses, eq(issueStatuses.id, issues.statusId))
    .innerJoin(issuePriorities, eq(issuePriorities.id, issues.priorityId))
    .where(and(eq(issues.assignedToId, me.id), eq(issueStatuses.isClosed, false)))
    .orderBy(desc(issues.updatedAt))
    .limit(50);

  const myReported = await db
    .select({
      id: issues.id,
      subject: issues.subject,
      projectIdentifier: projects.identifier,
      statusName: issueStatuses.name,
      statusColor: issueStatuses.color,
      updatedAt: issues.updatedAt,
    })
    .from(issues)
    .innerJoin(projects, eq(projects.id, issues.projectId))
    .innerJoin(issueStatuses, eq(issueStatuses.id, issues.statusId))
    .where(and(eq(issues.authorId, me.id), eq(issueStatuses.isClosed, false)))
    .orderBy(desc(issues.updatedAt))
    .limit(20);

  const watched = await db
    .select({
      id: issues.id,
      subject: issues.subject,
      projectIdentifier: projects.identifier,
      statusName: issueStatuses.name,
      statusColor: issueStatuses.color,
      updatedAt: issues.updatedAt,
    })
    .from(watchers)
    .innerJoin(issues, eq(issues.id, watchers.issueId))
    .innerJoin(projects, eq(projects.id, issues.projectId))
    .innerJoin(issueStatuses, eq(issueStatuses.id, issues.statusId))
    .where(eq(watchers.userId, me.id))
    .orderBy(desc(issues.updatedAt))
    .limit(20);

  const recent = await listActivities({ limit: 15 });

  return { me, myAssigned, myReported, watched, recent };
});

export const Route = createFileRoute('/my/page')({
  beforeLoad: async () => {
    const me = await getCurrentUser();
    if (!me) throw redirect({ to: '/login' });
  },
  loader: () => loadMyPage(),
  component: MyPagePage,
});

function MyPagePage() {
  const data = Route.useLoaderData();
  if (!data) return null;
  const { myAssigned, myReported, watched, recent } = data;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section className="card p-4">
        <h2 className="font-semibold mb-2">Issues assigned to me</h2>
        {myAssigned.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing assigned. Enjoy your day.</p>
        ) : (
          <ul className="text-sm divide-y divide-gray-100">
            {myAssigned.map((i) => (
              <li key={i.id} className="py-2 flex items-center gap-2">
                <TrackerBadge name={i.trackerName} color={i.trackerColor} />
                <Link to="/projects/$identifier/issues/$issueId" params={{ identifier: i.projectIdentifier, issueId: String(i.id) }} className="flex-1 truncate">
                  <span className="font-mono text-xs text-gray-500 mr-1">#{i.id}</span>{i.subject}
                </Link>
                <PriorityBadge name={i.priorityName} color={i.priorityColor} />
                <StatusBadge name={i.statusName} color={i.statusColor} closed={i.statusIsClosed} />
                <span className="text-xs text-gray-500 w-24 text-right">{i.dueDate ? formatDate(i.dueDate) : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <h2 className="font-semibold mb-2">Reported by me</h2>
        {myReported.length === 0 ? (
          <p className="text-sm text-gray-500">None.</p>
        ) : (
          <ul className="text-sm divide-y divide-gray-100">
            {myReported.map((i) => (
              <li key={i.id} className="py-2 flex items-center gap-2">
                <Link to="/projects/$identifier/issues/$issueId" params={{ identifier: i.projectIdentifier, issueId: String(i.id) }} className="flex-1 truncate">
                  <span className="font-mono text-xs text-gray-500 mr-1">#{i.id}</span>{i.subject}
                </Link>
                <StatusBadge name={i.statusName} color={i.statusColor} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <h2 className="font-semibold mb-2">Watching</h2>
        {watched.length === 0 ? (
          <p className="text-sm text-gray-500">No watched issues.</p>
        ) : (
          <ul className="text-sm divide-y divide-gray-100">
            {watched.map((i) => (
              <li key={i.id} className="py-2 flex items-center gap-2">
                <Link to="/projects/$identifier/issues/$issueId" params={{ identifier: i.projectIdentifier, issueId: String(i.id) }} className="flex-1 truncate">
                  <span className="font-mono text-xs text-gray-500 mr-1">#{i.id}</span>{i.subject}
                </Link>
                <StatusBadge name={i.statusName} color={i.statusColor} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <h2 className="font-semibold mb-2">Latest activity</h2>
        <ul className="text-sm space-y-2">
          {recent.map((a) => (
            <li key={a.id}>
              <div>{a.title}</div>
              <div className="text-xs text-gray-500">{a.projectName ? `${a.projectName} · ` : ''}{timeAgo(a.createdAt)}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
