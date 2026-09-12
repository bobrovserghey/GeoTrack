import {
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { audits } from './audits';

const now = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const passports = pgTable('passports', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditId: uuid('audit_id').notNull().references(() => audits.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 256 }).notNull(),
  description: text('description').notNull(),
  categoryHint: varchar('category_hint', { length: 128 }),
  valueProps: jsonb('value_props').notNull().default([]),
  targetAudience: jsonb('target_audience').notNull().default({}),
  storageRef: text('storage_ref'),
  stepVersion: varchar('step_version', { length: 32 }).notNull(),
  createdAt: now(),
});

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditId: uuid('audit_id').notNull().references(() => audits.id, { onDelete: 'cascade' }),
  slug: varchar('slug', { length: 128 }).notNull(),
  name: varchar('name', { length: 256 }).notNull(),
  confidence: numeric('confidence', { precision: 5, scale: 4 }).notNull(),
  autoSelected: integer('auto_selected').notNull().default(0),
  selectedByUser: integer('selected_by_user').notNull().default(0),
  stepVersion: varchar('step_version', { length: 32 }).notNull(),
  createdAt: now(),
});

export const competitors = pgTable('competitors', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditId: uuid('audit_id').notNull().references(() => audits.id, { onDelete: 'cascade' }),
  domain: varchar('domain', { length: 253 }).notNull(),
  name: varchar('name', { length: 256 }).notNull(),
  source: varchar('source', { length: 64 }).notNull(),
  stepVersion: varchar('step_version', { length: 32 }).notNull(),
  createdAt: now(),
});

export const promptTypeEnum = pgEnum('prompt_type', [
  'discovery',
  'comparison',
  'problem_led',
  'brand',
]);

export const prompts = pgTable('prompts', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditId: uuid('audit_id').notNull().references(() => audits.id, { onDelete: 'cascade' }),
  promptType: promptTypeEnum('prompt_type').notNull(),
  text: text('text').notNull(),
  locale: varchar('locale', { length: 8 }).notNull().default('en'),
  categorySlug: varchar('category_slug', { length: 128 }).notNull(),
  stepVersion: varchar('step_version', { length: 32 }).notNull(),
  createdAt: now(),
});

export const engineEnum = pgEnum('engine', ['perplexity', 'chatgpt', 'gemini']);

export const engineRuns = pgTable('engine_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditId: uuid('audit_id').notNull().references(() => audits.id, { onDelete: 'cascade' }),
  engine: engineEnum('engine').notNull(),
  promptId: uuid('prompt_id').notNull().references(() => prompts.id),
  repeatIndex: integer('repeat_index').notNull().default(0),
  responseTextRef: text('response_text_ref'),
  responseTextPreview: varchar('response_text_preview', { length: 500 }),
  sources: jsonb('sources').notNull().default([]),
  usageTokensIn: integer('usage_tokens_in').notNull().default(0),
  usageTokensOut: integer('usage_tokens_out').notNull().default(0),
  costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull().default('0'),
  latencyMs: integer('latency_ms'),
  stepVersion: varchar('step_version', { length: 32 }).notNull(),
  createdAt: now(),
});

export const sentimentEnum = pgEnum('sentiment', ['positive', 'neutral', 'negative']);

export const mentions = pgTable('mentions', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditId: uuid('audit_id').notNull().references(() => audits.id, { onDelete: 'cascade' }),
  engineRunId: uuid('engine_run_id').notNull().references(() => engineRuns.id),
  brand: varchar('brand', { length: 256 }).notNull(),
  position: integer('position'),
  sentiment: sentimentEnum('sentiment').notNull(),
  claims: jsonb('claims').notNull().default([]),
  stepVersion: varchar('step_version', { length: 32 }).notNull(),
  createdAt: now(),
});

export const passportsRelations = relations(passports, ({ one }) => ({
  audit: one(audits, { fields: [passports.auditId], references: [audits.id] }),
}));

export const categoriesRelations = relations(categories, ({ one }) => ({
  audit: one(audits, { fields: [categories.auditId], references: [audits.id] }),
}));

export const competitorsRelations = relations(competitors, ({ one }) => ({
  audit: one(audits, { fields: [competitors.auditId], references: [audits.id] }),
}));

export const promptsRelations = relations(prompts, ({ one, many }) => ({
  audit: one(audits, { fields: [prompts.auditId], references: [audits.id] }),
  engineRuns: many(engineRuns),
}));

export const engineRunsRelations = relations(engineRuns, ({ one, many }) => ({
  audit: one(audits, { fields: [engineRuns.auditId], references: [audits.id] }),
  prompt: one(prompts, { fields: [engineRuns.promptId], references: [prompts.id] }),
  mentions: many(mentions),
}));

export const mentionsRelations = relations(mentions, ({ one }) => ({
  audit: one(audits, { fields: [mentions.auditId], references: [audits.id] }),
  engineRun: one(engineRuns, { fields: [mentions.engineRunId], references: [engineRuns.id] }),
}));
