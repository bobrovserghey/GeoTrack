import { transition, type AuditStatus } from '@geotrack/core';
import { crawlStub } from '../steps/crawl-stub.js';
import { enginePollStub } from '../steps/engine-poll-stub.js';
import { brandPromptsStub } from '../steps/brand-prompts-stub.js';

export type AuditEventPayload = Record<string, unknown>;

export type DisposableCheckDep = (email: string) => Promise<{ blocked: boolean; reason?: string }>;

export type AuditRunDeps = {
  updateAuditStatus(auditId: string, status: AuditStatus): Promise<void>;
  insertAuditEvent(auditId: string, eventType: string, payload: AuditEventPayload): Promise<void>;
  getAuditIsPaid(auditId: string): Promise<boolean>;
  getAuditEmailNormalized(auditId: string): Promise<string | null>;
  checkDisposableEmail: DisposableCheckDep;
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
  categoryHint?: string,
): Promise<void> {
  const isPaid = await deps.getAuditIsPaid(auditId);
  const emailNormalized = await deps.getAuditEmailNormalized(auditId);

  if (emailNormalized) {
    await step.run('disposable-email.check', async () => {
      const result = await deps.checkDisposableEmail(emailNormalized);
      if (result.blocked) {
        throw new Error(`DISPOSABLE_EMAIL:${result.reason ?? 'unknown'}`);
      }
    });
  }

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

  if (categoryHint) {
    // Category was provided from landing page — skip waiting_category entirely
    await step.run('category.preset', async () => {
      await deps.insertAuditEvent(auditId, 'category.preset', { categoryHint });
    });
  } else {
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
  }

  // 4. Stub step: initial engine poll (general visibility — before email gate)
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

  // 5. running → waiting_email (teaser result is visible; wait for email before brand prompts)
  await step.run('status.waiting-email', async () => {
    const next = transition('running', 'waiting_for_email');
    await deps.updateAuditStatus(auditId, next);
    await deps.insertAuditEvent(auditId, 'status.changed', { to: next });
  });

  const emailEvent = await step.waitForEvent('wait-email', {
    event: 'geotrack/audit.email.provided',
    match: 'data.auditId',
    timeout: '7d',
  });

  if (!emailEvent) {
    // 7-day timeout — complete without brand prompts
    await step.run('status.completed-email-timeout', async () => {
      const next = transition('waiting_email', 'email_timeout', { isPaid });
      await deps.updateAuditStatus(auditId, next);
      await deps.insertAuditEvent(auditId, 'status.changed', { to: next, emailTimeout: true });
    });
    return;
  }

  // 6. waiting_email → running (email provided, continue with brand prompts)
  await step.run('status.running-after-email', async () => {
    const next = transition('waiting_email', 'email_provided');
    await deps.updateAuditStatus(auditId, next);
    await deps.insertAuditEvent(auditId, 'status.changed', { to: next });
  });

  // 7. Stub step: brand prompts (expensive; runs only after email is captured)
  await step.run('brand-prompts.stub', async () => {
    await deps.insertAuditEvent(auditId, 'step.started', { step: 'brand-prompts.stub' });
    const result = await brandPromptsStub(auditId);
    await deps.insertAuditEvent(auditId, 'step.completed', {
      step: 'brand-prompts.stub',
      status: result.status,
      data: result.data,
    });
    return result;
  });

  // 8. running → completed
  await step.run('status.completed', async () => {
    const next = transition('running', 'steps_completed', { isPaid });
    await deps.updateAuditStatus(auditId, next);
    await deps.insertAuditEvent(auditId, 'status.changed', { to: next });
  });

  // 9. completed → in_review (paid audits only)
  if (isPaid) {
    await step.run('status.in-review', async () => {
      const next = transition('completed', 'sent_to_review', { isPaid: true });
      await deps.updateAuditStatus(auditId, next);
      await deps.insertAuditEvent(auditId, 'status.changed', { to: next });
    });
  }
}
