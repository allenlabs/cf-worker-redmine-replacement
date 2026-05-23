#!/usr/bin/env node
// Post-build workaround for @tanstack/react-start 1.168.9 +
// @cloudflare/vite-plugin: the worker-environment manifest stays as
// an empty stub (`{routes:{}, clientEntry:"/@id/virtual:..."}`)
// even after a production build because the manifest builder only
// runs in the "server" environment.  The worker pm_web/ build imports
// the stub by hash, so the SSR HTML ends up linking to the dev-only
// virtual-module URL → /assets/<bundle>.js is never loaded → no
// hydration → form-onSubmit handlers are dead → users can't create
// projects, click buttons, or do anything that needs JS.
//
// Fix: find the correct manifest file the server environment emitted
// (it sits in dist/server/assets/_tanstack-start-manifest_v-*.js) and
// copy its contents over the stub in dist/pm_web/assets/.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SERVER_ASSETS = join(ROOT, 'dist/server/assets');
const WORKER_ASSETS = join(ROOT, 'dist/pm_web/assets');

function findManifest(dir) {
  const entries = readdirSync(dir);
  const hit = entries.find((f) => f.startsWith('_tanstack-start-manifest_v-'));
  if (!hit) throw new Error(`No manifest file in ${dir}`);
  return join(dir, hit);
}

const serverManifestPath = findManifest(SERVER_ASSETS);
const workerManifestPath = findManifest(WORKER_ASSETS);
const correct = readFileSync(serverManifestPath, 'utf8');
const stub = readFileSync(workerManifestPath, 'utf8');

if (correct === stub) {
  console.log(`[patch-worker-manifest] already in sync: ${basename(workerManifestPath)}`);
  process.exit(0);
}

if (!correct.includes('clientEntry: "/assets/')) {
  throw new Error(
    `[patch-worker-manifest] server manifest also looks broken — refusing to copy. ` +
    `Expected clientEntry to point at /assets/...; got: ${correct.slice(0, 300)}`,
  );
}

writeFileSync(workerManifestPath, correct);
console.log(`[patch-worker-manifest] wrote ${basename(workerManifestPath)} from ${basename(serverManifestPath)}`);
