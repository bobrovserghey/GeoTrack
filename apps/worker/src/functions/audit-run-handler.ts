import { transition, type AuditStatus } from '@geotrack/core';
import { crawlStub } from '../steps/crawl-stub.js';
import { enginePollStub } from '../steps/engine-poll-stub.js';

export type AuditEventPayload = Record<string, unknown>;

export type AuditRunDeps = {
  updateAuditStatus(auditId: string, status: AuditStatus): Promise<void>;
  insertAuditEvent(auditId: string, eventType: string, payload: AuditEventPayload): Promise<void>;
  getAuditIsPaid(auditId: string): Promise<boolean>;
};

// Minimal step interface — subset of Inngest step tools; injectable for tests.
export type StepTools = {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
  waitForEvent(
    id: string,
    opts: { event: string; match: string; timeout: string },
  ): Promise<{ data: Record<string, unknown> } | null>;
};

export async function auditRunHandler(
  auditId: string,
  step: StepTools,
  deps: AuditRunDeps,
): Promise<void> {
  const isPaid = await deps.getAuditIsPaid(auditId);

  // 1. queued → running
  await step.run('status.running', async () => {
    const next = transition('queued', 'orchestrator_accepted');
    await deps.updateAuditStatus(auditId, next);
    await deps.insertAuditEvent(auditId, 'status.changed', { to: next });
  });

  // 2. Stub step: crawl
  await step.run('crawl.stub', async () => {
    await deps.insertAuditEvent(auditId, 'step.started', { step: 'crawl.stub' });
    const result = await crawlStub(auditId);
    await deps.insertAuditEvent(auditId, 'step.completed', {
      step: 'crawl.stub',
      status: result.status,
      data: result.data,
    });
    return result;
  });

  // 3. running → waiting_category, wait for user (10m timeout → auto-select)
  await step.run('status.waiting-category', async () => {
    const next = transition('running', 'waiting_for_category');
    await deps.updateAuditStatus(auditId, next);
    await deps.insertAuditEvent(auditId, 'status.changed', { to: next });
  });

  const categoryEvent = await step.waitForEvent('wait-category', {
    event: 'geotrack/audit.category.selected',
    match: 'data.auditId',
    timeout: '10m',
  });

  // waiting_category → running (whether user selected or auto-selected on timeout)
  await step.run('status.running-after-category', async () => {
    const autoSelected = !categoryEvent;
    const next = transition('waiting_category', 'category_selected');
    await deps.updateAuditStatus(auditId, next);
    await deps.insertAuditEvent(auditId, 'status.changed', {
      to: next,
      autoSelected,
      categoryId: categoryEvent?.data?.categoryId ?? null,
    });
  });

  // 4. Stub step: engine poll
  await step.run('engine-poll.stub', async () => {
    await deps.insertAuditEvent(auditId, 'step.started', { step: 'engine-poll.stub' });
    const result = await enginePollStub(auditId);
    await deps.insertAuditEvent(auditId, 'step.completed', {
      step: 'engine-poll.stub',
      status: result.status,
      data: result.data,
    });
    return result;
  });

  // 5. running → completed
  await step.run('status.completed', async () => {
    const next = transition('running', 'steps_completed', { isPaid });
    await deps.updateAuditStatus(auditId, next);
    await deps.insertAuditEvent(auditId, 'status.changed', { to: next });
  });

  // 6. completed → in_review (paid audits only)
  if (isPaid) {
    await step.run('status.in-review', async () => {
      const next = transition('completed', 'sent_to_review', { isPaid: true });
      await deps.updateAuditStatus(auditId, next);
      await deps.insertAuditEvent(auditId, 'status.changed', { to: next });
    });
  }
}
