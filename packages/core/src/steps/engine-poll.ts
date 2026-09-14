import type { EngineId } from '../contracts/engine.js';
import type { UsageRecord } from '../contracts/step.js';
import type { BundledPromptEntry } from '@geotrack/config';

export type EnginePollResponse = {
  promptId: string;
  engineId: EngineId;
  repeatIndex: number;
  responseText: string;
  sources: { url: string; title?: string }[];
  fromCache: boolean;
  usage: UsageRecord;
};

export type EnginePollOutput = {
  responses: EnginePollResponse[];
  partialEngines: EngineId[];
  hardCeilingHit: boolean;
};

export type EnginePollInput = {
  prompts: BundledPromptEntry[];
  categoryId: string;
  locale: string;
  promptSetVersion: number;
  promptRepeats: number;
};

export { BundledPromptEntry };
