import type { Methodology } from '@geotrack/config';
import type { CriterionScore } from './pillar-b.js';
import type { EngineResponseFacts } from '../steps/extract-mentions.js';
import type { AccuracyFact } from '../steps/accuracy-check.js';
import type { ToneFact } from '../steps/tone-check.js';

export type PillarAResult = {
  criterionScores: Record<'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'a6', CriterionScore>;
  pillarScore: number;
  measuredMaxSum: number;
  unmeasuredCriteria: string[];
};

// ---- re-export for callers --------------------------------------------------

export type { AccuracyFact, ToneFact };

// ---- per-criterion scoring --------------------------------------------------

function scoreA1(facts: EngineResponseFacts[], maxScore: number): { score: number; measured: boolean } {
  if (facts.length === 0) return { score: 0, measured: false };
  const count = facts.filter((f) => f.brandMentioned).length;
  return { score: Math.round((count / facts.length) * maxScore), measured: true };
}

function scoreA2(
  facts: EngineResponseFacts[],
  clientDomain: string,
  maxScore: number,
): { score: number; measured: boolean } {
  if (facts.length === 0) return { score: 0, measured: false };
  const count = facts.filter((f) => f.citedDomains.includes(clientDomain)).length;
  return { score: Math.round((count / facts.length) * maxScore), measured: true };
}

function scoreA3(facts: EngineResponseFacts[], maxScore: number): { score: number; measured: boolean } {
  const withPosition = facts.filter((f) => f.normalizedPositionScore !== null);
  if (withPosition.length === 0) return { score: 0, measured: false };
  const avg =
    withPosition.reduce((sum, f) => sum + (f.normalizedPositionScore as number), 0) / withPosition.length;
  return { score: Math.round((avg / 100) * maxScore), measured: true };
}

function scoreA5(accuracyFacts: AccuracyFact[], maxScore: number): { score: number; measured: boolean } {
  if (accuracyFacts.length === 0) return { score: 0, measured: false };
  const accurateCount = accuracyFacts.filter((f) => f.inaccurateClaims === 0).length;
  return { score: Math.round((accurateCount / accuracyFacts.length) * maxScore), measured: true };
}

function scoreA6(toneFacts: ToneFact[], maxScore: number): { score: number; measured: boolean } {
  if (toneFacts.length === 0) return { score: 0, measured: false };
  const positiveCount = toneFacts.filter((f) => f.tone === 'positive').length;
  const neutralCount = toneFacts.filter((f) => f.tone === 'neutral').length;
  const weighted = positiveCount + 0.5 * neutralCount;
  return { score: Math.round((weighted / toneFacts.length) * maxScore), measured: true };
}

function scoreA4(facts: EngineResponseFacts[], maxScore: number): { score: number; measured: boolean } {
  const brandCount = facts.filter((f) => f.brandMentioned).length;
  const competitorCount = facts.reduce(
    (sum, f) => sum + f.competitorMentions.reduce((s, c) => s + c.count, 0),
    0,
  );
  const total = brandCount + competitorCount;
  if (total === 0) return { score: 0, measured: false };
  return { score: Math.round((brandCount / total) * maxScore), measured: true };
}

// ---- public API -------------------------------------------------------------

export function scorePillarA(
  facts: EngineResponseFacts[],
  config: Methodology,
  clientDomain: string,
  accuracyFacts: AccuracyFact[] = [],
  toneFacts: ToneFact[] = [],
): PillarAResult {
  const aConfig = config.pillars['A'];
  if (!aConfig) throw new Error('Pillar A not found in methodology config');

  const criteria = aConfig.criteria;
  const maxA1 = criteria['a1']?.maxScore ?? 20;
  const maxA2 = criteria['a2']?.maxScore ?? 15;
  const maxA3 = criteria['a3']?.maxScore ?? 15;
  const maxA4 = criteria['a4']?.maxScore ?? 20;
  const maxA5 = criteria['a5']?.maxScore ?? 15;
  const maxA6 = criteria['a6']?.maxScore ?? 15;

  const a1 = scoreA1(facts, maxA1);
  const a2 = scoreA2(facts, clientDomain, maxA2);
  const a3 = scoreA3(facts, maxA3);
  const a4 = scoreA4(facts, maxA4);
  const a5 = scoreA5(accuracyFacts, maxA5);
  const a6 = scoreA6(toneFacts, maxA6);

  const criterionScores: PillarAResult['criterionScores'] = {
    a1: { criterionId: 'a1', score: a1.score, maxScore: maxA1, measured: a1.measured },
    a2: { criterionId: 'a2', score: a2.score, maxScore: maxA2, measured: a2.measured },
    a3: { criterionId: 'a3', score: a3.score, maxScore: maxA3, measured: a3.measured },
    a4: { criterionId: 'a4', score: a4.score, maxScore: maxA4, measured: a4.measured },
    a5: { criterionId: 'a5', score: a5.score, maxScore: maxA5, measured: a5.measured },
    a6: { criterionId: 'a6', score: a6.score, maxScore: maxA6, measured: a6.measured },
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
