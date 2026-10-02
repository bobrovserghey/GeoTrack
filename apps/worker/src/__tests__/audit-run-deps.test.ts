import { describe, it, expect, beforeEach, vi } from 'vitest';

async function load() {
  vi.resetModules();
  return import('../functions/audit-run.js');
}

describe('resolveAuditRunDeps', () => {
  beforeEach(() => vi.resetModules());

  it('refuses to fall back to the no-op deps in production', async () => {
    const { resolveAuditRunDeps } = await load();
    expect(() => resolveAuditRunDeps({ NODE_ENV: 'production' })).toThrow(/not configured/);
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
