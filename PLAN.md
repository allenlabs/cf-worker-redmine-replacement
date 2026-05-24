# Allen Labs SaaS Suite — Master Plan

A Cloudflare-hostable productivity stack built around the realities of ADHD
developer brains: **low-friction capture**, **single-screen overview**,
**forgiving context-switching**, **dopamine-shaped reward loops**, and
**executive-function scaffolding**.

Everything runs on Cloudflare Workers + Hyperdrive (→ shared Hetzner
Postgres, `allenlabs` DB, per-app schema) + R2 + KV.  All UIs use TanStack
Start.  All apps share `auth.allen.company` SSO and the Notion gateway.

## ADHD developer pain points → app mapping

| Pain | App |
|---|---|
| "I have an idea but can't stop what I'm doing to file it properly" | `inbox` — Universal capture (browser extension, CLI, mobile PWA, email-to-inbox).  One field, one button, done. |
| "I lose 20 min every morning figuring out where I left off" | `context` — Save/restore working contexts (tabs, files open, terminal cwd, current focus task, last commit). |
| "I'll just check Twitter… 2 hours later" | `focus` — Pomodoro w/ optional DNS-level distraction blocker, accountability buddy ping. |
| "What was I supposed to do today?" | `today` — Single dashboard pulling from PM + inbox + calendar + habits.  Shows ONE next action. |
| "I save articles I'll never read" | `read-later` — Read-later w/ a forced 30-day cull and TTS for walks. |
| "I forgot to take my meds / drink water / stand up" | `nudge` — Tiny habits w/ gentle escalation.  Not nagging — pattern visualization. |
| "I solved this exact bug 6 months ago and can't remember how" | `solved` — Searchable personal knowledge base, auto-captures from terminal/PR/issue resolutions. |
| "I have 80 browser tabs because closing them feels like losing them" | `stash` — Tab graveyard.  Pushes whole windows to R2, reopens on demand, auto-buries after 30 days. |
| "Calls/meetings derail my whole afternoon" | `buffer` — Calendar buffer enforcer.  Auto-blocks 30 min before/after every meeting on Google Calendar. |
| "I never know how much time I actually have in a day" | `today` (overlap) + visual time-budget bar. |
| "I want to write but can't get past the blank page" | `journal` — Daily prompt-driven journaling.  3 sentences, no perfectionism, exports to markdown. |
| "I switch projects every 15 minutes" | `focus` (overlap) — single-task lock w/ break mechanism that costs a bean. |

## Priority order (build in this sequence)

The cheapest, highest-leverage apps first.  Each one shippable in ~half a
day with the existing infra (auth, Hyperdrive, TanStack Start patterns).

### Phase A — Foundations (each ~ 0.5 day)

1. **`inbox`** — Universal capture.  POST `/capture { text, source?, tags? }`.
   - Storage: `inbox.items(id, text, source, tags, captured_at, status,
     refiled_to)` in shared PG.
   - Surfaces: `inbox.allen.company` (TanStack Start) for triage, mobile PWA,
     CLI tool, browser extension (Manifest V3), email-to-inbox via Mailchannels.
   - Triage UI: keyboard-only.  `1` = pin, `2` = move to PM as issue, `3` =
     read-later, `d` = drop, `s` = snooze 1d, `S` = snooze 1wk.
2. **`today`** — Single-screen dashboard.
   - Server-side aggregator: pulls (a) PM assigned issues w/ due ≤ today,
     (b) inbox unread, (c) habits due, (d) calendar today, (e) the literal
     ONE NEXT ACTION (most-recent in-progress task in PM, or top of inbox).
   - Big red banner: the One Next Action.  Everything else collapsed by
     default.
3. **`focus`** — Pomodoro + flow-state log.
   - Storage: `focus.sessions(id, task_id, started_at, target_minutes,
     ended_at, distractions[])`.
   - "Lock to one task" — picks the One Next Action, hides everything else.
   - Honor system, no DNS-blocking initially.  Optional second pass: a
     `/focus/penalty` integration that posts to Slack/Discord on break.

### Phase B — Capture-side helpers (each ~ 0.5–1 day)

4. **`context`** — Save/restore working contexts.
   - CLI: `ctx save "fixing auth bug"` snapshots cwd, git branch, open
     terminals (tmux/screen pane list), recent files (mru via shell hook),
     active browser tabs (via extension).  Saves to R2 + index in PG.
   - Restore: `ctx restore <name>` reopens everything.  Diff view shows
     what changed since you left.
5. **`read-later`** — Reading queue. **[DONE 2026-05-24]**
   - Live at https://read-later.allen.company (web) +
     https://read-later-api.allen.company (HMAC API).
   - Storage: `read_later.items(id, user_id, url, title, excerpt,
     content_html, word_count, estimated_minutes, tags, saved_at, read_at,
     skipped_count, source)` + `read_later.api_clients`.
   - Reader-mode extraction at save: Mozilla Readability via linkedom +
     sanitize-html, falls back to OG-meta scrape on parser misses. Word
     count → `estimated_minutes` (220 wpm) drives "what can I read in N
     min" prioritisation.
   - Queue surface: ONE next thing to read (fits free time, then oldest,
     skips sink to bottom). Skip / Done / Read-now actions.
   - API: POST `/v1/save`, GET `/v1/next?freeMinutes=`, POST `/v1/done`,
     POST `/v1/skip`, POST `/v1/delete`. All HMAC-signed via
     `read_later.api_clients`.
6. **`stash`** — Snippet / note vault. **[DONE 2026-05-24]**
   - Live at https://stash.allen.company (web) +
     https://stash-api.allen.company (HMAC API).
   - Storage: `stash.snippets(id, user_id, title, body, language, tags[],
     source, created_at, updated_at, search_tsv GENERATED ALWAYS AS ...
     STORED)` + `stash.api_clients`.  GIN index over `search_tsv` for
     full-text + GIN over `tags[]` for tag filtering.
   - Frictionless save: paste code, command, mental note; recall by tag or
     `plainto_tsquery`-driven full-text search with `ts_rank` ordering and
     `ts_headline` highlights.
   - API: POST `/v1/save`, GET `/v1/search?q=&limit=`, GET `/v1/get?id=`,
     POST `/v1/delete`.  All HMAC-signed via `stash.api_clients`.

### Phase C — Habit / journal layer (each ~ 0.5 day)

7. **`nudge`** — Habits w/ pattern viz (not streaks — streaks are an ADHD
   anti-pattern, one miss kills motivation).
   - Storage: `nudge.habits` + `nudge.completions`.
   - Visualization: heatmap of last 90 days.  Highlight pattern recovery,
     not unbroken streaks.
8. **`journal`** — Prompt-driven daily journal.
   - Three rotating prompts (random from a pool) every morning.
   - "Done in 3 sentences" defaults to 3 textareas, soft cap.
   - Markdown export to R2 + monthly digest emailed.

### Phase D — Deep integrations (each ~ 1 day)

9. **`solved`** — Searchable personal KB.
   - Auto-capture sources: PR merge events (webhook), Linear/PM issue
     resolution events, terminal post-mortems (CLI hook on `git commit
     --amend` after a fix), Notion pages tagged "fix:".
   - Full-text search via PG `tsvector`; semantic via Workers AI Vectorize.
10. **`buffer`** — Calendar buffer enforcer.
    - Google Calendar OAuth.
    - Cron worker: scans next 14 days, inserts 30-min "buffer" blocks
      before/after every external meeting.  Re-runs on calendar update
      webhooks.

### Phase E — Glue (after most of A–D exist)

11. **`hub`** — Reverse-proxy + nav shell.  `hub.allen.company` becomes the
    home page; left-rail nav lets you jump to any app w/o re-auth.  Each app
    keeps its own subdomain but `hub` also reverse-proxies for muscle
    memory.
12. **AI Concierge** — A worker that watches everything (inbox, focus
    sessions, journal entries) and weekly emails: "you captured 14 things
    this week, 9 of them about <topic> — should that be a project?"

    **Proactive nudges (priority feature, lifted out of Phase E):**
    A `concierge` worker runs on a cron schedule + on cross-app events
    (issue closed, focus session ended, inbox idle >24 h).  It pulls the
    user's recent activity across every app via internal API and asks an
    **OpenAI-compatible LLM** to compose a 1-2 sentence question, then
    delivers it via:
    - Web Push (existing inbox subscription endpoint).
    - Email (existing CF Email Workers binding).
    - In-app card on `today.allen.company` (the "AI nudge" slot).

    Example nudges the LLM is prompted to consider:
    - "You closed PM issue 'fix /search 500s' yesterday — the inbox
      item about /admin/users 502s is still open.  Next?"
    - "Yesterday's focus session abandoned 8 min in.  What got in
      the way?"
    - "No focus sessions in 3 days.  Pick one from inbox to start?"
    - "You captured 'try Bun for ingest' three times this month.
      Promote to a PM project?"

    Storage:  `concierge.nudges(id, user_id, topic, question, channel,
    sent_at, opened_at, dismissed_at, replied_at, reply_text)`.
    Replies (from notification action or email reply via Mailchannels
    webhook) feed back to the LLM for follow-ups.

    Credentials: OpenAI-compatible endpoint URL + API key + model name
    as wrangler secrets `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`.
    Default to OpenAI but the user can point at any compatible
    endpoint (Anthropic via a proxy, Ollama, LiteLLM, etc.).  Save
    creds to pass-cli as `Concierge LLM`.

### Phase F — Higher-order ADHD scaffolds (newer ideas, not original plan)

These map to research-backed ADHD developer patterns that don't fit
cleanly into Phase A–D:

13. **`pair` — body-doubling**.  Lightweight "I'm working right now"
    status broadcast to a chosen circle.  Optional one-room WebRTC
    audio (silence + occasional typing).  Friend can join silently.
    Cloudflare Realtime SFU handles the room; presence pings via
    Durable Object.  Killer feature for the "I can't start when alone"
    pattern.
14. **`transition` — ritual prompts**.  Three-step prompt that fires
    when a focus session ends OR when the user runs `al ctx save`:
    (1) Where am I leaving this?  (2) What's the very next step?
    (3) What might I forget?  Answers append to the relevant
    context/inbox/journal automatically — externalises working
    memory before the brain can drop the thread.
15. **`gentle` — daily check-ins (not habits)**.  Hard-coded to one
    screen of soft binary toggles (slept ok?  meds?  ate?  moved?
    talked to a human?) once a day, *no streak counter*.  Pattern
    visualisation as a 90-day heatmap.  Missed days fade but don't
    reset.  Phrasing is "gentle check" not "habit log".
16. **`intent` — externalised current intent**.  A single text field
    that lives in the browser PS1 / mobile widget / macOS menu bar.
    "What I'm doing right now: ___".  Updates touch a single row in
    `intent.current(user_id, text, updated_at)` and a tiny CF Worker
    serves the latest value to all surfaces.  The point is making the
    intent VISIBLE to the user from outside their own head.
17. **`dopamine` — celebration ledger**.  Captures every PR-merged,
    issue-closed, focus-session-completed, inbox-zeroed event from
    the other apps (via gateway-style HMAC webhooks) and renders a
    feed of "things you did".  Surfaces back during low-energy
    moments via a "remind me of a win" button.  Anti-imposter-syndrome
    by design.

## E2E testing strategy

Per-app vitest covers unit + integration on PGlite.  An *additional*
top-level `tests/e2e/` directory runs **Playwright tests against the
real deployed workers** at `*.allen.company`.  Goals:

- Cover the actual hydration path (TanStack Start has bitten us with
  bundle-leak / virtual-module issues before — only browser-level
  tests catch those).
- Exercise cross-app integrations (capture inbox → see in today →
  start focus on it).
- Validate PWA push notification end-to-end.

Test data isolation:
- Every test row is tagged: `inbox.items.tags` contains `'e2e-test'`;
  `focus.sessions.task_text` is prefixed `[e2e]`; `context.snapshots.name`
  starts `e2e-`; `pm.projects.identifier` starts `e2e-`.
- A `tests/e2e/teardown.ts` runs after the whole suite (via vitest
  `globalTeardown` or Playwright `globalTeardown`) and DELETEs every
  tagged row across all schemas, in dependency order.
- Teardown is idempotent + safe to run from CLI for manual cleanup.
- Test user is the existing admin `allenlim@allenlabs.org` — its
  session cookie is harvested once via the same form-POST trick
  `extract_cookie.mjs` uses today, then reused across tests.

Layout: `tests/e2e/{inbox,focus,today,context,push}.spec.ts` +
`tests/e2e/lib/{session,cleanup,fixtures}.ts`.

## Cross-cutting concerns

- **Auth:** every app SSO via auth.allen.company.  No app holds its own
  credentials.
- **DB:** one `allenlabs` PG, one schema per app (`inbox.*`, `today.*`,
  `focus.*` …).  Share the existing Hyperdrive config.
- **Frontend:** TanStack Start everywhere.  Hono only for HMAC API workers.
- **Capture latency target:** any "capture" POST returns within 100 ms p95.
  All processing (summarization, TTS, indexing) is `waitUntil` background.
- **Notion mirror:** all user-visible captures optionally sync to Notion via
  the gateway.  User picks one Notion DB per app at setup.
- **CLI:** publish `@allenlabs/cli` to npm with subcommands matching each
  app (`al inbox <text>`, `al focus start`, `al ctx save <name>`, …).
- **Mobile:** every UI worker emits a Web App Manifest + service worker for
  installable PWA.  Offline capture queue → drain when online.
- **Cost ceiling:** every app fits in CF Workers' free tier for personal
  use (100k req/day), Hyperdrive's free tier (1 query/sec cached burst),
  R2 free tier (10 GB).  Hetzner cax11 stays the single dedicated cost.

## Conventions per app

Mirror what `apps/project-management/` does today:

```
apps/<name>/
  package.json              @cf-worker-apps/<name>
  vite.config.ts            TanStack Start (no @cloudflare/vite-plugin)
  workers/web/              TanStack UI worker
    app/server.tsx          → dist/server/server.js for wrangler
    app/{routes,server,components,lib,db,styles}/...
    wrangler.toml           main = "../../dist/server/server.js"
  workers/api/              optional Hono worker (HMAC-signed)
  workers/cron/             optional scheduled worker
  drizzle-pg/               schema-qualified migrations
  tests/                    pglite + vitest, 100 % coverage target
```

Per-app SSO bootstrap: copy `__root.tsx` JWT-only gate + `auth.login` +
`auth.callback` + `auth.logout` routes from PM.

## Next concrete step

Build **`inbox`** first.  It's the smallest useful unit and unblocks every
other app (today pulls from it; focus picks from it; solved indexes it;
journal closes it out).

Scaffold plan for `inbox`:
1. `apps/inbox/` skeleton mirroring PM.
2. `drizzle-pg/0001_initial.sql` — `inbox` schema with `items` table.
3. Routes:
   - `/` triage UI (keyboard nav).
   - `/api/capture` POST (HMAC-signed via API worker for CLI/extension).
4. Deploy to `inbox.allen.company`.
5. Wire up CLI in a follow-up commit (separate package).
