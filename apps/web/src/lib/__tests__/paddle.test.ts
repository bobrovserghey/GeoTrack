import { createHmac } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import {
  verifyPaddleSignature,
  createPaddleTransaction,
  createPaddleRefund,
  getPaddleCustomerEmail,
} from '../paddle.js';

const SECRET = 'whsec_test_secret';

function sign(rawBody: string, ts: number, secret = SECRET): string {
  const h1 = createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest('hex');
  return `ts=${ts};h1=${h1}`;
}

describe('verifyPaddleSignature', () => {
  const rawBody = JSON.stringify({ event_id: 'evt_1', event_type: 'transaction.completed' });

  it('accepts a correctly signed, fresh request', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const ts = Math.floor(now.getTime() / 1000);
    const header = sign(rawBody, ts);
    expect(verifyPaddleSignature(rawBody, header, SECRET, now)).toEqual({ valid: true });
  });

  it('rejects a missing header', () => {
    expect(verifyPaddleSignature(rawBody, null, SECRET)).toMatchObject({ valid: false });
  });

  it('rejects a malformed header (missing h1)', () => {
    expect(verifyPaddleSignature(rawBody, 'ts=123', SECRET)).toMatchObject({ valid: false });
  });

  it('rejects a non-numeric timestamp', () => {
    expect(verifyPaddleSignature(rawBody, 'ts=notanumber;h1=aa', SECRET)).toMatchObject({ valid: false });
  });

  it('rejects a signature computed with the wrong secret', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const ts = Math.floor(now.getTime() / 1000);
    const header = sign(rawBody, ts, 'wrong-secret');
    expect(verifyPaddleSignature(rawBody, header, SECRET, now)).toMatchObject({ valid: false, reason: 'signature mismatch' });
  });

  it('rejects a signature computed over a different body (tamper detection)', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const ts = Math.floor(now.getTime() / 1000);
    const header = sign(rawBody, ts);
    const tamperedBody = JSON.stringify({ event_id: 'evt_1', event_type: 'transaction.refunded' });
    expect(verifyPaddleSignature(tamperedBody, header, SECRET, now)).toMatchObject({ valid: false, reason: 'signature mismatch' });
  });

  it('rejects a timestamp older than the allowed window', () => {
    const now = new Date('2026-01-01T00:10:01Z'); // 601s after ts=0 baseline below
    const ts = Math.floor(new Date('2026-01-01T00:00:00Z').getTime() / 1000);
    const header = sign(rawBody, ts);
    expect(verifyPaddleSignature(rawBody, header, SECRET, now)).toMatchObject({ valid: false });
  });

  it('accepts a timestamp within the allowed window', () => {
    const now = new Date('2026-01-01T00:04:00Z'); // 240s after ts baseline
    const ts = Math.floor(new Date('2026-01-01T00:00:00Z').getTime() / 1000);
    const header = sign(rawBody, ts);
    expect(verifyPaddleSignature(rawBody, header, SECRET, now)).toEqual({ valid: true });
  });

  it('rejects an h1 of a different length than expected (no length-mismatch crash)', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const ts = Math.floor(now.getTime() / 1000);
    expect(verifyPaddleSignature(rawBody, `ts=${ts};h1=aa`, SECRET, now)).toMatchObject({ valid: false, reason: 'signature mismatch' });
  });
});

describe('createPaddleTransaction', () => {
  it('posts the expected request and returns the checkout URL', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.paddle.com/transactions');
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({ Authorization: 'Bearer test-key' });
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({
        items: [{ price_id: 'pri_123', quantity: 1 }],
        custom_data: { teaserAuditId: 'audit-1' },
      });
      return new Response(
        JSON.stringify({ data: { id: 'txn_1', checkout: { url: 'https://checkout.paddle.com/x' } } }),
        { status: 200 },
      );
    });

    const result = await createPaddleTransaction(
      { apiKey: 'test-key', fetch: fetchMock as unknown as typeof fetch },
      { priceId: 'pri_123', customData: { teaserAuditId: 'audit-1' } },
    );

    expect(result).toEqual({ transactionId: 'txn_1', checkoutUrl: 'https://checkout.paddle.com/x' });
  });

  it('throws a readable error on a non-ok response', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 422 }));
    await expect(
      createPaddleTransaction(
        { apiKey: 'k', fetch: fetchMock as unknown as typeof fetch },
        { priceId: 'pri_123', customData: {} },
      ),
    ).rejects.toThrow('Paddle API error: 422');
  });

  it('throws when the response has no checkout.url', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { id: 'txn_1' } }), { status: 200 }));
    await expect(
      createPaddleTransaction(
        { apiKey: 'k', fetch: fetchMock as unknown as typeof fetch },
        { priceId: 'pri_123', customData: {} },
      ),
    ).rejects.toThrow('checkout.url');
  });
});

describe('createPaddleRefund', () => {
  it('posts the expected adjustment request', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.paddle.com/adjustments');
      const body = JSON.parse(init.body as string);
      // `type: 'full'` is required: Paddle defaults to `partial`, which then
      // demands an `items` array and rejects the request outright.
      expect(body).toEqual({
        action: 'refund',
        type: 'full',
        transaction_id: 'txn_1',
        reason: 'admin refund',
      });
      return new Response(JSON.stringify({ data: { id: 'adj_1' } }), { status: 200 });
    });

    const result = await createPaddleRefund(
      { apiKey: 'k', fetch: fetchMock as unknown as typeof fetch },
      { transactionId: 'txn_1', reason: 'admin refund' },
    );
    expect(result).toEqual({ adjustmentId: 'adj_1' });
  });

  it('throws a readable error on a non-ok response', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 500 }));
    await expect(
      createPaddleRefund(
        { apiKey: 'k', fetch: fetchMock as unknown as typeof fetch },
        { transactionId: 'txn_1', reason: 'x' },
      ),
    ).rejects.toThrow('Paddle API error: 500');
  });
});

describe('getPaddleCustomerEmail', () => {
  it('fetches and returns the customer email', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.paddle.com/customers/ctm_1');
      expect(init.headers).toMatchObject({ Authorization: 'Bearer k' });
      return new Response(JSON.stringify({ data: { email: 'buyer@example.com' } }), { status: 200 });
    });

    const email = await getPaddleCustomerEmail({ apiKey: 'k', fetch: fetchMock as unknown as typeof fetch }, 'ctm_1');
    expect(email).toBe('buyer@example.com');
  });

  it('throws a readable error on a non-ok response', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 404 }));
    await expect(
      getPaddleCustomerEmail({ apiKey: 'k', fetch: fetchMock as unknown as typeof fetch }, 'ctm_missing'),
    ).rejects.toThrow('Paddle API error: 404');
  });
});
