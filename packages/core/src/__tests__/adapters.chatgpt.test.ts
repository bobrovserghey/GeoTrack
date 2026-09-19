import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ChatGptAdapter } from '../adapters/chatgpt.js';

const FIXTURE = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../../fixtures/engines/chatgpt/ask-basic.json'),
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

describe('ChatGptAdapter', () => {
  it('id is "chatgpt"', () => {
    const adapter = new ChatGptAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    expect(adapter.id).toBe('chatgpt');
  });

  it('ask() returns non-empty text from fixture', async () => {
    const adapter = new ChatGptAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    const result = await adapter.ask('Is Acme Corp known by AI?', {});
    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('ask() extracts sources from url_citation annotations', async () => {
    const adapter = new ChatGptAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    const result = await adapter.ask('Is Acme Corp known by AI?', {});
    expect(Array.isArray(result.sources)).toBe(true);
    expect(result.sources.length).toBeGreaterThan(0);
    for (const src of result.sources) {
      expect(typeof src.url).toBe('string');
      expect(src.url.startsWith('http')).toBe(true);
    }
  });

  it('ask() deduplicates sources by url', async () => {
    const fixtureWithDup = {
      ...FIXTURE,
      output: [
        FIXTURE.output[0],
        {
          ...FIXTURE.output[1],
          content: [
            {
              type: 'output_text',
              text: 'text',
              annotations: [
                { type: 'url_citation', url: 'https://example.com', title: 'A', start_index: 0, end_index: 1 },
                { type: 'url_citation', url: 'https://example.com', title: 'A', start_index: 2, end_index: 3 },
              ],
            },
          ],
        },
      ],
    };
    const adapter = new ChatGptAdapter({ apiKey: 'test-key', fetch: makeFetch(fixtureWithDup) });
    const result = await adapter.ask('prompt', {});
    const urls = result.sources.map(s => s.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('ask() includes title in sources when present', async () => {
    const adapter = new ChatGptAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    const result = await adapter.ask('prompt', {});
    const withTitle = result.sources.filter(s => s.title);
    expect(withTitle.length).toBeGreaterThan(0);
  });

  it('ask() returns usage with correct provider and model', async () => {
    const adapter = new ChatGptAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    const result = await adapter.ask('prompt', {});
    expect(result.usage.provider).toBe('openai');
    expect(result.usage.model).toBe('gpt-4o-mini-search-preview');
    expect(result.usage.tokensIn).toBe(142);
    expect(result.usage.tokensOut).toBe(67);
  });

  it('ask() computes costUsd > 0', async () => {
    const adapter = new ChatGptAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    const result = await adapter.ask('prompt', {});
    expect(result.usage.costUsd).toBeGreaterThan(0);
  });

  it('ask() preserves raw response', async () => {
    const adapter = new ChatGptAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    const result = await adapter.ask('prompt', {});
    expect(result.raw).toEqual(FIXTURE);
  });

  it('ask() calls the OpenAI Responses API endpoint', async () => {
    const mockFetch = makeFetch(FIXTURE);
    const adapter = new ChatGptAdapter({ apiKey: 'my-api-key', fetch: mockFetch });
    await adapter.ask('prompt', {});
    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('api.openai.com/v1/responses');
  });

  it('ask() sends Authorization header with bearer token', async () => {
    const mockFetch = makeFetch(FIXTURE);
    const adapter = new ChatGptAdapter({ apiKey: 'secret-key', fetch: mockFetch });
    await adapter.ask('prompt', {});
    const calledOpts = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const headers = calledOpts.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer secret-key');
  });

  it('ask() includes web_search_preview tool in request body', async () => {
    const mockFetch = makeFetch(FIXTURE);
    const adapter = new ChatGptAdapter({ apiKey: 'key', fetch: mockFetch });
    await adapter.ask('prompt', {});
    const body = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string) as Record<string, unknown>;
    const tools = body['tools'] as Array<{ type: string }>;
    expect(tools.some(t => t.type === 'web_search_preview')).toBe(true);
  });

  it('ask() throws on HTTP error status', async () => {
    const adapter = new ChatGptAdapter({ apiKey: 'test-key', fetch: makeFetch({ error: 'unauthorized' }, 401) });
    await expect(adapter.ask('prompt', {})).rejects.toThrow('401');
  });

  it('ask() returns empty sources when output has no annotations', async () => {
    const noAnnotations = {
      ...FIXTURE,
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'no sources here', annotations: [] }],
        },
      ],
    };
    const adapter = new ChatGptAdapter({ apiKey: 'key', fetch: makeFetch(noAnnotations) });
    const result = await adapter.ask('prompt', {});
    expect(result.sources).toEqual([]);
  });
});
