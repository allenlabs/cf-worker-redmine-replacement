import { createFileRoute, getRouteApi, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { createCategory, deleteCategory, listCategories } from '~/server/categories';
import { listMembers } from '~/server/members';

const parentRoute = getRouteApi('/projects/$identifier');

export const Route = createFileRoute('/projects/$identifier/categories')({
  loader: async () => {
    const project = await parentRoute.useLoaderData;
    const projectId = (project as any).id;
    return {
      categories: await listCategories({ data: { projectId } }),
      members: await listMembers({ data: { projectId } }),
    };
  },
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
