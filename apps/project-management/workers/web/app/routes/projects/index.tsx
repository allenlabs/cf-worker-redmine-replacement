import { Link, createFileRoute } from '@tanstack/react-router';
import { listProjects } from '~/server/projects';

export const Route = createFileRoute('/projects/')({
  loader: () => listProjects(),
  component: ProjectsListPage,
});

function ProjectsListPage() {
  const projects = Route.useLoaderData();
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Link to="/projects/new" className="btn-primary">+ New project</Link>
      </div>
      {projects.length === 0 ? (
        <p className="text-sm text-gray-500">No projects yet.</p>
      ) : (
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
      )}
    </div>
  );
}
