import { createFileRoute, getRouteApi, useRouter } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { z } from 'zod';
import { formatDate } from '~/lib/format';
import { notifyError, notifySuccess } from '~/lib/toast';
import { buildAuthContext, getCurrentUser, getDb } from '~/server/auth-runtime.server';
import {
  addMember,
  changeMemberRole,
  listAllUsersImpl,
  listMembersImpl,
  listRolesImpl,
  removeMember,
} from '~/server/members';
import { getProjectImpl } from '~/server/projects';

const parentRoute = getRouteApi('/projects/$identifier');

// Inline server fn — TanStack Start 1.168.9 dispatch bug workaround.
const loadMembers = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => z.object({ identifier: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const me = await getCurrentUser();
    const ctx = me ? await buildAuthContext(me.id) : null;
    const db = getDb();
    const project = await getProjectImpl(db, me, ctx, data.identifier);
    const [members, users, roles] = await Promise.all([
      listMembersImpl(db, project.id),
      listAllUsersImpl(db),
      listRolesImpl(db),
    ]);
    return { members, users, roles };
  });

export const Route = createFileRoute('/projects/$identifier/members')({
  loader: ({ params }) => loadMembers({ data: { identifier: params.identifier } }),
  component: MembersPage,
});

function MembersPage() {
  const project = parentRoute.useLoaderData();
  const { members, users, roles } = Route.useLoaderData();
  const router = useRouter();
  const [userId, setUserId] = useState<number | ''>('');
  const [roleId, setRoleId] = useState<number>(roles[0]?.id ?? 0);

  const memberUserIds = new Set(members.map((m) => m.userId));
  const candidates = users.filter((u) => !memberUserIds.has(u.id));

  async function add() {
    if (!userId || !roleId) return;
    try {
      await addMember({ data: { projectId: project.id, userId: Number(userId), roleId } });
      setUserId('');
      notifySuccess('Member added');
      router.invalidate();
    } catch (err) {
      notifyError(`Could not add member: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function remove(memberId: number) {
    if (!confirm('Remove this member?')) return;
    try {
      await removeMember({ data: { memberId, projectId: project.id } });
      notifySuccess('Member removed');
      router.invalidate();
    } catch (err) {
      notifyError(`Could not remove member: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function changeRole(memberId: number, newRoleId: number) {
    try {
      await changeMemberRole({ data: { memberId, projectId: project.id, roleId: newRoleId } });
      notifySuccess('Role updated');
      router.invalidate();
    } catch (err) {
      notifyError(`Could not update role: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div className="space-y-4">
      <header><h2 className="text-xl font-semibold">Members</h2></header>

      <div className="card p-3 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[12rem]">
          <label className="label">User</label>
          <select className="select" value={userId} onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">— pick a user —</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>{u.login} ({u.email})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Role</label>
          <select className="select" value={roleId} onChange={(e) => setRoleId(Number(e.target.value))}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <button className="btn-primary" onClick={add} disabled={!userId}>Add member</button>
      </div>

      {members.length === 0 ? (
        <p className="text-sm text-gray-500">No members.</p>
      ) : (
        <table className="data-table card">
          <thead>
            <tr><th>User</th><th>Email</th><th>Role</th><th>Joined</th><th></th></tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.login}</td>
                <td>{m.email}</td>
                <td>
                  <select
                    className="select w-40"
                    value={m.roleId}
                    onChange={(e) => changeRole(m.id, Number(e.target.value))}
                  >
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </td>
                <td>{formatDate(m.createdAt)}</td>
                <td><button className="btn-danger" onClick={() => remove(m.id)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
