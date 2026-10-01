// Raw fetch against Resend's REST API, not the `resend` npm package — same
// pattern as the engine adapters in packages/core (injectable fetch, no SDK,
// no network from tests). See docs/adr/ADR-026-resend-email.md.

const DEFAULT_RESEND_BASE_URL = 'https://api.resend.com';
const FROM_ADDRESS = 'Geotrack <receipts@geotrack.app>';

export type ResendDeps = {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  baseUrl?: string;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  // Resend's own idempotency key — a retried Inngest/webhook delivery must
  // not send a second email. See playbook/integrations.md ("3. Resend").
  idempotencyKey: string;
};

export type SendEmailResult = {
  emailId: string;
};

async function sendEmail(deps: ResendDeps, input: SendEmailInput): Promise<SendEmailResult> {
  const fetchFn = deps.fetch ?? globalThis.fetch;
  const baseUrl = deps.baseUrl ?? DEFAULT_RESEND_BASE_URL;

  const res = await fetchFn(`${baseUrl}/emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${deps.apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend API error: ${res.status}`);
  }

  const data = (await res.json()) as { id: string };
  return { emailId: data.id };
}

export type PaymentConfirmationInput = {
  to: string;
  auditId: string;
  domain: string;
  reportUrl: string;
  // The amount actually charged, in `currency`. Paddle is the merchant of
  // record and settles in the buyer's currency, so a receipt must not assume
  // the USD list price — see sendRefundEmail below, same rule.
  amount: number;
  currency: string;
};

export function sendPaymentConfirmationEmail(
  deps: ResendDeps,
  input: PaymentConfirmationInput,
): Promise<SendEmailResult> {
  const html = `
    <p>Thanks for your purchase — your full AI visibility audit for <strong>${escapeHtml(input.domain)}</strong> is being generated.</p>
    <p>Amount charged: ${input.amount.toFixed(2)} ${escapeHtml(input.currency.toUpperCase())}</p>
    <p><a href="${escapeHtml(input.reportUrl)}">View your report</a> (it will update as the audit completes).</p>
  `;
  return sendEmail(deps, {
    to: input.to,
    subject: `Payment received — your ${input.domain} audit is on its way`,
    html,
    // audit_id + email_type, per playbook/integrations.md's idempotency rule.
    idempotencyKey: `${input.auditId}:payment_confirmation`,
  });
}

export type RefundNotificationInput = {
  to: string;
  auditId: string;
  domain: string;
  // The amount actually charged, in `currency` — NOT necessarily USD. Paddle
  // is the merchant of record and settles in the buyer's currency, so this is
  // read from payments.amount_usd/currency rather than the server price map;
  // telling the customer "$" for a EUR charge would be wrong.
  amount: number;
  currency: string;
};

export function sendRefundEmail(
  deps: ResendDeps,
  input: RefundNotificationInput,
): Promise<SendEmailResult> {
  const amount = `${input.amount.toFixed(2)} ${escapeHtml(input.currency.toUpperCase())}`;
  const html = `
    <p>Your payment of ${amount} for the audit of <strong>${escapeHtml(input.domain)}</strong> has been refunded.</p>
    <p>We're sorry the full report couldn't be delivered this time.</p>
  `;
  return sendEmail(deps, {
    to: input.to,
    subject: `Refund processed — ${input.domain} audit`,
    html,
    idempotencyKey: `${input.auditId}:refund_notification`,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
