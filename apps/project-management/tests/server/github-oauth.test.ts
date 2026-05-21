import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTestEnv } from '../_setup/env';
import {
  buildAuthorizeUrl,
  exchangeCode,
  fetchProfile,
  githubConfigured,
} from '~/server/github-oauth';

describe('githubConfigured', () => {
  it('returns true when both id and secret are present', () => {
    expect(githubConfigured(makeTestEnv())).toBe(true);
  });

  it('returns false when client id missing', () => {
    expect(githubConfigured(makeTestEnv({ GITHUB_OAUTH_CLIENT_ID: '' }))).toBe(false);
  });

  it('returns false when client secret missing', () => {
    expect(githubConfigured(makeTestEnv({ GITHUB_OAUTH_CLIENT_SECRET: '' }))).toBe(false);
  });

  it('returns false when both missing', () => {
    expect(
      githubConfigured(
        makeTestEnv({ GITHUB_OAUTH_CLIENT_ID: undefined, GITHUB_OAUTH_CLIENT_SECRET: undefined }),
      ),
    ).toBe(false);
  });
});

describe('buildAuthorizeUrl', () => {
  it('encodes the expected query params', () => {
    const url = new URL(buildAuthorizeUrl(makeTestEnv(), 'state-abc'));
    expect(url.host).toBe('github.com');
    expect(url.pathname).toBe('/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('gh-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/oauth/github/callback');
    expect(url.searchParams.get('scope')).toBe('read:user user:email');
    expect(url.searchParams.get('state')).toBe('state-abc');
  });
});

describe('exchangeCode', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns the access_token from a successful exchange', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'ghu_abc' }), { status: 200 }),
    );
    const token = await exchangeCode(makeTestEnv(), 'code-xyz');
    expect(token).toBe('ghu_abc');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      client_id: 'gh-client-id',
      client_secret: 'gh-client-secret',
      code: 'code-xyz',
    });
  });

  it('throws when GitHub returns non-OK', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(exchangeCode(makeTestEnv(), 'x')).rejects.toThrow(/500/);
  });

  it('throws when GitHub returns no token', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'bad_verification_code' }), { status: 200 }),
    );
    await expect(exchangeCode(makeTestEnv(), 'x')).rejects.toThrow(/no token/);
  });
});

describe('fetchProfile', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns the profile when /user includes an email', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ id: 1, login: 'octocat', email: 'oct@example.com', avatar_url: 'a' }),
        { status: 200 },
      ),
    );
    const profile = await fetchProfile('tok');
    expect(profile.login).toBe('octocat');
    expect(profile.email).toBe('oct@example.com');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('falls back to /user/emails when /user has no email', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 1, login: 'octocat', email: null }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { email: 'secondary@example.com', primary: false, verified: true },
            { email: 'primary@example.com', primary: true, verified: true },
          ]),
          { status: 200 },
        ),
      );
    const profile = await fetchProfile('tok');
    expect(profile.email).toBe('primary@example.com');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses any email when no verified-primary exists', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 1, login: 'oct', email: null }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ email: 'only@example.com', primary: false, verified: false }]),
          { status: 200 },
        ),
      );
    const profile = await fetchProfile('tok');
    expect(profile.email).toBe('only@example.com');
  });

  it('leaves email null when /user/emails returns an empty array', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 1, login: 'oct', email: null }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('[]', { status: 200 }));
    const profile = await fetchProfile('tok');
    expect(profile.email).toBeFalsy();
  });

  it('leaves email null when /user/emails also fails', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 1, login: 'oct', email: null }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('', { status: 500 }));
    const profile = await fetchProfile('tok');
    expect(profile.email).toBeFalsy();
  });

  it('throws when /user fails', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }));
    await expect(fetchProfile('tok')).rejects.toThrow(/401/);
  });
});
