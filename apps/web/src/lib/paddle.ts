import { createHmac, timingSafeEqual } from 'node:crypto';

// Paddle Billing (not Classic — Classic isn't issued to new merchants).
// See docs/specs/T-45.md and docs/adr/ADR-007-paddle-payments.md.

// Sandbox and live are fully separate Paddle environments with separate base
// URLs — a sandbox key sent to api.paddle.com (or vice versa) is rejected
// with 403, not routed. The key's own prefix (`pdl_sdbx_` / `pdl_live_`)
// already encodes which environment it belongs to, so deriving the base URL
// from it means the two can never drift out of sync with each other.
const PADDLE_LIVE_BASE_URL = 'https://api.paddle.com';
const PADDLE_SANDBOX_BASE_URL = 'https://sandbox-api.paddle.com';

function resolvePaddleBaseUrl(apiKey: string): string {
  return apiKey.startsWith('pdl_sdbx_') ? PADDLE_SANDBOX_BASE_URL : PADDLE_LIVE_BASE_URL;
}

// Tolerance for the Paddle-Signature `ts` field: wide enough to absorb
// network latency and Paddle's own retry delays, tight enough to reject a
// stale/replayed request body.
const MAX_SIGNATURE_AGE_SECONDS = 300;

export type PaddleSignatureCheck = { valid: true } | { valid: false; reason: string };

// Verifies against the RAW request body string — never JSON.parse before
// calling this, the HMAC is computed over the exact bytes Paddle sent.
export function verifyPaddleSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  now: Date = new Date(),
): PaddleSignatureCheck {
  if (!signatureHeader) return { valid: false, reason: 'missing Paddle-Signature header' };

  const parts: Record<string, string> = {};
  for (const part of signatureHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    parts[part.slice(0, eq)] = part.slice(eq + 1);
  }

  const ts = parts.ts;
  const h1 = parts.h1;
  if (!ts || !h1) return { valid: false, reason: 'malformed Paddle-Signature header' };

  const tsSeconds = Number(ts);
  if (!Number.isFinite(tsSeconds)) return { valid: false, reason: 'non-numeric timestamp' };

  const ageSeconds = Math.abs(now.getTime() / 1000 - tsSeconds);
  if (ageSeconds > MAX_SIGNATURE_AGE_SECONDS) {
    return { valid: false, reason: `timestamp outside ${MAX_SIGNATURE_AGE_SECONDS}s window` };
  }

  const expected = createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(h1, 'hex');
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return { valid: false, reason: 'signature mismatch' };
  }

  return { valid: true };
}

export type PaddleApiDeps = {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  baseUrl?: string;
};

export type CreateTransactionInput = {
  priceId: string;
  customData: Record<string, string>;
};

export type CreateTransactionResult = {
  transactionId: string;
};

// Uses Paddle's Transactions API purely to mint a transaction id: the checkout
// itself is opened client-side by the Paddle.js overlay
// (`Checkout.open({ transactionId })` in report-content.tsx via
// lib/paddle-client.ts). Paddle Billing has no server-redirect hosted
// checkout, so the response's `checkout.url` is not used here — and it is only
// populated at all when the Paddle dashboard has a default payment link, so it
// must never be treated as required. See the 2026-10-01 amendment to
// docs/specs/T-45.md and docs/adr/ADR-007-paddle-payments.md.
export async function createPaddleTransaction(
  deps: PaddleApiDeps,
  input: CreateTransactionInput,
): Promise<CreateTransactionResult> {
  const fetchFn = deps.fetch ?? globalThis.fetch;
  const baseUrl = deps.baseUrl ?? resolvePaddleBaseUrl(deps.apiKey);

  const res = await fetchFn(`${baseUrl}/transactions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${deps.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [{ price_id: input.priceId, quantity: 1 }],
      custom_data: input.customData,
    }),
  });

  if (!res.ok) {
    throw new Error(`Paddle API error: ${res.status}`);
  }

  const data = (await res.json()) as { data?: { id?: string } };
  const transactionId = data.data?.id;
  if (!transactionId) {
    throw new Error('Paddle transaction response missing data.id');
  }

  return { transactionId };
}

export type CreateRefundInput = {
  transactionId: string;
  reason: string;
};

export type CreateRefundResult = {
  adjustmentId: string;
};

export async function createPaddleRefund(
  deps: PaddleApiDeps,
  input: CreateRefundInput,
): Promise<CreateRefundResult> {
  const fetchFn = deps.fetch ?? globalThis.fetch;
  const baseUrl = deps.baseUrl ?? resolvePaddleBaseUrl(deps.apiKey);

  const res = await fetchFn(`${baseUrl}/adjustments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${deps.apiKey}`,
      'Content-Type': 'application/json',
    },
    // `type` must be sent explicitly: Paddle Billing defaults an adjustment to
    // `partial`, and a partial adjustment requires an `items` array — omitting
    // both makes the request fail validation, so the refund would never happen.
    // `full` refunds the whole transaction and needs no item list.
    // Confirmed against the real Paddle sandbox API on 2026-10-01: the request
    // is accepted as-is, and the response comes back `pending_approval` rather
    // than `approved` — a successful HTTP response means "refund requested",
    // not "money already returned". See the 2026-10-01 amendment in
    // docs/specs/T-45.md and docs/runbooks/paid-no-report.md.
    body: JSON.stringify({
      action: 'refund',
      type: 'full',
      transaction_id: input.transactionId,
      reason: input.reason,
    }),
  });

  if (!res.ok) {
    throw new Error(`Paddle API error: ${res.status}`);
  }

  const data = (await res.json()) as { data: { id: string } };
  return { adjustmentId: data.data.id };
}

// The transaction.completed webhook payload carries only `customer_id`, not
// an email (confirmed against Paddle's docs) — the receipt email has to be
// fetched separately. This always reflects the address the buyer actually
// paid with, rather than whatever (possibly stale) email our own teaser flow
// may have captured earlier.
export async function getPaddleCustomerEmail(
  deps: PaddleApiDeps,
  customerId: string,
): Promise<string> {
  const fetchFn = deps.fetch ?? globalThis.fetch;
  const baseUrl = deps.baseUrl ?? resolvePaddleBaseUrl(deps.apiKey);

  const res = await fetchFn(`${baseUrl}/customers/${customerId}`, {
    headers: { Authorization: `Bearer ${deps.apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`Paddle API error: ${res.status}`);
  }

  const data = (await res.json()) as { data: { email: string } };
  return data.data.email;
}
