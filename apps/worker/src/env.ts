// T-00: fail loudly at startup in production rather than only failing the
// first webhook request. T-79 added DATABASE_URL: the pipeline now reads and
// writes audit status and events through it. The engine/LLM keys stay out of
// this list until the real steps that use them are wired in (see
// docs/specs/T-00.md and docs/specs/debt.md, blocks B-D).

const REQUIRED_WORKER_ENV = ['INNGEST_SIGNING_KEY', 'DATABASE_URL'] as const;

export function validateWorkerEnv(env: Record<string, string | undefined> = process.env): void {
  const missing = REQUIRED_WORKER_ENV.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}`,
    );
  }
}
