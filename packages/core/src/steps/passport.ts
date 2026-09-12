import { z } from 'zod';

export const PassportOutputSchema = z.object({
  name: z.string().min(1).max(256),
  description: z.string().min(1),
  categoryHint: z.string().max(128).optional(),
  valueProps: z.array(z.string()).max(10).default([]),
  targetAudience: z.object({
    summary: z.string(),
    personas: z.array(z.string()).max(5).default([]),
  }),
});

export type PassportOutput = z.infer<typeof PassportOutputSchema>;
