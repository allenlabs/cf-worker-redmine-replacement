import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type DB } from '~/db/client';
import * as schema from '~/db/schema';

// We surface `DB` as the test database type so server impls (typed
// `PostgresJsDatabase<typeof schema>` via `~/db/client`) accept the PGlite-
// backed instance without per-call casts. At runtime drizzle's PG dialect is
// identical across drivers; the cast is purely to satisfy TS's HKT branding.
export type TestDB = DB;

// Same path on disk for both the migration and the seed; we load them once
// and execute them inside a fresh in-memory Postgres (PGlite) per test run.
const ROOT = join(__dirname, '..', '..');
const MIGRATION = readFileSync(join(ROOT, 'drizzle-pg', '0001_initial.sql'), 'utf8');
const SEED = readFileSync(join(ROOT, 'drizzle-pg', '0002_seed.sql'), 'utf8');

export async function makeTestDb(opts?: { seed?: boolean }): Promise<TestDB> {
  const pglite = new PGlite();
  await pglite.exec(MIGRATION);
  if (opts?.seed !== false) await pglite.exec(SEED);
  // The migration sets search_path inline, but it scopes to the session that
  // executed the DDL. Re-pin it on the live connection so helper inserts
  // resolve unqualified `pm.*` names too.
  await pglite.exec(`SET search_path = pm, public;`);
  return drizzle(pglite, { schema }) as unknown as TestDB;
}

// A few high-level helpers tests reach for so they stay terse.

export async function insertUser(
  db: TestDB,
  fields: Partial<typeof schema.users.$inferInsert> = {},
): Promise<typeof schema.users.$inferSelect> {
  const [user] = await db
    .insert(schema.users)
    .values({
      login: fields.login ?? 'tester',
      email: fields.email ?? 'tester@example.com',
      firstname: fields.firstname ?? 'Test',
      lastname: fields.lastname ?? 'User',
      admin: fields.admin ?? false,
      status: fields.status ?? 'active',
      ...fields,
    })
    .returning();
  if (!user) throw new Error('insertUser returned no row');
  return user;
}

export async function insertProject(
  db: TestDB,
  fields: Partial<typeof schema.projects.$inferInsert> = {},
): Promise<typeof schema.projects.$inferSelect> {
  const [p] = await db
    .insert(schema.projects)
    .values({
      identifier: fields.identifier ?? 'demo',
      name: fields.name ?? 'Demo',
      description: fields.description ?? '',
      isPublic: fields.isPublic ?? false,
      ...fields,
    })
    .returning();
  if (!p) throw new Error('insertProject returned no row');
  // enable all default trackers
  const trackers = await db.select().from(schema.trackers);
  if (trackers.length > 0) {
    await db
      .insert(schema.projectTrackers)
      .values(trackers.map((t) => ({ projectId: p.id, trackerId: t.id })));
  }
  // enable wiki shell so wiki tests don't blow up
  await db.insert(schema.wikis).values({ projectId: p.id }).onConflictDoNothing();
  return p;
}

export async function addManager(
  db: TestDB,
  userId: number,
  projectId: number,
): Promise<void> {
  const manager = await db.query.roles.findFirst({
    where: (r, { eq }) => eq(r.name, 'Manager'),
  });
  if (!manager) throw new Error('Manager role not seeded');
  await db.insert(schema.members).values({ userId, projectId, roleId: manager.id });
}
