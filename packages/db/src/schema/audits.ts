import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

const now = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const auditStatusEnum = pgEnum('audit_status', [
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
]);

export const auditTypeEnum = pgEnum('audit_type', ['teaser', 'standard', 'extended']);

export const authProviderEnum = pgEnum('auth_provider', ['magic_link', 'google', 'microsoft']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 254 }).notNull().unique(),
  emailNormalized: varchar('email_normalized', { length: 254 }),
  emailVerified: boolean('email_verified').notNull().default(false),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  authProvider: authProviderEnum('auth_provider'),
  createdAt: now(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const audits = pgTable('audits', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  domain: varchar('domain', { length: 253 }).notNull(),
  url: text('url').notNull(),
  emailNormalized: varchar('email_normalized', { length: 254 }),
  status: auditStatusEnum('status').notNull().default('queued'),
  auditType: auditTypeEnum('audit_type').notNull().default('teaser'),
  profileId: varchar('profile_id', { length: 64 }).notNull(),
  profileVersion: integer('profile_version').notNull(),
  parentAuditId: uuid('parent_audit_id').references((): AnyPgColumn => audits.id),
  isInternal: boolean('is_internal').notNull().default(false),
  locale: varchar('locale', { length: 8 }).notNull().default('en'),
  methodologyVersion: varchar('methodology_version', { length: 16 }).notNull(),
  promptSetVersion: varchar('prompt_set_version', { length: 64 }),
  costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull().default('0'),
  createdAt: now(),
  updatedAt: updatedAt(),
});

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditId: uuid('audit_id').notNull().references(() => audits.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  payload: jsonb('payload').notNull().default({}),
  createdAt: now(),
}, (t) => [
  unique('audit_events_audit_seq').on(t.auditId, t.seq),
]);

export const orderStatusEnum = pgEnum('order_status', ['pending', 'completed', 'refunded']);

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditId: uuid('audit_id').notNull().references(() => audits.id),
  userId: uuid('user_id').references(() => users.id),
  productId: varchar('product_id', { length: 128 }).notNull(),
  parentAuditId: uuid('parent_audit_id').references(() => audits.id),
  paddleEventId: varchar('paddle_event_id', { length: 128 }).notNull().unique(),
  amountUsd: numeric('amount_usd', { precision: 10, scale: 2 }).notNull(),
  status: orderStatusEnum('status').notNull().default('pending'),
  createdAt: now(),
});

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  paddleTransactionId: varchar('paddle_transaction_id', { length: 128 }).notNull().unique(),
  amountUsd: numeric('amount_usd', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 8 }).notNull().default('USD'),
  status: varchar('status', { length: 32 }).notNull(),
  payload: jsonb('payload').notNull().default({}),
  createdAt: now(),
});

export const reportTokenTypeEnum = pgEnum('report_token_type', ['report', 'progress']);

export const reportTokens = pgTable('report_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditId: uuid('audit_id').notNull().references(() => audits.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  tokenType: reportTokenTypeEnum('token_type').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: now(),
});

export const usersRelations = relations(users, ({ many }) => ({
  audits: many(audits),
  orders: many(orders),
}));

export const auditsRelations = relations(audits, ({ one, many }) => ({
  user: one(users, { fields: [audits.userId], references: [users.id] }),
  parent: one(audits, { fields: [audits.parentAuditId], references: [audits.id], relationName: 'parent_child' }),
  children: many(audits, { relationName: 'parent_child' }),
  events: many(auditEvents),
  orders: many(orders),
  reportTokens: many(reportTokens),
}));
