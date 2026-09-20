import type { EngineId } from '../contracts/engine.js';

export type AccuracyFact = {
  promptId: string;
  engineId: EngineId;
  repeatIndex: number;
  accurateClaims: number;
  inaccurateClaims: number;
  unverifiableClaims: number;
};

export type AccuracyCheckOutput = {
  facts: AccuracyFact[];
  accuracyRate: number; // fraction of facts where inaccurateClaims === 0
};
