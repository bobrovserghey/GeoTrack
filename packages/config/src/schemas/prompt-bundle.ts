import { z } from 'zod';
import { PROMPT_TYPES, LOCALES } from './prompt-set.js';

export const PROFILE_IDS = ['teaser', 'standard', 'extended'] as const;
export type ProfileId = (typeof PROFILE_IDS)[number];

export const PROFILE_QUOTAS: Record<ProfileId, { categoryCount: number; brandCount: number }> = {
  teaser:   { categoryCount: 10, brandCount: 2  },
  standard: { categoryCount: 26, brandCount: 4  },
  extended: { categoryCount: 40, brandCount: 10 },
};

export const BUNDLED_PROMPT_TYPES = [...PROMPT_TYPES, 'brand'] as const;

export const BundledPromptEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  text: z.string().min(1),
  type: z.enum(BUNDLED_PROMPT_TYPES),
  priority: z.number().int().min(1),
  branded: z.boolean(),
});

export type BundledPromptEntry = z.infer<typeof BundledPromptEntrySchema>;

export const PromptBundleSchema = z.object({
  brandName: z.string().min(1),
  categoryId: z.string().min(1),
  locale: z.enum(LOCALES),
  profileId: z.enum(PROFILE_IDS),
  generatedAt: z.string().min(1),
  prompts: z.array(BundledPromptEntrySchema).min(1),
});

export type PromptBundle = z.infer<typeof PromptBundleSchema>;
