import type { Env } from '~/lib/env';

const GITHUB_AUTHORIZE = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN = 'https://github.com/login/oauth/access_token';
const GITHUB_USER = 'https://api.github.com/user';
const GITHUB_EMAILS = 'https://api.github.com/user/emails';

export function githubConfigured(env: Env): boolean {
  return !!(env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET);
}

export function buildAuthorizeUrl(env: Env, state: string): string {
  const u = new URL(GITHUB_AUTHORIZE);
  u.searchParams.set('client_id', env.GITHUB_OAUTH_CLIENT_ID!);
  u.searchParams.set('redirect_uri', `${env.PUBLIC_BASE_URL}/oauth/github/callback`);
  u.searchParams.set('scope', 'read:user user:email');
  u.searchParams.set('state', state);
  return u.toString();
}

export interface GithubProfile {
  id: number;
  login: string;
  name?: string | null;
  avatar_url?: string | null;
  email?: string | null;
}

export async function exchangeCode(env: Env, code: string): Promise<string> {
  const res = await fetch(GITHUB_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: `${env.PUBLIC_BASE_URL}/oauth/github/callback`,
    }),
  });
  if (!res.ok) throw new Error(`GitHub token exchange failed: ${res.status}`);
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) throw new Error(`GitHub token exchange returned no token: ${data.error}`);
  return data.access_token;
}

export async function fetchProfile(token: string): Promise<GithubProfile> {
  const userRes = await fetch(GITHUB_USER, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'cf-redmine',
    },
  });
  if (!userRes.ok) throw new Error(`GitHub /user failed: ${userRes.status}`);
  const profile = (await userRes.json()) as GithubProfile;

  if (!profile.email) {
    const emailsRes = await fetch(GITHUB_EMAILS, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'cf-redmine',
      },
    });
    if (emailsRes.ok) {
      const emails = (await emailsRes.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;
      const primary = emails.find((e) => e.primary && e.verified) ?? emails[0];
      if (primary) profile.email = primary.email;
    }
  }
  return profile;
}
