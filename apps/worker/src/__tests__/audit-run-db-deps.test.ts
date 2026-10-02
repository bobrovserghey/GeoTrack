import { describe, it, expect, vi } from 'vitest';
import type { DbClient } from '@geotrack/db/client';
import { createAuditRunDeps } from '../deps/audit-run-deps.js';
import { StatusConflictError } from '../functions/audit-run-handler.js';

// A thenable chain stand-in for drizzle's query builder: every builder method
// returns the chain, awaiting it yields the configured rows. The SQL itself
// (the `WHERE status = from` predicate) cannot be evaluated by a fake — it is
// asserted through what the code does with the result (0 rows → conflict) and
// verified against a real database separately.
function chain(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'limit', 'set', 'values', 'returning']) c[m] = vi.fn(() => c);
  c['then'] = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return c as Record<string, ReturnType<typeof vi.fn>> & PromiseLike<unknown>;
}

type Script = {
  selectRows?: unknown[][];       // consumed in order by select()
  updateRows?: unknown[];         // rows returned by UPDATE ... RETURNING
  insertFailures?: unknown[];     // errors thrown by successive inserts before one succeeds
};

function makeDb(script: Script) {
  const selects = [...(script.selectRows ?? [])];
  const inserted: Array<Record<string, unknown>> = [];
  const failures = [...(script.insertFailures ?? [])];
  let transactions = 0;

  const insertChain = () => {
    const c = chain([]);
    c['values'] = vi.fn((v: Record<string, unknown>) => {
      const failure = failures.shift();
      if (failure !== undefined) return Promise.reject(failure);
      inserted.push(v);
      return Promise.resolve();
    });
    return c;
  };
  const tx = {
    select: vi.fn(() => chain(selects.shift() ?? [])),
    update: vi.fn(() => chain(script.updateRows ?? [])),
    insert: vi.fn(insertChain),
  };
  const db = {
    select: vi.fn(() => chain(selects.shift() ?? [])),
    transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
      transactions++;
      return fn(tx);
    }),
  };
  return { db: db as unknown as DbClient, tx, inserted, transactions: () => transactions };
}

describe('createAuditRunDeps — status reads', () => {
  it('getAuditStatus returns the stored status and throws for an unknown audit', async () => {
    const found = makeDb({ selectRows: [[{ status: 'running' }]] });
    expect(await createAuditRunDeps(found.db).getAuditStatus('a')).toBe('running');
    const missing = makeDb({ selectRows: [[]] });
    await expect(createAuditRunDeps(missing.db).getAuditStatus('a')).rejects.toThrow('not found');
  });

  it('getAuditIsPaid: anything that is not a teaser is paid', async () => {
    for (const [auditType, expected] of [['teaser', false], ['standard', true], ['extended', true]] as const) {
      const { db } = makeDb({ selectRows: [[{ auditType }]] });
      expect(await createAuditRunDeps(db).getAuditIsPaid('a')).toBe(expected);
    }
  });

  it('getAuditEmailNormalized returns null when the audit has no email', async () => {
    expect(await createAuditRunDeps(makeDb({ selectRows: [[{ email: null }]] }).db).getAuditEmailNormalized('a')).toBeNull();
    expect(await createAuditRunDeps(makeDb({ selectRows: [[]] }).db).getAuditEmailNormalized('a')).toBeNull();
    expect(await createAuditRunDeps(makeDb({ selectRows: [[{ email: 'x@y.com' }]] }).db).getAuditEmailNormalized('a')).toBe('x@y.com');
  });
});

describe('createAuditRunDeps — transitionStatus (compare-and-set)', () => {
  it('writes the status change and its event in one transaction, with the next seq', async () => {
    const { db, inserted, transactions } = makeDb({ updateRows: [{ id: 'a' }], selectRows: [[{ maxSeq: 4 }]] });
    await createAuditRunDeps(db).transitionStatus('a', 'queued', 'running', { to: 'running' });
    expect(transactions()).toBe(1);
    expect(inserted).toEqual([
      { auditId: 'a', seq: 5, eventType: 'status.changed', payload: { from: 'queued', to: 'running' } },
    ]);
  });

  it('starts the sequence at 0 for an audit without events', async () => {
    const { db, inserted } = makeDb({ updateRows: [{ id: 'a' }], selectRows: [[{ maxSeq: null }]] });
    await createAuditRunDeps(db).transitionStatus('a', 'queued', 'running', {});
    expect(inserted[0]?.['seq']).toBe(0);
  });

  it('throws StatusConflictError and writes no event when the audit is no longer in `from`', async () => {
    const { db, inserted } = makeDb({ updateRows: [] });
    await expect(createAuditRunDeps(db).transitionStatus('a', 'queued', 'running', {})).rejects.toBeInstanceOf(
      StatusConflictError,
    );
    expect(inserted).toHaveLength(0);
  });

  it('retries in a fresh transaction when (audit_id, seq) collides with a concurrent writer', async () => {
    const { db, inserted, transactions } = makeDb({
      updateRows: [{ id: 'a' }],
      selectRows: [[{ maxSeq: 1 }], [{ maxSeq: 2 }]],
      insertFailures: [{ code: '23505' }],
    });
    await createAuditRunDeps(db).transitionStatus('a', 'queued', 'running', {});
    expect(transactions()).toBe(2);
    expect(inserted.map((r) => r['seq'])).toEqual([3]);
  });

  it('gives up after repeated collisions and does not swallow other errors', async () => {
    const collide = makeDb({
      updateRows: [{ id: 'a' }],
      selectRows: [[{ maxSeq: 1 }], [{ maxSeq: 1 }], [{ maxSeq: 1 }]],
      insertFailures: [{ code: '23505' }, { code: '23505' }, { code: '23505' }],
    });
    await expect(createAuditRunDeps(collide.db).transitionStatus('a', 'queued', 'running', {})).rejects.toMatchObject({
      code: '23505',
    });
    const other = makeDb({ updateRows: [{ id: 'a' }], selectRows: [[{ maxSeq: 1 }]], insertFailures: [new Error('connection reset')] });
    await expect(createAuditRunDeps(other.db).transitionStatus('a', 'queued', 'running', {})).rejects.toThrow('connection reset');
    expect(other.transactions()).toBe(1);
  });
});

describe('createAuditRunDeps — insertAuditEvent and the disposable check', () => {
  it('appends an event with the next seq', async () => {
    const { db, inserted } = makeDb({ selectRows: [[{ maxSeq: 9 }]] });
    await createAuditRunDeps(db).insertAuditEvent('a', 'step.started', { step: 'crawl' });
    expect(inserted).toEqual([{ auditId: 'a', seq: 10, eventType: 'step.started', payload: { step: 'crawl' } }]);
  });

  it('blocks a disposable domain and an address without MX, allows a normal one', async () => {
    const { db } = makeDb({});
    const resolveMx = vi.fn(async (domain: string) => (domain === 'nomx.example' ? [] : ['mx.' + domain]));
    const deps = createAuditRunDeps(db, resolveMx);
    expect(await deps.checkDisposableEmail('x@mailinator.com')).toMatchObject({ blocked: true, reason: 'disposable' });
    expect(await deps.checkDisposableEmail('x@nomx.example')).toMatchObject({ blocked: true, reason: 'no_mx' });
    expect(await deps.checkDisposableEmail('x@company.com')).toEqual({ blocked: false });
  });
});
