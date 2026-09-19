import { z } from 'zod';

export const ModelPriceSchema = z.object({
  inputPerMToken: z.number().nonnegative().optional(),
  outputPerMToken: z.number().nonnegative().optional(),
  requestPer1k: z.number().nonnegative().optional(),
  webSearchCallPer1k: z.number().nonnegative().optional(),
  groundingCallPer1k: z.number().nonnegative().optional(),
  freeGroundingCallsPerMonth: z.number().int().nonnegative().optional(),
});

export const ProviderPricesFileSchema = z.object({
  version: z.number().int().positive(),
  models: z.record(z.string(), ModelPriceSchema),
});

export type ModelPrice = z.infer<typeof ModelPriceSchema>;
export type ProviderPricesFile = z.infer<typeof ProviderPricesFileSchema>;
