import { fileURLToPath } from 'node:url';
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'core',
      root: './packages/core',
      include: ['src/**/*.test.ts'],
      environment: 'node',
    },
  },
  {
    test: {
      name: 'db',
      root: './packages/db',
      include: ['src/__tests__/**/*.test.ts'],
      environment: 'node',
    },
  },
  {
    test: {
      name: 'config',
      root: './packages/config',
      include: ['src/__tests__/**/*.test.ts'],
      environment: 'node',
    },
  },
  {
    // Mirrors the `@/*` -> `./src/*` path mapping in apps/web/tsconfig.json so
    // API route handlers (which import via `@/lib/...`) are testable at all.
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
      },
    },
    test: {
      name: 'web',
      root: './apps/web',
      include: ['src/**/__tests__/**/*.test.ts'],
      environment: 'node',
    },
  },
  {
    test: {
      name: 'worker',
      root: './apps/worker',
      include: ['src/__tests__/**/*.test.ts'],
      environment: 'node',
    },
  },
]);
