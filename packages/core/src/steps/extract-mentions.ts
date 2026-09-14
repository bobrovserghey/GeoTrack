import type { EngineId } from '../contracts/engine.js';
import type { EnginePollResponse } from './engine-poll.js';

export type EngineResponseFacts = {
  promptId: string;
  engineId: EngineId;
  repeatIndex: number;
  brandMentioned: boolean;
  brandListPosition: number | null;
  normalizedPositionScore: number | null;
  competitorMentions: { name: string; count: number }[];
  citedDomains: string[];
};

export type ExtractMentionsInput = {
  responses: EnginePollResponse[];
  brandName: string;
  brandVariants: string[];
  competitors: string[];
};

export type ExtractMentionsOutput = {
  facts: EngineResponseFacts[];
};

export { EnginePollResponse };
