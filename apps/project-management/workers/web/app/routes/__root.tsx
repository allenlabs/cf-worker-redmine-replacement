import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  redirect,
} from '@tanstack/react-router';
import { getRequest } from '@tanstack/react-start/server';
import type { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Layout } from '~/components/Layout';
import { getCurrentUser, getEnv } from '~/server/auth-runtime.server';
import { readSessionToken, verifySessionToken } from '~/server/session';
import appCss from '~/styles/app.css?url';

interface RouterContext {
  queryClient: QueryClient;
  user: { id: number; login: string; isAdmin: boolean } | null;
}

/**
 * Paths that an unauthenticated visitor must still be able to reach.
 *   /auth/login        starts the SSO redirect
 *   /auth/callback     receives the code back
 *   /auth/logout       tears down a session
 *   /api/notion-webhook server-side webhook from the notion-gateway —
 *                      auth is HMAC, not session
 *   /favicon.svg       browsers always fetch this first
 */
const PUBLIC_PATHS = new Set([
  '/auth/login',
  '/auth/callback',
  '/auth/logout',
  '/api/notion-webhook',
]);

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => {
    // Fast auth gate: verify the JWT in the cfr_session cookie against
    // JWKS (cached per-isolate, no DB hit).  Trust the JWT — if the
    // user was deleted/banned, the JWT will be rejected at its next
    // refresh.  Routes that need the actual users row (e.g. /my/page)
    // resolve it in their own data SQL.  Saves a Hetzner round-trip
    // (~400 ms) on every page.
    const req = getRequest();
    const cookie = req?.headers.get('cookie') ?? null;
    const token = readSessionToken(cookie);
    const url = req ? new URL(req.url) : null;
    const isPublic = url ? PUBLIC_PATHS.has(url.pathname) : false;
    if (token) {
      const env = getEnv();
      const payload = await verifySessionToken(env, token);
      if (payload?.sub) return; // valid session
    }
    if (isPublic) return;
    throw redirect({ to: '/auth/login' });
  },
  loader: async () => {
    // No DB hit here.  Derive a lightweight "user" object from the JWT
    // claims (sub + email or name) so the layout header can render the
    // current user without paying for the users.findFirst round-trip
    // (~400 ms cold).  Routes that actually need the local users row
    // (`/my/page`, `/admin/users`, etc.) resolve it inline in their
    // own data SQL.
    const req = getRequest();
    const cookie = req?.headers.get('cookie') ?? null;
    const token = readSessionToken(cookie);
    const env = getEnv();
    let user: { id: number; login: string; isAdmin: boolean } | null = null;
    if (token) {
      const payload = await verifySessionToken(env, token);
      if (payload?.sub) {
        const displayName =
          (typeof payload.email === 'string' && payload.email.split('@')[0]) ||
          (typeof payload.name === 'string' && payload.name) ||
          'user';
        user = {
          // No local users.id available without a DB hit; the layout
          // only uses this for display, not as an FK.  Use -1 as a
          // never-stored sentinel so any code that mistakenly treats
          // it as a real id surfaces a foreign-key error rather than
          // silently writing the wrong row.
          id: -1,
          login: displayName,
          // isAdmin requires the DB; default to false in the layout.
          // Pages that gate on admin (e.g. /admin/*) must re-check.
          isAdmin: false,
        };
      }
    }
    return {
      user,
      appName: env.APP_NAME ?? 'Project Management',
    };
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Project Management' },
    ],
    links: [
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'stylesheet', href: appCss },
    ],
    // esbuild's name-preservation helper.  TanStack Start's SSR
    // serializer emits inline scripts riddled with `/* @__PURE__ */
    // __name(...)` from seroval; without the polyfill the very first
    // hydration script throws ReferenceError and the whole page never
    // boots.  Injected as the FIRST head script so it's defined before
    // the seroval barrier runs.
    scripts: [
      {
        children:
          "var __name=(t,n)=>Object.defineProperty(t,'name',{value:n,configurable:true});",
      },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const data = Route.useLoaderData();
  const user = data?.user ?? null;
  const appName = data?.appName ?? 'Project Management';
  return (
    <RootDocument>
      <Layout user={user} appName={appName}>
        <Outlet />
      </Layout>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="app">{children}</div>
        <Scripts />
      </body>
    </html>
  );
}
