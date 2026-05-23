import { createFileRoute } from '@tanstack/react-router';
import { timeAgo } from '~/lib/format';
import { listActivities } from '~/server/activities';
import { getProject } from '~/server/projects';

export const Route = createFileRoute('/projects/$identifier/activity')({
  loader: async ({ params }) => {
    const project = await getProject({ data: { identifier: params.identifier } });
    return { activities: await listActivities({ projectId: project.id, limit: 100 }) };
  },
  component: ProjectActivityPage,
});

function ProjectActivityPage() {
  const { activities } = Route.useLoaderData();
  return (
    <div>
      <h2 className="text-xl font-semibold mb-3">Activity</h2>
      {activities.length === 0 ? (
        <p className="text-sm text-gray-500">No activity yet.</p>
      ) : (
        <ul className="card divide-y divide-gray-100">
          {activities.map((a) => (
            <li key={a.id} className="p-3">
              <div className="text-sm">{a.title}</div>
              <div className="text-xs text-gray-500">{a.userLogin} · {timeAgo(a.createdAt)}</div>
              {a.body ? <div className="text-xs text-gray-600 mt-1">{a.body}</div> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
