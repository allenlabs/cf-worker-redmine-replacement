import { createFileRoute, redirect } from '@tanstack/react-router';
import { getRequest } from '@tanstack/react-start/server';
import { getEnv } from '~/server/auth-runtime.server';
import {
  clearCookieHeader,
  readSessionToken,
  revokeSession,
} from '~/server/session.server';

/**
 * Logout — revoke the local session (so even an unexpired JWT stops
 * working here) and bounce the user to auth-api's sign-out endpoint so
 * Better Auth clears its cookie too.  When they hit auth.allen.company
 * again the browser will see no cookie and they'll be prompted to sign
 * in fresh.
 */

export const Route = createFileRoute('/auth/logout')({
  loader: async () => {
    const env = getEnv();
    const req = getRequest();
    const cookie = req?.headers.get('cookie') ?? null;
    const token = readSessionToken(cookie);
    if (token) {
      try {
        await revokeSession(env, token);
      } catch {
        // Best-effort: a failed revoke just means the JWT keeps working
        // until natural expiration (≤ 1h).  Don't block the logout flow.
      }
    }
    const apiSignOut = new URL('/api/auth/sign-out', env.AUTH_API_URL).href;
    throw redirect({
      href: apiSignOut,
      headers: { 'set-cookie': clearCookieHeader() },
    });
  },
});
