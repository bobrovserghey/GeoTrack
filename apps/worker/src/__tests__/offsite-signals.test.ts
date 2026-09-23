import { describe, it, expect } from 'vitest';
import { collectOffsiteSignals } from '../steps/offsite-signals.js';
import type { OffsiteSignalsDeps, OffsiteSignalsInput } from '../steps/offsite-signals.js';
import type { CitedPagesOutput } from '@geotrack/core/steps/cited-pages';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeCitedPages(overrides: Partial<CitedPagesOutput> = {}): CitedPagesOutput {
  return {
    analyzedPageCount: 10,
    pages: [],
    medianHasAnswerFirstParagraphRatio: 0.5,
    medianHasListsOrTablesRatio: 0.6,
    medianNumericFactsPer1kWords: 8,
    medianAgeDays: 45,
    pagesWithClientMentionCount: 3,
    ...overrides,
  };
}

function makeInput(overrides: Partial<OffsiteSignalsInput> = {}): OffsiteSignalsInput {
  return {
    entityName: 'Acme Corp',
    entityDomain: 'acme.com',
    citedPages: makeCitedPages(),
    serpApiKey: 'test-key',
    ...overrides,
  };
}

type SerpCall = { url: string };

function makeSerpFetch(
  responses: Array<{ ok: boolean; status?: number; body?: Record<string, unknown> }>,
): { fetchFn: OffsiteSignalsDeps['fetchFn']; calls: SerpCall[] } {
  const calls: SerpCall[] = [];
  let idx = 0;
  const fetchFn = async (url: string): Promise<Response> => {
    calls.push({ url });
    const resp = responses[idx++] ?? { ok: true, body: { organic_results: [] } };
    return {
      ok: resp.ok,
      status: resp.status ?? (resp.ok ? 200 : 500),
      json: async () => resp.body ?? {},
    } as unknown as Response;
  };
  return { fetchFn, calls };
}

function serpResult(link: string): Record<string, unknown> {
  return { organic_results: [{ link, title: 'Test', snippet: 'Test' }] };
}

function serpEmpty(): Record<string, unknown> {
  return { organic_results: [] };
}

// ── D1: review platforms ──────────────────────────────────────────────────────

describe('D1 — review platforms', () => {
  it('all 4 platforms found', async () => {
    const { fetchFn } = makeSerpFetch([
      { ok: true, body: serpResult('https://www.g2.com/products/acme-corp/reviews') },
      { ok: true, body: serpResult('https://www.capterra.com/p/123/acme') },
      { ok: true, body: serpResult('https://www.producthunt.com/posts/acme-corp') },
      { ok: true, body: serpResult('https://www.trustpilot.com/review/acme.com') },
      // D4 queries
      { ok: true, body: serpResult('https://linkedin.com/company/acme-corp') },
      { ok: true, body: serpResult('https://www.crunchbase.com/organization/acme-corp') },
    ]);
    const result = await collectOffsiteSignals(makeInput(), { fetchFn });
    expect(result.data.d1.measured).toBe(true);
    expect(result.data.d1.clientPlatformCount).toBe(4);
    expect(result.data.d1.clientPlatforms.every((p) => p.profileFound)).toBe(true);
  });

  it('2 of 4 platforms found', async () => {
    const { fetchFn } = makeSerpFetch([
      { ok: true, body: serpResult('https://www.g2.com/products/acme-corp/reviews') },
      { ok: true, body: serpEmpty() },
      { ok: true, body: serpResult('https://www.producthunt.com/posts/acme-corp') },
      { ok: true, body: serpEmpty() },
      { ok: true, body: serpEmpty() },
      { ok: true, body: serpEmpty() },
    ]);
    const result = await collectOffsiteSignals(makeInput(), { fetchFn });
    expect(result.data.d1.measured).toBe(true);
    expect(result.data.d1.clientPlatformCount).toBe(2);
  });

  it('no platforms found — organic_results empty for all', async () => {
    const responses = Array(6).fill({ ok: true, body: serpEmpty() });
    const { fetchFn } = makeSerpFetch(responses);
    const result = await collectOffsiteSignals(makeInput(), { fetchFn });
    expect(result.data.d1.measured).toBe(true);
    expect(result.data.d1.clientPlatformCount).toBe(0);
  });

  it('serpApiKey undefined → d1 not measured', async () => {
    const { fetchFn } = makeSerpFetch([]);
    const result = await collectOffsiteSignals(
      makeInput({ serpApiKey: undefined }),
      { fetchFn },
    );
    expect(result.data.d1.measured).toBe(false);
    expect(result.data.d1.clientPlatformCount).toBe(0);
    expect(result.data.d1.clientPlatforms).toHaveLength(0);
  });

  it('SerpAPI returns 429 on first D1 request → d1 not measured', async () => {
    const { fetchFn, calls } = makeSerpFetch([
      { ok: false, status: 429 },
      // remaining calls should not happen
    ]);
    const result = await collectOffsiteSignals(makeInput(), { fetchFn });
    expect(result.data.d1.measured).toBe(false);
    // only 1 D1 request was made before error
    expect(calls.filter((c) => c.url.includes('g2.com')).length).toBe(1);
  });

  it('SerpAPI throws on second D1 request → d1 not measured, requestsUsed includes prior calls', async () => {
    let callCount = 0;
    const fetchFn = async (_url: string): Promise<Response> => {
      callCount++;
      if (callCount === 2) throw new Error('network error');
      return {
        ok: true,
        status: 200,
        json: async () => serpResult('https://www.g2.com/products/acme'),
      } as unknown as Response;
    };
    const result = await collectOffsiteSignals(makeInput(), { fetchFn });
    expect(result.data.d1.measured).toBe(false);
    expect(result.data.serpRequestsUsed).toBeGreaterThanOrEqual(1);
  });
});

// ── D2: citation presence ─────────────────────────────────────────────────────

describe('D2 — citation source presence', () => {
  it('measured with correct ratio', async () => {
    const responses = Array(6).fill({ ok: true, body: serpEmpty() });
    const { fetchFn } = makeSerpFetch(responses);
    const citedPages = makeCitedPages({ analyzedPageCount: 10, pagesWithClientMentionCount: 3 });
    const result = await collectOffsiteSignals(makeInput({ citedPages }), { fetchFn });
    expect(result.data.d2.measured).toBe(true);
    expect(result.data.d2.clientPresenceRatio).toBeCloseTo(0.3);
    expect(result.data.d2.pagesWithClientMention).toBe(3);
    expect(result.data.d2.citedPagesAnalyzed).toBe(10);
  });

  it('unmeasured when analyzedPageCount = 0', async () => {
    const responses = Array(6).fill({ ok: true, body: serpEmpty() });
    const { fetchFn } = makeSerpFetch(responses);
    const citedPages = makeCitedPages({ analyzedPageCount: 0, pagesWithClientMentionCount: 0 });
    const result = await collectOffsiteSignals(makeInput({ citedPages }), { fetchFn });
    expect(result.data.d2.measured).toBe(false);
    expect(result.data.d2.clientPresenceRatio).toBe(0);
  });

  it('D2 measured even when serpApiKey absent', async () => {
    const { fetchFn } = makeSerpFetch([]);
    const citedPages = makeCitedPages({ analyzedPageCount: 5, pagesWithClientMentionCount: 2 });
    const result = await collectOffsiteSignals(
      makeInput({ serpApiKey: undefined, citedPages }),
      { fetchFn },
    );
    expect(result.data.d2.measured).toBe(true);
    expect(result.data.d2.clientPresenceRatio).toBeCloseTo(0.4);
  });
});

// ── D4: entity consistency ────────────────────────────────────────────────────

describe('D4 — entity consistency', () => {
  it('both LinkedIn and Crunchbase found', async () => {
    const { fetchFn } = makeSerpFetch([
      // D1 × 4
      ...Array(4).fill({ ok: true, body: serpEmpty() }),
      // D4
      { ok: true, body: serpResult('https://www.linkedin.com/company/acme-corp') },
      { ok: true, body: serpResult('https://www.crunchbase.com/organization/acme-corp') },
    ]);
    const result = await collectOffsiteSignals(makeInput(), { fetchFn });
    expect(result.data.d4.measured).toBe(true);
    expect(result.data.d4.linkedInFound).toBe(true);
    expect(result.data.d4.crunchbaseFound).toBe(true);
    expect(result.data.d4.linkedInUrl).toContain('linkedin.com/company');
  });

  it('only LinkedIn found', async () => {
    const { fetchFn } = makeSerpFetch([
      ...Array(4).fill({ ok: true, body: serpEmpty() }),
      { ok: true, body: serpResult('https://www.linkedin.com/company/acme-corp') },
      { ok: true, body: serpEmpty() },
    ]);
    const result = await collectOffsiteSignals(makeInput(), { fetchFn });
    expect(result.data.d4.linkedInFound).toBe(true);
    expect(result.data.d4.crunchbaseFound).toBe(false);
    expect(result.data.d4.crunchbaseUrl).toBeNull();
  });

  it('neither LinkedIn nor Crunchbase found', async () => {
    const responses = Array(6).fill({ ok: true, body: serpEmpty() });
    const { fetchFn } = makeSerpFetch(responses);
    const result = await collectOffsiteSignals(makeInput(), { fetchFn });
    expect(result.data.d4.measured).toBe(true);
    expect(result.data.d4.linkedInFound).toBe(false);
    expect(result.data.d4.crunchbaseFound).toBe(false);
  });

  it('SerpAPI 503 on D4 → d4 not measured', async () => {
    const { fetchFn } = makeSerpFetch([
      ...Array(4).fill({ ok: true, body: serpEmpty() }),
      { ok: false, status: 503 },
    ]);
    const result = await collectOffsiteSignals(makeInput(), { fetchFn });
    expect(result.data.d4.measured).toBe(false);
  });
});

// ── serpRequestsUsed ──────────────────────────────────────────────────────────

describe('serpRequestsUsed', () => {
  it('counts all D1+D4 requests when all succeed', async () => {
    const responses = Array(6).fill({ ok: true, body: serpEmpty() });
    const { fetchFn } = makeSerpFetch(responses);
    const result = await collectOffsiteSignals(makeInput(), { fetchFn });
    expect(result.data.serpRequestsUsed).toBe(6); // 4 D1 + 2 D4
  });

  it('zero when serpApiKey absent', async () => {
    const { fetchFn } = makeSerpFetch([]);
    const result = await collectOffsiteSignals(
      makeInput({ serpApiKey: undefined }),
      { fetchFn },
    );
    expect(result.data.serpRequestsUsed).toBe(0);
  });
});
