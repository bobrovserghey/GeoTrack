import type { EngineId } from '../contracts/engine.js';

export type Tone = 'positive' | 'neutral' | 'negative';

export type ToneFact = {
  promptId: string;
  engineId: EngineId;
  repeatIndex: number;
  tone: Tone;
};

export type ToneCheckOutput = {
  facts: ToneFact[];
  positiveRate: number; // positive / total (0 when total === 0)
};
