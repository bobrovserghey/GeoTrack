import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NonRetriableError } from 'inngest';
import type { AuditStatus } from '@geotrack/core';
import { auditRunHandler, StatusConflictError } from '../functions/audit-run-handler.js';
import type { AuditRunDeps, StepTools } from '../functions/audit-run-handler.js';

function makeMockDeps(overrides: Partial<AuditRunDeps> = {}, initialStatus: AuditStatus = 'queued'): AuditRunDeps & {
  statusHistory: string[];
  eventHistory: Array<{ eventType: string; payload: Record<string, unknown> }>;
} {
  const statusHistory: string[] = [];
  const eventHistory: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  // The fake DB holds the status, so the handler's compare-and-set is exercised for real.
  let current: AuditStatus = initialStatus;

  return {
    getAuditStatus: vi.fn(async () => current),
    transitionStatus: vi.fn(async (id, from, to, payload) => {
      if (current !== from) throw new StatusConflictError(id, from, to);
      current = to;
      statusHistory.push(to);
      eventHistory.push({ eventType: 'status.changed', payload: { from, ...payload } });
    }),
    insertAuditEvent: vi.fn(async (_id, eventType, payload) => { eventHistory.push({ eventType, payload }); }),
    getAuditIsPaid: vi.fn(async () => false),
    getAuditEmailNormalized: vi.fn(async () => null),
    checkDisposableEmail: vi.fn(async () => ({ blocked: false })),
    statusHistory,
    eventHistory,
    ...overrides,
  };
}

// waitResults keyed by waitForEvent id: 'wait-category' | 'wait-email'
function makeMockStep(
  waitResults: Record<string, { data: Record<string, unknown> } | null> = {},
): StepTools {
  return {
    run: vi.fn((_id, fn) => fn()),
    waitForEvent: vi.fn(async (id: string) => waitResults[id] ?? null),
  };
}

describe('auditRunHandler — teaser (free) audit, email timeout', () => {
  let deps: ReturnType<typeof makeMockDeps>;
  let step: StepTools;

  beforeEach(async () => {
    deps = makeMockDeps();
    step = makeMockStep({}); // category timeout, email timeout
    await auditRunHandler('audit-teaser-1', step, deps);
  });

  it('transitions to running first', () => {
    expect(deps.statusHistory[0]).toBe('running');
  });

  it('transitions to waiting_category after crawl', () => {
    expect(deps.statusHistory[1]).toBe('waiting_category');
  });

  it('transitions back to running after category timeout (auto-select)', () => {
    expect(deps.statusHistory[2]).toBe('running');
  });

  it('marks auto-selected in event payload', () => {
    const categoryResume = deps.eventHistory.find(
      e => e.eventType === 'status.changed' && e.payload['to'] === 'running' && 'autoSelected' in e.payload,
    );
    expect(categoryResume?.payload['autoSelected']).toBe(true);
  });

  it('transitions to waiting_email after engine-poll', () => {
    expect(deps.statusHistory).toContain('waiting_email');
    const enginePollCompleted = deps.eventHistory.findIndex(
      e => e.eventType === 'step.completed' && e.payload['step'] === 'engine-poll.stub',
    );
    const waitingEmailIdx = deps.statusHistory.indexOf('waiting_email');
    expect(waitingEmailIdx).toBeGreaterThan(2); // after running-after-category
    expect(enginePollCompleted).toBeGreaterThanOrEqual(0);
  });

  it('transitions to completed (email timeout path)', () => {
    expect(deps.statusHistory.at(-1)).toBe('completed');
  });

  it('does not run brand-prompts.stub on email timeout', () => {
    const brandPrompts = deps.eventHistory.filter(
      e => e.payload['step'] === 'brand-prompts.stub',
    );
    expect(brandPrompts).toHaveLength(0);
  });

  it('does not transition to in_review on email timeout', () => {
    expect(deps.statusHistory).not.toContain('in_review');
  });

  it('records crawl.stub step events', () => {
    const started = deps.eventHistory.filter(
      e => e.eventType === 'step.started' && e.payload['step'] === 'crawl.stub',
    );
    const completed = deps.eventHistory.filter(
      e => e.eventType === 'step.completed' && e.payload['step'] === 'crawl.stub',
    );
    expect(started).toHaveLength(1);
    expect(completed).toHaveLength(1);
  });

  it('records engine-poll.stub step events', () => {
    const started = deps.eventHistory.filter(
      e => e.eventType === 'step.started' && e.payload['step'] === 'engine-poll.stub',
    );
    const completed = deps.eventHistory.filter(
      e => e.eventType === 'step.completed' && e.payload['step'] === 'engine-poll.stub',
    );
    expect(started).toHaveLength(1);
    expect(completed).toHaveLength(1);
  });

  it('audit status events in order (email timeout path)', () => {
    const statusEvents = deps.eventHistory
      .filter(e => e.eventType === 'status.changed')
      .map(e => e.payload['to']);
    expect(statusEvents).toEqual(['running', 'waiting_category', 'running', 'waiting_email', 'completed']);
  });
});

describe('auditRunHandler — email provided (full pipeline)', () => {
  let deps: ReturnType<typeof makeMockDeps>;
  let step: StepTools;

  beforeEach(async () => {
    deps = makeMockDeps();
    step = makeMockStep({
      'wait-email': { data: { auditId: 'audit-email-1', email: 'user@example.com' } },
    });
    await auditRunHandler('audit-email-1', step, deps);
  });

  it('transitions to waiting_email then running after email provided', () => {
    const waitingEmailIdx = deps.statusHistory.indexOf('waiting_email');
    const runningAfterEmail = deps.statusHistory.indexOf('running', waitingEmailIdx + 1);
    expect(waitingEmailIdx).toBeGreaterThanOrEqual(0);
    expect(runningAfterEmail).toBeGreaterThan(waitingEmailIdx);
  });

  it('runs brand-prompts.stub when email is provided', () => {
    const started = deps.eventHistory.filter(
      e => e.eventType === 'step.started' && e.payload['step'] === 'brand-prompts.stub',
    );
    expect(started).toHaveLength(1);
  });

  it('transitions to completed after brand-prompts.stub', () => {
    expect(deps.statusHistory.at(-1)).toBe('completed');
  });

  it('audit status events in order (email provided path)', () => {
    const statusEvents = deps.eventHistory
      .filter(e => e.eventType === 'status.changed')
      .map(e => e.payload['to']);
    expect(statusEvents).toEqual([
      'running',
      'waiting_category',
      'running',
      'waiting_email',
      'running',
      'completed',
    ]);
  });

  it('marks emailTimeout: true only on timeout path — not set here', () => {
    const timeoutEvent = deps.eventHistory.find(
      e => e.eventType === 'status.changed' && e.payload['emailTimeout'] === true,
    );
    expect(timeoutEvent).toBeUndefined();
  });
});

describe('auditRunHandler — paid audit, email provided', () => {
  let deps: ReturnType<typeof makeMockDeps>;

  beforeEach(async () => {
    deps = makeMockDeps({ getAuditIsPaid: vi.fn(async () => true) });
    const step = makeMockStep({
      'wait-email': { data: { auditId: 'audit-paid-1' } },
    });
    await auditRunHandler('audit-paid-1', step, deps);
  });

  it('transitions to in_review after completed', () => {
    expect(deps.statusHistory).toContain('in_review');
    const completedIdx = deps.statusHistory.indexOf('completed');
    const inReviewIdx = deps.statusHistory.indexOf('in_review');
    expect(inReviewIdx).toBeGreaterThan(completedIdx);
  });

  it('status order ends with completed → in_review', () => {
    const last = deps.statusHistory.at(-1);
    const secondLast = deps.statusHistory.at(-2);
    expect(secondLast).toBe('completed');
    expect(last).toBe('in_review');
  });
});

describe('auditRunHandler — a paid audit never waits for an email', () => {
  // Nothing can send `email.provided` for a paid audit (the email route needs a progress
  // token), and the email-timeout path ends in `completed`, never `in_review`.
  it.each([null, 'buyer@example.com'])('goes straight to review with email=%s', async (email) => {
    const deps = makeMockDeps({
      getAuditIsPaid: vi.fn(async () => true),
      getAuditEmailNormalized: vi.fn(async () => email),
    });
    const step = makeMockStep({});
    await auditRunHandler('audit-paid', step, deps, 'saas.crm');

    const waits = (step.waitForEvent as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]);
    expect(waits).not.toContain('wait-email');
    expect(deps.statusHistory).not.toContain('waiting_email');
    expect(deps.statusHistory.slice(-2)).toEqual(['completed', 'in_review']);
  });
});

describe('auditRunHandler — category selected by user (no timeout)', () => {
  it('records autoSelected=false when user provides category', async () => {
    const deps = makeMockDeps();
    const step = makeMockStep({
      'wait-category': { data: { auditId: 'audit-1', categoryId: 'saas.crm' } },
    });
    await auditRunHandler('audit-1', step, deps);

    const categoryResume = deps.eventHistory.find(
      e => e.eventType === 'status.changed' && e.payload['to'] === 'running' && 'autoSelected' in e.payload,
    );
    expect(categoryResume?.payload['autoSelected']).toBe(false);
    expect(categoryResume?.payload['categoryId']).toBe('saas.crm');
  });
});

describe('auditRunHandler — step call order (email timeout path)', () => {
  it('calls step.run with expected ids in sequence', async () => {
    const deps = makeMockDeps();
    const step = makeMockStep({}); // both timeouts
    await auditRunHandler('audit-order', step, deps);

    const runCalls = (step.run as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0] as string);
    expect(runCalls).toEqual([
      'load-audit',
      'status.running',
      'crawl.stub',
      'status.waiting-category',
      'status.running-after-category',
      'engine-poll.stub',
      'status.waiting-email',
      'status.completed-email-timeout',
    ]);
  });

  it('calls step.waitForEvent twice (category + email)', async () => {
    const deps = makeMockDeps();
    const step = makeMockStep({});
    await auditRunHandler('audit-order', step, deps);

    const waitCalls = (step.waitForEvent as ReturnType<typeof vi.fn>).mock.calls;
    expect(waitCalls).toHaveLength(2);
    expect(waitCalls[0]?.[0]).toBe('wait-category');
    expect(waitCalls[0]?.[1]).toMatchObject({ timeout: '10m' });
    expect(waitCalls[1]?.[0]).toBe('wait-email');
    expect(waitCalls[1]?.[1]).toMatchObject({ event: 'geotrack/audit.email.provided', timeout: '7d' });
  });
});

describe('auditRunHandler — step call order (email provided path)', () => {
  it('calls step.run with expected ids including brand-prompts.stub', async () => {
    const deps = makeMockDeps();
    const step = makeMockStep({
      'wait-email': { data: { auditId: 'audit-order-email' } },
    });
    await auditRunHandler('audit-order-email', step, deps);

    const runCalls = (step.run as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0] as string);
    expect(runCalls).toEqual([
      'load-audit',
      'status.running',
      'crawl.stub',
      'status.waiting-category',
      'status.running-after-category',
      'engine-poll.stub',
      'status.waiting-email',
      'status.running-after-email',
      'disposable-email.check',
      'brand-prompts.stub',
      'status.completed',
    ]);
  });
});

describe('auditRunHandler — categoryHint preset (from landing page)', () => {
  let deps: ReturnType<typeof makeMockDeps>;
  let step: StepTools;

  beforeEach(async () => {
    deps = makeMockDeps();
    step = makeMockStep({}); // email timeout
    await auditRunHandler('audit-hint-1', step, deps, 'saas.crm');
  });

  it('never transitions to waiting_category', () => {
    expect(deps.statusHistory).not.toContain('waiting_category');
  });

  it('calls waitForEvent once (email only, not category)', () => {
    const waitCalls = (step.waitForEvent as ReturnType<typeof vi.fn>).mock.calls;
    expect(waitCalls).toHaveLength(1);
    expect(waitCalls[0]?.[0]).toBe('wait-email');
  });

  it('calls step.run with category.preset instead of waiting-category steps', () => {
    const runCalls = (step.run as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0] as string);
    expect(runCalls).toEqual([
      'load-audit',
      'status.running',
      'crawl.stub',
      'category.preset',
      'engine-poll.stub',
      'status.waiting-email',
      'status.completed-email-timeout',
    ]);
  });

  it('records category.preset event with categoryHint', () => {
    const presetEvent = deps.eventHistory.find(e => e.eventType === 'category.preset');
    expect(presetEvent).toBeDefined();
    expect(presetEvent?.payload['categoryHint']).toBe('saas.crm');
  });

  it('transitions to completed (email timeout)', () => {
    expect(deps.statusHistory.at(-1)).toBe('completed');
  });

  it('status order: running → waiting_email → completed (no category wait)', () => {
    const statusEvents = deps.eventHistory
      .filter(e => e.eventType === 'status.changed')
      .map(e => e.payload['to']);
    expect(statusEvents).toEqual(['running', 'waiting_email', 'completed']);
  });
});

describe('auditRunHandler — categoryHint with email provided', () => {
  it('runs brand-prompts.stub after email when categoryHint is set', async () => {
    const deps = makeMockDeps();
    const step = makeMockStep({
      'wait-email': { data: { auditId: 'audit-hint-email' } },
    });
    await auditRunHandler('audit-hint-email', step, deps, 'retail.fashion');

    const runCalls = (step.run as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0] as string);
    expect(runCalls).toEqual([
      'load-audit',
      'status.running',
      'crawl.stub',
      'category.preset',
      'engine-poll.stub',
      'status.waiting-email',
      'status.running-after-email',
      'disposable-email.check',
      'brand-prompts.stub',
      'status.completed',
    ]);
  });
});

describe('auditRunHandler — disposable-email.check (after the email is provided)', () => {
  const emailProvided = { 'wait-email': { data: { auditId: 'a' } } };

  it('runs after the audit is back in running, before brand prompts', async () => {
    const deps = makeMockDeps({ getAuditEmailNormalized: vi.fn(async () => 'user@example.com') });
    const step = makeMockStep(emailProvided);
    await auditRunHandler('audit-disposable-1', step, deps);

    const runCalls = (step.run as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0] as string);
    const idx = runCalls.indexOf('disposable-email.check');
    expect(idx).toBe(runCalls.indexOf('status.running-after-email') + 1);
    expect(idx).toBeLessThan(runCalls.indexOf('brand-prompts.stub'));
    expect(deps.checkDisposableEmail).toHaveBeenCalledWith('user@example.com');
  });

  it('skips the verdict (no call) when the audit has no email', async () => {
    const deps = makeMockDeps();
    await auditRunHandler('audit-no-email', makeMockStep(emailProvided), deps);
    expect(deps.checkDisposableEmail).not.toHaveBeenCalled();
  });

  it('does not run on the email-timeout path', async () => {
    const deps = makeMockDeps({ getAuditEmailNormalized: vi.fn(async () => 'user@example.com') });
    const step = makeMockStep({});
    await auditRunHandler('audit-timeout', step, deps);
    const runCalls = (step.run as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0] as string);
    expect(runCalls).not.toContain('disposable-email.check');
  });

  it('throws a NonRetriableError DISPOSABLE_EMAIL when blocked', async () => {
    const deps = makeMockDeps({
      getAuditEmailNormalized: vi.fn(async () => 'user@mailinator.com'),
      checkDisposableEmail: vi.fn(async () => ({ blocked: true, reason: 'disposable' })),
    });
    const promise = auditRunHandler('audit-disposable-2', makeMockStep(emailProvided), deps);
    await expect(promise).rejects.toBeInstanceOf(NonRetriableError);
    await expect(
      auditRunHandler('audit-disposable-2b', makeMockStep(emailProvided), makeMockDeps({
        getAuditEmailNormalized: vi.fn(async () => 'user@mailinator.com'),
        checkDisposableEmail: vi.fn(async () => ({ blocked: true, reason: 'disposable' })),
      })),
    ).rejects.toThrow('DISPOSABLE_EMAIL:disposable');
  });

  it('stops the pipeline when blocked: audit stays running, nothing after it ran', async () => {
    const deps = makeMockDeps({
      getAuditEmailNormalized: vi.fn(async () => 'user@mailinator.com'),
      checkDisposableEmail: vi.fn(async () => ({ blocked: true, reason: 'disposable' })),
    });
    const step = makeMockStep(emailProvided);

    await expect(auditRunHandler('audit-disposable-3', step, deps)).rejects.toThrow();

    const runCalls = (step.run as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0] as string);
    expect(runCalls.at(-1)).toBe('disposable-email.check');
    expect(runCalls).not.toContain('brand-prompts.stub');
    // `running`, so the onFailure handler can still turn it into step_failed.
    expect(deps.statusHistory.at(-1)).toBe('running');
  });
});

describe('auditRunHandler — status is read from the DB, not assumed (compare-and-set)', () => {
  it('stops with a NonRetriableError when an admin moved the audit meanwhile', async () => {
    // The admin cancelled the audit before the run picked it up.
    const deps = makeMockDeps({}, 'cancelled');
    await expect(auditRunHandler('audit-cancelled', makeMockStep({}), deps)).rejects.toBeInstanceOf(NonRetriableError);
    expect(deps.transitionStatus).not.toHaveBeenCalled();
  });

  it('does not overwrite a status that changes between the read and the write', async () => {
    // The read says `queued`, but by the time of the write the admin has cancelled it.
    const deps = makeMockDeps({
      transitionStatus: vi.fn(async (id, from, to) => { throw new StatusConflictError(id, from, to); }),
    });
    await expect(auditRunHandler('audit-race', makeMockStep({}), deps)).rejects.toBeInstanceOf(StatusConflictError);
    expect(deps.statusHistory).toHaveLength(0);
  });

  it('treats an already-applied transition as done (retry after a lost step result)', async () => {
    // A previous attempt committed queued → running but the step result was lost.
    const deps = makeMockDeps({}, 'running');
    const step = makeMockStep({});
    await auditRunHandler('audit-replayed', step, deps);
    expect(deps.statusHistory[0]).not.toBe('running'); // the first move was a no-op, not a second write
    expect(deps.statusHistory.at(-1)).toBe('completed');
  });

  it('reads the paid flag and email once, in a step (memoized across replays)', async () => {
    const deps = makeMockDeps();
    const step = makeMockStep({});
    await auditRunHandler('audit-load', step, deps);
    expect((step.run as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe('load-audit');
    expect(deps.getAuditIsPaid).toHaveBeenCalledTimes(1);
  });
});

describe('auditRunHandler — disposable verdicts and retries', () => {
  const emailProvided = { 'wait-email': { data: { auditId: 'a' } } };
  const blocked = (reason: string) =>
    makeMockDeps({
      getAuditEmailNormalized: vi.fn(async () => 'user@example.com'),
      checkDisposableEmail: vi.fn(async () => ({ blocked: true, reason })),
    });

  it('a disposable domain is a definite verdict: no retries', async () => {
    await expect(auditRunHandler('d1', makeMockStep(emailProvided), blocked('disposable'))).rejects.toBeInstanceOf(
      NonRetriableError,
    );
  });

  // hasMxRecord swallows resolver errors, so `no_mx` can be a transient DNS failure.
  it('no_mx can be a transient DNS failure: it stays retriable', async () => {
    const promise = auditRunHandler('d2', makeMockStep(emailProvided), blocked('no_mx'));
    await expect(promise).rejects.toThrow('DISPOSABLE_EMAIL:no_mx');
    await expect(auditRunHandler('d3', makeMockStep(emailProvided), blocked('no_mx'))).rejects.not.toBeInstanceOf(
      NonRetriableError,
    );
  });
});
