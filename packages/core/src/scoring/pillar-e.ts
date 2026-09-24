import type { Methodology } from '@geotrack/config';
import type { CriterionScore } from './pillar-b.js';
import type { E1AgentScenarioFacts } from '../steps/agent-scenario-check.js';
import type { E2AccessibilityFacts, E3BarrierFacts } from '../steps/accessibility-check.js';
import type { E4MachineReadableFacts, E5AgentInterfaceFacts } from '../steps/machine-readable-check.js';

export type PillarEResult = {
  criterionScores: Record<'e1' | 'e2' | 'e3' | 'e4' | 'e5', CriterionScore>;
  pillarScore: number;
  measuredMaxSum: number;
  unmeasuredCriteria: string[];
  appliedBlockers: string[];
};

// ── per-criterion scoring ────────────────────────────────────────────────────

function scoreE1(e1: E1AgentScenarioFacts, maxScore: number): CriterionScore {
  if (!e1.measured) {
    return { criterionId: 'e1', score: 0, maxScore, measured: false };
  }
  const successCount =
    (e1.findPrice.attempts > 0 && e1.findPrice.success ? 1 : 0) +
    (e1.startRegistration.attempts > 0 && e1.startRegistration.success ? 1 : 0);
  return { criterionId: 'e1', score: Math.round((successCount / 2) * maxScore), maxScore, measured: true };
}

function scoreE2(e2: E2AccessibilityFacts, maxScore: number): CriterionScore {
  if (!e2.measured) {
    return { criterionId: 'e2', score: 0, maxScore, measured: false };
  }
  const totalWeight =
    e2.criticalCount * 4 + e2.seriousCount * 2 + e2.moderateCount * 1 + e2.minorCount * 0.5;
  const normalizedPenalty = e2.pagesAudited > 0 ? totalWeight / e2.pagesAudited : 0;
  const PENALTY_CAP = 15;
  const score = Math.round(maxScore * Math.max(0, 1 - normalizedPenalty / PENALTY_CAP));
  return { criterionId: 'e2', score, maxScore, measured: true };
}

function scoreE3(e3: E3BarrierFacts, maxScore: number): CriterionScore {
  if (!e3.measured) {
    return { criterionId: 'e3', score: 0, maxScore, measured: false };
  }
  const penalty =
    (e3.captchaDetected ? 6 : 0) +
    (e3.antibotWallDetected ? 6 : 0) +
    (e3.jsOnlyContent ? 4 : 0) +
    (e3.blockingPopupDetected ? 2 : 0);
  return { criterionId: 'e3', score: Math.max(0, maxScore - penalty), maxScore, measured: true };
}

function scoreE4(e4: E4MachineReadableFacts, maxScore: number): CriterionScore {
  let score = 0;
  if (e4.pricingStructured) score += Math.round(maxScore * 6 / 20);
  else if (e4.pricingPageFound) score += Math.round(maxScore * 2 / 20);
  if (e4.openApiSpecFound) score += Math.round(maxScore * 5 / 20);
  if (e4.apiDocsFound) score += Math.round(maxScore * 5 / 20);
  if (e4.productCatalogFound) score += Math.round(maxScore * 4 / 20);
  // components are rounded individually; clamp so the sum can never exceed maxScore
  return { criterionId: 'e4', score: Math.min(score, maxScore), maxScore, measured: true };
}

function scoreE5(e5: E5AgentInterfaceFacts, maxScore: number): CriterionScore {
  let score = 0;
  if (e5.llmsTxtValid) score += Math.round(maxScore * 5 / 15);
  else if (e5.llmsTxtFound) score += Math.round(maxScore * 2 / 15);
  if (e5.agentsJsonFound) score += Math.round(maxScore * 4 / 15);
  if (e5.webMcpManifestFound) score += Math.round(maxScore * 3 / 15);
  if (e5.mcpServerFound) score += Math.round(maxScore * 3 / 15);
  // components are rounded individually; clamp so the sum can never exceed maxScore
  return { criterionId: 'e5', score: Math.min(score, maxScore), maxScore, measured: true };
}

// ── blocker evaluation ───────────────────────────────────────────────────────

function checkBlockers(e1: E1AgentScenarioFacts): string[] {
  const applied: string[] = [];
  if (e1.measured && e1.findPrice.attempts > 0 && !e1.findPrice.success) {
    applied.push('e1_find_price_failed');
  }
  return applied;
}

// ── public API ────────────────────────────────────────────────────────────────

export function scorePillarE(
  e1: E1AgentScenarioFacts,
  e2: E2AccessibilityFacts,
  e3: E3BarrierFacts,
  e4: E4MachineReadableFacts,
  e5: E5AgentInterfaceFacts,
  config: Methodology,
): PillarEResult {
  const eConfig = config.pillars['E'];
  if (!eConfig) throw new Error('Pillar E not found in methodology config');

  const criteria = eConfig.criteria;
  const maxE1 = criteria['e1']?.maxScore ?? 30;
  const maxE2 = criteria['e2']?.maxScore ?? 20;
  const maxE3 = criteria['e3']?.maxScore ?? 15;
  const maxE4 = criteria['e4']?.maxScore ?? 20;
  const maxE5 = criteria['e5']?.maxScore ?? 15;

  const criterionScores: PillarEResult['criterionScores'] = {
    e1: scoreE1(e1, maxE1),
    e2: scoreE2(e2, maxE2),
    e3: scoreE3(e3, maxE3),
    e4: scoreE4(e4, maxE4),
    e5: scoreE5(e5, maxE5),
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

  let pillarScore = measuredMaxSum === 0 ? 0 : Math.round((measuredScoreSum / measuredMaxSum) * 100);

  const appliedBlockers = checkBlockers(e1);
  if (appliedBlockers.length > 0) {
    pillarScore = Math.min(pillarScore, 40);
  }

  return { criterionScores, pillarScore, measuredMaxSum, unmeasuredCriteria, appliedBlockers };
}
