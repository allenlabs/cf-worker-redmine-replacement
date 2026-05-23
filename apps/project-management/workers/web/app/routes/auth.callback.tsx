import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { findOrCreateUserBySsoImpl } from '~/server/auth';
import { getDb, getEnv } from '~/server/auth-runtime.server';
import { cookieHeader, verifySessionToken } from '~/server/session';

/**
 * Land here after the user completed sign-in on auth.allen.company.  We
 * trade the short-lived `code` for an RS256 JWT against auth-api, verify
 * it via JWKS, look up or create the local users row, and stash the JWT
 * in the `cfr_session` cookie before bouncing the browser to the home
 * page (or `next=` if it was provided).
 */

const Search = z.object({
  code: z.string().optional(),
  next: z.string().optional(),
});

export const Route = createFileRoute('/auth/callback')({
  validateSearch: Search,
  loader: async ({ location }) => {
    const env = getEnv();
    const params = Search.parse(location.search);
    const code = params.code;
    if (!code) {
      // Bounce back to /auth/login to start a fresh attempt rather than
      // surfacing a raw error page — most likely the user landed here by
      // typing the URL or bookmarking it.
      throw redirect({ to: '/auth/login' });
    }

    const exchangeRes = await fetch(`${env.AUTH_API_URL}/sso/exchange`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: new URL(env.PUBLIC_BASE_URL).origin,
      }),
    });
    if (exchangeRes.status !== 200) {
      const detail = await exchangeRes.text().catch(() => '');
      throw new Response(`Sign-in exchange failed: ${detail.slice(0, 200)}`, { status: 400 });
    }
    const { token } = (await exchangeRes.json()) as { token?: string };
    if (!token) {
      throw new Response('Sign-in exchange returned no token', { status: 500 });
    }

    const payload = await verifySessionToken(env, token);
    if (!payload) {
      throw new Response('Issued JWT failed local verification', { status: 500 });
    }

    await findOrCreateUserBySsoImpl(getDb(env), payload);

    const next = params.next && params.next.startsWith('/') ? params.next : '/';
    throw redirect({
      href: next,
      headers: { 'set-cookie': cookieHeader(token) },
    });
  },
});
