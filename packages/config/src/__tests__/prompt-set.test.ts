import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { PromptSetSchema, LOCALES, PROMPT_TYPES } from '../schemas/prompt-set.js';
import { getTaxonomy, getPromptSet } from '../index.js';

const CATEGORIES_DIR = join(import.meta.dirname, '..', 'prompts', 'categories');

function allFiles(): { categoryId: string; locale: string; path: string }[] {
  const result: { categoryId: string; locale: string; path: string }[] = [];
  for (const cat of readdirSync(CATEGORIES_DIR)) {
    for (const locale of LOCALES) {
      result.push({
        categoryId: cat,
        locale,
        path: join(CATEGORIES_DIR, cat, `${locale}.v1.json`),
      });
    }
  }
  return result;
}

describe('prompt-set files', () => {
  it('has exactly 400 files (200 categories × 2 locales)', () => {
    const files = allFiles();
    expect(files).toHaveLength(400);
  });

  it('every category in taxonomy has both locales', () => {
    const taxonomy = getTaxonomy();
    for (const cat of taxonomy) {
      for (const locale of LOCALES) {
        const ps = getPromptSet(cat.id, locale);
        expect(ps.categoryId).toBe(cat.id);
        expect(ps.locale).toBe(locale);
      }
    }
  });

  it('every file has exactly 40 prompts', () => {
    for (const { path } of allFiles()) {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
      const ps = PromptSetSchema.parse(raw);
      expect(ps.prompts).toHaveLength(40);
    }
  });

  it('all prompt ids are unique within each file', () => {
    for (const { path, categoryId, locale } of allFiles()) {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
      const ps = PromptSetSchema.parse(raw);
      const ids = ps.prompts.map((p) => p.id);
      const unique = new Set(ids);
      expect(unique.size, `${categoryId}/${locale} has duplicate ids`).toBe(ids.length);
    }
  });

  it('priorities are 1–40 with no duplicates', () => {
    for (const { path, categoryId, locale } of allFiles()) {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
      const ps = PromptSetSchema.parse(raw);
      const priorities = ps.prompts.map((p) => p.priority).sort((a, b) => a - b);
      expect(priorities, `${categoryId}/${locale} bad priorities`).toEqual(
        Array.from({ length: 40 }, (_, i) => i + 1),
      );
    }
  });

  it('all prompts have valid type', () => {
    const validTypes = new Set(PROMPT_TYPES);
    for (const { path, categoryId, locale } of allFiles()) {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
      const ps = PromptSetSchema.parse(raw);
      for (const p of ps.prompts) {
        expect(validTypes.has(p.type), `${categoryId}/${locale} unknown type "${p.type}"`).toBe(true);
      }
    }
  });

  it('all prompt texts are non-empty', () => {
    for (const { path, categoryId, locale } of allFiles()) {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
      const ps = PromptSetSchema.parse(raw);
      for (const p of ps.prompts) {
        expect(p.text.trim().length, `empty text in ${categoryId}/${locale} id=${p.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('Zod schema parses every file without errors', () => {
    for (const { path } of allFiles()) {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
      expect(() => PromptSetSchema.parse(raw)).not.toThrow();
    }
  });

  it('getPromptSet returns correct categoryId and locale', () => {
    const ps = getPromptSet('crm-software', 'en');
    expect(ps.categoryId).toBe('crm-software');
    expect(ps.locale).toBe('en');
    expect(ps.version).toBe('1');
    expect(ps.prompts).toHaveLength(40);
  });

  it('Romanian set contains Romanian text', () => {
    const ps = getPromptSet('crm-software', 'ro');
    const hasRomanian = ps.prompts.some(
      (p) => p.text.includes('cel mai') || p.text.includes('alternativ') || p.text.includes('pentru'),
    );
    expect(hasRomanian).toBe(true);
  });

  it('comparison prompts contain vs', () => {
    const ps = getPromptSet('crm-software', 'en');
    const comparisons = ps.prompts.filter((p) => p.type === 'comparison');
    expect(comparisons).toHaveLength(8);
    for (const p of comparisons) {
      expect(p.text).toContain(' vs ');
    }
  });

  it('priority ordering: discovery first, local last', () => {
    const ps = getPromptSet('project-management-software', 'en');
    const byPriority = [...ps.prompts].sort((a, b) => a.priority - b.priority);
    expect(byPriority[0]!.type).toBe('discovery');
    expect(byPriority[39]!.type).toBe('local');
  });
});
