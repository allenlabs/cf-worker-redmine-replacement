import { Link, createFileRoute, getRouteApi } from '@tanstack/react-router';
import { ProgressBar } from '~/components/badges';
import { formatDate } from '~/lib/format';
import { listIssues } from '~/server/issues';
import { listVersions } from '~/server/versions';

const parentRoute = getRouteApi('/projects/$identifier');

export const Route = createFileRoute('/projects/$identifier/roadmap')({
  loader: async () => {
    const project = await parentRoute.useLoaderData;
    const projectId = (project as any).id;
    const [versions, issues] = await Promise.all([
      listVersions({ data: { projectId } }),
      listIssues({ data: { projectId, statusFilter: 'all', sort: 'id' } }),
    ]);
    return { versions, issues };
  },
  component: RoadmapPage,
});

function RoadmapPage() {
  const project = parentRoute.useLoaderData();
  const { versions, issues } = Route.useLoaderData();

  if (versions.length === 0) {
    return (
      <div>
        <h2 className="text-xl font-semibold mb-3">Roadmap</h2>
        <p className="text-sm text-gray-500">
          Create a version and assign issues to it to populate the roadmap.
        </p>
        <Link
          className="btn-primary mt-3"
          to="/projects/$identifier/versions"
          params={{ identifier: project.identifier }}
        >
          Manage versions
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Roadmap</h2>
      {versions.map((v) => {
        const versionIssues = issues.filter((i) => (i as any).fixedVersionId === v.id || false);
        // Note: listIssues row shape doesn't expose fixedVersionId. We fall back to using totals from versions.
        return (
          <section key={v.id} className="card p-4">
            <header className="flex items-baseline justify-between mb-2">
              <h3 className="text-lg font-semibold">{v.name}</h3>
              <div className="text-xs text-gray-500">
                Due {v.dueDate ? formatDate(v.dueDate) : '—'} · {v.status}
              </div>
            </header>
            {v.description ? <p className="text-sm text-gray-600 mb-2">{v.description}</p> : null}
            <ProgressBar value={v.percent} />
            <p className="text-xs text-gray-500 mt-1">
              {v.closedIssues} / {v.totalIssues} closed ({v.percent}%)
            </p>
          </section>
        );
      })}
    </div>
  );
}
