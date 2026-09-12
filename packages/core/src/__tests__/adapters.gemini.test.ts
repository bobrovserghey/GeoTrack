import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { GeminiAdapter } from '../adapters/gemini.js';

const FIXTURE = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../../fixtures/engines/gemini/ask-basic.json'),
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

describe('GeminiAdapter', () => {
  it('id is "gemini"', () => {
    const adapter = new GeminiAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    expect(adapter.id).toBe('gemini');
  });

  it('ask() returns non-empty text from fixture', async () => {
    const adapter = new GeminiAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    const result = await adapter.ask('Is Notion known by AI?', {});
    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('ask() extracts sources from grounding_chunks', async () => {
    const adapter = new GeminiAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    const result = await adapter.ask('Is Notion known by AI?', {});
    expect(Array.isArray(result.sources)).toBe(true);
    expect(result.sources.length).toBeGreaterThan(0);
    for (const src of result.sources) {
      expect(typeof src.url).toBe('string');
      expect(src.url.startsWith('http')).toBe(true);
    }
  });

  it('ask() returns usage with correct provider and model', async () => {
    const adapter = new GeminiAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    const result = await adapter.ask('Is Notion known by AI?', {});
    expect(result.usage.provider).toBe('gemini');
    expect(result.usage.model).toBe('gemini-2.0-flash');
    expect(result.usage.tokensIn).toBe(18);
    expect(result.usage.tokensOut).toBe(52);
  });

  it('ask() computes costUsd > 0', async () => {
    const adapter = new GeminiAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    const result = await adapter.ask('Is Notion known by AI?', {});
    expect(result.usage.costUsd).toBeGreaterThan(0);
  });

  it('ask() preserves raw response', async () => {
    const adapter = new GeminiAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    const result = await adapter.ask('Is Notion known by AI?', {});
    expect(result.raw).toEqual(FIXTURE);
  });

  it('ask() calls the correct Gemini endpoint', async () => {
    const mockFetch = makeFetch(FIXTURE);
    const adapter = new GeminiAdapter({ apiKey: 'my-api-key', fetch: mockFetch });
    await adapter.ask('prompt', {});
    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('generativelanguage.googleapis.com');
    expect(calledUrl).toContain('gemini-2.0-flash');
    expect(calledUrl).toContain('my-api-key');
  });

  it('ask() throws on HTTP error status', async () => {
    const adapter = new GeminiAdapter({ apiKey: 'test-key', fetch: makeFetch({ error: 'quota exceeded' }, 429) });
    await expect(adapter.ask('prompt', {})).rejects.toThrow('429');
  });
});
