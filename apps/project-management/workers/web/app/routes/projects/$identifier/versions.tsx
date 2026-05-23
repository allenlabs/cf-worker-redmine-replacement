import { createFileRoute, getRouteApi, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { ProgressBar } from '~/components/badges';
import { formatDate } from '~/lib/format';
import { getProject } from '~/server/projects';
import { createVersion, deleteVersion, listVersions, updateVersion } from '~/server/versions';

const parentRoute = getRouteApi('/projects/$identifier');

export const Route = createFileRoute('/projects/$identifier/versions')({
  loader: async ({ params }) => {
    const project = await getProject({ data: { identifier: params.identifier } });
    return { versions: await listVersions({ data: { projectId: project.id } }) };
  },
  component: VersionsPage,
});

function VersionsPage() {
  const project = parentRoute.useLoaderData();
  const { versions } = Route.useLoaderData();
  const router = useRouter();
  const [name, setName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');

  async function create() {
    if (!name) return;
    await createVersion({
      data: { projectId: project.id, name, description, dueDate: dueDate || null },
    });
    setName(''); setDueDate(''); setDescription('');
    router.invalidate();
  }

  async function remove(id: number) {
    if (!confirm('Delete this version?')) return;
    await deleteVersion({ data: { id, projectId: project.id } });
    router.invalidate();
  }

  async function close(v: typeof versions[number], newStatus: 'open' | 'locked' | 'closed') {
    await updateVersion({
      data: {
        id: v.id,
        projectId: project.id,
        name: v.name,
        description: v.description,
        dueDate: v.dueDate ?? null,
        status: newStatus,
      },
    });
    router.invalidate();
  }

  return (
    <div className="space-y-4">
      <header><h2 className="text-xl font-semibold">Versions</h2></header>

      <div className="card p-3 grid grid-cols-4 gap-3 items-end">
        <div><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label">Due date</label><input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
        <div className="col-span-1"><label className="label">Description</label><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <button className="btn-primary" onClick={create}>+ Create</button>
      </div>

      {versions.length === 0 ? (
        <p className="text-sm text-gray-500">No versions defined.</p>
      ) : (
        <table className="data-table card">
          <thead>
            <tr><th>Name</th><th>Due date</th><th>Progress</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id}>
                <td className="font-medium">{v.name}</td>
                <td>{v.dueDate ? formatDate(v.dueDate) : '—'}</td>
                <td>
                  <div className="w-48">
                    <ProgressBar value={v.percent} />
                    <div className="text-xs text-gray-500 mt-0.5">
                      {v.closedIssues} / {v.totalIssues} closed ({v.percent}%)
                    </div>
                  </div>
                </td>
                <td>
                  <select className="select w-28" value={v.status} onChange={(e) => close(v, e.target.value as any)}>
                    <option value="open">open</option>
                    <option value="locked">locked</option>
                    <option value="closed">closed</option>
                  </select>
                </td>
                <td><button className="btn-danger" onClick={() => remove(v.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
