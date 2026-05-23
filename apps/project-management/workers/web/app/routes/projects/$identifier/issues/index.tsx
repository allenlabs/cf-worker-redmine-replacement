import { Link, createFileRoute, getRouteApi } from '@tanstack/react-router';
import { PriorityBadge, StatusBadge, TrackerBadge } from '~/components/badges';
import { formatDate, timeAgo } from '~/lib/format';
import { listIssues } from '~/server/issues';
import { getProject } from '~/server/projects';

const parentRoute = getRouteApi('/projects/$identifier');

const SEARCH = {
  status: ['open', 'closed', 'all'] as const,
};

export const Route = createFileRoute('/projects/$identifier/issues/')({
  validateSearch: (s: Record<string, unknown>) => ({
    status: (SEARCH.status as readonly string[]).includes(String(s.status))
      ? (s.status as 'open' | 'closed' | 'all')
      : 'open',
    q: s.q ? String(s.q) : undefined,
    sort: s.sort ? (String(s.sort) as 'updated' | 'priority' | 'id') : 'updated',
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const project = await getProject({ data: { identifier: params.identifier } });
    const issues = await listIssues({
      data: {
        projectId: project.id,
        statusFilter: deps.status,
        q: deps.q,
        sort: deps.sort,
      },
    });
    return { issues };
  },
  component: IssuesIndexPage,
});

function IssuesIndexPage() {
  const project = parentRoute.useLoaderData();
  const { issues } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <div>
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold">Issues</h2>
        <Link
          to="/projects/$identifier/issues/new"
          params={{ identifier: project.identifier }}
          className="btn-primary"
        >
          + New issue
        </Link>
      </header>

      <div className="card p-3 mb-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Status</label>
          <select
            className="select"
            value={search.status}
            onChange={(e) => navigate({ search: (s) => ({ ...s, status: e.target.value as any }) })}
          >
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="all">All</option>
          </select>
        </div>
        <div>
          <label className="label">Sort by</label>
          <select
            className="select"
            value={search.sort}
            onChange={(e) => navigate({ search: (s) => ({ ...s, sort: e.target.value as any }) })}
          >
            <option value="updated">Updated</option>
            <option value="priority">Priority</option>
            <option value="id">Number</option>
          </select>
        </div>
        <div className="flex-1 min-w-[12rem]">
          <label className="label">Search</label>
          <input
            className="input"
            value={search.q ?? ''}
            onChange={(e) => navigate({ search: (s) => ({ ...s, q: e.target.value || undefined }) })}
            placeholder="subject or description…"
          />
        </div>
      </div>

      {issues.length === 0 ? (
        search.status === 'open' && !search.q ? (
          <section className="card p-8 text-center">
            <h3 className="text-lg font-semibold mb-2">No issues yet</h3>
            <p className="text-sm text-gray-600 mb-4">
              Track bugs, features, and tasks here. Create the first issue to get started.
            </p>
            <Link
              to="/projects/$identifier/issues/new"
              params={{ identifier: project.identifier }}
              className="btn-primary"
            >
              + New issue
            </Link>
          </section>
        ) : (
          <p className="text-sm text-gray-500">No issues match these filters.</p>
        )
      ) : (
        <table className="data-table card">
          <thead>
            <tr>
              <th>#</th>
              <th>Tracker</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Subject</th>
              <th>Assignee</th>
              <th>Due</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((i) => (
              <tr key={i.id}>
                <td className="font-mono text-xs">#{i.id}</td>
                <td><TrackerBadge name={i.trackerName} color={i.trackerColor} /></td>
                <td><StatusBadge name={i.statusName} color={i.statusColor} closed={i.statusIsClosed} /></td>
                <td><PriorityBadge name={i.priorityName} color={i.priorityColor} /></td>
                <td>
                  <Link
                    to="/projects/$identifier/issues/$issueId"
                    params={{ identifier: project.identifier, issueId: String(i.id) }}
                  >
                    {i.subject}
                  </Link>
                </td>
                <td>{i.assigneeLogin ?? '—'}</td>
                <td>{i.dueDate ? formatDate(i.dueDate) : '—'}</td>
                <td className="text-xs text-gray-600">{timeAgo(i.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
