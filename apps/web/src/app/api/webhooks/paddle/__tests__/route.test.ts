import { createHmac } from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { audits, orders, payments, reportTokens, auditEvents } from '@geotrack/db';
// The route reads every environment variable it needs inside POST (never at module
// load), so a plain static import is enough here — vi.resetModules() would give
// the route a different @geotrack/db instance and break table identity in the
// fake client below.
import { POST } from '../route.js';

// T-45's headline acceptance criterion is "дубль события не создаёт второй
// аудит". That guarantee lives in the route (fast-path SELECT + unique index
// on orders.paddle_event_id + rollback of the losing transaction), so it is
// tested here against a fake drizzle client rather than only at the unit level.

const { sendMock, dbHolder } = vi.hoisted(() => ({
  sendMock: vi.fn(async () => undefined),
  dbHolder: { current: null as unknown },
}));

vi.mock('inngest', () => ({
  Inngest: class {
    send = sendMock;
  },
}));

vi.mock('@/lib/db', () => ({ getDb: () => dbHolder.current }));

const SECRET = 'whsec_test';
const PRICE_ID_STANDARD = 'pri_standard_test';
const TEASER_ID = '00000000-0000-0000-0000-00000000aaaa';

const TEASER_ROW = {
  id: TEASER_ID,
  domain: 'acme.com',
  domainNormalized: 'acme.com',
  url: 'https://acme.com',
  locale: 'en',
  emailNormalized: 'buyer@acme.com',
  userId: '00000000-0000-0000-0000-00000000cccc',
};

type Insert = { table: unknown; values: Record<string, unknown> };

type FakeOpts = {
  existingOrder?: boolean;
  teaser?: typeof TEASER_ROW | null;
  ordersInsertError?: unknown;
};

/** Minimal stand-in for the drizzle chain + transaction used by this route. */
function makeFakeDb(opts: FakeOpts) {
  const committed: Insert[] = [];
  let rolledBack = false;

  const rowsFor = (table: unknown): unknown[] => {
    if (table === orders) return opts.existingOrder ? [{ id: 'order-existing' }] : [];
    if (table === audits) return opts.teaser ? [opts.teaser] : [];
    if (table === auditEvents) return [{ maxSeq: null }];
    return [];
  };

  const idFor = (table: unknown): string => {
    if (table === audits) return '00000000-0000-0000-0000-00000000bbbb';
    if (table === orders) return 'order-new';
    return 'row-new';
  };

  function makeChain(record: (insert: Insert) => void) {
    let current: unknown = null;
    const chain: Record<string, unknown> = {
      select: () => chain,
      from: (t: unknown) => {
        current = t;
        return chain;
      },
      where: () => chain,
      orderBy: () => chain,
      limit: () => Promise.resolve(rowsFor(current)),
      // The max(seq) lookup awaits the builder directly, with no .limit().
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
        Promise.resolve(rowsFor(current)).then(res, rej),
      insert: (t: unknown) => ({
        values: (values: Record<string, unknown>) => {
          const run = () => {
            if (t === orders && opts.ordersInsertError) throw opts.ordersInsertError;
            record({ table: t, values });
          };
          return {
            returning: async () => {
              run();
              return [{ id: idFor(t) }];
            },
            then: (res: (v: unknown) => void, rej: (e: unknown) => void) => {
              try {
                run();
                res(undefined);
              } catch (err) {
                rej(err);
              }
            },
          };
        },
      }),
    };
    return chain;
  }

  const db = makeChain((insert) => committed.push(insert));
  // Models real rollback semantics: writes staged inside the callback are
  // only published if the callback resolves.
  (db as Record<string, unknown>).transaction = async (
    cb: (tx: unknown) => Promise<unknown>,
  ): Promise<unknown> => {
    const staged: Insert[] = [];
    const tx = makeChain((insert) => staged.push(insert));
    try {
      const result = await cb(tx);
      committed.push(...staged);
      return result;
    } catch (err) {
      rolledBack = true;
      throw err;
    }
  };

  return {
    db,
    committed,
    insertsInto: (table: unknown) => committed.filter((i) => i.table === table),
    wasRolledBack: () => rolledBack,
  };
}

function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
    event_id: 'evt_test_1',
    event_type: 'transaction.completed',
    data: {
      id: 'txn_test_1',
      customer_id: 'ctm_1',
      currency_code: 'USD',
      custom_data: { teaserAuditId: TEASER_ID },
      items: [{ price: { id: PRICE_ID_STANDARD } }],
      details: { totals: { total: '7900' } },
    },
    ...overrides,
  };
}

function signedRequest(body: unknown, { secret = SECRET } = {}): Request {
  const rawBody = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000);
  const h1 = createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest('hex');
  return new Request('https://geotrack.example/api/webhooks/paddle', {
    method: 'POST',
    headers: { 'paddle-signature': `ts=${ts};h1=${h1}`, 'content-type': 'application/json' },
    body: rawBody,
  });
}

beforeEach(() => {
  sendMock.mockClear();
  process.env.PADDLE_WEBHOOK_SECRET = SECRET;
  process.env.PADDLE_PRICE_ID_STANDARD = PRICE_ID_STANDARD;
  process.env.NEXT_PUBLIC_APP_URL = 'https://geotrack.example';
  // Left unset on purpose: the confirmation email must fail closed without any
  // network call, and the handler must still answer 200.
  delete process.env.PADDLE_API_KEY;
  delete process.env.RESEND_API_KEY;
});

describe('POST /api/webhooks/paddle', () => {
  it('creates exactly one paid audit, order, payment and report token on first delivery', async () => {
    const fake = makeFakeDb({ teaser: TEASER_ROW });
    dbHolder.current = fake.db;

    const res = await POST(signedRequest(buildEvent()));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });

    expect(fake.insertsInto(audits)).toHaveLength(1);
    expect(fake.insertsInto(orders)).toHaveLength(1);
    expect(fake.insertsInto(payments)).toHaveLength(1);
    expect(fake.insertsInto(reportTokens)).toHaveLength(1);
    expect(sendMock).toHaveBeenCalledTimes(1);

    const order = fake.insertsInto(orders)[0]!.values;
    // Price comes from the server-side map, never from the webhook payload.
    expect(order.amountUsd).toBe('79.00');
    expect(order.paddleEventId).toBe('evt_test_1');
    expect(order.userId).toBe(TEASER_ROW.userId);
    const audit = fake.insertsInto(audits)[0]!.values;
    expect(audit.parentAuditId).toBe(TEASER_ID);
    expect(audit.auditType).toBe('standard');
    // Carried over from the teaser, or the paying customer is shown the email
    // gate again on the report they just bought.
    expect(audit.emailNormalized).toBe('buyer@acme.com');
    expect(audit.userId).toBe(TEASER_ROW.userId);
  });

  it('acknowledges a signed event whose payload is missing the fields it needs', async () => {
    const fake = makeFakeDb({ teaser: TEASER_ROW });
    dbHolder.current = fake.db;

    // Signature valid, shape not what we expect: must be a clean 400, not a
    // TypeError-driven 500 that Paddle then retries forever. `data` is absent
    // entirely — the case that actually throws without the shape guard; a
    // payload with `data: {}` would be caught by the later teaserAuditId check
    // and would therefore not exercise the guard at all.
    const res = await POST(signedRequest({ event_id: 'evt_bad', event_type: 'transaction.completed' }));
    expect(res.status).toBe(400);
    expect(fake.insertsInto(audits)).toHaveLength(0);
  });

  it('refuses a payload whose ids are not strings instead of letting the insert fail', async () => {
    const fake = makeFakeDb({ teaser: TEASER_ROW });
    dbHolder.current = fake.db;

    const event = buildEvent();
    (event.data as { id: unknown }).id = 12345;
    const res = await POST(signedRequest(event));
    expect(res.status).toBe(400);
    expect(fake.insertsInto(audits)).toHaveLength(0);
  });

  it('does not create a second audit when the same event is delivered again', async () => {
    const fake = makeFakeDb({ existingOrder: true, teaser: TEASER_ROW });
    dbHolder.current = fake.db;

    const res = await POST(signedRequest(buildEvent()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, duplicate: true });

    expect(fake.insertsInto(audits)).toHaveLength(0);
    expect(fake.insertsInto(orders)).toHaveLength(0);
    expect(fake.insertsInto(payments)).toHaveLength(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('rolls the whole transaction back and acknowledges when it loses the insert race', async () => {
    // Both deliveries passed the fast-path SELECT; this one loses on the
    // unique index over orders.paddle_event_id (Postgres 23505).
    const uniqueViolation = Object.assign(new Error('duplicate key value'), { code: '23505' });
    const fake = makeFakeDb({ teaser: TEASER_ROW, ordersInsertError: uniqueViolation });
    dbHolder.current = fake.db;

    const res = await POST(signedRequest(buildEvent()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, duplicate: true });

    expect(fake.wasRolledBack()).toBe(true);
    // Critically: the audit inserted earlier in the same transaction must not
    // survive, or the duplicate delivery would still have created an audit.
    expect(fake.insertsInto(audits)).toHaveLength(0);
    expect(fake.insertsInto(reportTokens)).toHaveLength(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('returns 500 (so Paddle retries) on a database error that is not a unique violation', async () => {
    const fake = makeFakeDb({ teaser: TEASER_ROW, ordersInsertError: new Error('connection reset') });
    dbHolder.current = fake.db;

    const res = await POST(signedRequest(buildEvent()));
    expect(res.status).toBe(500);
    expect(fake.insertsInto(audits)).toHaveLength(0);
  });

  it('rejects an unsigned request without touching the database', async () => {
    const fake = makeFakeDb({ teaser: TEASER_ROW });
    dbHolder.current = fake.db;

    const rawBody = JSON.stringify(buildEvent());
    const res = await POST(
      new Request('https://geotrack.example/api/webhooks/paddle', { method: 'POST', body: rawBody }),
    );
    expect(res.status).toBe(401);
    expect(fake.committed).toHaveLength(0);
  });

  it('rejects a request signed with the wrong secret', async () => {
    const fake = makeFakeDb({ teaser: TEASER_ROW });
    dbHolder.current = fake.db;

    const res = await POST(signedRequest(buildEvent(), { secret: 'not-the-secret' }));
    expect(res.status).toBe(401);
    expect(fake.committed).toHaveLength(0);
  });

  it('fails closed with 500 when PADDLE_WEBHOOK_SECRET is not configured', async () => {
    delete process.env.PADDLE_WEBHOOK_SECRET;
    const fake = makeFakeDb({ teaser: TEASER_ROW });
    dbHolder.current = fake.db;

    const res = await POST(signedRequest(buildEvent()));
    expect(res.status).toBe(500);
    expect(fake.committed).toHaveLength(0);
  });

  it('refuses a price id that is not in the server-side price map', async () => {
    const fake = makeFakeDb({ teaser: TEASER_ROW });
    dbHolder.current = fake.db;

    const event = buildEvent();
    event.data.items = [{ price: { id: 'pri_attacker_chosen' } }];
    const res = await POST(signedRequest(event));
    expect(res.status).toBe(400);
    expect(fake.insertsInto(audits)).toHaveLength(0);
  });

  it('acknowledges event types it does not act on instead of making Paddle retry', async () => {
    const fake = makeFakeDb({ teaser: TEASER_ROW });
    dbHolder.current = fake.db;

    const res = await POST(signedRequest(buildEvent({ event_type: 'subscription.updated' })));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, ignored: 'subscription.updated' });
    expect(fake.committed).toHaveLength(0);
  });
});
