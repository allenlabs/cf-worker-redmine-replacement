// Drizzle client backed by postgres.js + Cloudflare Hyperdrive.
//
// Hyperdrive proxies / pools connections to our Hetzner-hosted Postgres
// instance, so all the worker needs is the connection string it exposes on
// the binding. We pin the search_path to `pm, public` so unqualified table
// references in the drizzle schema resolve to our app schema.
//
// NOTE: Cold-start retry.
// Drizzle calls into `sql.unsafe(query, params)` (sometimes followed by
// `.values()` for array-mode results) for every query it issues. We wrap
// the postgres.js client in a Proxy that, for `unsafe`, returns a thenable
// which re-invokes `sql.unsafe(...)` exactly once if the first attempt
// rejects with a connection-shaped error (Hyperdrive cold-start race,
// postgres.js socket reset, DNS hiccup). Real PG errors — syntax,
// constraint, FK violations — are NOT retried: their `code` doesn't match
// our connection-shape predicate, so they propagate cleanly on first
// attempt and callers see the actual problem. `begin`/`savepoint` are
// passed through unmodified: retrying a partially-applied transaction
// isn't safe, so we let those propagate.

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

let sql: ReturnType<typeof postgres> | null = null;

const COLD_START_BACKOFF_MS = 100;

/**
 * Should this thrown error be retried?  PG-side errors carry an SQLSTATE
 * `code` (5 chars, all digits/letters) — those are deterministic (syntax,
 * unique violation, FK, NOT NULL …) and re-issuing the query won't help.
 * Everything else — socket-level, DNS, "Failed query" with no SQLSTATE
 * cause, generic Error — is treated as connection-shaped and retried.
 *
 * We err on the side of MORE retries: false positives just mean we waste
 * ~100 ms on a doomed query; false negatives leave a user staring at a
 * "Failed query" page on every cold-start race like the one Hyperdrive
 * has on the first request after a fresh isolate.
 */
function isRetryableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return true;
  const e = err as { name?: unknown; code?: unknown; cause?: unknown };
  const code = typeof e.code === 'string' ? e.code : undefined;
  // SQLSTATE codes are exactly 5 chars (e.g. '23505', '42P01'). postgres.js
  // surfaces them on PostgresError.code. Anything matching is a real PG
  // error: don't retry.
  if (code && /^[0-9A-Z]{5}$/.test(code)) return false;
  if (e.name === 'PostgresError') return false;
  // Otherwise (connection-shape, "Failed query" wrapper, plain Error) →
  // give it one more try.  Drizzle's wrapper exposes the underlying cause
  // on `e.cause`; check there too in case the SQLSTATE lives one level
  // down.
  if (e.cause && e.cause !== err) return isRetryableError(e.cause);
  return true;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Wrap a postgres.js `sql` client so every `.unsafe(query, params)` call
 * — which is how drizzle-orm/postgres-js dispatches every query — gets one
 * automatic retry on connection-shaped errors. Tagged-template calls
 * `sql`SELECT ...`` are not used by Drizzle (it always goes through
 * `unsafe`), but we still proxy the function itself so direct callers
 * would inherit the same behaviour.
 *
 * Exported so tests can drive the retry loop directly without instantiating
 * a real Postgres connection.
 */
export function wrapWithColdStartRetry(
  client: ReturnType<typeof postgres>,
): ReturnType<typeof postgres> {
  const handler: ProxyHandler<ReturnType<typeof postgres>> = {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop !== 'unsafe' || typeof value !== 'function') return value;
      // `unsafe(query, params, opts?)` returns a PendingQuery — a thenable
      // that also exposes chainable modifiers like `.values()`. We return
      // a lazy wrapper that defers calling `target.unsafe(...)` until the
      // caller actually awaits (or calls `.values()` then awaits), so we
      // can re-issue the call from scratch on a connection-shape failure.
      return function unsafeWithRetry(this: unknown, ...args: unknown[]) {
        return makeRetryingPendingQuery(target, args, /* arrayMode */ false);
      };
    },
  };
  return new Proxy(client, handler);
}

type PendingLike = {
  then: (...a: unknown[]) => unknown;
  catch?: (...a: unknown[]) => unknown;
  finally?: (...a: unknown[]) => unknown;
  values?: () => PendingLike;
};

function makeRetryingPendingQuery(
  client: ReturnType<typeof postgres>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any[],
  arrayMode: boolean,
): PendingLike {
  // Execute the underlying `client.unsafe(...)` with retry semantics. We
  // build the PendingQuery fresh on each attempt so postgres.js owns a
  // clean state machine per attempt.
  const run = async (): Promise<unknown> => {
    let attempt = 0;
    // One retry max — total of two attempts.
    while (true) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pending = (client.unsafe as any)(...args);
        return await (arrayMode ? pending.values() : pending);
      } catch (err) {
        if (attempt === 0 && isRetryableError(err)) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('[db cold-start retry]', msg.slice(0, 300));
          attempt++;
          await sleep(COLD_START_BACKOFF_MS);
          continue;
        }
        throw err;
      }
    }
  };

  const wrapper: PendingLike = {
    // Thenable surface — `await wrapper` calls this.
    then(onFulfilled, onRejected) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return run().then(onFulfilled as any, onRejected as any);
    },
    catch(onRejected) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return run().catch(onRejected as any);
    },
    finally(onFinally) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return run().finally(onFinally as any);
    },
    // Drizzle's array-mode path calls `.values()` before awaiting.
    values() {
      return makeRetryingPendingQuery(client, args, true);
    },
  };
  return wrapper;
}

export function makeDb(env: { HYPERDRIVE: Hyperdrive }) {
  if (!sql) {
    const raw = postgres(env.HYPERDRIVE.connectionString, {
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
    sql = wrapWithColdStartRetry(raw);
  }
  return drizzle(sql, { schema });
}

export type DB = ReturnType<typeof makeDb>;

export { schema };
