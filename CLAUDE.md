# CLAUDE.md

Repository-specific guidance for Claude Code (claude.ai/code) and any other
agent working on this codebase.  **These rules override defaults — follow them
exactly.**

---

## Workflow rules (strictly enforced)

### 1. Always work on `main`

- **Do not create feature branches.** Every change lands as a normal commit on
  `main`.
- **Do not open pull requests** for routine work; just push to `main`.
- Do not rebase shared history, do not force-push.

If a change is genuinely too risky for `main` (e.g. multi-day refactor), pause
and confirm with the user before deviating from this rule.

### 2. Push after every change

- After **every** commit — feature, fix, refactor, doc, chore — run
  `git push origin main` immediately.
- Do not batch multiple commits across sessions before pushing.  The remote
  should always reflect the latest committed state at the end of a turn.
- If `push` fails (non-fast-forward, hook failure, auth), surface the error to
  the user; do not silently retry with force.

### 3. Tests are mandatory; coverage must not regress

Any new feature, refactor, or bug-fix requires a corresponding test change —
**the user expects this by default**.  Specifically:

- **New feature / new server function / new component** → add unit and/or
  integration tests in `tests/` mirroring the source path.
- **Bug fix** → add a regression test that *fails before the fix and passes
  after*.
- **Refactor** → existing tests must still pass; add tests for new code paths
  introduced by the refactor.
- **Touched a server module?** Re-run `npm run test:coverage` and verify the
  coverage thresholds in `vitest.config.ts` still pass.  Do not lower the
  thresholds to make the build green.

The only acceptable way to skip tests is for the user to *explicitly* say
"skip tests" (or equivalent) for that iteration.  If they do, record it in
the commit message body — e.g. `[skip-tests: user requested]` — so the gap is
auditable.

---

## Quick commands

```bash
npm run dev               # local dev (Vite + TanStack Start)
npm run build             # production build
npm run deploy            # build + wrangler deploy
npm run typecheck         # tsc --noEmit
npm run test              # vitest run — all 3 projects (node / jsdom / workers)
npm run test:watch        # vitest interactive
npm run test:coverage     # node + jsdom projects with v8 coverage (enforces thresholds)
npm run test:workers      # workers project only (miniflare integration)
npm run db:migrate:local  # apply migrations to local D1
npm run db:seed:local     # apply seed data to local D1
```

---

## Architecture cheatsheet (so tests stay aligned)

- **Server functions** live in `app/server/<topic>.ts`.  Every wrapper is a
  thin `createServerFn` shell wrapped in `/* v8 ignore start/stop */` markers,
  delegating to a pure **`*Impl(deps, input)`** helper exported from the same
  file.  Add new logic in the impl — the wrapper just collects deps.
- **`auth.ts` vs `auth-runtime.ts`**: `auth.ts` holds the pure impls
  (`buildAuthContextImpl`, `userFromSessionImpl`, `checkPermission`).
  `auth-runtime.ts` holds everything that depends on TanStack Start
  (`getEnv`, `getCurrentUser`, `requirePermission`, …).  Routes import from
  `~/server/auth-runtime`; the wrangler integration worker stays on pure
  imports only.
- **Pure modules** (`app/lib/*`, `app/server/password.ts`,
  `app/server/session.ts`, `app/server/markdown.ts`,
  `app/server/github-oauth.ts`) have no Cloudflare-runtime dependencies and
  must stay at 100% coverage.
- **Components** (`app/components/*.tsx`) are tested under jsdom with
  `@testing-library/react`.
- **Routes** (`app/routes/*`) are mostly thin loaders/components — they're
  excluded from the unit coverage report and covered transitively by the
  wrangler integration tests.

## Coverage targets

Configured in `vitest.config.ts` under `test.coverage.thresholds`.  The
defaults today: **lines / statements / functions / branches = 100%**.

The `createServerFn` wrappers and `auth-runtime.ts` are wrapped in
`/* v8 ignore start/stop */` because they need the TanStack Start SSR
runtime to execute.  They are **separately covered by the wrangler
integration tests in `tests/workers/`** running against Miniflare's D1 / KV /
R2.

If you have a *good* reason a file cannot reach the threshold, add it to
`coverage.exclude` with a one-line comment justifying the exclusion (e.g.
generated route tree, SSR entry).  Do **not** lower the global threshold to
paper over missing tests in the `*Impl` helpers.

## Test layout

```
tests/
├── _setup/
│   ├── setup-node.ts      # vitest globals for the Node environment
│   ├── setup-jsdom.ts     # jest-dom matchers + jsdom -> Node TextEncoder swap
│   ├── db.ts              # makeTestDb() — in-memory better-sqlite3 + schema + seed
│   └── env.ts             # makeTestEnv() — fake D1/R2/KV bindings
├── lib/                   # pure helpers (node project)
├── server/                # *Impl integration tests against testDb (node project)
├── components/            # React component tests (jsdom project)
└── workers/               # Miniflare integration tests for the workers project
                          # — exercises real D1 / KV / R2 + cookies via SELF.fetch
```

When you add a new file under `app/server/foo.ts`, you should normally also
add `tests/server/foo.test.ts`.  When you touch route or wrapper logic that
depends on the Cloudflare runtime, add a `tests/workers/*.test.ts` that
exercises it via `SELF.fetch()` against `app/test-worker.ts`.

## Don't

- Don't introduce backwards-compat shims or feature flags as substitutes for
  tests.
- Don't disable a failing test to "fix later" without flagging it via TaskCreate
  and a `// FIXME(test):` comment in the test file.
- Don't commit `routeTree.gen.ts`, `.dev.vars`, or anything in `.wrangler/`.
- Don't add GitHub Actions / CI workflows.  CI is intentionally off to keep
  the repo zero-cost; coverage is enforced locally via `npm run test:coverage`.

---

_Last updated: 2026-05-21._
