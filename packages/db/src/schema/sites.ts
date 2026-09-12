import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { audits } from './audits';

const now = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const sites = pgTable('sites', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditId: uuid('audit_id').notNull().references(() => audits.id, { onDelete: 'cascade' }),
  domain: varchar('domain', { length: 253 }).notNull(),
  normalizedUrl: text('normalized_url').notNull(),
  robotsTxt: text('robots_txt'),
  sitemapUrls: jsonb('sitemap_urls').notNull().default([]),
  stepVersion: varchar('step_version', { length: 32 }).notNull(),
  crawledAt: timestamp('crawled_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: now(),
});

export const pages = pgTable('pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  auditId: uuid('audit_id').notNull().references(() => audits.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  htmlSnapshotRef: text('html_snapshot_ref'),
  htmlSize: integer('html_size'),
  htmlHash: varchar('html_hash', { length: 64 }),
  renderedHtmlRef: text('rendered_html_ref'),
  statusCode: integer('status_code'),
  wordCount: integer('word_count'),
  hasStructuredData: boolean('has_structured_data').notNull().default(false),
  stepVersion: varchar('step_version', { length: 32 }).notNull(),
  crawledAt: timestamp('crawled_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: now(),
});

export const sitesRelations = relations(sites, ({ one, many }) => ({
  audit: one(audits, { fields: [sites.auditId], references: [audits.id] }),
  pages: many(pages),
}));

export const pagesRelations = relations(pages, ({ one }) => ({
  site: one(sites, { fields: [pages.siteId], references: [sites.id] }),
  audit: one(audits, { fields: [pages.auditId], references: [audits.id] }),
}));
