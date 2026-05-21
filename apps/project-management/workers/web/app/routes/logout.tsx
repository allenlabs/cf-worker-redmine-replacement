import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest, setCookie } from '@tanstack/react-start/server';
import { getEnv } from '~/server/auth-runtime.server';
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  readSessionToken,
  revokeSession,
} from '~/server/session';

const doLogout = createServerFn({ method: 'GET' }).handler(async () => {
  const env = getEnv();
  const req = getRequest();
  const token = readSessionToken(req?.headers.get('cookie') ?? null);
  if (token) await revokeSession(env, token);
  setCookie(SESSION_COOKIE, '', { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
  return { ok: true };
});

export const Route = createFileRoute('/logout')({
  beforeLoad: async () => {
    await doLogout();
    throw redirect({ to: '/login' });
  },
  component: () => null,
});
