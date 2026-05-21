/// <reference types="vite/client" />
//
// Server entry — same caveat as `client.tsx`.  TanStack Start 1.168's
// `createStartHandler` is wired together with the `tanstackStart()` Vite
// plugin and the `@cloudflare/vite-plugin` to produce a Cloudflare Workers
// module-syntax bundle in `dist/server/`.  Verified end-to-end deploy is on
// the project's TODO list (see README "Status").
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server';
import { createRouter } from './router';

export default createStartHandler({ createRouter })(defaultStreamHandler);
