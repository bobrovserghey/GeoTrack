import { describe, it, expect, vi } from 'vitest';
import type { AuditStatus } from '@geotrack/core';
import { auditRunFailureHandler, StatusConflictError } from '../functions/audit-run-handler.js';
import type { AuditRunDeps } from '../functions/audit-run-handler.js';
import { auditRun } from '../functions/audit-run.js';

function makeDeps(status: AuditStatus, isPaid: boolean): AuditRunDeps {
  return {
    getAuditStatus: vi.fn(async () => status),
    transitionStatus: vi.fn(async () => {}),
    insertAuditEvent: vi.fn(async () => {}),
    getAuditIsPaid: vi.fn(async () => isPaid),
    getAuditEmailNormalized: vi.fn(async () => null),
    checkDisposableEmail: vi.fn(async () => ({ blocked: false })),
  };
}

// ADR-012: step_failed from `running` → needs_attention (paid) | failed (teaser).
describe('auditRunFailureHandler', () => {
  const quiet = () => {};

  it('moves a failed paid audit to needs_attention (so it is visible and refundable)', async () => {
    const deps = makeDeps('running', true);
    await auditRunFailureHandler('a1', new Error('boom'), deps, quiet);
    expect(deps.transitionStatus).toHaveBeenCalledWith('a1', 'running', 'needs_attention', {
      to: 'needs_attention',
      failed: true,
    });
    expect(deps.insertAuditEvent).toHaveBeenCalledWith('a1', 'run.failed', {
      status: 'running',
      to: 'needs_attention',
      errorName: 'Error',
    });
  });

  it('moves a failed teaser to failed', async () => {
    const deps = makeDeps('running', false);
    await auditRunFailureHandler('a2', new Error('boom'), deps, quiet);
    expect(deps.transitionStatus).toHaveBeenCalledWith('a2', 'running', 'failed', expect.objectContaining({ failed: true }));
  });

  // The transition table has no failure edge outside `running` and is a protected invariant.
  it.each<AuditStatus>(['queued', 'waiting_category', 'waiting_email', 'completed', 'in_review', 'cancelled', 'failed', 'delivered', 'needs_attention'])(
    'leaves a %s audit alone and only records the failure',
    async (status) => {
      const deps = makeDeps(status, true);
      await auditRunFailureHandler('a3', new Error('boom'), deps, quiet);
      expect(deps.transitionStatus).not.toHaveBeenCalled();
      expect(deps.insertAuditEvent).toHaveBeenCalledWith('a3', 'run.failed', { status, to: null, errorName: 'Error' });
    },
  );

  // /api/progress serves every audit_event payload to the holder of a progress token.
  it('keeps the raw error message out of the audit events and sends it to the worker log', async () => {
    const deps = makeDeps('running', true);
    const log = vi.fn();
    const secretish = new Error('connect ECONNREFUSED db.example.supabase.co:6543 key=sb_secret_abc');
    secretish.name = 'PostgresError';
    await auditRunFailureHandler('a4', secretish, deps, log);

    const written = JSON.stringify([
      (deps.transitionStatus as ReturnType<typeof vi.fn>).mock.calls,
      (deps.insertAuditEvent as ReturnType<typeof vi.fn>).mock.calls,
    ]);
    expect(written).not.toContain('supabase.co');
    expect(written).not.toContain('sb_secret');
    expect(written).toContain('PostgresError');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'));
  });

  it('truncates what it logs and tolerates a missing error', async () => {
    const log = vi.fn();
    await auditRunFailureHandler('a5', new Error('x'.repeat(5000)), makeDeps('running', false), log);
    expect((log.mock.calls[0]?.[0] as string).length).toBeLessThan(1200);

    const deps2 = makeDeps('running', false);
    await auditRunFailureHandler('a6', undefined, deps2, quiet);
    expect(deps2.insertAuditEvent).toHaveBeenCalledWith('a6', 'run.failed', expect.objectContaining({ errorName: 'Error' }));
  });

  it('still records run.failed when an admin moved the audit in between', async () => {
    const deps = makeDeps('running', true);
    (deps.transitionStatus as ReturnType<typeof vi.fn>).mockRejectedValue(
      new StatusConflictError('a7', 'running', 'needs_attention'),
    );
    await auditRunFailureHandler('a7', new Error('boom'), deps, quiet);
    expect(deps.insertAuditEvent).toHaveBeenCalledWith('a7', 'run.failed', { status: 'running', to: null, errorName: 'Error' });
  });

  it('does not mask a failure to write the failure (the error propagates to Inngest)', async () => {
    const deps = makeDeps('running', false);
    (deps.transitionStatus as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));
    await expect(auditRunFailureHandler('a8', new Error('boom'), deps, quiet)).rejects.toThrow('db down');
  });
});

describe('auditRun function configuration', () => {
  const opts = (auditRun as unknown as { opts: Record<string, unknown> }).opts;

  // `concurrency` limits steps, not runs — a duplicate audit.queued is dropped by `singleton`.
  // Not `idempotency`: its 24h window would block a restart after a failed run.
  it('skips a duplicate run for the same audit while one is active', () => {
    expect(opts['singleton']).toEqual({ key: 'event.data.auditId', mode: 'skip' });
    expect(opts['concurrency']).toEqual({ limit: 1, key: 'event.data.auditId' });
    expect(opts['idempotency']).toBeUndefined();
  });

  it('registers an onFailure handler', () => {
    expect(typeof opts['onFailure']).toBe('function');
  });
});
