import { Outlet, createFileRoute } from '@tanstack/react-router';
import { ProjectSidebar } from '~/components/ProjectSidebar';
import { getProject } from '~/server/projects';

export const Route = createFileRoute('/projects/$identifier')({
  loader: ({ params }) => getProject({ data: { identifier: params.identifier } }),
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
