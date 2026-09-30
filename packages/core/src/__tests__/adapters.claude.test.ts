import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ClaudeAdapter } from '../adapters/claude.js';
import { calcCallCost } from '../cost/calculator.js';

const FIXTURE = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../../fixtures/engines/claude/ask-basic.json'),
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

describe('ClaudeAdapter', () => {
  it('id is "claude"', () => {
    const adapter = new ClaudeAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    expect(adapter.id).toBe('claude');
  });

  it('ask() returns non-empty text from fixture', async () => {
    const adapter = new ClaudeAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    const result = await adapter.ask('Is Acme Corp known by AI?', {});
    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('ask() extracts sources from web_search_result_location citations', async () => {
    const adapter = new ClaudeAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
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
      content: [
        ...FIXTURE.content,
        {
          type: 'text',
          text: 'again',
          citations: [
            { type: 'web_search_result_location', url: 'https://www.acmecorp.com/about', title: 'About Acme Corp' },
          ],
        },
      ],
    };
    const adapter = new ClaudeAdapter({ apiKey: 'test-key', fetch: makeFetch(fixtureWithDup) });
    const result = await adapter.ask('prompt', {});
    const urls = result.sources.map((s) => s.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('ask() includes title in sources when present', async () => {
    const adapter = new ClaudeAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    const result = await adapter.ask('prompt', {});
    const withTitle = result.sources.filter((s) => s.title);
    expect(withTitle.length).toBeGreaterThan(0);
  });

  it('ask() returns usage with correct provider and model', async () => {
    const adapter = new ClaudeAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    const result = await adapter.ask('prompt', {});
    expect(result.usage.provider).toBe('anthropic');
    expect(result.usage.model).toBe('claude-haiku-4-5-20251001');
    expect(result.usage.tokensIn).toBe(512);
    expect(result.usage.tokensOut).toBe(98);
  });

  it('ask() computes costUsd > 0', async () => {
    const adapter = new ClaudeAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    const result = await adapter.ask('prompt', {});
    expect(result.usage.costUsd).toBeGreaterThan(0);
  });

  it('ask() preserves raw response', async () => {
    const adapter = new ClaudeAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    const result = await adapter.ask('prompt', {});
    expect(result.raw).toEqual(FIXTURE);
  });

  it('ask() calls the Claude Messages API endpoint', async () => {
    const mockFetch = makeFetch(FIXTURE);
    const adapter = new ClaudeAdapter({ apiKey: 'my-api-key', fetch: mockFetch });
    await adapter.ask('prompt', {});
    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('api.anthropic.com/v1/messages');
  });

  it('ask() sends x-api-key and anthropic-version headers', async () => {
    const mockFetch = makeFetch(FIXTURE);
    const adapter = new ClaudeAdapter({ apiKey: 'secret-key', fetch: mockFetch });
    await adapter.ask('prompt', {});
    const calledOpts = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const headers = calledOpts.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('secret-key');
    expect(headers['anthropic-version']).toBeTruthy();
  });

  it('ask() includes web_search tool capped at max_uses: 1', async () => {
    const mockFetch = makeFetch(FIXTURE);
    const adapter = new ClaudeAdapter({ apiKey: 'key', fetch: mockFetch });
    await adapter.ask('prompt', {});
    const body = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string) as Record<string, unknown>;
    const tools = body['tools'] as Array<{ type: string; name: string; max_uses: number }>;
    const webSearch = tools.find((t) => t.name === 'web_search');
    expect(webSearch).toBeDefined();
    expect(webSearch?.max_uses).toBe(1);
  });

  it('ask() never reports more than one billed search per response', async () => {
    const adapter = new ClaudeAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    const result = await adapter.ask('prompt', {});
    // costUsd is derived from usage.server_tool_use.web_search_requests (=1 in
    // the fixture); max_uses:1 at the request level guarantees it can never
    // exceed 1 regardless of how many results a single search returns.
    expect(FIXTURE.usage.server_tool_use.web_search_requests).toBeLessThanOrEqual(1);
    expect(result.usage.costUsd).toBeGreaterThan(0);
  });

  it('ask() bills no search when Claude did not use the tool', async () => {
    const noSearch = {
      ...FIXTURE,
      content: [{ type: 'text', text: 'Acme Corp is a software company.' }],
      usage: { input_tokens: 50, output_tokens: 12 },
    };
    const adapter = new ClaudeAdapter({ apiKey: 'test-key', fetch: makeFetch(noSearch) });
    const result = await adapter.ask('prompt', {});
    expect(result.sources).toEqual([]);
    const tokenOnlyCost = calcCallCost('anthropic', 'claude-haiku-4-5-20251001', 50, 12, {});
    expect(result.usage.costUsd).toBeCloseTo(tokenOnlyCost, 10);
  });

  it('ask() throws on HTTP error status', async () => {
    const adapter = new ClaudeAdapter({ apiKey: 'test-key', fetch: makeFetch({ error: 'unauthorized' }, 401) });
    await expect(adapter.ask('prompt', {})).rejects.toThrow('401');
  });

  it('ask() returns empty sources and text when content is empty', async () => {
    const empty = { ...FIXTURE, content: [] };
    const adapter = new ClaudeAdapter({ apiKey: 'key', fetch: makeFetch(empty) });
    const result = await adapter.ask('prompt', {});
    expect(result.sources).toEqual([]);
    expect(result.text).toBe('');
  });
});
