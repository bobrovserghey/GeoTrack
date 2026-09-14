import { describe, it, expect, vi } from 'vitest';
import {
  detectBrandMention,
  detectCompetitorMentions,
  normalizePositionScore,
  extractDomains,
  extractMentions,
} from '../steps/extract-mentions.js';
import type { ExtractMentionsInput } from '@geotrack/core';
import type { ModelAdapter, ModelAnswer } from '@geotrack/core';
import type { EnginePollResponse } from '@geotrack/core';

// ── fixtures ──────────────────────────────────────────────────────────────────

function makeModelAnswer(text: string): ModelAnswer {
  return { text, usage: { provider: 'gemini', model: 'flash', tokensIn: 10, tokensOut: 5, costUsd: 0.001 } };
}

function makeAdapter(answers: ModelAnswer[]): ModelAdapter {
  let i = 0;
  return {
    generate: vi.fn().mockImplementation(() => {
      const a = answers[i] ?? answers.at(-1) ?? makeModelAnswer('{"position":null}');
      i++;
      return Promise.resolve(a);
    }),
  };
}

function makeResponse(overrides: Partial<EnginePollResponse> = {}): EnginePollResponse {
  return {
    promptId: 'p1',
    engineId: 'perplexity',
    repeatIndex: 0,
    responseText: 'GeoTrack is a great audit tool for digital presence.',
    sources: [{ url: 'https://www.example.com/review', title: 'Review' }],
    fromCache: false,
    usage: { provider: 'perplexity', model: 'sonar', tokensIn: 100, tokensOut: 50, costUsd: 0.01 },
    ...overrides,
  };
}

const BASE_INPUT: ExtractMentionsInput = {
  responses: [makeResponse()],
  brandName: 'GeoTrack',
  brandVariants: ['Geo Track', 'geotrack'],
  competitors: ['Ahrefs', 'Semrush'],
};

// ── brand mention detection ───────────────────────────────────────────────────

describe('detectBrandMention', () => {
  it('returns true when brand name is in text', () => {
    expect(detectBrandMention('GeoTrack is great', 'GeoTrack', [])).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(detectBrandMention('geotrack is great', 'GeoTrack', [])).toBe(true);
  });

  it('returns true when a variant matches', () => {
    expect(detectBrandMention('Geo Track is a tool', 'GeoTrack', ['Geo Track'])).toBe(true);
  });

  it('returns false when brand is not in text', () => {
    expect(detectBrandMention('Salesforce is the best', 'GeoTrack', [])).toBe(false);
  });

  it('respects word boundaries — partial word should not match', () => {
    expect(detectBrandMention('GeoTracking is a concept', 'GeoTrack', [])).toBe(false);
  });

  it('returns false for empty text', () => {
    expect(detectBrandMention('', 'GeoTrack', [])).toBe(false);
  });

  it('returns false when brand terms are empty', () => {
    expect(detectBrandMention('GeoTrack is here', '', [])).toBe(false);
  });

  it('returns true with multiple occurrences', () => {
    expect(detectBrandMention('GeoTrack beats GeoTrack competitors', 'GeoTrack', [])).toBe(true);
  });
});

// ── competitor mention detection ──────────────────────────────────────────────

describe('detectCompetitorMentions', () => {
  it('returns competitor when mentioned once', () => {
    const result = detectCompetitorMentions('Ahrefs is a SEO tool', ['Ahrefs', 'Semrush']);
    expect(result).toEqual([{ name: 'Ahrefs', count: 1 }]);
  });

  it('omits competitor not mentioned', () => {
    const result = detectCompetitorMentions('Ahrefs is great', ['Ahrefs', 'Semrush']);
    expect(result.find(c => c.name === 'Semrush')).toBeUndefined();
  });

  it('counts multiple occurrences', () => {
    const result = detectCompetitorMentions('Ahrefs vs Ahrefs — Ahrefs wins', ['Ahrefs']);
    expect(result[0]?.count).toBe(3);
  });

  it('returns empty array for empty competitor list', () => {
    expect(detectCompetitorMentions('GeoTrack is great', [])).toEqual([]);
  });

  it('returns all mentioned competitors', () => {
    const result = detectCompetitorMentions('Ahrefs and Semrush are competitors', ['Ahrefs', 'Semrush', 'Moz']);
    expect(result.map(c => c.name).sort()).toEqual(['Ahrefs', 'Semrush']);
  });
});

// ── position normalization ────────────────────────────────────────────────────

describe('normalizePositionScore', () => {
  it('position 1 → 100', () => expect(normalizePositionScore(1)).toBe(100));
  it('position 2 → 80', () => expect(normalizePositionScore(2)).toBe(80));
  it('position 3 → 60', () => expect(normalizePositionScore(3)).toBe(60));
  it('position 4 → 40', () => expect(normalizePositionScore(4)).toBe(40));
  it('position 5 → 20', () => expect(normalizePositionScore(5)).toBe(20));
  it('position 10 → 20 (floor)', () => expect(normalizePositionScore(10)).toBe(20));
});

// ── domain extraction ─────────────────────────────────────────────────────────

describe('extractDomains', () => {
  it('extracts domain from HTTPS URL', () => {
    expect(extractDomains([{ url: 'https://example.com/page' }])).toEqual(['example.com']);
  });

  it('strips www subdomain', () => {
    expect(extractDomains([{ url: 'https://www.example.com/page' }])).toEqual(['example.com']);
  });

  it('extracts domain from URL with path and query', () => {
    expect(extractDomains([{ url: 'https://review.io/tools/geotrack?ref=1' }])).toEqual(['review.io']);
  });

  it('deduplicates same domain from multiple URLs', () => {
    expect(extractDomains([
      { url: 'https://example.com/page1' },
      { url: 'https://example.com/page2' },
    ])).toEqual(['example.com']);
  });

  it('returns empty array for empty input', () => {
    expect(extractDomains([])).toEqual([]);
  });

  it('returns all distinct domains', () => {
    const result = extractDomains([
      { url: 'https://ahrefs.com/blog' },
      { url: 'https://semrush.com/report' },
    ]);
    expect(result.sort()).toEqual(['ahrefs.com', 'semrush.com']);
  });
});

// ── model-based position extraction (via extractMentions) ────────────────────

describe('brand list position extraction', () => {
  it('uses model position when brand is mentioned and model returns a number', async () => {
    const adapter = makeAdapter([makeModelAnswer('{"position":2}')]);
    const result = await extractMentions(BASE_INPUT, adapter);
    expect(result.data?.facts[0]?.brandListPosition).toBe(2);
    expect(result.data?.facts[0]?.normalizedPositionScore).toBe(80);
    expect(adapter.generate).toHaveBeenCalledTimes(1);
  });

  it('sets position to null when model returns null', async () => {
    const adapter = makeAdapter([makeModelAnswer('{"position":null}')]);
    const result = await extractMentions(BASE_INPUT, adapter);
    expect(result.data?.facts[0]?.brandListPosition).toBeNull();
    expect(result.data?.facts[0]?.normalizedPositionScore).toBeNull();
  });

  it('skips model call when brand not mentioned', async () => {
    const adapter = makeAdapter([]);
    const input: ExtractMentionsInput = {
      ...BASE_INPUT,
      responses: [makeResponse({ responseText: 'Salesforce is the winner here' })],
    };
    const result = await extractMentions(input, adapter);
    expect(adapter.generate).not.toHaveBeenCalled();
    expect(result.data?.facts[0]?.brandListPosition).toBeNull();
  });

  it('returns partial status and null position when model throws', async () => {
    const adapter: ModelAdapter = {
      generate: vi.fn().mockRejectedValue(new Error('model error')),
    };
    const result = await extractMentions(BASE_INPUT, adapter);
    expect(result.status).toBe('partial');
    expect(result.data?.facts[0]?.brandListPosition).toBeNull();
  });
});

// ── full step integration ─────────────────────────────────────────────────────

describe('extractMentions (full step)', () => {
  it('returns correct facts for a single response', async () => {
    const adapter = makeAdapter([makeModelAnswer('{"position":1}')]);
    const result = await extractMentions(BASE_INPUT, adapter);
    expect(result.status).toBe('ok');
    const fact = result.data?.facts[0];
    expect(fact?.brandMentioned).toBe(true);
    expect(fact?.brandListPosition).toBe(1);
    expect(fact?.normalizedPositionScore).toBe(100);
    expect(fact?.citedDomains).toEqual(['example.com']);
    expect(fact?.promptId).toBe('p1');
    expect(fact?.engineId).toBe('perplexity');
    expect(fact?.repeatIndex).toBe(0);
  });

  it('processes multiple responses and returns a fact per response', async () => {
    const adapter = makeAdapter([makeModelAnswer('{"position":null}'), makeModelAnswer('{"position":3}')]);
    const input: ExtractMentionsInput = {
      ...BASE_INPUT,
      responses: [
        makeResponse({ promptId: 'p1', repeatIndex: 0 }),
        makeResponse({ promptId: 'p2', repeatIndex: 0 }),
      ],
    };
    const result = await extractMentions(input, adapter);
    expect(result.data?.facts).toHaveLength(2);
  });
});
