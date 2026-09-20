import { describe, it, expect, vi } from 'vitest';
import { checkAccuracy, parseClaimCounts } from '../steps/accuracy-check.js';
import type { ModelAdapter, ModelAnswer, EnginePollResponse, EngineResponseFacts } from '@geotrack/core';
import type { PassportOutput } from '@geotrack/core';

// ---- fixtures ----------------------------------------------------------------

const PASSPORT: PassportOutput = {
  name: 'Acme Corp',
  description: 'Enterprise software solutions specializing in CRM and ERP systems.',
  categoryHint: 'enterprise-software',
  valueProps: ['CRM system', 'ERP integration', 'Customer management'],
  targetAudience: {
    summary: 'Mid-market and enterprise businesses in North America and Europe',
    personas: ['CFO', 'IT Manager'],
  },
};

function makeResponse(overrides: Partial<EnginePollResponse> = {}): EnginePollResponse {
  return {
    promptId: 'p1',
    engineId: 'perplexity',
    repeatIndex: 0,
    responseText: 'Acme Corp provides CRM and ERP systems for enterprise clients.',
    citations: [],
    listItems: [],
    usage: { provider: 'perplexity', model: 'sonar', tokensIn: 10, tokensOut: 20, costUsd: 0.001 },
    ...overrides,
  };
}

function makeFact(overrides: Partial<EngineResponseFacts> = {}): EngineResponseFacts {
  return {
    promptId: 'p1',
    engineId: 'perplexity',
    repeatIndex: 0,
    brandMentioned: true,
    brandListPosition: null,
    normalizedPositionScore: null,
    competitorMentions: [],
    citedDomains: [],
    ...overrides,
  };
}

function makeModel(text: string): ModelAdapter {
  return {
    generate: vi.fn().mockResolvedValue({
      text,
      usage: { provider: 'gemini', model: 'gemini-flash', tokensIn: 100, tokensOut: 30, costUsd: 0.0002 },
    } satisfies ModelAnswer),
  };
}

// ---- parseClaimCounts --------------------------------------------------------

describe('parseClaimCounts', () => {
  it('parses valid JSON object', () => {
    const result = parseClaimCounts('{"accurate":3,"inaccurate":1,"unverifiable":2}');
    expect(result).toEqual({ accurate: 3, inaccurate: 1, unverifiable: 2 });
  });

  it('parses JSON embedded in surrounding text', () => {
    const result = parseClaimCounts('Here is the result: {"accurate":2,"inaccurate":0,"unverifiable":1} done.');
    expect(result).toEqual({ accurate: 2, inaccurate: 0, unverifiable: 1 });
  });

  it('returns null for non-JSON text', () => {
    expect(parseClaimCounts('no json here')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseClaimCounts('')).toBeNull();
  });

  it('returns 0 for missing fields', () => {
    const result = parseClaimCounts('{"accurate":5}');
    expect(result).toEqual({ accurate: 5, inaccurate: 0, unverifiable: 0 });
  });

  it('returns null for malformed JSON', () => {
    expect(parseClaimCounts('{accurate:3}')).toBeNull();
  });
});

// ---- checkAccuracy -----------------------------------------------------------

describe('checkAccuracy', () => {
  it('returns ok status and one fact for a brand-mentioned response', async () => {
    const model = makeModel('{"accurate":3,"inaccurate":0,"unverifiable":1}');
    const responses = [makeResponse()];
    const facts = [makeFact({ brandMentioned: true })];

    const result = await checkAccuracy(responses, facts, PASSPORT, model);

    expect(result.status).toBe('ok');
    expect(result.data.facts).toHaveLength(1);
    expect(result.data.facts[0]?.accurateClaims).toBe(3);
    expect(result.data.facts[0]?.inaccurateClaims).toBe(0);
    expect(result.data.facts[0]?.unverifiableClaims).toBe(1);
  });

  it('skips responses where brand was not mentioned', async () => {
    const model = makeModel('{"accurate":3,"inaccurate":0,"unverifiable":0}');
    const responses = [makeResponse()];
    const facts = [makeFact({ brandMentioned: false })];

    const result = await checkAccuracy(responses, facts, PASSPORT, model);

    expect(result.data.facts).toHaveLength(0);
    expect(result.data.accuracyRate).toBe(0);
  });

  it('skips responses with empty responseText', async () => {
    const model = makeModel('{"accurate":1,"inaccurate":0,"unverifiable":0}');
    const responses = [makeResponse({ responseText: '   ' })];
    const facts = [makeFact({ brandMentioned: true })];

    const result = await checkAccuracy(responses, facts, PASSPORT, model);

    expect(result.data.facts).toHaveLength(0);
  });

  it('accuracyRate = 1 when all facts have inaccurateClaims === 0', async () => {
    const model = makeModel('{"accurate":2,"inaccurate":0,"unverifiable":0}');
    const responses = [
      makeResponse({ promptId: 'p1', repeatIndex: 0 }),
      makeResponse({ promptId: 'p2', repeatIndex: 0 }),
    ];
    const facts = [
      makeFact({ promptId: 'p1', brandMentioned: true }),
      makeFact({ promptId: 'p2', brandMentioned: true }),
    ];

    const result = await checkAccuracy(responses, facts, PASSPORT, model);

    expect(result.data.accuracyRate).toBe(1);
  });

  it('accuracyRate = 0.5 when half have inaccurate claims', async () => {
    const generateMock = vi
      .fn()
      .mockResolvedValueOnce({
        text: '{"accurate":2,"inaccurate":0,"unverifiable":0}',
        usage: { provider: 'gemini', model: 'gemini-flash', tokensIn: 100, tokensOut: 20, costUsd: 0.0001 },
      })
      .mockResolvedValueOnce({
        text: '{"accurate":1,"inaccurate":2,"unverifiable":0}',
        usage: { provider: 'gemini', model: 'gemini-flash', tokensIn: 100, tokensOut: 20, costUsd: 0.0001 },
      });
    const model: ModelAdapter = { generate: generateMock };

    const responses = [
      makeResponse({ promptId: 'p1', repeatIndex: 0 }),
      makeResponse({ promptId: 'p2', repeatIndex: 0 }),
    ];
    const facts = [
      makeFact({ promptId: 'p1', brandMentioned: true }),
      makeFact({ promptId: 'p2', brandMentioned: true }),
    ];

    const result = await checkAccuracy(responses, facts, PASSPORT, model);

    expect(result.data.accuracyRate).toBe(0.5);
  });

  it('records usage for each model call', async () => {
    const model = makeModel('{"accurate":1,"inaccurate":0,"unverifiable":0}');
    const responses = [makeResponse({ promptId: 'p1', repeatIndex: 0 }), makeResponse({ promptId: 'p2', repeatIndex: 0 })];
    const facts = [
      makeFact({ promptId: 'p1', brandMentioned: true }),
      makeFact({ promptId: 'p2', brandMentioned: true }),
    ];

    const result = await checkAccuracy(responses, facts, PASSPORT, model);

    expect(result.usage).toHaveLength(2);
  });

  it('returns partial status when model response is unparseable', async () => {
    const model = makeModel('sorry i cannot parse that');
    const responses = [makeResponse()];
    const facts = [makeFact({ brandMentioned: true })];

    const result = await checkAccuracy(responses, facts, PASSPORT, model);

    expect(result.status).toBe('partial');
    expect(result.notes.some((n) => n.includes('could not be parsed'))).toBe(true);
  });

  it('excludes unparseable responses from facts (not counted in accuracyRate)', async () => {
    const model = makeModel('not json');
    const responses = [makeResponse()];
    const facts = [makeFact({ brandMentioned: true })];

    const result = await checkAccuracy(responses, facts, PASSPORT, model);

    expect(result.data.facts).toHaveLength(0);
    expect(result.data.accuracyRate).toBe(0);
  });

  it('returns partial status when model.generate throws', async () => {
    const model: ModelAdapter = {
      generate: vi.fn().mockRejectedValue(new Error('timeout')),
    };
    const responses = [makeResponse()];
    const facts = [makeFact({ brandMentioned: true })];

    const result = await checkAccuracy(responses, facts, PASSPORT, model);

    expect(result.status).toBe('partial');
    expect(result.data.facts).toHaveLength(0);
    expect(result.notes.some((n) => n.includes('could not be parsed'))).toBe(true);
  });

  it('excludes exception responses from accuracyRate denominator', async () => {
    const generateMock = vi
      .fn()
      .mockResolvedValueOnce({
        text: '{"accurate":2,"inaccurate":0,"unverifiable":0}',
        usage: { provider: 'gemini', model: 'gemini-flash', tokensIn: 100, tokensOut: 20, costUsd: 0.0001 },
      })
      .mockRejectedValueOnce(new Error('timeout'));
    const model: ModelAdapter = { generate: generateMock };

    const responses = [
      makeResponse({ promptId: 'p1', repeatIndex: 0 }),
      makeResponse({ promptId: 'p2', repeatIndex: 0 }),
    ];
    const facts = [
      makeFact({ promptId: 'p1', brandMentioned: true }),
      makeFact({ promptId: 'p2', brandMentioned: true }),
    ];

    const result = await checkAccuracy(responses, facts, PASSPORT, model);

    // only 1 fact (p1 succeeded), p2 threw → excluded from denominator
    expect(result.data.facts).toHaveLength(1);
    expect(result.data.accuracyRate).toBe(1);
    expect(result.status).toBe('partial');
  });

  it('returns ok status and empty facts for no responses', async () => {
    const model = makeModel('{}');
    const result = await checkAccuracy([], [], PASSPORT, model);

    expect(result.status).toBe('ok');
    expect(result.data.facts).toHaveLength(0);
    expect(result.data.accuracyRate).toBe(0);
  });

  it('matches responses to facts by promptId:engineId:repeatIndex key', async () => {
    const model = makeModel('{"accurate":1,"inaccurate":0,"unverifiable":0}');
    const responses = [
      makeResponse({ promptId: 'p1', engineId: 'perplexity', repeatIndex: 0 }),
      makeResponse({ promptId: 'p1', engineId: 'chatgpt', repeatIndex: 0 }),
    ];
    const facts = [
      makeFact({ promptId: 'p1', engineId: 'perplexity', brandMentioned: true }),
      makeFact({ promptId: 'p1', engineId: 'chatgpt', brandMentioned: false }),
    ];

    const result = await checkAccuracy(responses, facts, PASSPORT, model);

    // only perplexity response (brandMentioned=true) should be checked
    expect(result.data.facts).toHaveLength(1);
    expect(result.data.facts[0]?.engineId).toBe('perplexity');
  });
});
