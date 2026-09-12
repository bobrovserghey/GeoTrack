import { z } from 'zod';

export const EngineRegistryEntrySchema = z.object({
  id: z.enum(['perplexity', 'chatgpt', 'gemini']),
  provider: z.string(),
  model: z.string(),
  concurrencyLimit: z.number().int().positive(),
  retryOnStatus: z.array(z.number().int()),
  maxRetries: z.number().int().positive(),
  timeoutMs: z.number().int().positive(),
});

export const EngineRegistryFileSchema = z.object({
  version: z.number().int().positive(),
  engines: z.array(EngineRegistryEntrySchema).min(1),
});

export type EngineRegistryEntry = z.infer<typeof EngineRegistryEntrySchema>;
