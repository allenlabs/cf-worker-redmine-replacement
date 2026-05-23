import { Link, createFileRoute, getRouteApi } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { ProgressBar } from '~/components/badges';
import { Markdown } from '~/components/Markdown';
import { listActivitiesImpl } from '~/server/activities';
import { getDb } from '~/server/auth-runtime.server';
import { renderMarkdown } from '~/server/markdown';
import { timeAgo } from '~/lib/format';

const parentRoute = getRouteApi('/projects/$identifier');

// Inline server fn — TanStack Start 1.168.9 dispatch bug workaround.
const loadOverview = createServerFn({ method: 'GET' }).handler(async () => {
  return listActivitiesImpl(getDb(), { projectId: undefined, limit: 10 });
});

export const Route = createFileRoute('/projects/$identifier/')({
  loader: async () => {
    const activities = await loadOverview();
    return { activities };
  },
  component: ProjectOverview,
});

function ProjectOverview() {
  const project = parentRoute.useLoaderData();
  const { activities } = Route.useLoaderData();
  const html = renderMarkdown(project.description);
  const open = project.counts.openIssues;
  const closed = project.counts.closedIssues;
  const total = open + closed;
  const pct = total === 0 ? 0 : Math.round((closed / total) * 100);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <section className="card p-4">
          <h2 className="text-lg font-semibold mb-2">Overview</h2>
          {html ? (
            <Markdown html={html} />
          ) : (
            <p className="text-sm text-gray-500">No description yet.</p>
          )}
        </section>

        <section className="card p-4">
          <h2 className="text-lg font-semibold mb-2">Issue tracking</h2>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-2xl font-semibold">{open}</div>
              <div className="text-xs text-gray-500">Open</div>
            </div>
            <div>
              <div className="text-2xl font-semibold">{closed}</div>
              <div className="text-xs text-gray-500">Closed</div>
            </div>
            <div>
              <div className="text-2xl font-semibold">{total}</div>
              <div className="text-xs text-gray-500">Total</div>
            </div>
          </div>
          <div className="mt-3">
            <ProgressBar value={pct} />
            <p className="text-xs text-gray-500 mt-1">{pct}% closed</p>
          </div>
          <div className="mt-3 flex gap-2">
            <Link
              to="/projects/$identifier/issues"
              params={{ identifier: project.identifier }}
              search={{ status: 'open', q: undefined, sort: 'updated' }}
              className="btn"
            >
              View issues
            </Link>
            <Link
              to="/projects/$identifier/issues/new"
              params={{ identifier: project.identifier }}
              className="btn-primary"
            >
              + New issue
            </Link>
          </div>
        </section>

        {project.versions.length > 0 ? (
          <section className="card p-4">
            <h2 className="text-lg font-semibold mb-2">Versions</h2>
            <ul className="text-sm space-y-1">
              {project.versions.map((v) => (
                <li key={v.id} className="flex items-center justify-between">
                  <span>{v.name}</span>
                  <span className="text-xs text-gray-500">{v.dueDate ?? '—'}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <aside className="space-y-4">
        <section className="card p-4">
          <h3 className="font-semibold mb-2">Trackers</h3>
          <div className="flex flex-wrap gap-1">
            {project.trackers.map((t) => (
              <span
                key={t.id}
                className="badge"
                style={{ backgroundColor: t.color, color: 'white' }}
              >
                {t.name}
              </span>
            ))}
          </div>
        </section>
        <section className="card p-4">
          <h3 className="font-semibold mb-2">Latest activity</h3>
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
        </section>
      </aside>
    </div>
  );
}
