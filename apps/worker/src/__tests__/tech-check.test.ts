import { describe, it, expect, vi } from 'vitest';
import { techCheck, extractText } from '../steps/tech-check.js';
import type { TechCheckInput, TechCheckDeps } from '../steps/tech-check.js';
import { TechCheckFactsSchema } from '@geotrack/core/steps/tech-check';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ROBOTS_ALLOW_ALL = 'User-agent: *\nDisallow:\n';
const ROBOTS_BLOCK_ALL = 'User-agent: *\nDisallow: /\n';

const SITEMAP_XML = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc><lastmod>2025-01-01</lastmod></url>
  <url><loc>https://example.com/about</loc><lastmod>2024-06-01</lastmod></url>
</urlset>`;

const PAGE_WITH_CANONICAL = `<html><head>
  <link rel="canonical" href="https://example.com/about"/>
</head><body><p>About page</p></body></html>`;

const PAGE_NO_JS = `<html><body><div id="app"></div><script>
  document.getElementById('app').innerHTML = '<p>Rendered content here</p>';
</script></body></html>`;

const PAGE_NORMAL = '<html><body><p>Normal page content</p></body></html>';

function makeBaseInput(overrides: Partial<TechCheckInput> = {}): TechCheckInput {
  return {
    origin: 'https://example.com',
    robotsTxt: ROBOTS_ALLOW_ALL,
    sitemapUrls: ['https://example.com/', 'https://example.com/about'],
    keyPages: ['https://example.com/', 'https://example.com/about'],
    serpApiKey: undefined,
    serpApiRequests: 2,
    ...overrides,
  };
}

function makeFetch(
  responses: Record<string, { status: number; body: string; headers?: Record<string, string> }>,
  fallback = { status: 200, body: PAGE_NORMAL },
) {
  return vi.fn().mockImplementation((url: string) => {
    const key = Object.keys(responses).find((k) => url.includes(k));
    const resp = key ? responses[key]! : fallback;
    return Promise.resolve(
      new Response(resp.body, {
        status: resp.status,
        headers: { 'Content-Type': 'text/html', ...(resp.headers ?? {}) },
      }),
    );
  });
}

function makeGetPageText(rawText: string, renderedText: string): TechCheckDeps['getPageText'] {
  return vi.fn().mockResolvedValue({ rawText, renderedText });
}

function makeDeps(overrides: Partial<TechCheckDeps> = {}): TechCheckDeps {
  return {
    fetchFn: makeFetch({}),
    getPageText: makeGetPageText('raw content here', 'raw content here and more rendered content'),
    domainPauseMs: 0, // no delay in tests
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// B1 robots.txt
// ---------------------------------------------------------------------------

describe('techCheck B1 — robots.txt', () => {
  it('returns measured:true with robotsTxtPresent:true when robots.txt exists', async () => {
    const result = await techCheck(makeBaseInput(), makeDeps());
    expect(result.status).toBe('ok');
    const b1 = result.data!.b1;
    expect(b1.measured).toBe(true);
    if (b1.measured) {
      expect(b1.robotsTxtPresent).toBe(true);
    }
  });

  it('robotsTxtPresent:false when robots.txt is empty', async () => {
    const result = await techCheck(makeBaseInput({ robotsTxt: '' }), makeDeps());
    const b1 = result.data!.b1;
    expect(b1.measured).toBe(true);
    if (b1.measured) expect(b1.robotsTxtPresent).toBe(false);
  });

  it('block all bots: all permissions = "blocked"', async () => {
    const result = await techCheck(makeBaseInput({ robotsTxt: ROBOTS_BLOCK_ALL }), makeDeps());
    const b1 = result.data!.b1;
    if (!b1.measured) throw new Error('B1 not measured');
    for (const [, perm] of Object.entries(b1.permissions)) {
      expect(perm).toBe('blocked');
    }
  });

  it('allow all bots: all permissions = "allowed"', async () => {
    const result = await techCheck(makeBaseInput({ robotsTxt: ROBOTS_ALLOW_ALL }), makeDeps());
    const b1 = result.data!.b1;
    if (!b1.measured) throw new Error('B1 not measured');
    for (const [, perm] of Object.entries(b1.permissions)) {
      expect(perm).toBe('allowed');
    }
  });

  it('specific bot block overrides wildcard allow', async () => {
    const robots = 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow:\n';
    const result = await techCheck(makeBaseInput({ robotsTxt: robots }), makeDeps());
    const b1 = result.data!.b1;
    if (!b1.measured) throw new Error('B1 not measured');
    expect(b1.permissions['GPTBot']).toBe('blocked');
    expect(b1.permissions['ClaudeBot']).toBe('allowed');
  });
});

// ---------------------------------------------------------------------------
// B2 — server/CDN blocks
// ---------------------------------------------------------------------------

describe('techCheck B2 — user-agent requests', () => {
  it('returns measured:true with results array', async () => {
    const result = await techCheck(makeBaseInput(), makeDeps());
    const b2 = result.data!.b2;
    expect(b2.measured).toBe(true);
    if (b2.measured) {
      expect(Array.isArray(b2.results)).toBe(true);
    }
  });

  it('stops on 429 and marks stoppedOn429:true', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response('Too Many Requests', { status: 429 }),
    );
    const result = await techCheck(
      makeBaseInput(),
      makeDeps({ fetchFn, domainPauseMs: 0 }),
    );
    const b2 = result.data!.b2;
    if (!b2.measured) throw new Error('B2 not measured');
    expect(b2.stoppedOn429).toBe(true);
  });

  it('marks 403 responses as blocked:true', async () => {
    const fetchFn = makeFetch({
      'example.com': { status: 403, body: 'Forbidden' },
    });
    const result = await techCheck(
      makeBaseInput(),
      makeDeps({ fetchFn, domainPauseMs: 0 }),
    );
    const b2 = result.data!.b2;
    if (!b2.measured) throw new Error('B2 not measured');
    const blocked = b2.results.filter((r) => r.blocked);
    expect(blocked.length).toBeGreaterThan(0);
  });

  it('not measured when no key pages', async () => {
    const result = await techCheck(makeBaseInput({ keyPages: [] }), makeDeps());
    const b2 = result.data!.b2;
    expect(b2.measured).toBe(false);
  });

  it('respects domainPauseMs between B2 requests (identified by User-Agent header)', async () => {
    const b2Timestamps: number[] = [];
    const fetchFn = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      const ua = (init?.headers as Record<string, string> | undefined)?.['User-Agent'];
      if (ua) b2Timestamps.push(Date.now());
      return Promise.resolve(new Response('ok', { status: 200 }));
    });
    await techCheck(
      makeBaseInput({ keyPages: ['https://example.com/'] }),
      makeDeps({ fetchFn, domainPauseMs: 50 }),
    );
    // B2 makes 8 bot × 1 page = 8 requests; each pair should be ≥ 40ms apart
    expect(b2Timestamps.length).toBeGreaterThan(1);
    for (let i = 1; i < b2Timestamps.length; i++) {
      expect(b2Timestamps[i]! - b2Timestamps[i - 1]!).toBeGreaterThanOrEqual(40);
    }
  });
});

// ---------------------------------------------------------------------------
// B3 — JS rendering
// ---------------------------------------------------------------------------

describe('techCheck B3 — JS rendering', () => {
  it('returns measured:true with content ratio', async () => {
    const result = await techCheck(
      makeBaseInput(),
      makeDeps({
        getPageText: makeGetPageText('short raw', 'much longer rendered content here'),
      }),
    );
    const b3 = result.data!.b3;
    expect(b3.measured).toBe(true);
    if (b3.measured) {
      expect(b3.contentRatio).toBeLessThan(1);
      expect(b3.rawTextLength).toBeLessThan(b3.renderedTextLength);
    }
  });

  it('ratio = 1 when page text is equal with or without JS', async () => {
    const result = await techCheck(
      makeBaseInput(),
      makeDeps({ getPageText: makeGetPageText('same content', 'same content') }),
    );
    const b3 = result.data!.b3;
    if (!b3.measured) throw new Error('B3 not measured');
    expect(b3.contentRatio).toBe(1);
  });

  it('fixture: no-JS page has much lower rawTextLength than renderedTextLength', () => {
    const raw = extractText(PAGE_NO_JS);
    // Raw HTML has only whitespace/script tag content, no actual text
    const rendered = 'Rendered content here';
    expect(raw.length).toBeLessThan(rendered.length);
  });

  it('measured:false when getPageText throws', async () => {
    const result = await techCheck(
      makeBaseInput(),
      makeDeps({
        getPageText: vi.fn().mockRejectedValue(new Error('Playwright unavailable')),
      }),
    );
    const b3 = result.data!.b3;
    expect(b3.measured).toBe(false);
    if (!b3.measured) expect(b3.notMeasuredReason).toContain('Playwright');
  });
});

// ---------------------------------------------------------------------------
// B4 — Bing indexation (SerpAPI)
// ---------------------------------------------------------------------------

describe('techCheck B4 — Bing indexation', () => {
  it('not measured when no serpApiKey', async () => {
    const result = await techCheck(makeBaseInput({ serpApiKey: undefined }), makeDeps());
    const b4 = result.data!.b4;
    expect(b4.measured).toBe(false);
    if (!b4.measured) expect(b4.notMeasuredReason).toContain('SerpAPI key');
  });

  it('not measured when SerpAPI returns non-200', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
    const result = await techCheck(
      makeBaseInput({ serpApiKey: 'key123', serpApiRequests: 2 }),
      makeDeps({ fetchFn, domainPauseMs: 0 }),
    );
    const b4 = result.data!.b4;
    expect(b4.measured).toBe(false);
  });

  it('not measured when SerpAPI network error', async () => {
    const fetchFn = vi.fn().mockImplementation((url: string) => {
      if (url.includes('serpapi.com')) throw new Error('ECONNREFUSED');
      return Promise.resolve(new Response('ok', { status: 200 }));
    });
    const result = await techCheck(
      makeBaseInput({ serpApiKey: 'key123', serpApiRequests: 2 }),
      makeDeps({ fetchFn, domainPauseMs: 0 }),
    );
    const b4 = result.data!.b4;
    expect(b4.measured).toBe(false);
    if (!b4.measured) expect(b4.notMeasuredReason).toBe('SerpAPI unavailable');
  });

  it('teaser profile: makes exactly serpApiRequests=2 calls to SerpAPI', async () => {
    const serpCalls: string[] = [];
    const fetchFn = vi.fn().mockImplementation((url: string) => {
      if (url.includes('serpapi.com')) {
        serpCalls.push(url);
        return Promise.resolve(
          new Response(JSON.stringify({ organic_results: [{ title: 'Example' }] }), {
            status: 200,
          }),
        );
      }
      return Promise.resolve(new Response('ok', { status: 200 }));
    });
    const keyPages = [
      'https://example.com/',
      'https://example.com/about',
      'https://example.com/pricing',
    ];
    await techCheck(
      makeBaseInput({ serpApiKey: 'key123', serpApiRequests: 2, keyPages }),
      makeDeps({ fetchFn, domainPauseMs: 0 }),
    );
    expect(serpCalls).toHaveLength(2);
  });

  it('indexed:true when organic_results array is non-empty', async () => {
    const fetchFn = vi.fn().mockImplementation((url: string) => {
      if (url.includes('serpapi.com')) {
        return Promise.resolve(
          new Response(JSON.stringify({ organic_results: [{ title: 'Example' }] }), {
            status: 200,
          }),
        );
      }
      return Promise.resolve(new Response('ok', { status: 200 }));
    });
    const result = await techCheck(
      makeBaseInput({ serpApiKey: 'key123', serpApiRequests: 2 }),
      makeDeps({ fetchFn, domainPauseMs: 0 }),
    );
    const b4 = result.data!.b4;
    if (!b4.measured) throw new Error('B4 not measured');
    expect(b4.pagesChecked[0]!.indexed).toBe(true);
  });

  it('indexed:false when organic_results is empty', async () => {
    const fetchFn = vi.fn().mockImplementation((url: string) => {
      if (url.includes('serpapi.com')) {
        return Promise.resolve(
          new Response(JSON.stringify({ organic_results: [] }), { status: 200 }),
        );
      }
      return Promise.resolve(new Response('ok', { status: 200 }));
    });
    const result = await techCheck(
      makeBaseInput({ serpApiKey: 'key123', serpApiRequests: 2 }),
      makeDeps({ fetchFn, domainPauseMs: 0 }),
    );
    const b4 = result.data!.b4;
    if (!b4.measured) throw new Error('B4 not measured');
    expect(b4.pagesChecked[0]!.indexed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// B5 — technical hygiene
// ---------------------------------------------------------------------------

describe('techCheck B5 — technical hygiene', () => {
  it('detects sitemap presence', async () => {
    const fetchFn = makeFetch({
      'sitemap.xml': { status: 200, body: SITEMAP_XML },
    });
    const result = await techCheck(makeBaseInput(), makeDeps({ fetchFn, domainPauseMs: 0 }));
    const b5 = result.data!.b5;
    if (!b5.measured) throw new Error('B5 not measured');
    expect(b5.sitemapPresent).toBe(true);
  });

  it('sitemapPresent:false when sitemap returns 404', async () => {
    const fetchFn = makeFetch({
      'sitemap.xml': { status: 404, body: 'Not Found' },
    });
    const result = await techCheck(makeBaseInput(), makeDeps({ fetchFn, domainPauseMs: 0 }));
    const b5 = result.data!.b5;
    if (!b5.measured) throw new Error('B5 not measured');
    expect(b5.sitemapPresent).toBe(false);
  });

  it('extracts canonical from page HTML', async () => {
    const fetchFn = makeFetch({
      '/about': { status: 200, body: PAGE_WITH_CANONICAL },
      'sitemap.xml': { status: 404, body: '' },
    });
    const result = await techCheck(
      makeBaseInput({ keyPages: ['https://example.com/about'] }),
      makeDeps({ fetchFn, domainPauseMs: 0 }),
    );
    const b5 = result.data!.b5;
    if (!b5.measured) throw new Error('B5 not measured');
    const page = b5.pageResults.find((p) => p.url.includes('/about'));
    expect(page?.canonical).toBe('https://example.com/about');
  });
});

// ---------------------------------------------------------------------------
// B6 — freshness
// ---------------------------------------------------------------------------

describe('techCheck B6 — freshness signals', () => {
  it('extracts sitemapLastmod from sitemap', async () => {
    const fetchFn = makeFetch({
      'sitemap.xml': { status: 200, body: SITEMAP_XML },
    });
    const result = await techCheck(makeBaseInput(), makeDeps({ fetchFn, domainPauseMs: 0 }));
    const b6 = result.data!.b6;
    if (!b6.measured) throw new Error('B6 not measured');
    expect(b6.sitemapLastmod).toBe('2025-01-01'); // most recent
  });

  it('counts pages with Last-Modified header', async () => {
    const fetchFn = vi.fn().mockImplementation((url: string) => {
      if (url.includes('sitemap.xml')) return Promise.resolve(new Response('', { status: 404 }));
      return Promise.resolve(
        new Response('', {
          status: 200,
          headers: { 'Last-Modified': 'Wed, 01 Jan 2025 00:00:00 GMT' },
        }),
      );
    });
    const result = await techCheck(makeBaseInput(), makeDeps({ fetchFn, domainPauseMs: 0 }));
    const b6 = result.data!.b6;
    if (!b6.measured) throw new Error('B6 not measured');
    expect(b6.pagesWithLastModified).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Overall step
// ---------------------------------------------------------------------------

describe('techCheck — overall', () => {
  it('returns status:ok', async () => {
    const result = await techCheck(makeBaseInput(), makeDeps());
    expect(result.status).toBe('ok');
  });

  it('result validates TechCheckFactsSchema', async () => {
    const result = await techCheck(makeBaseInput(), makeDeps());
    expect(() => TechCheckFactsSchema.parse(result.data)).not.toThrow();
  });

  it('notes include stepVersion:1', async () => {
    const result = await techCheck(makeBaseInput(), makeDeps());
    expect(result.notes).toContain('stepVersion:1');
  });

  it('all 6 criteria are present in output', async () => {
    const result = await techCheck(makeBaseInput(), makeDeps());
    const d = result.data!;
    expect(d).toHaveProperty('b1');
    expect(d).toHaveProperty('b2');
    expect(d).toHaveProperty('b3');
    expect(d).toHaveProperty('b4');
    expect(d).toHaveProperty('b5');
    expect(d).toHaveProperty('b6');
  });
});
