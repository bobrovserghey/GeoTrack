import { describe, it, expect } from 'vitest';
import { buildSourceMap } from '../steps/source-map.js';
import type { EnginePollResponse } from '@geotrack/core';

function makeResponse(
  promptId: string,
  engineId: 'perplexity' | 'chatgpt' | 'gemini',
  repeatIndex: number,
  sourceUrls: string[],
): EnginePollResponse {
  return {
    promptId,
    engineId,
    repeatIndex,
    responseText: 'response text',
    sources: sourceUrls.map((url) => ({ url })),
    fromCache: false,
    usage: { provider: engineId, model: 'model', tokensIn: 10, tokensOut: 10, costUsd: 0.001 },
  };
}

describe('buildSourceMap', () => {
  it('returns empty entries for empty responses', () => {
    const result = buildSourceMap([], 'acmecorp.com', []);

    expect(result.status).toBe('ok');
    expect(result.data!.entries).toHaveLength(0);
    expect(result.data!.clientCitedCount).toBe(0);
    expect(result.data!.totalResponses).toBe(0);
  });

  it('returns empty entries for responses with no sources', () => {
    const result = buildSourceMap(
      [makeResponse('p1', 'perplexity', 0, [])],
      'acmecorp.com',
      [],
    );

    expect(result.data!.entries).toHaveLength(0);
    expect(result.data!.totalResponses).toBe(1);
  });

  it('marks client domain correctly', () => {
    const result = buildSourceMap(
      [makeResponse('p1', 'perplexity', 0, ['https://www.acmecorp.com/blog'])],
      'acmecorp.com',
      [],
    );

    const entry = result.data!.entries[0]!;
    expect(entry.domain).toBe('acmecorp.com');
    expect(entry.isClientDomain).toBe(true);
    expect(entry.isCompetitorDomain).toBe(false);
    expect(result.data!.clientCitedCount).toBe(1);
  });

  it('marks competitor domain correctly', () => {
    const result = buildSourceMap(
      [makeResponse('p1', 'perplexity', 0, ['https://www.hubspot.com/crm'])],
      'acmecorp.com',
      ['hubspot.com'],
    );

    const entry = result.data!.entries[0]!;
    expect(entry.domain).toBe('hubspot.com');
    expect(entry.isClientDomain).toBe(false);
    expect(entry.isCompetitorDomain).toBe(true);
  });

  it('strips www — same domain as without www', () => {
    const result = buildSourceMap(
      [makeResponse('p1', 'perplexity', 0, [
        'https://www.acmecorp.com/a',
        'https://acmecorp.com/b',
      ])],
      'acmecorp.com',
      [],
    );

    expect(result.data!.entries).toHaveLength(1);
    expect(result.data!.entries[0]!.domain).toBe('acmecorp.com');
    expect(result.data!.entries[0]!.urls).toHaveLength(2);
  });

  it('counts citedCount per response, not per URL', () => {
    // Two URLs from the same domain in the same response → citedCount: 1
    const result = buildSourceMap(
      [makeResponse('p1', 'perplexity', 0, [
        'https://acmecorp.com/page1',
        'https://acmecorp.com/page2',
      ])],
      'acmecorp.com',
      [],
    );

    expect(result.data!.entries[0]!.citedCount).toBe(1);
  });

  it('counts citedCount across responses', () => {
    // Same domain cited in two different responses → citedCount: 2
    const result = buildSourceMap(
      [
        makeResponse('p1', 'perplexity', 0, ['https://acmecorp.com/a']),
        makeResponse('p2', 'perplexity', 0, ['https://acmecorp.com/b']),
      ],
      'acmecorp.com',
      [],
    );

    expect(result.data!.entries[0]!.citedCount).toBe(2);
    expect(result.data!.clientCitedCount).toBe(2);
  });

  it('same domain from different engines counts separately (both citedCount)', () => {
    const result = buildSourceMap(
      [
        makeResponse('p1', 'perplexity', 0, ['https://acmecorp.com/a']),
        makeResponse('p1', 'chatgpt', 0, ['https://acmecorp.com/a']),
      ],
      'acmecorp.com',
      [],
    );

    // Two responses (different engine) → citedCount: 2
    expect(result.data!.entries[0]!.citedCount).toBe(2);
    expect(result.data!.entries[0]!.engineIds).toContain('perplexity');
    expect(result.data!.entries[0]!.engineIds).toContain('chatgpt');
  });

  it('sorts entries by citedCount descending', () => {
    const result = buildSourceMap(
      [
        makeResponse('p1', 'perplexity', 0, ['https://popular.com/a']),
        makeResponse('p2', 'perplexity', 0, ['https://popular.com/b']),
        makeResponse('p3', 'perplexity', 0, ['https://rare.com/x']),
      ],
      'acmecorp.com',
      [],
    );

    expect(result.data!.entries[0]!.domain).toBe('popular.com');
    expect(result.data!.entries[0]!.citedCount).toBe(2);
    expect(result.data!.entries[1]!.domain).toBe('rare.com');
    expect(result.data!.entries[1]!.citedCount).toBe(1);
  });

  it('collects unique promptIds and engineIds per domain', () => {
    const result = buildSourceMap(
      [
        makeResponse('brand-1', 'perplexity', 0, ['https://acmecorp.com/x']),
        makeResponse('brand-1', 'gemini', 0, ['https://acmecorp.com/y']),
        makeResponse('category-1', 'perplexity', 0, ['https://acmecorp.com/z']),
      ],
      'acmecorp.com',
      [],
    );

    const entry = result.data!.entries[0]!;
    expect(entry.promptIds).toContain('brand-1');
    expect(entry.promptIds).toContain('category-1');
    expect(entry.promptIds).toHaveLength(2);
    expect(entry.engineIds).toContain('perplexity');
    expect(entry.engineIds).toContain('gemini');
  });

  it('totalResponses equals number of responses passed', () => {
    const result = buildSourceMap(
      [
        makeResponse('p1', 'perplexity', 0, []),
        makeResponse('p2', 'chatgpt', 0, ['https://example.com']),
        makeResponse('p3', 'gemini', 0, []),
      ],
      'acmecorp.com',
      [],
    );

    expect(result.data!.totalResponses).toBe(3);
  });

  it('competitor with www prefix is still recognized', () => {
    const result = buildSourceMap(
      [makeResponse('p1', 'perplexity', 0, ['https://www.salesforce.com/crm'])],
      'acmecorp.com',
      ['salesforce.com'],
    );

    const entry = result.data!.entries[0]!;
    expect(entry.domain).toBe('salesforce.com');
    expect(entry.isCompetitorDomain).toBe(true);
  });

  it('sorts entries with equal citedCount by domain asc', () => {
    const result = buildSourceMap(
      [makeResponse('p1', 'perplexity', 0, ['https://zebra.com/x', 'https://apple.com/y'])],
      'acmecorp.com',
      [],
    );

    expect(result.data!.entries[0]!.domain).toBe('apple.com');
    expect(result.data!.entries[1]!.domain).toBe('zebra.com');
  });

  it('skips sources whose normalized result has no dot (invalid hostname)', () => {
    const result = buildSourceMap(
      [makeResponse('p1', 'perplexity', 0, ['not a real url', 'https://valid.com/page'])],
      'acmecorp.com',
      [],
    );

    expect(result.data!.entries).toHaveLength(1);
    expect(result.data!.entries[0]!.domain).toBe('valid.com');
  });

  it('deduplicates same response key (same promptId, engineId, repeatIndex)', () => {
    const r = makeResponse('p1', 'perplexity', 0, ['https://acmecorp.com/a']);
    const result = buildSourceMap([r, r], 'acmecorp.com', []);

    expect(result.data!.entries[0]!.citedCount).toBe(1);
    expect(result.data!.totalResponses).toBe(2);
  });

  it('normalizes www-prefixed clientDomain before matching', () => {
    const result = buildSourceMap(
      [makeResponse('p1', 'perplexity', 0, ['https://acmecorp.com/page'])],
      'www.acmecorp.com',
      [],
    );

    expect(result.data!.clientCitedCount).toBe(1);
    expect(result.data!.entries[0]!.isClientDomain).toBe(true);
  });
});
