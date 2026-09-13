import { describe, it, expect, vi } from 'vitest';
import { detectCompetitors } from '../steps/competitor-detect.js';
import type { ModelAdapter, ModelAnswer } from '@geotrack/core';
import type { PassportOutput } from '@geotrack/core/steps/passport';

const PASSPORT: PassportOutput = {
  name: 'Acme Cloud',
  description: 'Project management platform for remote engineering teams.',
  categoryHint: 'project-management-software',
  valueProps: ['Real-time collaboration', 'Automated workflows'],
  targetAudience: {
    summary: 'Remote software engineering teams',
    personas: ['Engineering managers', 'Product managers'],
  },
};

const VALID_RESPONSE = JSON.stringify({
  competitors: [
    { name: 'Asana', domain: 'asana.com', rationale: 'Direct project management competitor.' },
    { name: 'Jira', domain: 'atlassian.com', rationale: 'Leading issue tracker for engineering teams.' },
    { name: 'Monday.com', domain: 'monday.com', rationale: 'Work OS with similar workflow automation.' },
  ],
});

const EMPTY_RESPONSE = JSON.stringify({ competitors: [] });

function makeModel(answer: string): ModelAdapter {
  return {
    generate: vi.fn().mockResolvedValue({
      text: answer,
      usage: { provider: 'gemini', model: 'gemini-flash', tokensIn: 892, tokensOut: 74, costUsd: 0.0002 },
    } satisfies ModelAnswer),
  };
}

describe('detectCompetitors', () => {
  it('returns ok status with competitor list', async () => {
    const result = await detectCompetitors(
      { passport: PASSPORT, maxCount: 3 },
      makeModel(VALID_RESPONSE),
    );
    expect(result.status).toBe('ok');
    expect(result.data?.competitors).toHaveLength(3);
    expect(result.data?.competitors[0]?.name).toBe('Asana');
  });

  it('populates usage record', async () => {
    const result = await detectCompetitors(
      { passport: PASSPORT, maxCount: 3 },
      makeModel(VALID_RESPONSE),
    );
    expect(result.usage).toHaveLength(1);
    expect(result.usage[0]?.tokensIn).toBe(892);
  });

  it('includes stepVersion in notes', async () => {
    const result = await detectCompetitors(
      { passport: PASSPORT, maxCount: 3 },
      makeModel(VALID_RESPONSE),
    );
    expect(result.notes.some((n) => n.startsWith('stepVersion:'))).toBe(true);
  });

  it('includes competitor count in notes', async () => {
    const result = await detectCompetitors(
      { passport: PASSPORT, maxCount: 3 },
      makeModel(VALID_RESPONSE),
    );
    expect(result.notes.some((n) => n.startsWith('competitors:'))).toBe(true);
  });

  it('caps competitors to maxCount', async () => {
    const result = await detectCompetitors(
      { passport: PASSPORT, maxCount: 2 },
      makeModel(VALID_RESPONSE),
    );
    expect(result.status).toBe('ok');
    expect(result.data?.competitors).toHaveLength(2);
  });

  it('returns ok for empty competitors list', async () => {
    const result = await detectCompetitors(
      { passport: PASSPORT, maxCount: 3 },
      makeModel(EMPTY_RESPONSE),
    );
    expect(result.status).toBe('ok');
    expect(result.data?.competitors).toHaveLength(0);
  });

  it('returns failed on model error', async () => {
    const model: ModelAdapter = { generate: vi.fn().mockRejectedValue(new Error('timeout')) };
    const result = await detectCompetitors({ passport: PASSPORT, maxCount: 3 }, model);
    expect(result.status).toBe('failed');
    expect(result.notes[0]).toMatch(/Model call failed/);
  });

  it('returns failed on invalid JSON', async () => {
    const result = await detectCompetitors(
      { passport: PASSPORT, maxCount: 3 },
      makeModel('not json'),
    );
    expect(result.status).toBe('failed');
    expect(result.notes[0]).toMatch(/JSON parse failed/);
  });

  it('returns failed when schema validation fails', async () => {
    const bad = JSON.stringify({ competitors: [{ name: 'Asana' }] }); // missing rationale
    const result = await detectCompetitors(
      { passport: PASSPORT, maxCount: 3 },
      makeModel(bad),
    );
    expect(result.status).toBe('failed');
    expect(result.notes[0]).toMatch(/Schema validation failed/);
  });

  it('includes <data> block and userSuggested in prompt', async () => {
    const model: ModelAdapter = {
      generate: vi.fn().mockResolvedValue({
        text: VALID_RESPONSE,
        usage: { provider: 'gemini', model: 'gemini-flash', tokensIn: 100, tokensOut: 10, costUsd: 0.0001 },
      }),
    };
    await detectCompetitors(
      { passport: PASSPORT, maxCount: 3, userSuggested: ['ClickUp', 'Notion'] },
      model,
    );
    const prompt = (model.generate as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain('<data>');
    expect(prompt).toContain('ClickUp');
    expect(prompt).toContain('Notion');
  });

  it('includes topPlayersHint in prompt when provided', async () => {
    const model: ModelAdapter = {
      generate: vi.fn().mockResolvedValue({
        text: VALID_RESPONSE,
        usage: { provider: 'gemini', model: 'gemini-flash', tokensIn: 100, tokensOut: 10, costUsd: 0.0001 },
      }),
    };
    await detectCompetitors(
      { passport: PASSPORT, maxCount: 3, topPlayersHint: ['Asana', 'Jira', 'Monday.com'] },
      model,
    );
    const prompt = (model.generate as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain('Asana');
    expect(prompt).toContain('Jira');
  });

  it('works without optional fields', async () => {
    const result = await detectCompetitors(
      { passport: PASSPORT, maxCount: 5 },
      makeModel(VALID_RESPONSE),
    );
    expect(result.status).toBe('ok');
  });
});
