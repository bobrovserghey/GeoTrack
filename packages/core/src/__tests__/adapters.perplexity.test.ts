import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { PerplexityAdapter } from '../adapters/perplexity.js';

const FIXTURE = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../../fixtures/engines/perplexity/ask-basic.json'),
    'utf-8',
  ),
);

function makeFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response);
}

describe('PerplexityAdapter', () => {
  it('id is "perplexity"', () => {
    const adapter = new PerplexityAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    expect(adapter.id).toBe('perplexity');
  });

  it('ask() returns non-empty text from fixture', async () => {
    const adapter = new PerplexityAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    const result = await adapter.ask('Is Notion known by AI?', {});
    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('ask() extracts sources from citations array', async () => {
    const adapter = new PerplexityAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    const result = await adapter.ask('Is Notion known by AI?', {});
    expect(Array.isArray(result.sources)).toBe(true);
    expect(result.sources.length).toBe(2);
    for (const src of result.sources) {
      expect(typeof src.url).toBe('string');
      expect(src.url.startsWith('http')).toBe(true);
    }
  });

  it('ask() returns usage with correct provider and model', async () => {
    const adapter = new PerplexityAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    const result = await adapter.ask('Is Notion known by AI?', {});
    expect(result.usage.provider).toBe('perplexity');
    expect(result.usage.model).toBe('sonar');
    expect(result.usage.tokensIn).toBe(18);
    expect(result.usage.tokensOut).toBe(47);
  });

  it('ask() computes costUsd > 0', async () => {
    const adapter = new PerplexityAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    const result = await adapter.ask('Is Notion known by AI?', {});
    expect(result.usage.costUsd).toBeGreaterThan(0);
  });

  it('ask() preserves raw response', async () => {
    const adapter = new PerplexityAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    const result = await adapter.ask('Is Notion known by AI?', {});
    expect(result.raw).toEqual(FIXTURE);
  });

  it('ask() calls the correct Perplexity endpoint', async () => {
    const mockFetch = makeFetch(FIXTURE);
    const adapter = new PerplexityAdapter({ apiKey: 'my-api-key', fetch: mockFetch });
    await adapter.ask('prompt', {});
    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('api.perplexity.ai');
  });

  it('ask() sends Authorization header with bearer token', async () => {
    const mockFetch = makeFetch(FIXTURE);
    const adapter = new PerplexityAdapter({ apiKey: 'secret-key', fetch: mockFetch });
    await adapter.ask('prompt', {});
    const calledOpts = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const headers = calledOpts.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer secret-key');
  });

  it('ask() throws on HTTP error status', async () => {
    const adapter = new PerplexityAdapter({ apiKey: 'test-key', fetch: makeFetch({ error: 'unauthorized' }, 401) });
    await expect(adapter.ask('prompt', {})).rejects.toThrow('401');
  });
});
