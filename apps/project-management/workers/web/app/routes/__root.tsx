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
    const user = await getCurrentUser();
    if (user) return;

    // Not signed in.  Send everything but the auth callbacks to /auth/login
    // so an unauthenticated visitor never sees app chrome or data.
    const req = getRequest();
    const url = req ? new URL(req.url) : null;
    if (url && PUBLIC_PATHS.has(url.pathname)) return;
    throw redirect({ to: '/auth/login' });
  },
  loader: async () => {
    const user = await getCurrentUser();
    const env = getEnv();
    return {
      user: user ? { id: user.id, login: user.login, isAdmin: user.isAdmin } : null,
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
