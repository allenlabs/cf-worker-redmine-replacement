import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [
    cloudflare(),
    tanstackStart({
      tsr: {
        appDirectory: 'app',
        generatedRouteTree: 'app/routeTree.gen.ts',
      },
    }),
  ],
  resolve: {
    alias: { '~': path.resolve('./app') },
  },
});
