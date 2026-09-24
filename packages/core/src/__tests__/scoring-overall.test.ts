import { describe, it, expect } from 'vitest';
import { computeOverallScore } from '../scoring/overall.js';
import type { Methodology } from '@geotrack/config';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeConfig(): Methodology {
  return {
    version: 1,
    pillars: {
      A: { weight: 0.4, criteria: {} },
      B: { weight: 0.2, criteria: {} },
      C: { weight: 0.15, criteria: {} },
      D: { weight: 0.1, criteria: {} },
      E: { weight: 0.15, criteria: {} },
    },
    blockers: [],
    bands: [
      { min: 0, max: 30, label: 'critical' },
      { min: 31, max: 50, label: 'poor' },
      { min: 51, max: 70, label: 'fair' },
      { min: 71, max: 85, label: 'good' },
      { min: 86, max: 100, label: 'excellent' },
    ],
    interval: { hRepFallback: 0.3, hCovFactor: 0.5, hRepFactor: 0.3 },
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('computeOverallScore', () => {
  it('all pillars 100 → overallScore 10.0, band excellent', () => {
    const r = computeOverallScore({ A: 100, B: 100, C: 100, D: 100, E: 100 }, makeConfig());
    expect(r.weightedSum).toBe(100);
    expect(r.overallScore).toBe(10.0);
    expect(r.band).toBe('excellent');
  });

  it('all pillars 0 → overallScore 0.0, band critical', () => {
    const r = computeOverallScore({ A: 0, B: 0, C: 0, D: 0, E: 0 }, makeConfig());
    expect(r.weightedSum).toBe(0);
    expect(r.overallScore).toBe(0.0);
    expect(r.band).toBe('critical');
  });

  it('mixed scores produce correct weighted sum', () => {
    // 0.4*80 + 0.2*60 + 0.15*70 + 0.1*50 + 0.15*90
    // = 32 + 12 + 10.5 + 5 + 13.5 = 73
    const r = computeOverallScore({ A: 80, B: 60, C: 70, D: 50, E: 90 }, makeConfig());
    expect(r.weightedSum).toBe(73);
    expect(r.overallScore).toBe(7.3);
    expect(r.band).toBe('good');
  });

  it('band boundary: weightedSum 50 → poor', () => {
    const r = computeOverallScore({ A: 50, B: 50, C: 50, D: 50, E: 50 }, makeConfig());
    expect(r.weightedSum).toBe(50);
    expect(r.band).toBe('poor');
  });

  it('band boundary: weightedSum 51 → fair', () => {
    // weights sum to 1.0 → 51*1.0 = 51
    const r = computeOverallScore({ A: 51, B: 51, C: 51, D: 51, E: 51 }, makeConfig());
    expect(r.weightedSum).toBe(51);
    expect(r.band).toBe('fair');
  });

  it('band boundary: weightedSum 86 → excellent', () => {
    // all 86 → weightedSum 86
    const r = computeOverallScore({ A: 86, B: 86, C: 86, D: 86, E: 86 }, makeConfig());
    expect(r.weightedSum).toBe(86);
    expect(r.band).toBe('excellent');
  });

  it('pillarScores are passed through to result', () => {
    const input = { A: 70, B: 80, C: 60, D: 90, E: 50 };
    const r = computeOverallScore(input, makeConfig());
    expect(r.pillarScores).toEqual(input);
  });

  it('band unknown when no bands match (empty bands)', () => {
    const config = { ...makeConfig(), bands: [] };
    const r = computeOverallScore({ A: 50, B: 50, C: 50, D: 50, E: 50 }, config);
    expect(r.band).toBe('unknown');
  });
});
