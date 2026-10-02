import { and, eq, max } from 'drizzle-orm';
import { promises as dns } from 'node:dns';
import { audits, auditEvents } from '@geotrack/db/schema';
import type { DbClient } from '@geotrack/db/client';
import type { MxResolver } from '@geotrack/core';
import {
  StatusConflictError,
  type AuditRunDeps,
  type AuditEventPayload,
} from '../functions/audit-run-handler.js';
import { runDisposableCheck } from '../steps/disposable-check.js';

const UNIQUE_VIOLATION = '23505';
const MAX_SEQ_RETRIES = 3;

// Same Postgres-error-code check as the web app's webhook/refund routes
// (postgres.js errors are not wrapped by drizzle-orm@0.36).
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === UNIQUE_VIOLATION;
}

type Tx = Parameters<Parameters<DbClient['transaction']>[0]>[0];

async function appendEvent(tx: Tx, auditId: string, eventType: string, payload: AuditEventPayload) {
  const [row] = await tx
    .select({ maxSeq: max(auditEvents.seq) })
    .from(auditEvents)
    .where(eq(auditEvents.auditId, auditId));
  await tx.insert(auditEvents).values({
    auditId,
    seq: (row?.maxSeq ?? -1) + 1,
    eventType,
    payload,
  });
}

// (audit_id, seq) is unique and the web app appends events too (email/category
// routes, webhooks), so the max(seq)+1 insert can collide with a concurrent
// writer: retry in a fresh transaction, which re-reads max(seq).
async function withSeqRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (!isUniqueViolation(err) || attempt >= MAX_SEQ_RETRIES) throw err;
    }
  }
}

const defaultResolveMx: MxResolver = async (domain) => (await dns.resolveMx(domain)).map((r) => r.exchange);

export function createAuditRunDeps(
  db: DbClient,
  resolveMx: MxResolver = defaultResolveMx,
): AuditRunDeps {
  return {
    async getAuditStatus(auditId) {
      const [row] = await db.select({ status: audits.status }).from(audits).where(eq(audits.id, auditId)).limit(1);
      if (!row) throw new Error(`audit ${auditId} not found`);
      return row.status;
    },

    // Compare-and-set: the UPDATE only matches while the audit is still in
    // `from`, so an admin cancel/restart that landed in between is never
    // overwritten. The status change and its `status.changed` event commit
    // together or not at all.
    async transitionStatus(auditId, from, to, payload) {
      await withSeqRetry(() =>
        db.transaction(async (tx) => {
          const updated = await tx
            .update(audits)
            .set({ status: to, updatedAt: new Date() })
            .where(and(eq(audits.id, auditId), eq(audits.status, from)))
            .returning({ id: audits.id });
          if (updated.length === 0) throw new StatusConflictError(auditId, from, to);
          await appendEvent(tx, auditId, 'status.changed', { from, ...payload });
        }),
      );
    },

    async insertAuditEvent(auditId, eventType, payload) {
      await withSeqRetry(() => db.transaction((tx) => appendEvent(tx, auditId, eventType, payload)));
    },

    // Paid = anything that is not a teaser (standard/extended, ADR-013).
    async getAuditIsPaid(auditId) {
      const [row] = await db.select({ auditType: audits.auditType }).from(audits).where(eq(audits.id, auditId)).limit(1);
      if (!row) throw new Error(`audit ${auditId} not found`);
      return row.auditType !== 'teaser';
    },

    async getAuditEmailNormalized(auditId) {
      const [row] = await db
        .select({ email: audits.emailNormalized })
        .from(audits)
        .where(eq(audits.id, auditId))
        .limit(1);
      return row?.email ?? null;
    },

    checkDisposableEmail: (email) => runDisposableCheck(email, resolveMx),
  };
}
