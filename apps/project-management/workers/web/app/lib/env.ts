// Cloudflare bindings + env vars/secrets available to the worker at runtime.
//
// Locally these come from wrangler (.dev.vars) ; in production they come from
// the bindings configured in wrangler.toml and `wrangler secret put`.

export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  SESSION_KV: KVNamespace;
  ASSETS: Fetcher;

  // vars (from wrangler.toml [vars])
  APP_NAME: string;
  ALLOW_REGISTRATION: string;
  DEFAULT_LANGUAGE: string;

  // secrets
  JWT_SECRET: string;
  PUBLIC_BASE_URL: string;
  GITHUB_OAUTH_CLIENT_ID?: string;
  GITHUB_OAUTH_CLIENT_SECRET?: string;
}
