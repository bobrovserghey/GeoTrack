import { describe, it, expect } from 'vitest';
import { scorePillarD } from '../scoring/pillar-d.js';
import type { OffsiteSignalsOutput } from '../steps/offsite-signals.js';
import type { Methodology } from '@geotrack/config';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeConfig(): Methodology {
  return {
    version: 1,
    pillars: {
      D: {
        weight: 0.1,
        criteria: {
          d1: { id: 'd1', maxScore: 35 },
          d2: { id: 'd2', maxScore: 35 },
          d4: { id: 'd4', maxScore: 30 },
        },
      },
    },
    blockers: [],
    bands: [],
    interval: { hRepFallback: 0.3, hCovFactor: 0.5, hRepFactor: 0.3 },
    basket: { realizationFactor: 0.7 },
  };
}

function makeOffsite(overrides: Partial<OffsiteSignalsOutput> = {}): OffsiteSignalsOutput {
  return {
    d1: {
      measured: true,
      clientPlatforms: [
        { platform: 'g2', profileFound: true, profileUrl: 'https://g2.com/products/acme' },
        { platform: 'capterra', profileFound: true, profileUrl: 'https://capterra.com/p/acme' },
        { platform: 'producthunt', profileFound: true, profileUrl: 'https://producthunt.com/posts/acme' },
        { platform: 'trustpilot', profileFound: true, profileUrl: 'https://trustpilot.com/review/acme' },
      ],
      clientPlatformCount: 4,
    },
    d2: {
      measured: true,
      citedPagesAnalyzed: 10,
      pagesWithClientMention: 5,
      clientPresenceRatio: 0.5,
    },
    d4: {
      measured: true,
      linkedInFound: true,
      linkedInUrl: 'https://linkedin.com/company/acme',
      crunchbaseFound: true,
      crunchbaseUrl: 'https://crunchbase.com/organization/acme',
    },
    serpRequestsUsed: 6,
    ...overrides,
  };
}

// ── D1 ────────────────────────────────────────────────────────────────────────

describe('D1 — review platforms', () => {
  it('4 platforms → maxScore', () => {
    const result = scorePillarD(makeOffsite({ d1: { measured: true, clientPlatforms: [], clientPlatformCount: 4 } }), makeConfig());
    expect(result.criterionScores.d1.score).toBe(35);
    expect(result.criterionScores.d1.measured).toBe(true);
  });

  it('3 platforms → 75% of maxScore', () => {
    const result = scorePillarD(makeOffsite({ d1: { measured: true, clientPlatforms: [], clientPlatformCount: 3 } }), makeConfig());
    expect(result.criterionScores.d1.score).toBe(Math.round(35 * 0.75));
  });

  it('2 platforms → 50% of maxScore', () => {
    const result = scorePillarD(makeOffsite({ d1: { measured: true, clientPlatforms: [], clientPlatformCount: 2 } }), makeConfig());
    expect(result.criterionScores.d1.score).toBe(Math.round(35 * 0.5));
  });

  it('1 platform → 25% of maxScore', () => {
    const result = scorePillarD(makeOffsite({ d1: { measured: true, clientPlatforms: [], clientPlatformCount: 1 } }), makeConfig());
    expect(result.criterionScores.d1.score).toBe(Math.round(35 * 0.25));
  });

  it('0 platforms → score = 0', () => {
    const result = scorePillarD(makeOffsite({ d1: { measured: true, clientPlatforms: [], clientPlatformCount: 0 } }), makeConfig());
    expect(result.criterionScores.d1.score).toBe(0);
  });

  it('unmeasured → measured = false, in unmeasuredCriteria', () => {
    const result = scorePillarD(makeOffsite({ d1: { measured: false, clientPlatforms: [], clientPlatformCount: 0 } }), makeConfig());
    expect(result.criterionScores.d1.measured).toBe(false);
    expect(result.unmeasuredCriteria).toContain('d1');
  });
});

// ── D2 ────────────────────────────────────────────────────────────────────────

describe('D2 — citation presence', () => {
  it('ratio 0.6 → Math.round(0.6 * 35) = 21', () => {
    const result = scorePillarD(makeOffsite({ d2: { measured: true, citedPagesAnalyzed: 10, pagesWithClientMention: 6, clientPresenceRatio: 0.6 } }), makeConfig());
    expect(result.criterionScores.d2.score).toBe(Math.round(0.6 * 35));
  });

  it('ratio 0 → score = 0', () => {
    const result = scorePillarD(makeOffsite({ d2: { measured: true, citedPagesAnalyzed: 10, pagesWithClientMention: 0, clientPresenceRatio: 0 } }), makeConfig());
    expect(result.criterionScores.d2.score).toBe(0);
  });

  it('ratio 1 → maxScore', () => {
    const result = scorePillarD(makeOffsite({ d2: { measured: true, citedPagesAnalyzed: 5, pagesWithClientMention: 5, clientPresenceRatio: 1 } }), makeConfig());
    expect(result.criterionScores.d2.score).toBe(35);
  });

  it('unmeasured → measured = false', () => {
    const result = scorePillarD(makeOffsite({ d2: { measured: false, citedPagesAnalyzed: 0, pagesWithClientMention: 0, clientPresenceRatio: 0 } }), makeConfig());
    expect(result.criterionScores.d2.measured).toBe(false);
    expect(result.unmeasuredCriteria).toContain('d2');
  });
});

// ── D4 ────────────────────────────────────────────────────────────────────────

describe('D4 — entity consistency', () => {
  it('both LinkedIn and Crunchbase → maxScore', () => {
    const result = scorePillarD(makeOffsite({ d4: { measured: true, linkedInFound: true, linkedInUrl: 'https://linkedin.com/company/acme', crunchbaseFound: true, crunchbaseUrl: 'https://crunchbase.com/organization/acme' } }), makeConfig());
    expect(result.criterionScores.d4.score).toBe(30);
  });

  it('only LinkedIn → 50% of maxScore', () => {
    const result = scorePillarD(makeOffsite({ d4: { measured: true, linkedInFound: true, linkedInUrl: 'u', crunchbaseFound: false, crunchbaseUrl: null } }), makeConfig());
    expect(result.criterionScores.d4.score).toBe(Math.round(30 * 0.5));
  });

  it('only Crunchbase → 50% of maxScore', () => {
    const result = scorePillarD(makeOffsite({ d4: { measured: true, linkedInFound: false, linkedInUrl: null, crunchbaseFound: true, crunchbaseUrl: 'u' } }), makeConfig());
    expect(result.criterionScores.d4.score).toBe(Math.round(30 * 0.5));
  });

  it('neither found → score = 0', () => {
    const result = scorePillarD(makeOffsite({ d4: { measured: true, linkedInFound: false, linkedInUrl: null, crunchbaseFound: false, crunchbaseUrl: null } }), makeConfig());
    expect(result.criterionScores.d4.score).toBe(0);
  });

  it('unmeasured → measured = false', () => {
    const result = scorePillarD(makeOffsite({ d4: { measured: false, linkedInFound: false, linkedInUrl: null, crunchbaseFound: false, crunchbaseUrl: null } }), makeConfig());
    expect(result.criterionScores.d4.measured).toBe(false);
    expect(result.unmeasuredCriteria).toContain('d4');
  });
});

// ── pillarScore ───────────────────────────────────────────────────────────────

describe('pillarScore', () => {
  it('all measured perfect scores → 100', () => {
    const result = scorePillarD(makeOffsite({
      d1: { measured: true, clientPlatforms: [], clientPlatformCount: 4 },
      d2: { measured: true, citedPagesAnalyzed: 10, pagesWithClientMention: 10, clientPresenceRatio: 1 },
      d4: { measured: true, linkedInFound: true, linkedInUrl: 'u', crunchbaseFound: true, crunchbaseUrl: 'u' },
    }), makeConfig());
    expect(result.pillarScore).toBe(100);
    expect(result.unmeasuredCriteria).toHaveLength(0);
  });

  it('all unmeasured → pillarScore = 0', () => {
    const result = scorePillarD(makeOffsite({
      d1: { measured: false, clientPlatforms: [], clientPlatformCount: 0 },
      d2: { measured: false, citedPagesAnalyzed: 0, pagesWithClientMention: 0, clientPresenceRatio: 0 },
      d4: { measured: false, linkedInFound: false, linkedInUrl: null, crunchbaseFound: false, crunchbaseUrl: null },
    }), makeConfig());
    expect(result.pillarScore).toBe(0);
    expect(result.measuredMaxSum).toBe(0);
    expect(result.unmeasuredCriteria).toHaveLength(3);
  });

  it('partial measurement — only D2 measured', () => {
    const result = scorePillarD(makeOffsite({
      d1: { measured: false, clientPlatforms: [], clientPlatformCount: 0 },
      d2: { measured: true, citedPagesAnalyzed: 10, pagesWithClientMention: 7, clientPresenceRatio: 0.7 },
      d4: { measured: false, linkedInFound: false, linkedInUrl: null, crunchbaseFound: false, crunchbaseUrl: null },
    }), makeConfig());
    expect(result.measuredMaxSum).toBe(35);
    expect(result.criterionScores.d2.score).toBe(Math.round(0.7 * 35));
    expect(result.pillarScore).toBe(Math.round(result.criterionScores.d2.score / 35 * 100));
  });
});
