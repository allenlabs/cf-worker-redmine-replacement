import { Link, createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { sql } from 'drizzle-orm';
import { getRequest } from '@tanstack/react-start/server';
import { getDb, getEnv } from '~/server/auth-runtime.server';
import { readSessionToken, verifySessionToken } from '~/server/session.server';

interface ProjectRow {
  id: number;
  identifier: string;
  name: string;
  description: string;
  homepage: string;
  isPublic: boolean;
  parentId: number | null;
  status: string;
}

// Single SQL that resolves the current user and the projects they can
// see in ONE Hetzner round-trip — same shape as loadHome.  Halves the
// loader wall-time vs the old (getCurrentUser DB) + (buildAuthContext
// DB) + (listProjectsImpl DB) chain.
const loadProjects = createServerFn({ method: 'GET' }).handler(async () => {
  const env = getEnv();
  const req = getRequest();
  const cookie = req?.headers.get('cookie') ?? null;
  const token = readSessionToken(cookie);

  const db = getDb();
  if (!token) {
    // Anonymous: only public + active.  Issue the simpler query so we
    // don't pay for the user-resolution CTE on a no-cookie request.
    const result = (await db.execute(
      sql`
        SELECT COALESCE(
          (SELECT json_agg(p) FROM (
            SELECT
              id, identifier, name, description, homepage,
              is_public AS "isPublic", parent_id AS "parentId", status
            FROM pm.projects
            WHERE is_public AND status = 'active'
            ORDER BY name
          ) p),
          '[]'::json
        ) AS data
      `,
    )) as unknown;
    const arr0 = Array.isArray(result)
      ? result
      : (result as { rows?: unknown[] }).rows;
    return arr0 && arr0.length > 0
      ? ((arr0[0] as { data?: ProjectRow[] }).data ?? [])
      : [];
  }
  const payload = await verifySessionToken(env, token);
  if (!payload?.sub) return [] as ProjectRow[];
  const sub = payload.sub;

  const result = (await db.execute(
    sql`
  WITH
  me AS (
    SELECT id, admin AS "isAdmin" FROM pm.users
    WHERE better_auth_user_id = ${sub} AND status = 'active' LIMIT 1
  ),
  visible AS (
    SELECT
      p.id,
      p.identifier,
      p.name,
      p.description,
      p.homepage,
      p.is_public      AS "isPublic",
      p.parent_id      AS "parentId",
      p.status
    FROM pm.projects p
    WHERE
      -- Admin sees everything; non-admin gets public OR membership.
      (SELECT "isAdmin" FROM me LIMIT 1) = true
      OR p.is_public
      OR EXISTS (
        SELECT 1 FROM pm.members m
        WHERE m.user_id = (SELECT id FROM me) AND m.project_id = p.id
      )
    ORDER BY p.name
  )
  SELECT COALESCE(json_agg(v), '[]'::json) AS data FROM visible v
    `,
  )) as unknown;
  const arr = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows;
  return arr && arr.length > 0
    ? ((arr[0] as { data?: ProjectRow[] }).data ?? [])
    : [];
});

export const Route = createFileRoute('/projects/')({
  loader: () => loadProjects(),
  component: ProjectsListPage,
});

function ProjectsListPage() {
  const projects = Route.useLoaderData() ?? [];

  if (projects.length === 0) {
    return (
      <section className="card p-10 max-w-2xl mx-auto text-center">
        <h1 className="text-2xl font-semibold mb-3">No projects yet</h1>
        <p className="text-sm text-gray-600 mb-6">
          Projects organize issues, wiki pages, and files. Create one to begin.
        </p>
        <Link to="/projects/new" className="btn-primary">+ New project</Link>
      </section>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Link to="/projects/new" className="btn-primary">+ New project</Link>
      </div>
      <ul className="card divide-y divide-gray-100">
        {projects.map((p) => (
          <li key={p.id} className="p-4">
            <div className="flex items-center justify-between">
              <Link
                to="/projects/$identifier"
                params={{ identifier: p.identifier }}
                reloadDocument
                className="font-medium text-base"
              >
                {p.name}
              </Link>
              <span className="text-xs text-gray-500">
                {p.isPublic ? 'public' : 'private'} · {p.status}
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{p.identifier}</div>
            {p.description ? <p className="text-sm text-gray-700 mt-1">{p.description}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
