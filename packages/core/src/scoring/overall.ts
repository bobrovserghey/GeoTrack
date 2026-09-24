import type { Methodology } from '@geotrack/config';

export type OverallScoreResult = {
  pillarScores: Record<'A' | 'B' | 'C' | 'D' | 'E', number>;
  weightedSum: number;
  overallScore: number;
  band: string;
};

export function computeOverallScore(
  pillarScores: Record<'A' | 'B' | 'C' | 'D' | 'E', number>,
  config: Methodology,
): OverallScoreResult {
  const pillars = config.pillars;
  const wA = pillars['A']?.weight ?? 0.4;
  const wB = pillars['B']?.weight ?? 0.2;
  const wC = pillars['C']?.weight ?? 0.15;
  const wD = pillars['D']?.weight ?? 0.1;
  const wE = pillars['E']?.weight ?? 0.15;

  const weightedSum = Math.round(
    wA * pillarScores.A +
    wB * pillarScores.B +
    wC * pillarScores.C +
    wD * pillarScores.D +
    wE * pillarScores.E,
  );

  const overallScore = weightedSum / 10;

  const band =
    config.bands.find((b) => weightedSum >= b.min && weightedSum <= b.max)?.label ?? 'unknown';

  return { pillarScores, weightedSum, overallScore, band };
}
