import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getWebRequest, setResponseHeaders } from '@tanstack/react-start/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { users } from '~/db/schema';
import { getDb, getEnv } from '~/server/auth-runtime';
import { exchangeCode, fetchProfile } from '~/server/github-oauth';
import { cookieHeader, createSessionToken } from '~/server/session';

const finishOauth = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) =>
    z.object({ code: z.string(), state: z.string().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const env = getEnv();
    const req = getWebRequest();
    const cookie = req?.headers.get('cookie') ?? '';
    const stateCookie = cookie
      .split(';')
      .map((p) => p.trim())
      .find((p) => p.startsWith('oauth_state='))
      ?.slice('oauth_state='.length);
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
      sub: String(user.id),
      login: user.login,
      admin: user.admin,
    });
    setResponseHeaders({
      'set-cookie': [
        cookieHeader(session),
        // expire the state cookie
        `oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
      ].join(', '),
    });
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    return { ok: true as const };
  });

export const Route = createFileRoute('/oauth/github/callback')({
  validateSearch: (s: Record<string, unknown>) =>
    ({ code: String(s.code ?? ''), state: s.state ? String(s.state) : undefined }),
  beforeLoad: async ({ search }) => {
    if (!search.code) throw redirect({ to: '/login' });
    const res = await finishOauth({ data: { code: search.code, state: search.state } });
    if (!res.ok) throw redirect({ to: '/login' });
    throw redirect({ to: '/' });
  },
  component: () => null,
});
