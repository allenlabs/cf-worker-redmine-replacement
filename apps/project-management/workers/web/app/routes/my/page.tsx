import { Link, createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { sql } from 'drizzle-orm';
import { getRequest } from '@tanstack/react-start/server';
import { PriorityBadge, StatusBadge, TrackerBadge } from '~/components/badges';
import { formatDate, timeAgo } from '~/lib/format';
import { getDb, getEnv } from '~/server/auth-runtime.server';
import { readSessionToken, verifySessionToken } from '~/server/session';

// One SQL with four CTEs returning their results as JSON — one TCP
// round-trip to Hetzner (~250 ms) instead of four parallel queries
// each paying their own pool-warmup cost.  Halves the loader wall-time
// on warm isolates.  Inlined below via drizzle's `sql` template.

interface MyPagePayload {
  myAssigned: Array<{
    id: number; subject: string; projectId: number;
    projectIdentifier: string; projectName: string;
    trackerName: string; trackerColor: string;
    statusName: string; statusColor: string; statusIsClosed: boolean;
    priorityName: string; priorityColor: string;
    dueDate: string | null; updatedAt: string;
  }>;
  myReported: Array<{
    id: number; subject: string;
    projectIdentifier: string;
    statusName: string; statusColor: string;
    updatedAt: string;
  }>;
  watched: Array<{
    id: number; subject: string;
    projectIdentifier: string;
    statusName: string; statusColor: string;
    updatedAt: string;
  }>;
  recent: Array<{
    id: number; kind: string; title: string; body: string;
    createdAt: string; refId: number; projectId: number | null;
    projectName: string | null;
    userId: number; userLogin: string;
  }>;
}

const loadMyPage = createServerFn({ method: 'GET' }).handler(async () => {
  const t0 = Date.now();
  // Verify the session JWT (cached JWKS) — no DB hit yet.  We resolve
  // the local users row INSIDE the main CTE query so the entire
  // loader is one Hetzner round-trip instead of (getCurrentUser DB)
  // + (data query DB).
  const env = getEnv();
  const req = getRequest();
  const cookie = req?.headers.get('cookie') ?? null;
  const token = readSessionToken(cookie);
  if (!token) return null;
  const payload = await verifySessionToken(env, token);
  if (!payload?.sub) return null;
  const sub = payload.sub;
  const t1 = Date.now();

  const db = getDb();
  const tQ = Date.now();
  const result = (await db.execute(
    sql`
  WITH
  me AS (
    SELECT id, login, email, firstname, lastname, admin AS "isAdmin", avatar_url AS "avatarUrl"
    FROM pm.users
    WHERE better_auth_user_id = ${sub} AND status = 'active'
    LIMIT 1
  ),
  my_assigned AS (
    SELECT
      i.id, i.subject, i.project_id AS "projectId",
      p.identifier AS "projectIdentifier", p.name AS "projectName",
      t.name AS "trackerName", t.color AS "trackerColor",
      s.name AS "statusName", s.color AS "statusColor", s.is_closed AS "statusIsClosed",
      pr.name AS "priorityName", pr.color AS "priorityColor",
      i.due_date AS "dueDate", i.updated_at AS "updatedAt"
    FROM pm.issues i
    JOIN pm.projects p ON p.id = i.project_id
    JOIN pm.trackers t ON t.id = i.tracker_id
    JOIN pm.issue_statuses s ON s.id = i.status_id
    JOIN pm.issue_priorities pr ON pr.id = i.priority_id
    WHERE i.assigned_to_id = (SELECT id FROM me) AND s.is_closed = false
    ORDER BY i.updated_at DESC LIMIT 50
  ),
  my_reported AS (
    SELECT
      i.id, i.subject,
      p.identifier AS "projectIdentifier",
      s.name AS "statusName", s.color AS "statusColor",
      i.updated_at AS "updatedAt"
    FROM pm.issues i
    JOIN pm.projects p ON p.id = i.project_id
    JOIN pm.issue_statuses s ON s.id = i.status_id
    WHERE i.author_id = (SELECT id FROM me) AND s.is_closed = false
    ORDER BY i.updated_at DESC LIMIT 20
  ),
  watched AS (
    SELECT
      i.id, i.subject,
      p.identifier AS "projectIdentifier",
      s.name AS "statusName", s.color AS "statusColor",
      i.updated_at AS "updatedAt"
    FROM pm.watchers w
    JOIN pm.issues i ON i.id = w.issue_id
    JOIN pm.projects p ON p.id = i.project_id
    JOIN pm.issue_statuses s ON s.id = i.status_id
    WHERE w.user_id = (SELECT id FROM me)
    ORDER BY i.updated_at DESC LIMIT 20
  ),
  recent AS (
    SELECT
      a.id, a.kind, a.title, a.body, a.created_at AS "createdAt",
      a.ref_id AS "refId", a.project_id AS "projectId",
      p.name AS "projectName",
      a.user_id AS "userId",
      u.login AS "userLogin"
    FROM pm.activities a
    LEFT JOIN pm.projects p ON p.id = a.project_id
    JOIN pm.users u ON u.id = a.user_id
    ORDER BY a.created_at DESC LIMIT 15
  )
  SELECT json_build_object(
    'me',          (SELECT row_to_json(me) FROM me),
    'myAssigned',  COALESCE((SELECT json_agg(t) FROM my_assigned t), '[]'::json),
    'myReported',  COALESCE((SELECT json_agg(t) FROM my_reported t), '[]'::json),
    'watched',     COALESCE((SELECT json_agg(t) FROM watched t),     '[]'::json),
    'recent',      COALESCE((SELECT json_agg(t) FROM recent t),      '[]'::json)
  ) AS data
    `,
  )) as unknown;
  const tQEnd = Date.now();
  const arr = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows;
  type MyPageDataWithUser = MyPagePayload & {
    me: { id: number; login: string; email: string; firstname: string; lastname: string; isAdmin: boolean; avatarUrl: string | null } | null;
  };
  const data: MyPageDataWithUser | null =
    arr && arr.length > 0
      ? ((arr[0] as { data?: MyPageDataWithUser }).data ?? null)
      : null;
  console.log(`[perf /my/page] jwt=${t1-t0}ms sql=${tQEnd-tQ}ms total=${tQEnd-t0}ms`);

  if (!data?.me) return null;
  return {
    me: data.me,
    myAssigned: data.myAssigned ?? [],
    myReported: data.myReported ?? [],
    watched: data.watched ?? [],
    recent: data.recent ?? [],
  };
});

export const Route = createFileRoute('/my/page')({
  // No beforeLoad auth check — the loader resolves the user inline as
  // part of its single SQL.  __root.tsx still gates on getCurrentUser
  // for the redirect-when-unauthenticated path; we just don't repeat
  // it here.
  loader: async () => {
    const data = await loadMyPage();
    if (!data) throw redirect({ to: '/auth/login' });
    return data;
  },
  component: MyPagePage,
});

function MyPagePage() {
  const data = Route.useLoaderData();
  if (!data) return null;
  const { myAssigned, myReported, watched, recent } = data;

  if (
    myAssigned.length === 0 &&
    myReported.length === 0 &&
    watched.length === 0
  ) {
    return (
      <section className="card p-10 max-w-2xl mx-auto text-center">
        <h1 className="text-2xl font-semibold mb-3">Your page is empty</h1>
        <p className="text-sm text-gray-600 mb-6">
          You have no assigned issues yet. Browse projects to find something to
          work on, or report a new issue inside a project.
        </p>
        <Link to="/projects" className="btn-primary">
          Browse projects
        </Link>
      </section>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section className="lg:col-span-2 space-y-6">
        <div className="card p-4">
          <h2 className="text-lg font-semibold mb-3">Issues assigned to me</h2>
          {myAssigned.length === 0 ? (
            <p className="text-sm text-gray-500">None</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {myAssigned.map((i) => (
                <li key={i.id} className="py-2 flex items-center gap-2 flex-wrap">
                  <TrackerBadge name={i.trackerName} color={i.trackerColor} />
                  <Link
                    to="/projects/$identifier/issues/$issueId"
                    params={{
                      identifier: i.projectIdentifier,
                      issueId: String(i.id),
                    }}
                    className="font-medium flex-1"
                  >
                    {i.subject}
                  </Link>
                  <StatusBadge name={i.statusName} color={i.statusColor} />
                  <PriorityBadge name={i.priorityName} color={i.priorityColor} />
                  {i.dueDate ? (
                    <span className="text-xs text-gray-500">
                      due {formatDate(i.dueDate)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-4">
          <h2 className="text-lg font-semibold mb-3">Issues I reported</h2>
          {myReported.length === 0 ? (
            <p className="text-sm text-gray-500">None</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {myReported.map((i) => (
                <li key={i.id} className="py-2 flex items-center gap-2">
                  <Link
                    to="/projects/$identifier/issues/$issueId"
                    params={{
                      identifier: i.projectIdentifier,
                      issueId: String(i.id),
                    }}
                    className="font-medium flex-1"
                  >
                    {i.subject}
                  </Link>
                  <StatusBadge name={i.statusName} color={i.statusColor} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-4">
          <h2 className="text-lg font-semibold mb-3">Watched</h2>
          {watched.length === 0 ? (
            <p className="text-sm text-gray-500">None</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {watched.map((i) => (
                <li key={i.id} className="py-2 flex items-center gap-2">
                  <Link
                    to="/projects/$identifier/issues/$issueId"
                    params={{
                      identifier: i.projectIdentifier,
                      issueId: String(i.id),
                    }}
                    className="font-medium flex-1"
                  >
                    {i.subject}
                  </Link>
                  <StatusBadge name={i.statusName} color={i.statusColor} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <aside className="card p-4">
        <h2 className="text-lg font-semibold mb-3">Recent activity</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing yet.</p>
        ) : (
          <ul className="text-sm space-y-2">
            {recent.map((a) => (
              <li key={a.id}>
                <div>{a.title}</div>
                <div className="text-xs text-gray-500">{timeAgo(a.createdAt)}</div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
