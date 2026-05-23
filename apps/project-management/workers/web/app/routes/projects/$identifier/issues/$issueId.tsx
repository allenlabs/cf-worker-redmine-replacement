import { createFileRoute, getRouteApi, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { PriorityBadge, ProgressBar, StatusBadge, TrackerBadge } from '~/components/badges';
import { Markdown } from '~/components/Markdown';
import { formatDate, formatDateTime, formatHours } from '~/lib/format';
import { notifyError, notifySuccess } from '~/lib/toast';
import { getIssue, updateIssue, watchIssue } from '~/server/issues';
import { listMembers } from '~/server/members';
import { renderMarkdown } from '~/server/markdown';

const parentRoute = getRouteApi('/projects/$identifier');

export const Route = createFileRoute('/projects/$identifier/issues/$issueId')({
  loader: async ({ params }) => {
    const issue = await getIssue({ data: { id: Number(params.issueId) } });
    const members = await listMembers({ data: { projectId: issue.issue.projectId } });
    return {
      issue,
      members,
      descriptionHtml: renderMarkdown(issue.issue.description),
    };
  },
  component: IssuePage,
});

function IssuePage() {
  const project = parentRoute.useLoaderData();
  const data = Route.useLoaderData();
  const router = useRouter();
  const i = data.issue.issue;
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [changes, setChanges] = useState<Record<string, unknown>>({});

  function updateField<K extends string>(k: K, v: unknown) {
    setChanges((c) => ({ ...c, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await updateIssue({ data: { id: i.id, notes, changes } });
      setNotes('');
      setChanges({});
      notifySuccess('Updated');
      router.invalidate();
    } catch (err) {
      notifyError(`Could not update issue: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleWatch() {
    const am = data.issue.isWatching;
    try {
      await watchIssue({ data: { id: i.id, watch: !am } });
      notifySuccess(am ? 'Unwatched' : 'Watching issue');
      router.invalidate();
    } catch (err) {
      notifyError(`Could not toggle watch: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <TrackerBadge name={data.issue.tracker?.name ?? ''} color={data.issue.tracker?.color ?? '#888'} />
        <div className="flex-1">
          <h2 className="text-xl font-semibold">
            #{i.id} {i.subject}
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Opened by <b>{data.issue.author?.login}</b> on {formatDateTime(i.createdAt)}
            {i.updatedAt && i.updatedAt !== i.createdAt
              ? ` · updated ${formatDateTime(i.updatedAt)}`
              : ''}
          </p>
        </div>
        <button className="btn" onClick={toggleWatch}>
          {data.issue.isWatching ? 'Unwatch' : 'Watch'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 card p-4">
          <h3 className="font-semibold mb-2">Description</h3>
          {data.descriptionHtml ? (
            <Markdown html={data.descriptionHtml} />
          ) : (
            <p className="text-sm text-gray-500">No description.</p>
          )}

          {data.issue.children.length > 0 ? (
            <div className="mt-4">
              <h4 className="font-semibold text-sm mb-1">Subtasks</h4>
              <ul className="text-sm">
                {data.issue.children.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <span className="text-gray-500 font-mono text-xs">#{c.id}</span>
                    <span className={c.statusIsClosed ? 'line-through text-gray-500' : ''}>{c.subject}</span>
                    <span className="text-xs text-gray-500">({c.statusName} · {c.doneRatio}%)</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <aside className="card p-4 text-sm space-y-2">
          <Row label="Status">
            <StatusBadge name={data.issue.status?.name ?? ''} color={data.issue.status?.color ?? '#ccc'} closed={data.issue.status?.isClosed ?? false} />
          </Row>
          <Row label="Priority">
            <PriorityBadge name={data.issue.priority?.name ?? ''} color={data.issue.priority?.color ?? '#ccc'} />
          </Row>
          <Row label="Assignee">{data.issue.assignee?.login ?? '—'}</Row>
          <Row label="Category">{data.issue.category?.name ?? '—'}</Row>
          <Row label="Version">{data.issue.version?.name ?? '—'}</Row>
          <Row label="Parent">{data.issue.parent ? `#${data.issue.parent.id}` : '—'}</Row>
          <Row label="Start date">{i.startDate ? formatDate(i.startDate) : '—'}</Row>
          <Row label="Due date">{i.dueDate ? formatDate(i.dueDate) : '—'}</Row>
          <Row label="Estimated">{formatHours(i.estimatedHours)}</Row>
          <Row label="% Done">
            <div className="w-32">
              <ProgressBar value={i.doneRatio} />
              <div className="text-xs text-gray-500 mt-0.5">{i.doneRatio}%</div>
            </div>
          </Row>
        </aside>
      </div>

      <section className="card p-4">
        <h3 className="font-semibold mb-3">History</h3>
        {data.issue.journals.length === 0 ? (
          <p className="text-sm text-gray-500">No comments yet.</p>
        ) : (
          <ul className="space-y-3">
            {data.issue.journals.map((j) => (
              <li key={j.id} className="border-l-4 border-redmine-200 pl-3">
                <div className="text-xs text-gray-600">
                  <b>{j.userLogin}</b> · {formatDateTime(j.createdAt)}
                </div>
                {j.details.length > 0 ? (
                  <ul className="text-xs text-gray-600 my-1 list-disc ml-5">
                    {j.details.map((d) => (
                      <li key={d.id}>
                        Changed <code>{d.prop_key}</code>{' '}
                        {d.oldValue ? <>from <code>{d.oldValue}</code></> : null}{' '}
                        to <code>{d.newValue ?? '∅'}</code>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {j.notes ? (
                  <Markdown html={renderMarkdown(j.notes)} className="text-sm" />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <h3 className="font-semibold mb-3">Update</h3>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Select
              label="Status"
              value={(changes.statusId as number) ?? i.statusId}
              onChange={(v) => updateField('statusId', v)}
              options={[
                { id: 1, name: 'New' },
                { id: 2, name: 'In Progress' },
                { id: 3, name: 'Resolved' },
                { id: 4, name: 'Feedback' },
                { id: 5, name: 'Closed' },
                { id: 6, name: 'Rejected' },
              ]}
            />
            <Select
              label="Priority"
              value={(changes.priorityId as number) ?? i.priorityId}
              onChange={(v) => updateField('priorityId', v)}
              options={[
                { id: 1, name: 'Low' },
                { id: 2, name: 'Normal' },
                { id: 3, name: 'High' },
                { id: 4, name: 'Urgent' },
                { id: 5, name: 'Immediate' },
              ]}
            />
            <Select
              label="Assignee"
              value={(changes.assignedToId as number | null) ?? i.assignedToId ?? ''}
              onChange={(v) => updateField('assignedToId', v === '' ? null : Number(v))}
              options={[{ id: '', name: '— unassigned —' }, ...data.members.map((m) => ({ id: m.userId, name: m.login }))]}
            />
            <Field label="% done" type="number" min={0} max={100} step={10}
              value={(changes.doneRatio as number) ?? i.doneRatio}
              onChange={(v) => updateField('doneRatio', Number(v))}
            />
            <Field label="Start" type="date" value={(changes.startDate as string) ?? i.startDate ?? ''} onChange={(v) => updateField('startDate', v || null)} />
            <Field label="Due"   type="date" value={(changes.dueDate as string)   ?? i.dueDate   ?? ''} onChange={(v) => updateField('dueDate',   v || null)} />
          </div>
          <div>
            <label className="label">Notes (Markdown)</label>
            <textarea
              className="textarea font-mono text-sm"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Submit'}
          </button>
        </form>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-24 text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Field<T extends string | number>({
  label, value, onChange, type = 'text', min, max, step,
}: { label: string; value: T; onChange: (v: string) => void; type?: string; min?: number; max?: number; step?: number }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" type={type} min={min} max={max} step={step} value={value as any} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Select({
  label, value, onChange, options,
}: {
  label: string;
  value: number | string;
  onChange: (v: number | string) => void;
  options: Array<{ id: number | string; name: string }>;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <select className="select" value={String(value)} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={String(o.id)} value={String(o.id)}>{o.name}</option>
        ))}
      </select>
    </div>
  );
}
