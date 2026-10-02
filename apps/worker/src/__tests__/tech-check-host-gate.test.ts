import { describe, it, expect, vi } from 'vitest';
import { techCheck } from '../steps/tech-check.js';
import type { TechCheckInput, TechCheckDeps } from '../steps/tech-check.js';

const SITEMAP_XML = `<urlset>
  <url><loc>https://example.com/</loc><lastmod>2025-01-01</lastmod></url>
</urlset>`;

function makeInput(overrides: Partial<TechCheckInput> = {}): TechCheckInput {
  return {
    origin: 'https://example.com',
    robotsTxt: 'User-agent: *\nDisallow:\n',
    sitemapUrls: [],
    keyPages: ['https://example.com/'],
    serpApiKey: undefined,
    serpApiRequests: 2,
    ...overrides,
  };
}

function makeDeps(fetchFn: TechCheckDeps['fetchFn'], overrides: Partial<TechCheckDeps> = {}): TechCheckDeps {
  return {
    fetchFn,
    getPageText: vi.fn().mockResolvedValue({ rawText: 'a', renderedText: 'a' }),
    domainPauseMs: 0,
    ...overrides,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('techCheck — one request at a time per host (A)', () => {
  it('never runs two requests to the same host concurrently and keeps the pause between them', async () => {
    const PAUSE = 40;
    let inFlight = 0;
    let maxInFlight = 0;
    const starts: number[] = [];
    const ends: number[] = [];
    const fetchFn = vi.fn().mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      starts.push(Date.now());
      await sleep(5);
      inFlight--;
      ends.push(Date.now());
      return new Response('<html></html>', { status: 200 });
    });

    await techCheck(makeInput(), makeDeps(fetchFn, { domainPauseMs: PAUSE }));

    expect(maxInFlight).toBe(1);
    expect(starts.length).toBeGreaterThan(5);
    for (let i = 1; i < starts.length; i++) {
      // 5 ms of slack for timer rounding
      expect(starts[i]! - ends[i - 1]!).toBeGreaterThanOrEqual(PAUSE - 5);
    }
  });

  it('different hosts are not queued behind each other (SerpAPI vs the audited site)', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await sleep(20);
      inFlight--;
      return url.includes('serpapi.com')
        ? new Response(JSON.stringify({ organic_results: [] }), { status: 200 })
        : new Response('ok', { status: 200 });
    });
    await techCheck(makeInput({ serpApiKey: 'k' }), makeDeps(fetchFn));
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it('a 429 on the host stops every other request to it, including B3', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('slow down', { status: 429 }));
    const deps = makeDeps(fetchFn);
    const result = await techCheck(makeInput(), deps);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(deps.getPageText).not.toHaveBeenCalled();
    const b2 = result.data!.b2;
    if (!b2.measured) throw new Error('B2 should report its own 429');
    expect(b2.stoppedOn429).toBe(true);
    expect(result.status).toBe('partial');
  });

  it('a 429 seen by B2 mid-run stops B5/B6 requests that come after it', async () => {
    let n = 0;
    const fetchFn = vi.fn().mockImplementation(async () => {
      n++;
      return new Response('x', { status: n === 4 ? 429 : 200 });
    });
    const result = await techCheck(makeInput(), makeDeps(fetchFn));
    expect(fetchFn).toHaveBeenCalledTimes(4);
    const b2 = result.data!.b2;
    if (!b2.measured) throw new Error('B2 should have partial results');
    expect(b2.stoppedOn429).toBe(true);
  });

  it('a failing request does not wedge the host queue', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const result = await techCheck(makeInput(), makeDeps(fetchFn));
    expect(result.data!.b5.measured).toBe(true);
    expect(fetchFn.mock.calls.length).toBeGreaterThan(5);
  });
});

describe('techCheck — sitemap.xml is requested once (B)', () => {
  it('B5 and B6 share a single request', async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) =>
      url.endsWith('/sitemap.xml')
        ? new Response(SITEMAP_XML, { status: 200 })
        : new Response('<html></html>', { status: 200 }),
    );
    const result = await techCheck(makeInput(), makeDeps(fetchFn));

    const sitemapCalls = fetchFn.mock.calls.filter(([u]) => String(u).endsWith('/sitemap.xml'));
    expect(sitemapCalls).toHaveLength(1);
    const b5 = result.data!.b5;
    const b6 = result.data!.b6;
    if (!b5.measured || !b6.measured) throw new Error('not measured');
    expect(b5.sitemapPresent).toBe(true);
    expect(b5.sitemapUrlCount).toBe(1);
    expect(b6.sitemapLastmod).toBe('2025-01-01');
  });
});

describe('techCheck — ttfbMs excludes queueing and the domain pause (C)', () => {
  it('measures only the time inside fetchFn, even when the underlying fetch applies its own pause', async () => {
    // Mirrors safe-fetch's makePause: reads "last" before awaiting, so concurrent
    // callers all see a stale value; serialized callers never wait.
    const PAUSE = 80;
    const last = new Map<string, number>();
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      const host = new URL(url).hostname;
      const wait = PAUSE - (Date.now() - (last.get(host) ?? 0));
      if (wait > 0) await sleep(wait);
      last.set(host, Date.now());
      await sleep(10);
      return new Response('<html></html>', { status: 200 });
    });

    const keyPages = ['https://example.com/', 'https://example.com/a', 'https://example.com/b'];
    const result = await techCheck(makeInput({ keyPages }), makeDeps(fetchFn, { domainPauseMs: PAUSE }));

    const b5 = result.data!.b5;
    if (!b5.measured) throw new Error('B5 not measured');
    expect(b5.pageResults).toHaveLength(3);
    // The first call to a host may wait on the mock's own pause only when it is not
    // the first; everything the gate spaces out must report ~latency, not the pause.
    for (const p of b5.pageResults) expect(p.ttfbMs).toBeLessThan(PAUSE - 20);
  }, 20_000);
});

describe('techCheck — injectable clock (D)', () => {
  const lastModifiedFetch = vi.fn().mockImplementation(async (url: string) =>
    url.endsWith('/sitemap.xml')
      ? new Response('', { status: 404 })
      : new Response('', { status: 200, headers: { 'Last-Modified': 'Wed, 01 Jan 2025 00:00:00 GMT' } }),
  );

  it('counts a page stale relative to deps.nowMs', async () => {
    const later = await techCheck(
      makeInput(),
      makeDeps(lastModifiedFetch, { nowMs: new Date('2030-01-01').getTime() }),
    );
    const earlier = await techCheck(
      makeInput(),
      makeDeps(lastModifiedFetch, { nowMs: new Date('2025-03-01').getTime() }),
    );
    const b6Later = later.data!.b6;
    const b6Earlier = earlier.data!.b6;
    if (!b6Later.measured || !b6Earlier.measured) throw new Error('B6 not measured');
    expect(b6Later.stalePageCount).toBe(1);
    expect(b6Earlier.stalePageCount).toBe(0);
  });
});

describe('techCheck — status reflects degradation (E)', () => {
  it('ok when every request succeeds', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => new Response('<html></html>', { status: 200 }));
    const result = await techCheck(makeInput(), makeDeps(fetchFn));
    expect(result.status).toBe('ok');
  });

  it('partial when some requests fail with network errors', async () => {
    const fetchFn = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') throw new Error('ECONNRESET');
      return new Response('<html></html>', { status: 200 });
    });
    const result = await techCheck(makeInput(), makeDeps(fetchFn));
    expect(result.status).toBe('partial');
    expect(result.notes.some((n) => n.includes('B6'))).toBe(true);
  });

  it('partial when B3 (page rendering) fails', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => new Response('<html></html>', { status: 200 }));
    const result = await techCheck(
      makeInput(),
      makeDeps(fetchFn, { getPageText: vi.fn().mockRejectedValue(new Error('Playwright unavailable')) }),
    );
    expect(result.status).toBe('partial');
  });

  it('partial when SerpAPI fails', async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) =>
      url.includes('serpapi.com')
        ? new Response('', { status: 503 })
        : new Response('<html></html>', { status: 200 }),
    );
    const result = await techCheck(makeInput({ serpApiKey: 'k' }), makeDeps(fetchFn));
    expect(result.status).toBe('partial');
  });

  it('a missing SerpAPI key is a configuration choice, not degradation', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => new Response('<html></html>', { status: 200 }));
    const result = await techCheck(makeInput({ serpApiKey: undefined }), makeDeps(fetchFn));
    expect(result.status).toBe('ok');
  });
});
