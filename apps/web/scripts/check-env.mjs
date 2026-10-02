#!/usr/bin/env node
import { join } from 'node:path';

// Runs before `next build` (see package.json's "build" script) so a missing
// required variable fails the Vercel build itself, not just a cold-started
// serverless function at runtime.
//
// Why this exists in addition to src/instrumentation.ts: Vercel does not run
// `next start` — it runs the built output as serverless functions, so
// instrumentation.ts's register() only runs on a function's cold start. A
// missing variable there makes ONE invocation return 500 while Vercel still
// reports the deployment as successful — exactly the failure mode T-00 exists
// to prevent. Verified empirically: `next build` with zero env vars set
// completes successfully; the failure only ever surfaces per-request. This
// script makes the build itself fail instead. See docs/specs/T-00.md.
//
// Plain JS, not an import from src/lib/env.ts: this runs via bare `node`
// before any TypeScript tooling is available in the build step, and this
// repo's relative `.js`-import convention doesn't resolve under Node's
// native type-stripping (see docs/specs/debt.md). The list below is
// duplicated from REQUIRED_WEB_ENV in src/lib/env.ts by hand — the copies are
// NOT trusted to stay in sync by hand: src/lib/__tests__/env-list-sync.test.ts
// fails if this list, src/lib/env.ts's, or the `Build web` step in
// .github/workflows/ci.yml drift apart.

// Bare `node` does not read .env files, but `next build` does — so without
// this the gate would reject a local build that `next build` would happily
// accept (a developer who put the variables in .env.local, which is exactly
// what apps/web/.env.example is for). Vercel and CI inject real environment
// variables and have no .env files, so nothing changes there.
//
// Order matters and mirrors Next.js's own precedence for a production build:
// real environment variables win, then .env.production.local, .env.local,
// .env.production, .env. process.loadEnvFile() never overwrites a variable
// that is already set, so loading most-specific-first yields exactly that.
// It throws when the file doesn't exist, hence the per-file try/catch (which
// also makes this degrade to a no-op, rather than a crash, on a Node without
// process.loadEnvFile).
//
// Paths are resolved against apps/web, not process.cwd(): that is the
// directory Next.js itself reads .env files from, and it keeps the result the
// same whether this is run via `pnpm --filter geotrack-web build` or by hand
// from the repo root.
//
// Known, deliberate limitation: Node's built-in parser is stricter than the
// dotenv Next.js uses — a line without `=`, or a value spanning several lines,
// makes it drop the variables after it (quotes it does handle, same as dotenv).
// The failure direction is safe: such a file makes this gate report variables
// as missing and exit 1, never the reverse, so it cannot wave a bad deploy
// through. It only affects local builds with an exotic .env file; Vercel and
// CI have none.
const APP_DIR = join(import.meta.dirname, '..');
for (const file of ['.env.production.local', '.env.local', '.env.production', '.env']) {
  try {
    process.loadEnvFile(join(APP_DIR, file));
  } catch {
    // Absent (the normal case on Vercel/CI) or unreadable — nothing to merge.
  }
}

const REQUIRED_WEB_ENV = [
  'DATABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ADMIN_SECRET',
  'AUDIT_SERVICE_KEY',
  'TURNSTILE_SECRET_KEY',
  'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
  'NEXT_PUBLIC_APP_URL',
  'INNGEST_EVENT_KEY',
  'FREE_DAILY_CEILING',
  'PADDLE_API_KEY',
  'PADDLE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_PADDLE_CLIENT_TOKEN',
  'PADDLE_PRICE_ID_STANDARD',
  'PADDLE_PRICE_ID_EXTENDED',
  'RESEND_API_KEY',
];

const missing = REQUIRED_WEB_ENV.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing required environment variable(s): ${missing.join(', ')}`);
  process.exit(1);
}
