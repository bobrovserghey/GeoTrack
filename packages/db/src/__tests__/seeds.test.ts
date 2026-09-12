import { describe, it, expect } from 'vitest';
import { seedUsers, seedAudits, seedSites, seedAuditEvents } from '../seeds/index';
import { insertUserSchema, insertAuditSchema, insertAuditEventSchema } from '../zod/index';
import { createInsertSchema } from 'drizzle-zod';
import { sites } from '../schema/sites';

const insertSiteSchema = createInsertSchema(sites);

describe('seed data', () => {
  it('all seed users parse with insertUserSchema', () => {
    for (const user of seedUsers) {
      expect(insertUserSchema.safeParse(user).success, `user ${user.email}`).toBe(true);
    }
  });

  it('all seed audits parse with insertAuditSchema', () => {
    for (const audit of seedAudits) {
      const result = insertAuditSchema.safeParse({
        ...audit,
        userId: '00000000-0000-0000-0000-000000000000',
      });
      expect(result.success, `audit ${audit.domain}: ${JSON.stringify(result)}`).toBe(true);
    }
  });

  it('all seed sites parse with insertSiteSchema', () => {
    for (const site of seedSites) {
      const result = insertSiteSchema.safeParse({
        ...site,
        auditId: '00000000-0000-0000-0000-000000000000',
      });
      expect(result.success, `site ${site.domain}`).toBe(true);
    }
  });

  it('all seed audit events parse with insertAuditEventSchema', () => {
    for (const event of seedAuditEvents) {
      const result = insertAuditEventSchema.safeParse({
        ...event,
        auditId: '00000000-0000-0000-0000-000000000000',
      });
      expect(result.success, `event seq ${event.seq}`).toBe(true);
    }
  });

  it('seed covers three distinct sites', () => {
    const domains = new Set(seedSites.map((s) => s.domain));
    expect(domains.size).toBe(3);
  });

  it('seed audits cover teaser and standard profiles', () => {
    const profileIds = new Set(seedAudits.map((a) => a.profileId));
    expect(profileIds.has('teaser')).toBe(true);
    expect(profileIds.has('standard')).toBe(true);
  });
});
