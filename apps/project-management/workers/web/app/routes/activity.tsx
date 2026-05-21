import { createFileRoute } from '@tanstack/react-router';
import { timeAgo } from '~/lib/format';
import { listActivities } from '~/server/activities';

export const Route = createFileRoute('/activity')({
  loader: async () => ({ activities: await listActivities({ limit: 100 }) }),
  component: ActivityPage,
});

function ActivityPage() {
  const { activities } = Route.useLoaderData();
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Global activity</h1>
      {activities.length === 0 ? (
        <p className="text-sm text-gray-500">No activity yet.</p>
      ) : (
        <ul className="card divide-y divide-gray-100">
          {activities.map((a) => (
            <li key={a.id} className="p-3">
              <div className="text-sm">{a.title}</div>
              <div className="text-xs text-gray-500">
                {a.projectName ? <span>{a.projectName} · </span> : null}
                {a.userLogin} · {timeAgo(a.createdAt)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
