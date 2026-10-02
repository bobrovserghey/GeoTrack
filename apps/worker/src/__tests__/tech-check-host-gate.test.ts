import { describe, it, expect, vi } from 'vitest';
import { scorePillarB } from '@geotrack/core';
import { techCheck } from '../steps/tech-check.js';
import type { TechCheckInput, TechCheckDeps } from '../steps/tech-check.js';
import { HostHaltedError } from '../net/host-gate.js';

/** Minimal pillar-B methodology; mirrors packages/config/methodology.v1.json. */
function makeMethodology(): Parameters<typeof scorePillarB>[1] {
  return {
    version: 1,
    pillars: {
      B: {
        weight: 0.2,
        criteria: {
          b1: { id: 'b1', maxScore: 20 },
          b2: { id: 'b2', maxScore: 25 },
          b3: { id: 'b3', maxScore: 15 },
          b4: { id: 'b4', maxScore: 15 },
          b5: { id: 'b5', maxScore: 15 },
          b6: { id: 'b6', maxScore: 10 },
        },
      },
    },
    blockers: [],
    bands: [{ min: 0, max: 100, label: 'any' }],
    interval: { hRepFallback: 0.3, hCovFactor: 0.5, hRepFactor: 0.3 },
    basket: { realizationFactor: 0.7 },
  };
}

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

describe('techCheck — a halted host leaves B5/B6 unmeasured, not falsely measured', () => {
  const methodology = makeMethodology();
  const allRequests429 = () => vi.fn().mockResolvedValue(new Response('slow down', { status: 429 }));

  it('B5 and B6 report measured:false when nothing at all could be fetched', async () => {
    const result = await techCheck(makeInput(), makeDeps(allRequests429()));
    const { b5, b6 } = result.data!;
    expect(b5.measured).toBe(false);
    expect(b6.measured).toBe(false);
    if (b5.measured || b6.measured) throw new Error('unreachable');
    expect(b5.notMeasuredReason).toMatch(/429/);
    expect(b6.notMeasuredReason).toMatch(/429/);
    expect(result.status).toBe('partial');
  });

  it('pillar B does not count b5/b6 maxScore for measurements that never happened', async () => {
    const result = await techCheck(makeInput(), makeDeps(allRequests429()));
    const scored = scorePillarB(result.data!, methodology, new Date('2026-01-01'));
    expect(scored.unmeasuredCriteria).toContain('b5');
    expect(scored.unmeasuredCriteria).toContain('b6');
    expect(scored.criterionScores.b6.score).toBe(0);
    // b1 (robots.txt text, no request) + b2 (its own 429) only.
    expect(scored.measuredMaxSum).toBe(
      scored.criterionScores.b1.maxScore + scored.criterionScores.b2.maxScore,
    );
  });

  it('a fetched sitemap keeps B5 measured with zero page results, but not B6', async () => {
    // B5: the sitemap answer is real data worth 5 of its 15 points and its page
    // half early-returns to 0, so staying measured is conservative.
    // B6 is different and must report measured:false here: scoreB6 derives at
    // most 4 of 10 points from sitemapLastmod and DEFAULTS the other 6 whenever
    // no page answered, so a sitemap-only answer would collect 6 undeserved
    // points. Expectation changed on that authority (see the comment on the
    // pagesAnswered guard in steps/tech-check.ts and docs/specs/debt.md).
    const fetchFn = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.headers) return new Response('<html></html>', { status: 200 }); // B2 bot probes
      if (url.endsWith('/sitemap.xml')) return new Response(SITEMAP_XML, { status: 200 });
      return new Response('slow down', { status: 429 });
    });
    const input = makeInput({ keyPages: ['https://example.com/a'] });
    const result = await techCheck(input, makeDeps(fetchFn));
    const { b5, b6 } = result.data!;
    if (!b5.measured) throw new Error('sitemap data should keep B5 measured');
    expect(b5.sitemapPresent).toBe(true);
    expect(b5.pageResults).toEqual([]);
    expect(b6.measured).toBe(false);
    if (b6.measured) throw new Error('unreachable');
    expect(b6.notMeasuredReason).toMatch(/429/);
    const scored = scorePillarB(result.data!, methodology, new Date('2026-01-01'));
    expect(scored.unmeasuredCriteria).toContain('b6');
    expect(scored.criterionScores.b6.score).toBe(0);
  });

  it('a 404 sitemap is an answer: B5/B6 stay measured', async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) =>
      url.endsWith('/sitemap.xml')
        ? new Response('', { status: 404 })
        : new Response('<html></html>', { status: 200 }),
    );
    const result = await techCheck(makeInput(), makeDeps(fetchFn));
    expect(result.data!.b5.measured).toBe(true);
    expect(result.data!.b6.measured).toBe(true);
  });

  it.each([500, 503])('a %i sitemap is not an answer: it must not count as "no sitemap"', async (status) => {
    // 5xx is the server failing, not a statement about the sitemap. With the
    // pages halted too, the host answered nothing at all, so neither B5 nor B6
    // may be reported as measured and sitemapPresent:false must not be recorded.
    const fetchFn = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.headers) throw new Error('ECONNRESET'); // B2 bot probes: no 429 halt
      if (url.endsWith('/sitemap.xml')) return new Response('', { status });
      return new Response('slow down', { status: 429 });
    });
    const result = await techCheck(makeInput(), makeDeps(fetchFn));
    const { b5, b6 } = result.data!;
    expect(b5.measured).toBe(false);
    expect(b6.measured).toBe(false);
    const scored = scorePillarB(result.data!, methodology, new Date('2026-01-01'));
    expect(scored.unmeasuredCriteria).toEqual(expect.arrayContaining(['b5', 'b6']));
    expect(result.notes.some((n) => n.includes(`sitemap.xml: ${status}`))).toBe(true);
  });

  it('B2 reports measured:false when the host halted before any bot request', async () => {
    // Independent of queue order: the gate can refuse B2's first request outright.
    const fetchFn = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.headers) throw new HostHaltedError('example.com');
      return new Response('<html></html>', { status: 200 });
    });
    const result = await techCheck(makeInput(), makeDeps(fetchFn));
    const b2 = result.data!.b2;
    expect(b2.measured).toBe(false);
    if (b2.measured) throw new Error('unreachable');
    expect(b2.notMeasuredReason).toMatch(/429/);
    expect(scorePillarB(result.data!, methodology, new Date('2026-01-01')).unmeasuredCriteria)
      .toContain('b2');
  });
});

describe('techCheck — a hung render does not stall the host queue', () => {
  it('times the render out, degrades B3 and still completes the other checks', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => new Response('<html></html>', { status: 200 }));
    const deps = makeDeps(fetchFn, {
      getPageText: vi.fn().mockImplementation(() => new Promise(() => {})),
      taskTimeoutMs: 20,
    });
    const result = await techCheck(makeInput(), deps);
    const b3 = result.data!.b3;
    expect(b3.measured).toBe(false);
    if (b3.measured) throw new Error('unreachable');
    expect(b3.notMeasuredReason).toMatch(/did not finish/);
    // B2 (8 bots), the sitemap and the B5/B6 probes all got through.
    expect(fetchFn.mock.calls.length).toBeGreaterThanOrEqual(11);
    expect(result.data!.b5.measured).toBe(true);
    expect(result.data!.b6.measured).toBe(true);
    expect(result.status).toBe('partial');
  }, 10_000);
});

describe('techCheck — degradation notes stay bounded', () => {
  it('collapses repeats and caps the list when every request to 10 pages fails', async () => {
    // Without deduping this produces one note per bot per page (40 for B2 alone)
    // plus one per B5/B6 page — all of it persisted into StepResult.notes.
    const keyPages = Array.from({ length: 10 }, (_, i) => `https://example.com/p${i}`);
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const result = await techCheck(makeInput({ keyPages }), makeDeps(fetchFn));
    expect(fetchFn.mock.calls.length).toBeGreaterThan(40);
    const degradedNotes = result.notes.filter((n) => n.startsWith('degraded:'));
    expect(degradedNotes.length).toBeLessThanOrEqual(11); // cap + suppression summary
    expect(new Set(degradedNotes).size).toBe(degradedNotes.length);
    // The information is kept: repeats are counted, not dropped.
    expect(degradedNotes.some((n) => /\(x\d+\)/.test(n))).toBe(true);
    expect(result.status).toBe('partial');
  }, 10_000);
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
