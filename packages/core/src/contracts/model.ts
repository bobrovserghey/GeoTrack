import type { UsageRecord } from './step.js';

export type GenerateOptions = {
  timeoutMs?: number;
  jsonMode?: boolean;
};

export type ModelAnswer = {
  text: string;
  usage: UsageRecord;
};

export interface ModelAdapter {
  generate(prompt: string, opts?: GenerateOptions): Promise<ModelAnswer>;
}
