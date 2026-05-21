import { Link, createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { setResponseHeaders } from '@tanstack/react-start/server';
import { eq, or } from 'drizzle-orm';
import { useState } from 'react';
import { z } from 'zod';
import { users } from '~/db/schema';
import { getDb, getCurrentUser, getEnv } from '~/server/auth';
import { hashPassword } from '~/server/password';
import { cookieHeader, createSessionToken } from '~/server/session';

const pageData = createServerFn({ method: 'GET' }).handler(async () => {
  const env = getEnv();
  return { allowRegistration: env.ALLOW_REGISTRATION === 'true' };
});

const submitRegister = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        login: z
          .string()
          .min(3)
          .max(40)
          .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
        email: z.string().email(),
        firstname: z.string().optional().default(''),
        lastname: z.string().optional().default(''),
        password: z.string().min(8).max(128),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const env = getEnv();
    if (env.ALLOW_REGISTRATION !== 'true') {
      return { ok: false as const, error: 'Registration is disabled.' };
    }
    const db = getDb(env);
    const existing = await db.query.users.findFirst({
      where: or(eq(users.login, data.login), eq(users.email, data.email.toLowerCase())),
    });
    if (existing) return { ok: false as const, error: 'Login or email already in use.' };

    const { hash, salt } = await hashPassword(data.password);
    const count = await db.select({ id: users.id }).from(users).limit(1);
    const isFirstUser = count.length === 0;
    const [user] = await db
      .insert(users)
      .values({
        login: data.login,
        email: data.email.toLowerCase(),
        firstname: data.firstname,
        lastname: data.lastname,
        passwordHash: hash,
        passwordSalt: salt,
        admin: isFirstUser, // first user gets admin
        language: env.DEFAULT_LANGUAGE,
      })
      .returning();

    const token = await createSessionToken(env, {
      sub: String(user.id),
      login: user.login,
      admin: user.admin,
    });
    setResponseHeaders({ 'set-cookie': cookieHeader(token) });
    return { ok: true as const, isFirstUser };
  });

export const Route = createFileRoute('/register')({
  beforeLoad: async () => {
    const user = await getCurrentUser();
    if (user) throw redirect({ to: '/' });
  },
  loader: () => pageData(),
  component: RegisterPage,
});

function RegisterPage() {
  const { allowRegistration } = Route.useLoaderData();
  const router = useRouter();
  const [form, setForm] = useState({
    login: '',
    email: '',
    firstname: '',
    lastname: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!allowRegistration) {
    return (
      <div className="max-w-sm mx-auto card p-6 mt-10">
        <h1 className="text-xl font-semibold mb-2">Registration disabled</h1>
        <p className="text-sm text-gray-600">
          The administrator has disabled self-registration. Please ask them to create an account for you.
        </p>
        <Link to="/login" className="btn mt-4">Back to login</Link>
      </div>
    );
  }

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await submitRegister({ data: form });
      if (!res.ok) setError(res.error);
      else {
        await router.invalidate();
        router.navigate({ to: '/' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto card p-6 mt-10">
      <h1 className="text-xl font-semibold mb-4">Create account</h1>
      <form onSubmit={handle} className="space-y-3">
        <div>
          <label className="label">Login</label>
          <input className="input" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} required />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">First name</label>
            <input className="input" value={form.firstname} onChange={(e) => setForm({ ...form, firstname: e.target.value })} />
          </div>
          <div>
            <label className="label">Last name</label>
            <input className="input" value={form.lastname} onChange={(e) => setForm({ ...form, lastname: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
          <p className="text-xs text-gray-500 mt-1">At least 8 characters.</p>
        </div>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button className="btn-primary w-full justify-center" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p className="mt-4 text-sm text-gray-600">
        Already registered? <Link to="/login">Sign in</Link>.
      </p>
    </div>
  );
}
