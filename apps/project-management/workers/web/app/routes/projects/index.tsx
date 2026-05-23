import { Link, createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { buildAuthContext, getCurrentUser, getDb } from '~/server/auth-runtime.server';
import { listProjectsImpl } from '~/server/projects';

// Inlined server fn so the loader gets a direct server-side execution.
// (Importing the shared `listProjects` server fn and awaiting it from
// inside another route loader was returning `undefined` — a TanStack Start
// dispatch issue in 1.168.9.  Defining the server fn inline at the
// callsite sidesteps it.)
const loadProjects = createServerFn({ method: 'GET' }).handler(async () => {
  const me = await getCurrentUser();
  // Admins don't need the membership scan — skip it.
  const ctx = me && !me.isAdmin ? await buildAuthContext(me.id) : null;
  return listProjectsImpl(getDb(), me, ctx);
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
