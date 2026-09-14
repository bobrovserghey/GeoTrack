import type { Methodology } from '@geotrack/config';

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function populationStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Computes the half-width confidence interval for pillar A scores.
 *
 * - half: interval half-width in 0-10 scale units
 * - low / high: center ± half, clamped to [0, 10], where center = mean(pillarAScores) / 10
 *
 * @param pillarAScores  One score (0-100) per repeat / engine group
 * @param unmeasuredWeightFraction  Fraction [0,1] of total methodology max-score that is unmeasured
 * @param config  Methodology configuration (uses config.interval constants)
 */
export function computeInterval(
  pillarAScores: number[],
  unmeasuredWeightFraction: number,
  config: Methodology,
): { half: number; low: number; high: number } {
  const { hRepFallback, hCovFactor, hRepFactor } = config.interval;

  const sigma = populationStdDev(pillarAScores);
  const hRep = pillarAScores.length >= 2 ? hRepFactor * sigma / 10 : hRepFallback;
  const hCov = 10 * hCovFactor * unmeasuredWeightFraction;
  const half = hRep + hCov;

  const center = mean(pillarAScores) / 10;
  const low = Math.max(0, center - half);
  const high = Math.min(10, center + half);

  return { half, low, high };
}
