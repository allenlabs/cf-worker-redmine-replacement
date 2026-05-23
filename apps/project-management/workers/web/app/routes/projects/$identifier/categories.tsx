import { createFileRoute, getRouteApi, useRouter } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { z } from 'zod';
import { buildAuthContext, getCurrentUser, getDb } from '~/server/auth-runtime.server';
import { createCategory, deleteCategory, listCategoriesImpl } from '~/server/categories';
import { listMembersImpl } from '~/server/members';
import { getProjectImpl } from '~/server/projects';

const parentRoute = getRouteApi('/projects/$identifier');

// Inline server fn — TanStack Start 1.168.9 dispatch bug workaround.
const loadCategories = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => z.object({ identifier: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const me = await getCurrentUser();
    const ctx = me ? await buildAuthContext(me.id) : null;
    const db = getDb();
    const project = await getProjectImpl(db, me, ctx, data.identifier);
    const [categories, members] = await Promise.all([
      listCategoriesImpl(db, project.id),
      listMembersImpl(db, project.id),
    ]);
    return { categories, members };
  });

export const Route = createFileRoute('/projects/$identifier/categories')({
  loader: ({ params }) => loadCategories({ data: { identifier: params.identifier } }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const project = parentRoute.useLoaderData();
  const { categories, members } = Route.useLoaderData();
  const router = useRouter();
  const [name, setName] = useState('');
  const [assignedToId, setAssignedToId] = useState<string>('');

  async function create() {
    if (!name) return;
    await createCategory({
      data: {
        projectId: project.id,
        name,
        assignedToId: assignedToId ? Number(assignedToId) : null,
      },
    });
    setName(''); setAssignedToId('');
    router.invalidate();
  }

  async function remove(id: number) {
    if (!confirm('Delete this category?')) return;
    await deleteCategory({ data: { id, projectId: project.id } });
    router.invalidate();
  }

  return (
    <div className="space-y-4">
      <header><h2 className="text-xl font-semibold">Issue categories</h2></header>

      <div className="card p-3 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[12rem]"><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div>
          <label className="label">Default assignee</label>
          <select className="select" value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
            <option value="">—</option>
            {members.map((m) => <option key={m.id} value={m.userId}>{m.login}</option>)}
          </select>
        </div>
        <button className="btn-primary" onClick={create}>+ Create</button>
      </div>

      {categories.length === 0 ? (
        <p className="text-sm text-gray-500">No categories defined.</p>
      ) : (
        <table className="data-table card">
          <thead><tr><th>Name</th><th>Default assignee</th><th></th></tr></thead>
          <tbody>
            {categories.map((c) => {
              const m = members.find((m) => m.userId === c.assignedToId);
              return (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{m?.login ?? '—'}</td>
                  <td><button className="btn-danger" onClick={() => remove(c.id)}>Delete</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
