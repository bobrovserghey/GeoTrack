import type { AuditProfile } from '@geotrack/config';

export type ArtifactRef = {
  key: string;
  bucket: string;
  sizeBytes: number;
  hash: string;
  mimeType: string;
};

export type UsageRecord = {
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
};

export type StepResultStatus = 'ok' | 'partial' | 'failed';

export type StepResult<T> = {
  status: StepResultStatus;
  data: T | null;
  artifacts: ArtifactRef[];
  usage: UsageRecord[];
  notes: string[];
};

export type Logger = {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
};

export type Budget = {
  softCeilingUsd: number;
  hardCeilingUsd: number;
  spentUsd: number;
  remainingSoftUsd: number;
  remainingHardUsd: number;
};

export type EmitEvent = (event: {
  eventType: string;
  payload: Record<string, unknown>;
}) => Promise<void>;

export type StepContext = {
  auditId: string;
  idempotencyKey: string;
  profile: AuditProfile;
  budget: Budget;
  logger: Logger;
  emit: EmitEvent;
};

export type Step<I, O> = (input: I, ctx: StepContext) => Promise<StepResult<O>>;
