import { Link, createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { setResponseHeaders } from '@tanstack/react-start/server';
import { eq, or } from 'drizzle-orm';
import { useState } from 'react';
import { z } from 'zod';
import { users } from '~/db/schema';
import { getDb, getCurrentUser, getEnv } from '~/server/auth-runtime';
import { githubConfigured } from '~/server/github-oauth';
import { verifyPassword } from '~/server/password';
import { cookieHeader, createSessionToken } from '~/server/session';

const loginPageData = createServerFn({ method: 'GET' }).handler(async () => {
  const env = getEnv();
  return { githubEnabled: githubConfigured(env), allowRegistration: env.ALLOW_REGISTRATION === 'true' };
});

const submitLogin = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) =>
    z
      .object({
        loginOrEmail: z.string().min(1),
        password: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const env = getEnv();
    const db = getDb(env);
    const user = await db.query.users.findFirst({
      where: or(eq(users.login, data.loginOrEmail), eq(users.email, data.loginOrEmail.toLowerCase())),
    });
    if (!user) return { ok: false as const, error: 'Invalid credentials.' };
    if (user.status !== 'active') return { ok: false as const, error: 'Account locked.' };
    const ok = await verifyPassword(data.password, user.passwordHash, user.passwordSalt);
    if (!ok) return { ok: false as const, error: 'Invalid credentials.' };
    const token = await createSessionToken(env, {
      sub: String(user.id),
      login: user.login,
      admin: user.admin,
    });
    setResponseHeaders({ 'set-cookie': cookieHeader(token) });
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    return { ok: true as const };
  });

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    const user = await getCurrentUser();
    if (user) throw redirect({ to: '/' });
  },
  loader: () => loginPageData(),
  component: LoginPage,
});

function LoginPage() {
  const { githubEnabled, allowRegistration } = Route.useLoaderData();
  const router = useRouter();
  const [loginOrEmail, setLoginOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await submitLogin({ data: { loginOrEmail, password } });
      if (!res.ok) {
        setError(res.error);
      } else {
        await router.invalidate();
        router.navigate({ to: '/' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto card p-6 mt-10">
      <h1 className="text-xl font-semibold mb-4">Sign in</h1>
      <form onSubmit={handle} className="space-y-3">
        <div>
          <label className="label">Login or email</label>
          <input className="input" value={loginOrEmail} onChange={(e) => setLoginOrEmail(e.target.value)} autoFocus required />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button className="btn-primary w-full justify-center" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {githubEnabled ? (
        <div className="mt-4">
          <a href="/oauth/github" className="btn w-full justify-center">Sign in with GitHub</a>
        </div>
      ) : null}

      {allowRegistration ? (
        <p className="mt-4 text-sm text-gray-600">
          No account? <Link to="/register">Create one</Link>.
        </p>
      ) : null}
    </div>
  );
}
