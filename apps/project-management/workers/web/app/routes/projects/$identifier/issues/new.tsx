import { createFileRoute, getRouteApi, useRouter } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { z } from 'zod';
import { notifyError, notifySuccess } from '~/lib/toast';
import { buildAuthContext, getCurrentUser, getDb } from '~/server/auth-runtime.server';
import { listMembersImpl } from '~/server/members';
import { createIssue } from '~/server/issues';
import { getProjectImpl } from '~/server/projects';

const parentRoute = getRouteApi('/projects/$identifier');

// Inline server fn — TanStack Start 1.168.9 dispatch bug workaround.
const loadNewIssueData = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => z.object({ identifier: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const me = await getCurrentUser();
    // Admins don't need the membership scan — skip it.
    const ctx = me && !me.isAdmin ? await buildAuthContext(me.id) : null;
    const db = getDb();
    const project = await getProjectImpl(db, me, ctx, data.identifier);
    const members = await listMembersImpl(db, project.id);
    return { members };
  });

export const Route = createFileRoute('/projects/$identifier/issues/new')({
  loader: ({ params }) => loadNewIssueData({ data: { identifier: params.identifier } }),
  component: NewIssuePage,
});

function NewIssuePage() {
  const project = parentRoute.useLoaderData();
  const { members } = Route.useLoaderData();
  const router = useRouter();
  const [form, setForm] = useState({
    trackerId: project.trackers[0]?.id ?? 1,
    subject: '',
    description: '',
    assignedToId: '' as string,
    categoryId: '' as string,
    fixedVersionId: '' as string,
    startDate: '',
    dueDate: '',
    estimatedHours: '',
    doneRatio: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await createIssue({
        data: {
          projectId: project.id,
          trackerId: form.trackerId,
          subject: form.subject,
          description: form.description,
          assignedToId: form.assignedToId ? Number(form.assignedToId) : null,
          categoryId: form.categoryId ? Number(form.categoryId) : null,
          fixedVersionId: form.fixedVersionId ? Number(form.fixedVersionId) : null,
          startDate: form.startDate || null,
          dueDate: form.dueDate || null,
          estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : null,
          doneRatio: Number(form.doneRatio),
        },
      });
      notifySuccess(`Issue #${created.id} created`);
      // Invalidate so the issues list and parent project (counts) refresh.
      router.invalidate();
      router.navigate({
        to: '/projects/$identifier/issues/$issueId',
        params: { identifier: project.identifier, issueId: String(created.id) },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      notifyError(`Could not create issue: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-6">
      <h2 className="text-xl font-semibold mb-4">New issue</h2>
      <form onSubmit={handle} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Tracker</label>
            <select
              className="select"
              value={form.trackerId}
              onChange={(e) => setForm({ ...form, trackerId: Number(e.target.value) })}
            >
              {project.trackers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Assignee</label>
            <select
              className="select"
              value={form.assignedToId}
              onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}
            >
              <option value="">— unassigned —</option>
              {members.map((m) => (
                <option key={m.id} value={m.userId}>{m.login}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Subject</label>
          <input
            className="input"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label">Description (Markdown)</label>
          <textarea
            className="textarea font-mono text-sm"
            rows={10}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="label">Category</label>
            <select
              className="select"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">—</option>
              {project.categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Target version</label>
            <select
              className="select"
              value={form.fixedVersionId}
              onChange={(e) => setForm({ ...form, fixedVersionId: e.target.value })}
            >
              <option value="">—</option>
              {project.versions.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Start date</label>
            <input
              type="date"
              className="input"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Due date</label>
            <input
              type="date"
              className="input"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Estimated hours</label>
            <input
              type="number"
              step="0.25"
              min="0"
              className="input"
              value={form.estimatedHours}
              onChange={(e) => setForm({ ...form, estimatedHours: e.target.value })}
            />
          </div>
          <div>
            <label className="label">% done</label>
            <input
              type="number"
              min="0"
              max="100"
              step="10"
              className="input"
              value={form.doneRatio}
              onChange={(e) => setForm({ ...form, doneRatio: Number(e.target.value) })}
            />
          </div>
        </div>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <div className="pt-2">
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}
