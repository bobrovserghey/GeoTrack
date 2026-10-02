import { describe, it, expect } from 'vitest';
import { generatePromptBundle, getProfileQuota } from '../prompt-bundle.js';
import { getPromptSet, getAuditProfileV2 } from '../index.js';
import { PromptBundleSchema } from '../schemas/prompt-bundle.js';

const CATEGORY_ID = 'crm-software';
const BRAND = 'Acme CRM';
// 6 competitors → covers extended (4 base + 6 vs = 10 brand)
const COMPETITORS_6 = ['Salesforce', 'HubSpot', 'Zoho', 'Pipedrive', 'Freshsales', 'Copper'];

describe('generatePromptBundle', () => {
  it('teaser: exactly 12 prompts (10 category + 2 brand)', () => {
    const bundle = generatePromptBundle({
      brandName: BRAND,
      categoryId: CATEGORY_ID,
      locale: 'en',
      competitors: COMPETITORS_6,
      profileId: 'teaser',
    });
    expect(bundle.prompts).toHaveLength(12);
  });

  it('standard: exactly 24 prompts (20 category + 4 brand)', () => {
    const bundle = generatePromptBundle({
      brandName: BRAND,
      categoryId: CATEGORY_ID,
      locale: 'en',
      competitors: COMPETITORS_6,
      profileId: 'standard',
    });
    expect(bundle.prompts).toHaveLength(24);
  });

  it('extended: exactly 40 prompts (30 category + 10 brand)', () => {
    const bundle = generatePromptBundle({
      brandName: BRAND,
      categoryId: CATEGORY_ID,
      locale: 'en',
      competitors: COMPETITORS_6,
      profileId: 'extended',
    });
    expect(bundle.prompts).toHaveLength(40);
  });

  it('branded prompts have branded:true, category prompts have branded:false', () => {
    const bundle = generatePromptBundle({
      brandName: BRAND,
      categoryId: CATEGORY_ID,
      locale: 'en',
      competitors: COMPETITORS_6,
      profileId: 'standard',
    });
    const { categoryCount, brandCount } = getProfileQuota('standard');
    const categoryPrompts = bundle.prompts.slice(0, categoryCount);
    const brandPrompts = bundle.prompts.slice(categoryCount);
    expect(categoryPrompts.every((p) => !p.branded)).toBe(true);
    expect(brandPrompts.every((p) => p.branded)).toBe(true);
    expect(brandPrompts).toHaveLength(brandCount);
  });

  it('brand prompts have type="brand"', () => {
    const bundle = generatePromptBundle({
      brandName: BRAND,
      categoryId: CATEGORY_ID,
      locale: 'en',
      competitors: COMPETITORS_6,
      profileId: 'standard',
    });
    const branded = bundle.prompts.filter((p) => p.branded);
    for (const p of branded) {
      expect(p.type).toBe('brand');
    }
  });

  it('category prompts have type != "brand"', () => {
    const bundle = generatePromptBundle({
      brandName: BRAND,
      categoryId: CATEGORY_ID,
      locale: 'en',
      competitors: COMPETITORS_6,
      profileId: 'standard',
    });
    const category = bundle.prompts.filter((p) => !p.branded);
    for (const p of category) {
      expect(p.type).not.toBe('brand');
    }
  });

  it('priorities are continuous 1..N without gaps', () => {
    const bundle = generatePromptBundle({
      brandName: BRAND,
      categoryId: CATEGORY_ID,
      locale: 'en',
      competitors: COMPETITORS_6,
      profileId: 'extended',
    });
    const priorities = bundle.prompts.map((p) => p.priority).sort((a, b) => a - b);
    expect(priorities).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
  });

  it('all prompt ids are unique within bundle', () => {
    const bundle = generatePromptBundle({
      brandName: BRAND,
      categoryId: CATEGORY_ID,
      locale: 'en',
      competitors: COMPETITORS_6,
      profileId: 'extended',
    });
    const ids = bundle.prompts.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('brand ids follow brand-NN pattern', () => {
    const bundle = generatePromptBundle({
      brandName: BRAND,
      categoryId: CATEGORY_ID,
      locale: 'en',
      competitors: COMPETITORS_6,
      profileId: 'standard',
    });
    const branded = bundle.prompts.filter((p) => p.branded);
    for (const [i, p] of branded.entries()) {
      expect(p.id).toBe(`brand-${String(i + 1).padStart(2, '0')}`);
    }
  });

  it('English: first brand prompt is "what is {Brand}"', () => {
    const bundle = generatePromptBundle({
      brandName: BRAND,
      categoryId: CATEGORY_ID,
      locale: 'en',
      competitors: COMPETITORS_6,
      profileId: 'teaser',
    });
    const branded = bundle.prompts.filter((p) => p.branded);
    expect(branded[0]!.text).toBe(`what is ${BRAND}`);
  });

  it('English: second brand prompt is "{Brand} pricing"', () => {
    const bundle = generatePromptBundle({
      brandName: BRAND,
      categoryId: CATEGORY_ID,
      locale: 'en',
      competitors: COMPETITORS_6,
      profileId: 'teaser',
    });
    const branded = bundle.prompts.filter((p) => p.branded);
    expect(branded[1]!.text).toBe(`${BRAND} pricing`);
  });

  it('English extended: brand prompts include vs competitors', () => {
    const bundle = generatePromptBundle({
      brandName: BRAND,
      categoryId: CATEGORY_ID,
      locale: 'en',
      competitors: COMPETITORS_6,
      profileId: 'extended',
    });
    const branded = bundle.prompts.filter((p) => p.branded);
    const vsPrompts = branded.filter((p) => p.text.includes(' vs '));
    expect(vsPrompts.length).toBeGreaterThan(0);
    expect(vsPrompts[0]!.text).toBe(`${BRAND} vs ${COMPETITORS_6[0]}`);
  });

  it('Romanian locale: brand prompts are in Romanian', () => {
    const bundle = generatePromptBundle({
      brandName: BRAND,
      categoryId: CATEGORY_ID,
      locale: 'ro',
      competitors: COMPETITORS_6,
      profileId: 'standard',
    });
    const branded = bundle.prompts.filter((p) => p.branded);
    expect(branded[0]!.text).toBe(`ce este ${BRAND}`);
    expect(branded[1]!.text).toBe(`prețuri ${BRAND}`);
    expect(branded[2]!.text).toBe(`alternative la ${BRAND}`);
    expect(branded[3]!.text).toBe(`recenzii ${BRAND}`);
  });

  it('Romanian vs prompts use "vs" (universal)', () => {
    const bundle = generatePromptBundle({
      brandName: BRAND,
      categoryId: CATEGORY_ID,
      locale: 'ro',
      competitors: COMPETITORS_6,
      profileId: 'extended',
    });
    const vsPrompts = bundle.prompts.filter((p) => p.branded && p.text.includes(' vs '));
    expect(vsPrompts[0]!.text).toBe(`${BRAND} vs ${COMPETITORS_6[0]}`);
  });

  it('category prompts come in priority order (discovery first)', () => {
    const bundle = generatePromptBundle({
      brandName: BRAND,
      categoryId: CATEGORY_ID,
      locale: 'en',
      competitors: COMPETITORS_6,
      profileId: 'teaser',
    });
    const category = bundle.prompts.filter((p) => !p.branded);
    // Category prompts sorted by original canonical priority → discovery types first
    expect(category[0]!.type).toBe('discovery');
  });

  it('Zod PromptBundleSchema validates the result', () => {
    const bundle = generatePromptBundle({
      brandName: BRAND,
      categoryId: CATEGORY_ID,
      locale: 'en',
      competitors: COMPETITORS_6,
      profileId: 'extended',
    });
    expect(() => PromptBundleSchema.parse(bundle)).not.toThrow();
  });

  it('bundle metadata is correct', () => {
    const bundle = generatePromptBundle({
      brandName: BRAND,
      categoryId: CATEGORY_ID,
      locale: 'en',
      competitors: COMPETITORS_6,
      profileId: 'standard',
    });
    expect(bundle.brandName).toBe(BRAND);
    expect(bundle.categoryId).toBe(CATEGORY_ID);
    expect(bundle.locale).toBe('en');
    expect(bundle.profileId).toBe('standard');
    expect(bundle.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('teaser with 0 competitors: 10 category + 2 brand base prompts = 12', () => {
    const bundle = generatePromptBundle({
      brandName: BRAND,
      categoryId: CATEGORY_ID,
      locale: 'en',
      competitors: [],
      profileId: 'teaser',
    });
    expect(bundle.prompts).toHaveLength(12);
    expect(bundle.prompts.filter((p) => p.branded)).toHaveLength(2);
  });
});

describe('generatePromptBundle — category type mix', () => {
  const typesOf = (profileId: 'teaser' | 'standard' | 'extended', categoryId = CATEGORY_ID) => {
    const bundle = generatePromptBundle({
      brandName: BRAND,
      categoryId,
      locale: 'en',
      competitors: COMPETITORS_6,
      profileId,
    });
    const counts: Record<string, number> = {};
    for (const p of bundle.prompts.filter((x) => !x.branded)) counts[p.type] = (counts[p.type] ?? 0) + 1;
    return counts;
  };

  // Regression: "first N by priority" gave standard 16 discovery + 10 problem-led
  // and not a single comparison / alternative / local prompt.
  it('standard includes comparison, alternative and local prompts', () => {
    const counts = typesOf('standard');
    expect(counts['comparison']).toBeGreaterThan(0);
    expect(counts['alternative']).toBeGreaterThan(0);
    expect(counts['local']).toBeGreaterThan(0);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(20);
  });

  it('standard mix is proportional to the 40-prompt set', () => {
    expect(typesOf('standard')).toEqual({
      discovery: 8,
      'problem-led': 5,
      comparison: 4,
      alternative: 2,
      local: 1,
    });
  });

  it('teaser mixes discovery, problem-led, comparison and alternative', () => {
    const counts = typesOf('teaser');
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(10);
    expect(counts['discovery']).toBeGreaterThan(0);
    expect(counts['comparison']).toBeGreaterThan(0);
  });

  it('extended covers every type and sums to its 30 category prompts', () => {
    const counts = typesOf('extended');
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(30);
    for (const t of ['discovery', 'problem-led', 'comparison', 'alternative', 'local']) {
      expect(counts[t], t).toBeGreaterThan(0);
    }
  });

  it('keeps category prompts in ascending original priority order, without duplicates', () => {
    const bundle = generatePromptBundle({
      brandName: BRAND,
      categoryId: CATEGORY_ID,
      locale: 'en',
      competitors: COMPETITORS_6,
      profileId: 'standard',
    });
    const ids = bundle.prompts.filter((p) => !p.branded).map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const priorityOf = new Map(getPromptSet(CATEGORY_ID, 'en').prompts.map((p) => [p.id, p.priority]));
    const original = ids.map((id) => priorityOf.get(id)!);
    expect([...original].sort((a, b) => a - b)).toEqual(original);
  });

  it('gives the same standard mix for every category', () => {
    const ids = ['crm-software', 'accounting-software', 'ci-cd-platform'];
    for (const id of ids) expect(typesOf('standard', id)).toEqual(typesOf('standard'));
  });
});

// audit-profiles.v2.json is the single source of truth for bundle sizes.
describe('getProfileQuota', () => {
  it.each(['teaser', 'standard', 'extended'] as const)('%s follows promptsWithSearch of the v2 profile', (id) => {
    const { promptsWithSearch } = getAuditProfileV2(id);
    expect(getProfileQuota(id)).toEqual({
      categoryCount: promptsWithSearch.category,
      brandCount: promptsWithSearch.brand,
    });
  });
});
