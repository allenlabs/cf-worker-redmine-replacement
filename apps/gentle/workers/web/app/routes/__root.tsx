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
    const req = getRequest();
    if (!req) return;
    const cookie = req.headers.get('cookie') ?? null;
    const token = readSessionToken(cookie);
    let pathname: string | null = null;
    if (req.url != null) {
      try {
        pathname = new URL(req.url as string | URL).pathname;
      } catch {
        try {
          const u = String(req.url);
          const q = u.indexOf('?');
          const trimmed = q >= 0 ? u.slice(0, q) : u;
          pathname = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
        } catch {
          pathname = '/';
        }
      }
    }
    const isPublic = pathname ? PUBLIC_PATHS.has(pathname) : false;
    if (token) {
      const env = getEnv();
      const payload = await verifySessionToken(env, token);
      if (payload?.sub) return;
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
        user = { id: -1, login: displayName, isAdmin: false };
      }
    }
    return { user, appName: env.APP_NAME ?? 'Gentle' };
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Gentle' },
      { name: 'theme-color', content: '#115e59' },
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
