import { describe, it, expect } from 'vitest';
import { calcCallCost } from '../cost/calculator.js';
import { createBudget, checkBudget, recordUsage } from '../cost/budget.js';
import { getAuditProfile } from '@geotrack/config';

describe('calcCallCost', () => {
  it('openai: 1M in + 1M out = $1.40', () => {
    const cost = calcCallCost('openai', 'gpt-4o-mini-search-preview', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(1.40, 6);
  });

  it('openai: 100 web search calls = $1.00', () => {
    const cost = calcCallCost('openai', 'gpt-4o-mini-search-preview', 0, 0, { webSearchCalls: 100 });
    expect(cost).toBeCloseTo(1.00, 6);
  });

  it('perplexity: 1 request + 500k in + 300k out = $0.808', () => {
    const cost = calcCallCost('perplexity', 'sonar', 500_000, 300_000, { requestCount: 1 });
    expect(cost).toBeCloseTo(0.808, 6);
  });

  it('gemini flash: 1M in + 1M out = $4.50', () => {
    const cost = calcCallCost('gemini', 'gemini-2.0-flash', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(4.50, 6);
  });

  it('gemini flash: 100 grounding calls = $1.40', () => {
    const cost = calcCallCost('gemini', 'gemini-2.0-flash', 0, 0, { groundingCalls: 100 });
    expect(cost).toBeCloseTo(1.40, 6);
  });

  it('gemini flash: 1 grounding call within free quota = $0.00', () => {
    const cost = calcCallCost('gemini', 'gemini-2.0-flash', 0, 0, { groundingCalls: 1, freeGroundingCalls: 1 });
    expect(cost).toBe(0);
  });

  it('gemini flash: 100 grounding calls where 40 free = $0.84 (60 paid)', () => {
    const cost = calcCallCost('gemini', 'gemini-2.0-flash', 0, 0, { groundingCalls: 100, freeGroundingCalls: 40 });
    expect(cost).toBeCloseTo(0.84, 6);
  });

  it('gemini flash: freeGroundingCalls capped at groundingCalls — never negative cost', () => {
    const cost = calcCallCost('gemini', 'gemini-2.0-flash', 0, 0, { groundingCalls: 5, freeGroundingCalls: 1000 });
    expect(cost).toBe(0);
  });

  it('serpapi: 10 requests = $0.15', () => {
    const cost = calcCallCost('serpapi', 'web_search', 0, 0, { requestCount: 10 });
    expect(cost).toBeCloseTo(0.15, 6);
  });

  it('throws for unknown model', () => {
    expect(() => calcCallCost('unknown', 'model-x', 100, 100)).toThrow('Unknown provider/model');
  });
});

describe('createBudget', () => {
  it('initializes from teaser profile ceilings with zero spent', () => {
    const profile = getAuditProfile('teaser');
    const budget = createBudget(profile);
    expect(budget.softCeilingUsd).toBe(0.10);
    expect(budget.hardCeilingUsd).toBe(0.25);
    expect(budget.spentUsd).toBe(0);
    expect(budget.remainingSoftUsd).toBe(0.10);
    expect(budget.remainingHardUsd).toBe(0.25);
  });
});

describe('checkBudget', () => {
  const base = {
    softCeilingUsd: 1.0,
    hardCeilingUsd: 2.0,
    remainingSoftUsd: 1.0,
    remainingHardUsd: 2.0,
  };

  it('returns ok when under soft ceiling', () => {
    expect(checkBudget({ ...base, spentUsd: 0.5 })).toBe('ok');
  });

  it('returns soft_exceeded at soft ceiling boundary', () => {
    expect(checkBudget({ ...base, spentUsd: 1.0 })).toBe('soft_exceeded');
  });

  it('returns soft_exceeded between soft and hard ceilings', () => {
    expect(checkBudget({ ...base, spentUsd: 1.5 })).toBe('soft_exceeded');
  });

  it('returns hard_exceeded at hard ceiling boundary', () => {
    expect(checkBudget({ ...base, spentUsd: 2.0 })).toBe('hard_exceeded');
  });

  it('returns hard_exceeded above hard ceiling', () => {
    expect(checkBudget({ ...base, spentUsd: 3.0 })).toBe('hard_exceeded');
  });
});

describe('recordUsage', () => {
  it('accumulates cost and returns ok when under soft ceiling', () => {
    const profile = getAuditProfile('teaser');
    const budget = createBudget(profile);
    const record = { provider: 'openai', model: 'gpt-4o-mini-search-preview', tokensIn: 100, tokensOut: 100, costUsd: 0.01 };
    const result = recordUsage(budget, record);
    expect(result.budget.spentUsd).toBeCloseTo(0.01);
    expect(result.status).toBe('ok');
  });

  it('triggers soft_exceeded when spending reaches soft ceiling exactly', () => {
    const budget = {
      softCeilingUsd: 1.0,
      hardCeilingUsd: 2.0,
      spentUsd: 0.95,
      remainingSoftUsd: 0.05,
      remainingHardUsd: 1.05,
    };
    const record = { provider: 'openai', model: 'gpt-4o-mini-search-preview', tokensIn: 0, tokensOut: 0, costUsd: 0.05 };
    const result = recordUsage(budget, record);
    expect(result.budget.spentUsd).toBeCloseTo(1.0);
    expect(result.status).toBe('soft_exceeded');
  });

  it('teaser hard ceiling → hard_exceeded (orchestrator maps to audit failed)', () => {
    const profile = getAuditProfile('teaser');
    const budget = {
      softCeilingUsd: profile.costSoftCeilingUsd,
      hardCeilingUsd: profile.costHardCeilingUsd,
      spentUsd: profile.costHardCeilingUsd - 0.001,
      remainingSoftUsd: 0,
      remainingHardUsd: 0.001,
    };
    const record = { provider: 'openai', model: 'gpt-4o-mini-search-preview', tokensIn: 0, tokensOut: 0, costUsd: 0.001 };
    const result = recordUsage(budget, record);
    expect(result.status).toBe('hard_exceeded');
    expect(profile.id).toBe('teaser');
  });

  it('standard hard ceiling → hard_exceeded (orchestrator maps to needs_attention)', () => {
    const profile = getAuditProfile('standard');
    const budget = {
      softCeilingUsd: profile.costSoftCeilingUsd,
      hardCeilingUsd: profile.costHardCeilingUsd,
      spentUsd: profile.costHardCeilingUsd - 0.001,
      remainingSoftUsd: 0,
      remainingHardUsd: 0.001,
    };
    const record = { provider: 'openai', model: 'gpt-4o-mini-search-preview', tokensIn: 0, tokensOut: 0, costUsd: 0.001 };
    const result = recordUsage(budget, record);
    expect(result.status).toBe('hard_exceeded');
    expect(profile.id).toBe('standard');
  });
});
