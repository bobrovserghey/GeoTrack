import { describe, it, expect } from 'vitest';
import { buildFindings } from '../findings/build-findings.js';
import type { FindingsFacts, FindingsScores } from '../findings/types.js';
import type { TechCheckFacts } from '../steps/tech-check.js';
import type { AccessibilityCheckOutput } from '../steps/accessibility-check.js';
import type { MachineReadableCheckOutput } from '../steps/machine-readable-check.js';
import type { AgentScenarioCheckOutput } from '../steps/agent-scenario-check.js';
import type { OffsiteSignalsOutput } from '../steps/offsite-signals.js';
import type { ExtractMentionsOutput } from '../steps/extract-mentions.js';
import type { ContentCheckFacts } from '../steps/content-check.js';
import type { RobotsPermissions } from '../checks/robots.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function emptyFacts(): FindingsFacts {
  return {
    techCheck: null,
    mentions: null,
    content: null,
    offsite: null,
    accessibility: null,
    machineReadable: null,
    agentScenarios: null,
  };
}

function midScores(): FindingsScores {
  return {
    pillarScores: { A: 50, B: 50, C: 50, D: 50, E: 50 },
    overallScore: 5.0,
  };
}

function perfectScores(): FindingsScores {
  return {
    pillarScores: { A: 100, B: 100, C: 100, D: 100, E: 100 },
    overallScore: 10.0,
  };
}

function zeroScores(): FindingsScores {
  return {
    pillarScores: { A: 0, B: 0, C: 0, D: 0, E: 0 },
    overallScore: 0.0,
  };
}

function allowAllBots(): RobotsPermissions {
  return {
    GPTBot: 'allowed',
    'OAI-SearchBot': 'allowed',
    'ChatGPT-User': 'allowed',
    ClaudeBot: 'allowed',
    'Claude-User': 'allowed',
    PerplexityBot: 'allowed',
    'Google-Extended': 'allowed',
    Bingbot: 'allowed',
  };
}

function makeTechCheck(overrides: Partial<TechCheckFacts>): TechCheckFacts {
  const base: TechCheckFacts = {
    b1: { measured: true, robotsTxtPresent: true, permissions: allowAllBots() },
    b2: { measured: true, results: [], stoppedOn429: false },
    b3: { measured: true, url: 'https://example.com', rawTextLength: 500, renderedTextLength: 2500, contentRatio: 0.8 },
    b4: { measured: true, pagesChecked: [{ url: '/', indexed: true }], requestsUsed: 1 },
    b5: { measured: true, sitemapPresent: true, sitemapUrlCount: 50, pageResults: [] },
    b6: { measured: true, sitemapLastmod: null, pagesWithLastModified: 5, stalePageCount: 0 },
  };
  return { ...base, ...overrides };
}

function makeAccessibility(overrides?: Partial<AccessibilityCheckOutput>): AccessibilityCheckOutput {
  return {
    e2: { measured: true, pagesAudited: 3, criticalCount: 0, seriousCount: 0, moderateCount: 0, minorCount: 0, violations: [] },
    e3: { measured: true, captchaDetected: false, captchaType: null, antibotWallDetected: false, jsOnlyContent: false, blockingPopupDetected: false },
    ...overrides,
  };
}

function makeMachineReadable(overrides?: Partial<MachineReadableCheckOutput>): MachineReadableCheckOutput {
  return {
    e4: { measured: true, pricingPageFound: true, pricingStructured: true, openApiSpecFound: false, openApiSpecUrl: null, apiDocsFound: false, apiDocsUrl: null, productCatalogFound: false, productCatalogUrl: null },
    e5: { measured: true, llmsTxtFound: true, llmsTxtValid: true, agentsJsonFound: false, agentsJsonUrl: null, webMcpManifestFound: false, mcpServerFound: false },
    ...overrides,
  };
}

function makeAgentScenarios(findPriceSuccess: boolean, findPriceAttempts = 3): AgentScenarioCheckOutput {
  return {
    e1: {
      measured: true,
      findPrice: { success: findPriceSuccess, attempts: findPriceAttempts, steps: [], failurePoint: findPriceSuccess ? null : 'pricing behind paywall' },
      startRegistration: { success: true, attempts: 1, steps: ['found form'], failurePoint: null },
    },
  };
}

function makeOffsite(overrides?: Partial<OffsiteSignalsOutput>): OffsiteSignalsOutput {
  return {
    d1: { measured: true, clientPlatforms: [], clientPlatformCount: 0 },
    d2: { measured: true, citedPagesAnalyzed: 10, pagesWithClientMention: 5, clientPresenceRatio: 0.5 },
    d4: { measured: true, linkedInFound: true, linkedInUrl: 'https://linkedin.com/company/acme', crunchbaseFound: false, crunchbaseUrl: null },
    serpRequestsUsed: 5,
    ...overrides,
  };
}

function makeMentions(rate: number, total = 10): ExtractMentionsOutput {
  const mentioned = Math.round(rate * total);
  return {
    facts: Array.from({ length: total }, (_, i) => ({
      promptId: `p${i}`,
      engineId: 'perplexity',
      repeatIndex: 0,
      brandMentioned: i < mentioned,
      brandListPosition: i < mentioned ? 1 : null,
      normalizedPositionScore: i < mentioned ? 1.0 : null,
      competitorMentions: [],
      citedDomains: [],
    })),
  };
}

function makeContent(pricingPageFound = true): ContentCheckFacts {
  return {
    analyzedPageCount: 5,
    c1: {
      pageTypeMap: {
        pricing: pricingPageFound ? '/pricing' : null,
        comparison: null,
        alternatives: null,
        'use-cases': null,
        docs: null,
        faq: null,
      },
      gapTypes: pricingPageFound ? [] : ['pricing'],
    },
    c2: { pages: [] },
    c3: { pages: [], medianNumericFactsPer1kWords: 5 },
    c4: { pages: [], medianAgeDays: 30 },
    c5: { entityMentioned: true, categoryMentioned: true, targetAudienceMentioned: true, testedText: 'Acme is a time-tracking SaaS.' },
    c6: { pages: [], readableUrlRatio: 0.9 },
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('buildFindings — no facts', () => {
  it('returns empty array when all facts are null', () => {
    const results = buildFindings(emptyFacts(), midScores());
    expect(results).toHaveLength(0);
  });

  it('respects maxFindings=0', () => {
    const facts = { ...emptyFacts(), agentScenarios: makeAgentScenarios(false) };
    const results = buildFindings(facts, zeroScores(), 0);
    expect(results).toHaveLength(0);
  });

  it('returns empty array for negative maxFindings', () => {
    const facts = { ...emptyFacts(), agentScenarios: makeAgentScenarios(false) };
    expect(buildFindings(facts, zeroScores(), -1)).toHaveLength(0);
  });
});

describe('buildFindings — GPTBot blocked', () => {
  it('triggers b1_gptbot_blocked finding', () => {
    const facts: FindingsFacts = {
      ...emptyFacts(),
      techCheck: makeTechCheck({
        b1: { measured: true, robotsTxtPresent: true, permissions: { ...allowAllBots(), GPTBot: 'blocked' } },
      }),
    };
    const results = buildFindings(facts, midScores());
    const ids = results.map((f) => f.id);
    expect(ids).toContain('b1_gptbot_blocked');
  });

  it('sets impact critical and pillar B', () => {
    const facts: FindingsFacts = {
      ...emptyFacts(),
      techCheck: makeTechCheck({
        b1: { measured: true, robotsTxtPresent: true, permissions: { ...allowAllBots(), GPTBot: 'blocked' } },
      }),
    };
    const findings = buildFindings(facts, midScores());
    const f = findings.find((x) => x.id === 'b1_gptbot_blocked')!;
    expect(f.impact).toBe('critical');
    expect(f.pillar).toBe('B');
  });
});

describe('buildFindings — HTTP blocked crawlers', () => {
  it('triggers b2_http_blocked when results include a blocked bot', () => {
    const facts: FindingsFacts = {
      ...emptyFacts(),
      techCheck: makeTechCheck({
        b2: {
          measured: true,
          results: [{ bot: 'PerplexityBot', url: 'https://example.com/', statusCode: 403, blocked: true }],
          stoppedOn429: false,
        },
      }),
    };
    const results = buildFindings(facts, midScores());
    expect(results.map((f) => f.id)).toContain('b2_http_blocked');
  });

  it('does not trigger b2_http_blocked when no bots are blocked', () => {
    const facts: FindingsFacts = {
      ...emptyFacts(),
      techCheck: makeTechCheck({ b2: { measured: true, results: [], stoppedOn429: false } }),
    };
    const results = buildFindings(facts, midScores());
    expect(results.map((f) => f.id)).not.toContain('b2_http_blocked');
  });
});

describe('buildFindings — agent scenario', () => {
  it('triggers e1_find_price_failed when agent failed to find pricing', () => {
    const facts: FindingsFacts = { ...emptyFacts(), agentScenarios: makeAgentScenarios(false, 3) };
    const results = buildFindings(facts, midScores());
    expect(results.map((f) => f.id)).toContain('e1_find_price_failed');
  });

  it('does NOT trigger e1_find_price_failed when agent succeeded', () => {
    const facts: FindingsFacts = { ...emptyFacts(), agentScenarios: makeAgentScenarios(true) };
    const results = buildFindings(facts, midScores());
    expect(results.map((f) => f.id)).not.toContain('e1_find_price_failed');
  });

  it('does NOT trigger e1_find_price_failed when attempts=0 (runner unavailable)', () => {
    const facts: FindingsFacts = { ...emptyFacts(), agentScenarios: makeAgentScenarios(false, 0) };
    const results = buildFindings(facts, midScores());
    expect(results.map((f) => f.id)).not.toContain('e1_find_price_failed');
  });
});

describe('buildFindings — mention rate', () => {
  it('triggers a_not_mentioned when rate < 0.2', () => {
    const facts: FindingsFacts = { ...emptyFacts(), mentions: makeMentions(0.1) };
    const results = buildFindings(facts, midScores());
    expect(results.map((f) => f.id)).toContain('a_not_mentioned');
  });

  it('triggers a_low_mention_rate when 0.2 <= rate < 0.5', () => {
    const facts: FindingsFacts = { ...emptyFacts(), mentions: makeMentions(0.3) };
    const results = buildFindings(facts, midScores());
    const ids = results.map((f) => f.id);
    expect(ids).toContain('a_low_mention_rate');
    expect(ids).not.toContain('a_not_mentioned');
  });

  it('triggers no mention finding when rate >= 0.5', () => {
    const facts: FindingsFacts = { ...emptyFacts(), mentions: makeMentions(0.6) };
    const results = buildFindings(facts, midScores());
    const ids = results.map((f) => f.id);
    expect(ids).not.toContain('a_not_mentioned');
    expect(ids).not.toContain('a_low_mention_rate');
  });
});

describe('buildFindings — delta scaling by pillar score', () => {
  it('expectedScoreDelta is 0 when pillar score is 100', () => {
    const facts: FindingsFacts = { ...emptyFacts(), agentScenarios: makeAgentScenarios(false, 3) };
    const results = buildFindings(facts, perfectScores());
    const f = results.find((x) => x.id === 'e1_find_price_failed')!;
    expect(f.expectedScoreDelta).toBe(0);
  });

  it('expectedScoreDelta equals maxDelta when pillar score is 0', () => {
    const facts: FindingsFacts = { ...emptyFacts(), agentScenarios: makeAgentScenarios(false, 3) };
    const results = buildFindings(facts, zeroScores());
    const f = results.find((x) => x.id === 'e1_find_price_failed')!;
    expect(f.expectedScoreDelta).toBe(-0.6);
  });

  it('priority = |delta| / effortHours', () => {
    const facts: FindingsFacts = { ...emptyFacts(), agentScenarios: makeAgentScenarios(false, 3) };
    const results = buildFindings(facts, zeroScores());
    const f = results.find((x) => x.id === 'e1_find_price_failed')!;
    expect(f.priority).toBeCloseTo(Math.abs(f.expectedScoreDelta) / f.effortHours, 3);
  });
});

describe('buildFindings — sorting and limit', () => {
  it('returns at most maxFindings results', () => {
    const facts: FindingsFacts = {
      ...emptyFacts(),
      techCheck: makeTechCheck({
        b1: { measured: true, robotsTxtPresent: true, permissions: { ...allowAllBots(), GPTBot: 'blocked' } },
        b2: { measured: true, results: [{ bot: 'PerplexityBot', url: '/', statusCode: 403, blocked: true }], stoppedOn429: false },
        b3: { measured: true, url: 'https://example.com', rawTextLength: 50, renderedTextLength: 2500, contentRatio: 0.02 },
        b4: { measured: true, pagesChecked: [{ url: '/pricing', indexed: false }], requestsUsed: 1 },
        b5: { measured: true, sitemapPresent: false, sitemapUrlCount: 0, pageResults: [] },
      }),
      mentions: makeMentions(0.05),
      agentScenarios: makeAgentScenarios(false, 3),
      accessibility: makeAccessibility({ e3: { measured: true, captchaDetected: true, captchaType: 'recaptcha', antibotWallDetected: true, jsOnlyContent: false, blockingPopupDetected: false } }),
    };
    const results = buildFindings(facts, zeroScores(), 3);
    expect(results).toHaveLength(3);
  });

  it('results are sorted by priority descending', () => {
    const facts: FindingsFacts = {
      ...emptyFacts(),
      mentions: makeMentions(0.05),
      agentScenarios: makeAgentScenarios(false, 3),
      accessibility: makeAccessibility({ e3: { measured: true, captchaDetected: true, captchaType: 'recaptcha', antibotWallDetected: false, jsOnlyContent: false, blockingPopupDetected: false } }),
    };
    const results = buildFindings(facts, zeroScores());
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].priority).toBeGreaterThanOrEqual(results[i].priority);
    }
  });
});

describe('buildFindings — evidence', () => {
  it('includes evidence when available', () => {
    const facts: FindingsFacts = {
      ...emptyFacts(),
      techCheck: makeTechCheck({
        b2: { measured: true, results: [{ bot: 'PerplexityBot', url: 'https://example.com/', statusCode: 403, blocked: true }], stoppedOn429: false },
      }),
    };
    const results = buildFindings(facts, midScores());
    const f = results.find((x) => x.id === 'b2_http_blocked')!;
    expect(f.evidence).not.toBeNull();
    expect(f.evidence!.type).toBe('table');
  });

  it('evidence is null when template has no builder', () => {
    const facts: FindingsFacts = {
      ...emptyFacts(),
      accessibility: makeAccessibility({
        e3: { measured: true, captchaDetected: false, captchaType: null, antibotWallDetected: true, jsOnlyContent: false, blockingPopupDetected: false },
      }),
    };
    const results = buildFindings(facts, midScores());
    const f = results.find((x) => x.id === 'e3_antibot')!;
    expect(f.evidence).toBeNull();
  });
});

describe('buildFindings — offsite', () => {
  it('triggers d1_no_review_profiles when no platforms found', () => {
    const facts: FindingsFacts = {
      ...emptyFacts(),
      offsite: makeOffsite({ d1: { measured: true, clientPlatforms: [], clientPlatformCount: 0 } }),
    };
    const results = buildFindings(facts, midScores());
    expect(results.map((f) => f.id)).toContain('d1_no_review_profiles');
  });

  it('does NOT trigger d2_low_citation when presence ratio is high', () => {
    const facts: FindingsFacts = {
      ...emptyFacts(),
      offsite: makeOffsite({ d2: { measured: true, citedPagesAnalyzed: 10, pagesWithClientMention: 9, clientPresenceRatio: 0.9 } }),
    };
    const results = buildFindings(facts, midScores());
    expect(results.map((f) => f.id)).not.toContain('d2_low_citation');
  });
});

describe('buildFindings — content', () => {
  it('triggers c1_missing_pricing_page when pricing page is null', () => {
    const facts: FindingsFacts = { ...emptyFacts(), content: makeContent(false) };
    const results = buildFindings(facts, midScores());
    expect(results.map((f) => f.id)).toContain('c1_missing_pricing_page');
  });

  it('does NOT trigger c1_missing_pricing_page when pricing page exists', () => {
    const facts: FindingsFacts = { ...emptyFacts(), content: makeContent(true) };
    const results = buildFindings(facts, midScores());
    expect(results.map((f) => f.id)).not.toContain('c1_missing_pricing_page');
  });

  it('does NOT trigger c1/c5 content findings when no pages were analyzed', () => {
    const base = makeContent(false);
    const content: ContentCheckFacts = {
      ...base,
      analyzedPageCount: 0,
      c5: { entityMentioned: false, categoryMentioned: false, targetAudienceMentioned: false, testedText: '' },
    };
    const facts: FindingsFacts = { ...emptyFacts(), content };
    const ids = buildFindings(facts, midScores()).map((f) => f.id);
    expect(ids).not.toContain('c1_missing_pricing_page');
    expect(ids).not.toContain('c5_entity_unclear');
  });
});

describe('buildFindings — machine readable', () => {
  it('triggers e4_no_pricing_structured when pricing page is found but unstructured', () => {
    const facts: FindingsFacts = {
      ...emptyFacts(),
      machineReadable: makeMachineReadable({
        e4: { measured: true, pricingPageFound: true, pricingStructured: false, openApiSpecFound: false, openApiSpecUrl: null, apiDocsFound: false, apiDocsUrl: null, productCatalogFound: false, productCatalogUrl: null },
      }),
    };
    const ids = buildFindings(facts, midScores()).map((f) => f.id);
    expect(ids).toContain('e4_no_pricing_structured');
  });

  it('does NOT trigger e4_no_pricing_structured when pricing is structured', () => {
    const facts: FindingsFacts = { ...emptyFacts(), machineReadable: makeMachineReadable() };
    const ids = buildFindings(facts, midScores()).map((f) => f.id);
    expect(ids).not.toContain('e4_no_pricing_structured');
  });

  it('triggers e5_no_llms_txt when llms.txt is absent', () => {
    const facts: FindingsFacts = {
      ...emptyFacts(),
      machineReadable: makeMachineReadable({
        e5: { measured: true, llmsTxtFound: false, llmsTxtValid: false, agentsJsonFound: false, agentsJsonUrl: null, webMcpManifestFound: false, mcpServerFound: false },
      }),
    };
    const ids = buildFindings(facts, midScores()).map((f) => f.id);
    expect(ids).toContain('e5_no_llms_txt');
  });

  it('does NOT trigger e5_no_llms_txt when llms.txt is present', () => {
    const facts: FindingsFacts = { ...emptyFacts(), machineReadable: makeMachineReadable() };
    const ids = buildFindings(facts, midScores()).map((f) => f.id);
    expect(ids).not.toContain('e5_no_llms_txt');
  });
});
