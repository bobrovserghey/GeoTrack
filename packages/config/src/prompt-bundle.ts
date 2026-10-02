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
// Category prompt selection
// ---------------------------------------------------------------------------

type PromptSetEntry = ReturnType<typeof getPromptSet>['prompts'][number];

// A prompt set lists its prompts in type blocks (discovery 1–16, problem-led
// 17–26, comparison 27–34, …), so "the first N by priority" for any N below the
// full set is a skewed mix: the standard quota (26) would contain no
// comparison, alternative or local prompt at all. Instead every type gets a
// share of `count` proportional to its share of the full set (largest-remainder
// rounding, ties go to the type listed first), and within a type the
// highest-priority prompts are kept. The result stays in priority order.
function selectCategoryPrompts(prompts: PromptSetEntry[], count: number): PromptSetEntry[] {
  const sorted = [...prompts].sort((a, b) => a.priority - b.priority);
  if (count >= sorted.length) return sorted;

  const byType = new Map<string, PromptSetEntry[]>();
  for (const p of sorted) {
    const list = byType.get(p.type);
    if (list) list.push(p);
    else byType.set(p.type, [p]);
  }

  const shares = [...byType.entries()].map(([type, list], order) => {
    const exact = (list.length * count) / sorted.length;
    return { type, list, order, take: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let left = count - shares.reduce((sum, s) => sum + s.take, 0);
  const byRemainder = [...shares].sort((a, b) => b.remainder - a.remainder || a.order - b.order);
  for (const s of byRemainder) {
    if (left === 0) break;
    if (s.take < s.list.length) {
      s.take += 1;
      left -= 1;
    }
  }

  return shares
    .flatMap((s) => s.list.slice(0, s.take))
    .sort((a, b) => a.priority - b.priority);
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

  // Category prompts — a type-balanced selection of categoryCount, in priority order
  const promptSet = getPromptSet(categoryId, locale);
  const categorySlice = selectCategoryPrompts(promptSet.prompts, categoryCount);

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
