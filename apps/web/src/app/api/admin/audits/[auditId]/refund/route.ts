import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { eq, and, desc, max } from 'drizzle-orm';
import { isValidSession, ADMIN_COOKIE } from '@/lib/admin-auth';
import { getDb } from '@/lib/db';
import { audits, orders, payments, auditEvents } from '@geotrack/db';
import { transition, TransitionError } from '@geotrack/core';
import type { AuditStatus } from '@geotrack/core';
import { createPaddleRefund, getPaddleCustomerEmail } from '@/lib/paddle';
import { sendRefundEmail } from '@/lib/resend';

// payments.payload stores the full Paddle webhook event (see the webhook
// route) specifically so data like customer_id — not persisted as its own
// column — can still be recovered here without another Paddle API round
// trip just to look it up.
function extractCustomerId(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const data = (payload as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return null;
  const customerId = (data as { customer_id?: unknown }).customer_id;
  return typeof customerId === 'string' ? customerId : null;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const cookieStore = await cookies();
  if (!isValidSession(cookieStore.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { auditId } = await params;
  const db = getDb();

  const [audit] = await db.select().from(audits).where(eq(audits.id, auditId)).limit(1);
  if (!audit) return NextResponse.json({ error: 'Audit not found' }, { status: 404 });

  let nextStatus: AuditStatus;
  try {
    nextStatus = transition(audit.status, 'admin_refund', { isPaid: true });
  } catch (err) {
    if (err instanceof TransitionError) {
      return NextResponse.json(
        { error: `Cannot refund from status "${audit.status}" — refund is only valid from "needs_attention"` },
        { status: 409 },
      );
    }
    throw err;
  }

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.auditId, auditId), eq(orders.status, 'completed')))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  if (!order) {
    return NextResponse.json({ error: 'No completed order found for this audit' }, { status: 404 });
  }

  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.orderId, order.id), eq(payments.status, 'completed')))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  if (!payment) {
    return NextResponse.json({ error: 'No completed payment found for this order' }, { status: 404 });
  }

  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) {
    console.error('[refund] PADDLE_API_KEY not configured');
    return NextResponse.json({ error: 'refund not configured' }, { status: 500 });
  }

  let adjustmentId: string;
  try {
    const refund = await createPaddleRefund(
      { apiKey },
      { transactionId: payment.paddleTransactionId, reason: 'admin refund' },
    );
    adjustmentId = refund.adjustmentId;
  } catch (err) {
    console.error('[refund] Paddle refund API call failed:', err);
    return NextResponse.json({ error: 'Paddle refund failed' }, { status: 502 });
  }

  // The money has already moved at this point, so the four DB writes that
  // record it go in one transaction: a partial write would leave the DB
  // disagreeing with Paddle (e.g. order still `completed`, so an operator
  // could try to refund a second time). If this throws, nothing is marked and
  // the 500 tells the operator to re-check against Paddle — a known gap,
  // tracked in docs/specs/debt.md.
  try {
    await db.transaction(async (tx) => {
      await tx.update(orders).set({ status: 'refunded' }).where(eq(orders.id, order.id));
      await tx.update(payments).set({ status: 'refunded' }).where(eq(payments.id, payment.id));
      // updatedAt is bumped explicitly — the column has no $onUpdate, and the
      // runbook triages paid audits by how long they have sat in a status.
      await tx
        .update(audits)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(eq(audits.id, auditId));

      const [seqRow] = await tx
        .select({ maxSeq: max(auditEvents.seq) })
        .from(auditEvents)
        .where(eq(auditEvents.auditId, auditId));

      await tx.insert(auditEvents).values({
        auditId,
        seq: (seqRow?.maxSeq ?? -1) + 1,
        eventType: 'admin.refund',
        payload: {
          triggeredAt: new Date().toISOString(),
          orderId: order.id,
          paymentId: payment.id,
          // Paddle's own key for this refund — without it there is nothing in
          // our DB to reconcile against Paddle's adjustment list.
          paddleAdjustmentId: adjustmentId,
          paddleTransactionId: payment.paddleTransactionId,
        },
      });
    });
  } catch (err) {
    console.error(
      '[refund] Paddle refund SUCCEEDED but recording it in the database failed — reconcile manually:',
      { auditId, orderId: order.id, paymentId: payment.id, transactionId: payment.paddleTransactionId },
      err,
    );
    return NextResponse.json(
      { error: 'Refund was issued at Paddle but could not be recorded — see docs/runbooks/paid-no-report.md' },
      { status: 500 },
    );
  }

  // Best-effort — the refund itself (Paddle API + DB state) already
  // succeeded by this point; a failed notification email doesn't undo it.
  const resendApiKey = process.env.RESEND_API_KEY;
  const customerId = extractCustomerId(payment.payload);
  if (resendApiKey && customerId) {
    try {
      const email = await getPaddleCustomerEmail({ apiKey }, customerId);
      await sendRefundEmail(
        { apiKey: resendApiKey },
        { to: email, auditId, domain: audit.domain, amount: Number(payment.amountUsd), currency: payment.currency },
      );
    } catch (err) {
      console.error('[refund] refund notification email failed:', err);
    }
  } else if (resendApiKey) {
    console.error('[refund] could not find customer_id in stored payment payload — skipping notification email', { paymentId: payment.id });
  }

  return NextResponse.json({ ok: true, status: nextStatus });
}
