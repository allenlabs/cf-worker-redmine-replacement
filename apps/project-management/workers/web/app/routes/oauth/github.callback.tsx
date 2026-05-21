import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getCookie, getRequest, setCookie } from '@tanstack/react-start/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { users } from '~/db/schema';
import { getDb, getEnv } from '~/server/auth-runtime.server';
import { exchangeCode, fetchProfile } from '~/server/github-oauth';
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  createSessionToken,
} from '~/server/session';

const finishOauth = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) =>
    z.object({ code: z.string(), state: z.string().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const env = getEnv();
    const stateCookie = getCookie('oauth_state');
    if (!data.state || !stateCookie || data.state !== stateCookie) {
      return { ok: false as const, error: 'Invalid OAuth state.' };
    }
    const token = await exchangeCode(env, data.code);
    const profile = await fetchProfile(token);
    if (!profile.email) {
      return { ok: false as const, error: 'GitHub account has no public email.' };
    }
    const db = getDb(env);

    let user = await db.query.users.findFirst({ where: eq(users.githubId, profile.id) });
    if (!user) {
      const byEmail = await db.query.users.findFirst({
        where: eq(users.email, profile.email.toLowerCase()),
      });
      if (byEmail) {
        await db
          .update(users)
          .set({ githubId: profile.id, avatarUrl: profile.avatar_url ?? byEmail.avatarUrl })
          .where(eq(users.id, byEmail.id));
        user = (await db.query.users.findFirst({ where: eq(users.id, byEmail.id) }))!;
      } else {
        const count = await db.select({ id: users.id }).from(users).limit(1);
        const isFirstUser = count.length === 0;
        const [created] = await db
          .insert(users)
          .values({
            login: profile.login,
            email: profile.email.toLowerCase(),
            firstname: (profile.name ?? '').split(' ')[0] ?? '',
            lastname: (profile.name ?? '').split(' ').slice(1).join(' '),
            githubId: profile.id,
            avatarUrl: profile.avatar_url,
            admin: isFirstUser,
          })
          .returning();
        user = created;
      }
    }

    const session = await createSessionToken(env, {
      sub: String(user!.id),
      login: user!.login,
      admin: user!.admin,
    });
    setCookie(SESSION_COOKIE, session, SESSION_COOKIE_OPTIONS);
    setCookie('oauth_state', '', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user!.id));
    return { ok: true as const };
  });

interface GithubCallbackSearch {
  code: string;
  state: string | undefined;
}

export const Route = createFileRoute('/oauth/github/callback')({
  validateSearch: (s: Record<string, unknown>): GithubCallbackSearch => ({
    code: String(s.code ?? ''),
    state: s.state ? String(s.state) : undefined,
  }),
  beforeLoad: async ({ search }) => {
    if (!search.code) throw redirect({ to: '/login' });
    const res = await finishOauth({ data: { code: search.code, state: search.state } });
    if (!res.ok) throw redirect({ to: '/login' });
    throw redirect({ to: '/' });
  },
  component: () => null,
});
