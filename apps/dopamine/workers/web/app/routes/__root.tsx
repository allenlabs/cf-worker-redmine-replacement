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

const PUBLIC_PATHS = new Set([
  '/auth/login',
  '/auth/callback',
  '/auth/logout',
]);

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => {
    // getRequest() THROWS on the client ("No StartEvent found in
    // AsyncLocalStorage"). Catch + return — the initial SSR already
    // gated; letting the throw escape would silently break Link clicks.
    let req: Request | undefined;
    try { req = getRequest(); } catch { return; }
    if (!req) return;
    const cookie = req.headers.get('cookie') ?? null;
    const token = readSessionToken(cookie);
    let url: URL | null = null;
    try {
      url = new URL(req.url);
    } catch {
      url = null;
    }
    const isPublic = url ? PUBLIC_PATHS.has(url.pathname) : false;
    if (token) {
      const env = getEnv();
      const payload = await verifySessionToken(env, token);
      if (payload?.sub) return;
    }
    if (isPublic) return;
    throw redirect({ to: '/auth/login' });
  },
  loader: async () => {
    let req: Request | undefined;
    try { req = getRequest(); } catch { return { user: null, appName: 'Dopamine' }; }
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
          id: -1,
          login: displayName,
          isAdmin: false,
        };
      }
    }
    return { user, appName: env.APP_NAME ?? 'Dopamine' };
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Dopamine' },
      { name: 'theme-color', content: '#78350f' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
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
