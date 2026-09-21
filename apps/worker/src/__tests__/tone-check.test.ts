import { describe, it, expect, vi } from 'vitest';
import { classifyTone, parseTone } from '../steps/tone-check.js';
import type { ModelAdapter, ModelAnswer, EnginePollResponse, EngineResponseFacts } from '@geotrack/core';
import type { PassportOutput } from '@geotrack/core';

// ---- fixtures ----------------------------------------------------------------

const PASSPORT: PassportOutput = {
  name: 'Acme Corp',
  description: 'Enterprise software solutions specializing in CRM and ERP systems.',
  categoryHint: 'enterprise-software',
  valueProps: ['CRM system', 'ERP integration'],
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
    responseText: 'Acme Corp is highly recommended for enterprise CRM deployments.',
    sources: [],
    fromCache: false,
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
      usage: { provider: 'gemini', model: 'gemini-flash', tokensIn: 100, tokensOut: 10, costUsd: 0.0001 },
    } satisfies ModelAnswer),
  };
}

// ---- parseTone ---------------------------------------------------------------

describe('parseTone', () => {
  it('parses "positive" tone', () => {
    expect(parseTone('{"tone":"positive"}')).toBe('positive');
  });

  it('parses "neutral" tone', () => {
    expect(parseTone('{"tone":"neutral"}')).toBe('neutral');
  });

  it('parses "negative" tone', () => {
    expect(parseTone('{"tone":"negative"}')).toBe('negative');
  });

  it('parses JSON embedded in surrounding text', () => {
    expect(parseTone('Classification result: {"tone":"positive"} done.')).toBe('positive');
  });

  it('returns null for invalid tone value', () => {
    expect(parseTone('{"tone":"mixed"}')).toBeNull();
  });

  it('returns null for missing tone field', () => {
    expect(parseTone('{"result":"positive"}')).toBeNull();
  });

  it('returns null for non-JSON text', () => {
    expect(parseTone('the tone is positive')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseTone('')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseTone('{tone:"positive"}')).toBeNull();
  });
});

// ---- classifyTone ------------------------------------------------------------

describe('classifyTone', () => {
  it('creates a fact for a brand-mentioned response', async () => {
    const model = makeModel('{"tone":"positive"}');
    const responses = [makeResponse()];
    const facts = [makeFact({ brandMentioned: true })];

    const result = await classifyTone(responses, facts, PASSPORT, model);

    expect(result.status).toBe('ok');
    expect(result.data!.facts).toHaveLength(1);
    expect(result.data!.facts[0]?.tone).toBe('positive');
  });

  it('skips responses where brand was not mentioned', async () => {
    const model = makeModel('{"tone":"positive"}');
    const responses = [makeResponse()];
    const facts = [makeFact({ brandMentioned: false })];

    const result = await classifyTone(responses, facts, PASSPORT, model);

    expect(result.data!.facts).toHaveLength(0);
    expect(result.data!.positiveRate).toBe(0);
  });

  it('skips responses with empty responseText', async () => {
    const model = makeModel('{"tone":"positive"}');
    const responses = [makeResponse({ responseText: '   ' })];
    const facts = [makeFact({ brandMentioned: true })];

    const result = await classifyTone(responses, facts, PASSPORT, model);

    expect(result.data!.facts).toHaveLength(0);
  });

  it('returns partial status when model response is unparseable', async () => {
    const model = makeModel('cannot determine tone');
    const responses = [makeResponse()];
    const facts = [makeFact({ brandMentioned: true })];

    const result = await classifyTone(responses, facts, PASSPORT, model);

    expect(result.status).toBe('partial');
    expect(result.data!.facts).toHaveLength(0);
    expect(result.notes.some((n) => n.includes('could not be classified'))).toBe(true);
  });

  it('excludes unparseable responses from facts', async () => {
    const model = makeModel('not json');
    const responses = [makeResponse()];
    const facts = [makeFact({ brandMentioned: true })];

    const result = await classifyTone(responses, facts, PASSPORT, model);

    expect(result.data!.facts).toHaveLength(0);
    expect(result.data!.positiveRate).toBe(0);
  });

  it('returns partial status when model.generate throws', async () => {
    const model: ModelAdapter = {
      generate: vi.fn().mockRejectedValue(new Error('timeout')),
    };
    const responses = [makeResponse()];
    const facts = [makeFact({ brandMentioned: true })];

    const result = await classifyTone(responses, facts, PASSPORT, model);

    expect(result.status).toBe('partial');
    expect(result.data!.facts).toHaveLength(0);
  });

  it('positiveRate = 1 when all facts are positive', async () => {
    const model = makeModel('{"tone":"positive"}');
    const responses = [
      makeResponse({ promptId: 'p1', repeatIndex: 0 }),
      makeResponse({ promptId: 'p2', repeatIndex: 0 }),
    ];
    const facts = [
      makeFact({ promptId: 'p1', brandMentioned: true }),
      makeFact({ promptId: 'p2', brandMentioned: true }),
    ];

    const result = await classifyTone(responses, facts, PASSPORT, model);

    expect(result.data!.positiveRate).toBe(1);
  });

  it('positiveRate = 0.5 when half are positive', async () => {
    const generateMock = vi
      .fn()
      .mockResolvedValueOnce({
        text: '{"tone":"positive"}',
        usage: { provider: 'gemini', model: 'gemini-flash', tokensIn: 100, tokensOut: 10, costUsd: 0.0001 },
      })
      .mockResolvedValueOnce({
        text: '{"tone":"neutral"}',
        usage: { provider: 'gemini', model: 'gemini-flash', tokensIn: 100, tokensOut: 10, costUsd: 0.0001 },
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

    const result = await classifyTone(responses, facts, PASSPORT, model);

    expect(result.data!.positiveRate).toBe(0.5);
  });

  it('positiveRate = 0 when no facts (all skipped)', async () => {
    const model = makeModel('{"tone":"positive"}');
    const result = await classifyTone([], [], PASSPORT, model);

    expect(result.data!.positiveRate).toBe(0);
  });

  it('records usage for each model call', async () => {
    const model = makeModel('{"tone":"neutral"}');
    const responses = [
      makeResponse({ promptId: 'p1', repeatIndex: 0 }),
      makeResponse({ promptId: 'p2', repeatIndex: 0 }),
    ];
    const facts = [
      makeFact({ promptId: 'p1', brandMentioned: true }),
      makeFact({ promptId: 'p2', brandMentioned: true }),
    ];

    const result = await classifyTone(responses, facts, PASSPORT, model);

    expect(result.usage).toHaveLength(2);
  });

  it('matches responses to facts by promptId:engineId:repeatIndex key', async () => {
    const model = makeModel('{"tone":"positive"}');
    const responses = [
      makeResponse({ promptId: 'p1', engineId: 'perplexity', repeatIndex: 0 }),
      makeResponse({ promptId: 'p1', engineId: 'chatgpt', repeatIndex: 0 }),
    ];
    const facts = [
      makeFact({ promptId: 'p1', engineId: 'perplexity', brandMentioned: true }),
      makeFact({ promptId: 'p1', engineId: 'chatgpt', brandMentioned: false }),
    ];

    const result = await classifyTone(responses, facts, PASSPORT, model);

    expect(result.data!.facts).toHaveLength(1);
    expect(result.data!.facts[0]?.engineId).toBe('perplexity');
  });

  it('excludes throw failures from denominator, still partial', async () => {
    const generateMock = vi
      .fn()
      .mockResolvedValueOnce({
        text: '{"tone":"positive"}',
        usage: { provider: 'gemini', model: 'gemini-flash', tokensIn: 100, tokensOut: 10, costUsd: 0.0001 },
      })
      .mockRejectedValueOnce(new Error('network error'));
    const model: ModelAdapter = { generate: generateMock };

    const responses = [
      makeResponse({ promptId: 'p1', repeatIndex: 0 }),
      makeResponse({ promptId: 'p2', repeatIndex: 0 }),
    ];
    const facts = [
      makeFact({ promptId: 'p1', brandMentioned: true }),
      makeFact({ promptId: 'p2', brandMentioned: true }),
    ];

    const result = await classifyTone(responses, facts, PASSPORT, model);

    expect(result.data!.facts).toHaveLength(1);
    expect(result.data!.positiveRate).toBe(1);
    expect(result.status).toBe('partial');
  });
});
