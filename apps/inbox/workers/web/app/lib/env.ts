// Cloudflare bindings + env vars/secrets for the inbox web worker.
//
// Locally these come from wrangler (.dev.vars); in production they come from
// the bindings configured in wrangler.toml and `wrangler secret put`.

export interface Env {
  HYPERDRIVE: Hyperdrive;
  SESSION_KV: KVNamespace;
  ASSETS: Fetcher;

  // vars (from wrangler.toml [vars])
  APP_NAME: string;
  DEFAULT_LANGUAGE: string;

  // SSO — both must point at the same allenlabs-auth deployment.  Sign-in
  // happens at AUTH_WEB_URL/sign-in; inbox exchanges codes and verifies JWTs
  // against AUTH_API_URL.
  AUTH_WEB_URL: string;       // e.g. https://auth.allen.company
  AUTH_API_URL: string;       // e.g. https://auth-api.allen.company

  // Used by /auth/login to build a callback URL the auth-web worker can
  // redirect back to.
  PUBLIC_BASE_URL: string;

  // OpenTelemetry → Grafana LGTM.  Three gates in front of the collector
  // (WAF Bearer, Cloudflare Access service token, the OTLP collector
  // itself).  Wrangler secrets.
  OTEL_ACCESS_ID: string;
  OTEL_ACCESS_SECRET: string;
  OTEL_BEARER_TOKEN: string;

  // Web Push (VAPID).  `VAPID_PUBLIC_KEY` is the application server key
  // browsers use to scope subscriptions — safe to embed in the client
  // bundle / HTML.  `VAPID_PRIVATE_KEY` is the signing key for outbound
  // pushes; never leaves the worker.  `VAPID_SUBJECT` is the RFC 8292
  // contact URI, e.g. `mailto:ops@allenlabs.org`.
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}
