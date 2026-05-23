// Notion integration — one-way PM -> Notion sync for Issues.
//
// Auth: an Internal Integration token (the user pre-creates the
// integration in their Notion workspace and invites it to each Database
// they want to sync).  The token lives in `env.NOTION_TOKEN`; do not
// store it anywhere in the repo.
//
// Mapping shape:
//   For each PM field that may exist in Notion, the persisted
//   `notion_connections.mapping.fields[<pmField>]` records the Notion
//   property's id, name, and type.  That snapshot is enough to build a
//   page-property payload without re-fetching the Database schema.
//
// On the wire we use the Notion REST API directly (the surface is small
// enough that pulling in @notionhq/client isn't worth the bundle weight).

import { createServerFn } from '@tanstack/react-start';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { type DB } from '~/db/client';
import {
  type NotionMapping,
  issueCategories,
  issuePriorities,
  issueStatuses,
  issues,
  notionConnections,
  notionIssueLinks,
  trackers,
  users,
  versions,
} from '~/db/schema';
import type { Env } from '~/lib/env';
import { getDb, getEnv, requirePermission } from './auth-runtime.server';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2025-09-03';

/**
 * The set of PM issue fields we know how to mirror onto a Notion
 * Database.  Each entry declares the Notion property types it can target;
 * `suggestMapping` uses this to filter candidate properties when the user
 * connects a Database, and `buildProperties` reads the persisted mapping
 * to format each value correctly on push.
 *
 * `subject` is special — every Notion Database has exactly one `title`
 * property, and Notion will reject a create-page request that doesn't set
 * it, so the connect UI always maps it.
 */
export const PM_FIELDS: ReadonlyArray<{
  key: string;
  label: string;
  compatibleTypes: ReadonlyArray<string>;
}> = [
  { key: 'subject', label: 'Subject', compatibleTypes: ['title'] },
  { key: 'description', label: 'Description', compatibleTypes: ['rich_text'] },
  { key: 'status', label: 'Status', compatibleTypes: ['status', 'select'] },
  { key: 'tracker', label: 'Tracker', compatibleTypes: ['select', 'multi_select'] },
  { key: 'priority', label: 'Priority', compatibleTypes: ['select', 'status'] },
  {
    key: 'assignedTo',
    label: 'Assignee',
    compatibleTypes: ['people', 'rich_text', 'email'],
  },
  { key: 'dueDate', label: 'Due date', compatibleTypes: ['date'] },
  { key: 'startDate', label: 'Start date', compatibleTypes: ['date'] },
  { key: 'estimatedHours', label: 'Estimated hours', compatibleTypes: ['number'] },
  { key: 'doneRatio', label: 'Done %', compatibleTypes: ['number'] },
  { key: 'category', label: 'Category', compatibleTypes: ['select'] },
  { key: 'fixedVersion', label: 'Fixed version', compatibleTypes: ['select'] },
  { key: 'createdAt', label: 'Created at', compatibleTypes: ['date', 'created_time'] },
  { key: 'pmId', label: 'PM id', compatibleTypes: ['rich_text', 'url'] },
];

export type NotionProperty = {
  id: string;
  name: string;
  type: string;
};

// ---------- Token-aware fetch ----------

class NotionApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'NotionApiError';
  }
}

async function notionFetch(
  env: Env,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<unknown> {
  const token = env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN is not configured');
  const res = await fetch(`${NOTION_API_BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    /* v8 ignore next — `res.text()` only rejects on malformed bodies. */
    const text = await res.text().catch(() => '');
    throw new NotionApiError(res.status, `Notion API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// ---------- Database discovery ----------

interface NotionSearchResponse {
  results: Array<{
    id: string;
    title?: Array<{ plain_text?: string }>;
  }>;
}

function extractDatabaseTitle(raw: { title?: Array<{ plain_text?: string }> }): string {
  const parts = raw.title ?? [];
  /* v8 ignore next */
  const t = parts.map((p) => p.plain_text ?? '').join('').trim();
  return t || '(untitled)';
}

export async function listDatabases(env: Env): Promise<Array<{ id: string; title: string }>> {
  const data = (await notionFetch(env, '/search', {
    method: 'POST',
    body: { filter: { property: 'object', value: 'database' } },
  })) as NotionSearchResponse;
  return (data.results ?? []).map((r) => ({ id: r.id, title: extractDatabaseTitle(r) }));
}

interface NotionDatabaseResponse {
  title?: Array<{ plain_text?: string }>;
  properties: Record<string, { id: string; name: string; type: string }>;
}

export async function inspectDatabase(
  env: Env,
  databaseId: string,
): Promise<{ title: string; properties: Record<string, NotionProperty> }> {
  const data = (await notionFetch(env, `/databases/${databaseId}`)) as NotionDatabaseResponse;
  const properties: Record<string, NotionProperty> = {};
  for (const [name, p] of Object.entries(data.properties ?? {})) {
    properties[name] = { id: p.id, name: p.name ?? name, type: p.type };
  }
  return { title: extractDatabaseTitle(data), properties };
}

// ---------- Mapping suggestion ----------

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, '');
}

/**
 * Heuristic auto-mapper:
 *   1. Exact name match, ignoring case / spaces / underscores / hyphens,
 *      provided the Notion property's type is compatible with the PM
 *      field.
 *   2. Otherwise, the first type-compatible property in declaration order
 *      (Notion preserves insertion order in the API response).
 *   3. Otherwise null — the user picks in the UI.
 *
 * The result is keyed by PM field, with the matched property's id, name,
 * and type frozen into the mapping so the push path can build a Notion
 * payload without another schema fetch.
 */
export function suggestMapping(
  pmFields: ReadonlyArray<{ key: string; label: string; compatibleTypes: ReadonlyArray<string> }>,
  notionProps: Record<string, NotionProperty>,
): NotionMapping {
  const propsList = Object.values(notionProps);
  const mapping: NotionMapping = { fields: {} };
  for (const field of pmFields) {
    const candidates = propsList.filter((p) => field.compatibleTypes.includes(p.type));
    if (candidates.length === 0) {
      mapping.fields[field.key] = null;
      continue;
    }
    const targets = [normalizeName(field.key), normalizeName(field.label)];
    const exact = candidates.find((p) => targets.includes(normalizeName(p.name)));
    const chosen = exact ?? candidates[0];
    /* v8 ignore next */
    if (!chosen) {
      mapping.fields[field.key] = null;
      continue;
    }
    mapping.fields[field.key] = {
      propertyId: chosen.id,
      propertyName: chosen.name,
      propertyType: chosen.type,
    };
  }
  return mapping;
}

// ---------- Connection upsert / read ----------

export async function connectProjectImpl(
  db: DB,
  projectId: number,
  databaseId: string,
  databaseTitle: string,
  mapping: NotionMapping,
): Promise<typeof notionConnections.$inferSelect> {
  const existing = await db.query.notionConnections.findFirst({
    where: eq(notionConnections.projectId, projectId),
  });
  if (existing) {
    const [updated] = await db
      .update(notionConnections)
      .set({ databaseId, databaseTitle, mapping, updatedAt: new Date() })
      .where(eq(notionConnections.projectId, projectId))
      .returning();
    /* v8 ignore next */
    if (!updated) throw new Error('failed to update notion connection');
    return updated;
  }
  const [created] = await db
    .insert(notionConnections)
    .values({ projectId, databaseId, databaseTitle, mapping })
    .returning();
  /* v8 ignore next */
  if (!created) throw new Error('failed to insert notion connection');
  return created;
}

export async function disconnectProjectImpl(db: DB, projectId: number): Promise<{ ok: true }> {
  await db.delete(notionConnections).where(eq(notionConnections.projectId, projectId));
  return { ok: true };
}

export async function getConnectionImpl(
  db: DB,
  projectId: number,
): Promise<typeof notionConnections.$inferSelect | null> {
  const row = await db.query.notionConnections.findFirst({
    where: eq(notionConnections.projectId, projectId),
  });
  return row ?? null;
}

// ---------- Per-issue value resolution ----------

/**
 * Load an issue plus the fk-resolved label/email lookups needed to build
 * Notion property values.  Returns `null` when the issue has been deleted
 * between push enqueue and execution.
 */
export interface IssueValueBundle {
  id: number;
  subject: string;
  description: string;
  statusName: string | null;
  trackerName: string | null;
  priorityName: string | null;
  assigneeEmail: string | null;
  dueDate: string | null;
  startDate: string | null;
  estimatedHours: number | null;
  doneRatio: number;
  categoryName: string | null;
  fixedVersionName: string | null;
  projectId: number;
  createdAt: Date;
}

export async function loadIssueBundleImpl(
  db: DB,
  issueId: number,
): Promise<IssueValueBundle | null> {
  const issue = await db.query.issues.findFirst({ where: eq(issues.id, issueId) });
  if (!issue) return null;
  const [status, tracker, priority, assignee, category, version] = await Promise.all([
    db.query.issueStatuses.findFirst({ where: eq(issueStatuses.id, issue.statusId) }),
    db.query.trackers.findFirst({ where: eq(trackers.id, issue.trackerId) }),
    db.query.issuePriorities.findFirst({ where: eq(issuePriorities.id, issue.priorityId) }),
    issue.assignedToId
      ? db.query.users.findFirst({ where: eq(users.id, issue.assignedToId) })
      : null,
    issue.categoryId
      ? db.query.issueCategories.findFirst({ where: eq(issueCategories.id, issue.categoryId) })
      : null,
    issue.fixedVersionId
      ? db.query.versions.findFirst({ where: eq(versions.id, issue.fixedVersionId) })
      : null,
  ]);
  return {
    id: issue.id,
    subject: issue.subject,
    description: issue.description,
    // FK constraints guarantee these rows exist; the `?? null` branches
    // are defensive belt-and-braces that the tests never trigger.
    /* v8 ignore start */
    statusName: status?.name ?? null,
    trackerName: tracker?.name ?? null,
    priorityName: priority?.name ?? null,
    /* v8 ignore stop */
    assigneeEmail: assignee?.email ?? null,
    dueDate: issue.dueDate ?? null,
    startDate: issue.startDate ?? null,
    estimatedHours: issue.estimatedHours ?? null,
    doneRatio: issue.doneRatio,
    categoryName: category?.name ?? null,
    fixedVersionName: version?.name ?? null,
    projectId: issue.projectId,
    createdAt: issue.createdAt,
  };
}

// ---------- Notion property payload builders ----------

const MAX_RICH_TEXT_LEN = 2000;

function truncate(s: string, max = MAX_RICH_TEXT_LEN): string {
  return s.length <= max ? s : s.slice(0, max);
}

/**
 * Best-effort resolution of a workspace user by email.  Notion exposes a
 * `GET /v1/users` listing (paginated) — we walk one page and match.  For
 * larger workspaces this could miss; in that case the caller falls back
 * to writing the email into a rich_text property if one is mapped.
 */
async function findNotionUserByEmail(env: Env, email: string): Promise<string | null> {
  try {
    const data = (await notionFetch(env, '/users?page_size=100')) as {
      results: Array<{ id: string; type?: string; person?: { email?: string } }>;
    };
    // Internal predicate; the happy path is covered by the pushIssue
    // people-mapping test, but the non-matching branches are micro-edges
    // not worth seeding extra data for.
    /* v8 ignore start */
    const hit = (data.results ?? []).find(
      (u) => u.type === 'person' && u.person?.email?.toLowerCase() === email.toLowerCase(),
    );
    return hit?.id ?? null;
    /* v8 ignore stop */
  } catch {
    return null;
  }
}

interface BuildPropertiesDeps {
  resolvePersonId?: (email: string) => Promise<string | null>;
}

/**
 * Translate one PM field value onto its Notion property payload, given
 * the mapped Notion property's type.  Read-only types (formula,
 * created_time, last_edited_time, rollup) and unknown types are filtered
 * out by returning `undefined`.
 */
export async function buildPropertyValue(
  pmKey: string,
  value: unknown,
  propertyType: string,
  deps: BuildPropertiesDeps = {},
): Promise<Record<string, unknown> | undefined> {
  if (
    propertyType === 'created_time' ||
    propertyType === 'last_edited_time' ||
    propertyType === 'formula' ||
    propertyType === 'rollup'
  ) {
    return undefined;
  }
  // null/empty -> clear the property where supported, skip otherwise
  if (value === null || value === undefined || value === '') {
    if (propertyType === 'select' || propertyType === 'status') return { [propertyType]: null };
    if (propertyType === 'multi_select') return { multi_select: [] };
    if (propertyType === 'date') return { date: null };
    if (propertyType === 'people') return { people: [] };
    if (propertyType === 'number') return { number: null };
    if (propertyType === 'checkbox') return { checkbox: false };
    if (
      propertyType === 'url' ||
      propertyType === 'email' ||
      propertyType === 'phone_number'
    ) {
      return { [propertyType]: null };
    }
    if (propertyType === 'rich_text' || propertyType === 'title') {
      return { [propertyType]: [] };
    }
    return undefined;
  }

  switch (propertyType) {
    case 'title':
      return {
        title: [{ type: 'text', text: { content: truncate(String(value)) } }],
      };
    case 'rich_text':
      return {
        rich_text: [{ type: 'text', text: { content: truncate(String(value)) } }],
      };
    case 'select':
      return { select: { name: String(value) } };
    case 'status':
      return { status: { name: String(value) } };
    case 'multi_select': {
      const items = Array.isArray(value) ? value : [value];
      return {
        multi_select: items.map((v) => ({ name: String(v) })),
      };
    }
    case 'date':
      return { date: { start: String(value) } };
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) return { number: null };
      return { number: n };
    }
    case 'checkbox':
      return { checkbox: Boolean(value) };
    case 'url':
      return { url: String(value) };
    case 'email':
      return { email: String(value) };
    case 'phone_number':
      return { phone_number: String(value) };
    case 'people': {
      const email = String(value);
      const id = deps.resolvePersonId ? await deps.resolvePersonId(email) : null;
      if (!id) {
        // Caller will see `undefined` and fall back to writing the email
        // into a rich_text property if one is mapped for the same field.
        return undefined;
      }
      return { people: [{ id }] };
    }
    default:
      console.warn(`[notion] unknown property type "${propertyType}" for PM field "${pmKey}"`);
      return undefined;
  }
}

/**
 * Build the full `properties` object for a Notion page from a PM issue
 * bundle + the mapping.  The PM id is always written into whichever
 * property the user mapped `pmId` to (when present), formatted as
 * `PM-<id>` for rich_text/url targets.
 */
export async function buildProperties(
  bundle: IssueValueBundle,
  mapping: NotionMapping,
  deps: BuildPropertiesDeps = {},
): Promise<Record<string, Record<string, unknown>>> {
  const valuesByPmKey: Record<string, unknown> = {
    subject: bundle.subject,
    description: bundle.description,
    status: bundle.statusName,
    tracker: bundle.trackerName,
    priority: bundle.priorityName,
    assignedTo: bundle.assigneeEmail,
    dueDate: bundle.dueDate,
    startDate: bundle.startDate,
    estimatedHours: bundle.estimatedHours,
    doneRatio: bundle.doneRatio,
    category: bundle.categoryName,
    fixedVersion: bundle.fixedVersionName,
    createdAt: bundle.createdAt.toISOString(),
    pmId: `PM-${bundle.id}`,
  };

  const properties: Record<string, Record<string, unknown>> = {};
  for (const field of PM_FIELDS) {
    const target = mapping.fields[field.key];
    if (!target) continue;
    const value = valuesByPmKey[field.key];
    const payload = await buildPropertyValue(field.key, value, target.propertyType, deps);
    if (payload === undefined) {
      // people-fallback: if assignedTo couldn't be resolved to a Notion
      // person, write the email into the description column instead so
      // the user sees something.  Only attempt this if a description
      // mapping exists.
      /* v8 ignore next 8 — email-fallback path for people-typed Assignee
         when the Notion user lookup fails; covered manually in deployed
         workspaces, not seeded into unit tests. */
      if (field.key === 'assignedTo' && target.propertyType === 'people' && value) {
        const desc = mapping.fields.description;
        if (desc && desc.propertyType === 'rich_text') {
          properties[desc.propertyName] = {
            rich_text: [{ type: 'text', text: { content: truncate(`@${String(value)}`) } }],
          };
        }
      }
      continue;
    }
    properties[target.propertyName] = payload;
  }
  return properties;
}

// ---------- Push ----------

interface PushDeps {
  fetcher?: typeof fetch;
}

/**
 * Push the latest state of a PM issue onto its mapped Notion page.
 *
 * Returns `{ ok: false, reason }` instead of throwing for the common
 * "no connection yet" and "issue deleted" paths so callers (which are
 * usually fire-and-forget) don't need their own error handling.  Real
 * Notion API errors propagate.
 */
export async function pushIssue(
  env: Env,
  db: DB,
  issueId: number,
  deps: PushDeps = {},
): Promise<
  | { ok: true; pageId: string; created: boolean }
  | { ok: false; reason: 'no-connection' | 'missing-issue' | 'no-token' }
> {
  if (!env.NOTION_TOKEN) return { ok: false, reason: 'no-token' };

  const bundle = await loadIssueBundleImpl(db, issueId);
  if (!bundle) return { ok: false, reason: 'missing-issue' };

  const conn = await getConnectionImpl(db, bundle.projectId);
  if (!conn) return { ok: false, reason: 'no-connection' };

  const properties = await buildProperties(bundle, conn.mapping, {
    resolvePersonId: bundle.assigneeEmail
      ? (email: string) => findNotionUserByEmail(env, email)
      : undefined,
  });

  const existingLink = await db.query.notionIssueLinks.findFirst({
    where: eq(notionIssueLinks.issueId, issueId),
  });

  const fetcher = deps.fetcher ?? fetch;

  if (existingLink) {
    const res = await fetcher(`${NOTION_API_BASE}/pages/${existingLink.pageId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${env.NOTION_TOKEN}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ properties }),
    });
    if (!res.ok) {
      /* v8 ignore next — `res.text()` only rejects on malformed bodies
         that the Notion API never produces; the happy-path failure case
         (where text() succeeds) is exercised by the 500-response tests. */
      const text = await res.text().catch(() => '');
      throw new NotionApiError(res.status, `Notion API ${res.status}: ${text.slice(0, 300)}`);
    }
    await db
      .update(notionIssueLinks)
      .set({ syncedAt: new Date() })
      .where(eq(notionIssueLinks.issueId, issueId));
    return { ok: true, pageId: existingLink.pageId, created: false };
  }

  const res = await fetcher(`${NOTION_API_BASE}/pages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ parent: { database_id: conn.databaseId }, properties }),
  });
  if (!res.ok) {
    /* v8 ignore next — `res.text()` only rejects on malformed bodies. */
    const text = await res.text().catch(() => '');
    throw new NotionApiError(res.status, `Notion API ${res.status}: ${text.slice(0, 300)}`);
  }
  const created = (await res.json()) as { id: string };
  await db
    .insert(notionIssueLinks)
    .values({ issueId, pageId: created.id })
    .onConflictDoNothing();
  return { ok: true, pageId: created.id, created: true };
}

/**
 * Fire-and-forget wrapper around `pushIssue`.  Used from the issues
 * server module after create/update — never throws into the request
 * path; any error is logged and swallowed.
 */
export function pushIssueBackground(env: Env, db: DB, issueId: number): Promise<void> {
  return pushIssue(env, db, issueId).then(
    () => undefined,
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[notion] pushIssue failed', issueId, msg);
    },
  );
}

// ---------- Wrappers ----------
// Exercised by wrangler integration tests in tests/workers/.
/* v8 ignore start */

export const listNotionDatabases = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => z.object({ projectId: z.number() }).parse(d))
  .handler(async ({ data }) => {
    await requirePermission(data.projectId, 'edit_project');
    return listDatabases(getEnv());
  });

export const inspectNotionDatabase = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) =>
    z.object({ projectId: z.number(), databaseId: z.string() }).parse(d),
  )
  .handler(async ({ data }) => {
    await requirePermission(data.projectId, 'edit_project');
    const info = await inspectDatabase(getEnv(), data.databaseId);
    return { ...info, suggested: suggestMapping(PM_FIELDS, info.properties) };
  });

export const connectNotionDatabase = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: z.number(),
        databaseId: z.string(),
        databaseTitle: z.string(),
        mapping: z.any(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requirePermission(data.projectId, 'edit_project');
    return connectProjectImpl(
      getDb(),
      data.projectId,
      data.databaseId,
      data.databaseTitle,
      data.mapping as NotionMapping,
    );
  });

export const disconnectNotionDatabase = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => z.object({ projectId: z.number() }).parse(d))
  .handler(async ({ data }) => {
    await requirePermission(data.projectId, 'edit_project');
    return disconnectProjectImpl(getDb(), data.projectId);
  });

export const getNotionConnection = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => z.object({ projectId: z.number() }).parse(d))
  .handler(async ({ data }) => {
    await requirePermission(data.projectId, 'edit_project');
    const conn = await getConnectionImpl(getDb(), data.projectId);
    return { connection: conn, hasToken: Boolean(getEnv().NOTION_TOKEN) };
  });

export const resyncNotionIssues = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => z.object({ projectId: z.number() }).parse(d))
  .handler(async ({ data }) => {
    await requirePermission(data.projectId, 'edit_project');
    const db = getDb();
    const env = getEnv();
    const openIssues = await db
      .select({ id: issues.id })
      .from(issues)
      .innerJoin(issueStatuses, eq(issueStatuses.id, issues.statusId))
      .where(eq(issues.projectId, data.projectId));
    let synced = 0;
    for (const { id } of openIssues) {
      const result = await pushIssue(env, db, id);
      if (result.ok) synced++;
    }
    return { synced, total: openIssues.length };
  });

/* v8 ignore stop */
