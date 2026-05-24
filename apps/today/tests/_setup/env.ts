import type { Env } from '~/lib/env';

export function makeMemoryKV(): KVNamespace {
  const store = new Map<string, { v: string; expiresAt?: number }>();
  return {
    async get(key: string) {
      const v = store.get(key);
      if (!v) return null;
      if (v.expiresAt && v.expiresAt < Date.now()) {
        store.delete(key);
        return null;
      }
      return v.v;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      store.set(key, {
        v: value,
        expiresAt: opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : undefined,
      });
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list() {
      return { keys: Array.from(store.keys()).map((name) => ({ name })) };
    },
  } as unknown as KVNamespace;
}

export function makeTestEnv(overrides: Partial<Env> = {}): Env {
  return {
    HYPERDRIVE: {} as unknown as Hyperdrive,
    SESSION_KV: makeMemoryKV(),
    ASSETS: {} as Fetcher,
    APP_NAME: 'Today (test)',
    DEFAULT_LANGUAGE: 'en',
    AUTH_WEB_URL: 'https://auth.test',
    AUTH_API_URL: 'https://auth-api.test',
    PUBLIC_BASE_URL: 'http://localhost:3000',
    OTEL_ACCESS_ID: 'test-otel-id',
    OTEL_ACCESS_SECRET: 'test-otel-secret',
    OTEL_BEARER_TOKEN: 'test-otel-bearer',
    ...overrides,
  };
}
