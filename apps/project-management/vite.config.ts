import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [
    cloudflare(),
    tailwindcss(),
    // TanStack Start auto-discovers `<srcDirectory>/{start,router,client,server}.{ts,tsx}`.
    tanstackStart({
      srcDirectory: 'app',
      router: {
        routesDirectory: './app/routes',
        generatedRouteTree: './app/routeTree.gen.ts',
      },
      // .server.ts files and @tanstack/react-start/server imports are valid
      // server-only references that the createServerFn compiler hoists out of
      // the client bundle.  Tell the import-protection plugin to mock them on
      // the client instead of failing the build.
      importProtection: { behavior: 'mock' },
    }),
  ],
  resolve: {
    alias: { '~': path.resolve('./app') },
  },
});
