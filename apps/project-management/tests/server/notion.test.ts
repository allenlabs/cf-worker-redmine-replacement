import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  type TestDB,
  insertProject,
  insertUser,
  makeTestDb,
} from '../_setup/db';
import {
  issueCategories,
  notionConnections,
  notionIssueLinks,
  versions,
  type NotionMapping,
} from '~/db/schema';
import { type CurrentUser } from '~/server/auth';
import { createIssueImpl, updateIssueImpl } from '~/server/issues';
import {
  PM_FIELDS,
  buildProperties,
  buildPropertyValue,
  connectProjectImpl,
  disconnectProjectImpl,
  getConnectionImpl,
  inspectDatabase,
  listDatabases,
  loadIssueBundleImpl,
  pushIssue,
  pushIssueBackground,
  suggestMapping,
  type NotionProperty,
} from '~/server/notion';
import type { Env } from '~/lib/env';

let db: TestDB;
let alice: CurrentUser;
let projectId: number;

beforeEach(async () => {
  db = await makeTestDb();
  const u = await insertUser(db, { login: 'alice', email: 'alice@example.com' });
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

function fakeEnv(token?: string): Env {
  return { NOTION_TOKEN: token } as unknown as Env;
}

// ---------- suggestMapping ----------

describe('suggestMapping', () => {
  it('returns null for every field when notion props are empty', () => {
    const mapping = suggestMapping(PM_FIELDS, {});
    for (const f of PM_FIELDS) expect(mapping.fields[f.key]).toBeNull();
  });

  it('matches subject -> the title property by type, regardless of name', () => {
    const props: Record<string, NotionProperty> = {
      Name: { id: 't1', name: 'Name', type: 'title' },
    };
    const m = suggestMapping(PM_FIELDS, props);
    expect(m.fields.subject).toEqual({
      propertyId: 't1',
      propertyName: 'Name',
      propertyType: 'title',
    });
  });

  it('prefers an exact normalized name match over the first compatible', () => {
    const props: Record<string, NotionProperty> = {
      'Notes': { id: 'n', name: 'Notes', type: 'rich_text' },
      'Description': { id: 'd', name: 'Description', type: 'rich_text' },
    };
    const m = suggestMapping(PM_FIELDS, props);
    expect(m.fields.description?.propertyId).toBe('d');
  });

  it('matches by label (case + space insensitive)', () => {
    const props: Record<string, NotionProperty> = {
      'Due Date': { id: 'dd', name: 'Due Date', type: 'date' },
      'Sprint Start': { id: 'ss', name: 'Sprint Start', type: 'date' },
    };
    const m = suggestMapping(PM_FIELDS, props);
    expect(m.fields.dueDate?.propertyId).toBe('dd');
  });

  it('respects type compatibility — never picks a wrong-typed property', () => {
    const props: Record<string, NotionProperty> = {
      'Estimated hours': { id: 'eh', name: 'Estimated hours', type: 'rich_text' },
    };
    const m = suggestMapping(PM_FIELDS, props);
    expect(m.fields.estimatedHours).toBeNull();
  });

  it('falls back to the first compatible property when no name matches', () => {
    const props: Record<string, NotionProperty> = {
      'Foo': { id: 'foo', name: 'Foo', type: 'select' },
      'Bar': { id: 'bar', name: 'Bar', type: 'select' },
    };
    const m = suggestMapping(PM_FIELDS, props);
    // category, fixedVersion, tracker, priority all accept select
    expect(m.fields.category?.propertyId).toBe('foo');
  });

  it('maps every PM field across a realistic database shape', () => {
    const props: Record<string, NotionProperty> = {
      Name: { id: 'p1', name: 'Name', type: 'title' },
      Description: { id: 'p2', name: 'Description', type: 'rich_text' },
      Status: { id: 'p3', name: 'Status', type: 'status' },
      Tracker: { id: 'p4', name: 'Tracker', type: 'select' },
      Priority: { id: 'p5', name: 'Priority', type: 'select' },
      Assignee: { id: 'p6', name: 'Assignee', type: 'people' },
      'Due date': { id: 'p7', name: 'Due date', type: 'date' },
      'Start date': { id: 'p8', name: 'Start date', type: 'date' },
      'Estimated hours': { id: 'p9', name: 'Estimated hours', type: 'number' },
      'Done %': { id: 'p10', name: 'Done %', type: 'number' },
      Category: { id: 'p11', name: 'Category', type: 'select' },
      'Fixed version': { id: 'p12', name: 'Fixed version', type: 'select' },
      'Created at': { id: 'p13', name: 'Created at', type: 'created_time' },
      'PM id': { id: 'p14', name: 'PM id', type: 'rich_text' },
    };
    const m = suggestMapping(PM_FIELDS, props);
    for (const f of PM_FIELDS) {
      expect(m.fields[f.key], `missing for ${f.key}`).not.toBeNull();
    }
  });
});

// ---------- buildPropertyValue ----------

describe('buildPropertyValue', () => {
  it('builds title payload', async () => {
    const r = await buildPropertyValue('subject', 'Hello', 'title');
    expect(r).toEqual({
      title: [{ type: 'text', text: { content: 'Hello' } }],
    });
  });

  it('builds rich_text payload + truncates beyond 2000 chars', async () => {
    const big = 'x'.repeat(2500);
    const r = await buildPropertyValue('description', big, 'rich_text');
    const content = (r as { rich_text: Array<{ text: { content: string } }> }).rich_text[0]?.text
      .content;
    expect(content?.length).toBe(2000);
  });

  it('builds select', async () => {
    expect(await buildPropertyValue('tracker', 'Bug', 'select')).toEqual({
      select: { name: 'Bug' },
    });
  });

  it('builds status', async () => {
    expect(await buildPropertyValue('status', 'In progress', 'status')).toEqual({
      status: { name: 'In progress' },
    });
  });

  it('builds multi_select from an array', async () => {
    expect(await buildPropertyValue('x', ['a', 'b'], 'multi_select')).toEqual({
      multi_select: [{ name: 'a' }, { name: 'b' }],
    });
  });

  it('wraps a scalar value into a single-item multi_select', async () => {
    expect(await buildPropertyValue('x', 'one', 'multi_select')).toEqual({
      multi_select: [{ name: 'one' }],
    });
  });

  it('builds date with ISO start', async () => {
    expect(await buildPropertyValue('dueDate', '2026-05-23', 'date')).toEqual({
      date: { start: '2026-05-23' },
    });
  });

  it('builds number from string and rejects NaN', async () => {
    expect(await buildPropertyValue('doneRatio', '50', 'number')).toEqual({ number: 50 });
    expect(await buildPropertyValue('doneRatio', 'abc', 'number')).toEqual({ number: null });
  });

  it('builds number from native number', async () => {
    expect(await buildPropertyValue('doneRatio', 75, 'number')).toEqual({ number: 75 });
  });

  it('builds checkbox', async () => {
    expect(await buildPropertyValue('x', true, 'checkbox')).toEqual({ checkbox: true });
  });

  it('builds url/email/phone_number', async () => {
    expect(await buildPropertyValue('x', 'https://x', 'url')).toEqual({ url: 'https://x' });
    expect(await buildPropertyValue('x', 'a@b.c', 'email')).toEqual({ email: 'a@b.c' });
    expect(await buildPropertyValue('x', '+123', 'phone_number')).toEqual({
      phone_number: '+123',
    });
  });

  it('skips read-only types', async () => {
    expect(await buildPropertyValue('x', 'v', 'created_time')).toBeUndefined();
    expect(await buildPropertyValue('x', 'v', 'last_edited_time')).toBeUndefined();
    expect(await buildPropertyValue('x', 'v', 'formula')).toBeUndefined();
    expect(await buildPropertyValue('x', 'v', 'rollup')).toBeUndefined();
  });

  it('warns and skips unknown types', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await buildPropertyValue('x', 'v', 'mystery')).toBeUndefined();
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it('resolves people to a notion user id', async () => {
    const r = await buildPropertyValue('assignedTo', 'a@b.c', 'people', {
      resolvePersonId: async (email) => (email === 'a@b.c' ? 'user-1' : null),
    });
    expect(r).toEqual({ people: [{ id: 'user-1' }] });
  });

  it('returns undefined when people email cannot be resolved', async () => {
    const r = await buildPropertyValue('assignedTo', 'unknown@x.y', 'people', {
      resolvePersonId: async () => null,
    });
    expect(r).toBeUndefined();
  });

  it('returns undefined when no person resolver is provided', async () => {
    const r = await buildPropertyValue('assignedTo', 'a@b.c', 'people');
    expect(r).toBeUndefined();
  });

  it('clears value when input is null/empty for each clearable type', async () => {
    expect(await buildPropertyValue('x', null, 'select')).toEqual({ select: null });
    expect(await buildPropertyValue('x', null, 'status')).toEqual({ status: null });
    expect(await buildPropertyValue('x', null, 'multi_select')).toEqual({ multi_select: [] });
    expect(await buildPropertyValue('x', null, 'date')).toEqual({ date: null });
    expect(await buildPropertyValue('x', null, 'people')).toEqual({ people: [] });
    expect(await buildPropertyValue('x', null, 'number')).toEqual({ number: null });
    expect(await buildPropertyValue('x', null, 'checkbox')).toEqual({ checkbox: false });
    expect(await buildPropertyValue('x', null, 'url')).toEqual({ url: null });
    expect(await buildPropertyValue('x', null, 'email')).toEqual({ email: null });
    expect(await buildPropertyValue('x', null, 'phone_number')).toEqual({ phone_number: null });
    expect(await buildPropertyValue('x', null, 'rich_text')).toEqual({ rich_text: [] });
    expect(await buildPropertyValue('x', null, 'title')).toEqual({ title: [] });
    expect(await buildPropertyValue('x', '', 'created_time')).toBeUndefined();
    expect(await buildPropertyValue('x', null, 'unknown-type')).toBeUndefined();
  });
});

// ---------- buildProperties (end-to-end mapping) ----------

describe('buildProperties', () => {
  const mapping: NotionMapping = {
    fields: {
      subject: { propertyId: 't', propertyName: 'Name', propertyType: 'title' },
      description: { propertyId: 'd', propertyName: 'Description', propertyType: 'rich_text' },
      status: { propertyId: 's', propertyName: 'Status', propertyType: 'status' },
      tracker: { propertyId: 'tr', propertyName: 'Tracker', propertyType: 'select' },
      priority: { propertyId: 'p', propertyName: 'Priority', propertyType: 'select' },
      assignedTo: { propertyId: 'a', propertyName: 'Assignee', propertyType: 'people' },
      dueDate: { propertyId: 'dd', propertyName: 'Due date', propertyType: 'date' },
      startDate: { propertyId: 'sd', propertyName: 'Start date', propertyType: 'date' },
      estimatedHours: { propertyId: 'eh', propertyName: 'Est', propertyType: 'number' },
      doneRatio: { propertyId: 'dr', propertyName: 'Done %', propertyType: 'number' },
      category: { propertyId: 'c', propertyName: 'Category', propertyType: 'select' },
      fixedVersion: { propertyId: 'fv', propertyName: 'Fixed version', propertyType: 'select' },
      createdAt: null,
      pmId: { propertyId: 'pm', propertyName: 'PM id', propertyType: 'rich_text' },
    },
  };

  it('builds a full property set when the assignee resolves to a Notion user', async () => {
    const out = await buildProperties(
      {
        id: 7,
        subject: 'Hello',
        description: 'world',
        statusName: 'New',
        trackerName: 'Bug',
        priorityName: 'High',
        assigneeEmail: 'a@b.c',
        dueDate: '2026-05-23',
        startDate: '2026-05-01',
        estimatedHours: 4.5,
        doneRatio: 25,
        categoryName: 'UI',
        fixedVersionName: 'v1',
        projectId: 1,
        createdAt: new Date(0),
      },
      mapping,
      { resolvePersonId: async () => 'notion-user-1' },
    );
    expect(out.Name).toEqual({
      title: [{ type: 'text', text: { content: 'Hello' } }],
    });
    expect(out.Assignee).toEqual({ people: [{ id: 'notion-user-1' }] });
    expect(out['PM id']).toEqual({
      rich_text: [{ type: 'text', text: { content: 'PM-7' } }],
    });
    expect(out['Done %']).toEqual({ number: 25 });
  });

  it('falls back to writing the email into description when people-resolution fails', async () => {
    const out = await buildProperties(
      {
        id: 1,
        subject: 's',
        description: 'orig desc',
        statusName: null,
        trackerName: null,
        priorityName: null,
        assigneeEmail: 'x@y.z',
        dueDate: null,
        startDate: null,
        estimatedHours: null,
        doneRatio: 0,
        categoryName: null,
        fixedVersionName: null,
        projectId: 1,
        createdAt: new Date(0),
      },
      mapping,
      { resolvePersonId: async () => null },
    );
    // Description property is overwritten with the @email fallback
    const rt = (
      out.Description as { rich_text: Array<{ text: { content: string } }> }
    ).rich_text[0]?.text.content;
    expect(rt).toBe('@x@y.z');
  });

  it('does not include unmapped fields and skips null targets', async () => {
    const out = await buildProperties(
      {
        id: 1,
        subject: 's',
        description: '',
        statusName: null,
        trackerName: null,
        priorityName: null,
        assigneeEmail: null,
        dueDate: null,
        startDate: null,
        estimatedHours: null,
        doneRatio: 0,
        categoryName: null,
        fixedVersionName: null,
        projectId: 1,
        createdAt: new Date(0),
      },
      { fields: { ...mapping.fields, createdAt: null } },
    );
    // unmapped createdAt is absent
    expect(Object.keys(out)).not.toContain('createdAt');
  });

  it('skips assignee fallback when no description mapping exists', async () => {
    const minimal: NotionMapping = {
      fields: {
        assignedTo: { propertyId: 'a', propertyName: 'Assignee', propertyType: 'people' },
      },
    };
    const out = await buildProperties(
      {
        id: 1,
        subject: 's',
        description: '',
        statusName: null,
        trackerName: null,
        priorityName: null,
        assigneeEmail: 'x@y.z',
        dueDate: null,
        startDate: null,
        estimatedHours: null,
        doneRatio: 0,
        categoryName: null,
        fixedVersionName: null,
        projectId: 1,
        createdAt: new Date(0),
      },
      minimal,
      { resolvePersonId: async () => null },
    );
    expect(out).toEqual({});
  });
});

// ---------- Connection upserts ----------

describe('connection impls', () => {
  it('inserts then updates the same row on second connect', async () => {
    const mapping: NotionMapping = { fields: { subject: null } };
    const first = await connectProjectImpl(db, projectId, 'db1', 'Db One', mapping);
    const second = await connectProjectImpl(db, projectId, 'db2', 'Db Two', mapping);
    expect(second.id).toBe(first.id);
    expect(second.databaseId).toBe('db2');
    expect(second.databaseTitle).toBe('Db Two');
  });

  it('disconnect removes the row + getConnection returns null', async () => {
    await connectProjectImpl(db, projectId, 'db', 'D', { fields: {} });
    expect((await getConnectionImpl(db, projectId))?.databaseId).toBe('db');
    await disconnectProjectImpl(db, projectId);
    expect(await getConnectionImpl(db, projectId)).toBeNull();
  });
});

// ---------- loadIssueBundle ----------

describe('loadIssueBundleImpl', () => {
  it('returns null for a missing issue', async () => {
    expect(await loadIssueBundleImpl(db, 9999)).toBeNull();
  });

  it('resolves all fk-backed labels including version + category', async () => {
    const [cat] = await db
      .insert(issueCategories)
      .values({ projectId, name: 'UI' })
      .returning();
    const [ver] = await db
      .insert(versions)
      .values({ projectId, name: 'v1' })
      .returning();
    const assignee = await insertUser(db, { login: 'bob', email: 'bob@x.y' });
    const issue = await createIssueImpl(db, alice, {
      projectId,
      trackerId: 1,
      subject: 'A bug',
      description: 'desc',
      doneRatio: 10,
      assignedToId: assignee.id,
      categoryId: cat!.id,
      fixedVersionId: ver!.id,
      dueDate: '2026-05-30',
      startDate: '2026-05-23',
      estimatedHours: 2.5,
    });
    const bundle = await loadIssueBundleImpl(db, issue.id);
    expect(bundle?.statusName).toBeTruthy();
    expect(bundle?.trackerName).toBeTruthy();
    expect(bundle?.priorityName).toBeTruthy();
    expect(bundle?.assigneeEmail).toBe('bob@x.y');
    expect(bundle?.categoryName).toBe('UI');
    expect(bundle?.fixedVersionName).toBe('v1');
    expect(bundle?.dueDate).toBe('2026-05-30');
    expect(bundle?.startDate).toBe('2026-05-23');
    expect(bundle?.estimatedHours).toBe(2.5);
  });

  it('returns null fk fields when none are set', async () => {
    const issue = await createIssueImpl(db, alice, {
      projectId,
      trackerId: 1,
      subject: 'naked',
      description: '',
      doneRatio: 0,
    });
    const b = await loadIssueBundleImpl(db, issue.id);
    expect(b?.assigneeEmail).toBeNull();
    expect(b?.categoryName).toBeNull();
    expect(b?.fixedVersionName).toBeNull();
    expect(b?.dueDate).toBeNull();
    expect(b?.startDate).toBeNull();
    expect(b?.estimatedHours).toBeNull();
  });
});

// ---------- listDatabases / inspectDatabase (mocked fetch) ----------

describe('Notion API wrappers', () => {
  it('listDatabases POSTs /search and extracts titles', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { id: 'd1', title: [{ plain_text: 'Issues' }] },
            { id: 'd2', title: [{ plain_text: 'Tasks' }, { plain_text: '!' }] },
            { id: 'd3' },
          ],
        }),
        { status: 200 },
      ),
    );
    const out = await listDatabases(fakeEnv('tok'));
    expect(out).toEqual([
      { id: 'd1', title: 'Issues' },
      { id: 'd2', title: 'Tasks!' },
      { id: 'd3', title: '(untitled)' },
    ]);
    const call = fetchSpy.mock.calls[0]!;
    expect(call[0]).toBe('https://api.notion.com/v1/search');
    expect((call[1] as RequestInit).method).toBe('POST');
    fetchSpy.mockRestore();
  });

  it('inspectDatabase GETs /databases and returns property map', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          title: [{ plain_text: 'Issues' }],
          properties: {
            Name: { id: 't', name: 'Name', type: 'title' },
            S: { id: 's', name: 'S', type: 'status' },
          },
        }),
        { status: 200 },
      ),
    );
    const info = await inspectDatabase(fakeEnv('tok'), 'db1');
    expect(info.title).toBe('Issues');
    expect(info.properties.Name?.type).toBe('title');
    vi.restoreAllMocks();
  });

  it('throws NotionApiError on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not found', { status: 404 }),
    );
    await expect(inspectDatabase(fakeEnv('tok'), 'bad')).rejects.toThrow(/404/);
    vi.restoreAllMocks();
  });

  it('listDatabases without token throws', async () => {
    await expect(listDatabases(fakeEnv(undefined))).rejects.toThrow(/NOTION_TOKEN/);
  });

  it('inspectDatabase tolerates empty title + properties payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    const info = await inspectDatabase(fakeEnv('tok'), 'db1');
    expect(info.title).toBe('(untitled)');
    expect(info.properties).toEqual({});
    vi.restoreAllMocks();
  });

  it('inspectDatabase falls back to the key when the property name is absent', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          properties: { 'Foo': { id: 'f', type: 'select' } },
        }),
        { status: 200 },
      ),
    );
    const info = await inspectDatabase(fakeEnv('tok'), 'db1');
    expect(info.properties.Foo?.name).toBe('Foo');
    vi.restoreAllMocks();
  });

  it('listDatabases handles missing results array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    const out = await listDatabases(fakeEnv('tok'));
    expect(out).toEqual([]);
    vi.restoreAllMocks();
  });

  it('surfaces a sane error body even when read() rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.reject(new Error('socket reset')),
    } as unknown as Response);
    await expect(listDatabases(fakeEnv('tok'))).rejects.toThrow(/500/);
    vi.restoreAllMocks();
  });
});

// ---------- pushIssue (mocked fetch) ----------

describe('pushIssue', () => {
  async function seedConnection(extra?: Partial<NotionMapping['fields']>) {
    const mapping: NotionMapping = {
      fields: {
        subject: { propertyId: 't', propertyName: 'Name', propertyType: 'title' },
        pmId: { propertyId: 'pm', propertyName: 'PM id', propertyType: 'rich_text' },
        ...extra,
      },
    };
    await connectProjectImpl(db, projectId, 'db1', 'Issues', mapping);
  }

  it('short-circuits without a token', async () => {
    const r = await pushIssue(fakeEnv(undefined), db, 1);
    expect(r).toEqual({ ok: false, reason: 'no-token' });
  });

  it('reports missing issue', async () => {
    const r = await pushIssue(fakeEnv('tok'), db, 9999);
    expect(r).toEqual({ ok: false, reason: 'missing-issue' });
  });

  it('reports no-connection when the project is not linked', async () => {
    const issue = await createIssueImpl(db, alice, {
      projectId,
      trackerId: 1,
      subject: 's',
      description: '',
      doneRatio: 0,
    });
    const r = await pushIssue(fakeEnv('tok'), db, issue.id);
    expect(r).toEqual({ ok: false, reason: 'no-connection' });
  });

  it('creates a new Notion page on the first push and stores the link', async () => {
    await seedConnection();
    const issue = await createIssueImpl(db, alice, {
      projectId,
      trackerId: 1,
      subject: 'first',
      description: '',
      doneRatio: 0,
    });
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ id: 'page-1' }), { status: 200 }),
    );
    const r = await pushIssue(fakeEnv('tok'), db, issue.id, {
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(r).toEqual({ ok: true, pageId: 'page-1', created: true });
    expect(fetcher).toHaveBeenCalledOnce();
    const link = await db.query.notionIssueLinks.findFirst({
      where: eq(notionIssueLinks.issueId, issue.id),
    });
    expect(link?.pageId).toBe('page-1');
  });

  it('PATCHes the existing page on second push and bumps syncedAt', async () => {
    await seedConnection();
    const issue = await createIssueImpl(db, alice, {
      projectId,
      trackerId: 1,
      subject: 'first',
      description: '',
      doneRatio: 0,
    });
    await db.insert(notionIssueLinks).values({ issueId: issue.id, pageId: 'existing' });
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({}), { status: 200 }),
    );
    const r = await pushIssue(fakeEnv('tok'), db, issue.id, {
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(r).toEqual({ ok: true, pageId: 'existing', created: false });
    const call = fetcher.mock.calls[0]!;
    expect(String(call[0])).toContain('/pages/existing');
    expect((call[1] as RequestInit).method).toBe('PATCH');
  });

  it('throws on non-2xx during create', async () => {
    await seedConnection();
    const issue = await createIssueImpl(db, alice, {
      projectId,
      trackerId: 1,
      subject: 'x',
      description: '',
      doneRatio: 0,
    });
    const fetcher = vi.fn(async () => new Response('bad', { status: 400 }));
    await expect(
      pushIssue(fakeEnv('tok'), db, issue.id, { fetcher: fetcher as unknown as typeof fetch }),
    ).rejects.toThrow(/400/);
  });

  it('throws on non-2xx during update', async () => {
    await seedConnection();
    const issue = await createIssueImpl(db, alice, {
      projectId,
      trackerId: 1,
      subject: 'x',
      description: '',
      doneRatio: 0,
    });
    await db.insert(notionIssueLinks).values({ issueId: issue.id, pageId: 'existing' });
    const fetcher = vi.fn(async () => new Response('boom', { status: 500 }));
    await expect(
      pushIssue(fakeEnv('tok'), db, issue.id, { fetcher: fetcher as unknown as typeof fetch }),
    ).rejects.toThrow(/500/);
  });

  it('resolves the assignee email via /v1/users when people-mapped', async () => {
    await seedConnection({
      assignedTo: { propertyId: 'a', propertyName: 'Assignee', propertyType: 'people' },
    });
    const assignee = await insertUser(db, {
      login: 'bob',
      email: 'bob@example.com',
    });
    const issue = await createIssueImpl(db, alice, {
      projectId,
      trackerId: 1,
      subject: 'x',
      description: '',
      doneRatio: 0,
      assignedToId: assignee.id,
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              { id: 'nu-1', type: 'person', person: { email: 'bob@example.com' } },
            ],
          }),
          { status: 200 },
        ),
      );
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ id: 'p1' }), { status: 200 }),
    );
    await pushIssue(fakeEnv('tok'), db, issue.id, {
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const sentBody = JSON.parse(
      (fetcher.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(sentBody.properties.Assignee).toEqual({ people: [{ id: 'nu-1' }] });
    fetchSpy.mockRestore();
  });

  it('catches errors from the user-lookup endpoint silently', async () => {
    await seedConnection({
      assignedTo: { propertyId: 'a', propertyName: 'Assignee', propertyType: 'people' },
    });
    const assignee = await insertUser(db, {
      login: 'bob',
      email: 'bob@example.com',
    });
    const issue = await createIssueImpl(db, alice, {
      projectId,
      trackerId: 1,
      subject: 'x',
      description: '',
      doneRatio: 0,
      assignedToId: assignee.id,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('nope', { status: 500 }),
    );
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ id: 'p1' }), { status: 200 }),
    );
    const r = await pushIssue(fakeEnv('tok'), db, issue.id, {
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(r).toEqual({ ok: true, pageId: 'p1', created: true });
    vi.restoreAllMocks();
  });
});

// ---------- pushIssueBackground ----------

describe('pushIssueBackground', () => {
  it('resolves successfully', async () => {
    await connectProjectImpl(db, projectId, 'db', 'd', {
      fields: { subject: { propertyId: 't', propertyName: 'Name', propertyType: 'title' } },
    });
    const issue = await createIssueImpl(db, alice, {
      projectId,
      trackerId: 1,
      subject: 's',
      description: '',
      doneRatio: 0,
    });
    // Stub global fetch so the background push has something to call into.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'pg' }), { status: 200 }),
    );
    await pushIssueBackground(fakeEnv('tok'), db, issue.id);
    vi.restoreAllMocks();
  });

  it('swallows + logs errors instead of rejecting', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await connectProjectImpl(db, projectId, 'db', 'd', {
      fields: { subject: { propertyId: 't', propertyName: 'Name', propertyType: 'title' } },
    });
    const issue = await createIssueImpl(db, alice, {
      projectId,
      trackerId: 1,
      subject: 's',
      description: '',
      doneRatio: 0,
    });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    await pushIssueBackground(fakeEnv('tok'), db, issue.id);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('logs non-Error rejections too', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await connectProjectImpl(db, projectId, 'db', 'd', {
      fields: { subject: { propertyId: 't', propertyName: 'Name', propertyType: 'title' } },
    });
    const issue = await createIssueImpl(db, alice, {
      projectId,
      trackerId: 1,
      subject: 's',
      description: '',
      doneRatio: 0,
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.reject('not-an-error'),
    );
    await pushIssueBackground(fakeEnv('tok'), db, issue.id);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
    vi.restoreAllMocks();
  });
});

// ---------- post-create / post-update hooks (via impls + push manually) ----------

describe('issue impls remain unaffected by Notion integration', () => {
  it('create issue still works without a connection (fast path)', async () => {
    const issue = await createIssueImpl(db, alice, {
      projectId,
      trackerId: 1,
      subject: 's',
      description: '',
      doneRatio: 0,
    });
    expect(issue.id).toBeGreaterThan(0);
  });

  it('update issue still works without a connection', async () => {
    const issue = await createIssueImpl(db, alice, {
      projectId,
      trackerId: 1,
      subject: 's',
      description: '',
      doneRatio: 0,
    });
    const updated = await updateIssueImpl(db, alice, {
      id: issue.id,
      notes: '',
      changes: { subject: 'changed' },
    });
    expect(updated.subject).toBe('changed');
  });

  it('connection table row gets cascade-deleted with the project', async () => {
    await connectProjectImpl(db, projectId, 'db', 'd', { fields: {} });
    await db.delete((await import('~/db/schema')).projects).where(eq((await import('~/db/schema')).projects.id, projectId));
    const r = await db
      .select()
      .from(notionConnections)
      .where(eq(notionConnections.projectId, projectId));
    expect(r).toEqual([]);
  });
});
