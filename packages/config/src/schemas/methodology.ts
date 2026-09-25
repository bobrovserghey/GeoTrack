import { z } from 'zod';

export const CriterionConfigSchema = z.object({
  id: z.string(),
  maxScore: z.number().int().positive(),
});

export const PillarConfigSchema = z.object({
  weight: z.number().min(0).max(1),
  criteria: z.record(CriterionConfigSchema),
});

export const BlockerConfigSchema = z.object({
  id: z.string(),
  pillar: z.string(),
  dependsOn: z.array(z.string()).min(1),
  label: z.string(),
});

export const BandConfigSchema = z.object({
  min: z.number().int().min(0),
  max: z.number().int().max(100),
  label: z.string(),
});

export const IntervalConfigSchema = z.object({
  hRepFallback: z.number().positive(),
  hCovFactor: z.number().positive(),
  hRepFactor: z.number().positive(),
});

export const BasketConfigSchema = z.object({
  realizationFactor: z.number().min(0).max(1),
});

export const MethodologySchema = z.object({
  version: z.number().int().positive(),
  pillars: z.record(PillarConfigSchema),
  blockers: z.array(BlockerConfigSchema),
  bands: z.array(BandConfigSchema),
  interval: IntervalConfigSchema,
  basket: BasketConfigSchema,
});

export type CriterionConfig = z.infer<typeof CriterionConfigSchema>;
export type PillarConfig = z.infer<typeof PillarConfigSchema>;
export type BlockerConfig = z.infer<typeof BlockerConfigSchema>;
export type BandConfig = z.infer<typeof BandConfigSchema>;
export type IntervalConfig = z.infer<typeof IntervalConfigSchema>;
export type BasketConfig = z.infer<typeof BasketConfigSchema>;
export type Methodology = z.infer<typeof MethodologySchema>;
