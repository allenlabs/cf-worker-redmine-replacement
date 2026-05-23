import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Layout } from '~/components/Layout';
import { getCurrentUser, getEnv } from '~/server/auth-runtime.server';
import appCss from '~/styles/app.css?url';

interface RouterContext {
  queryClient: QueryClient;
  user: { id: number; login: string; isAdmin: boolean } | null;
}

export const Route = createRootRouteWithContext<RouterContext>()({
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
