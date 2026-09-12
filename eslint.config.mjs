import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/*.tsbuildinfo',
      'pnpm-lock.yaml',
    ],
  },

  // Base rules for all TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // BOUNDARY: packages/core cannot import from apps
  {
    files: ['packages/core/**/*.ts', 'packages/core/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['geotrack-web', 'geotrack-web/*'],
            message: 'core must not depend on web app (ADR-010)',
          },
          {
            group: ['geotrack-worker', 'geotrack-worker/*'],
            message: 'core must not depend on worker (ADR-010)',
          },
        ],
      }],
    },
  },

  // BOUNDARY: web app cannot import from worker
  {
    files: ['apps/web/**/*.ts', 'apps/web/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['geotrack-worker', 'geotrack-worker/*'],
            message: 'web app must not depend on worker (ADR-010)',
          },
        ],
      }],
    },
  },

  // BOUNDARY: worker cannot import from web app;
  // direct undici/playwright imports forbidden — use safe-fetch and Playwright factory (ADR-015)
  {
    files: ['apps/worker/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['geotrack-web', 'geotrack-web/*'],
            message: 'worker must not depend on web app (ADR-010)',
          },
        ],
        paths: [
          {
            name: 'undici',
            message: 'Use @geotrack/core/net/safe-fetch instead of undici directly (ADR-015)',
          },
          {
            name: 'playwright',
            message: 'Use the Playwright context factory from @geotrack/core (ADR-015)',
          },
          {
            name: '@playwright/test',
            message: 'Use the Playwright context factory from @geotrack/core (ADR-015)',
          },
        ],
      }],
    },
  },
);
