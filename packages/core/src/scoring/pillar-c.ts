import type { Methodology } from '@geotrack/config';
import type { CriterionScore } from './pillar-b.js';
import type { ContentCheckFacts } from '../steps/content-check.js';
import type { CitedPagesOutput } from '../steps/cited-pages.js';

export type PillarCResult = {
  criterionScores: Record<'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6', CriterionScore>;
  pillarScore: number;
  measuredMaxSum: number;
  unmeasuredCriteria: string[];
};

// ── helpers ──────────────────────────────────────────────────────────────────

function ratio(values: boolean[]): number {
  if (values.length === 0) return 0;
  return values.filter(Boolean).length / values.length;
}

// ── per-criterion scoring ────────────────────────────────────────────────────

function scoreC1(facts: ContentCheckFacts['c1'], maxScore: number): CriterionScore {
  const coveredCount = 6 - facts.gapTypes.length;
  return {
    criterionId: 'c1',
    score: Math.round((coveredCount / 6) * maxScore),
    maxScore,
    measured: true,
  };
}

function scoreC2(
  facts: ContentCheckFacts['c2'],
  cited: CitedPagesOutput,
  maxScore: number,
): CriterionScore {
  const pages = facts.pages;
  if (pages.length === 0) {
    return { criterionId: 'c2', score: 0, maxScore, measured: false };
  }

  const answerFirstRatio = ratio(pages.map((p) => p.hasAnswerFirstParagraph));
  const questionHeadersRatio = ratio(pages.map((p) => p.hasQuestionHeaders));
  const listsOrTablesRatio = ratio(pages.map((p) => p.hasListsOrTables));
  const clientStructureRatio = (answerFirstRatio + questionHeadersRatio + listsOrTablesRatio) / 3;

  let score: number;
  if (cited.analyzedPageCount > 0) {
    const citedStructureRatio =
      (cited.medianHasAnswerFirstParagraphRatio + cited.medianHasListsOrTablesRatio) / 2;
    const baseline = Math.max(citedStructureRatio, 0.01);
    score = Math.round(Math.min(clientStructureRatio / baseline, 1) * maxScore);
  } else {
    score = Math.round(clientStructureRatio * maxScore);
  }

  return { criterionId: 'c2', score, maxScore, measured: true };
}

function scoreC3(
  facts: ContentCheckFacts['c3'],
  cited: CitedPagesOutput,
  maxScore: number,
): CriterionScore {
  if (facts.pages.length === 0) {
    return { criterionId: 'c3', score: 0, maxScore, measured: false };
  }

  const clientMedian = facts.medianNumericFactsPer1kWords;
  let score: number;

  if (cited.analyzedPageCount > 0) {
    const citedMedian = cited.medianNumericFactsPer1kWords;
    score = Math.round(Math.min(clientMedian / Math.max(citedMedian, 1), 1) * maxScore);
  } else {
    // Absolute scale when no cited data
    if (clientMedian >= 10) score = maxScore;
    else if (clientMedian >= 5) score = Math.round((10 / 15) * maxScore);
    else if (clientMedian >= 2) score = Math.round((5 / 15) * maxScore);
    else score = 0;
  }

  return { criterionId: 'c3', score, maxScore, measured: true };
}

function scoreC4(
  facts: ContentCheckFacts['c4'],
  cited: CitedPagesOutput,
  maxScore: number,
): CriterionScore {
  const clientAgeDays = facts.medianAgeDays;
  if (clientAgeDays === null) {
    return { criterionId: 'c4', score: 0, maxScore, measured: false };
  }

  let score: number;
  const citedAgeDays = cited.medianAgeDays;

  if (citedAgeDays !== null) {
    if (clientAgeDays <= citedAgeDays) {
      score = maxScore;
    } else if (clientAgeDays <= 2 * citedAgeDays) {
      score = Math.round(maxScore * 0.75);
    } else if (clientAgeDays <= 3 * citedAgeDays) {
      score = Math.round(maxScore * 0.5);
    } else {
      score = Math.round(maxScore * 0.25);
    }
  } else {
    // Absolute scale when no cited data
    if (clientAgeDays <= 30) score = maxScore;
    else if (clientAgeDays <= 90) score = 12;
    else if (clientAgeDays <= 180) score = 8;
    else if (clientAgeDays <= 365) score = 4;
    else score = 0;
  }

  return { criterionId: 'c4', score, maxScore, measured: true };
}

function scoreC5(facts: ContentCheckFacts['c5'], maxScore: number): CriterionScore {
  if (facts.testedText.length === 0) {
    return { criterionId: 'c5', score: 0, maxScore, measured: false };
  }

  const perFlag = Math.round(maxScore / 3);
  const score =
    (facts.entityMentioned ? perFlag : 0) +
    (facts.categoryMentioned ? perFlag : 0) +
    (facts.targetAudienceMentioned ? perFlag : 0);

  return { criterionId: 'c5', score, maxScore, measured: true };
}

function scoreC6(facts: ContentCheckFacts['c6'], maxScore: number): CriterionScore {
  if (facts.pages.length === 0) {
    return { criterionId: 'c6', score: 0, maxScore, measured: false };
  }

  return {
    criterionId: 'c6',
    score: Math.round(facts.readableUrlRatio * maxScore),
    maxScore,
    measured: true,
  };
}

// ── public API ────────────────────────────────────────────────────────────────

export function scorePillarC(
  contentFacts: ContentCheckFacts,
  citedPages: CitedPagesOutput,
  config: Methodology,
): PillarCResult {
  const cConfig = config.pillars['C'];
  if (!cConfig) throw new Error('Pillar C not found in methodology config');

  const criteria = cConfig.criteria;
  const maxC1 = criteria['c1']?.maxScore ?? 20;
  const maxC2 = criteria['c2']?.maxScore ?? 20;
  const maxC3 = criteria['c3']?.maxScore ?? 15;
  const maxC4 = criteria['c4']?.maxScore ?? 15;
  const maxC5 = criteria['c5']?.maxScore ?? 15;
  const maxC6 = criteria['c6']?.maxScore ?? 15;

  const criterionScores: PillarCResult['criterionScores'] = {
    c1: scoreC1(contentFacts.c1, maxC1),
    c2: scoreC2(contentFacts.c2, citedPages, maxC2),
    c3: scoreC3(contentFacts.c3, citedPages, maxC3),
    c4: scoreC4(contentFacts.c4, citedPages, maxC4),
    c5: scoreC5(contentFacts.c5, maxC5),
    c6: scoreC6(contentFacts.c6, maxC6),
  };

  const unmeasuredCriteria: string[] = [];
  let measuredScoreSum = 0;
  let measuredMaxSum = 0;

  for (const [cid, cs] of Object.entries(criterionScores)) {
    if (!cs.measured) {
      unmeasuredCriteria.push(cid);
    } else {
      measuredScoreSum += cs.score;
      measuredMaxSum += cs.maxScore;
    }
  }

  const pillarScore = measuredMaxSum === 0 ? 0 : Math.round((measuredScoreSum / measuredMaxSum) * 100);

  return { criterionScores, pillarScore, measuredMaxSum, unmeasuredCriteria };
}
