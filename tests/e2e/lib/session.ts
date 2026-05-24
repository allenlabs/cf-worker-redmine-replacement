/**
 * Playwright-native port of /tmp/extract_cookie.mjs.
 *
 * The deployed Allen Labs SSO flow is:
 *   1. App page (e.g. https://inbox.allen.company/) checks for `<app>_session`
 *      cookie.  No cookie → 307 to /auth/login.
 *   2. /auth/login is a tiny SSR page whose <form action="/sign-in"
 *      method="post"> posts to https://auth.allen.company/sign-in with
 *      `{ email, password, return_to: '<app>/auth/callback' }`.
 *   3. auth.allen.company validates the password, mints a short-lived SSO
 *      "code", and 303-redirects to `return_to?code=…`.
 *   4. The app's `/auth/callback` exchanges the code for a JWT and sets the
 *      `<app>_session` cookie via Set-Cookie.
 *
 * Each app has its OWN session cookie (`inbox_session`, `focus_session`,
 * `today_session`, `context_session`) because they live on different
 * subdomains.  So we run the sign-in flow once per app, accumulate all
 * cookies into one storage state, and reuse that state across every spec.
 *
 * No browser launch required — Playwright's `request` API speaks raw HTTP,
 * follows redirects, and tracks the cookie jar for us.
 */

import { request as requestModule, type APIRequest, type APIRequestContext } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { APPS, AUTH_BASE_URL, TEST_EMAIL_DEFAULT, type AppConfig } from './fixtures';

export interface PwCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}

export interface StorageState {
  cookies: PwCookie[];
  origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>;
}

export interface SignInOptions {
  email?: string;
  password?: string;
  /** Where to cache the resulting storageState.  Default: tests/e2e/.auth/state.json */
  outputPath?: string;
  /** Skip if cached state is newer than this many ms.  Default: 6 hours. */
  freshnessMs?: number;
  /** Force re-auth even when cache is fresh. */
  force?: boolean;
}

// Resolve relative to this file at runtime.  Playwright transpiles the
// TypeScript to CJS by default (no `"type": "module"`), so `__dirname`
// is available; we keep an ESM-safe fallback in case someone flips the
// package to ESM later.
function thisDir(): string {
  if (typeof __dirname !== 'undefined') return __dirname;
  /* c8 ignore next 3 — ESM fallback, only fires if package becomes ESM */
  const url = (require('node:url') as typeof import('node:url')).fileURLToPath;
  return path.dirname(url(eval('import.meta.url')));
}
const DEFAULT_OUTPUT = path.resolve(thisDir(), '..', '.auth', 'state.json');
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export function getCredentials(opts: SignInOptions): { email: string; password: string } {
  const email = opts.email ?? process.env.E2E_EMAIL ?? TEST_EMAIL_DEFAULT;
  const password = opts.password ?? process.env.E2E_PASSWORD;
  if (!password) {
    throw new Error(
      'E2E_PASSWORD is required.  Export it before running the suite: ' +
        '`export E2E_PASSWORD=…`.  We do not read pass-cli from the test ' +
        'process because pass-cli is interactive in many shells.',
    );
  }
  return { email, password };
}

/**
 * Sign in to one app via auth.allen.company and return the cookies the
 * server set.  This walks the 303-then-302 chain manually with `maxRedirects=0`
 * so we can capture Set-Cookie headers from every hop.
 */
export async function signInOnce(
  ctx: APIRequestContext,
  app: AppConfig,
  email: string,
  password: string,
): Promise<void> {
  const returnTo = `${app.baseUrl}/auth/callback`;

  // auth-api's /api/auth/sign-in/email is rate-limited (10 / 60s / IP).
  // When we trip it the web auth re-shows /sign-in with the error in the
  // querystring; back off and retry rather than failing the whole suite.
  const MAX_RATE_LIMIT_RETRIES = 4;
  let attempt = 0;
  let signInRes;
  while (true) {
    signInRes = await ctx.post(`${AUTH_BASE_URL}/sign-in`, {
      form: { email, password, return_to: returnTo },
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    if (signInRes.status() === 303 || signInRes.status() === 302) {
      const loc = signInRes.headers()['location'] ?? '';
      if (/error=Too\+many\+requests/i.test(loc) || /error=Too%20many%20requests/i.test(loc)) {
        if (attempt >= MAX_RATE_LIMIT_RETRIES) break;
        const wait = 15_000 + attempt * 15_000;
        console.warn(
          `[e2e:auth] auth-api rate-limited (${app.name}); waiting ${wait}ms then retrying…`,
        );
        await new Promise((r) => setTimeout(r, wait));
        attempt++;
        continue;
      }
    }
    break;
  }

  if (signInRes.status() !== 303 && signInRes.status() !== 302) {
    const body = await signInRes.text().catch(() => '');
    throw new Error(
      `[e2e:auth] Sign-in did not redirect (got ${signInRes.status()}). ` +
        `Body: ${body.slice(0, 200)}`,
    );
  }
  const loc = signInRes.headers()['location'];
  if (!loc) {
    throw new Error('[e2e:auth] Sign-in redirect missing Location header');
  }
  if (loc.includes('error=')) {
    throw new Error(`[e2e:auth] Sign-in failed: ${decodeURIComponent(loc)}`);
  }
  if (!loc.startsWith(app.baseUrl)) {
    throw new Error(
      `[e2e:auth] Sign-in redirect went somewhere unexpected: ${loc}`,
    );
  }

  // Hit the /auth/callback URL — it'll exchange the code for a JWT and
  // 302 back to "/" with Set-Cookie.  request context follows the final
  // redirect cookie automatically into its jar.
  const cbRes = await ctx.get(loc, { failOnStatusCode: false });
  if (cbRes.status() >= 400) {
    const body = await cbRes.text().catch(() => '');
    throw new Error(
      `[e2e:auth] /auth/callback for ${app.name} failed: ${cbRes.status()} ${body.slice(0, 200)}`,
    );
  }

  // Sanity check: the request context should now hold the per-app cookie.
  const state = await ctx.storageState();
  const hit = state.cookies.find((c) => c.name === app.cookieName);
  if (!hit) {
    throw new Error(
      `[e2e:auth] Did not receive ${app.cookieName} cookie after callback ` +
        `for ${app.name} (got: ${state.cookies.map((c) => c.name).join(',')}).`,
    );
  }
}

/**
 * Sign in to every app and persist a single Playwright storage-state JSON
 * so individual specs can reuse it without paying auth latency.
 *
 * @returns the absolute path to the saved storageState file.
 */
export async function buildStorageState(opts: SignInOptions = {}): Promise<string> {
  const outputPath = opts.outputPath ?? DEFAULT_OUTPUT;
  const freshness = opts.freshnessMs ?? SIX_HOURS_MS;

  if (!opts.force) {
    try {
      const stat = await fs.stat(outputPath);
      const age = Date.now() - stat.mtimeMs;
      if (age < freshness) {
        return outputPath;
      }
    } catch {
      // No cached state — fall through and build it.
    }
  }

  const { email, password } = getCredentials(opts);

  // One request context spans every sign-in so cookies accumulate.
  const factory: APIRequest = requestModule;
  const ctx = await factory.newContext();
  try {
    // auth-api rate-limits /api/auth/sign-in/email to 10 requests / 60s per
    // IP.  With 5 apps in APPS we'd burn 5 of those on every cold cache
    // build, leaving no headroom for retries or back-to-back local re-runs.
    // A modest 1.2s pause between sign-ins keeps the rolling-window count
    // far under the limit and is well under the 6h cache freshness window.
    const SIGN_IN_GAP_MS = Number(process.env.E2E_SIGN_IN_GAP_MS ?? 1200);
    let i = 0;
    for (const app of Object.values(APPS)) {
      if (i > 0 && SIGN_IN_GAP_MS > 0) {
        await new Promise((r) => setTimeout(r, SIGN_IN_GAP_MS));
      }
      await signInOnce(ctx, app, email, password);
      i++;
    }
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await ctx.storageState({ path: outputPath });
  } finally {
    await ctx.dispose();
  }

  return outputPath;
}

export const _internal = { DEFAULT_OUTPUT, SIX_HOURS_MS };
