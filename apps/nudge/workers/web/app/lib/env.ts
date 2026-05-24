// Cloudflare bindings + env vars/secrets for the nudge web worker.

export interface Env {
  HYPERDRIVE: Hyperdrive;
  SESSION_KV: KVNamespace;
  ASSETS: Fetcher;

  APP_NAME: string;

  AUTH_WEB_URL: string;
  AUTH_API_URL: string;
  PUBLIC_BASE_URL: string;

  OTEL_ACCESS_ID: string;
  OTEL_ACCESS_SECRET: string;
  OTEL_BEARER_TOKEN: string;
}
