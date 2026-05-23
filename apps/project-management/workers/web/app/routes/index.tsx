import { Link, createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { listActivitiesImpl } from '~/server/activities';
import { listProjectsImpl } from '~/server/projects';
import { buildAuthContext, getCurrentUser, getDb } from '~/server/auth-runtime.server';
import { timeAgo } from '~/lib/format';

// Inline server fn — TanStack Start 1.168.9 has a dispatch issue where
// awaiting *another* `createServerFn` export from inside an SSR loader's
// nested server fn returns `undefined`.  Defining the loader's server fn
// at the callsite + calling the `*Impl` helpers directly avoids it.
const loadHome = createServerFn({ method: 'GET' }).handler(async () => {
  const me = await getCurrentUser();
  const ctx = me ? await buildAuthContext(me.id) : null;
  const db = getDb();
  const [projects, activities] = await Promise.all([
    listProjectsImpl(db, me, ctx),
    listActivitiesImpl(db, { limit: 20 }),
  ]);
  return { projects, activities };
});

export const Route = createFileRoute('/')({
  loader: () => loadHome(),
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
              <span className="ml-2 text-xs text-gray-500">{p.identifier}</span>
              {p.description ? (
                <p className="text-sm text-gray-600 mt-0.5 line-clamp-1">{p.description}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-4">
        <h2 className="text-lg font-semibold mb-3">Latest activity</h2>
        {activities.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing yet.</p>
        ) : (
          <ul className="space-y-2">
            {activities.map((a) => (
              <li key={a.id} className="text-sm">
                <div className="text-gray-700">{a.title}</div>
                <div className="text-xs text-gray-500">
                  {a.projectName ? <span>{a.projectName} · </span> : null}
                  {timeAgo(a.createdAt)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
