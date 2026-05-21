import { defineConfig } from '@tanstack/react-start/config';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import path from 'node:path';

export default defineConfig({
  tsr: {
    appDirectory: 'app',
    generatedRouteTree: 'app/routeTree.gen.ts',
  },
  server: {
    // Cloudflare Workers (module syntax) — Nitro preset
    preset: 'cloudflare-module',
    compatibilityDate: '2026-01-01',
    rollupConfig: {
      external: ['cloudflare:workers'],
    },
  },
  vite: {
    resolve: {
      alias: {
        '~': path.resolve('./app'),
      },
    },
    plugins: [
      TanStackRouterVite({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: 'app/routes',
        generatedRouteTree: 'app/routeTree.gen.ts',
      }),
    ],
  },
});
