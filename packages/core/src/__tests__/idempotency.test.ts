import { describe, it, expect } from 'vitest';
import { makeStepKey } from '../idempotency.js';

describe('makeStepKey', () => {
  it('returns deterministic key', () => {
    const input = { auditId: 'abc-123', stepName: 'site.crawl', stepVersion: '1.0' };
    expect(makeStepKey(input)).toBe('abc-123:site.crawl:1.0');
    expect(makeStepKey(input)).toBe(makeStepKey(input));
  });

  it('format is auditId:stepName:stepVersion', () => {
    const key = makeStepKey({ auditId: 'a', stepName: 'b', stepVersion: 'c' });
    const parts = key.split(':');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe('a');
    expect(parts[1]).toBe('b');
    expect(parts[2]).toBe('c');
  });

  it('different auditId → different key', () => {
    const k1 = makeStepKey({ auditId: 'audit-1', stepName: 'site.crawl', stepVersion: '1.0' });
    const k2 = makeStepKey({ auditId: 'audit-2', stepName: 'site.crawl', stepVersion: '1.0' });
    expect(k1).not.toBe(k2);
  });

  it('different stepName → different key', () => {
    const k1 = makeStepKey({ auditId: 'audit-1', stepName: 'site.crawl', stepVersion: '1.0' });
    const k2 = makeStepKey({ auditId: 'audit-1', stepName: 'engines.poll', stepVersion: '1.0' });
    expect(k1).not.toBe(k2);
  });

  it('different stepVersion → different key', () => {
    const k1 = makeStepKey({ auditId: 'audit-1', stepName: 'site.crawl', stepVersion: '1.0' });
    const k2 = makeStepKey({ auditId: 'audit-1', stepName: 'site.crawl', stepVersion: '2.0' });
    expect(k1).not.toBe(k2);
  });

  it('handles real uuid audit ids', () => {
    const key = makeStepKey({
      auditId: '550e8400-e29b-41d4-a716-446655440000',
      stepName: 'product.passport',
      stepVersion: '1.0',
    });
    expect(key).toBe('550e8400-e29b-41d4-a716-446655440000:product.passport:1.0');
  });
});
