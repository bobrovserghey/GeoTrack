import type { PromptBundle, BundledPromptEntry, ProfileId } from './schemas/prompt-bundle.js';
import { PROFILE_QUOTAS } from './schemas/prompt-bundle.js';
import type { Locale } from './schemas/prompt-set.js';
import { getPromptSet } from './index.js';

// ---------------------------------------------------------------------------
// Brand prompt text generators per locale
// ---------------------------------------------------------------------------

function brandTexts(brandName: string, competitors: string[], locale: Locale): string[] {
  if (locale === 'ro') {
    return [
      `ce este ${brandName}`,
      `prețuri ${brandName}`,
      `alternative la ${brandName}`,
      `recenzii ${brandName}`,
      ...competitors.map((c) => `${brandName} vs ${c}`),
    ];
  }
  return [
    `what is ${brandName}`,
    `${brandName} pricing`,
    `${brandName} alternatives`,
    `${brandName} reviews`,
    ...competitors.map((c) => `${brandName} vs ${c}`),
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PromptBundleInput {
  brandName: string;
  categoryId: string;
  locale: Locale;
  competitors: string[];
  profileId: ProfileId;
}

export function generatePromptBundle(input: PromptBundleInput): PromptBundle {
  const { brandName, categoryId, locale, competitors, profileId } = input;
  const { categoryCount, brandCount } = PROFILE_QUOTAS[profileId];

  // Category prompts — sorted by priority, take first categoryCount
  const promptSet = getPromptSet(categoryId, locale);
  const sorted = [...promptSet.prompts].sort((a, b) => a.priority - b.priority);
  const categorySlice = sorted.slice(0, categoryCount);

  // Brand prompts
  const texts = brandTexts(brandName, competitors, locale);
  const brandSlice = texts.slice(0, brandCount);

  // Assemble with continuous priority
  const prompts: BundledPromptEntry[] = [
    ...categorySlice.map((p, i) => ({
      id: p.id,
      text: p.text,
      type: p.type as BundledPromptEntry['type'],
      priority: i + 1,
      branded: false,
    })),
    ...brandSlice.map((text, i) => ({
      id: `brand-${String(i + 1).padStart(2, '0')}`,
      text,
      type: 'brand' as const,
      priority: categoryCount + i + 1,
      branded: true,
    })),
  ];

  return {
    brandName,
    categoryId,
    locale,
    profileId,
    generatedAt: new Date().toISOString().slice(0, 10),
    prompts,
  };
}
