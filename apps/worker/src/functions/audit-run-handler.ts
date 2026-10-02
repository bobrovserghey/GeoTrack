import { NonRetriableError } from 'inngest';
import { transition, TransitionError, type AuditStatus, type TransitionEvent } from '@geotrack/core';
import { crawlStub } from '../steps/crawl-stub.js';
import { enginePollStub } from '../steps/engine-poll-stub.js';
import { brandPromptsStub } from '../steps/brand-prompts-stub.js';

export type AuditEventPayload = Record<string, unknown>;

export type DisposableCheckDep = (email: string) => Promise<{ blocked: boolean; reason?: string }>;

// Thrown by transitionStatus when the audit is no longer in the expected
// `from` status (an admin cancelled/restarted it, or another run moved it).
export class StatusConflictError extends Error {
  constructor(
    public readonly auditId: string,
    public readonly from: AuditStatus,
    public readonly to: AuditStatus,
  ) {
    super(`audit ${auditId}: status is no longer "${from}", refusing to move it to "${to}"`);
    this.name = 'StatusConflictError';
  }
}

export type AuditRunDeps = {
  getAuditStatus(auditId: string): Promise<AuditStatus>;
  // Atomic compare-and-set: UPDATE ... WHERE status = from, plus the
  // `status.changed` event, in one transaction. Throws StatusConflictError
  // when the audit is not in `from`.
  transitionStatus(
    auditId: string,
    from: AuditStatus,
    to: AuditStatus,
    payload: AuditEventPayload,
  ): Promise<void>;
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
  // DB reads live inside step.run: Inngest memoizes the result, so a replay
  // sees the values of the first pass instead of whatever the row holds now
  // (a read in the function body can change between passes and shift the set
  // of steps in the middle of an already-executed history).
  const { isPaid } = await step.run('load-audit', async () => ({
    isPaid: await deps.getAuditIsPaid(auditId),
  }));

  // One status change = one step. The expected `from` is part of the contract:
  // the DB is the source of truth, so a status that is neither `from` nor the
  // already-applied target means somebody else (an admin) moved the audit and
  // this run must stop instead of overwriting it.
  const move = (
    stepId: string,
    from: AuditStatus,
    event: TransitionEvent,
    extra: AuditEventPayload = {},
  ) =>
    step.run(stepId, async () => {
      const to = transition(from, event, { isPaid });
      const current = await deps.getAuditStatus(auditId);
      if (current === to) return; // already applied — a retry after a lost step result
      if (current !== from) {
        throw new NonRetriableError(
          `audit ${auditId}: step "${stepId}" expects status "${from}", found "${current}"`,
        );
      }
      await deps.transitionStatus(auditId, from, to, { to, ...extra });
    });

  // 1. queued → running
  await move('status.running', 'queued', 'orchestrator_accepted');

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
    await move('status.waiting-category', 'running', 'waiting_for_category');

    const categoryEvent = await step.waitForEvent('wait-category', {
      event: 'geotrack/audit.category.selected',
      match: 'data.auditId',
      timeout: '10m',
    });

    // waiting_category → running (whether user selected or auto-selected on timeout)
    await move('status.running-after-category', 'waiting_category', 'category_selected', {
      autoSelected: !categoryEvent,
      categoryId: categoryEvent?.data?.categoryId ?? null,
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

  // 5. Teaser: running → waiting_email, wait for the email before brand
  // prompts. A paid audit never waits: nothing can send `email.provided` for
  // it (the email route needs a progress token, a paid audit only has a report
  // token), and the 7-day timeout path ends in `completed` without `in_review`,
  // which would strand a paid audit with no review and no delivery.
  if (!isPaid) {
    await move('status.waiting-email', 'running', 'waiting_for_email');

    const emailEvent = await step.waitForEvent('wait-email', {
      event: 'geotrack/audit.email.provided',
      match: 'data.auditId',
      timeout: '7d',
    });

    if (!emailEvent) {
      // 7-day timeout — complete without brand prompts
      await move('status.completed-email-timeout', 'waiting_email', 'email_timeout', { emailTimeout: true });
      return;
    }

    // 6. waiting_email → running (email provided, continue with brand prompts)
    await move('status.running-after-email', 'waiting_email', 'email_provided');
  }

  // Defence in depth (the web route rejects disposable addresses at
  // submission): checked once the audit is `running`, so a rejection can
  // still be turned into step_failed. Retrying cannot change the verdict.
  await step.run('disposable-email.check', async () => {
    const email = await deps.getAuditEmailNormalized(auditId);
    if (!email) return;
    const result = await deps.checkDisposableEmail(email);
    if (result.blocked) {
      const message = `DISPOSABLE_EMAIL:${result.reason ?? 'unknown'}`;
      // `no_mx` also comes out of a transient DNS failure (hasMxRecord swallows
      // resolver errors), so it stays retriable; only a disposable domain is a
      // definite, retry-proof verdict.
      throw result.reason === 'disposable' ? new NonRetriableError(message) : new Error(message);
    }
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
  await move('status.completed', 'running', 'steps_completed');

  // 9. completed → in_review (paid audits only)
  if (isPaid) {
    await move('status.in-review', 'completed', 'sent_to_review');
  }
}

// onFailure path: the run has exhausted its retries (or hit a non-retriable
// error). `step_failed` is defined only from `running` (ADR-012: paid →
// needs_attention, teaser → failed). From any other status there is no defined
// failure transition — the table is a protected invariant — so the status is
// left alone and the failure is only recorded; see docs/specs/debt.md.
//
// audit_events are served to the report page through /api/progress, so the raw
// error message (it can carry hosts, URLs, even keys) never goes into them: only
// the error class is stored there; the message goes to the worker log.
export async function auditRunFailureHandler(
  auditId: string,
  error: { name?: string; message?: string } | undefined,
  deps: AuditRunDeps,
  log: (message: string) => void = (m) => console.error(m),
): Promise<void> {
  const errorName = String(error?.name ?? 'Error').slice(0, 100);
  log(`audit-run failed for ${auditId}: ${errorName}: ${String(error?.message ?? '').slice(0, 1000)}`);

  const status = await deps.getAuditStatus(auditId);
  const isPaid = await deps.getAuditIsPaid(auditId);

  let to: AuditStatus | null = null;
  try {
    to = transition(status, 'step_failed', { isPaid });
  } catch (err) {
    if (!(err instanceof TransitionError)) throw err;
  }

  if (to) {
    try {
      await deps.transitionStatus(auditId, status, to, { to, failed: true });
    } catch (err) {
      // The admin moved the audit in between: still record that the run failed.
      if (!(err instanceof StatusConflictError)) throw err;
      to = null;
    }
  }
  await deps.insertAuditEvent(auditId, 'run.failed', { status, to, errorName });
}
