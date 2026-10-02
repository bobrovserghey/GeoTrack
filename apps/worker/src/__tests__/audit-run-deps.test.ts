import { describe, it, expect, afterEach, vi } from 'vitest';
import { NonRetriableError } from 'inngest';

// Every test loads its own fresh copy of the module: `injected` is a module
// singleton, and the test below that calls setAuditRunDeps() would otherwise
// leak real deps into whatever test runs after it.
async function load() {
  vi.resetModules();
  return import('../functions/audit-run.js');
}

describe('resolveAuditRunDeps', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('refuses to fall back to the no-op deps in production', async () => {
    const { resolveAuditRunDeps } = await load();
    expect(() => resolveAuditRunDeps({ NODE_ENV: 'production' })).toThrow(/not configured/);
  });

  // The error type is the whole point, not just the message: a plain Error
  // makes Inngest retry a run that no retry can fix (4 attempts instead of a
  // single loud failure), so assert the class and not only the text.
  it('throws a non-retriable error so Inngest does not retry', async () => {
    const { resolveAuditRunDeps } = await load();
    expect(() => resolveAuditRunDeps({ NODE_ENV: 'production' })).toThrow(NonRetriableError);
  });

  // Guards the deploy-critical invariant: the throw must happen when the
  // Inngest handler runs, never while the module is imported. Importing it is
  // what `apps/worker/src/server.ts` does at startup, and a module-level throw
  // would stop the server from binding its port — Railway's /healthz
  // healthcheck would then fail the whole container (T-00).
  it('imports cleanly in production so the worker can still start', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const mod = await load();
    expect(mod.auditRun).toBeDefined();
    // Called with no argument, exactly as the Inngest handler calls it: the
    // other tests pass `env` in explicitly, so without this line the default
    // `env = process.env` — the only path production actually takes — is
    // untested, and dropping it would keep the suite green.
    expect(() => mod.resolveAuditRunDeps()).toThrow(NonRetriableError);
  });

  it('falls back to the no-op deps outside production', async () => {
    const { resolveAuditRunDeps, noopDeps } = await load();
    expect(resolveAuditRunDeps({ NODE_ENV: 'development' })).toBe(noopDeps);
    expect(resolveAuditRunDeps({})).toBe(noopDeps);
  });

  it('uses injected deps in production', async () => {
    const { resolveAuditRunDeps, setAuditRunDeps, noopDeps } = await load();
    const real = { ...noopDeps };
    setAuditRunDeps(real);
    expect(resolveAuditRunDeps({ NODE_ENV: 'production' })).toBe(real);
  });
});
