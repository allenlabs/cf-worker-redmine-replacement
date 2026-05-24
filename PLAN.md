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
5. **`read-later`** — Read-later w/ TTS.
   - Storage: `read_later.items(id, url, fetched_html, summary, audio_r2_key,
     added_at, read_at, archived_at)`.
   - Worker fetches the URL, runs a short summarization via Workers AI,
     generates 3-sentence TL;DR, optionally TTS via Workers AI text-to-speech
     stored in R2.
   - Force-archive after 30 days (with a one-tap "send to journal" if it
     mattered).
6. **`stash`** — Tab graveyard.
   - Browser ext one-clicks "stash this window" → POSTs `{ tabs[] }` to
     `stash.allen.company`.
   - List view at `stash.allen.company`: search, restore individual tabs or
     whole windows, auto-bury after 30 days.

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
