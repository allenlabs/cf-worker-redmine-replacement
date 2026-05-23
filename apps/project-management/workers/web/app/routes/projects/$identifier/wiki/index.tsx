import { Link, createFileRoute, getRouteApi } from '@tanstack/react-router';
import { getProject } from '~/server/projects';
import { listWikiPages } from '~/server/wiki';

const parentRoute = getRouteApi('/projects/$identifier');

export const Route = createFileRoute('/projects/$identifier/wiki/')({
  loader: async ({ params }) => {
    const project = await getProject({ data: { identifier: params.identifier } });
    return await listWikiPages({ data: { projectId: project.id } });
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
          params={{ identifier: project.identifier, slug: 'index' }}
        >
          + New page
        </Link>
      </header>
      {pages.length === 0 ? (
        <section className="card p-8 text-center">
          <h3 className="text-lg font-semibold mb-2">No wiki pages yet</h3>
          <p className="text-sm text-gray-600 mb-4">
            Start a knowledge base for this project with an index page.
          </p>
          <Link
            className="btn-primary"
            to="/projects/$identifier/wiki/$slug"
            params={{ identifier: project.identifier, slug: 'index' }}
          >
            Create the index page
          </Link>
        </section>
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
