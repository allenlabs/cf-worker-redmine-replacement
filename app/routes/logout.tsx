import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getWebRequest, setResponseHeaders } from '@tanstack/react-start/server';
import { getEnv } from '~/server/auth-runtime';
import { clearCookieHeader, readSessionToken, revokeSession } from '~/server/session';

const doLogout = createServerFn({ method: 'GET' }).handler(async () => {
  const env = getEnv();
  const req = getWebRequest();
  const token = readSessionToken(req?.headers.get('cookie') ?? null);
  if (token) await revokeSession(env, token);
  setResponseHeaders({ 'set-cookie': clearCookieHeader() });
  return { ok: true };
});

export const Route = createFileRoute('/logout')({
  beforeLoad: async () => {
    await doLogout();
    throw redirect({ to: '/login' });
  },
  component: () => null,
});
