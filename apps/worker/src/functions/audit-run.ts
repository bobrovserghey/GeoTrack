import { inngest } from '../inngest.js';
import { auditRunHandler, type AuditRunDeps, type StepTools } from './audit-run-handler.js';

// Production deps are injected at startup (T-05 leaves DB wiring for T-06+).
// Replace this no-op implementation when the real DB client is wired in.
export const noopDeps: AuditRunDeps = {
  updateAuditStatus: async () => {},
  insertAuditEvent: async () => {},
  getAuditIsPaid: async () => false,
};

let deps = noopDeps;

export function setAuditRunDeps(d: AuditRunDeps): void {
  deps = d;
}

export const auditRun = inngest.createFunction(
  { id: 'audit-run', name: 'Run audit pipeline' },
  { event: 'geotrack/audit.queued' },
  ({ event, step }) =>
    auditRunHandler(
      (event.data as { auditId: string }).auditId,
      step as unknown as StepTools,
      deps,
    ),
);
