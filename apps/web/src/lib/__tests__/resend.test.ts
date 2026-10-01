import { describe, it, expect, vi } from 'vitest';
import { sendPaymentConfirmationEmail, sendRefundEmail } from '../resend.js';

describe('sendPaymentConfirmationEmail', () => {
  it('posts the expected request to Resend', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.resend.com/emails');
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({
        Authorization: 'Bearer test-key',
        'Idempotency-Key': 'audit-1:payment_confirmation',
      });
      const body = JSON.parse(init.body as string);
      expect(body.to).toEqual(['customer@example.com']);
      expect(body.html).toContain('acme.com');
      expect(body.html).toContain('79.00');
      return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 });
    });

    const result = await sendPaymentConfirmationEmail(
      { apiKey: 'test-key', fetch: fetchMock as unknown as typeof fetch },
      { to: 'customer@example.com', auditId: 'audit-1', domain: 'acme.com', reportUrl: 'https://geotrack.example/report/audit-1', amount: 79, currency: 'USD' },
    );

    expect(result).toEqual({ emailId: 'email_1' });
  });

  it('escapes HTML in the domain to avoid breaking the email markup', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(body.html).not.toContain('<script>');
      expect(body.html).toContain('&lt;script&gt;');
      return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 });
    });

    await sendPaymentConfirmationEmail(
      { apiKey: 'k', fetch: fetchMock as unknown as typeof fetch },
      { to: 'x@example.com', auditId: 'a1', domain: '<script>alert(1)</script>', reportUrl: 'https://x', amount: 79, currency: 'USD' },
    );
  });

  it('names the currency actually charged instead of assuming dollars', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(body.html).toContain('72.30 EUR');
      expect(body.html).not.toContain('$');
      return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 });
    });

    await sendPaymentConfirmationEmail(
      { apiKey: 'k', fetch: fetchMock as unknown as typeof fetch },
      { to: 'x@example.com', auditId: 'a1', domain: 'acme.com', reportUrl: 'https://x', amount: 72.3, currency: 'eur' },
    );
  });

  it('throws a readable error on a non-ok response', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 422 }));
    await expect(
      sendPaymentConfirmationEmail(
        { apiKey: 'k', fetch: fetchMock as unknown as typeof fetch },
        { to: 'x@example.com', auditId: 'a1', domain: 'acme.com', reportUrl: 'https://x', amount: 79, currency: 'USD' },
      ),
    ).rejects.toThrow('Resend API error: 422');
  });
});

describe('sendRefundEmail', () => {
  it('posts the expected request with a distinct idempotency key', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.headers).toMatchObject({ 'Idempotency-Key': 'audit-1:refund_notification' });
      const body = JSON.parse(init.body as string);
      expect(body.html).toContain('79.00 USD');
      return new Response(JSON.stringify({ id: 'email_2' }), { status: 200 });
    });

    const result = await sendRefundEmail(
      { apiKey: 'k', fetch: fetchMock as unknown as typeof fetch },
      { to: 'customer@example.com', auditId: 'audit-1', domain: 'acme.com', amount: 79, currency: 'USD' },
    );
    expect(result).toEqual({ emailId: 'email_2' });
  });

  it('names the currency actually charged instead of assuming dollars', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(body.html).toContain('72.30 EUR');
      expect(body.html).not.toContain('$');
      return new Response(JSON.stringify({ id: 'email_3' }), { status: 200 });
    });

    await sendRefundEmail(
      { apiKey: 'k', fetch: fetchMock as unknown as typeof fetch },
      { to: 'customer@example.com', auditId: 'audit-1', domain: 'acme.com', amount: 72.3, currency: 'eur' },
    );
  });
});
