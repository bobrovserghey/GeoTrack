import { z } from 'zod';

export const CategoryEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'id must be kebab-case'),
  name: z.string().min(1).max(120),
  topPlayers: z.array(z.string().min(1)).min(3).max(10),
});

export type CategoryEntry = z.infer<typeof CategoryEntrySchema>;

export const TaxonomySchema = z.array(CategoryEntrySchema);
export type Taxonomy = z.infer<typeof TaxonomySchema>;
