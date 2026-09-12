import { z } from 'zod';

export const AuditProfileSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  crawlerPages: z.number().int().positive(),
  engines: z.array(z.enum(['perplexity', 'chatgpt', 'gemini'])).min(1),
  promptCount: z.number().int().positive(),
  promptRepeats: z.number().int().positive(),
  competitorCount: z.number().int().min(0),
  pillars: z.array(z.string()).min(1),
  findingCount: z.number().int().positive(),
  manualReview: z.boolean(),
  pdf: z.boolean(),
  serpApiRequests: z.number().int().min(0),
  costSoftCeilingUsd: z.number().positive(),
  costHardCeilingUsd: z.number().positive(),
  timeBudgetSeconds: z.number().int().positive(),
});

export const AuditProfilesFileSchema = z.object({
  version: z.number().int().positive(),
  profiles: z.record(AuditProfileSchema),
});

export type AuditProfile = z.infer<typeof AuditProfileSchema>;
export type AuditProfileId = 'teaser' | 'standard' | 'extended';
