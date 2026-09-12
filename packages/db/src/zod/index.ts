import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import {
  audits,
  auditEvents,
  users,
  orders,
  payments,
  reportTokens,
} from '../schema/audits';
import { sites, pages } from '../schema/sites';
import {
  passports,
  categories,
  competitors,
  prompts,
  engineRuns,
  mentions,
} from '../schema/pipeline';
import { techChecks, offsiteSignals, agentRuns, scores, findings } from '../schema/measurements';
import { categoryCache } from '../schema/cache';

export const selectUserSchema = createSelectSchema(users);
export const insertUserSchema = createInsertSchema(users);

export const selectAuditSchema = createSelectSchema(audits);
export const insertAuditSchema = createInsertSchema(audits);

export const selectAuditEventSchema = createSelectSchema(auditEvents);
export const insertAuditEventSchema = createInsertSchema(auditEvents).refine(
  (data) => data.seq >= 0,
  { message: 'seq must be non-negative', path: ['seq'] },
);

export const selectOrderSchema = createSelectSchema(orders);
export const insertOrderSchema = createInsertSchema(orders);

export const selectPaymentSchema = createSelectSchema(payments);
export const insertPaymentSchema = createInsertSchema(payments);

export const selectReportTokenSchema = createSelectSchema(reportTokens);
export const insertReportTokenSchema = createInsertSchema(reportTokens);

export const selectSiteSchema = createSelectSchema(sites);
export const insertSiteSchema = createInsertSchema(sites);

export const selectPageSchema = createSelectSchema(pages);
export const insertPageSchema = createInsertSchema(pages);

export const selectPassportSchema = createSelectSchema(passports);
export const insertPassportSchema = createInsertSchema(passports);

export const selectCategorySchema = createSelectSchema(categories);
export const insertCategorySchema = createInsertSchema(categories);

export const selectCompetitorSchema = createSelectSchema(competitors);
export const insertCompetitorSchema = createInsertSchema(competitors);

export const selectPromptSchema = createSelectSchema(prompts);
export const insertPromptSchema = createInsertSchema(prompts);

export const selectEngineRunSchema = createSelectSchema(engineRuns);
export const insertEngineRunSchema = createInsertSchema(engineRuns);

export const selectMentionSchema = createSelectSchema(mentions);
export const insertMentionSchema = createInsertSchema(mentions);

export const selectTechCheckSchema = createSelectSchema(techChecks);
export const insertTechCheckSchema = createInsertSchema(techChecks);

export const selectOffsiteSignalSchema = createSelectSchema(offsiteSignals);
export const insertOffsiteSignalSchema = createInsertSchema(offsiteSignals);

export const selectAgentRunSchema = createSelectSchema(agentRuns);
export const insertAgentRunSchema = createInsertSchema(agentRuns);

export const selectScoreSchema = createSelectSchema(scores);
export const insertScoreSchema = createInsertSchema(scores);

export const selectFindingSchema = createSelectSchema(findings);
export const insertFindingSchema = createInsertSchema(findings);

export const selectCategoryCacheSchema = createSelectSchema(categoryCache);
export const insertCategoryCacheSchema = createInsertSchema(categoryCache);

export type SelectUser = typeof selectUserSchema._type;
export type InsertUser = typeof insertUserSchema._type;
export type SelectAudit = typeof selectAuditSchema._type;
export type InsertAudit = typeof insertAuditSchema._type;
export type SelectAuditEvent = typeof selectAuditEventSchema._type;
export type InsertAuditEvent = typeof insertAuditEventSchema._type;
export type SelectOrder = typeof selectOrderSchema._type;
export type SelectSite = typeof selectSiteSchema._type;
export type InsertSite = typeof insertSiteSchema._type;
export type SelectPage = typeof selectPageSchema._type;
export type SelectPassport = typeof selectPassportSchema._type;
export type SelectCategory = typeof selectCategorySchema._type;
export type SelectEngineRun = typeof selectEngineRunSchema._type;
export type SelectMention = typeof selectMentionSchema._type;
export type SelectScore = typeof selectScoreSchema._type;
export type SelectFinding = typeof selectFindingSchema._type;
