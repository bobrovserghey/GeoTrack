import { NonRetriableError } from 'inngest';
import { inngest } from '../inngest.js';
import {
  auditRunHandler,
  auditRunFailureHandler,
  type AuditRunDeps,
  type StepTools,
} from './audit-run-handler.js';

// Placeholder deps for local development and tests only: every call succeeds
// and persists nothing. Production must inject real ones via setAuditRunDeps —
// until that wiring exists (T-06+ leaves DB access for later), running the
// pipeline in production would "succeed" without writing a single status, so
// resolveAuditRunDeps() refuses to hand these out there.
export const noopDeps: AuditRunDeps = {
  getAuditStatus: async () => 'queued',
  transitionStatus: async () => {},
  insertAuditEvent: async () => {},
  getAuditIsPaid: async () => false,
  getAuditEmailNormalized: async () => null,
  checkDisposableEmail: async () => ({ blocked: false }),
};

let injected: AuditRunDeps | null = null;

export function setAuditRunDeps(d: AuditRunDeps): void {
  injected = d;
}

export function resolveAuditRunDeps(env: Record<string, string | undefined> = process.env): AuditRunDeps {
  if (injected) return injected;
  if (env.NODE_ENV === 'production') {
    // NonRetriableError: retrying cannot fix missing wiring, and a loud failed
    // run in the Inngest dashboard is exactly the signal we want.
    throw new NonRetriableError(
      'audit-run dependencies are not configured: call setAuditRunDeps() at startup before processing audits',
    );
  }
  return noopDeps;
}

// Inngest's onFailure event wraps the original one: data.event is the
// `geotrack/audit.queued` that started the failed run.
function auditIdOfFailedRun(event: { data?: { event?: { data?: { auditId?: string } } } }): string {
  const auditId = event.data?.event?.data?.auditId;
  if (!auditId) throw new NonRetriableError('onFailure: original event has no auditId');
  return auditId;
}

export const auditRun = inngest.createFunction(
  {
    id: 'audit-run',
    name: 'Run audit pipeline',
    // One live run per audit: a duplicate or retried `audit.queued` is skipped
    // while a run for the same audit is active. (`concurrency` alone limits how
    // many STEPS run at once, not how many runs, so it does not deduplicate.
    // Not `idempotency` either — its 24h window would block a restart after a
    // failed run.)
    singleton: { key: 'event.data.auditId', mode: 'skip' },
    concurrency: { limit: 1, key: 'event.data.auditId' },
    onFailure: ({ event, error }) =>
      auditRunFailureHandler(auditIdOfFailedRun(event), error, resolveAuditRunDeps()),
  },
  { event: 'geotrack/audit.queued' },
  ({ event, step }) =>
    auditRunHandler(
      (event.data as { auditId: string }).auditId,
      step as unknown as StepTools,
      resolveAuditRunDeps(),
      (event.data as { categoryHint?: string }).categoryHint,
    ),
);
