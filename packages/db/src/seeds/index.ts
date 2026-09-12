import type { InsertUser, InsertAudit, InsertAuditEvent, InsertSite } from '../zod/index';

export const seedUsers: InsertUser[] = [
  {
    email: 'seed-user-1@example.com',
  },
  {
    email: 'seed-user-2@example.com',
  },
];

export const seedAudits: Omit<InsertAudit, 'userId'>[] = [
  {
    domain: 'notion.so',
    url: 'https://notion.so',
    status: 'completed',
    auditType: 'teaser',
    profileId: 'teaser',
    profileVersion: 1,
    isInternal: true,
    locale: 'en',
    methodologyVersion: '1.0',
    promptSetVersion: 'v1',
    costUsd: '0.08',
  },
  {
    domain: 'linear.app',
    url: 'https://linear.app',
    status: 'queued',
    auditType: 'standard',
    profileId: 'standard',
    profileVersion: 1,
    isInternal: true,
    locale: 'en',
    methodologyVersion: '1.0',
    promptSetVersion: 'v1',
    costUsd: '0',
  },
  {
    domain: 'vercel.com',
    url: 'https://vercel.com',
    status: 'running',
    auditType: 'teaser',
    profileId: 'teaser',
    profileVersion: 1,
    isInternal: true,
    locale: 'en',
    methodologyVersion: '1.0',
    promptSetVersion: 'v1',
    costUsd: '0',
  },
];

export const seedSites: Omit<InsertSite, 'auditId'>[] = [
  {
    domain: 'notion.so',
    normalizedUrl: 'https://notion.so',
    robotsTxt: 'User-agent: *\nDisallow: /api/',
    sitemapUrls: ['https://notion.so/sitemap.xml'],
    stepVersion: '1.0',
  },
  {
    domain: 'linear.app',
    normalizedUrl: 'https://linear.app',
    robotsTxt: 'User-agent: *\nDisallow: /graphql',
    sitemapUrls: ['https://linear.app/sitemap.xml'],
    stepVersion: '1.0',
  },
  {
    domain: 'vercel.com',
    normalizedUrl: 'https://vercel.com',
    robotsTxt: 'User-agent: *\nDisallow: /api/',
    sitemapUrls: ['https://vercel.com/sitemap.xml'],
    stepVersion: '1.0',
  },
];

export const seedAuditEvents: Omit<InsertAuditEvent, 'auditId'>[] = [
  {
    seq: 1,
    eventType: 'audit.started',
    payload: { step: 'site.crawl' },
  },
  {
    seq: 2,
    eventType: 'step.completed',
    payload: { step: 'site.crawl', pagesFound: 3 },
  },
  {
    seq: 3,
    eventType: 'audit.completed',
    payload: { totalCostUsd: '0.08' },
  },
];
