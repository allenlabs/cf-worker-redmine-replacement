import { createFileRoute, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { loadHomeImpl, type HomePayload } from '~/server/transition';
import { getDb, getEnv } from '~/server/auth-runtime.server';
import { getRequest } from '@tanstack/react-start/server';
import { readSessionToken, verifySessionToken } from '~/server/session.server';
import { Header } from '~/components/Header';
import { RitualCard } from '~/components/RitualCard';

/* v8 ignore start */
const loadHome = createServerFn({ method: 'GET' }).handler(async () => {
  const env = getEnv();
  let req: Request | undefined;
  try { req = getRequest(); } catch { return null; }
  const cookie = req?.headers.get('cookie') ?? null;
  const token = readSessionToken(cookie);
  if (!token) return null;
  const payload = await verifySessionToken(env, token);
  if (!payload?.sub) return null;
  return loadHomeImpl(getDb(), payload.sub);
});
/* v8 ignore stop */

export const Route = createFileRoute('/')({
  loader: async () => loadHome(),
  component: HomePage,
});

export function EmptyLog() {
  return (
    <div className="card p-4 text-sm text-slate-400" data-testid="empty-log">
      No transition rituals yet.  Hand off your next stopping point.
    </div>
  );
}

function HomePage() {
  const data = Route.useLoaderData() as HomePayload | null;
  if (!data) {
    return (
      <div className="card p-4 text-sm text-slate-400 m-4" data-testid="no-session">
        Signed out.
      </div>
    );
  }
  return (
    <>
      <Header />
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-base font-semibold text-slate-200">Recent transitions</h1>
          <Link to="/new" className="text-sm" data-testid="new-link">+ new ritual</Link>
        </div>
        {data.recent.length === 0 ? (
          <EmptyLog />
        ) : (
          <ul className="space-y-2" data-testid="recent-list">
            {data.recent.map((r) => <RitualCard key={r.id} ritual={r} />)}
          </ul>
        )}
      </div>
    </>
  );
}
