# CLAUDE.md

Repository-specific guidance for Claude Code (claude.ai/code) and any other
agent working on this codebase.  **These rules override defaults — follow them
exactly.**

---

## What this repo is

A **monorepo of Cloudflare Workers apps**, managed by npm workspaces.  Each
app under `apps/<name>/` is independently deployable and may ship **multiple
workers** (SSR, queue consumers, cron jobs, Workflows, …) that share
bindings (D1 / KV / R2 / Queue / Workflow).

Current apps:

| App | Workers |
|---|---|
| `apps/project-management/` | `web` (TanStack Start SSR) + `cleanup` (cron) |
| `apps/url-shortener/` | one worker (Hono + KV) |
| `apps/webhook-relay/` | `ingest` + `relay` (Queue consumer + Workflow) |

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
  integration tests in `apps/<app>/tests/` mirroring the source path.
- **Bug fix** → add a regression test that *fails before the fix and passes
  after*.
- **Refactor** → existing tests must still pass; add tests for new code paths.
- **Touched a server module?** Re-run `npm run -w <app-package> test:coverage`
  and verify the coverage thresholds in that app's `vitest.config.ts` still
  pass.  Do not lower the thresholds to make the build green.

The only acceptable way to skip tests is for the user to *explicitly* say
"skip tests" (or equivalent) for that iteration.  If they do, record it in
the commit message body — e.g. `[skip-tests: user requested]` — so the gap is
auditable.

---

## Quick commands

```bash
# Top-level (npm workspaces fan-out)
npm install                # installs deps for every app
npm run test               # run each app's `npm run test`
npm run test:coverage      # run each app's `npm run test:coverage`
npm run typecheck          # tsc --noEmit per app

# Per-app shortcuts (defined in root package.json)
npm run dev:pm             # project-management web worker (vite dev)
npm run dev:url            # url-shortener
npm run dev:relay:ingest   # webhook-relay ingest worker
npm run dev:relay:relay    # webhook-relay relay worker (queue consumer)

# Drop into an app for finer control
cd apps/project-management
npm run test:workers       # miniflare integration
wrangler deploy --config workers/cleanup/wrangler.toml
```

---

## Adding a new app

1. `mkdir apps/<new-app>/` with `package.json` named
   `@cf-worker-apps/<new-app>` (npm workspace pattern).
2. Per-worker layout: `apps/<new-app>/workers/<worker>/wrangler.toml`.
   Multiple workers in one app share bindings by pointing at the same
   `database_id` / `bucket_name` / queue `name`.
3. Add `vitest.config.ts` with at minimum a `node` project (pure tests) and
   a `workers` project using `@cloudflare/vitest-pool-workers` when the app
   needs real D1/KV/R2 in tests.
4. Each app's `package.json` declares its own `dev` / `deploy` / `test`
   scripts; the root `package.json` fans them out via `npm run -w`.

---

## Adding a worker to an existing app

1. `mkdir apps/<app>/workers/<new-worker>/` with `index.ts` + `wrangler.toml`.
2. Reuse the app's D1/KV/R2 binding IDs in the new `wrangler.toml`.
3. Add a `deploy:<worker>` script and chain it into the app's `deploy`.
4. Trigger-specific patterns:
   - **Cron** → `[triggers] crons = [...]` (see `project-management/workers/cleanup`).
   - **Queue consumer** → `[[queues.consumers]]` (see `webhook-relay/workers/relay`).
   - **Workflow** → `[[workflows]]` + class extending `WorkflowEntrypoint`
     (see `webhook-relay/workers/relay/index.ts`).

---

## Architecture conventions (per-app)

These come from `project-management/` and are the model for new apps.

- **Server functions** live in `app/server/<topic>.ts`.  Every TanStack Start
  `createServerFn` wrapper is a thin shell wrapped in `/* v8 ignore start/stop */`
  markers, delegating to a pure **`*Impl(deps, input)`** helper exported from
  the same file.  Add new logic in the impl — the wrapper just collects deps.
- **`auth.ts` vs `auth-runtime.server.ts`**: `auth.ts` holds the pure impls
  (`buildAuthContextImpl`, `userFromSessionImpl`, `checkPermission`).
  `auth-runtime.server.ts` holds everything that depends on TanStack Start
  (`getEnv`, `getCurrentUser`, `requirePermission`, …) and is excluded from
  client bundles by the `**/*.server.*` import-protection pattern.
- **Pure modules** (`app/lib/*`, `app/server/password.ts`, `session.ts`,
  `markdown.ts`, `github-oauth.ts`) have no Cloudflare-runtime dependencies
  and must stay at 100% coverage.
- **Components** (`app/components/*.tsx`) are tested under jsdom with
  `@testing-library/react`.
- **Routes** (`app/routes/*`) are mostly thin loaders/components — they're
  excluded from the unit coverage report and covered transitively by the
  wrangler integration tests.

## Coverage targets

Configured per-app in `apps/<app>/vitest.config.ts` under
`test.coverage.thresholds`.  Defaults: **lines / statements / functions /
branches = 100%** for `project-management` and `url-shortener`; relaxed
slightly for `webhook-relay` (where Queue/Workflow execution paths are
covered manually).

The `createServerFn` wrappers and `auth-runtime.server.ts` are wrapped in
`/* v8 ignore start/stop */` because they need the TanStack Start SSR
runtime to execute.  They are **separately covered by the wrangler
integration tests in `tests/workers/`** running against Miniflare's D1 / KV /
R2.

## Don't

- Don't introduce backwards-compat shims or feature flags as substitutes for
  tests.
- Don't disable a failing test to "fix later" without flagging it via TaskCreate
  and a `// FIXME(test):` comment in the test file.
- Don't commit `routeTree.gen.ts`, `.dev.vars`, `dist/`, `coverage/`, or
  anything in `.wrangler/`.
- Don't add GitHub Actions / CI workflows.  CI is intentionally off to keep
  the repo zero-cost; coverage is enforced locally via `npm run test:coverage`.
- Don't move workers between apps casually — wrangler binding IDs are bound
  to the app folder.

---

_Last updated: 2026-05-21._
