import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// All TanStack Start sources (start.ts, router.tsx, client.tsx, server.tsx,
// routes/) live under this app's worker source tree, not at the repo root.
const APP_DIR = 'workers/web/app';

export default defineConfig({
  plugins: [
    cloudflare({ configPath: './workers/web/wrangler.toml' }),
    tailwindcss(),
    // TanStack Start auto-discovers `<srcDirectory>/{start,router,client,server}.{ts,tsx}`
    // and resolves `routesDirectory` + `generatedRouteTree` relative to srcDirectory.
    tanstackStart({
      srcDirectory: APP_DIR,
      // .server.ts files and @tanstack/react-start/server imports are valid
      // server-only references that the createServerFn compiler hoists out of
      // the client bundle.  Tell the import-protection plugin to mock them on
      // the client instead of failing the build.
      importProtection: { behavior: 'mock' },
    }),
  ],
  resolve: {
    alias: { '~': path.resolve(`./${APP_DIR}`) },
  },
});
