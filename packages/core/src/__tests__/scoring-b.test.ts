import { describe, it, expect } from 'vitest';
import { scorePillarB } from '../scoring/pillar-b.js';
import type { TechCheckFacts } from '../steps/tech-check.js';
import type { Methodology } from '@geotrack/config';
import { AI_BOTS } from '../checks/robots.js';

// ---- helpers ----------------------------------------------------------------

const NOW = new Date('2026-09-14T12:00:00Z');

function makeConfig(): Methodology {
  return {
    version: 1,
    pillars: {
      B: {
        weight: 0.20,
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
    blockers: [
      { id: 'b1_all_bots_robots_blocked', pillar: 'B', dependsOn: ['b1'], label: 'All AI bots blocked in robots.txt' },
      { id: 'b2_all_bots_http_blocked',   pillar: 'B', dependsOn: ['b2'], label: 'All AI bots HTTP-blocked' },
      { id: 'b3_no_static_content',       pillar: 'B', dependsOn: ['b3'], label: 'Content is JS-only' },
      { id: 'b4_no_pages_indexed',        pillar: 'B', dependsOn: ['b4'], label: 'No pages indexed' },
    ],
    bands: [
      { min: 0,  max: 30,  label: 'critical'  },
      { min: 31, max: 50,  label: 'poor'       },
      { min: 51, max: 70,  label: 'fair'       },
      { min: 71, max: 85,  label: 'good'       },
      { min: 86, max: 100, label: 'excellent'  },
    ],
    interval: { hRepFallback: 0.3, hCovFactor: 0.5, hRepFactor: 0.3 },
  };
}

function allAllowed(): TechCheckFacts['b1'] {
  return {
    measured: true,
    robotsTxtPresent: true,
    permissions: Object.fromEntries(AI_BOTS.map((b) => [b, 'allowed'])) as TechCheckFacts['b1'] & { measured: true } extends { permissions: infer P } ? P : never,
  };
}

function allBlocked(): TechCheckFacts['b1'] {
  return {
    measured: true,
    robotsTxtPresent: true,
    permissions: Object.fromEntries(AI_BOTS.map((b) => [b, 'blocked'])) as TechCheckFacts['b1'] & { measured: true } extends { permissions: infer P } ? P : never,
  };
}

function b2AllAccessible(): TechCheckFacts['b2'] {
  const results = AI_BOTS.map((bot) => ({ bot, url: 'https://example.com/', statusCode: 200, blocked: false }));
  return { measured: true, results, stoppedOn429: false };
}

function b2AllBlocked(): TechCheckFacts['b2'] {
  const results = AI_BOTS.map((bot) => ({ bot, url: 'https://example.com/', statusCode: 403, blocked: true }));
  return { measured: true, results, stoppedOn429: false };
}

function b3Good(): TechCheckFacts['b3'] {
  return { measured: true, url: 'https://example.com/', rawTextLength: 900, renderedTextLength: 1000, contentRatio: 0.9 };
}

function b3JsOnly(): TechCheckFacts['b3'] {
  return { measured: true, url: 'https://example.com/', rawTextLength: 100, renderedTextLength: 1000, contentRatio: 0.1 };
}

function b4AllIndexed(): TechCheckFacts['b4'] {
  return {
    measured: true,
    pagesChecked: [
      { url: 'https://example.com/', indexed: true },
      { url: 'https://example.com/pricing', indexed: true },
    ],
    requestsUsed: 2,
  };
}

function b4NoneIndexed(): TechCheckFacts['b4'] {
  return {
    measured: true,
    pagesChecked: [
      { url: 'https://example.com/', indexed: false },
      { url: 'https://example.com/pricing', indexed: false },
    ],
    requestsUsed: 2,
  };
}

const PERFECT_PAGE_RESULTS = [
  { url: 'https://example.com/', statusCode: 200, canonical: 'https://example.com/', isRedirect: false, ttfbMs: 200 },
  { url: 'https://example.com/about', statusCode: 200, canonical: 'https://example.com/about', isRedirect: false, ttfbMs: 300 },
] as const;

function b5Perfect(): TechCheckFacts['b5'] {
  return {
    measured: true,
    sitemapPresent: true,
    sitemapUrlCount: 50,
    pageResults: [...PERFECT_PAGE_RESULTS],
  };
}

function b6Fresh(): TechCheckFacts['b6'] {
  return {
    measured: true,
    sitemapLastmod: '2026-09-01',
    pagesWithLastModified: 10,
    stalePageCount: 0,
  };
}

function b6Stale(): TechCheckFacts['b6'] {
  return {
    measured: true,
    sitemapLastmod: '2022-01-01',
    pagesWithLastModified: 5,
    stalePageCount: 8,
  };
}

function perfectFacts(): TechCheckFacts {
  return {
    b1: allAllowed(),
    b2: b2AllAccessible(),
    b3: b3Good(),
    b4: b4AllIndexed(),
    b5: b5Perfect(),
    b6: b6Fresh(),
  };
}

function notMeasured(reason = 'unavailable'): { measured: false; notMeasuredReason: string } {
  return { measured: false, notMeasuredReason: reason };
}

// ---- B1 tests ---------------------------------------------------------------

describe('scorePillarB – B1 (robots.txt permissions)', () => {
  it('all bots allowed → B1 score = 20', () => {
    const result = scorePillarB({ ...perfectFacts(), b1: allAllowed() }, makeConfig(), NOW);
    expect(result.criterionScores.b1.score).toBe(20);
  });

  it('all bots blocked → B1 score = 0', () => {
    const result = scorePillarB({ ...perfectFacts(), b1: allBlocked() }, makeConfig(), NOW);
    expect(result.criterionScores.b1.score).toBe(0);
  });

  it('half bots blocked → B1 score = 10', () => {
    const permissions = Object.fromEntries(
      AI_BOTS.map((b, i) => [b, i < 4 ? 'blocked' : 'allowed']),
    ) as Parameters<typeof scorePillarB>[0]['b1'] & { measured: true } extends { permissions: infer P } ? P : never;
    const b1: TechCheckFacts['b1'] = { measured: true, robotsTxtPresent: true, permissions };
    const result = scorePillarB({ ...perfectFacts(), b1 }, makeConfig(), NOW);
    expect(result.criterionScores.b1.score).toBe(10);
  });

  it('not measured → excluded from denominator', () => {
    const facts: TechCheckFacts = { ...perfectFacts(), b1: notMeasured() };
    const result = scorePillarB(facts, makeConfig(), NOW);
    expect(result.unmeasuredCriteria).toContain('b1');
    expect(result.criterionScores.b1.measured).toBe(false);
  });
});

// ---- B2 tests ---------------------------------------------------------------

describe('scorePillarB – B2 (HTTP crawlability)', () => {
  it('all accessible → B2 score = 25', () => {
    const result = scorePillarB(perfectFacts(), makeConfig(), NOW);
    expect(result.criterionScores.b2.score).toBe(25);
  });

  it('all blocked → B2 score = 0', () => {
    const result = scorePillarB({ ...perfectFacts(), b2: b2AllBlocked() }, makeConfig(), NOW);
    expect(result.criterionScores.b2.score).toBe(0);
  });

  it('half blocked → B2 score = 12 or 13 (round(0.5 * 25))', () => {
    const results = AI_BOTS.map((bot, i) => ({
      bot, url: 'https://example.com/', statusCode: i < 4 ? 403 : 200, blocked: i < 4,
    }));
    const b2: TechCheckFacts['b2'] = { measured: true, results, stoppedOn429: false };
    const result = scorePillarB({ ...perfectFacts(), b2 }, makeConfig(), NOW);
    expect(result.criterionScores.b2.score).toBe(13); // round(0.5 * 25) = 13
  });

  it('not measured → excluded from pillar denominator', () => {
    const facts: TechCheckFacts = { ...perfectFacts(), b2: notMeasured() };
    const result = scorePillarB(facts, makeConfig(), NOW);
    expect(result.unmeasuredCriteria).toContain('b2');
    expect(result.criterionScores.b2.measured).toBe(false);
  });
});

// ---- B3 tests ---------------------------------------------------------------

describe('scorePillarB – B3 (static content ratio)', () => {
  it('ratio >= 0.8 → 15', () => {
    const result = scorePillarB(perfectFacts(), makeConfig(), NOW);
    expect(result.criterionScores.b3.score).toBe(15);
  });

  it('ratio >= 0.6 → 12', () => {
    const b3: TechCheckFacts['b3'] = { measured: true, url: 'x', rawTextLength: 65, renderedTextLength: 100, contentRatio: 0.65 };
    const result = scorePillarB({ ...perfectFacts(), b3 }, makeConfig(), NOW);
    expect(result.criterionScores.b3.score).toBe(12);
  });

  it('ratio >= 0.4 → 8', () => {
    const b3: TechCheckFacts['b3'] = { measured: true, url: 'x', rawTextLength: 45, renderedTextLength: 100, contentRatio: 0.45 };
    const result = scorePillarB({ ...perfectFacts(), b3 }, makeConfig(), NOW);
    expect(result.criterionScores.b3.score).toBe(8);
  });

  it('ratio >= 0.2 → 4', () => {
    const b3: TechCheckFacts['b3'] = { measured: true, url: 'x', rawTextLength: 25, renderedTextLength: 100, contentRatio: 0.25 };
    const result = scorePillarB({ ...perfectFacts(), b3 }, makeConfig(), NOW);
    expect(result.criterionScores.b3.score).toBe(4);
  });

  it('ratio < 0.2 → 0', () => {
    const result = scorePillarB({ ...perfectFacts(), b3: b3JsOnly() }, makeConfig(), NOW);
    expect(result.criterionScores.b3.score).toBe(0);
  });

  it('not measured → excluded', () => {
    const facts: TechCheckFacts = { ...perfectFacts(), b3: notMeasured() };
    const result = scorePillarB(facts, makeConfig(), NOW);
    expect(result.unmeasuredCriteria).toContain('b3');
  });
});

// ---- B4 tests ---------------------------------------------------------------

describe('scorePillarB – B4 (indexation)', () => {
  it('all indexed → 15', () => {
    const result = scorePillarB(perfectFacts(), makeConfig(), NOW);
    expect(result.criterionScores.b4.score).toBe(15);
  });

  it('none indexed → 0', () => {
    const result = scorePillarB({ ...perfectFacts(), b4: b4NoneIndexed() }, makeConfig(), NOW);
    expect(result.criterionScores.b4.score).toBe(0);
  });

  it('empty pagesChecked → score 0, no division by zero', () => {
    const b4: TechCheckFacts['b4'] = { measured: true, pagesChecked: [], requestsUsed: 0 };
    const result = scorePillarB({ ...perfectFacts(), b4 }, makeConfig(), NOW);
    expect(result.criterionScores.b4.score).toBe(0);
  });

  it('half indexed → 8 (round(0.5 * 15))', () => {
    const b4: TechCheckFacts['b4'] = {
      measured: true,
      pagesChecked: [
        { url: 'a', indexed: true },
        { url: 'b', indexed: false },
      ],
      requestsUsed: 2,
    };
    const result = scorePillarB({ ...perfectFacts(), b4 }, makeConfig(), NOW);
    expect(result.criterionScores.b4.score).toBe(8);
  });

  it('not measured → excluded', () => {
    const facts: TechCheckFacts = { ...perfectFacts(), b4: notMeasured('SerpAPI unavailable') };
    const result = scorePillarB(facts, makeConfig(), NOW);
    expect(result.unmeasuredCriteria).toContain('b4');
    expect(result.criterionScores.b4.measured).toBe(false);
  });
});

// ---- B5 tests ---------------------------------------------------------------

describe('scorePillarB – B5 (technical hygiene)', () => {
  it('perfect site → 15', () => {
    const result = scorePillarB(perfectFacts(), makeConfig(), NOW);
    expect(result.criterionScores.b5.score).toBe(15);
  });

  it('no sitemap → loses 5 pts', () => {
    const b5: TechCheckFacts['b5'] = {
      measured: true,
      sitemapPresent: false,
      sitemapUrlCount: 0,
      pageResults: [...PERFECT_PAGE_RESULTS],
    };
    const result = scorePillarB({ ...perfectFacts(), b5 }, makeConfig(), NOW);
    expect(result.criterionScores.b5.score).toBe(10);
  });

  it('slow pages (TTFB >= 800ms) → loses 3 pts', () => {
    const b5: TechCheckFacts['b5'] = {
      measured: true,
      sitemapPresent: true,
      sitemapUrlCount: 10,
      pageResults: [
        { url: 'https://example.com/', statusCode: 200, canonical: 'https://example.com/', isRedirect: false, ttfbMs: 1200 },
        { url: 'https://example.com/about', statusCode: 200, canonical: 'https://example.com/about', isRedirect: false, ttfbMs: 900 },
      ],
    };
    const result = scorePillarB({ ...perfectFacts(), b5 }, makeConfig(), NOW);
    expect(result.criterionScores.b5.score).toBe(12); // 5 sitemap + 4 canonical + 3 no-redirect + 0 ttfb
  });

  it('redirect pages → loses 3 pts', () => {
    const b5: TechCheckFacts['b5'] = {
      measured: true,
      sitemapPresent: true,
      sitemapUrlCount: 10,
      pageResults: [
        { url: 'https://example.com/', statusCode: 301, canonical: 'https://example.com/', isRedirect: true, ttfbMs: 100 },
        { url: 'https://example.com/about', statusCode: 301, canonical: 'https://example.com/about', isRedirect: true, ttfbMs: 100 },
      ],
    };
    const result = scorePillarB({ ...perfectFacts(), b5 }, makeConfig(), NOW);
    expect(result.criterionScores.b5.score).toBe(12); // 5 + 4 canonical + 0 no-redirect + 3 ttfb
  });

  it('no canonical → loses 4 pts', () => {
    const b5: TechCheckFacts['b5'] = {
      measured: true,
      sitemapPresent: true,
      sitemapUrlCount: 10,
      pageResults: [
        { url: 'https://example.com/', statusCode: 200, canonical: null, isRedirect: false, ttfbMs: 200 },
        { url: 'https://example.com/about', statusCode: 200, canonical: null, isRedirect: false, ttfbMs: 200 },
      ],
    };
    const result = scorePillarB({ ...perfectFacts(), b5 }, makeConfig(), NOW);
    expect(result.criterionScores.b5.score).toBe(11); // 5 + 0 canonical + 3 no-redirect + 3 ttfb
  });

  it('no page results → only sitemap score (no division by zero)', () => {
    const b5: TechCheckFacts['b5'] = {
      measured: true, sitemapPresent: true, sitemapUrlCount: 10, pageResults: [],
    };
    const result = scorePillarB({ ...perfectFacts(), b5 }, makeConfig(), NOW);
    expect(result.criterionScores.b5.score).toBe(5); // only sitemap
  });

  it('not measured → excluded', () => {
    const facts: TechCheckFacts = { ...perfectFacts(), b5: notMeasured() };
    const result = scorePillarB(facts, makeConfig(), NOW);
    expect(result.unmeasuredCriteria).toContain('b5');
  });
});

// ---- B6 tests ---------------------------------------------------------------

describe('scorePillarB – B6 (freshness)', () => {
  it('fresh lastmod (<=30 days) + no stale pages → 10', () => {
    const result = scorePillarB(perfectFacts(), makeConfig(), NOW);
    expect(result.criterionScores.b6.score).toBe(10);
  });

  it('lastmod 60 days old → 3 pts for lastmod component', () => {
    const b6: TechCheckFacts['b6'] = {
      measured: true,
      sitemapLastmod: '2026-07-16', // ~60 days before NOW
      pagesWithLastModified: 10,
      stalePageCount: 0,
    };
    const result = scorePillarB({ ...perfectFacts(), b6 }, makeConfig(), NOW);
    expect(result.criterionScores.b6.score).toBe(9); // 3 lastmod + 6 stale
  });

  it('null lastmod → 0 pts for lastmod component', () => {
    const b6: TechCheckFacts['b6'] = {
      measured: true,
      sitemapLastmod: null,
      pagesWithLastModified: 10,
      stalePageCount: 0,
    };
    const result = scorePillarB({ ...perfectFacts(), b6 }, makeConfig(), NOW);
    expect(result.criterionScores.b6.score).toBe(6); // 0 lastmod + 6 stale
  });

  it('high stale rate → 0 pts for stale component', () => {
    const result = scorePillarB({ ...perfectFacts(), b6: b6Stale() }, makeConfig(), NOW);
    // sitemapLastmod = 2022-01-01 → > 365 days → 0; stalePageCount 8/(5+8) = 0.62 → 0
    expect(result.criterionScores.b6.score).toBe(0);
  });

  it('stalePageCount == 0, pagesWithLastModified == 0 → full 6 pts for stale (no data = no penalty)', () => {
    const b6: TechCheckFacts['b6'] = {
      measured: true,
      sitemapLastmod: null,
      pagesWithLastModified: 0,
      stalePageCount: 0,
    };
    const result = scorePillarB({ ...perfectFacts(), b6 }, makeConfig(), NOW);
    expect(result.criterionScores.b6.score).toBe(6); // 0 lastmod + 6 no-data stale
  });

  it('not measured → excluded', () => {
    const facts: TechCheckFacts = { ...perfectFacts(), b6: notMeasured() };
    const result = scorePillarB(facts, makeConfig(), NOW);
    expect(result.unmeasuredCriteria).toContain('b6');
  });
});

// ---- pillar score tests -----------------------------------------------------

describe('scorePillarB – pillar score', () => {
  it('all criteria measured and perfect → pillarScore = 100', () => {
    const result = scorePillarB(perfectFacts(), makeConfig(), NOW);
    expect(result.pillarScore).toBe(100);
  });

  it('one criterion not measured → excluded from denominator', () => {
    const facts: TechCheckFacts = { ...perfectFacts(), b4: notMeasured() };
    const result = scorePillarB(facts, makeConfig(), NOW);
    // measured max = 20+25+15+15+10 = 85; all at max → pillarScore = 100
    expect(result.pillarScore).toBe(100);
    expect(result.measuredMaxSum).toBe(85);
  });

  it('all criteria not measured → pillarScore = 0, measuredMaxSum = 0', () => {
    const allNotMeasured: TechCheckFacts = {
      b1: notMeasured(), b2: notMeasured(), b3: notMeasured(),
      b4: notMeasured(), b5: notMeasured(), b6: notMeasured(),
    };
    const result = scorePillarB(allNotMeasured, makeConfig(), NOW);
    expect(result.pillarScore).toBe(0);
    expect(result.measuredMaxSum).toBe(0);
    expect(result.unmeasuredCriteria).toHaveLength(6);
  });

  it('mixed: b1 max, b2 half, rest not measured → correct pillarScore', () => {
    const results = AI_BOTS.map((bot, i) => ({
      bot, url: 'https://example.com/', statusCode: i < 4 ? 403 : 200, blocked: i < 4,
    }));
    const b2: TechCheckFacts['b2'] = { measured: true, results, stoppedOn429: false };
    const facts: TechCheckFacts = {
      b1: allAllowed(),
      b2,
      b3: notMeasured(), b4: notMeasured(), b5: notMeasured(), b6: notMeasured(),
    };
    const result = scorePillarB(facts, makeConfig(), NOW);
    // b1: 20/20, b2: 13/25 → sum 33/45 → ~73.3 → round to 73
    expect(result.measuredMaxSum).toBe(45);
    expect(result.pillarScore).toBe(73);
  });
});

// ---- blocker tests ----------------------------------------------------------

describe('scorePillarB – blockers', () => {
  it('b1_all_bots_robots_blocked fires when all 8 bots blocked in robots.txt', () => {
    const result = scorePillarB({ ...perfectFacts(), b1: allBlocked() }, makeConfig(), NOW);
    expect(result.appliedBlockers).toContain('b1_all_bots_robots_blocked');
  });

  it('b1_all_bots_robots_blocked does NOT fire when some bots allowed', () => {
    const result = scorePillarB(perfectFacts(), makeConfig(), NOW);
    expect(result.appliedBlockers).not.toContain('b1_all_bots_robots_blocked');
  });

  it('b1_all_bots_robots_blocked does NOT fire when b1 not measured', () => {
    const facts: TechCheckFacts = { ...perfectFacts(), b1: notMeasured() };
    const result = scorePillarB(facts, makeConfig(), NOW);
    expect(result.appliedBlockers).not.toContain('b1_all_bots_robots_blocked');
  });

  it('b2_all_bots_http_blocked fires when all bots blocked on all tested pages', () => {
    const result = scorePillarB({ ...perfectFacts(), b2: b2AllBlocked() }, makeConfig(), NOW);
    expect(result.appliedBlockers).toContain('b2_all_bots_http_blocked');
  });

  it('b2_all_bots_http_blocked does NOT fire when some bots accessible', () => {
    const result = scorePillarB(perfectFacts(), makeConfig(), NOW);
    expect(result.appliedBlockers).not.toContain('b2_all_bots_http_blocked');
  });

  it('b2_all_bots_http_blocked does NOT fire when b2 not measured', () => {
    const facts: TechCheckFacts = { ...perfectFacts(), b2: notMeasured() };
    const result = scorePillarB(facts, makeConfig(), NOW);
    expect(result.appliedBlockers).not.toContain('b2_all_bots_http_blocked');
  });

  it('b3_no_static_content fires when contentRatio < 0.2', () => {
    const result = scorePillarB({ ...perfectFacts(), b3: b3JsOnly() }, makeConfig(), NOW);
    expect(result.appliedBlockers).toContain('b3_no_static_content');
  });

  it('b3_no_static_content does NOT fire when ratio >= 0.2', () => {
    const b3: TechCheckFacts['b3'] = { measured: true, url: 'x', rawTextLength: 25, renderedTextLength: 100, contentRatio: 0.25 };
    const result = scorePillarB({ ...perfectFacts(), b3 }, makeConfig(), NOW);
    expect(result.appliedBlockers).not.toContain('b3_no_static_content');
  });

  it('b3_no_static_content does NOT fire when b3 not measured', () => {
    const facts: TechCheckFacts = { ...perfectFacts(), b3: notMeasured() };
    const result = scorePillarB(facts, makeConfig(), NOW);
    expect(result.appliedBlockers).not.toContain('b3_no_static_content');
  });

  it('b4_no_pages_indexed fires when pagesChecked > 0 and none indexed', () => {
    const result = scorePillarB({ ...perfectFacts(), b4: b4NoneIndexed() }, makeConfig(), NOW);
    expect(result.appliedBlockers).toContain('b4_no_pages_indexed');
  });

  it('b4_no_pages_indexed does NOT fire when pagesChecked is empty', () => {
    const b4: TechCheckFacts['b4'] = { measured: true, pagesChecked: [], requestsUsed: 0 };
    const result = scorePillarB({ ...perfectFacts(), b4 }, makeConfig(), NOW);
    expect(result.appliedBlockers).not.toContain('b4_no_pages_indexed');
  });

  it('b4_no_pages_indexed does NOT fire when some pages are indexed', () => {
    const result = scorePillarB(perfectFacts(), makeConfig(), NOW);
    expect(result.appliedBlockers).not.toContain('b4_no_pages_indexed');
  });

  it('b4_no_pages_indexed does NOT fire when b4 not measured', () => {
    const facts: TechCheckFacts = { ...perfectFacts(), b4: notMeasured() };
    const result = scorePillarB(facts, makeConfig(), NOW);
    expect(result.appliedBlockers).not.toContain('b4_no_pages_indexed');
  });

  it('no blockers fire on a perfect site', () => {
    const result = scorePillarB(perfectFacts(), makeConfig(), NOW);
    expect(result.appliedBlockers).toHaveLength(0);
  });
});
