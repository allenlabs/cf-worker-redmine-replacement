import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  type TestDB,
  insertProject,
  insertUser,
  makeTestDb,
} from '../_setup/db';
import { issues, journals, watchers } from '~/db/schema';
import { type CurrentUser } from '~/server/auth';
import {
  createIssueImpl,
  deleteIssueImpl,
  getIssueImpl,
  listIssuesImpl,
  updateIssueImpl,
  watchIssueImpl,
} from '~/server/issues';

let db: TestDB;
let alice: CurrentUser;
let projectId: number;

beforeEach(async () => {
  db = makeTestDb();
  const u = await insertUser(db, { login: 'alice' });
  alice = {
    id: u.id,
    login: u.login,
    email: u.email,
    firstname: '',
    lastname: '',
    isAdmin: false,
    avatarUrl: null,
  };
  const p = await insertProject(db);
  projectId = p.id;
});

async function seedIssue(overrides: Partial<{ subject: string; trackerId: number; description: string }> = {}) {
  return createIssueImpl(db, alice, {
    projectId,
    trackerId: overrides.trackerId ?? 1,
    subject: overrides.subject ?? 'A bug',
    description: overrides.description ?? 'It broke',
    doneRatio: 0,
  });
}

describe('createIssueImpl', () => {
  it('uses default status + priority when not provided', async () => {
    const i = await seedIssue();
    expect(i.statusId).toBe(1); // New (default in seed)
    expect(i.priorityId).toBe(2); // Normal (default in seed)
    expect(i.authorId).toBe(alice.id);
  });

  it('records a project activity', async () => {
    await seedIssue({ subject: 'log me' });
    const act = await db.query.activities.findFirst();
    expect(act?.kind).toBe('issue_created');
    expect(act?.title).toContain('log me');
  });

  it('honours explicit status/priority', async () => {
    const i = await createIssueImpl(db, alice, {
      projectId,
      trackerId: 1,
      subject: 'x',
      description: '',
      statusId: 3,
      priorityId: 4,
      doneRatio: 50,
    });
    expect(i.statusId).toBe(3);
    expect(i.priorityId).toBe(4);
    expect(i.doneRatio).toBe(50);
  });

  it('throws if default status/priority missing', async () => {
    // wipe seeded defaults
    await db.delete((await import('~/db/schema')).issueStatuses);
    await expect(seedIssue()).rejects.toThrow(/Default status/);
  });
});

describe('listIssuesImpl', () => {
  beforeEach(async () => {
    await seedIssue({ subject: 'open one' });
    const closed = await seedIssue({ subject: 'will close' });
    await db.update(issues).set({ statusId: 5 }).where(eq(issues.id, closed.id)); // Closed (is_closed=1)
    await seedIssue({ subject: 'second open' });
  });

  it('returns only open by default', async () => {
    const list = await listIssuesImpl(db, { projectId });
    expect(list.map((i) => i.subject).sort()).toEqual(['open one', 'second open']);
  });

  it('returns only closed when requested', async () => {
    const list = await listIssuesImpl(db, { projectId, statusFilter: 'closed' });
    expect(list.map((i) => i.subject)).toEqual(['will close']);
  });

  it('returns all when statusFilter=all', async () => {
    const list = await listIssuesImpl(db, { projectId, statusFilter: 'all' });
    expect(list).toHaveLength(3);
  });

  it('full-text matches subject and description', async () => {
    const list = await listIssuesImpl(db, { projectId, statusFilter: 'all', q: 'close' });
    expect(list.map((i) => i.subject)).toEqual(['will close']);
  });

  it('respects assignee + tracker filters', async () => {
    const u = await insertUser(db, { login: 'bob', email: 'b@x.test' });
    const mine = await seedIssue({ subject: 'mine' });
    await db.update(issues).set({ assignedToId: u.id }).where(eq(issues.id, mine.id));
    const a = await listIssuesImpl(db, { projectId, statusFilter: 'all', assignee: u.id });
    expect(a.map((i) => i.subject)).toEqual(['mine']);
    const t = await listIssuesImpl(db, { projectId, statusFilter: 'all', tracker: 1 });
    expect(t.length).toBeGreaterThan(0);
  });

  it('supports priority and id sort orders', async () => {
    const byPriority = await listIssuesImpl(db, { projectId, statusFilter: 'all', sort: 'priority' });
    expect(byPriority.length).toBe(3);
    const byId = await listIssuesImpl(db, { projectId, statusFilter: 'all', sort: 'id' });
    expect(byId[0]!.id).toBeGreaterThan(byId[byId.length - 1]!.id);
  });
});

describe('getIssueImpl', () => {
  it('returns hydrated issue with journals and children', async () => {
    const parent = await seedIssue({ subject: 'parent' });
    const child = await seedIssue({ subject: 'child' });
    await db.update(issues).set({ parentId: parent.id }).where(eq(issues.id, child.id));
    await updateIssueImpl(db, alice, { id: parent.id, notes: 'hello', changes: {} });

    const r = await getIssueImpl(db, parent.id);
    expect(r.issue.subject).toBe('parent');
    expect(r.children.map((c) => c.subject)).toEqual(['child']);
    expect(r.journals).toHaveLength(1);
    expect(r.journals[0]!.notes).toBe('hello');
    expect(r.tracker?.name).toBe('Bug');
  });

  it('throws when issue is missing', async () => {
    await expect(getIssueImpl(db, 99999)).rejects.toThrow(/not found/);
  });
});

describe('updateIssueImpl', () => {
  it('writes journal_details for changed fields', async () => {
    const i = await seedIssue();
    await updateIssueImpl(db, alice, {
      id: i.id,
      notes: '',
      changes: { statusId: 2, doneRatio: 25 },
    });
    const j = await db.query.journals.findFirst({ where: eq(journals.issueId, i.id) });
    expect(j).toBeDefined();
    const details = await db.query.journalDetails.findMany();
    const props = details.map((d) => d.prop_key);
    expect(props).toContain('status');
    expect(props).toContain('done_ratio');
  });

  it('skips unchanged fields and unknown keys', async () => {
    const i = await seedIssue();
    await updateIssueImpl(db, alice, {
      id: i.id,
      notes: '',
      changes: { statusId: i.statusId, bogus: 'x' },
    });
    const journalsForIssue = await db.query.journals.findMany({
      where: eq(journals.issueId, i.id),
    });
    // no real changes -> no journal
    expect(journalsForIssue).toHaveLength(0);
  });

  it('sets closedAt when transitioning to a closed status', async () => {
    const i = await seedIssue();
    const updated = await updateIssueImpl(db, alice, {
      id: i.id,
      notes: '',
      changes: { statusId: 5 }, // Closed
    });
    expect(updated.closedAt).not.toBeNull();
  });

  it('records comment_added when only notes provided', async () => {
    const i = await seedIssue();
    await updateIssueImpl(db, alice, { id: i.id, notes: 'looks good', changes: {} });
    const act = await db.query.activities.findMany();
    const comment = act.find((a) => a.kind === 'comment_added');
    expect(comment?.title).toContain('alice');
  });

  it('throws on missing issue', async () => {
    await expect(
      updateIssueImpl(db, alice, { id: 99999, notes: '', changes: { statusId: 2 } }),
    ).rejects.toThrow(/not found/);
  });
});

describe('watchIssueImpl', () => {
  it('toggles a watcher on and off', async () => {
    const i = await seedIssue();
    await watchIssueImpl(db, alice, i.id, true);
    expect(await db.query.watchers.findMany({ where: eq(watchers.issueId, i.id) })).toHaveLength(1);
    await watchIssueImpl(db, alice, i.id, false);
    expect(await db.query.watchers.findMany({ where: eq(watchers.issueId, i.id) })).toHaveLength(0);
  });

  it('is idempotent on double-watch', async () => {
    const i = await seedIssue();
    await watchIssueImpl(db, alice, i.id, true);
    await watchIssueImpl(db, alice, i.id, true);
    expect(await db.query.watchers.findMany({ where: eq(watchers.issueId, i.id) })).toHaveLength(1);
  });
});

describe('deleteIssueImpl', () => {
  it('removes the issue', async () => {
    const i = await seedIssue();
    await deleteIssueImpl(db, i.id);
    expect(await db.query.issues.findFirst({ where: eq(issues.id, i.id) })).toBeUndefined();
  });
});
