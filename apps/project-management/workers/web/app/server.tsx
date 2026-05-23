/// <reference types="vite/client" />
//
// TanStack Start 1.168 single-call API.  The plugin auto-discovers
// `getRouter` from app/router.tsx so we don't pass createRouter here.
//
// Cloudflare passes the env binding as fetch's 2nd argument, but TanStack
// Start's request handler signature is (request, requestOpts) and it doesn't
// forward env down to route server handlers in 1.168.  As a workaround we
// stash env on globalThis at the entrypoint and read it via getEnv() helpers
// in auth-runtime.server.ts.  Single-threaded JS per isolate makes this
// race-safe.
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server';
import type { Env } from '~/lib/env';

const handler = createStartHandler(defaultStreamHandler);

export default {
  async fetch(request, env, ctx): Promise<Response> {
    (globalThis as { __env__?: Env }).__env__ = env;
    return await handler(request, { context: { cloudflare: { env, ctx } } as unknown as Record<string, unknown> });
  },
} satisfies ExportedHandler<Env>;
