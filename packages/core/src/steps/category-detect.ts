import { z } from 'zod';

export const CategoryCandidateSchema = z.object({
  categoryId: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const CategoryDetectOutputSchema = z.object({
  categoryId: z.string().min(1),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  candidates: z.array(CategoryCandidateSchema).min(1).max(5),
  autoSelected: z.boolean().default(false),
});

export type CategoryCandidate = z.infer<typeof CategoryCandidateSchema>;
export type CategoryDetectOutput = z.infer<typeof CategoryDetectOutputSchema>;
