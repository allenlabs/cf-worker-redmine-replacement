import { createFileRoute, redirect } from '@tanstack/react-router';
import { getEnv } from '~/server/auth-runtime.server';

/**
 * Entry point for signing in.  Bounces the browser to the central sign-in
 * UI at auth.allen.company (allenlabs-auth-web), passing our callback URL.
 *
 *   /auth/login              → /sign-in?return_to=https://pm/auth/callback
 *   /auth/login?next=/foo    → carries `next` through the round-trip via the
 *                              cookie set by /auth/callback (we can't fit
 *                              arbitrary state into return_to without making
 *                              the auth-web worker re-encode it).
 *
 * Implemented as a server-side loader so the redirect happens before any
 * React renders.
 */

export const Route = createFileRoute('/auth/login')({
  loader: () => {
    const env = getEnv();
    const callback = new URL('/auth/callback', env.PUBLIC_BASE_URL).href;
    const target = new URL('/sign-in', env.AUTH_WEB_URL);
    target.searchParams.set('return_to', callback);
    throw redirect({ href: target.href });
  },
});
