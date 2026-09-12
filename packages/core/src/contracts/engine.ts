import type { UsageRecord } from './step.js';

export type EngineId = 'perplexity' | 'chatgpt' | 'gemini';

export type AskOptions = {
  timeoutMs?: number;
  locale?: string;
};

export type EngineAnswer = {
  text: string;
  sources: { url: string; title?: string }[];
  raw: unknown;
  usage: UsageRecord;
};

export interface EngineAdapter {
  id: EngineId;
  ask(prompt: string, opts: AskOptions): Promise<EngineAnswer>;
}
