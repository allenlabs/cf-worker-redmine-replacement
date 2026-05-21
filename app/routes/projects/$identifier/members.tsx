import { createFileRoute, getRouteApi, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { formatDate } from '~/lib/format';
import {
  addMember,
  changeMemberRole,
  listAllUsers,
  listMembers,
  listRoles,
  removeMember,
} from '~/server/members';

const parentRoute = getRouteApi('/projects/$identifier');

export const Route = createFileRoute('/projects/$identifier/members')({
  loader: async () => {
    const project = await parentRoute.useLoaderData;
    const projectId = (project as any).id;
    const [members, users, roles] = await Promise.all([
      listMembers({ data: { projectId } }),
      listAllUsers(),
      listRoles(),
    ]);
    return { members, users, roles };
  },
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
    await addMember({ data: { projectId: project.id, userId: Number(userId), roleId } });
    setUserId('');
    router.invalidate();
  }

  async function remove(memberId: number) {
    if (!confirm('Remove this member?')) return;
    await removeMember({ data: { memberId, projectId: project.id } });
    router.invalidate();
  }

  async function changeRole(memberId: number, newRoleId: number) {
    await changeMemberRole({ data: { memberId, projectId: project.id, roleId: newRoleId } });
    router.invalidate();
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
