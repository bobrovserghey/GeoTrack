// T-00: fail loudly at startup in a real (non-dev) environment rather than
// degrading silently per-request, which is what several of these variables
// do today (see docs/specs/T-00.md for the per-variable table). Collects
// every missing variable into one error instead of stopping at the first,
// so a misconfigured deploy doesn't need one redeploy per missing variable.

// Exported so __tests__/env-list-sync.test.ts can assert that the two hand-kept
// copies of this list (apps/web/scripts/check-env.mjs and the `Build web` step
// in .github/workflows/ci.yml) have not drifted from it. Drift there would
// silently stop the build-time gate from covering a variable — the exact hole
// T-00 exists to close.
export const REQUIRED_WEB_ENV = [
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
  'PADDLE_PRICE_ID_STANDARD',
  'PADDLE_PRICE_ID_EXTENDED',
  'RESEND_API_KEY',
] as const;

export function validateWebEnv(env: Record<string, string | undefined> = process.env): void {
  const missing = REQUIRED_WEB_ENV.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}`,
    );
  }
}
