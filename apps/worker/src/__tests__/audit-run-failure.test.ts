import { describe, it, expect, vi } from 'vitest';
import type { AuditStatus } from '@geotrack/core';
import { auditRunFailureHandler } from '../functions/audit-run-handler.js';
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
  it('moves a failed paid audit to needs_attention (so it is visible and refundable)', async () => {
    const deps = makeDeps('running', true);
    await auditRunFailureHandler('a1', new Error('boom'), deps);
    expect(deps.transitionStatus).toHaveBeenCalledWith('a1', 'running', 'needs_attention', {
      to: 'needs_attention',
      failed: true,
      reason: 'boom',
    });
    expect(deps.insertAuditEvent).toHaveBeenCalledWith('a1', 'run.failed', {
      status: 'running',
      to: 'needs_attention',
      reason: 'boom',
    });
  });

  it('moves a failed teaser to failed', async () => {
    const deps = makeDeps('running', false);
    await auditRunFailureHandler('a2', new Error('boom'), deps);
    expect(deps.transitionStatus).toHaveBeenCalledWith('a2', 'running', 'failed', expect.objectContaining({ failed: true }));
  });

  // The transition table has no failure edge outside `running` and is a protected invariant.
  it.each<AuditStatus>(['queued', 'waiting_category', 'waiting_email', 'completed', 'in_review', 'cancelled', 'failed', 'delivered', 'needs_attention'])(
    'leaves a %s audit alone and only records the failure',
    async (status) => {
      const deps = makeDeps(status, true);
      await auditRunFailureHandler('a3', new Error('boom'), deps);
      expect(deps.transitionStatus).not.toHaveBeenCalled();
      expect(deps.insertAuditEvent).toHaveBeenCalledWith('a3', 'run.failed', { status, to: null, reason: 'boom' });
    },
  );

  it('truncates a long error message and tolerates a missing one', async () => {
    const deps = makeDeps('running', false);
    await auditRunFailureHandler('a4', new Error('x'.repeat(5000)), deps);
    const reason = (deps.insertAuditEvent as ReturnType<typeof vi.fn>).mock.calls[0]?.[2].reason as string;
    expect(reason).toHaveLength(500);

    const deps2 = makeDeps('running', false);
    await auditRunFailureHandler('a5', undefined, deps2);
    expect((deps2.insertAuditEvent as ReturnType<typeof vi.fn>).mock.calls[0]?.[2].reason).toBe('unknown error');
  });

  it('does not mask a failure to write the failure (the error propagates to Inngest)', async () => {
    const deps = makeDeps('running', false);
    (deps.transitionStatus as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));
    await expect(auditRunFailureHandler('a6', new Error('boom'), deps)).rejects.toThrow('db down');
  });
});

describe('auditRun function configuration', () => {
  const opts = (auditRun as unknown as { opts: Record<string, unknown> }).opts;

  // Not `idempotency`: it would block admin_restart for 24h.
  it('allows one run per audit at a time', () => {
    expect(opts['concurrency']).toEqual({ limit: 1, key: 'event.data.auditId' });
    expect(opts['idempotency']).toBeUndefined();
  });

  it('registers an onFailure handler', () => {
    expect(typeof opts['onFailure']).toBe('function');
  });
});
