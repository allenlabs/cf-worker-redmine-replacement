import { createFileRoute, getRouteApi, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { notifyError, notifySuccess } from '~/lib/toast';
import {
  connectNotionDatabase,
  disconnectNotionDatabase,
  getNotionConnection,
  inspectNotionDatabase,
  listNotionDatabases,
  PM_FIELDS,
  resyncNotionIssues,
} from '~/server/notion';
import type { NotionMapping } from '~/db/schema';

const parentRoute = getRouteApi('/projects/$identifier');

export const Route = createFileRoute('/projects/$identifier/settings/integrations')({
  // The parent route `/projects/$identifier` already loads the project row
  // and exposes it via `parentRoute.useLoaderData()`.  We don't need to do
  // any extra server work here — the integrations connection state is
  // fetched lazily inside the component so it stays fresh across
  // `router.invalidate()`.
  component: IntegrationsPage,
});

interface ConnectionStateNone {
  kind: 'none';
}
interface ConnectionStatePicking {
  kind: 'picking';
  databases: Array<{ id: string; title: string }>;
}
interface ConnectionStateMapping {
  kind: 'mapping';
  databaseId: string;
  databaseTitle: string;
  properties: Record<string, { id: string; name: string; type: string }>;
  mapping: NotionMapping;
}
type LocalState = ConnectionStateNone | ConnectionStatePicking | ConnectionStateMapping;

function IntegrationsPage() {
  const project = parentRoute.useLoaderData();
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [hasToken, setHasToken] = useState(true);
  const [connection, setConnection] = useState<{
    id: number;
    databaseId: string;
    databaseTitle: string;
    mapping: NotionMapping;
  } | null>(null);
  const [state, setState] = useState<LocalState>({ kind: 'none' });
  const [busy, setBusy] = useState(false);

  // Lazy load on first render — the loader stays stateless so reloads
  // after disconnect/re-connect always pull fresh.
  if (!loaded) {
    setLoaded(true);
    void (async () => {
      try {
        const result = await getNotionConnection({ data: { projectId: project.id } });
        setHasToken(result.hasToken);
        if (result.connection) {
          setConnection({
            id: result.connection.id,
            databaseId: result.connection.databaseId,
            databaseTitle: result.connection.databaseTitle,
            mapping: result.connection.mapping,
          });
        }
      } catch (e) {
        notifyError(e instanceof Error ? e.message : String(e));
      }
    })();
  }

  async function startConnect() {
    setBusy(true);
    try {
      const databases = await listNotionDatabases({ data: { projectId: project.id } });
      setState({ kind: 'picking', databases });
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function pickDatabase(databaseId: string, databaseTitle: string) {
    setBusy(true);
    try {
      const info = await inspectNotionDatabase({
        data: { projectId: project.id, databaseId },
      });
      setState({
        kind: 'mapping',
        databaseId,
        databaseTitle: info.title || databaseTitle,
        properties: info.properties,
        mapping: info.suggested,
      });
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveMapping() {
    if (state.kind !== 'mapping') return;
    setBusy(true);
    try {
      await connectNotionDatabase({
        data: {
          projectId: project.id,
          databaseId: state.databaseId,
          databaseTitle: state.databaseTitle,
          mapping: state.mapping,
        },
      });
      notifySuccess('Connected to Notion');
      router.invalidate();
      setLoaded(false);
      setState({ kind: 'none' });
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm('Disconnect this project from Notion?')) return;
    setBusy(true);
    try {
      await disconnectNotionDatabase({ data: { projectId: project.id } });
      notifySuccess('Disconnected');
      setConnection(null);
      router.invalidate();
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function resync() {
    setBusy(true);
    try {
      const result = await resyncNotionIssues({ data: { projectId: project.id } });
      notifySuccess(`Synced ${result.synced} of ${result.total} issues`);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!hasToken) {
    return (
      <div className="max-w-2xl space-y-4">
        <h2 className="text-xl font-semibold">Notion integration</h2>
        <div className="card p-4 border-amber-300 bg-amber-50">
          <p className="text-sm">
            The <code className="font-mono">NOTION_TOKEN</code> wrangler secret
            is not configured.  Set it from the deploy host with{' '}
            <code className="font-mono">
              wrangler secret put NOTION_TOKEN --config workers/web/wrangler.toml
            </code>
            , then reload this page.
          </p>
        </div>
      </div>
    );
  }

  if (connection) {
    return (
      <div className="max-w-2xl space-y-4">
        <h2 className="text-xl font-semibold">Notion integration</h2>
        <div className="card p-4">
          <p className="text-sm">
            Connected to <strong>{connection.databaseTitle}</strong>
          </p>
          <p className="text-xs text-gray-500 mt-1 font-mono">{connection.databaseId}</p>
          <div className="flex gap-2 mt-3">
            <button className="btn-primary" disabled={busy} onClick={resync}>
              Re-sync all issues now
            </button>
            <button className="btn-danger" disabled={busy} onClick={disconnect}>
              Disconnect
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state.kind === 'picking') {
    return (
      <div className="max-w-2xl space-y-4">
        <h2 className="text-xl font-semibold">Pick a Notion Database</h2>
        {state.databases.length === 0 ? (
          <p className="text-sm text-gray-600">
            No Databases are shared with the integration.  Invite the
            integration to a Database from Notion's UI and try again.
          </p>
        ) : (
          <ul className="card divide-y">
            {state.databases.map((d) => (
              <li key={d.id} className="p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">{d.title}</p>
                  <p className="font-mono text-xs text-gray-500">{d.id}</p>
                </div>
                <button
                  className="btn-primary"
                  disabled={busy}
                  onClick={() => pickDatabase(d.id, d.title)}
                >
                  Select
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (state.kind === 'mapping') {
    const propsList = Object.values(state.properties);
    return (
      <div className="max-w-3xl space-y-4">
        <h2 className="text-xl font-semibold">Map PM fields → {state.databaseTitle}</h2>
        <table className="data-table card">
          <thead>
            <tr>
              <th>PM field</th>
              <th>Notion property</th>
            </tr>
          </thead>
          <tbody>
            {PM_FIELDS.map((f) => {
              const current = state.mapping.fields[f.key];
              const compatible = propsList.filter((p) =>
                f.compatibleTypes.includes(p.type),
              );
              return (
                <tr key={f.key}>
                  <td>
                    <div className="font-medium">{f.label}</div>
                    <div className="text-xs text-gray-500">
                      Accepts: {f.compatibleTypes.join(', ')}
                    </div>
                  </td>
                  <td>
                    <select
                      className="select"
                      value={current?.propertyId ?? ''}
                      onChange={(e) => {
                        const id = e.target.value;
                        const next: NotionMapping = {
                          fields: { ...state.mapping.fields },
                        };
                        if (!id) {
                          next.fields[f.key] = null;
                        } else {
                          const p = propsList.find((p) => p.id === id);
                          next.fields[f.key] = p
                            ? {
                                propertyId: p.id,
                                propertyName: p.name,
                                propertyType: p.type,
                              }
                            : null;
                        }
                        setState({ ...state, mapping: next });
                      }}
                    >
                      <option value="">—</option>
                      {compatible.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.type})
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex gap-2">
          <button className="btn-primary" disabled={busy} onClick={saveMapping}>
            Save mapping
          </button>
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => setState({ kind: 'none' })}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="text-xl font-semibold">Notion integration</h2>
      <div className="card p-4">
        <p className="text-sm text-gray-700">
          One-way push: every PM issue is mirrored onto a Notion page in the
          Database you connect below.  Updates flow PM → Notion; bidirectional
          sync is on the roadmap.
        </p>
        <button className="btn-primary mt-3" disabled={busy} onClick={startConnect}>
          Connect a Notion Database
        </button>
      </div>
    </div>
  );
}
