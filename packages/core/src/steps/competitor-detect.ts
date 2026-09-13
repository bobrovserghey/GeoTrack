import { z } from 'zod';

export const CompetitorSchema = z.object({
  name: z.string().min(1).max(200),
  domain: z.string().optional(),
  rationale: z.string().min(1),
});

export const CompetitorDetectOutputSchema = z.object({
  competitors: z.array(CompetitorSchema).max(10),
});

export type Competitor = z.infer<typeof CompetitorSchema>;
export type CompetitorDetectOutput = z.infer<typeof CompetitorDetectOutputSchema>;
