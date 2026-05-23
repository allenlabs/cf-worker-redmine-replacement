import type { Env } from '~/lib/env';

// In-memory KV implementation good enough for session-revocation tests.
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

// In-memory R2 implementation good enough for attachment tests.
export function makeMemoryR2(): R2Bucket {
  const store = new Map<string, { body: Uint8Array; contentType?: string }>();
  return {
    async put(key: string, value: ArrayBufferView | ArrayBuffer | Uint8Array, opts?: any) {
      const bytes =
        value instanceof Uint8Array
          ? value
          : value instanceof ArrayBuffer
            ? new Uint8Array(value)
            : new Uint8Array((value as ArrayBufferView).buffer);
      store.set(key, { body: bytes, contentType: opts?.httpMetadata?.contentType });
      return { key };
    },
    async get(key: string) {
      const entry = store.get(key);
      if (!entry) return null;
      return {
        body: new ReadableStream({
          start(c) {
            c.enqueue(entry.body);
            c.close();
          },
        }),
        async arrayBuffer() {
          return entry.body.buffer.slice(
            entry.body.byteOffset,
            entry.body.byteOffset + entry.body.byteLength,
          );
        },
      } as unknown as R2ObjectBody;
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list() {
      return {
        objects: Array.from(store.keys()).map((key) => ({ key, size: store.get(key)!.body.length })),
      } as any;
    },
  } as unknown as R2Bucket;
}

export function makeTestEnv(overrides: Partial<Env> = {}): Env {
  return {
    HYPERDRIVE: {} as unknown as Hyperdrive, // not used directly in unit tests; getDb is mocked
    FILES: makeMemoryR2(),
    SESSION_KV: makeMemoryKV(),
    ASSETS: {} as Fetcher,
    APP_NAME: 'CF Redmine (test)',
    DEFAULT_LANGUAGE: 'en',
    AUTH_WEB_URL: 'https://auth.test',
    AUTH_API_URL: 'https://auth-api.test',
    PUBLIC_BASE_URL: 'http://localhost:3000',
    OTEL_ACCESS_ID: 'test-otel-id',
    OTEL_ACCESS_SECRET: 'test-otel-secret',
    ...overrides,
  };
}

// Shared state object so vi.hoisted-friendly mock factories can mutate it
// from `beforeEach` without recreating the mock itself.
export function makeAuthState() {
  return {
    db: null as any,
    env: null as Env | null,
    currentUser: null as null | {
      id: number;
      login: string;
      email: string;
      firstname: string;
      lastname: string;
      isAdmin: boolean;
      avatarUrl: string | null;
    },
    ctx: null as null | {
      userId: number;
      isAdmin: boolean;
      permissionsByProject: Record<number, Set<string>>;
    },
  };
}

export type AuthState = ReturnType<typeof makeAuthState>;

// Vitest-friendly factory for mocking `~/server/auth`.  Call this from inside
// `vi.mock('~/server/auth', () => buildAuthMock(state))`.
export function buildAuthMock(state: AuthState) {
  return {
    getEnv: () => state.env!,
    getDb: () => state.db,
    getCurrentUser: async () => state.currentUser,
    requireUser: async () => {
      if (!state.currentUser) throw new Error('UnauthorizedError');
      return state.currentUser;
    },
    requireAdmin: async () => {
      if (!state.currentUser?.isAdmin) throw new Error('ForbiddenError');
      return state.currentUser;
    },
    buildAuthContext: async () => state.ctx!,
    requirePermission: async () => ({ user: state.currentUser!, ctx: state.ctx! }),
  };
}
