import { describe, it, expect } from 'vitest';
import { computeBasketForecast } from '../findings/basket-forecast.js';
import type { Finding } from '../findings/types.js';

function makeFinding(id: string, delta: number, effortHours = 4): Finding {
  return {
    id,
    criterionId: 'b1',
    pillar: 'B',
    title: `Finding ${id}`,
    description: '',
    impact: 'warning',
    expectedScoreDelta: delta,
    effortHours,
    priority: Math.abs(delta) / effortHours,
    evidence: null,
    howToFix: '',
  };
}

const FACTOR = 0.7;

describe('computeBasketForecast — empty selection', () => {
  it('returns currentScore unchanged when no ids selected', () => {
    const findings = [makeFinding('f1', -0.6)];
    const result = computeBasketForecast(5.0, findings, [], FACTOR);
    expect(result.forecastScore).toBe(5.0);
    expect(result.selectedCount).toBe(0);
    expect(result.totalRecoveredDelta).toBe(0);
  });

  it('returns currentScore unchanged when selected id not found', () => {
    const findings = [makeFinding('f1', -0.6)];
    const result = computeBasketForecast(5.0, findings, ['nonexistent'], FACTOR);
    expect(result.forecastScore).toBe(5.0);
    expect(result.selectedCount).toBe(0);
  });
});

describe('computeBasketForecast — single finding', () => {
  it('adds |delta| × realizationFactor to the current score', () => {
    const findings = [makeFinding('f1', -0.6)];
    const result = computeBasketForecast(5.0, findings, ['f1'], FACTOR);
    // 5.0 + 0.6 × 0.7 = 5.0 + 0.42 = 5.42
    expect(result.forecastScore).toBe(5.42);
    expect(result.selectedCount).toBe(1);
    expect(result.totalRecoveredDelta).toBe(0.42);
  });

  it('works with zero delta (no improvement)', () => {
    const findings = [makeFinding('f1', 0)];
    const result = computeBasketForecast(5.0, findings, ['f1'], FACTOR);
    expect(result.forecastScore).toBe(5.0);
    expect(result.totalRecoveredDelta).toBe(0);
  });
});

describe('computeBasketForecast — multiple findings', () => {
  it('sums improvements across all selected findings', () => {
    const findings = [makeFinding('f1', -0.6), makeFinding('f2', -0.4), makeFinding('f3', -0.2)];
    const result = computeBasketForecast(4.0, findings, ['f1', 'f2'], FACTOR);
    // 4.0 + (0.6 + 0.4) × 0.7 = 4.0 + 0.7 = 4.7
    expect(result.forecastScore).toBe(4.7);
    expect(result.selectedCount).toBe(2);
  });

  it('only counts selected ids, not all findings', () => {
    const findings = [makeFinding('f1', -1.0), makeFinding('f2', -1.0), makeFinding('f3', -1.0)];
    const resultAll = computeBasketForecast(3.0, findings, ['f1', 'f2', 'f3'], FACTOR);
    const resultOne = computeBasketForecast(3.0, findings, ['f1'], FACTOR);
    expect(resultAll.selectedCount).toBe(3);
    expect(resultOne.selectedCount).toBe(1);
    expect(resultAll.forecastScore).toBeGreaterThan(resultOne.forecastScore);
  });

  it('counts each finding only once even if its id appears twice in selectedIds', () => {
    const findings = [makeFinding('f1', -1.0)];
    const result = computeBasketForecast(5.0, findings, ['f1', 'f1'], FACTOR);
    expect(result.selectedCount).toBe(1);
    expect(result.forecastScore).toBe(5.7); // 5.0 + 1.0 × 0.7, not 5.0 + 2 × 0.7
  });
});

describe('computeBasketForecast — clamping', () => {
  it('clamps forecast to 10 when improvement would exceed maximum', () => {
    const findings = [makeFinding('f1', -5.0)];
    const result = computeBasketForecast(9.0, findings, ['f1'], FACTOR);
    // 9.0 + 5.0 × 0.7 = 9.0 + 3.5 = 12.5 → clamped to 10
    expect(result.forecastScore).toBe(10);
  });

  it('totalRecoveredDelta reflects actual improvement after upper clamp', () => {
    const findings = [makeFinding('f1', -5.0)];
    const result = computeBasketForecast(9.0, findings, ['f1'], FACTOR);
    // forecastScore clamped to 10; actual improvement is 10 - 9.0 = 1.0, not 3.5
    expect(result.forecastScore).toBe(10);
    expect(result.totalRecoveredDelta).toBe(1.0);
  });

  it('clamps forecast to 0 when currentScore is negative', () => {
    const findings = [makeFinding('f1', 0)];
    const result = computeBasketForecast(-1.0, findings, ['f1'], FACTOR);
    expect(result.forecastScore).toBe(0);
  });
});

describe('computeBasketForecast — realizationFactor', () => {
  it('forecast with factor=1 gives full delta recovery', () => {
    const findings = [makeFinding('f1', -1.0)];
    const result = computeBasketForecast(5.0, findings, ['f1'], 1.0);
    expect(result.forecastScore).toBe(6.0);
  });

  it('forecast with factor=0 gives no improvement', () => {
    const findings = [makeFinding('f1', -1.0)];
    const result = computeBasketForecast(5.0, findings, ['f1'], 0);
    expect(result.forecastScore).toBe(5.0);
    expect(result.totalRecoveredDelta).toBe(0);
  });

  it('forecast with factor=0.7 (default) gives partial recovery', () => {
    const findings = [makeFinding('f1', -1.0)];
    const result = computeBasketForecast(5.0, findings, ['f1'], 0.7);
    expect(result.forecastScore).toBe(5.7);
    expect(result.totalRecoveredDelta).toBe(0.7);
  });
});

describe('computeBasketForecast — reproducibility', () => {
  it('same inputs always produce the same output', () => {
    const findings = [makeFinding('f1', -0.6), makeFinding('f2', -0.3)];
    const r1 = computeBasketForecast(4.5, findings, ['f1', 'f2'], FACTOR);
    const r2 = computeBasketForecast(4.5, findings, ['f1', 'f2'], FACTOR);
    expect(r1.forecastScore).toBe(r2.forecastScore);
    expect(r1.totalRecoveredDelta).toBe(r2.totalRecoveredDelta);
  });

  it('result is rounded to 2 decimal places', () => {
    const findings = [makeFinding('f1', -1 / 3)];
    const result = computeBasketForecast(5.0, findings, ['f1'], FACTOR);
    const str = result.forecastScore.toString();
    const decimals = str.includes('.') ? str.split('.')[1].length : 0;
    expect(decimals).toBeLessThanOrEqual(2);
  });
});
