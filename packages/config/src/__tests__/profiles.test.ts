import { describe, it, expect } from 'vitest';
import { getAuditProfile } from '../index.js';

describe('getAuditProfile', () => {
  it('returns teaser profile with correct values', () => {
    const profile = getAuditProfile('teaser');
    expect(profile.id).toBe('teaser');
    expect(profile.crawlerPages).toBe(3);
    expect(profile.engines).toEqual(['perplexity']);
    expect(profile.promptCount).toBe(12);
    expect(profile.promptRepeats).toBe(1);
    expect(profile.competitorCount).toBe(0);
    expect(profile.findingCount).toBe(3);
    expect(profile.manualReview).toBe(false);
    expect(profile.pdf).toBe(false);
    expect(profile.costSoftCeilingUsd).toBe(0.10);
    expect(profile.costHardCeilingUsd).toBe(0.25);
    expect(profile.timeBudgetSeconds).toBe(90);
  });

  it('returns standard profile with correct values', () => {
    const profile = getAuditProfile('standard');
    expect(profile.id).toBe('standard');
    expect(profile.crawlerPages).toBe(50);
    expect(profile.engines).toEqual(['perplexity', 'chatgpt', 'gemini']);
    expect(profile.promptCount).toBe(30);
    expect(profile.promptRepeats).toBe(2);
    expect(profile.competitorCount).toBe(3);
    expect(profile.costSoftCeilingUsd).toBe(6.00);
    expect(profile.costHardCeilingUsd).toBe(8.00);
    expect(profile.timeBudgetSeconds).toBe(360);
  });

  it('returns extended profile with correct values', () => {
    const profile = getAuditProfile('extended');
    expect(profile.id).toBe('extended');
    expect(profile.promptCount).toBe(50);
    expect(profile.competitorCount).toBe(5);
    expect(profile.costSoftCeilingUsd).toBe(9.00);
    expect(profile.costHardCeilingUsd).toBe(12.00);
    expect(profile.timeBudgetSeconds).toBe(480);
  });

  it('all three profiles are present', () => {
    for (const id of ['teaser', 'standard', 'extended']) {
      expect(() => getAuditProfile(id), `profile "${id}" should exist`).not.toThrow();
    }
  });

  it('throws on unknown profile id', () => {
    expect(() => getAuditProfile('enterprise')).toThrowError(/Unknown audit profile/);
  });

  it('hard ceiling is always greater than soft ceiling', () => {
    for (const id of ['teaser', 'standard', 'extended']) {
      const p = getAuditProfile(id);
      expect(p.costHardCeilingUsd).toBeGreaterThan(p.costSoftCeilingUsd);
    }
  });

  it('extended has more prompts than standard and standard more than teaser', () => {
    const t = getAuditProfile('teaser');
    const s = getAuditProfile('standard');
    const e = getAuditProfile('extended');
    expect(s.promptCount).toBeGreaterThan(t.promptCount);
    expect(e.promptCount).toBeGreaterThan(s.promptCount);
  });
});
