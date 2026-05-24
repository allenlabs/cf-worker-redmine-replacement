import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { buildAuthContext, getCurrentUser, getDb } from '~/server/auth-runtime.server';
import { searchImpl } from '~/server/search';

// Inline server fn — see routes/index.tsx for the bug context (TanStack
// Start 1.168.9 dispatch issue).  Bypass via the *Impl helper.
const runSearch = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => z.object({ q: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const me = await getCurrentUser();
    // Admins don't need the membership scan — skip it.
    const ctx = me && !me.isAdmin ? await buildAuthContext(me.id) : null;
    return searchImpl(getDb(), me, ctx, { q: data.q });
  });

export const Route = createFileRoute('/search')({
  validateSearch: (s: Record<string, unknown>) =>
    z.object({ q: z.string().optional().default('') }).parse(s),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    if (!deps.q) return { results: { issues: [], wikis: [] }, q: '' };
    return { results: await runSearch({ data: { q: deps.q } }), q: deps.q };
  },
  component: SearchPage,
});

function SearchPage() {
  const { results, q } = Route.useLoaderData();
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Search</h1>
      <form className="card p-3 mb-4">
        <input name="q" className="input" placeholder="Type to search…" defaultValue={q} autoFocus />
      </form>

      {!q ? (
        <p className="text-sm text-gray-500">Enter a query to search issues and wiki pages.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="card p-4">
            <h2 className="font-semibold mb-2">Issues ({results.issues.length})</h2>
            {results.issues.length === 0 ? (
              <p className="text-sm text-gray-500">No issues match.</p>
            ) : (
              <ul className="text-sm divide-y divide-gray-100">
                {results.issues.map((i) => (
                  <li key={`i-${i.id}`} className="py-2">
                    <span className="font-mono text-xs text-gray-500 mr-1">#{i.id}</span>
                    {i.title}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card p-4">
            <h2 className="font-semibold mb-2">Wiki ({results.wikis.length})</h2>
            {results.wikis.length === 0 ? (
              <p className="text-sm text-gray-500">No pages match.</p>
            ) : (
              <ul className="text-sm divide-y divide-gray-100">
                {results.wikis.map((w) => (
                  <li key={`w-${w.id}`} className="py-2">{w.title}</li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
