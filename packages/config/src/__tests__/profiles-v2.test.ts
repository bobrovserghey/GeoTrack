import { describe, it, expect } from 'vitest';
import { getAuditProfileV2 } from '../index.js';
import { AuditProfileV2Schema } from '../schemas/audit-profile-v2.js';
import type { AuditProfileV2 } from '../schemas/audit-profile-v2.js';

describe('getAuditProfileV2', () => {
  it('returns teaser v2 profile with correct base values', () => {
    const p = getAuditProfileV2('teaser');
    expect(p.id).toBe('teaser');
    expect(p.version).toBe(2);
    expect(p.crawlerPages).toBe(3);
    expect(p.engines).toEqual(['perplexity']);
    expect(p.locales).toBe(1);
    expect(p.promptRepeats).toBe(1);
    expect(p.competitorCount).toBe(0);
    expect(p.findingCount).toBe(3);
    expect(p.manualReview).toBe(false);
    expect(p.pdf).toBe(false);
    expect(p.costSoftCeilingUsd).toBe(0.1);
    expect(p.costHardCeilingUsd).toBe(0.25);
    expect(p.timeBudgetSeconds).toBe(90);
  });

  it('teaser v2 has no client prompts and no no-search prompts', () => {
    const p = getAuditProfileV2('teaser');
    expect(p.promptsWithSearch.client).toBe(0);
    expect(p.promptsWithoutSearch.discovery).toBe(0);
    expect(p.promptsWithoutSearch.brand).toBe(0);
    expect(p.noSearchEngines).toEqual([]);
    expect(p.serpApiRequestsClient).toBe(0);
  });

  it('returns standard v2 profile with correct values', () => {
    const p = getAuditProfileV2('standard');
    expect(p.id).toBe('standard');
    expect(p.version).toBe(2);
    expect(p.locales).toBe(1);
    expect(p.promptsWithSearch).toEqual({ category: 20, brand: 4, client: 6 });
    expect(p.promptsWithoutSearch).toEqual({ discovery: 6, brand: 4 });
    expect(p.noSearchEngines).toEqual(['chatgpt']);
    expect(p.competitorCount).toBe(3);
    expect(p.serpApiRequestsClient).toBe(2);
    expect(p.costSoftCeilingUsd).toBe(6.0);
    expect(p.costHardCeilingUsd).toBe(8.0);
    expect(p.costSoftCeilingPerAdditionalLocaleUsd).toBe(0);
    expect(p.costHardCeilingPerAdditionalLocaleUsd).toBe(0);
    expect(p.timeBudgetSeconds).toBe(360);
    expect(p.timeBudgetPerAdditionalLocaleSeconds).toBe(0);
  });

  it('returns extended v2 profile with correct values', () => {
    const p = getAuditProfileV2('extended');
    expect(p.id).toBe('extended');
    expect(p.version).toBe(2);
    expect(p.locales).toBe(3);
    expect(p.promptsWithSearch).toEqual({ category: 30, brand: 10, client: 10 });
    expect(p.promptsWithSearchAdditionalLocale).toEqual({ category: 20, brand: 5 });
    expect(p.promptsWithoutSearch).toEqual({ discovery: 10, brand: 10 });
    expect(p.noSearchEngines).toEqual(['chatgpt', 'gemini']);
    expect(p.competitorCount).toBe(5);
    expect(p.costSoftCeilingUsd).toBe(9.0);
    expect(p.costHardCeilingUsd).toBe(12.0);
    expect(p.costSoftCeilingPerAdditionalLocaleUsd).toBe(3.0);
    expect(p.costHardCeilingPerAdditionalLocaleUsd).toBe(4.0);
    expect(p.timeBudgetSeconds).toBe(480);
    expect(p.timeBudgetPerAdditionalLocaleSeconds).toBe(120);
  });

  it('all three v2 profiles are present', () => {
    for (const id of ['teaser', 'standard', 'extended']) {
      expect(() => getAuditProfileV2(id), `profile "${id}" should exist`).not.toThrow();
    }
  });

  it('throws on unknown v2 profile id', () => {
    expect(() => getAuditProfileV2('enterprise')).toThrowError(/Unknown audit profile v2/);
  });

  it('throws on Object.prototype keys instead of returning inherited members', () => {
    for (const id of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      expect(() => getAuditProfileV2(id), `profile "${id}" must not resolve`).toThrowError(
        /Unknown audit profile v2/,
      );
    }
  });

  it('hard ceiling is always greater than soft ceiling', () => {
    for (const id of ['teaser', 'standard', 'extended']) {
      const p = getAuditProfileV2(id);
      expect(p.costHardCeilingUsd).toBeGreaterThan(p.costSoftCeilingUsd);
    }
  });

  it('extended has more main-locale prompts than standard', () => {
    const s = getAuditProfileV2('standard');
    const e = getAuditProfileV2('extended');
    const totalS =
      s.promptsWithSearch.category + s.promptsWithSearch.brand + s.promptsWithSearch.client;
    const totalE =
      e.promptsWithSearch.category + e.promptsWithSearch.brand + e.promptsWithSearch.client;
    expect(totalE).toBeGreaterThan(totalS);
  });

  it('extended v2 supports multiple locales; standard and teaser do not', () => {
    expect(getAuditProfileV2('teaser').locales).toBe(1);
    expect(getAuditProfileV2('standard').locales).toBe(1);
    expect(getAuditProfileV2('extended').locales).toBeGreaterThan(1);
  });

  it('per-additional-locale cost surcharges are zero for teaser and standard', () => {
    for (const id of ['teaser', 'standard']) {
      const p = getAuditProfileV2(id);
      expect(p.costSoftCeilingPerAdditionalLocaleUsd).toBe(0);
      expect(p.costHardCeilingPerAdditionalLocaleUsd).toBe(0);
      expect(p.timeBudgetPerAdditionalLocaleSeconds).toBe(0);
    }
  });

  it('hard ceiling surcharge per locale is greater than soft ceiling surcharge (extended)', () => {
    const p = getAuditProfileV2('extended');
    expect(p.costHardCeilingPerAdditionalLocaleUsd).toBeGreaterThan(
      p.costSoftCeilingPerAdditionalLocaleUsd,
    );
  });
});

// minimal base for schema-level tests
const BASE: AuditProfileV2 = {
  id: 'teaser',
  version: 2 as const,
  crawlerPages: 3,
  engines: ['perplexity'],
  locales: 1,
  promptsWithSearch: { category: 10, brand: 2, client: 0 },
  promptsWithSearchAdditionalLocale: { category: 0, brand: 0 },
  promptsWithoutSearch: { discovery: 0, brand: 0 },
  noSearchEngines: [],
  promptRepeats: 1,
  competitorCount: 0,
  pillars: ['A_preliminary'],
  findingCount: 3,
  manualReview: false,
  pdf: false,
  serpApiRequests: 2,
  serpApiRequestsClient: 0,
  costSoftCeilingUsd: 0.1,
  costHardCeilingUsd: 0.25,
  costSoftCeilingPerAdditionalLocaleUsd: 0,
  costHardCeilingPerAdditionalLocaleUsd: 0,
  timeBudgetSeconds: 90,
  timeBudgetPerAdditionalLocaleSeconds: 0,
};

describe('AuditProfileV2Schema validation', () => {
  it('accepts the minimal valid base profile', () => {
    expect(() => AuditProfileV2Schema.parse(BASE)).not.toThrow();
  });

  it('rejects profile where costHardCeilingUsd <= costSoftCeilingUsd', () => {
    expect(() => AuditProfileV2Schema.parse({ ...BASE, costHardCeilingUsd: 0.05 })).toThrow(
      /costHardCeilingUsd/,
    );
  });

  it('rejects profile where costHardCeilingPerAdditionalLocaleUsd < soft surcharge', () => {
    expect(() =>
      AuditProfileV2Schema.parse({
        ...BASE,
        costSoftCeilingPerAdditionalLocaleUsd: 3,
        costHardCeilingPerAdditionalLocaleUsd: 2,
      }),
    ).toThrow(/costHardCeilingPerAdditionalLocaleUsd/);
  });

  it('rejects profile where noSearchEngines contains engine not in engines', () => {
    expect(() => AuditProfileV2Schema.parse({ ...BASE, noSearchEngines: ['gemini'] })).toThrow(
      /noSearchEngines/,
    );
  });
});
