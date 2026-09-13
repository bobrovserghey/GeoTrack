import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { GeminiModelAdapter } from '../adapters/gemini-model.js';

const FIXTURE = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../../fixtures/engines/gemini/passport-extract.json'),
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

describe('GeminiModelAdapter', () => {
  it('generate() returns non-empty text from fixture', async () => {
    const adapter = new GeminiModelAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    const result = await adapter.generate('Extract passport from site');
    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('generate() returns usage with correct provider', async () => {
    const adapter = new GeminiModelAdapter({ apiKey: 'test-key', fetch: makeFetch(FIXTURE) });
    const result = await adapter.generate('Extract passport from site');
    expect(result.usage.provider).toBe('gemini');
    expect(result.usage.model).toBe('gemini-2.0-flash');
    expect(result.usage.tokensIn).toBe(1247);
    expect(result.usage.tokensOut).toBe(94);
  });

  it('generate() does NOT include tools in request body (no grounding)', async () => {
    const fetchFn = makeFetch(FIXTURE);
    const adapter = new GeminiModelAdapter({ apiKey: 'test-key', fetch: fetchFn });
    await adapter.generate('Extract passport from site');
    const body = JSON.parse((fetchFn.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.tools).toBeUndefined();
  });

  it('generate() includes response_mime_type when jsonMode: true', async () => {
    const fetchFn = makeFetch(FIXTURE);
    const adapter = new GeminiModelAdapter({ apiKey: 'test-key', fetch: fetchFn });
    await adapter.generate('Extract passport', { jsonMode: true });
    const body = JSON.parse((fetchFn.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.generationConfig?.response_mime_type).toBe('application/json');
  });

  it('generate() omits generationConfig when jsonMode is false', async () => {
    const fetchFn = makeFetch(FIXTURE);
    const adapter = new GeminiModelAdapter({ apiKey: 'test-key', fetch: fetchFn });
    await adapter.generate('Extract passport', { jsonMode: false });
    const body = JSON.parse((fetchFn.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.generationConfig).toBeUndefined();
  });

  it('generate() throws on non-ok response', async () => {
    const adapter = new GeminiModelAdapter({ apiKey: 'test-key', fetch: makeFetch({}, 429) });
    await expect(adapter.generate('prompt')).rejects.toThrow('Gemini model API error: 429');
  });
});
