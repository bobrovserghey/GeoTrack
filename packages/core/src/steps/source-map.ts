import type { EngineId } from '../contracts/engine.js';

export type SourceMapEntry = {
  domain: string;
  citedCount: number;
  urls: string[];
  promptIds: string[];
  engineIds: EngineId[];
  isClientDomain: boolean;
  isCompetitorDomain: boolean;
};

export type SourceMapOutput = {
  entries: SourceMapEntry[];
  clientCitedCount: number;
  totalResponses: number;
};
