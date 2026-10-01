// T-00: fail loudly at startup in production rather than only failing the
// first webhook request. See docs/specs/T-00.md for why this list is short
// today — the worker doesn't call any real external API or DB with a real
// credential yet (every step takes its dependencies via DI, tested with
// fakes only), so there is nothing else to validate honestly.

const REQUIRED_WORKER_ENV = ['INNGEST_SIGNING_KEY'] as const;

export function validateWorkerEnv(env: Record<string, string | undefined> = process.env): void {
  const missing = REQUIRED_WORKER_ENV.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}`,
    );
  }
}
