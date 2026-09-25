import type { Finding } from './types.js';

export type BasketForecastResult = {
  forecastScore: number;
  selectedCount: number;
  totalRecoveredDelta: number;
};

/**
 * Computes the forecasted overall score if all selected findings are fixed.
 *
 * Formula (section 4.5): forecast = currentScore + Σ(|finding.expectedScoreDelta| × realizationFactor)
 * The realizationFactor (default 0.7) accounts for partial implementation success.
 * Result is clamped to [0, 10] and rounded to two decimal places.
 */
export function computeBasketForecast(
  currentScore: number,
  allFindings: Finding[],
  selectedIds: string[],
  realizationFactor: number,
): BasketForecastResult {
  const selected = allFindings.filter((f) => selectedIds.includes(f.id));
  const rawDelta = selected.reduce(
    (acc, f) => acc + Math.abs(f.expectedScoreDelta) * realizationFactor,
    0,
  );

  const raw = currentScore + rawDelta;
  const forecastScore = Math.round(Math.min(10, Math.max(0, raw)) * 100) / 100;
  const totalRecoveredDelta = Math.round((forecastScore - currentScore) * 100) / 100;

  return {
    forecastScore,
    selectedCount: selected.length,
    totalRecoveredDelta,
  };
}
