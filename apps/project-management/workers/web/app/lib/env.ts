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
  DEFAULT_LANGUAGE: string;
  ATTACHMENT_TTL_DAYS?: string;

  // SSO — both must point at the same allenlabs-auth deployment. Sign-in
  // happens at AUTH_WEB_URL/sign-in; PM exchanges codes and verifies JWTs
  // against AUTH_API_URL.
  AUTH_WEB_URL: string;       // e.g. https://auth.allen.company
  AUTH_API_URL: string;       // e.g. https://auth-api.allen.company

  // secrets — only PUBLIC_BASE_URL is still needed for /auth/login to
  // build a callback URL the auth-web worker can redirect back to.
  PUBLIC_BASE_URL: string;
}
