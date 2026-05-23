import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const APP_DIR = 'workers/web/app';

export default defineConfig({
  plugins: [
    tailwindcss(),
    // TanStack Start FIRST — its server-fn registry transformations need
    // to run before @cloudflare/vite-plugin builds the worker bundle.
    // With cloudflare first, the worker's `getServerFnById` was the
    // fake stub from @tanstack/start-server-core (returns undefined for
    // every id) — so every POST /_serverFn/<hash> 500'd before reaching
    // any handler.
    tanstackStart({
      srcDirectory: APP_DIR,
      importProtection: { behavior: 'mock' },
    }),
    cloudflare({ configPath: './workers/web/wrangler.toml' }),
  ],
  resolve: {
    alias: { '~': path.resolve(`./${APP_DIR}`) },
  },
});
