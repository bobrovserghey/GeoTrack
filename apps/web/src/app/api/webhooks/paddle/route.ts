import { NextResponse } from 'next/server';
import { Inngest } from 'inngest';
import { eq, max } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { audits, orders, payments, reportTokens, auditEvents } from '@geotrack/db';
import { getAuditProfileV2, getMethodology } from '@geotrack/config';
import { generateReportToken } from '@geotrack/core';
import { verifyPaddleSignature, getPaddleCustomerEmail } from '@/lib/paddle';
import { sendPaymentConfirmationEmail } from '@/lib/resend';
import { resolvePaddlePrice } from '@/lib/paddle-pricing';

const inngest = new Inngest({
  id: 'geotrack-web',
  ...(process.env.INNGEST_EVENT_KEY ? { eventKey: process.env.INNGEST_EVENT_KEY } : {}),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PaddleTransactionCompletedEvent = {
  event_id: string;
  event_type: string;
  data: {
    id: string;
    customer_id: string;
    currency_code: string;
    custom_data: Record<string, unknown> | null;
    items: { price: { id: string } }[];
    details: { totals: { total: string } };
  };
};

// `audit_events` has a UNIQUE(audit_id, seq) constraint, so a hardcoded seq
// collides as soon as a second event is written for the same audit. Same
// max(seq)+1 computation as the restart-step route.
async function nextEventSeq(db: ReturnType<typeof getDb>, auditId: string): Promise<number> {
  const [row] = await db
    .select({ maxSeq: max(auditEvents.seq) })
    .from(auditEvents)
    .where(eq(auditEvents.auditId, auditId));
  return (row?.maxSeq ?? -1) + 1;
}

// Writes a best-effort diagnostic event; never throws, because every caller
// is on a path where the payment is already captured and the audit created.
async function logAuditEvent(
  db: ReturnType<typeof getDb>,
  auditId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      auditId,
      seq: await nextEventSeq(db, auditId),
      eventType,
      payload,
    });
  } catch (err) {
    console.error(`[paddle-webhook] failed to log ${eventType} for ${auditId}:`, err);
  }
}

// Postgres SQLSTATE for a unique-constraint violation — the backstop for the
// idempotency race described in docs/specs/T-45.md. drizzle-orm 0.36 hands the
// driver's `PostgresError` through untouched, so `err.code` is set directly;
// the `cause` walk keeps this working if a future drizzle version starts
// wrapping driver errors (DrizzleQueryError), which would otherwise silently
// downgrade "duplicate → 200" into "500 → endless Paddle retries".
// Deliberately matches ANY unique violation raised inside the transaction, not
// just orders.paddle_event_id: payments.paddle_transaction_id is the second
// legitimate dedup key (the same transaction re-delivered under a new event_id
// must not create a second audit either). The only other unique column in play
// is report_tokens.token_hash, whose collision probability is negligible — do
// not widen this further without revisiting that.
function isUniqueViolation(err: unknown, depth = 0): boolean {
  if (typeof err !== 'object' || err === null || depth > 5) return false;
  if ((err as { code?: unknown }).code === '23505') return true;
  return isUniqueViolation((err as { cause?: unknown }).cause, depth + 1);
}

// POST only — Paddle webhooks are always POST, and the raw body must be read
// before any JSON parsing: the signature is computed over the exact bytes
// Paddle sent, not a re-serialized object. See docs/specs/T-45.md.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('paddle-signature');
  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[paddle-webhook] PADDLE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }

  const signatureCheck = verifyPaddleSignature(rawBody, signatureHeader, webhookSecret);
  if (!signatureCheck.valid) {
    console.error('[paddle-webhook] signature check failed:', signatureCheck.reason);
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let event: PaddleTransactionCompletedEvent;
  try {
    event = JSON.parse(rawBody) as PaddleTransactionCompletedEvent;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  // Acknowledge any event type we don't act on — Paddle retries on non-2xx.
  if (event.event_type !== 'transaction.completed') {
    return NextResponse.json({ ok: true, ignored: event.event_type });
  }

  // A valid signature proves the body came from Paddle, not that it has the
  // shape we expect. Reading `data.items[0].price.id` or `data.details.totals`
  // off an unexpected payload would throw a TypeError outside any try/catch —
  // a 500, which Paddle then retries forever. Check the shape explicitly.
  // `event_id` and `data.id` are checked too, not just the nested shape: both go
  // straight into NOT NULL columns, where a non-string would raise a
  // non-23505 error, become a 500, and have Paddle retry it forever.
  // This runs BEFORE the first query on purpose: `event_id` is the lookup key
  // for the fast path below, so a non-string would otherwise reach the driver
  // ahead of the guard and produce exactly the 500 this prevents.
  if (
    typeof event.event_id !== 'string' ||
    !event.data ||
    typeof event.data !== 'object' ||
    typeof event.data.id !== 'string' ||
    !Array.isArray(event.data.items)
  ) {
    console.error('[paddle-webhook] unexpected payload shape for event:', event.event_id);
    return NextResponse.json({ error: 'unexpected payload shape' }, { status: 400 });
  }

  const db = getDb();

  // Fast-path idempotency check. The transactional insert below is what
  // actually guarantees no duplicate audit under concurrent delivery — this
  // is just the common case (sequential retries) answered cheaply.
  const [existingOrder] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.paddleEventId, event.event_id))
    .limit(1);
  if (existingOrder) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const teaserAuditId = event.data.custom_data?.teaserAuditId;
  if (typeof teaserAuditId !== 'string' || !UUID_RE.test(teaserAuditId)) {
    console.error('[paddle-webhook] missing/invalid custom_data.teaserAuditId:', event.data.id);
    return NextResponse.json({ error: 'missing or invalid teaserAuditId' }, { status: 400 });
  }

  const priceId = event.data.items[0]?.price?.id;
  const priceMapping = typeof priceId === 'string' ? resolvePaddlePrice(priceId) : null;
  if (!priceMapping || typeof priceId !== 'string') {
    console.error('[paddle-webhook] unknown price id:', priceId);
    return NextResponse.json({ error: 'unknown price id' }, { status: 400 });
  }

  const [teaser] = await db.select().from(audits).where(eq(audits.id, teaserAuditId)).limit(1);
  if (!teaser) {
    return NextResponse.json({ error: 'teaser audit not found' }, { status: 404 });
  }

  const profile = getAuditProfileV2(priceMapping.profileId);
  const methodology = getMethodology();

  // Paddle sends totals as a string in the currency's minor units. This
  // assumes a 2-decimal currency; zero-decimal ones (JPY, KRW) come out 100x
  // low — see docs/specs/debt.md, T-45.
  const totalCents = Number(event.data.details?.totals?.total);
  const totalParsed = Number.isFinite(totalCents);
  const amountChargedUsd = totalParsed
    ? (totalCents / 100).toFixed(2)
    : priceMapping.priceUsd.toFixed(2);
  // Same treatment as `total`: a missing/non-string currency defaults to USD so
  // the NOT NULL column is satisfied, but the fact that we guessed is recorded
  // rather than silently asserted as "charged in USD".
  const currencyParsed = typeof event.data.currency_code === 'string';
  const currency = currencyParsed ? (event.data.currency_code as string) : 'USD';

  let newAuditId: string;
  let reportToken: string;
  try {
    const created = await db.transaction(async (tx) => {
      const [paidAudit] = await tx
        .insert(audits)
        .values({
          domain: teaser.domain,
          domainNormalized: teaser.domainNormalized,
          url: teaser.url,
          status: 'queued',
          auditType: priceMapping.profileId,
          profileId: priceMapping.profileId,
          profileVersion: profile.version,
          parentAuditId: teaser.id,
          isInternal: false,
          locale: teaser.locale,
          // Carried over from the teaser deliberately: without it the paid
          // report re-shows the email gate to someone who has just paid
          // (`showEmailGate` in report/[auditId]/page.tsx keys off this
          // column), and the buyer would be linked to the audit only through
          // the raw Paddle payload.
          emailNormalized: teaser.emailNormalized,
          userId: teaser.userId,
          methodologyVersion: String(methodology.version),
        })
        .returning({ id: audits.id });
      if (!paidAudit) throw new Error('insert into audits returned no row');

      const { token, hash } = generateReportToken();
      await tx.insert(reportTokens).values({
        auditId: paidAudit.id,
        tokenHash: hash,
        tokenType: 'report',
      });

      const [order] = await tx
        .insert(orders)
        .values({
          auditId: paidAudit.id,
          parentAuditId: teaser.id,
          userId: teaser.userId,
          productId: priceId,
          paddleEventId: event.event_id,
          amountUsd: priceMapping.priceUsd.toFixed(2),
          status: 'completed',
        })
        .returning({ id: orders.id });
      if (!order) throw new Error('insert into orders returned no row');

      await tx.insert(payments).values({
        orderId: order.id,
        paddleTransactionId: event.data.id,
        amountUsd: amountChargedUsd,
        currency,
        status: 'completed',
        payload: event,
      });

      return { auditId: paidAudit.id, token };
    });
    newAuditId = created.auditId;
    reportToken = created.token;
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Lost a race to a concurrent delivery of the same event — the other
      // request already created the audit. Acknowledge, don't retry.
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error('[paddle-webhook] failed to create paid audit:', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }

  // Everything below is best-effort: the payment is captured and the audit
  // row exists, so this handler must still answer 200. A non-2xx here would
  // make Paddle retry, and the retry would hit the fast-path duplicate check
  // above and return early — so a 500 would permanently lose the enqueue/email
  // rather than recovering it. Failures are logged to `audit_events` so the
  // admin panel shows them (see docs/runbooks/paid-no-report.md).
  try {
    await inngest.send({ name: 'geotrack/audit.queued', data: { auditId: newAuditId } });
  } catch (err) {
    console.error('[paddle-webhook] failed to enqueue paid audit:', err);
    await logAuditEvent(db, newAuditId, 'payment.enqueue_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // The server-side price map is the source of truth for what the audit is
  // worth (`orders.amount_usd`); `payments.amount_usd` records what Paddle
  // actually charged. A mismatch is legitimate (discount code, proration) but
  // must be visible rather than silent — see docs/specs/debt.md, T-45.
  // `!totalParsed` is part of the condition on purpose: an unparseable total
  // falls back to the list price above, which would otherwise look like an
  // exact match and hide the fact that we could not read what was charged.
  if (
    !totalParsed ||
    !currencyParsed ||
    amountChargedUsd !== priceMapping.priceUsd.toFixed(2) ||
    currency !== 'USD'
  ) {
    console.warn(
      '[paddle-webhook] charged amount/currency differs from the server-side price:',
      { auditId: newAuditId, expectedUsd: priceMapping.priceUsd.toFixed(2), charged: amountChargedUsd, currency, totalParsed, currencyParsed },
    );
    await logAuditEvent(db, newAuditId, 'payment.amount_mismatch', {
      expectedUsd: priceMapping.priceUsd.toFixed(2),
      charged: amountChargedUsd,
      currency,
      // false → `charged` is the list price we substituted, not a real amount.
      totalParsed,
      // false → `currency` is a USD guess, not what the payload said.
      currencyParsed,
    });
  }

  try {
    const paddleApiKey = process.env.PADDLE_API_KEY;
    const resendApiKey = process.env.RESEND_API_KEY;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured');
    }
    // Without an absolute base the receipt would carry a relative link, i.e. a
    // dead link in an email client. Fail into the catch below (which logs
    // payment.email_failed) instead of sending a broken receipt.
    if (!appUrl) {
      throw new Error('NEXT_PUBLIC_APP_URL not configured — cannot build an absolute report link');
    }

    // This email is the ONLY delivery channel for the report link: the token is
    // persisted as a hash only, the plaintext exists just in this request, and
    // there is no post-payment redirect carrying it (see docs/specs/debt.md).
    // So don't let it hinge on a second external call — prefer the Paddle
    // customer record (the address actually paid with), but fall back to the
    // email the teaser already captured rather than failing outright.
    let email = teaser.emailNormalized ?? null;
    if (paddleApiKey) {
      try {
        const paddleEmail = await getPaddleCustomerEmail({ apiKey: paddleApiKey }, event.data.customer_id);
        // Only overwrite on a usable value: a 200 with an empty/absent email
        // would otherwise discard a perfectly good teaser address.
        if (typeof paddleEmail === 'string' && paddleEmail.length > 0) {
          email = paddleEmail;
        }
      } catch (err) {
        console.error('[paddle-webhook] could not read the Paddle customer email, falling back to the teaser address:', err);
      }
    }
    if (!email) {
      throw new Error('no recipient address: Paddle lookup failed and the teaser has no email');
    }
    const reportUrl = `${appUrl}/report/${newAuditId}?token=${reportToken}`;
    await sendPaymentConfirmationEmail(
      { apiKey: resendApiKey },
      {
        to: email,
        auditId: newAuditId,
        domain: teaser.domain,
        reportUrl,
        // What Paddle actually charged, in the currency it charged — not the
        // USD list price, which would print "$79.00" to a EUR buyer.
        amount: Number(amountChargedUsd),
        currency,
      },
    );
  } catch (err) {
    console.error('[paddle-webhook] confirmation email failed:', err);
    await logAuditEvent(db, newAuditId, 'payment.email_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ ok: true, auditId: newAuditId });
}
