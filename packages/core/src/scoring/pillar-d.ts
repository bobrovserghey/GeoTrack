import type { Methodology } from '@geotrack/config';
import type { CriterionScore } from './pillar-b.js';
import type { OffsiteSignalsOutput } from '../steps/offsite-signals.js';

export type PillarDResult = {
  criterionScores: Record<'d1' | 'd2' | 'd4', CriterionScore>;
  pillarScore: number;
  measuredMaxSum: number;
  unmeasuredCriteria: string[];
};

// ── D1 — review platforms ────────────────────────────────────────────────────

function scoreD1(facts: OffsiteSignalsOutput['d1'], maxScore: number): CriterionScore {
  if (!facts.measured) {
    return { criterionId: 'd1', score: 0, maxScore, measured: false };
  }

  const n = facts.clientPlatformCount;
  let score: number;
  if (n >= 4) score = maxScore;
  else if (n === 3) score = Math.round(maxScore * 0.75);
  else if (n === 2) score = Math.round(maxScore * 0.5);
  else if (n === 1) score = Math.round(maxScore * 0.25);
  else score = 0;

  return { criterionId: 'd1', score, maxScore, measured: true };
}

// ── D2 — citation source presence ───────────────────────────────────────────

function scoreD2(facts: OffsiteSignalsOutput['d2'], maxScore: number): CriterionScore {
  if (!facts.measured) {
    return { criterionId: 'd2', score: 0, maxScore, measured: false };
  }

  return {
    criterionId: 'd2',
    score: Math.round(facts.clientPresenceRatio * maxScore),
    maxScore,
    measured: true,
  };
}

// ── D4 — entity consistency ──────────────────────────────────────────────────

function scoreD4(facts: OffsiteSignalsOutput['d4'], maxScore: number): CriterionScore {
  if (!facts.measured) {
    return { criterionId: 'd4', score: 0, maxScore, measured: false };
  }

  const foundCount = (facts.linkedInFound ? 1 : 0) + (facts.crunchbaseFound ? 1 : 0);
  let score: number;
  if (foundCount >= 2) score = maxScore;
  else if (foundCount === 1) score = Math.round(maxScore * 0.5);
  else score = 0;

  return { criterionId: 'd4', score, maxScore, measured: true };
}

// ── public API ────────────────────────────────────────────────────────────────

export function scorePillarD(
  offsite: OffsiteSignalsOutput,
  config: Methodology,
): PillarDResult {
  const dConfig = config.pillars['D'];
  if (!dConfig) throw new Error('Pillar D not found in methodology config');

  const criteria = dConfig.criteria;
  const maxD1 = criteria['d1']?.maxScore ?? 35;
  const maxD2 = criteria['d2']?.maxScore ?? 35;
  const maxD4 = criteria['d4']?.maxScore ?? 30;

  const criterionScores: PillarDResult['criterionScores'] = {
    d1: scoreD1(offsite.d1, maxD1),
    d2: scoreD2(offsite.d2, maxD2),
    d4: scoreD4(offsite.d4, maxD4),
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

  const pillarScore =
    measuredMaxSum === 0 ? 0 : Math.round((measuredScoreSum / measuredMaxSum) * 100);

  return { criterionScores, pillarScore, measuredMaxSum, unmeasuredCriteria };
}
