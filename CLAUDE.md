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
npm run dev               # local dev (Vinxi)
npm run build             # production build
npm run deploy            # build + wrangler deploy
npm run typecheck         # tsc --noEmit
npm run test              # vitest one-shot
npm run test:watch        # vitest interactive
npm run test:coverage     # vitest + v8 coverage (enforces thresholds)
npm run db:migrate:local  # apply migrations to local D1
npm run db:seed:local     # apply seed data to local D1
```

---

## Architecture cheatsheet (so tests stay aligned)

- **Server functions** live in `app/server/<topic>.ts`.  They are thin
  `createServerFn` wrappers around **internal helpers** of the form
  `<verb><Noun>Impl(deps, input)`.  *Always* keep the impl exported and the
  wrapper trivial — that's what makes the code testable without booting Vinxi.
- **Auth helpers** (`getEnv`, `getDb`, `getCurrentUser`, `requireUser`,
  `requirePermission`, `requireAdmin`, `buildAuthContext`) live in
  `app/server/auth.ts`.  Tests mock this module via `vi.mock('~/server/auth')`
  and supply an in-memory Drizzle DB built by `tests/_setup/db.ts`.
- **Pure modules** (`app/lib/*`, `app/server/password.ts`,
  `app/server/session.ts`, `app/server/markdown.ts`,
  `app/server/github-oauth.ts`) have no Cloudflare-runtime dependencies and
  should sit at 100% line coverage.
- **Components** (`app/components/*.tsx`) are tested under jsdom with
  `@testing-library/react`.
- **Routes** (`app/routes/*`) are mostly thin loaders/components that delegate
  to server functions and components — they're covered transitively.

## Coverage targets

Configured in `vitest.config.ts` under `test.coverage.thresholds`.  Current
defaults are intentionally below the 100% "ideal" because the
`createServerFn` wrappers in `app/server/*.ts` only run under TanStack Start's
SSR runtime.  Their internal `*Impl` helpers — where the actual business
logic lives — should sit at ~100%.

If you have a *good* reason a file cannot reach the threshold, add it to
`coverage.exclude` with a one-line comment justifying the exclusion (e.g.
generated route tree, SSR entry).  Do **not** lower the global threshold to
paper over missing tests in the `*Impl` helpers.  If you raise the wrapper
coverage with integration tests (e.g. wrangler-based), raise the thresholds
accordingly.

## Test layout

```
tests/
├── _setup/
│   ├── setup.ts           # jest-dom matchers, global vitest hooks
│   ├── db.ts              # makeTestDb() — in-memory better-sqlite3 + schema + seed
│   └── env.ts             # makeTestEnv() — fake D1/R2/KV bindings
├── lib/                   # pure helpers
├── server/                # server functions (mock auth, real testDb)
└── components/            # React component tests (jsdom)
```

When you add a new file under `app/server/foo.ts`, you should normally also
add `tests/server/foo.test.ts`.

## Don't

- Don't introduce backwards-compat shims or feature flags as substitutes for
  tests.
- Don't disable a failing test to "fix later" without flagging it via TaskCreate
  and a `// FIXME(test):` comment in the test file.
- Don't commit `routeTree.gen.ts`, `.dev.vars`, or anything in `.wrangler/`.

---

_Last updated: 2026-05-21._
