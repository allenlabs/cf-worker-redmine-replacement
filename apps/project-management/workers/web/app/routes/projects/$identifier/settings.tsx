import { createFileRoute, getRouteApi, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { notifyError, notifySuccess } from '~/lib/toast';
import { deleteProject, updateProject } from '~/server/projects';

const parentRoute = getRouteApi('/projects/$identifier');

export const Route = createFileRoute('/projects/$identifier/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  const project = parentRoute.useLoaderData();
  const router = useRouter();
  const [form, setForm] = useState({
    name: project.name,
    description: project.description,
    homepage: project.homepage,
    isPublic: project.isPublic,
    status: project.status,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await updateProject({ data: { id: project.id, ...form } });
      notifySuccess('Settings saved');
      router.invalidate();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setErr(message);
      notifyError(`Could not save settings: ${message}`);
    } finally { setBusy(false); }
  }

  async function destroy() {
    if (!confirm(`Permanently delete project "${project.name}"? This cannot be undone.`)) return;
    try {
      await deleteProject({ data: { id: project.id } });
      notifySuccess('Project deleted');
      router.navigate({ to: '/projects' });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      notifyError(`Could not delete project: ${message}`);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <form onSubmit={save} className="card p-6 space-y-3">
        <h2 className="text-xl font-semibold">Project settings</h2>
        <div><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
        <div><label className="label">Identifier</label><input className="input font-mono" value={project.identifier} disabled /></div>
        <div><label className="label">Description</label><textarea className="textarea" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div><label className="label">Homepage</label><input className="input" value={form.homepage} onChange={(e) => setForm({ ...form, homepage: e.target.value })} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} />Public</label>
        <div><label className="label">Status</label>
          <select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
            <option value="active">active</option><option value="closed">closed</option><option value="archived">archived</option>
          </select>
        </div>
        {err ? <p className="text-sm text-red-700">{err}</p> : null}
        <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>

      <div className="card p-6 border-red-200">
        <h3 className="font-semibold text-red-700">Danger zone</h3>
        <p className="text-sm text-gray-600 my-2">Delete project and all its data (issues, time entries, wiki, attachments).</p>
        <button className="btn-danger" onClick={destroy}>Delete project</button>
      </div>
    </div>
  );
}
