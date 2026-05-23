// Drizzle client backed by postgres.js + Cloudflare Hyperdrive.
//
// Hyperdrive proxies / pools connections to our Hetzner-hosted Postgres
// instance, so all the worker needs is the connection string it exposes on
// the binding. We pin the search_path to `pm, public` so unqualified table
// references in the drizzle schema resolve to our app schema.

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

let sql: ReturnType<typeof postgres> | null = null;

export function makeDb(env: { HYPERDRIVE: Hyperdrive }) {
  if (!sql) {
    sql = postgres(env.HYPERDRIVE.connectionString, {
      // Hyperdrive already pools; cap per-isolate sockets conservatively.
      max: 5,
      // Skip the introspective `pg_type` round-trip — Hyperdrive doesn't need
      // it and it saves a request on cold start.
      fetch_types: false,
      // Workers' TCP socket lifetimes are too short for prepared statements
      // to provide a benefit; disable to keep statements stateless.
      prepare: false,
      connection: { search_path: 'pm, public' },
    });
  }
  return drizzle(sql, { schema });
}

export type DB = ReturnType<typeof makeDb>;

export { schema };
