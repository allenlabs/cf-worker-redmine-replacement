import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import path from 'node:path';

const ROOT = path.resolve(__dirname);

export default defineConfig({
  resolve: {
    alias: { '~': path.resolve(ROOT, './app') },
  },
  test: {
    globals: true,
    projects: [
      {
        plugins: [react()],
        resolve: { alias: { '~': path.resolve(ROOT, './app') } },
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/lib/**/*.test.ts', 'tests/server/**/*.test.ts'],
          setupFiles: ['./tests/_setup/setup-node.ts'],
        },
      },
      {
        plugins: [react()],
        resolve: { alias: { '~': path.resolve(ROOT, './app') } },
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['tests/components/**/*.test.tsx'],
          setupFiles: ['./tests/_setup/setup-jsdom.ts'],
        },
      },
      {
        plugins: [
          cloudflareTest({
            main: './app/test-worker.ts',
            miniflare: {
              compatibilityDate: '2026-01-01',
              compatibilityFlags: ['nodejs_compat'],
              d1Databases: ['DB'],
              kvNamespaces: ['SESSION_KV'],
              r2Buckets: ['FILES'],
              bindings: {
                APP_NAME: 'CF Redmine (test)',
                ALLOW_REGISTRATION: 'true',
                DEFAULT_LANGUAGE: 'en',
                JWT_SECRET: 'wrangler-test-secret-do-not-use-anywhere-else-12345',
                PUBLIC_BASE_URL: 'http://localhost:3000',
                GITHUB_OAUTH_CLIENT_ID: '',
                GITHUB_OAUTH_CLIENT_SECRET: '',
              },
            },
          }),
        ],
        resolve: { alias: { '~': path.resolve(ROOT, './app') } },
        test: {
          name: 'workers',
          include: ['tests/workers/**/*.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      include: ['app/**/*.{ts,tsx}'],
      exclude: [
        'app/routeTree.gen.ts',
        'app/client.tsx',
        'app/ssr.tsx',
        'app/router.tsx',
        'app/test-worker.ts',
        'app/lib/env.ts',
        'app/routes/**',
        'app/db/**',
        '**/*.d.ts',
      ],
      thresholds: {
        lines: 100,
        statements: 100,
        functions: 100,
        branches: 95,
      },
    },
  },
});
