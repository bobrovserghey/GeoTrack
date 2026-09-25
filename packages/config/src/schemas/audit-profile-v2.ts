import { z } from 'zod';

const EngineIdSchema = z.enum(['perplexity', 'chatgpt', 'gemini']);

const PromptCountByClassSchema = z.object({
  category: z.number().int().min(0),
  brand: z.number().int().min(0),
  client: z.number().int().min(0),
});

const AdditionalLocalePromptsSchema = z.object({
  category: z.number().int().min(0),
  brand: z.number().int().min(0),
});

const NoSearchCountByClassSchema = z.object({
  discovery: z.number().int().min(0),
  brand: z.number().int().min(0),
});

const AuditProfileV2Shape = z.object({
  id: z.string(),
  version: z.literal(2),
  crawlerPages: z.number().int().positive(),
  engines: z.array(EngineIdSchema).min(1),
  /** Maximum number of locales (1 for teaser/standard, up to 3 for extended). */
  locales: z.number().int().min(1).max(3),
  promptsWithSearch: PromptCountByClassSchema,
  /** Prompt counts per additional locale (extended only; 0s for other profiles). */
  promptsWithSearchAdditionalLocale: AdditionalLocalePromptsSchema,
  promptsWithoutSearch: NoSearchCountByClassSchema,
  /** Engines that support no-search mode for this profile. */
  noSearchEngines: z.array(EngineIdSchema),
  promptRepeats: z.number().int().positive(),
  competitorCount: z.number().int().min(0),
  pillars: z.array(z.string()).min(1),
  findingCount: z.number().int().positive(),
  manualReview: z.boolean(),
  pdf: z.boolean(),
  serpApiRequests: z.number().int().min(0),
  /** SerpAPI requests used by the client-prompt generation step. */
  serpApiRequestsClient: z.number().int().min(0),
  costSoftCeilingUsd: z.number().positive(),
  costHardCeilingUsd: z.number().positive(),
  /** Added to soft/hard ceilings for each additional locale beyond the first. */
  costSoftCeilingPerAdditionalLocaleUsd: z.number().min(0),
  costHardCeilingPerAdditionalLocaleUsd: z.number().min(0),
  timeBudgetSeconds: z.number().int().positive(),
  /** Added to time budget for each additional locale beyond the first. */
  timeBudgetPerAdditionalLocaleSeconds: z.number().int().min(0),
});

export const AuditProfileV2Schema = AuditProfileV2Shape.superRefine((profile, ctx) => {
  // A hard ceiling that is not strictly above the soft ceiling makes the soft
  // ceiling meaningless: the run would be killed before it could ever warn.
  if (profile.costHardCeilingUsd <= profile.costSoftCeilingUsd) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['costHardCeilingUsd'],
      message:
        `costHardCeilingUsd (${profile.costHardCeilingUsd}) must be greater than ` +
        `costSoftCeilingUsd (${profile.costSoftCeilingUsd})`,
    });
  }

  // Per-locale surcharges may both be 0 (teaser/standard), so equality is allowed.
  if (
    profile.costHardCeilingPerAdditionalLocaleUsd < profile.costSoftCeilingPerAdditionalLocaleUsd
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['costHardCeilingPerAdditionalLocaleUsd'],
      message:
        `costHardCeilingPerAdditionalLocaleUsd (${profile.costHardCeilingPerAdditionalLocaleUsd}) ` +
        `must be greater than or equal to costSoftCeilingPerAdditionalLocaleUsd ` +
        `(${profile.costSoftCeilingPerAdditionalLocaleUsd})`,
    });
  }

  // No-search mode can only be requested from an engine the profile actually queries.
  const engines = new Set<string>(profile.engines);
  profile.noSearchEngines.forEach((engine, index) => {
    if (!engines.has(engine)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['noSearchEngines', index],
        message: `noSearchEngines contains "${engine}" which is not in engines`,
      });
    }
  });
});

export const AuditProfilesV2FileSchema = z.object({
  version: z.literal(2),
  profiles: z.record(AuditProfileV2Schema),
});

export type AuditProfileV2 = z.infer<typeof AuditProfileV2Schema>;
export type AuditProfileV2Id = 'teaser' | 'standard' | 'extended';
