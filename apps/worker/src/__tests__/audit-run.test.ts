import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auditRunHandler } from '../functions/audit-run-handler.js';
import type { AuditRunDeps, StepTools } from '../functions/audit-run-handler.js';

function makeMockDeps(overrides: Partial<AuditRunDeps> = {}): AuditRunDeps & {
  statusHistory: string[];
  eventHistory: Array<{ eventType: string; payload: Record<string, unknown> }>;
} {
  const statusHistory: string[] = [];
  const eventHistory: Array<{ eventType: string; payload: Record<string, unknown> }> = [];

  return {
    updateAuditStatus: vi.fn(async (_id, status) => { statusHistory.push(status); }),
    insertAuditEvent: vi.fn(async (_id, eventType, payload) => { eventHistory.push({ eventType, payload }); }),
    getAuditIsPaid: vi.fn(async () => false),
    statusHistory,
    eventHistory,
    ...overrides,
  };
}

// Mock step tools: step.run executes handler inline, waitForEvent returns null (timeout).
function makeMockStep(waitResult: { data: Record<string, unknown> } | null = null): StepTools {
  return {
    run: vi.fn((_id, fn) => fn()),
    waitForEvent: vi.fn(async () => waitResult),
  };
}

describe('auditRunHandler — teaser (free) audit', () => {
  let deps: ReturnType<typeof makeMockDeps>;
  let step: StepTools;

  beforeEach(async () => {
    deps = makeMockDeps();
    step = makeMockStep(null); // category timeout → auto-select
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

  it('transitions to completed at the end', () => {
    expect(deps.statusHistory.at(-1)).toBe('completed');
  });

  it('does not transition to in_review for teaser', () => {
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

  it('audit events are written in status order', () => {
    const statusEvents = deps.eventHistory
      .filter(e => e.eventType === 'status.changed')
      .map(e => e.payload['to']);
    expect(statusEvents).toEqual(['running', 'waiting_category', 'running', 'completed']);
  });
});

describe('auditRunHandler — paid audit', () => {
  let deps: ReturnType<typeof makeMockDeps>;

  beforeEach(async () => {
    deps = makeMockDeps({ getAuditIsPaid: vi.fn(async () => true) });
    const step = makeMockStep(null);
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

describe('auditRunHandler — category selected by user (no timeout)', () => {
  it('records autoSelected=false when user provides category', async () => {
    const deps = makeMockDeps();
    const step = makeMockStep({ data: { auditId: 'audit-1', categoryId: 'saas.crm' } });
    await auditRunHandler('audit-1', step, deps);

    const categoryResume = deps.eventHistory.find(
      e => e.eventType === 'status.changed' && e.payload['to'] === 'running' && 'autoSelected' in e.payload,
    );
    expect(categoryResume?.payload['autoSelected']).toBe(false);
    expect(categoryResume?.payload['categoryId']).toBe('saas.crm');
  });
});

describe('auditRunHandler — step call order', () => {
  it('calls step.run with expected ids in sequence', async () => {
    const deps = makeMockDeps();
    const step = makeMockStep(null);
    await auditRunHandler('audit-order', step, deps);

    const runCalls = (step.run as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0] as string);
    expect(runCalls).toEqual([
      'status.running',
      'crawl.stub',
      'status.waiting-category',
      'status.running-after-category',
      'engine-poll.stub',
      'status.completed',
    ]);
  });

  it('calls step.waitForEvent for category selection with 10m timeout', async () => {
    const deps = makeMockDeps();
    const step = makeMockStep(null);
    await auditRunHandler('audit-order', step, deps);

    const waitCalls = (step.waitForEvent as ReturnType<typeof vi.fn>).mock.calls;
    expect(waitCalls).toHaveLength(1);
    expect(waitCalls[0]?.[0]).toBe('wait-category');
    expect(waitCalls[0]?.[1]).toMatchObject({ timeout: '10m' });
  });
});

describe('auditRunHandler — categoryHint preset (from landing page)', () => {
  let deps: ReturnType<typeof makeMockDeps>;
  let step: StepTools;

  beforeEach(async () => {
    deps = makeMockDeps();
    step = makeMockStep(null);
    await auditRunHandler('audit-hint-1', step, deps, 'saas.crm');
  });

  it('never transitions to waiting_category', () => {
    expect(deps.statusHistory).not.toContain('waiting_category');
  });

  it('never calls waitForEvent', () => {
    const waitCalls = (step.waitForEvent as ReturnType<typeof vi.fn>).mock.calls;
    expect(waitCalls).toHaveLength(0);
  });

  it('calls step.run with category.preset instead of waiting-category steps', () => {
    const runCalls = (step.run as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0] as string);
    expect(runCalls).toEqual([
      'status.running',
      'crawl.stub',
      'category.preset',
      'engine-poll.stub',
      'status.completed',
    ]);
  });

  it('records category.preset event with categoryHint', () => {
    const presetEvent = deps.eventHistory.find(e => e.eventType === 'category.preset');
    expect(presetEvent).toBeDefined();
    expect(presetEvent?.payload['categoryHint']).toBe('saas.crm');
  });

  it('transitions to completed', () => {
    expect(deps.statusHistory.at(-1)).toBe('completed');
  });

  it('status order: running → completed (no category wait)', () => {
    const statusEvents = deps.eventHistory
      .filter(e => e.eventType === 'status.changed')
      .map(e => e.payload['to']);
    expect(statusEvents).toEqual(['running', 'completed']);
  });
});
