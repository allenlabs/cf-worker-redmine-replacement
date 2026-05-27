import { createFileRoute, getRouteApi, useRouter } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { z } from 'zod';
import { displayName, formatDate, handle } from '~/lib/format';
import { notifyError, notifySuccess } from '~/lib/toast';
import { buildAuthContext, getCurrentUser, getDb, getEnv } from '~/server/auth-runtime.server';
import {
  inviteTeamMember,
  loadTeamMembersImpl,
  removeTeamMember,
  setTeamMemberRole,
  TEAM_ROLE_OPTIONS,
} from '~/server/members';
import { getProjectImpl } from '~/server/projects';

const parentRoute = getRouteApi('/projects/$identifier');

// Inline server fn — TanStack Start 1.168.9 dispatch bug workaround.
const loadMembers = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => z.object({ identifier: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const me = await getCurrentUser();
    // Admins don't need the membership scan — skip it.
    const ctx = me && !me.isAdmin ? await buildAuthContext(me.id) : null;
    const db = getDb();
    const project = await getProjectImpl(db, me, ctx, data.identifier);
    const team = await loadTeamMembersImpl(db, getEnv(), project.id);
    // Whether the viewer can manage members governs which controls render.
    const canManage =
      !!me?.isAdmin || !!ctx?.permissionsByProject[project.id]?.has('manage_members');
    return { team, canManage };
  });

export const Route = createFileRoute('/projects/$identifier/members')({
  loader: ({ params }) => loadMembers({ data: { identifier: params.identifier } }),
  component: MembersPage,
});

const ROLE_LABELS: Record<string, string> = {
  viewer: 'Viewer',
  commenter: 'Commenter',
  contributor: 'Contributor',
  maintainer: 'Maintainer',
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

function MembersPage() {
  const project = parentRoute.useLoaderData();
  const { team, canManage } = Route.useLoaderData();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('viewer');
  const [busy, setBusy] = useState(false);

  async function invite() {
    if (!email) return;
    setBusy(true);
    try {
      await inviteTeamMember({ data: { projectId: project.id, email, role } });
      setEmail('');
      notifySuccess(`Invitation sent to ${email}`);
      router.invalidate();
    } catch (err) {
      notifyError(`Could not invite: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(targetUserId: string, newRole: string) {
    try {
      await setTeamMemberRole({ data: { projectId: project.id, targetUserId, role: newRole } });
      notifySuccess('Role updated');
      router.invalidate();
    } catch (err) {
      notifyError(`Could not update role: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function remove(targetUserId: string) {
    if (!confirm('Remove this member from the project?')) return;
    try {
      await removeTeamMember({ data: { projectId: project.id, targetUserId } });
      notifySuccess('Member removed');
      router.invalidate();
    } catch (err) {
      notifyError(`Could not remove member: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!team.teamId) {
    return (
      <div className="space-y-4">
        <header><h2 className="text-xl font-semibold">Members</h2></header>
        <p className="text-sm text-gray-500">
          This project isn’t linked to a collaboration team yet, so members can’t be
          managed here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header><h2 className="text-xl font-semibold">Members</h2></header>

      {canManage && (
        <div className="card p-3 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[14rem]">
            <label className="label">Invite by email</label>
            <input
              className="select"
              type="email"
              placeholder="person@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
              {TEAM_ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
              ))}
            </select>
          </div>
          <button className="btn-primary" onClick={invite} disabled={!email || busy}>
            Send invite
          </button>
        </div>
      )}

      {team.members.length === 0 ? (
        <p className="text-sm text-gray-500">No members yet.</p>
      ) : (
        <table className="data-table card">
          <thead>
            <tr><th>Member</th><th>Email</th><th>Role</th>{canManage && <th></th>}</tr>
          </thead>
          <tbody>
            {team.members.map((m) => {
              const name = displayName(m);
              const h = handle(m.username);
              return (
                <tr key={m.userId}>
                  <td>
                    {name}
                    {h && <span className="text-xs text-gray-400 ml-1">{h}</span>}
                  </td>
                  <td>{m.email}</td>
                  <td>
                    {canManage ? (
                      <select
                        className="select w-40"
                        value={m.role}
                        onChange={(e) => changeRole(m.userId, e.target.value)}
                      >
                        {TEAM_ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
                        ))}
                      </select>
                    ) : (
                      ROLE_LABELS[m.role] ?? m.role
                    )}
                  </td>
                  {canManage && (
                    <td>
                      <button className="btn-danger" onClick={() => remove(m.userId)}>
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {team.invitations.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">Pending invitations</h3>
          <table className="data-table card">
            <thead>
              <tr><th>Email</th><th>Role</th><th>Expires</th></tr>
            </thead>
            <tbody>
              {team.invitations.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.email}</td>
                  <td>{ROLE_LABELS[inv.role ?? ''] ?? inv.role ?? '—'}</td>
                  <td>{formatDate(inv.expiresAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
