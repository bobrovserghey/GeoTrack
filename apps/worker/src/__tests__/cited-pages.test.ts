import { describe, it, expect } from 'vitest';
import { analyzeCitedPages } from '../steps/cited-pages.js';
import type { CitedPagesDeps, CitedPagesInput } from '../steps/cited-pages.js';
import type { SourceMapOutput } from '@geotrack/core';
import type { ModelAnswer } from '@geotrack/core';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeSourceMap(entries: Array<{
  domain: string;
  citedCount: number;
  urls: string[];
  isClientDomain?: boolean;
  isCompetitorDomain?: boolean;
}>): SourceMapOutput {
  return {
    entries: entries.map((e) => ({
      domain: e.domain,
      citedCount: e.citedCount,
      urls: e.urls,
      promptIds: [],
      engineIds: [],
      isClientDomain: e.isClientDomain ?? false,
      isCompetitorDomain: e.isCompetitorDomain ?? false,
    })),
    clientCitedCount: 0,
    totalResponses: 10,
  };
}

function makeStubDeps(pages: Record<string, string>): CitedPagesDeps {
  return {
    getPageData: async (url) => {
      const html = pages[url];
      if (!html) throw new Error(`not found: ${url}`);
      return { html };
    },
    model: {
      generate: async (): Promise<ModelAnswer> => ({
        text: '[]',
        usage: { provider: 'chatgpt', model: 'test', tokensIn: 0, tokensOut: 0, costUsd: 0 },
      }),
    } as unknown as CitedPagesDeps['model'],
    nowMs: new Date('2026-09-22').getTime(),
  };
}

// ── URL selection ─────────────────────────────────────────────────────────────

describe('URL selection', () => {
  it('excludes client domain entries', async () => {
    const sourceMap = makeSourceMap([
      { domain: 'client.com', citedCount: 5, urls: ['https://client.com'], isClientDomain: true },
      { domain: 'competitor.com', citedCount: 3, urls: ['https://competitor.com'] },
    ]);
    const deps = makeStubDeps({ 'https://competitor.com': '<html><h1>Comp</h1></html>' });
    const input: CitedPagesInput = {
      entityName: 'Client',
      competitorNames: [],
      sourceMap,
    };
    const result = await analyzeCitedPages(input, deps);
    expect(result.data!.pages.map((p) => p.url)).not.toContain('https://client.com');
    expect(result.data!.pages.map((p) => p.url)).toContain('https://competitor.com');
  });

  it('sorts by citedCount DESC', async () => {
    const sourceMap = makeSourceMap([
      { domain: 'low.com', citedCount: 1, urls: ['https://low.com'] },
      { domain: 'high.com', citedCount: 10, urls: ['https://high.com'] },
    ]);
    const deps = makeStubDeps({
      'https://low.com': '<html><h1>Low</h1></html>',
      'https://high.com': '<html><h1>High</h1></html>',
    });
    const result = await analyzeCitedPages({ entityName: 'E', competitorNames: [], sourceMap }, deps);
    expect(result.data!.pages[0]!.url).toBe('https://high.com');
  });

  it('deduplicates URLs appearing in multiple entries', async () => {
    const sourceMap = makeSourceMap([
      { domain: 'a.com', citedCount: 5, urls: ['https://a.com/page'] },
      { domain: 'a.com', citedCount: 3, urls: ['https://a.com/page'] }, // duplicate URL
    ]);
    const deps = makeStubDeps({ 'https://a.com/page': '<html><h1>A</h1></html>' });
    const result = await analyzeCitedPages({ entityName: 'E', competitorNames: [], sourceMap }, deps);
    expect(result.data!.pages).toHaveLength(1);
  });
});

// ── maxPages limit ────────────────────────────────────────────────────────────

describe('maxPages limit', () => {
  it('limits to maxPages', async () => {
    const pages: Record<string, string> = {};
    const urls: string[] = [];
    for (let i = 0; i < 15; i++) {
      const url = `https://site${i}.com`;
      urls.push(url);
      pages[url] = `<html><h1>Page ${i}</h1></html>`;
    }
    const sourceMap = makeSourceMap(
      urls.map((url, i) => ({ domain: `site${i}.com`, citedCount: 15 - i, urls: [url] })),
    );
    const deps = makeStubDeps(pages);
    const result = await analyzeCitedPages({ entityName: 'E', competitorNames: [], sourceMap, maxPages: 10 }, deps);
    expect(result.data!.analyzedPageCount).toBeLessThanOrEqual(10);
  });
});

// ── client mention detection ──────────────────────────────────────────────────

describe('client mention detection', () => {
  it('sets mentionsClient true when entity name appears in page text', async () => {
    const sourceMap = makeSourceMap([
      { domain: 'review.com', citedCount: 3, urls: ['https://review.com'] },
    ]);
    const deps = makeStubDeps({
      'https://review.com': '<html><p>Best tools: Acme Corp and others</p></html>',
    });
    const result = await analyzeCitedPages({ entityName: 'Acme Corp', competitorNames: [], sourceMap }, deps);
    expect(result.data!.pages[0]!.mentionsClient).toBe(true);
  });

  it('sets mentionsClient false when entity name is absent', async () => {
    const sourceMap = makeSourceMap([
      { domain: 'review.com', citedCount: 2, urls: ['https://review.com'] },
    ]);
    const deps = makeStubDeps({
      'https://review.com': '<html><p>A list of tools for developers</p></html>',
    });
    const result = await analyzeCitedPages({ entityName: 'Acme Corp', competitorNames: [], sourceMap }, deps);
    expect(result.data!.pages[0]!.mentionsClient).toBe(false);
  });
});

// ── competitor mention detection ──────────────────────────────────────────────

describe('competitor mention detection', () => {
  it('lists competitor names found on the page', async () => {
    const sourceMap = makeSourceMap([
      { domain: 'review.com', citedCount: 3, urls: ['https://review.com'] },
    ]);
    const deps = makeStubDeps({
      'https://review.com': '<html><p>Compare RivalA and RivalB for your workflow</p></html>',
    });
    const result = await analyzeCitedPages({
      entityName: 'Acme',
      competitorNames: ['RivalA', 'RivalB', 'RivalC'],
      sourceMap,
    }, deps);
    expect(result.data!.pages[0]!.mentionedCompetitors).toContain('RivalA');
    expect(result.data!.pages[0]!.mentionedCompetitors).toContain('RivalB');
    expect(result.data!.pages[0]!.mentionedCompetitors).not.toContain('RivalC');
  });
});

// ── pagesWithClientMentionCount ───────────────────────────────────────────────

describe('pagesWithClientMentionCount', () => {
  it('counts pages that mention the client', async () => {
    const sourceMap = makeSourceMap([
      { domain: 'a.com', citedCount: 3, urls: ['https://a.com'] },
      { domain: 'b.com', citedCount: 2, urls: ['https://b.com'] },
      { domain: 'c.com', citedCount: 1, urls: ['https://c.com'] },
    ]);
    const deps = makeStubDeps({
      'https://a.com': '<html><p>Acme is great</p></html>',
      'https://b.com': '<html><p>Acme also works</p></html>',
      'https://c.com': '<html><p>No mention here</p></html>',
    });
    const result = await analyzeCitedPages({ entityName: 'Acme', competitorNames: [], sourceMap }, deps);
    expect(result.data!.pagesWithClientMentionCount).toBe(2);
  });
});

// ── medians ───────────────────────────────────────────────────────────────────

describe('median computation', () => {
  it('computes medianNumericFactsPer1kWords from page stats', async () => {
    const sourceMap = makeSourceMap([
      { domain: 'a.com', citedCount: 3, urls: ['https://a.com'] },
      { domain: 'b.com', citedCount: 2, urls: ['https://b.com'] },
      { domain: 'c.com', citedCount: 1, urls: ['https://c.com'] },
    ]);
    // a: contains numbers (500%, 3x), b: no numbers, c: one number (42)
    const deps = makeStubDeps({
      'https://a.com': '<html><p>We grew 500% and 3x in 2025.</p></html>',
      'https://b.com': '<html><p>Plain text without any numbers at all here.</p></html>',
      'https://c.com': '<html><p>Our score is 42 points out of hundred.</p></html>',
    });
    const result = await analyzeCitedPages({ entityName: 'E', competitorNames: [], sourceMap }, deps);
    expect(result.data!.medianNumericFactsPer1kWords).toBeGreaterThanOrEqual(0);
  });

  it('returns null medianAgeDays when no pages have dates', async () => {
    const sourceMap = makeSourceMap([
      { domain: 'nodates.com', citedCount: 2, urls: ['https://nodates.com'] },
    ]);
    const deps = makeStubDeps({
      'https://nodates.com': '<html><p>No date info here at all</p></html>',
    });
    const result = await analyzeCitedPages({ entityName: 'E', competitorNames: [], sourceMap }, deps);
    expect(result.data!.medianAgeDays).toBeNull();
  });

  it('computes medianAgeDays from pages with known dates', async () => {
    const nowMs = new Date('2026-09-22').getTime();
    const sourceMap = makeSourceMap([
      { domain: 'a.com', citedCount: 3, urls: ['https://a.com'] },
      { domain: 'b.com', citedCount: 2, urls: ['https://b.com'] },
    ]);
    const deps = makeStubDeps({
      'https://a.com': '<html><script type="application/ld+json">{"dateModified":"2026-09-01"}</script></html>',
      'https://b.com': '<html><script type="application/ld+json">{"dateModified":"2026-09-11"}</script></html>',
    });
    deps.nowMs = nowMs;
    const result = await analyzeCitedPages({ entityName: 'E', competitorNames: [], sourceMap }, deps);
    // a: 21 days, b: 11 days, median = 16
    expect(result.data!.medianAgeDays).toBe(16);
  });
});

// ── error handling ────────────────────────────────────────────────────────────

describe('error handling', () => {
  it('skips pages that fail to fetch and does not count them', async () => {
    const sourceMap = makeSourceMap([
      { domain: 'fail.com', citedCount: 5, urls: ['https://fail.com'] },
    ]);
    const deps: CitedPagesDeps = {
      getPageData: async () => { throw new Error('network error'); },
      model: { generate: async () => ({ text: '[]', usage: { provider: 'chatgpt', model: 't', tokensIn: 0, tokensOut: 0, costUsd: 0 } }) } as unknown as CitedPagesDeps['model'],
      nowMs: Date.now(),
    };
    const result = await analyzeCitedPages({ entityName: 'E', competitorNames: [], sourceMap }, deps);
    expect(result.status).toBe('ok');
    expect(result.data!.analyzedPageCount).toBe(0);
  });

  it('falls back to false structure when LLM fails', async () => {
    const sourceMap = makeSourceMap([
      { domain: 'test.com', citedCount: 2, urls: ['https://test.com'] },
    ]);
    const deps: CitedPagesDeps = {
      getPageData: async () => ({ html: '<html><h1>Test</h1><p>Content here</p></html>' }),
      model: { generate: async () => { throw new Error('timeout'); } } as unknown as CitedPagesDeps['model'],
      nowMs: Date.now(),
    };
    const result = await analyzeCitedPages({ entityName: 'E', competitorNames: [], sourceMap }, deps);
    expect(result.status).toBe('ok');
    expect(result.data!.pages[0]!.structure.hasAnswerFirstParagraph).toBe(false);
  });

  it('returns ok with empty pages when all source map entries are client domain', async () => {
    const sourceMap = makeSourceMap([
      { domain: 'client.com', citedCount: 10, urls: ['https://client.com'], isClientDomain: true },
    ]);
    const deps = makeStubDeps({});
    const result = await analyzeCitedPages({ entityName: 'Client', competitorNames: [], sourceMap }, deps);
    expect(result.status).toBe('ok');
    expect(result.data!.pages).toHaveLength(0);
    expect(result.data!.analyzedPageCount).toBe(0);
  });
});
