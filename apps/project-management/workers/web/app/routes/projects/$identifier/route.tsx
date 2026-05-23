import { Link, Outlet, createFileRoute, notFound } from '@tanstack/react-router';
import { ProjectSidebar } from '~/components/ProjectSidebar';
import { getProject } from '~/server/projects';

export const Route = createFileRoute('/projects/$identifier')({
  loader: async ({ params }) => {
    try {
      return await getProject({ data: { identifier: params.identifier } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/not found/i.test(message)) throw notFound();
      throw err;
    }
  },
  notFoundComponent: ProjectNotFound,
  component: ProjectLayout,
});

function ProjectLayout() {
  const project = Route.useLoaderData();
  return (
    <div className="grid grid-cols-[14rem_1fr] gap-6">
      <ProjectSidebar
        identifier={project.identifier}
        projectName={project.name}
        modules={project.modules}
      />
      <div>
        <header className="mb-4">
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          {project.description ? (
            <p className="text-sm text-gray-600 mt-1">{project.description}</p>
          ) : null}
        </header>
        <Outlet />
      </div>
    </div>
  );
}

function ProjectNotFound() {
  return (
    <div className="max-w-lg mx-auto card p-8 text-center mt-12">
      <h2 className="text-lg font-semibold mb-2">Project not found</h2>
      <p className="text-sm text-gray-600 mb-4">
        We couldn’t find a project with that identifier. It may have been deleted or
        renamed.
      </p>
      <Link to="/projects" className="btn-primary">
        ← Back to projects
      </Link>
    </div>
  );
}
