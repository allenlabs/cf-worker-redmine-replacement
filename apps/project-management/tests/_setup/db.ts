import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from '~/db/schema';

export type TestDB = BetterSQLite3Database<typeof schema>;

// Same path on disk for both the migration and the seed; we just load them
// and execute them inside a fresh in-memory SQLite for every test.
const ROOT = join(__dirname, '..', '..');
const MIGRATION = readFileSync(join(ROOT, 'drizzle', '0001_initial.sql'), 'utf8');
const SEED = readFileSync(join(ROOT, 'drizzle', 'seed.sql'), 'utf8');

export function makeTestDb(opts?: { seed?: boolean }): TestDB {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(MIGRATION);
  if (opts?.seed !== false) sqlite.exec(SEED);
  return drizzle(sqlite, { schema });
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
