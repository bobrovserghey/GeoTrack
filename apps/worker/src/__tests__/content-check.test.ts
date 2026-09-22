import { describe, it, expect } from 'vitest';
import {
  stripHtml,
  firstNWords,
  extractH1,
  extractTitle,
  isUrlReadable,
  extractLastModified,
  computeStatsFact,
  buildStructurePrompt,
  parseStructureResults,
  buildEntityClarityPrompt,
  parseEntityClarityResult,
} from '../steps/content-check.js';
import { analyzeContent } from '../steps/content-check.js';
import type { ContentCheckDeps, ContentCheckInput } from '../steps/content-check.js';
import type { ModelAdapter, ModelAnswer } from '@geotrack/core';

// ── HTML helpers ────────────────────────────────────────────────────────────

describe('stripHtml', () => {
  it('removes tags and collapses whitespace', () => {
    expect(stripHtml('<h1>Hello</h1> <p>World</p>')).toBe('Hello World');
  });

  it('returns empty string for empty input', () => {
    expect(stripHtml('')).toBe('');
  });

  it('strips script and style content', () => {
    expect(stripHtml('<script>var a=1;</script><style>.a{color:red}</style><h1>Real</h1>')).toBe('Real');
  });

  it('decodes HTML entities', () => {
    expect(stripHtml('<p>A &amp; B &lt;3&gt;</p>')).toBe('A & B <3>');
  });
});

describe('firstNWords', () => {
  it('returns up to N words', () => {
    expect(firstNWords('one two three four five', 3)).toBe('one two three');
  });

  it('returns all words when fewer than N', () => {
    expect(firstNWords('one two', 10)).toBe('one two');
  });
});

describe('extractH1', () => {
  it('extracts first h1 text', () => {
    expect(extractH1('<h1>Main Heading</h1>')).toBe('Main Heading');
  });

  it('returns empty string when no h1', () => {
    expect(extractH1('<h2>Not H1</h2>')).toBe('');
  });

  it('extracts h1 with nested span tags', () => {
    expect(extractH1('<h1 class="title"><span>Real Heading</span></h1>')).toBe('Real Heading');
  });
});

describe('extractTitle', () => {
  it('extracts title tag text', () => {
    expect(extractTitle('<title>Page Title</title>')).toBe('Page Title');
  });
});

// ── C1: intent detection ─────────────────────────────────────────────────────

// Test via analyzeContent with stub getPageData
function makeStubDeps(pages: Record<string, string>): ContentCheckDeps {
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
    } as unknown as ModelAdapter,
    nowMs: new Date('2026-09-22').getTime(),
  };
}

describe('C1 intent detection', () => {
  it('detects pricing page from URL', async () => {
    const deps = makeStubDeps({
      'https://example.com': '<title>Home</title><h1>Welcome</h1>',
      'https://example.com/pricing': '<title>Pricing</title><h1>Plans</h1>',
    });
    const input: ContentCheckInput = {
      domain: 'example.com',
      entityName: 'Example',
      categoryLabel: 'SaaS',
      keyPages: ['https://example.com', 'https://example.com/pricing'],
    };
    const result = await analyzeContent(input, deps);
    expect(result.data!.c1.pageTypeMap.pricing).toBe('https://example.com/pricing');
    expect(result.data!.c1.gapTypes).not.toContain('pricing');
  });

  it('detects alternatives page from title keyword', async () => {
    const deps = makeStubDeps({
      'https://example.com': '<title>Home</title><h1>Welcome</h1>',
      'https://example.com/alt': '<title>Alternatives to Example</title><h1>Alternatives</h1>',
    });
    const input: ContentCheckInput = {
      domain: 'example.com',
      entityName: 'Example',
      categoryLabel: 'SaaS',
      keyPages: ['https://example.com', 'https://example.com/alt'],
    };
    const result = await analyzeContent(input, deps);
    expect(result.data!.c1.pageTypeMap.alternatives).toBe('https://example.com/alt');
  });

  it('includes all missing intent types in gapTypes', async () => {
    const deps = makeStubDeps({
      'https://example.com': '<title>Home</title><h1>Welcome</h1>',
    });
    const input: ContentCheckInput = {
      domain: 'example.com',
      entityName: 'Example',
      categoryLabel: 'SaaS',
      keyPages: ['https://example.com'],
    };
    const result = await analyzeContent(input, deps);
    expect(result.data!.c1.gapTypes).toHaveLength(6); // all gap types
  });

  it('detects docs page from /docs URL', async () => {
    const deps = makeStubDeps({
      'https://example.com': '<title>Home</title>',
      'https://example.com/docs': '<title>Documentation</title>',
    });
    const input: ContentCheckInput = {
      domain: 'example.com',
      entityName: 'Example',
      categoryLabel: 'SaaS',
      keyPages: ['https://example.com', 'https://example.com/docs'],
    };
    const result = await analyzeContent(input, deps);
    expect(result.data!.c1.pageTypeMap.docs).toBe('https://example.com/docs');
  });

  it('detects comparison from -vs- in URL', async () => {
    const deps = makeStubDeps({
      'https://example.com': '<title>Home</title>',
      'https://example.com/example-vs-competitor': '<title>Example vs Competitor</title>',
    });
    const input: ContentCheckInput = {
      domain: 'example.com',
      entityName: 'Example',
      categoryLabel: 'SaaS',
      keyPages: ['https://example.com', 'https://example.com/example-vs-competitor'],
    };
    const result = await analyzeContent(input, deps);
    expect(result.data!.c1.pageTypeMap.comparison).toBeTruthy();
  });
});

// ── C3: stats density ────────────────────────────────────────────────────────

describe('computeStatsFact', () => {
  it('counts numeric facts and computes per-1k-word rate', () => {
    const text = 'We have 500 customers. Our platform grows 3x year over year. Uptime is 99.9%.';
    const fact = computeStatsFact('https://example.com', text);
    expect(fact.wordCount).toBeGreaterThan(0);
    expect(fact.numericFactsPer1kWords).toBeGreaterThan(0);
  });

  it('counts citation patterns', () => {
    const text = 'According to Smith et al. (2023) and Jones (2022), [1] this is true.';
    const fact = computeStatsFact('https://example.com', text);
    expect(fact.citationPatternsPer1kWords).toBeGreaterThan(0);
  });

  it('returns zeros for empty text', () => {
    const fact = computeStatsFact('https://example.com', '');
    expect(fact.numericFactsPer1kWords).toBe(0);
    expect(fact.citationPatternsPer1kWords).toBe(0);
  });

  it('does not double-count numbers with percent or multiplier units', () => {
    const text = 'Growth was 500% and speed 3x faster over year.';
    const fact = computeStatsFact('https://example.com', text);
    // "500%" counted once (NUMERIC), "3x" counted once (NUMERIC)
    // plain "500" and "3" should NOT be double-counted
    expect(fact.numericFactsPer1kWords).toBeLessThan(400);
  });
});

// ── C4: freshness ────────────────────────────────────────────────────────────

describe('extractLastModified', () => {
  it('extracts from JSON-LD dateModified', () => {
    const html = `<script type="application/ld+json">{"dateModified":"2025-03-15"}</script>`;
    expect(extractLastModified(html)).toBe('2025-03-15');
  });

  it('extracts from article:modified_time meta tag', () => {
    const html = `<meta property="article:modified_time" content="2024-11-20T10:00:00Z">`;
    expect(extractLastModified(html)).toBe('2024-11-20');
  });

  it('extracts from visible "Updated:" text', () => {
    const html = `<p>Updated: March 5, 2025</p>`;
    expect(extractLastModified(html)).toBe('2025-03-05');
  });

  it('extracts from "Last updated Month YYYY"', () => {
    const html = `<span>Last updated January 2025</span>`;
    expect(extractLastModified(html)).toBe('2025-01-01');
  });

  it('returns null when no date found', () => {
    expect(extractLastModified('<p>No date here</p>')).toBeNull();
  });

  it('prefers article:modified_time meta over visible text date', () => {
    const html = `<p>Updated: January 2018</p><meta property="article:modified_time" content="2026-09-01T10:00:00Z">`;
    expect(extractLastModified(html)).toBe('2026-09-01');
  });
});

describe('C4 ageDays in analyzeContent', () => {
  it('computes ageDays correctly', async () => {
    const html = `<html><title>Test</title><h1>Test</h1><script type="application/ld+json">{"dateModified":"2026-09-01"}</script></html>`;
    const nowMs = new Date('2026-09-22').getTime();
    const deps = makeStubDeps({ 'https://example.com': html });
    deps.nowMs = nowMs;
    const result = await analyzeContent(
      { domain: 'example.com', entityName: 'Test', categoryLabel: 'SaaS', keyPages: ['https://example.com'] },
      deps,
    );
    expect(result.data!.c4.pages[0]!.ageDays).toBe(21);
  });
});

// ── C6: URL readability ──────────────────────────────────────────────────────

describe('isUrlReadable', () => {
  it('marks clean URL as readable', () => {
    expect(isUrlReadable('https://example.com/blog/how-to-use')).toBe(true);
  });

  it('marks URL with UUID as unreadable', () => {
    expect(isUrlReadable('https://example.com/posts/a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(false);
  });

  it('marks URL with long number segment as unreadable', () => {
    expect(isUrlReadable('https://example.com/article/1234567')).toBe(false);
  });

  it('marks root URL as readable', () => {
    expect(isUrlReadable('https://example.com')).toBe(true);
  });

  it('marks URL with standalone 4-digit year segment as unreadable', () => {
    // "2025" alone in segment → unreadable (4 digits = exactly 4)
    expect(isUrlReadable('https://example.com/blog/2025')).toBe(false);
  });
});

// ── C2: LLM structure prompt/parse ──────────────────────────────────────────

describe('buildStructurePrompt', () => {
  it('contains all page URLs', () => {
    const prompt = buildStructurePrompt([
      { url: 'https://a.com', text: 'Hello world', firstHeading: 'H1', firstParagraph: 'Para' },
      { url: 'https://b.com', text: 'Another text', firstHeading: 'H2', firstParagraph: 'Para2' },
    ]);
    expect(prompt).toContain('https://a.com');
    expect(prompt).toContain('https://b.com');
  });
});

describe('parseStructureResults', () => {
  it('parses valid JSON array', () => {
    const json = JSON.stringify([
      { url: 'https://a.com', hasAnswerFirstParagraph: true, hasQuestionHeaders: false, hasQABlocks: true },
    ]);
    const results = parseStructureResults(json, ['https://a.com']);
    expect(results[0]!.hasAnswerFirstParagraph).toBe(true);
    expect(results[0]!.hasQABlocks).toBe(true);
  });

  it('returns fallback for malformed JSON', () => {
    const results = parseStructureResults('not json', ['https://a.com']);
    expect(results[0]!.hasAnswerFirstParagraph).toBe(false);
  });

  it('fills missing URLs with fallback', () => {
    const results = parseStructureResults('[]', ['https://a.com', 'https://b.com']);
    expect(results).toHaveLength(2);
    expect(results[0]!.url).toBe('https://a.com');
  });
});

// ── C5: entity clarity prompt/parse ─────────────────────────────────────────

describe('buildEntityClarityPrompt', () => {
  it('contains entity name and category', () => {
    const prompt = buildEntityClarityPrompt('Acme Corp', 'CRM Software', 'Acme Corp is a CRM tool.');
    expect(prompt).toContain('Acme Corp');
    expect(prompt).toContain('CRM Software');
  });
});

describe('parseEntityClarityResult', () => {
  it('parses valid JSON', () => {
    const result = parseEntityClarityResult('{"entityMentioned":true,"categoryMentioned":false,"targetAudienceMentioned":true}');
    expect(result!.entityMentioned).toBe(true);
    expect(result!.categoryMentioned).toBe(false);
  });

  it('returns null for malformed input', () => {
    expect(parseEntityClarityResult('not json at all')).toBeNull();
  });
});

// ── full integration: empty pages list ──────────────────────────────────────

describe('analyzeContent edge cases', () => {
  it('returns ok with empty data when all page fetches fail', async () => {
    const deps: ContentCheckDeps = {
      getPageData: async () => { throw new Error('network error'); },
      model: { generate: async () => ({ text: '{}', usage: { provider: 'chatgpt', model: 't', tokensIn: 0, tokensOut: 0, costUsd: 0 } }) } as unknown as ModelAdapter,
      nowMs: Date.now(),
    };
    const result = await analyzeContent(
      { domain: 'example.com', entityName: 'Test', categoryLabel: 'SaaS', keyPages: ['https://example.com'] },
      deps,
    );
    expect(result.status).toBe('ok');
    expect(result.data!.analyzedPageCount).toBe(0);
  });

  it('limits to 10 pages', async () => {
    const pages: Record<string, string> = {};
    const urls: string[] = [];
    for (let i = 0; i < 15; i++) {
      const url = `https://example.com/page${i}`;
      urls.push(url);
      pages[url] = `<html><title>Page ${i}</title><h1>H</h1></html>`;
    }
    const deps = makeStubDeps(pages);
    const result = await analyzeContent(
      { domain: 'example.com', entityName: 'Test', categoryLabel: 'SaaS', keyPages: urls },
      deps,
    );
    expect(result.data!.analyzedPageCount).toBeLessThanOrEqual(10);
  });

  it('returns ok status with fallback structure when LLM fails for C2', async () => {
    const deps: ContentCheckDeps = {
      getPageData: async (url) => ({ html: `<html><title>${url}</title><h1>H</h1></html>` }),
      model: { generate: async () => { throw new Error('timeout'); } } as unknown as ModelAdapter,
      nowMs: Date.now(),
    };
    const result = await analyzeContent(
      { domain: 'example.com', entityName: 'Test', categoryLabel: 'SaaS', keyPages: ['https://example.com'] },
      deps,
    );
    expect(result.status).toBe('ok');
    expect(result.data!.c2.pages[0]!.hasAnswerFirstParagraph).toBe(false); // fallback
  });
});
