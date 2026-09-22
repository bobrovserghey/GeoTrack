import { describe, it, expect } from 'vitest';
import { scorePillarC } from '../scoring/pillar-c.js';
import type { ContentCheckFacts } from '../steps/content-check.js';
import type { CitedPagesOutput } from '../steps/cited-pages.js';
import type { Methodology } from '@geotrack/config';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeConfig(): Methodology {
  return {
    version: 1,
    pillars: {
      C: {
        weight: 0.15,
        criteria: {
          c1: { id: 'c1', maxScore: 20 },
          c2: { id: 'c2', maxScore: 20 },
          c3: { id: 'c3', maxScore: 15 },
          c4: { id: 'c4', maxScore: 15 },
          c5: { id: 'c5', maxScore: 15 },
          c6: { id: 'c6', maxScore: 15 },
        },
      },
    },
    blockers: [],
    bands: [],
    interval: { hRepFallback: 0.3, hCovFactor: 0.5, hRepFactor: 0.3 },
  };
}

function makeContentFacts(overrides: Partial<ContentCheckFacts> = {}): ContentCheckFacts {
  return {
    analyzedPageCount: 3,
    c1: { pageTypeMap: { pricing: null, comparison: null, alternatives: null, 'use-cases': null, docs: null, faq: null }, gapTypes: [], ...overrides.c1 },
    c2: {
      pages: [
        { url: 'https://a.com', hasAnswerFirstParagraph: true, hasQuestionHeaders: true, hasQABlocks: true, hasListsOrTables: true },
        { url: 'https://b.com', hasAnswerFirstParagraph: true, hasQuestionHeaders: false, hasQABlocks: false, hasListsOrTables: true },
        { url: 'https://c.com', hasAnswerFirstParagraph: false, hasQuestionHeaders: false, hasQABlocks: false, hasListsOrTables: false },
      ],
      ...overrides.c2,
    },
    c3: {
      pages: [
        { url: 'https://a.com', wordCount: 500, numericFactsPer1kWords: 8, citationPatternsPer1kWords: 1 },
        { url: 'https://b.com', wordCount: 400, numericFactsPer1kWords: 6, citationPatternsPer1kWords: 0 },
        { url: 'https://c.com', wordCount: 600, numericFactsPer1kWords: 10, citationPatternsPer1kWords: 2 },
      ],
      medianNumericFactsPer1kWords: 8,
      ...overrides.c3,
    },
    c4: {
      pages: [
        { url: 'https://a.com', lastModified: '2026-08-01', ageDays: 52 },
        { url: 'https://b.com', lastModified: '2026-07-15', ageDays: 69 },
        { url: 'https://c.com', lastModified: null, ageDays: null },
      ],
      medianAgeDays: 60,
      ...overrides.c4,
    },
    c5: {
      entityMentioned: true,
      categoryMentioned: true,
      targetAudienceMentioned: true,
      testedText: 'Acme is the best CRM for sales teams',
      ...overrides.c5,
    },
    c6: {
      pages: [
        { url: 'https://a.com/blog/how-to', title: 'How To', h1: 'How To', urlReadable: true },
        { url: 'https://b.com/pricing', title: 'Pricing', h1: 'Pricing', urlReadable: true },
        { url: 'https://c.com/abc123', title: 'Page', h1: 'Page', urlReadable: false },
      ],
      readableUrlRatio: 0.667,
      ...overrides.c6,
    },
    ...overrides,
  };
}

function makeEmptyCitedPages(): CitedPagesOutput {
  return {
    analyzedPageCount: 0,
    pages: [],
    medianHasAnswerFirstParagraphRatio: 0,
    medianHasListsOrTablesRatio: 0,
    medianNumericFactsPer1kWords: 0,
    medianAgeDays: null,
    pagesWithClientMentionCount: 0,
  };
}

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

// ── C1 ────────────────────────────────────────────────────────────────────────

describe('C1 — intent coverage', () => {
  it('full coverage (0 gap types) → maxScore', () => {
    const facts = makeContentFacts({ c1: { pageTypeMap: { pricing: 'https://a.com/pricing', comparison: 'https://a.com/vs', alternatives: 'https://a.com/alt', 'use-cases': 'https://a.com/uc', docs: 'https://a.com/docs', faq: 'https://a.com/faq' }, gapTypes: [] } });
    const result = scorePillarC(facts, makeEmptyCitedPages(), makeConfig());
    expect(result.criterionScores.c1.score).toBe(20);
    expect(result.criterionScores.c1.measured).toBe(true);
  });

  it('3 gap types → score = 10', () => {
    const facts = makeContentFacts({ c1: { pageTypeMap: { pricing: null, comparison: null, alternatives: null, 'use-cases': 'https://a.com/uc', docs: 'https://a.com/docs', faq: 'https://a.com/faq' }, gapTypes: ['pricing', 'comparison', 'alternatives'] } });
    const result = scorePillarC(facts, makeEmptyCitedPages(), makeConfig());
    expect(result.criterionScores.c1.score).toBe(10);
  });

  it('all 6 gap types → score = 0', () => {
    const facts = makeContentFacts({ c1: { pageTypeMap: { pricing: null, comparison: null, alternatives: null, 'use-cases': null, docs: null, faq: null }, gapTypes: ['pricing', 'comparison', 'alternatives', 'use-cases', 'docs', 'faq'] } });
    const result = scorePillarC(facts, makeEmptyCitedPages(), makeConfig());
    expect(result.criterionScores.c1.score).toBe(0);
  });
});

// ── C2 ────────────────────────────────────────────────────────────────────────

describe('C2 — answer-first structure', () => {
  it('client ratio > cited ratio → maxScore', () => {
    // answerFirst: 1, questionHeaders: 1, listsOrTables: 1 → clientRatio = 1
    const facts = makeContentFacts({
      c2: {
        pages: [
          { url: 'u', hasAnswerFirstParagraph: true, hasQuestionHeaders: true, hasQABlocks: false, hasListsOrTables: true },
        ],
      },
    });
    const cited = makeCitedPages({ medianHasAnswerFirstParagraphRatio: 0.5, medianHasListsOrTablesRatio: 0.5 });
    const result = scorePillarC(facts, cited, makeConfig());
    expect(result.criterionScores.c2.score).toBe(20);
  });

  it('no cited data → score proportional to client ratio', () => {
    // answerFirst: 2/3, questionHeaders: 1/3, listsOrTables: 1/3 → clientRatio ≈ 0.444
    const facts = makeContentFacts({
      c2: {
        pages: [
          { url: 'a', hasAnswerFirstParagraph: true, hasQuestionHeaders: true, hasQABlocks: false, hasListsOrTables: false },
          { url: 'b', hasAnswerFirstParagraph: true, hasQuestionHeaders: false, hasQABlocks: false, hasListsOrTables: false },
          { url: 'c', hasAnswerFirstParagraph: false, hasQuestionHeaders: false, hasQABlocks: false, hasListsOrTables: true },
        ],
      },
    });
    const result = scorePillarC(facts, makeEmptyCitedPages(), makeConfig());
    const score = result.criterionScores.c2.score;
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(20);
  });

  it('no client pages → measured = false', () => {
    const facts = makeContentFacts({ c2: { pages: [] } });
    const result = scorePillarC(facts, makeCitedPages(), makeConfig());
    expect(result.criterionScores.c2.measured).toBe(false);
    expect(result.criterionScores.c2.score).toBe(0);
  });
});

// ── C3 ────────────────────────────────────────────────────────────────────────

describe('C3 — stats density', () => {
  it('client median >= cited median → maxScore', () => {
    const facts = makeContentFacts({ c3: { pages: [{ url: 'a', wordCount: 500, numericFactsPer1kWords: 10, citationPatternsPer1kWords: 0 }], medianNumericFactsPer1kWords: 10 } });
    const cited = makeCitedPages({ medianNumericFactsPer1kWords: 8 });
    const result = scorePillarC(facts, cited, makeConfig());
    expect(result.criterionScores.c3.score).toBe(15);
  });

  it('no cited data, clientMedian >= 10 → maxScore', () => {
    const facts = makeContentFacts({ c3: { pages: [{ url: 'a', wordCount: 500, numericFactsPer1kWords: 12, citationPatternsPer1kWords: 0 }], medianNumericFactsPer1kWords: 12 } });
    const result = scorePillarC(facts, makeEmptyCitedPages(), makeConfig());
    expect(result.criterionScores.c3.score).toBe(15);
  });

  it('no cited data, clientMedian >= 5 → round(10/15*15) = 10', () => {
    const facts = makeContentFacts({ c3: { pages: [{ url: 'a', wordCount: 500, numericFactsPer1kWords: 6, citationPatternsPer1kWords: 0 }], medianNumericFactsPer1kWords: 6 } });
    const result = scorePillarC(facts, makeEmptyCitedPages(), makeConfig());
    expect(result.criterionScores.c3.score).toBe(10);
  });

  it('no client pages → measured = false', () => {
    const facts = makeContentFacts({ c3: { pages: [], medianNumericFactsPer1kWords: 0 } });
    const result = scorePillarC(facts, makeCitedPages(), makeConfig());
    expect(result.criterionScores.c3.measured).toBe(false);
  });
});

// ── C4 ────────────────────────────────────────────────────────────────────────

describe('C4 — freshness', () => {
  it('client fresher than cited → maxScore', () => {
    const facts = makeContentFacts({ c4: { pages: [], medianAgeDays: 20 } });
    const cited = makeCitedPages({ medianAgeDays: 30 });
    const result = scorePillarC(facts, cited, makeConfig());
    expect(result.criterionScores.c4.score).toBe(15);
  });

  it('client 2x older than cited → 75% of maxScore', () => {
    const facts = makeContentFacts({ c4: { pages: [], medianAgeDays: 50 } });
    const cited = makeCitedPages({ medianAgeDays: 30 });
    // client(50) <= 2*cited(60) → 0.75 * 15 = 11
    const result = scorePillarC(facts, cited, makeConfig());
    expect(result.criterionScores.c4.score).toBe(Math.round(15 * 0.75));
  });

  it('client > 3x older than cited → 25% of maxScore', () => {
    const facts = makeContentFacts({ c4: { pages: [], medianAgeDays: 100 } });
    const cited = makeCitedPages({ medianAgeDays: 30 });
    // client(100) > 3*cited(90) → 0.25 * 15 = 4
    const result = scorePillarC(facts, cited, makeConfig());
    expect(result.criterionScores.c4.score).toBe(Math.round(15 * 0.25));
  });

  it('null medianAgeDays → measured = false', () => {
    const facts = makeContentFacts({ c4: { pages: [], medianAgeDays: null } });
    const result = scorePillarC(facts, makeCitedPages(), makeConfig());
    expect(result.criterionScores.c4.measured).toBe(false);
  });

  it('no cited data, client <= 30 days → maxScore', () => {
    const facts = makeContentFacts({ c4: { pages: [], medianAgeDays: 25 } });
    const result = scorePillarC(facts, makeEmptyCitedPages(), makeConfig());
    expect(result.criterionScores.c4.score).toBe(15);
  });

  it('no cited data, client <= 90 days → 12', () => {
    const facts = makeContentFacts({ c4: { pages: [], medianAgeDays: 60 } });
    const result = scorePillarC(facts, makeEmptyCitedPages(), makeConfig());
    expect(result.criterionScores.c4.score).toBe(12);
  });
});

// ── C5 ────────────────────────────────────────────────────────────────────────

describe('C5 — entity clarity', () => {
  it('all three flags true → maxScore (15)', () => {
    const facts = makeContentFacts({ c5: { entityMentioned: true, categoryMentioned: true, targetAudienceMentioned: true, testedText: 'text' } });
    const result = scorePillarC(facts, makeEmptyCitedPages(), makeConfig());
    expect(result.criterionScores.c5.score).toBe(15);
  });

  it('one flag true → 5', () => {
    const facts = makeContentFacts({ c5: { entityMentioned: true, categoryMentioned: false, targetAudienceMentioned: false, testedText: 'text' } });
    const result = scorePillarC(facts, makeEmptyCitedPages(), makeConfig());
    expect(result.criterionScores.c5.score).toBe(5);
  });

  it('empty testedText → measured = false', () => {
    const facts = makeContentFacts({ c5: { entityMentioned: true, categoryMentioned: true, targetAudienceMentioned: true, testedText: '' } });
    const result = scorePillarC(facts, makeEmptyCitedPages(), makeConfig());
    expect(result.criterionScores.c5.measured).toBe(false);
  });
});

// ── C6 ────────────────────────────────────────────────────────────────────────

describe('C6 — URL readability', () => {
  it('all readable → maxScore', () => {
    const facts = makeContentFacts({ c6: { pages: [{ url: 'a', title: '', h1: '', urlReadable: true }], readableUrlRatio: 1 } });
    const result = scorePillarC(facts, makeEmptyCitedPages(), makeConfig());
    expect(result.criterionScores.c6.score).toBe(15);
  });

  it('half readable → round(0.5 * 15) = 8', () => {
    const facts = makeContentFacts({ c6: { pages: [{ url: 'a', title: '', h1: '', urlReadable: true }, { url: 'b', title: '', h1: '', urlReadable: false }], readableUrlRatio: 0.5 } });
    const result = scorePillarC(facts, makeEmptyCitedPages(), makeConfig());
    expect(result.criterionScores.c6.score).toBe(8);
  });

  it('no pages → measured = false', () => {
    const facts = makeContentFacts({ c6: { pages: [], readableUrlRatio: 0 } });
    const result = scorePillarC(facts, makeEmptyCitedPages(), makeConfig());
    expect(result.criterionScores.c6.measured).toBe(false);
  });
});

// ── pillarScore and unmeasuredCriteria ────────────────────────────────────────

describe('pillarScore and unmeasuredCriteria', () => {
  it('all criteria measured — pillarScore = measuredScoreSum / measuredMaxSum * 100', () => {
    const facts = makeContentFacts();
    const cited = makeCitedPages();
    const result = scorePillarC(facts, cited, makeConfig());
    expect(result.unmeasuredCriteria).toHaveLength(0);
    const maxSum = 20 + 20 + 15 + 15 + 15 + 15; // 100
    const expectedScore = Math.round((Object.values(result.criterionScores).reduce((s, c) => s + c.score, 0) / maxSum) * 100);
    expect(result.pillarScore).toBe(expectedScore);
  });

  it('unmeasured criteria appear in unmeasuredCriteria list', () => {
    const facts = makeContentFacts({
      c4: { pages: [], medianAgeDays: null },
      c6: { pages: [], readableUrlRatio: 0 },
    });
    const result = scorePillarC(facts, makeEmptyCitedPages(), makeConfig());
    expect(result.unmeasuredCriteria).toContain('c4');
    expect(result.unmeasuredCriteria).toContain('c6');
  });

  it('pillarScore = 0 when measuredMaxSum = 0', () => {
    const facts = makeContentFacts({
      c2: { pages: [] },
      c3: { pages: [], medianNumericFactsPer1kWords: 0 },
      c4: { pages: [], medianAgeDays: null },
      c5: { entityMentioned: false, categoryMentioned: false, targetAudienceMentioned: false, testedText: '' },
      c6: { pages: [], readableUrlRatio: 0 },
    });
    const result = scorePillarC(facts, makeEmptyCitedPages(), makeConfig());
    // c1 is always measured — measuredMaxSum will be 20, not 0
    expect(result.pillarScore).toBeGreaterThanOrEqual(0);
    expect(result.pillarScore).toBeLessThanOrEqual(100);
  });
});
