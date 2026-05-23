import { createFileRoute, getRouteApi, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { Markdown } from '~/components/Markdown';
import { formatDateTime } from '~/lib/format';
import { renderMarkdown } from '~/server/markdown';
import { getProject } from '~/server/projects';
import { deleteWikiPage, getWikiPage, saveWikiPage } from '~/server/wiki';

const parentRoute = getRouteApi('/projects/$identifier');

export const Route = createFileRoute('/projects/$identifier/wiki/$slug')({
  loader: async ({ params }) => {
    const project = await getProject({ data: { identifier: params.identifier } });
    const data = await getWikiPage({
      data: { projectId: project.id, slug: params.slug },
    });
    const html = data.revision ? renderMarkdown(data.revision.text) : '';
    return { data, html };
  },
  component: WikiPagePage,
});

function WikiPagePage() {
  const project = parentRoute.useLoaderData();
  const { data, html } = Route.useLoaderData();
  const params = Route.useParams();
  const router = useRouter();
  const [editing, setEditing] = useState(!data.page);
  const [title, setTitle] = useState(data.page?.title ?? params.slug);
  const [text, setText] = useState(data.revision?.text ?? '');
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await saveWikiPage({
        data: { projectId: project.id, slug: params.slug, title, text, comments },
      });
      setEditing(false);
      setComments('');
      router.invalidate();
    } finally { setBusy(false); }
  }

  async function destroy() {
    if (!data.page || !confirm('Delete this page?')) return;
    await deleteWikiPage({ data: { id: data.page.id, projectId: project.id } });
    router.navigate({ to: '/projects/$identifier/wiki', params: { identifier: project.identifier } });
  }

  if (editing) {
    return (
      <div className="space-y-3">
        <input className="input text-lg font-semibold" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="textarea font-mono text-sm" rows={20} value={text} onChange={(e) => setText(e.target.value)} />
        <input className="input" placeholder="Comment for this revision (optional)" value={comments} onChange={(e) => setComments(e.target.value)} />
        <div className="flex gap-2">
          <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          {data.page ? <button className="btn" onClick={() => setEditing(false)}>Cancel</button> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{data.page?.title ?? params.slug}</h2>
        <div className="flex gap-2">
          <button className="btn" onClick={() => setEditing(true)}>Edit</button>
          {data.page ? <button className="btn-danger" onClick={destroy}>Delete</button> : null}
        </div>
      </header>
      {html ? <Markdown html={html} /> : <p className="text-sm text-gray-500">This page is empty.</p>}
      {data.revisions.length > 0 ? (
        <section className="card p-3">
          <h3 className="font-semibold mb-2">Revisions</h3>
          <ul className="text-xs space-y-1">
            {data.revisions.map((r) => (
              <li key={r.id}>
                v{r.version} · {r.authorLogin} · {formatDateTime(r.createdAt)}
                {r.comments ? <> — <em>{r.comments}</em></> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
