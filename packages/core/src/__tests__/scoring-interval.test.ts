import { describe, it, expect } from 'vitest';
import { computeInterval } from '../scoring/confidence-interval.js';
import type { Methodology } from '@geotrack/config';

function makeConfig(): Methodology {
  return {
    version: 1,
    pillars: {},
    blockers: [],
    bands: [],
    interval: { hRepFallback: 0.3, hCovFactor: 0.5, hRepFactor: 0.3 },
    basket: { realizationFactor: 0.7 },
  };
}

// ---- h_rep ------------------------------------------------------------------

describe('computeInterval — h_rep', () => {
  it('1 repeat → h_rep = hRepFallback = 0.3', () => {
    const result = computeInterval([70], 0, makeConfig());
    // h_cov = 0, so half = 0.3
    expect(result.half).toBeCloseTo(0.3, 5);
  });

  it('2 repeats with identical scores → sigma=0, h_rep=0', () => {
    const result = computeInterval([70, 70], 0, makeConfig());
    expect(result.half).toBeCloseTo(0, 5);
  });

  it('2 repeats with sigma=10 → h_rep = 0.3 × 10 / 10 = 0.3', () => {
    // scores: [60, 80] → mean=70, sigma=10 (population)
    const result = computeInterval([60, 80], 0, makeConfig());
    expect(result.half).toBeCloseTo(0.3, 5);
  });

  it('3 repeats with sigma=0 → h_rep=0', () => {
    const result = computeInterval([50, 50, 50], 0, makeConfig());
    expect(result.half).toBeCloseTo(0, 5);
  });
});

// ---- h_cov ------------------------------------------------------------------

describe('computeInterval — h_cov', () => {
  it('unmeasuredWeightFraction=0 → h_cov=0', () => {
    const result = computeInterval([70, 70], 0, makeConfig());
    expect(result.half).toBeCloseTo(0, 5);
  });

  it('unmeasuredWeightFraction=1 → h_cov = 10 × 0.5 × 1 = 5', () => {
    const result = computeInterval([70, 70], 1, makeConfig());
    expect(result.half).toBeCloseTo(5, 5);
  });

  it('unmeasuredWeightFraction=0.3 → h_cov = 10 × 0.5 × 0.3 = 1.5', () => {
    const result = computeInterval([70, 70], 0.3, makeConfig());
    expect(result.half).toBeCloseTo(1.5, 5);
  });
});

// ---- half = h_rep + h_cov ---------------------------------------------------

describe('computeInterval — combined half', () => {
  it('1 repeat + unmeasuredWeightFraction=0.12 → half = 0.3 + 0.6 = 0.9', () => {
    // h_rep = hRepFallback = 0.3
    // h_cov = 10 × 0.5 × 0.12 = 0.6
    const result = computeInterval([75], 0.12, makeConfig());
    expect(result.half).toBeCloseTo(0.9, 5);
  });

  it('2 repeats sigma=10, unmeasuredWeightFraction=0.12 → half = 0.3 + 0.6 = 0.9', () => {
    // h_rep = 0.3 × 10 / 10 = 0.3
    // h_cov = 0.6
    const result = computeInterval([65, 85], 0.12, makeConfig());
    expect(result.half).toBeCloseTo(0.9, 5);
  });
});

// ---- low / high: centered on mean / 10 -------------------------------------

describe('computeInterval — low and high', () => {
  it('mean=70, half=0.9 → low=6.1, high=7.9', () => {
    // center = mean(scores)/10 = 70/10 = 7.0
    const result = computeInterval([75], 0.12, makeConfig());
    // center = 7.5, half = 0.9
    expect(result.low).toBeCloseTo(7.5 - 0.9, 5);
    expect(result.high).toBeCloseTo(7.5 + 0.9, 5);
  });

  it('low clamped to 0 when center - half < 0', () => {
    // center = 5/10 = 0.5, half = 5 → low would be -4.5 → clamped to 0
    const result = computeInterval([5, 5], 1, makeConfig());
    expect(result.low).toBe(0);
  });

  it('high clamped to 10 when center + half > 10', () => {
    // center = 95/10 = 9.5, half = 5 → high would be 14.5 → clamped to 10
    const result = computeInterval([95, 95], 1, makeConfig());
    expect(result.high).toBe(10);
  });
});
