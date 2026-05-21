# cf-worker-redmine-replacement

A self-hostable, Redmine-style project / issue management app that runs entirely on
**Cloudflare Workers**, built with **TanStack Start** (SSR + file-based routing) and
**TanStack Router**, backed by **Cloudflare D1** (SQLite), **R2** (file attachments),
and **KV** (session revocation).

> Deploy a single Worker, get projects · issues · time tracking · gantt · roadmap ·
> wiki · attachments · members · permissions · activity feed · search — all without
> running a server.

---

## Why

Redmine is great but feels heavy: Ruby + Passenger + Postgres/MySQL + Apache, plus
SMTP, cron jobs, file storage… This project squeezes the same model into one
edge-deployed Worker. No servers to patch, no database backups to schedule (D1
handles it), no S3 to wire up (R2 is a binding).

## Feature parity

| Module           | Status |
|------------------|--------|
| Projects (CRUD, hierarchy, public/private) | ✅ |
| Issues with tracker / status / priority / assignee / category / version / parent | ✅ |
| Issue notes (markdown) + audit-trail journal | ✅ |
| Watchers                                   | ✅ |
| Time tracking with activities + filters    | ✅ |
| Roadmap (versions with % closed)           | ✅ |
| Gantt chart (SVG)                          | ✅ |
| Wiki (markdown, revisions, per-project)    | ✅ |
| Files / attachments (R2)                   | ✅ |
| Activity feed (global + per project)       | ✅ |
| Search (issues + wiki)                     | ✅ |
| Roles & permissions (Manager / Developer / Reporter, customisable) | ✅ |
| Auth: email + password (PBKDF2) + GitHub OAuth | ✅ |
| Admin: user list, lock/unlock, promote     | ✅ |
| Per-project module toggles                 | ✅ |

## Tech stack

- **Edge runtime:** Cloudflare Workers (module worker)
- **Framework:** TanStack Start (server functions + SSR) + TanStack Router (file-based, type-safe)
- **UI:** React 18, Tailwind CSS
- **DB:** Cloudflare D1 + Drizzle ORM
- **Files:** Cloudflare R2
- **Sessions:** signed JWT (jose) in HttpOnly cookies; revocation via KV
- **Markdown:** marked + lightweight HTML sanitiser
- **Build:** Vinxi + Vite, deployed via wrangler

---

## Getting started

### 0. Prerequisites
- Node ≥ 20
- A Cloudflare account with Workers, D1, R2 and KV enabled
- `npx wrangler login`

### 1. Install

```bash
git clone https://github.com/allenlabs/cf-worker-redmine-replacement.git
cd cf-worker-redmine-replacement
npm install
```

### 2. Create Cloudflare resources

```bash
# D1 database
wrangler d1 create redmine
# copy the printed database_id into wrangler.toml

# KV namespace for revoked sessions
wrangler kv namespace create SESSION_KV
# copy the printed id into wrangler.toml

# R2 bucket
wrangler r2 bucket create cf-redmine-files
```

### 3. Local secrets

```bash
cp .dev.vars.example .dev.vars
# edit .dev.vars and at minimum set JWT_SECRET
```

### 4. Migrate + seed

```bash
npm run db:migrate:local
npm run db:seed:local
```

### 5. Dev

```bash
npm run dev
# open http://localhost:3000
```

The first account you register becomes the **admin** automatically.

### 6. Deploy

```bash
# set production secrets
wrangler secret put JWT_SECRET
wrangler secret put PUBLIC_BASE_URL
# optional, only if you want GitHub login
wrangler secret put GITHUB_OAUTH_CLIENT_ID
wrangler secret put GITHUB_OAUTH_CLIENT_SECRET

npm run db:migrate
npm run db:seed
npm run deploy
```

---

## GitHub OAuth setup (optional)

1. <https://github.com/settings/developers> → New OAuth App
2. **Authorization callback URL:** `{PUBLIC_BASE_URL}/oauth/github/callback`
3. Copy the Client ID + Secret, set them with `wrangler secret put …`
4. The "Sign in with GitHub" button appears on `/login` automatically.

On first GitHub login, an account is created using the GitHub `login` and primary
verified email. Subsequent logins match by GitHub ID first, then by email.

---

## Project layout

```
.
├── app.config.ts              # TanStack Start + Vite + Nitro Cloudflare preset
├── wrangler.toml              # D1 / KV / R2 / vars / asset binding
├── drizzle/
│   ├── 0001_initial.sql       # full schema migration
│   └── seed.sql               # default trackers / statuses / priorities / roles
├── app/
│   ├── client.tsx             # hydrate
│   ├── ssr.tsx                # Nitro entry
│   ├── router.tsx             # TanStack Router + react-query bridge
│   ├── routeTree.gen.ts       # (generated)
│   ├── styles/app.css         # Tailwind + Redmine-inspired tokens
│   ├── lib/                   # env types, formatters, permissions enum
│   ├── db/                    # Drizzle schema + D1 client factory
│   ├── server/                # createServerFn handlers (auth, projects, issues, …)
│   ├── components/            # Layout, ProjectSidebar, badges, Markdown
│   └── routes/                # file-based routes
└── public/                    # static assets (favicon)
```

## Permissions model

Inspired by Redmine. Each role has a JSON `permissions` array; see
`drizzle/seed.sql` for the default Manager / Developer / Reporter sets, and
`app/lib/permissions.ts` for the full enum. The server-side `requirePermission`
helper enforces them on every mutating server function.

Admins (users with `admin = 1`) bypass all per-project checks.

## Notes / known limitations

- Single-Worker deploy assumes D1's eventual-consistency is fine for your team
  size; for very large installs consider sharding by project.
- The Gantt is read-only SVG (no drag-resize) — keeps the bundle tiny.
- Email notifications are intentionally omitted (no SMTP on the edge); plug in
  Cloudflare Email Routing or Postmark/Resend via a queue if you need them.
- Custom fields are not implemented yet (would slot in via a small extra table).

## License

MIT
