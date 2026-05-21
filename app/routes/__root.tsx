import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import type { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Layout } from '~/components/Layout';
import { getCurrentUser, getEnv } from '~/server/auth-runtime';
import appCss from '~/styles/app.css?url';

const loadRoot = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await getCurrentUser();
  const env = getEnv();
  return {
    user: user ? { id: user.id, login: user.login, isAdmin: user.isAdmin } : null,
    appName: env.APP_NAME ?? 'CF Redmine',
    allowRegistration: env.ALLOW_REGISTRATION === 'true',
  };
});

interface RouterContext {
  queryClient: QueryClient;
  user: { id: number; login: string; isAdmin: boolean } | null;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => {
    const data = await loadRoot();
    return { user: data.user, appName: data.appName, allowRegistration: data.allowRegistration };
  },
  loader: async ({ context }) => ({ user: context.user, appName: (context as any).appName }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'CF Redmine' },
    ],
    links: [
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const { user, appName } = Route.useLoaderData();
  return (
    <RootDocument>
      <Layout user={user} appName={appName ?? 'CF Redmine'}>
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
