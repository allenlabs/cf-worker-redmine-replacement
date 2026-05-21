import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { setCookie } from '@tanstack/react-start/server';
import { getEnv } from '~/server/auth-runtime.server';
import { buildAuthorizeUrl, githubConfigured } from '~/server/github-oauth';

const beginOauth = createServerFn({ method: 'GET' }).handler(async () => {
  const env = getEnv();
  if (!githubConfigured(env)) {
    return { ok: false as const, error: 'GitHub OAuth is not configured.' };
  }
  const state = crypto.randomUUID();
  const url = buildAuthorizeUrl(env, state);
  setCookie('oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return { ok: true as const, url };
});

export const Route = createFileRoute('/oauth/github')({
  beforeLoad: async () => {
    const res = await beginOauth();
    if (!res.ok) throw redirect({ to: '/login' });
    throw redirect({ href: res.url });
  },
  component: () => null,
});
