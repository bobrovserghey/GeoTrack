import { describe, it, expect } from 'vitest';
import { scorePillarA } from '../scoring/pillar-a.js';
import type { EngineResponseFacts } from '../steps/extract-mentions.js';
import type { Methodology } from '@geotrack/config';

// ---- helpers ----------------------------------------------------------------

function makeConfig(): Methodology {
  return {
    version: 1,
    pillars: {
      A: {
        weight: 0.40,
        criteria: {
          a1: { id: 'a1', maxScore: 20 },
          a2: { id: 'a2', maxScore: 15 },
          a3: { id: 'a3', maxScore: 15 },
          a4: { id: 'a4', maxScore: 20 },
          a5: { id: 'a5', maxScore: 15 },
          a6: { id: 'a6', maxScore: 15 },
        },
      },
    },
    blockers: [],
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

function makeFact(overrides: Partial<EngineResponseFacts> = {}): EngineResponseFacts {
  return {
    promptId: 'p1',
    engineId: 'perplexity',
    repeatIndex: 0,
    brandMentioned: false,
    brandListPosition: null,
    normalizedPositionScore: null,
    competitorMentions: [],
    citedDomains: [],
    ...overrides,
  };
}

const CLIENT_DOMAIN = 'example.com';

// ---- A1: brand mention ratio ------------------------------------------------

describe('scorePillarA — A1 (brand mention ratio)', () => {
  it('all responses mention brand → A1 = maxA1 = 20', () => {
    const facts = [
      makeFact({ brandMentioned: true }),
      makeFact({ brandMentioned: true }),
    ];
    const { criterionScores } = scorePillarA(facts, makeConfig(), CLIENT_DOMAIN);
    expect(criterionScores.a1.score).toBe(20);
    expect(criterionScores.a1.measured).toBe(true);
  });

  it('no response mentions brand → A1 = 0', () => {
    const facts = [makeFact(), makeFact()];
    const { criterionScores } = scorePillarA(facts, makeConfig(), CLIENT_DOMAIN);
    expect(criterionScores.a1.score).toBe(0);
    expect(criterionScores.a1.measured).toBe(true);
  });

  it('half responses mention brand → A1 = 10', () => {
    const facts = [
      makeFact({ brandMentioned: true }),
      makeFact({ brandMentioned: false }),
    ];
    const { criterionScores } = scorePillarA(facts, makeConfig(), CLIENT_DOMAIN);
    expect(criterionScores.a1.score).toBe(10);
  });

  it('empty facts → A1 unmeasured', () => {
    const { criterionScores } = scorePillarA([], makeConfig(), CLIENT_DOMAIN);
    expect(criterionScores.a1.measured).toBe(false);
    expect(criterionScores.a1.score).toBe(0);
  });
});

// ---- A2: citation ratio -----------------------------------------------------

describe('scorePillarA — A2 (citation ratio)', () => {
  it('all responses cite clientDomain → A2 = maxA2 = 15', () => {
    const facts = [
      makeFact({ citedDomains: [CLIENT_DOMAIN, 'other.com'] }),
      makeFact({ citedDomains: [CLIENT_DOMAIN] }),
    ];
    const { criterionScores } = scorePillarA(facts, makeConfig(), CLIENT_DOMAIN);
    expect(criterionScores.a2.score).toBe(15);
    expect(criterionScores.a2.measured).toBe(true);
  });

  it('no response cites clientDomain → A2 = 0', () => {
    const facts = [makeFact({ citedDomains: ['other.com'] }), makeFact()];
    const { criterionScores } = scorePillarA(facts, makeConfig(), CLIENT_DOMAIN);
    expect(criterionScores.a2.score).toBe(0);
  });

  it('half cite clientDomain → A2 = round(0.5 × 15) = 8', () => {
    const facts = [
      makeFact({ citedDomains: [CLIENT_DOMAIN] }),
      makeFact({ citedDomains: ['other.com'] }),
    ];
    const { criterionScores } = scorePillarA(facts, makeConfig(), CLIENT_DOMAIN);
    expect(criterionScores.a2.score).toBe(8);
  });
});

// ---- A3: list position score ------------------------------------------------

describe('scorePillarA — A3 (list position)', () => {
  it('all have position score 100 → A3 = maxA3 = 15', () => {
    const facts = [
      makeFact({ brandMentioned: true, normalizedPositionScore: 100 }),
      makeFact({ brandMentioned: true, normalizedPositionScore: 100 }),
    ];
    const { criterionScores } = scorePillarA(facts, makeConfig(), CLIENT_DOMAIN);
    expect(criterionScores.a3.score).toBe(15);
    expect(criterionScores.a3.measured).toBe(true);
  });

  it('avg position score 60 → A3 = round(60/100 × 15) = 9', () => {
    const facts = [
      makeFact({ brandMentioned: true, normalizedPositionScore: 100 }),
      makeFact({ brandMentioned: true, normalizedPositionScore: 20 }),
    ];
    const { criterionScores } = scorePillarA(facts, makeConfig(), CLIENT_DOMAIN);
    expect(criterionScores.a3.score).toBe(9);
  });

  it('no responses have normalizedPositionScore → A3 unmeasured', () => {
    const facts = [makeFact(), makeFact({ brandMentioned: true })];
    const { criterionScores } = scorePillarA(facts, makeConfig(), CLIENT_DOMAIN);
    expect(criterionScores.a3.measured).toBe(false);
    expect(criterionScores.a3.score).toBe(0);
  });

  it('mixed null and non-null → only non-null count for A3', () => {
    const facts = [
      makeFact({ brandMentioned: true, normalizedPositionScore: 80 }),
      makeFact({ brandMentioned: true, normalizedPositionScore: null }),
    ];
    const { criterionScores } = scorePillarA(facts, makeConfig(), CLIENT_DOMAIN);
    // avg of [80] = 80, A3 = round(80/100 × 15) = 12
    expect(criterionScores.a3.score).toBe(12);
    expect(criterionScores.a3.measured).toBe(true);
  });
});

// ---- A4: share of voice -----------------------------------------------------

describe('scorePillarA — A4 (share of voice)', () => {
  it('brand mentions only → A4 = maxA4 = 20', () => {
    const facts = [
      makeFact({ brandMentioned: true }),
      makeFact({ brandMentioned: true }),
    ];
    const { criterionScores } = scorePillarA(facts, makeConfig(), CLIENT_DOMAIN);
    expect(criterionScores.a4.score).toBe(20);
    expect(criterionScores.a4.measured).toBe(true);
  });

  it('no brand, no competitors → A4 unmeasured', () => {
    const facts = [makeFact(), makeFact()];
    const { criterionScores } = scorePillarA(facts, makeConfig(), CLIENT_DOMAIN);
    expect(criterionScores.a4.measured).toBe(false);
    expect(criterionScores.a4.score).toBe(0);
  });

  it('equal brand and competitor counts → A4 = 10', () => {
    const facts = [
      makeFact({
        brandMentioned: true,
        competitorMentions: [{ name: 'Rival', count: 1 }],
      }),
    ];
    const { criterionScores } = scorePillarA(facts, makeConfig(), CLIENT_DOMAIN);
    // brand=1, competitors=1 → 1/2 × 20 = 10
    expect(criterionScores.a4.score).toBe(10);
  });

  it('only competitor mentions → A4 = 0', () => {
    const facts = [
      makeFact({ competitorMentions: [{ name: 'Rival', count: 3 }] }),
    ];
    const { criterionScores } = scorePillarA(facts, makeConfig(), CLIENT_DOMAIN);
    expect(criterionScores.a4.score).toBe(0);
    expect(criterionScores.a4.measured).toBe(true);
  });
});

// ---- A5, A6: always unmeasured in T-20 -------------------------------------

describe('scorePillarA — A5, A6 (unmeasured)', () => {
  it('a5 is always unmeasured', () => {
    const facts = [makeFact({ brandMentioned: true })];
    const { criterionScores } = scorePillarA(facts, makeConfig(), CLIENT_DOMAIN);
    expect(criterionScores.a5.measured).toBe(false);
  });

  it('a6 is always unmeasured', () => {
    const facts = [makeFact({ brandMentioned: true })];
    const { criterionScores } = scorePillarA(facts, makeConfig(), CLIENT_DOMAIN);
    expect(criterionScores.a6.measured).toBe(false);
  });
});

// ---- pillarScore: unmeasured criteria excluded from denominator -------------

describe('scorePillarA — pillarScore', () => {
  it('all 4 measured criteria full score + a5/a6 unmeasured → score based on measured max', () => {
    // a1=20, a2=15, a3=15, a4=20 all at max; a5,a6 unmeasured
    // measuredMaxSum = 20+15+15+20 = 70
    // measuredScoreSum = 20+15+15+20 = 70
    // pillarScore = round(70/70 × 100) = 100
    const facts = [
      makeFact({
        brandMentioned: true,
        normalizedPositionScore: 100,
        citedDomains: [CLIENT_DOMAIN],
      }),
    ];
    const { pillarScore, unmeasuredCriteria, measuredMaxSum } = scorePillarA(facts, makeConfig(), CLIENT_DOMAIN);
    expect(pillarScore).toBe(100);
    expect(unmeasuredCriteria).toContain('a5');
    expect(unmeasuredCriteria).toContain('a6');
    expect(measuredMaxSum).toBe(70); // 20+15+15+20
  });

  it('all unmeasured → pillarScore = 0', () => {
    const { pillarScore } = scorePillarA([], makeConfig(), CLIENT_DOMAIN);
    expect(pillarScore).toBe(0);
  });

  it('zero score on all measured → pillarScore = 0', () => {
    // No brand mentions → a1=0, a2=0; no position → a3 unmeasured; no mentions at all → a4 unmeasured
    const facts = [makeFact({ citedDomains: [] })];
    const { pillarScore } = scorePillarA(facts, makeConfig(), CLIENT_DOMAIN);
    expect(pillarScore).toBe(0);
  });

  it('partial score → pillarScore proportional to measured criteria', () => {
    // a1: 1/2 mentioned = 10/20
    // a2: 0/1 citing domain = 0/15
    // a3: 1 fact with positionScore 80 → round(80/100×15) = 12
    // a4: brand=1, competitors=2 → 1/3 × 20 = 7
    // measuredMaxSum = 20+15+15+20 = 70
    // measuredScoreSum = 10+0+12+7 = 29
    // pillarScore = round(29/70 × 100) = 41
    const facts = [
      makeFact({
        brandMentioned: true,
        normalizedPositionScore: 80,
        citedDomains: [],
        competitorMentions: [{ name: 'R', count: 2 }],
      }),
      makeFact({
        brandMentioned: false,
        normalizedPositionScore: null,
        citedDomains: [],
        competitorMentions: [],
      }),
    ];
    const { pillarScore, criterionScores } = scorePillarA(facts, makeConfig(), CLIENT_DOMAIN);
    expect(criterionScores.a1.score).toBe(10);
    expect(criterionScores.a2.score).toBe(0);
    expect(criterionScores.a3.score).toBe(12);
    expect(criterionScores.a4.score).toBe(7);
    expect(pillarScore).toBe(41);
  });
});
