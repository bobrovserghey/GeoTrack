import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { productPassport, type PageSnapshot } from '../steps/product-passport.js';
import type { ModelAdapter } from '@geotrack/core';

const FIXTURE = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../../fixtures/engines/gemini/passport-extract.json'),
    'utf-8',
  ),
);

const FIXTURE_TEXT: string =
  FIXTURE.candidates[0].content.parts[0].text;

const FIXTURE_USAGE = {
  provider: 'gemini',
  model: 'gemini-2.0-flash',
  tokensIn: 1247,
  tokensOut: 94,
  costUsd: 0,
};

function makeModel(text: string, throwErr?: Error): ModelAdapter {
  return {
    generate: throwErr
      ? vi.fn().mockRejectedValue(throwErr)
      : vi.fn().mockResolvedValue({ text, usage: FIXTURE_USAGE }),
  };
}

const SAMPLE_PAGES: PageSnapshot[] = [
  { url: 'https://acme.com/', textContent: 'Acme Cloud — project management for remote teams.' },
  { url: 'https://acme.com/pricing', textContent: 'Plans starting at $12/mo per user.' },
];

describe('productPassport — happy path', () => {
  it('returns status ok with valid PassportOutput', async () => {
    const result = await productPassport({ pages: SAMPLE_PAGES }, makeModel(FIXTURE_TEXT));
    expect(result.status).toBe('ok');
    expect(result.data).not.toBeNull();
    expect(result.data?.name).toBe('Acme Cloud');
    expect(result.data?.categoryHint).toBe('project-management-software');
    expect(Array.isArray(result.data?.valueProps)).toBe(true);
    expect(result.data?.targetAudience.summary.length).toBeGreaterThan(0);
  });

  it('includes usage record', async () => {
    const result = await productPassport({ pages: SAMPLE_PAGES }, makeModel(FIXTURE_TEXT));
    expect(result.usage.length).toBe(1);
    expect(result.usage[0]?.provider).toBe('gemini');
  });

  it('includes stepVersion note', async () => {
    const result = await productPassport({ pages: SAMPLE_PAGES }, makeModel(FIXTURE_TEXT));
    expect(result.notes.some((n) => n.startsWith('stepVersion:'))).toBe(true);
  });
});

describe('productPassport — failure cases', () => {
  it('returns failed when model throws', async () => {
    const result = await productPassport(
      { pages: SAMPLE_PAGES },
      makeModel('', new Error('timeout')),
    );
    expect(result.status).toBe('failed');
    expect(result.data).toBeNull();
    expect(result.notes[0]).toContain('timeout');
  });

  it('returns failed when model returns invalid JSON', async () => {
    const result = await productPassport({ pages: SAMPLE_PAGES }, makeModel('not-json'));
    expect(result.status).toBe('failed');
    expect(result.data).toBeNull();
    expect(result.notes[0]).toContain('JSON parse failed');
  });

  it('returns failed when JSON does not match schema', async () => {
    const result = await productPassport(
      { pages: SAMPLE_PAGES },
      makeModel('{"wrong": true}'),
    );
    expect(result.status).toBe('failed');
    expect(result.data).toBeNull();
    expect(result.notes[0]).toContain('Schema validation failed');
  });

  it('handles empty pages array', async () => {
    const result = await productPassport({ pages: [] }, makeModel(FIXTURE_TEXT));
    expect(result.status).toBe('ok');
  });
});

describe('productPassport — prompt construction', () => {
  it('passes at most 5 pages to model', async () => {
    const manyPages: PageSnapshot[] = Array.from({ length: 10 }, (_, i) => ({
      url: `https://acme.com/page-${i}`,
      textContent: `Page ${i} content`,
    }));
    const model = makeModel(FIXTURE_TEXT);
    await productPassport({ pages: manyPages }, model);
    const prompt = (model.generate as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    // Only pages 0-4 should appear (index 1-5 in prompt)
    expect(prompt).toContain('index="5"');
    expect(prompt).not.toContain('index="6"');
  });

  it('wraps page content in <data> block', async () => {
    const model = makeModel(FIXTURE_TEXT);
    await productPassport({ pages: SAMPLE_PAGES }, model);
    const prompt = (model.generate as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain('<data>');
    expect(prompt).toContain('</data>');
  });
});
