import type { TechCheckFacts } from '../steps/tech-check.js';
import type { Methodology } from '@geotrack/config';
import { AI_BOTS } from '../checks/robots.js';

export type CriterionScore = {
  criterionId: string;
  score: number;
  maxScore: number;
  measured: boolean;
};

export type PillarBResult = {
  criterionScores: Record<'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'b6', CriterionScore>;
  pillarScore: number;
  measuredMaxSum: number;
  unmeasuredCriteria: string[];
  appliedBlockers: string[];
};

// ---------- per-criterion scoring --------------------------------------------

function scoreB1(facts: TechCheckFacts['b1'], maxScore: number): number {
  if (!facts.measured) return 0;
  const accessible = AI_BOTS.filter((b) => facts.permissions[b] !== 'blocked').length;
  return Math.round((accessible / AI_BOTS.length) * maxScore);
}

function scoreB2(facts: TechCheckFacts['b2'], maxScore: number): number {
  if (!facts.measured) return 0;
  const total = facts.results.length;
  if (total === 0) return 0;
  const blocked = facts.results.filter((r) => r.blocked).length;
  return Math.round(((total - blocked) / total) * maxScore);
}

function scoreB3(facts: TechCheckFacts['b3']): number {
  if (!facts.measured) return 0;
  const r = facts.contentRatio;
  if (r >= 0.8) return 15;
  if (r >= 0.6) return 12;
  if (r >= 0.4) return 8;
  if (r >= 0.2) return 4;
  return 0;
}

function scoreB4(facts: TechCheckFacts['b4'], maxScore: number): number {
  if (!facts.measured) return 0;
  const total = facts.pagesChecked.length;
  if (total === 0) return 0;
  const indexed = facts.pagesChecked.filter((p) => p.indexed).length;
  return Math.round((indexed / total) * maxScore);
}

function scoreB5(facts: TechCheckFacts['b5']): number {
  if (!facts.measured) return 0;
  let score = facts.sitemapPresent ? 5 : 0;
  const pages = facts.pageResults;
  if (pages.length === 0) return score;
  const withCanonical = pages.filter((p) => p.canonical !== null).length;
  const withoutRedirect = pages.filter((p) => !p.isRedirect).length;
  const fastTtfb = pages.filter((p) => p.ttfbMs < 800).length;
  score += Math.round((withCanonical / pages.length) * 4);
  score += Math.round((withoutRedirect / pages.length) * 3);
  score += Math.round((fastTtfb / pages.length) * 3);
  return score;
}

function scoreB6(facts: TechCheckFacts['b6'], now: Date): number {
  if (!facts.measured) return 0;

  let lastmodScore = 0;
  if (facts.sitemapLastmod !== null) {
    const ageDays = (now.getTime() - new Date(facts.sitemapLastmod).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays <= 30) lastmodScore = 4;
    else if (ageDays <= 90) lastmodScore = 3;
    else if (ageDays <= 180) lastmodScore = 2;
    else if (ageDays <= 365) lastmodScore = 1;
  }

  const total6 = facts.pagesWithLastModified + facts.stalePageCount;
  let staleScore = 6;
  if (total6 > 0) {
    const staleRate = facts.stalePageCount / total6;
    if (staleRate === 0) staleScore = 6;
    else if (staleRate <= 0.10) staleScore = 4;
    else if (staleRate <= 0.25) staleScore = 2;
    else staleScore = 0;
  }

  return lastmodScore + staleScore;
}

// ---------- blocker evaluation -----------------------------------------------

function checkBlockers(facts: TechCheckFacts, config: Methodology): string[] {
  const applied: string[] = [];

  for (const blocker of config.blockers) {
    if (blocker.pillar !== 'B') continue;

    // Skip if any required criterion is not measured
    const allMeasured = blocker.dependsOn.every((cid) => {
      const f = facts[cid as keyof TechCheckFacts];
      return f.measured === true;
    });
    if (!allMeasured) continue;

    switch (blocker.id) {
      case 'b1_all_bots_robots_blocked': {
        const b1 = facts.b1;
        if (b1.measured && AI_BOTS.every((bot) => b1.permissions[bot] === 'blocked')) {
          applied.push(blocker.id);
        }
        break;
      }
      case 'b2_all_bots_http_blocked': {
        const b2 = facts.b2;
        if (b2.measured) {
          const allBotsBlocked = AI_BOTS.every((bot) => {
            const botResults = b2.results.filter((r) => r.bot === bot);
            return botResults.length > 0 && botResults.every((r) => r.blocked);
          });
          if (allBotsBlocked) applied.push(blocker.id);
        }
        break;
      }
      case 'b3_no_static_content': {
        const b3 = facts.b3;
        if (b3.measured && b3.contentRatio < 0.2) applied.push(blocker.id);
        break;
      }
      case 'b4_no_pages_indexed': {
        const b4 = facts.b4;
        if (b4.measured && b4.pagesChecked.length > 0 && b4.pagesChecked.every((p) => !p.indexed)) {
          applied.push(blocker.id);
        }
        break;
      }
    }
  }

  return applied;
}

// ---------- public API -------------------------------------------------------

export function scorePillarB(
  facts: TechCheckFacts,
  config: Methodology,
  now: Date,
): PillarBResult {
  const bConfig = config.pillars['B'];
  if (!bConfig) throw new Error('Pillar B not found in methodology config');

  const criteria = bConfig.criteria;
  const maxB1 = criteria['b1']?.maxScore ?? 20;
  const maxB2 = criteria['b2']?.maxScore ?? 25;
  const maxB4 = criteria['b4']?.maxScore ?? 15;

  const b1Measured = facts.b1.measured;
  const b2Measured = facts.b2.measured;
  const b3Measured = facts.b3.measured;
  const b4Measured = facts.b4.measured;
  const b5Measured = facts.b5.measured;
  const b6Measured = facts.b6.measured;

  const criterionScores: PillarBResult['criterionScores'] = {
    b1: { criterionId: 'b1', score: scoreB1(facts.b1, maxB1), maxScore: maxB1, measured: b1Measured },
    b2: { criterionId: 'b2', score: scoreB2(facts.b2, maxB2), maxScore: maxB2, measured: b2Measured },
    b3: { criterionId: 'b3', score: scoreB3(facts.b3), maxScore: 15, measured: b3Measured },
    b4: { criterionId: 'b4', score: scoreB4(facts.b4, maxB4), maxScore: maxB4, measured: b4Measured },
    b5: { criterionId: 'b5', score: scoreB5(facts.b5), maxScore: 15, measured: b5Measured },
    b6: { criterionId: 'b6', score: scoreB6(facts.b6, now), maxScore: 10, measured: b6Measured },
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

  const appliedBlockers = checkBlockers(facts, config);

  return { criterionScores, pillarScore, measuredMaxSum, unmeasuredCriteria, appliedBlockers };
}
