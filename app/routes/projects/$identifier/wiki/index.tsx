import { Link, createFileRoute, getRouteApi } from '@tanstack/react-router';
import { listWikiPages } from '~/server/wiki';

const parentRoute = getRouteApi('/projects/$identifier');

export const Route = createFileRoute('/projects/$identifier/wiki/')({
  loader: async () => {
    const project = await parentRoute.useLoaderData;
    return await listWikiPages({ data: { projectId: (project as any).id } });
  },
  component: WikiIndex,
});

function WikiIndex() {
  const project = parentRoute.useLoaderData();
  const { pages } = Route.useLoaderData();
  return (
    <div>
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold">Wiki</h2>
        <Link
          className="btn-primary"
          to="/projects/$identifier/wiki/$slug"
          params={{ identifier: project.identifier, slug: 'new-page' }}
        >
          + New page
        </Link>
      </header>
      {pages.length === 0 ? (
        <p className="text-sm text-gray-500">No pages yet. Create the first page.</p>
      ) : (
        <ul className="card divide-y divide-gray-100">
          {pages.map((p) => (
            <li key={p.id} className="p-3">
              <Link
                to="/projects/$identifier/wiki/$slug"
                params={{ identifier: project.identifier, slug: p.slug }}
                className="font-medium"
              >
                {p.title}
              </Link>
              <span className="text-xs text-gray-500 ml-2">/{p.slug}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
