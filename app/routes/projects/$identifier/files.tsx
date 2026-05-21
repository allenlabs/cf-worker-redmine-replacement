import { createFileRoute, getRouteApi, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { formatDateTime } from '~/lib/format';
import { requirePermission, requireUser } from '~/server/auth-runtime.server';
import { deleteAttachment, listProjectFiles, uploadAttachment } from '~/server/attachments';

const parentRoute = getRouteApi('/projects/$identifier');

const handleUpload = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (!(d instanceof FormData)) throw new Error('Expected FormData');
    return d;
  })
  .handler(async ({ data }) => {
    const projectId = Number(data.get('projectId'));
    const description = String(data.get('description') ?? '');
    const file = data.get('file');
    if (!(file instanceof File)) throw new Error('No file provided');
    const { user } = await requirePermission(projectId, 'manage_files');
    await uploadAttachment({
      projectId,
      containerType: 'project',
      containerId: projectId,
      file,
      authorId: user.id,
      description,
    });
    return { ok: true };
  });

export const Route = createFileRoute('/projects/$identifier/files')({
  loader: async () => {
    const project = await parentRoute.useLoaderData;
    return { files: await listProjectFiles({ data: { projectId: (project as any).id } }) };
  },
  component: FilesPage,
});

function FilesPage() {
  const project = parentRoute.useLoaderData();
  const { files } = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const fd = new FormData(e.currentTarget);
      fd.set('projectId', String(project.id));
      await handleUpload({ data: fd });
      e.currentTarget.reset();
      router.invalidate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  async function remove(id: number) {
    if (!confirm('Delete this file?')) return;
    await deleteAttachment({ data: { id, projectId: project.id } });
    router.invalidate();
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Files</h2>

      <form onSubmit={upload} className="card p-3 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[14rem]">
          <label className="label">File</label>
          <input name="file" type="file" className="input" required />
        </div>
        <div className="flex-1 min-w-[14rem]">
          <label className="label">Description</label>
          <input name="description" className="input" />
        </div>
        <button className="btn-primary" disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</button>
        {err ? <p className="w-full text-sm text-red-700">{err}</p> : null}
      </form>

      {files.length === 0 ? (
        <p className="text-sm text-gray-500">No files yet.</p>
      ) : (
        <table className="data-table card">
          <thead><tr><th>Name</th><th>Size</th><th>Uploaded</th><th></th></tr></thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.id}>
                <td><a href={`/files/${f.id}`}>{f.filename}</a>{f.description ? <span className="text-xs text-gray-500 ml-1">— {f.description}</span> : null}</td>
                <td>{Math.ceil(f.filesize / 1024)} KB</td>
                <td>{formatDateTime(f.createdAt)}</td>
                <td><button className="btn-danger" onClick={() => remove(f.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
