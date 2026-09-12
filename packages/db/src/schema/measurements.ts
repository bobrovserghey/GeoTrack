import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { audits } from './audits';

const now = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const techChecks = pgTable('tech_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditId: uuid('audit_id').notNull().references(() => audits.id, { onDelete: 'cascade' }),
  criterion: varchar('criterion', { length: 8 }).notNull(),
  score: numeric('score', { precision: 5, scale: 4 }),
  measured: boolean('measured').notNull().default(true),
  details: jsonb('details').notNull().default({}),
  stepVersion: varchar('step_version', { length: 32 }).notNull(),
  createdAt: now(),
});

export const offsiteSignals = pgTable('offsite_signals', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditId: uuid('audit_id').notNull().references(() => audits.id, { onDelete: 'cascade' }),
  criterion: varchar('criterion', { length: 8 }).notNull(),
  score: numeric('score', { precision: 5, scale: 4 }),
  measured: boolean('measured').notNull().default(true),
  details: jsonb('details').notNull().default({}),
  stepVersion: varchar('step_version', { length: 32 }).notNull(),
  createdAt: now(),
});

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditId: uuid('audit_id').notNull().references(() => audits.id, { onDelete: 'cascade' }),
  scenario: varchar('scenario', { length: 64 }).notNull(),
  outcome: varchar('outcome', { length: 32 }).notNull(),
  screenshotRef: text('screenshot_ref'),
  details: jsonb('details').notNull().default({}),
  stepVersion: varchar('step_version', { length: 32 }).notNull(),
  createdAt: now(),
});

export const scores = pgTable('scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditId: uuid('audit_id').notNull().references(() => audits.id, { onDelete: 'cascade' }),
  scope: varchar('scope', { length: 16 }).notNull(),
  key: varchar('key', { length: 16 }).notNull(),
  score: numeric('score', { precision: 5, scale: 4 }).notNull(),
  confidenceLow: numeric('confidence_low', { precision: 5, scale: 4 }),
  confidenceHigh: numeric('confidence_high', { precision: 5, scale: 4 }),
  measured: boolean('measured').notNull().default(true),
  stepVersion: varchar('step_version', { length: 32 }).notNull(),
  createdAt: now(),
});

export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditId: uuid('audit_id').notNull().references(() => audits.id, { onDelete: 'cascade' }),
  criterionKey: varchar('criterion_key', { length: 16 }).notNull(),
  title: varchar('title', { length: 256 }).notNull(),
  description: text('description').notNull(),
  impact: varchar('impact', { length: 16 }).notNull(),
  effort: varchar('effort', { length: 16 }).notNull(),
  expectedScoreDelta: numeric('expected_score_delta', { precision: 5, scale: 4 }),
  templateId: varchar('template_id', { length: 64 }),
  priority: integer('priority').notNull().default(0),
  stepVersion: varchar('step_version', { length: 32 }).notNull(),
  createdAt: now(),
});

export const techChecksRelations = relations(techChecks, ({ one }) => ({
  audit: one(audits, { fields: [techChecks.auditId], references: [audits.id] }),
}));

export const offsiteSignalsRelations = relations(offsiteSignals, ({ one }) => ({
  audit: one(audits, { fields: [offsiteSignals.auditId], references: [audits.id] }),
}));

export const agentRunsRelations = relations(agentRuns, ({ one }) => ({
  audit: one(audits, { fields: [agentRuns.auditId], references: [audits.id] }),
}));

export const scoresRelations = relations(scores, ({ one }) => ({
  audit: one(audits, { fields: [scores.auditId], references: [audits.id] }),
}));

export const findingsRelations = relations(findings, ({ one }) => ({
  audit: one(audits, { fields: [findings.auditId], references: [audits.id] }),
}));
