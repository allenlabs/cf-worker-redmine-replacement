import { sql } from 'drizzle-orm';
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgSchema,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const inbox = pgSchema('inbox');

// ---------- Items ----------
//
// The captured thought.  Mirrors drizzle-pg/0001_initial.sql exactly.
// `userId` is a soft reference to pm.users.id — no cross-schema FK so the
// two apps can be deployed independently.
export const items = inbox.table(
  'items',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: integer('user_id').notNull(),
    text: text('text').notNull(),
    source: text('source'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: text('status', {
      enum: ['unread', 'pinned', 'done', 'dropped', 'snoozed'],
    })
      .notNull()
      .default('unread'),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true, mode: 'date' }),
    refiledTo: jsonb('refiled_to').$type<Record<string, unknown> | null>(),
    capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    userStatusIdx: index('items_user_status_idx').on(t.userId, t.status, t.capturedAt),
    snoozeIdx: index('items_snooze_idx').on(t.snoozedUntil),
  }),
);

// ---------- API clients ----------
//
// HMAC-authenticated programmatic clients (CLI, browser extension, third-
// party automation).  One row per (client_id, user_id) pair — the API
// worker maps inbound `X-Client-Id` → user_id so the captured row is filed
// under the right inbox.
export const apiClients = inbox.table(
  'api_clients',
  {
    id: serial('id').primaryKey(),
    clientId: text('client_id').notNull().unique(),
    name: text('name').notNull(),
    hmacSecret: text('hmac_secret').notNull(),
    userId: integer('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    userIdx: index('api_clients_user_idx').on(t.userId),
  }),
);

// Reference back to pm.users from auth.  We don't model it in Drizzle (no
// cross-schema FK), but PM's users table is the source of truth for `userId`.
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type ApiClient = typeof apiClients.$inferSelect;
