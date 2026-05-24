import { Link, createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { sql } from 'drizzle-orm';
import { getRequest } from '@tanstack/react-start/server';
import { getDb, getEnv } from '~/server/auth-runtime.server';
import { readSessionToken, verifySessionToken } from '~/server/session.server';
import { timeAgo } from '~/lib/format';

interface HomePayload {
  projects: Array<{
    id: number; identifier: string; name: string; description: string;
    isPublic: boolean; status: string;
  }>;
  activities: Array<{
    id: number; title: string; createdAt: string; userLogin: string;
    projectName: string | null;
  }>;
}

// Single SQL that resolves the current user, the projects they can see,
// and recent activities in ONE Hetzner round-trip.  Halves the per-route
// wall time vs the old (auth + buildAuthContext + parallel two queries)
// shape, since postgres.js opens one TCP socket per request and each
// extra round-trip costs ~250 ms.
const loadHome = createServerFn({ method: 'GET' }).handler(async () => {
  const env = getEnv();
  const req = getRequest();
  const cookie = req?.headers.get('cookie') ?? null;
  const token = readSessionToken(cookie);
  if (!token) return null;
  const payload = await verifySessionToken(env, token);
  if (!payload?.sub) return null;
  const sub = payload.sub;

  const db = getDb();
  const result = (await db.execute(
    sql`
  WITH
  me AS (
    SELECT id, admin AS "isAdmin" FROM pm.users
    WHERE better_auth_user_id = ${sub} AND status = 'active' LIMIT 1
  ),
  user_projects AS (
    SELECT p.id, p.identifier, p.name, p.description, p.is_public AS "isPublic", p.status
    FROM pm.projects p
    WHERE p.status = 'active'
      AND (
        p.is_public
        OR (SELECT "isAdmin" FROM me)
        OR EXISTS (
          SELECT 1 FROM pm.members m
          INNER JOIN pm.roles r ON r.id = m.role_id
          WHERE m.user_id = (SELECT id FROM me) AND m.project_id = p.id
        )
      )
    ORDER BY p.name
  ),
  recent AS (
    SELECT a.id, a.title, a.created_at AS "createdAt",
           u.login AS "userLogin",
           p.name AS "projectName"
    FROM pm.activities a
    JOIN pm.users u ON u.id = a.user_id
    LEFT JOIN pm.projects p ON p.id = a.project_id
    ORDER BY a.created_at DESC LIMIT 20
  )
  SELECT json_build_object(
    'projects',  COALESCE((SELECT json_agg(up) FROM user_projects up), '[]'::json),
    'activities', COALESCE((SELECT json_agg(r) FROM recent r), '[]'::json)
  ) AS data
    `,
  )) as unknown;
  const arr = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows;
  const data: HomePayload | null = arr && arr.length > 0
    ? ((arr[0] as { data?: HomePayload }).data ?? null)
    : null;

  return data ?? { projects: [], activities: [] };
});

export const Route = createFileRoute('/')({
  loader: async () => {
    const data = await loadHome();
    return data ?? { projects: [], activities: [] };
  },
  component: HomePage,
});

function HomePage() {
  const { projects, activities } = Route.useLoaderData();

  if (projects.length === 0) {
    return (
      <section className="card p-10 max-w-2xl mx-auto text-center">
        <h1 className="text-2xl font-semibold mb-3">Welcome to Project Management</h1>
        <p className="text-sm text-gray-600 mb-6">
          A project groups issues, wiki pages, files, and activity for a single
          piece of work. Create one to start tracking tasks, planning versions,
          and collaborating with your team.
        </p>
        <Link to="/projects/new" className="btn-primary">
          Create your first project
        </Link>
      </section>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section className="lg:col-span-2 card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Projects</h2>
          <Link to="/projects/new" className="btn-primary">+ New project</Link>
        </div>
        <ul className="divide-y divide-gray-100">
          {projects.map((p) => (
            <li key={p.id} className="py-2">
              <Link to="/projects/$identifier" params={{ identifier: p.identifier }} className="font-medium">
                {p.name}
              </Link>
              {p.description ? <p className="text-sm text-gray-600 mt-0.5">{p.description}</p> : null}
            </li>
          ))}
        </ul>
      </section>
      <aside className="card p-4">
        <h2 className="text-lg font-semibold mb-3">Activity</h2>
        {activities.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing yet.</p>
        ) : (
          <ul className="text-sm space-y-2">
            {activities.map((a) => (
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
