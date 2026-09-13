import { describe, it, expect, vi } from 'vitest';
import { detectCategory } from '../steps/category-detect.js';
import type { ModelAdapter, ModelAnswer, CategoryEntry } from '@geotrack/core';
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

const TAXONOMY: CategoryEntry[] = [
  { id: 'project-management-software', name: 'Project Management Software', topPlayers: ['Asana', 'Jira', 'Monday.com'] },
  { id: 'team-messaging', name: 'Team Messaging', topPlayers: ['Slack', 'Teams', 'Discord'] },
  { id: 'work-os-platform', name: 'Work OS Platform', topPlayers: ['Monday.com', 'Notion', 'Coda'] },
];

const VALID_RESPONSE = JSON.stringify({
  category_id: 'project-management-software',
  confidence: 0.93,
  rationale: 'Focuses on task tracking and workflow automation.',
  candidates: [
    { category_id: 'project-management-software', confidence: 0.93 },
    { category_id: 'team-messaging', confidence: 0.41 },
  ],
});

function makeModel(answer: string): ModelAdapter {
  return {
    generate: vi.fn().mockResolvedValue({
      text: answer,
      usage: { provider: 'gemini', model: 'gemini-flash', tokensIn: 1853, tokensOut: 78, costUsd: 0.0003 },
    } satisfies ModelAnswer),
  };
}

describe('detectCategory', () => {
  it('returns ok status with correct output for valid model response', async () => {
    const result = await detectCategory({ passport: PASSPORT, taxonomy: TAXONOMY }, makeModel(VALID_RESPONSE));
    expect(result.status).toBe('ok');
    expect(result.data?.categoryId).toBe('project-management-software');
    expect(result.data?.confidence).toBe(0.93);
    expect(result.data?.rationale).toBeTruthy();
  });

  it('populates usage record', async () => {
    const result = await detectCategory({ passport: PASSPORT, taxonomy: TAXONOMY }, makeModel(VALID_RESPONSE));
    expect(result.usage).toHaveLength(1);
    expect(result.usage[0]?.tokensIn).toBe(1853);
  });

  it('includes stepVersion in notes', async () => {
    const result = await detectCategory({ passport: PASSPORT, taxonomy: TAXONOMY }, makeModel(VALID_RESPONSE));
    expect(result.notes.some((n) => n.startsWith('stepVersion:'))).toBe(true);
  });

  it('autoSelected is false on step output', async () => {
    const result = await detectCategory({ passport: PASSPORT, taxonomy: TAXONOMY }, makeModel(VALID_RESPONSE));
    expect(result.data?.autoSelected).toBe(false);
  });

  it('candidates includes chosen categoryId as first entry', async () => {
    const result = await detectCategory({ passport: PASSPORT, taxonomy: TAXONOMY }, makeModel(VALID_RESPONSE));
    expect(result.data?.candidates[0]?.categoryId).toBe('project-management-software');
  });

  it('returns failed on model error', async () => {
    const model: ModelAdapter = { generate: vi.fn().mockRejectedValue(new Error('timeout')) };
    const result = await detectCategory({ passport: PASSPORT, taxonomy: TAXONOMY }, model);
    expect(result.status).toBe('failed');
    expect(result.notes[0]).toMatch(/Model call failed/);
  });

  it('returns failed on invalid JSON', async () => {
    const result = await detectCategory({ passport: PASSPORT, taxonomy: TAXONOMY }, makeModel('not json'));
    expect(result.status).toBe('failed');
    expect(result.notes[0]).toMatch(/JSON parse failed/);
  });

  it('returns failed when schema validation fails (missing confidence)', async () => {
    const bad = JSON.stringify({
      category_id: 'project-management-software',
      rationale: 'ok',
      candidates: [{ category_id: 'project-management-software', confidence: 0.9 }],
    });
    const result = await detectCategory({ passport: PASSPORT, taxonomy: TAXONOMY }, makeModel(bad));
    expect(result.status).toBe('failed');
    expect(result.notes[0]).toMatch(/Schema validation failed/);
  });

  it('includes taxonomy ids in prompt (prompt injection protection check)', async () => {
    const model: ModelAdapter = {
      generate: vi.fn().mockResolvedValue({
        text: VALID_RESPONSE,
        usage: { provider: 'gemini', model: 'gemini-flash', tokensIn: 100, tokensOut: 10, costUsd: 0.0001 },
      }),
    };
    await detectCategory({ passport: PASSPORT, taxonomy: TAXONOMY }, model);
    const call = (model.generate as ReturnType<typeof vi.fn>).mock.calls[0];
    const prompt = call[0] as string;
    expect(prompt).toContain('<data>');
    expect(prompt).toContain('project-management-software');
    expect(prompt).toContain('team-messaging');
  });

  it('handles passport without categoryHint', async () => {
    const passportNoHint: PassportOutput = { ...PASSPORT, categoryHint: undefined };
    const result = await detectCategory({ passport: passportNoHint, taxonomy: TAXONOMY }, makeModel(VALID_RESPONSE));
    expect(result.status).toBe('ok');
  });
});
