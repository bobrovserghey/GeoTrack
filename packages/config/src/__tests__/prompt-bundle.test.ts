import { describe, it, expect } from 'vitest';
import { generatePromptBundle } from '../prompt-bundle.js';
import { PromptBundleSchema, PROFILE_QUOTAS } from '../schemas/prompt-bundle.js';

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

  it('standard: exactly 30 prompts (26 category + 4 brand)', () => {
    const bundle = generatePromptBundle({
      brandName: BRAND,
      categoryId: CATEGORY_ID,
      locale: 'en',
      competitors: COMPETITORS_6,
      profileId: 'standard',
    });
    expect(bundle.prompts).toHaveLength(30);
  });

  it('extended: exactly 50 prompts (40 category + 10 brand)', () => {
    const bundle = generatePromptBundle({
      brandName: BRAND,
      categoryId: CATEGORY_ID,
      locale: 'en',
      competitors: COMPETITORS_6,
      profileId: 'extended',
    });
    expect(bundle.prompts).toHaveLength(50);
  });

  it('branded prompts have branded:true, category prompts have branded:false', () => {
    const bundle = generatePromptBundle({
      brandName: BRAND,
      categoryId: CATEGORY_ID,
      locale: 'en',
      competitors: COMPETITORS_6,
      profileId: 'standard',
    });
    const { categoryCount, brandCount } = PROFILE_QUOTAS['standard'];
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
    expect(priorities).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
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
