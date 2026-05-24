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
import { getEnv } from '~/server/auth-runtime.server';
import { readSessionToken, verifySessionToken } from '~/server/session.server';
import appCss from '~/styles/app.css?url';

interface RouterContext {
  queryClient: QueryClient;
  user: { id: number; login: string; isAdmin: boolean } | null;
}

// Public paths a signed-out browser must still hit cleanly.  /api/capture
// is HMAC-gated and dispatched in its own server handler; we don't gate it
// here.  The API worker (inbox-api.allen.company) handles HMAC traffic for
// CLI/extension — this list is for SSO-cookie callers only.
const PUBLIC_PATHS = new Set([
  '/auth/login',
  '/auth/callback',
  '/auth/logout',
  '/api/capture',
  '/manifest.webmanifest',
  '/sw.js',
]);

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => {
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
          id: -1, // see PM rationale: never used as a real FK
          login: displayName,
          isAdmin: false,
        };
      }
    }
    return {
      user,
      appName: env.APP_NAME ?? 'Inbox',
    };
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Inbox' },
      { name: 'theme-color', content: '#1f2937' },
    ],
    links: [
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'manifest', href: '/manifest.webmanifest' },
      { rel: 'stylesheet', href: appCss },
    ],
    // `__name` polyfill — see PM's __root.tsx for the full rationale.
    // Without it, TanStack Start's seroval-emitted hydration script throws
    // ReferenceError before the bundle boots.
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
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-slate-950 text-slate-100">
        <div id="app">{children}</div>
        <Scripts />
      </body>
    </html>
  );
}
