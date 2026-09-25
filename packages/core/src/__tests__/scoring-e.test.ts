import { describe, it, expect } from 'vitest';
import { scorePillarE } from '../scoring/pillar-e.js';
import type { Methodology } from '@geotrack/config';
import type { E1AgentScenarioFacts } from '../steps/agent-scenario-check.js';
import type { E2AccessibilityFacts, E3BarrierFacts } from '../steps/accessibility-check.js';
import type { E4MachineReadableFacts, E5AgentInterfaceFacts } from '../steps/machine-readable-check.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeConfig(): Methodology {
  return {
    version: 1,
    pillars: {
      E: {
        weight: 0.15,
        criteria: {
          e1: { id: 'e1', maxScore: 30 },
          e2: { id: 'e2', maxScore: 20 },
          e3: { id: 'e3', maxScore: 15 },
          e4: { id: 'e4', maxScore: 20 },
          e5: { id: 'e5', maxScore: 15 },
        },
      },
    },
    blockers: [],
    bands: [],
    interval: { hRepFallback: 0.3, hCovFactor: 0.5, hRepFactor: 0.3 },
    basket: { realizationFactor: 0.7 },
  };
}

const E1_BOTH_SUCCESS: E1AgentScenarioFacts = {
  measured: true,
  findPrice: { success: true, attempts: 1, steps: ['found pricing'], failurePoint: null },
  startRegistration: { success: true, attempts: 1, steps: ['found form'], failurePoint: null },
};

const E1_FIND_SUCCESS_ONLY: E1AgentScenarioFacts = {
  measured: true,
  findPrice: { success: true, attempts: 1, steps: ['found pricing'], failurePoint: null },
  startRegistration: { success: false, attempts: 3, steps: ['no form found'], failurePoint: 'no registration link' },
};

const E1_FIND_PRICE_FAILED: E1AgentScenarioFacts = {
  measured: true,
  findPrice: { success: false, attempts: 3, steps: [], failurePoint: 'pricing behind paywall' },
  startRegistration: { success: true, attempts: 1, steps: ['found form'], failurePoint: null },
};

const E1_BOTH_FAILED: E1AgentScenarioFacts = {
  measured: true,
  findPrice: { success: false, attempts: 3, steps: [], failurePoint: 'not found' },
  startRegistration: { success: false, attempts: 3, steps: [], failurePoint: 'not found' },
};

const E1_NOT_MEASURED: E1AgentScenarioFacts = {
  measured: false,
  findPrice: { success: false, attempts: 0, steps: [], failurePoint: 'runner unavailable' },
  startRegistration: { success: false, attempts: 0, steps: [], failurePoint: 'runner unavailable' },
};

const E2_NO_VIOLATIONS: E2AccessibilityFacts = {
  measured: true, pagesAudited: 3,
  criticalCount: 0, seriousCount: 0, moderateCount: 0, minorCount: 0, violations: [],
};

const E2_HIGH_VIOLATIONS: E2AccessibilityFacts = {
  measured: true, pagesAudited: 1,
  criticalCount: 3, seriousCount: 2, moderateCount: 5, minorCount: 0, violations: [],
  // weight = 3*4 + 2*2 + 5*1 = 21 per page → > cap of 15 → score 0
};

const E2_NOT_MEASURED: E2AccessibilityFacts = {
  measured: false, pagesAudited: 0,
  criticalCount: 0, seriousCount: 0, moderateCount: 0, minorCount: 0, violations: [],
};

const E3_NO_BARRIERS: E3BarrierFacts = {
  measured: true, captchaDetected: false, captchaType: null,
  antibotWallDetected: false, jsOnlyContent: false, blockingPopupDetected: false,
};

const E3_ALL_BARRIERS: E3BarrierFacts = {
  measured: true, captchaDetected: true, captchaType: 'recaptcha',
  antibotWallDetected: true, jsOnlyContent: true, blockingPopupDetected: true,
};

const E3_NOT_MEASURED: E3BarrierFacts = {
  measured: false, captchaDetected: false, captchaType: null,
  antibotWallDetected: false, jsOnlyContent: false, blockingPopupDetected: false,
};

const E4_ALL_SIGNALS: E4MachineReadableFacts = {
  measured: true,
  pricingPageFound: true, pricingStructured: true,
  openApiSpecFound: true, openApiSpecUrl: '/openapi.json',
  apiDocsFound: true, apiDocsUrl: '/docs',
  productCatalogFound: true, productCatalogUrl: '/feed.xml',
};

const E4_NOTHING: E4MachineReadableFacts = {
  measured: true,
  pricingPageFound: false, pricingStructured: false,
  openApiSpecFound: false, openApiSpecUrl: null,
  apiDocsFound: false, apiDocsUrl: null,
  productCatalogFound: false, productCatalogUrl: null,
};

const E5_ALL_SIGNALS: E5AgentInterfaceFacts = {
  measured: true,
  llmsTxtFound: true, llmsTxtValid: true,
  agentsJsonFound: true, agentsJsonUrl: '/agents.json',
  webMcpManifestFound: true, mcpServerFound: true,
};

const E5_NOTHING: E5AgentInterfaceFacts = {
  measured: true,
  llmsTxtFound: false, llmsTxtValid: false,
  agentsJsonFound: false, agentsJsonUrl: null,
  webMcpManifestFound: false, mcpServerFound: false,
};

// ── E1 ────────────────────────────────────────────────────────────────────────

describe('E1 — agent scenarios', () => {
  it('both scenarios succeed → score 30', () => {
    const r = scorePillarE(E1_BOTH_SUCCESS, E2_NO_VIOLATIONS, E3_NO_BARRIERS, E4_NOTHING, E5_NOTHING, makeConfig());
    expect(r.criterionScores.e1.score).toBe(30);
    expect(r.criterionScores.e1.measured).toBe(true);
  });

  it('one scenario succeeds → score 15', () => {
    const r = scorePillarE(E1_FIND_SUCCESS_ONLY, E2_NO_VIOLATIONS, E3_NO_BARRIERS, E4_NOTHING, E5_NOTHING, makeConfig());
    expect(r.criterionScores.e1.score).toBe(15);
  });

  it('both fail (ran but no success) → score 0, measured true', () => {
    const r = scorePillarE(E1_BOTH_FAILED, E2_NO_VIOLATIONS, E3_NO_BARRIERS, E4_NOTHING, E5_NOTHING, makeConfig());
    expect(r.criterionScores.e1.score).toBe(0);
    expect(r.criterionScores.e1.measured).toBe(true);
  });

  it('not measured → score 0, measured false', () => {
    const r = scorePillarE(E1_NOT_MEASURED, E2_NO_VIOLATIONS, E3_NO_BARRIERS, E4_NOTHING, E5_NOTHING, makeConfig());
    expect(r.criterionScores.e1.score).toBe(0);
    expect(r.criterionScores.e1.measured).toBe(false);
    expect(r.unmeasuredCriteria).toContain('e1');
  });
});

// ── E1 blocker ────────────────────────────────────────────────────────────────

describe('E1 blocker — find_price failed', () => {
  it('find_price failed (attempts>0) → pillarScore capped at 40', () => {
    const r = scorePillarE(E1_FIND_PRICE_FAILED, E2_NO_VIOLATIONS, E3_NO_BARRIERS, E4_ALL_SIGNALS, E5_ALL_SIGNALS, makeConfig());
    // e1=15, e2=20, e3=15, e4=20, e5=15 → 85/100 → min(85, 40) = 40
    expect(r.pillarScore).toBe(40);
    expect(r.appliedBlockers).toContain('e1_find_price_failed');
  });

  it('find_price succeeded → no blocker applied', () => {
    const r = scorePillarE(E1_BOTH_SUCCESS, E2_NO_VIOLATIONS, E3_NO_BARRIERS, E4_ALL_SIGNALS, E5_ALL_SIGNALS, makeConfig());
    expect(r.appliedBlockers).toHaveLength(0);
  });

  it('find_price not measured (attempts=0) → no blocker applied', () => {
    const r = scorePillarE(E1_NOT_MEASURED, E2_NO_VIOLATIONS, E3_NO_BARRIERS, E4_NOTHING, E5_NOTHING, makeConfig());
    expect(r.appliedBlockers).toHaveLength(0);
  });
});

// ── E2 ────────────────────────────────────────────────────────────────────────

describe('E2 — accessibility', () => {
  it('no violations → maxScore', () => {
    const r = scorePillarE(E1_NOT_MEASURED, E2_NO_VIOLATIONS, E3_NO_BARRIERS, E4_NOTHING, E5_NOTHING, makeConfig());
    expect(r.criterionScores.e2.score).toBe(20);
  });

  it('normalizedPenalty >= cap → score 0', () => {
    const r = scorePillarE(E1_NOT_MEASURED, E2_HIGH_VIOLATIONS, E3_NO_BARRIERS, E4_NOTHING, E5_NOTHING, makeConfig());
    expect(r.criterionScores.e2.score).toBe(0);
  });

  it('not measured → score 0, measured false', () => {
    const r = scorePillarE(E1_NOT_MEASURED, E2_NOT_MEASURED, E3_NO_BARRIERS, E4_NOTHING, E5_NOTHING, makeConfig());
    expect(r.criterionScores.e2.measured).toBe(false);
    expect(r.unmeasuredCriteria).toContain('e2');
  });
});

// ── E3 ────────────────────────────────────────────────────────────────────────

describe('E3 — barriers', () => {
  it('no barriers → maxScore (15)', () => {
    const r = scorePillarE(E1_NOT_MEASURED, E2_NO_VIOLATIONS, E3_NO_BARRIERS, E4_NOTHING, E5_NOTHING, makeConfig());
    expect(r.criterionScores.e3.score).toBe(15);
  });

  it('all barriers → score 0', () => {
    const r = scorePillarE(E1_NOT_MEASURED, E2_NO_VIOLATIONS, E3_ALL_BARRIERS, E4_NOTHING, E5_NOTHING, makeConfig());
    expect(r.criterionScores.e3.score).toBe(0);
  });

  it('only popup detected → score 13', () => {
    const e3: E3BarrierFacts = { ...E3_NO_BARRIERS, blockingPopupDetected: true };
    const r = scorePillarE(E1_NOT_MEASURED, E2_NO_VIOLATIONS, e3, E4_NOTHING, E5_NOTHING, makeConfig());
    expect(r.criterionScores.e3.score).toBe(13);
  });

  it('not measured → score 0, measured false', () => {
    const r = scorePillarE(E1_NOT_MEASURED, E2_NO_VIOLATIONS, E3_NOT_MEASURED, E4_NOTHING, E5_NOTHING, makeConfig());
    expect(r.criterionScores.e3.measured).toBe(false);
    expect(r.unmeasuredCriteria).toContain('e3');
  });
});

// ── E4 ────────────────────────────────────────────────────────────────────────

describe('E4 — machine-readable data', () => {
  it('all signals present → maxScore (20)', () => {
    const r = scorePillarE(E1_NOT_MEASURED, E2_NO_VIOLATIONS, E3_NO_BARRIERS, E4_ALL_SIGNALS, E5_NOTHING, makeConfig());
    expect(r.criterionScores.e4.score).toBe(20);
    expect(r.criterionScores.e4.measured).toBe(true);
  });

  it('nothing found → score 0', () => {
    const r = scorePillarE(E1_NOT_MEASURED, E2_NO_VIOLATIONS, E3_NO_BARRIERS, E4_NOTHING, E5_NOTHING, makeConfig());
    expect(r.criterionScores.e4.score).toBe(0);
  });

  it('pricing page found but not structured → partial credit (2)', () => {
    const e4: E4MachineReadableFacts = { ...E4_NOTHING, pricingPageFound: true, pricingStructured: false };
    const r = scorePillarE(E1_NOT_MEASURED, E2_NO_VIOLATIONS, E3_NO_BARRIERS, e4, E5_NOTHING, makeConfig());
    expect(r.criterionScores.e4.score).toBe(2);
  });
});

// ── E5 ────────────────────────────────────────────────────────────────────────

describe('E5 — agent interfaces', () => {
  it('all signals present → maxScore (15)', () => {
    const r = scorePillarE(E1_NOT_MEASURED, E2_NO_VIOLATIONS, E3_NO_BARRIERS, E4_NOTHING, E5_ALL_SIGNALS, makeConfig());
    expect(r.criterionScores.e5.score).toBe(15);
    expect(r.criterionScores.e5.measured).toBe(true);
  });

  it('nothing found → score 0', () => {
    const r = scorePillarE(E1_NOT_MEASURED, E2_NO_VIOLATIONS, E3_NO_BARRIERS, E4_NOTHING, E5_NOTHING, makeConfig());
    expect(r.criterionScores.e5.score).toBe(0);
  });

  it('llmsTxtFound but not valid → partial credit (2)', () => {
    const e5: E5AgentInterfaceFacts = { ...E5_NOTHING, llmsTxtFound: true, llmsTxtValid: false };
    const r = scorePillarE(E1_NOT_MEASURED, E2_NO_VIOLATIONS, E3_NO_BARRIERS, E4_NOTHING, e5, makeConfig());
    expect(r.criterionScores.e5.score).toBe(2);
  });
});

// ── pillarScore ───────────────────────────────────────────────────────────────

describe('pillarScore', () => {
  it('all criteria unmeasured → pillarScore 0', () => {
    const r = scorePillarE(E1_NOT_MEASURED, E2_NOT_MEASURED, E3_NOT_MEASURED, E4_NOTHING, E5_NOTHING, makeConfig());
    // e4 and e5 are always measured, so this won't be 0 — test with realistic unmeasured subset
    // e1, e2, e3 unmeasured; e4, e5 measured with 0 score
    expect(r.pillarScore).toBe(0);
    expect(r.measuredMaxSum).toBe(35); // e4(20) + e5(15)
  });

  it('all criteria measured with full scores → pillarScore 100', () => {
    const r = scorePillarE(E1_BOTH_SUCCESS, E2_NO_VIOLATIONS, E3_NO_BARRIERS, E4_ALL_SIGNALS, E5_ALL_SIGNALS, makeConfig());
    expect(r.pillarScore).toBe(100);
    expect(r.appliedBlockers).toHaveLength(0);
  });
});
