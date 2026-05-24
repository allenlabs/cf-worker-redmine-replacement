import { Link, createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { PriorityBadge, StatusBadge, TrackerBadge } from '~/components/badges';
import { formatDate, timeAgo } from '~/lib/format';
import { getDb, getEnv } from '~/server/auth-runtime.server';
import { loadMyPageImpl } from '~/server/home';
import { readSessionToken, verifySessionToken } from '~/server/session.server';

// Verify the JWT (cached JWKS — no DB hit) then dispatch to
// loadMyPageImpl which resolves the user + all four sections in ONE
// Hetzner round-trip.  See server/home.ts for the SQL.
const loadMyPage = createServerFn({ method: 'GET' }).handler(async () => {
  const env = getEnv();
  const req = getRequest();
  const cookie = req?.headers.get('cookie') ?? null;
  const token = readSessionToken(cookie);
  if (!token) return null;
  const payload = await verifySessionToken(env, token);
  if (!payload?.sub) return null;
  return loadMyPageImpl(getDb(), payload.sub);
});

export const Route = createFileRoute('/my/page')({
  // No beforeLoad auth check — the loader resolves the user inline as
  // part of its single SQL.  __root.tsx still gates on getCurrentUser
  // for the redirect-when-unauthenticated path; we just don't repeat
  // it here.
  loader: async () => {
    const data = await loadMyPage();
    if (!data) throw redirect({ to: '/auth/login' });
    return data;
  },
  component: MyPagePage,
});

function MyPagePage() {
  const data = Route.useLoaderData();
  if (!data) return null;
  const { myAssigned, myReported, watched, recent } = data;

  if (
    myAssigned.length === 0 &&
    myReported.length === 0 &&
    watched.length === 0
  ) {
    return (
      <section className="card p-10 max-w-2xl mx-auto text-center">
        <h1 className="text-2xl font-semibold mb-3">Your page is empty</h1>
        <p className="text-sm text-gray-600 mb-6">
          You have no assigned issues yet. Browse projects to find something to
          work on, or report a new issue inside a project.
        </p>
        <Link to="/projects" className="btn-primary">
          Browse projects
        </Link>
      </section>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section className="lg:col-span-2 space-y-6">
        <div className="card p-4">
          <h2 className="text-lg font-semibold mb-3">Issues assigned to me</h2>
          {myAssigned.length === 0 ? (
            <p className="text-sm text-gray-500">None</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {myAssigned.map((i) => (
                <li key={i.id} className="py-2 flex items-center gap-2 flex-wrap">
                  <TrackerBadge name={i.trackerName} color={i.trackerColor} />
                  <Link
                    to="/projects/$identifier/issues/$issueId"
                    params={{
                      identifier: i.projectIdentifier,
                      issueId: String(i.id),
                    }}
                    className="font-medium flex-1"
                  >
                    {i.subject}
                  </Link>
                  <StatusBadge name={i.statusName} color={i.statusColor} />
                  <PriorityBadge name={i.priorityName} color={i.priorityColor} />
                  {i.dueDate ? (
                    <span className="text-xs text-gray-500">
                      due {formatDate(i.dueDate)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-4">
          <h2 className="text-lg font-semibold mb-3">Issues I reported</h2>
          {myReported.length === 0 ? (
            <p className="text-sm text-gray-500">None</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {myReported.map((i) => (
                <li key={i.id} className="py-2 flex items-center gap-2">
                  <Link
                    to="/projects/$identifier/issues/$issueId"
                    params={{
                      identifier: i.projectIdentifier,
                      issueId: String(i.id),
                    }}
                    className="font-medium flex-1"
                  >
                    {i.subject}
                  </Link>
                  <StatusBadge name={i.statusName} color={i.statusColor} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-4">
          <h2 className="text-lg font-semibold mb-3">Watched</h2>
          {watched.length === 0 ? (
            <p className="text-sm text-gray-500">None</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {watched.map((i) => (
                <li key={i.id} className="py-2 flex items-center gap-2">
                  <Link
                    to="/projects/$identifier/issues/$issueId"
                    params={{
                      identifier: i.projectIdentifier,
                      issueId: String(i.id),
                    }}
                    className="font-medium flex-1"
                  >
                    {i.subject}
                  </Link>
                  <StatusBadge name={i.statusName} color={i.statusColor} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <aside className="card p-4">
        <h2 className="text-lg font-semibold mb-3">Recent activity</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing yet.</p>
        ) : (
          <ul className="text-sm space-y-2">
            {recent.map((a) => (
              <li key={a.id}>
                <div>{a.title}</div>
                <div className="text-xs text-gray-500">{timeAgo(a.createdAt)}</div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
