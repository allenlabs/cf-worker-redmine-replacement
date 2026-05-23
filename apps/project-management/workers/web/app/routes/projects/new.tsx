import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { slugify } from '~/lib/format';
import { getCurrentUser } from '~/server/auth-runtime.server';
import { createProject } from '~/server/projects';

export const Route = createFileRoute('/projects/new')({
  beforeLoad: async () => {
    const user = await getCurrentUser();
    if (!user) throw redirect({ to: '/auth/login' });
  },
  component: NewProjectPage,
});

function NewProjectPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    identifier: '',
    description: '',
    homepage: '',
    isPublic: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await createProject({ data: form });
      router.navigate({ to: '/projects/$identifier', params: { identifier: created.identifier } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl card p-6">
      <h1 className="text-xl font-semibold mb-4">New project</h1>
      <form onSubmit={handle} className="space-y-3">
        <div>
          <label className="label">Name</label>
          <input
            className="input"
            value={form.name}
            onChange={(e) =>
              setForm({
                ...form,
                name: e.target.value,
                identifier: form.identifier || slugify(e.target.value),
              })
            }
            required
          />
        </div>
        <div>
          <label className="label">Identifier</label>
          <input
            className="input font-mono"
            value={form.identifier}
            onChange={(e) => setForm({ ...form, identifier: e.target.value })}
            required
            pattern="^[a-z0-9][a-z0-9_-]*$"
          />
          <p className="text-xs text-gray-500 mt-1">URL slug; lowercase letters, digits, dash, underscore.</p>
        </div>
        <div>
          <label className="label">Description</label>
          <textarea
            className="textarea"
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Homepage</label>
          <input
            className="input"
            value={form.homepage}
            onChange={(e) => setForm({ ...form, homepage: e.target.value })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isPublic}
            onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
          />
          Public project (visible without login)
        </label>
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
