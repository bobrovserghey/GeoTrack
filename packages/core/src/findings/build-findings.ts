import type { Finding, FindingsFacts, FindingsScores } from './types.js';
import { FINDING_TEMPLATES } from './templates.js';

const DEFAULT_MAX_FINDINGS = 15;

/**
 * Evaluate all finding templates against the collected facts and pillar scores,
 * compute priorities and deltas, then return up to maxFindings sorted by priority.
 *
 * expectedScoreDelta is scaled by how much the pillar has already lost:
 *   delta = maxDelta × (1 − pillarScore / 100)
 * so a finding in a pillar already scoring 100 contributes nothing.
 *
 * priority = |delta| / effortHours
 */
export function buildFindings(
  facts: FindingsFacts,
  scores: FindingsScores,
  maxFindings: number = DEFAULT_MAX_FINDINGS,
): Finding[] {
  const triggered: Finding[] = [];

  for (const tpl of FINDING_TEMPLATES) {
    let fires: boolean;
    try {
      fires = tpl.condition(facts);
    } catch {
      // defensive: if condition throws (null access on missing fact), skip template
      fires = false;
    }
    if (!fires) continue;

    const pillarScore = scores.pillarScores[tpl.pillar] ?? 0;
    const scaleFactor = Math.max(0, 1 - pillarScore / 100);
    const expectedScoreDelta = scaleFactor === 0 ? 0 : Math.round(tpl.maxDelta * scaleFactor * 100) / 100;
    const priority = tpl.effortHours > 0
      ? Math.round((Math.abs(expectedScoreDelta) / tpl.effortHours) * 1000) / 1000
      : 0;

    let evidence = null;
    if (tpl.buildEvidence) {
      try {
        evidence = tpl.buildEvidence(facts);
      } catch {
        // evidence is optional; ignore errors
      }
    }

    triggered.push({
      id: tpl.id,
      criterionId: tpl.criterionId,
      pillar: tpl.pillar,
      title: tpl.title,
      description: tpl.description,
      impact: tpl.impact,
      expectedScoreDelta,
      effortHours: tpl.effortHours,
      priority,
      evidence,
      howToFix: tpl.howToFix,
    });
  }

  // sort: by priority desc, then by impact severity (critical > warning > notice)
  const impactOrder: Record<string, number> = { critical: 0, warning: 1, notice: 2 };

  triggered.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (impactOrder[a.impact] ?? 3) - (impactOrder[b.impact] ?? 3);
  });

  return triggered.slice(0, Math.max(0, maxFindings));
}
