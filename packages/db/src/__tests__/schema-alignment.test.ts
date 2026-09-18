import { describe, it, expect } from 'vitest';
import {
  selectAuditSchema,
  insertAuditSchema,
  selectUserSchema,
  insertUserSchema,
  selectAuditEventSchema,
  insertAuditEventSchema,
} from '../zod/index';

describe('Drizzle/Zod schema alignment', () => {
  it('selectAuditSchema parses a valid audit row', () => {
    const row = {
      id: '11111111-1111-1111-1111-111111111111',
      userId: null,
      domain: 'example.com',
      url: 'https://example.com',
      emailNormalized: null,
      status: 'queued' as const,
      auditType: 'teaser' as const,
      profileId: 'teaser',
      profileVersion: 1,
      parentAuditId: null,
      isInternal: false,
      locale: 'en',
      methodologyVersion: '1.0',
      promptSetVersion: null,
      costUsd: '0',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = selectAuditSchema.safeParse(row);
    expect(result.success).toBe(true);
  });

  it('insertAuditSchema requires domain, url, profileId, methodologyVersion', () => {
    const minimal = {
      domain: 'example.com',
      url: 'https://example.com',
      profileId: 'teaser',
      profileVersion: 1,
      methodologyVersion: '1.0',
    };

    const result = insertAuditSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it('insertAuditSchema rejects invalid status', () => {
    const bad = {
      domain: 'example.com',
      url: 'https://example.com',
      profileId: 'teaser',
      profileVersion: 1,
      methodologyVersion: '1.0',
      status: 'flying',
    };

    const result = insertAuditSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('selectUserSchema parses a valid user row', () => {
    const row = {
      id: '22222222-2222-2222-2222-222222222222',
      email: 'test@example.com',
      emailNormalized: null,
      emailVerified: false,
      verifiedAt: null,
      authProvider: null,
      createdAt: new Date(),
      deletedAt: null,
    };

    const result = selectUserSchema.safeParse(row);
    expect(result.success).toBe(true);
  });

  it('insertUserSchema requires email', () => {
    expect(insertUserSchema.safeParse({ email: 'test@example.com' }).success).toBe(true);
    expect(insertUserSchema.safeParse({}).success).toBe(false);
  });

  it('audit_events seq is a non-negative integer', () => {
    const valid = {
      id: '33333333-3333-3333-3333-333333333333',
      auditId: '11111111-1111-1111-1111-111111111111',
      seq: 1,
      eventType: 'audit.started',
      payload: {},
      createdAt: new Date(),
    };

    expect(selectAuditEventSchema.safeParse(valid).success).toBe(true);
  });

  it('insertAuditEventSchema rejects negative seq', () => {
    const bad = {
      auditId: '11111111-1111-1111-1111-111111111111',
      seq: -1,
      eventType: 'audit.started',
    };

    expect(insertAuditEventSchema.safeParse(bad).success).toBe(false);
  });

  it('audit status enum covers all lifecycle states', () => {
    const statuses = [
      'queued',
      'running',
      'waiting_category',
      'waiting_email',
      'completed',
      'in_review',
      'delivered',
      'needs_attention',
      'failed',
      'cancelled',
    ] as const;

    for (const status of statuses) {
      const result = insertAuditSchema.safeParse({
        domain: 'example.com',
        url: 'https://example.com',
        profileId: 'teaser',
        profileVersion: 1,
        methodologyVersion: '1.0',
        status,
      });
      expect(result.success, `status "${status}" should be valid`).toBe(true);
    }
  });
});
