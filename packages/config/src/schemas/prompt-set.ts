import { z } from 'zod';

export const LOCALES = ['en', 'ro'] as const;
export type Locale = (typeof LOCALES)[number];

export const PROMPT_TYPES = ['discovery', 'problem-led', 'comparison', 'alternative', 'local'] as const;
export type PromptType = (typeof PROMPT_TYPES)[number];

export const PromptEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'id must be kebab-case'),
  text: z.string().min(1),
  type: z.enum(PROMPT_TYPES),
  priority: z.number().int().min(1).max(40),
});

export type PromptEntry = z.infer<typeof PromptEntrySchema>;

export const PromptSetSchema = z.object({
  categoryId: z.string().min(1),
  locale: z.enum(LOCALES),
  version: z.literal('1'),
  generatedAt: z.string().min(1),
  prompts: z.array(PromptEntrySchema).length(40),
});

export type PromptSet = z.infer<typeof PromptSetSchema>;
