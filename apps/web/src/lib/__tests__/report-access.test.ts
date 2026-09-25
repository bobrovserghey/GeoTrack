import { describe, it, expect } from 'vitest';
import { hashReportToken } from '@geotrack/core';
import { isValidReportToken } from '../report-access.js';

type Row = { id: string; expiresAt: Date | null };

/** Minimal stand-in for the drizzle query chain used by isValidReportToken. */
function fakeDb(rows: Row[]) {
  const calls: unknown[] = [];
  const chain = {
    select: () => chain,
    from: () => chain,
    where: (cond: unknown) => {
      calls.push(cond);
      return chain;
    },
    limit: async () => rows,
  };
  return { db: chain as never, calls };
}

/** Collects every string reachable from a drizzle SQL condition tree (cyclic). */
function collectStrings(value: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<unknown>();
  const walk = (v: unknown) => {
    if (typeof v === 'string') {
      out.push(v);
      return;
    }
    if (v === null || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    for (const inner of Object.values(v as Record<string, unknown>)) walk(inner);
  };
  walk(value);
  return out;
}

const AUDIT_ID = '00000000-0000-0000-0000-000000000001';

describe('isValidReportToken', () => {
  it('returns false for a missing token without touching the database', async () => {
    const { db, calls } = fakeDb([{ id: 'r1', expiresAt: null }]);
    expect(await isValidReportToken(db, AUDIT_ID, undefined)).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('returns false when no token row matches', async () => {
    const { db } = fakeDb([]);
    expect(await isValidReportToken(db, AUDIT_ID, 'wrong-token')).toBe(false);
  });

  it('returns true for a matching token without expiry', async () => {
    const { db } = fakeDb([{ id: 'r1', expiresAt: null }]);
    expect(await isValidReportToken(db, AUDIT_ID, 'good-token')).toBe(true);
  });

  it('returns true for a matching token that has not expired yet', async () => {
    const { db } = fakeDb([{ id: 'r1', expiresAt: new Date(Date.now() + 60_000) }]);
    expect(await isValidReportToken(db, AUDIT_ID, 'good-token')).toBe(true);
  });

  it('returns false for an expired token', async () => {
    const { db } = fakeDb([{ id: 'r1', expiresAt: new Date(Date.now() - 60_000) }]);
    expect(await isValidReportToken(db, AUDIT_ID, 'good-token')).toBe(false);
  });

  it('looks the token up by its sha256 hash, never by the raw value', async () => {
    const { db, calls } = fakeDb([{ id: 'r1', expiresAt: null }]);
    await isValidReportToken(db, AUDIT_ID, 'secret-token');
    const bound = collectStrings(calls);
    expect(bound).not.toContain('secret-token');
    expect(bound).toContain(hashReportToken('secret-token'));
  });
});
