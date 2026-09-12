import { createRequire } from 'module';
import { AuditProfileSchema, AuditProfilesFileSchema } from './schemas/audit-profile.js';
import { EngineRegistryFileSchema } from './schemas/engine-registry.js';
import { ProviderPricesFileSchema } from './schemas/provider-prices.js';
import type { AuditProfile, AuditProfileId } from './schemas/audit-profile.js';
import type { EngineRegistryEntry } from './schemas/engine-registry.js';
import type { ModelPrice } from './schemas/provider-prices.js';

const require = createRequire(import.meta.url);

function loadProfilesFile() {
  const raw = require('./audit-profiles.v1.json');
  return AuditProfilesFileSchema.parse(raw);
}

function loadEnginesFile() {
  const raw = require('./engines.v1.json');
  return EngineRegistryFileSchema.parse(raw);
}

export function getAuditProfile(id: AuditProfileId | string): AuditProfile {
  const file = loadProfilesFile();
  const profile = file.profiles[id];
  if (!profile) {
    throw new Error(
      `Unknown audit profile: "${id}". Known: ${Object.keys(file.profiles).join(', ')}`,
    );
  }
  return AuditProfileSchema.parse(profile);
}

export function getEngineRegistry(): EngineRegistryEntry[] {
  const file = loadEnginesFile();
  return file.engines;
}

export function getProviderPrices(): Record<string, ModelPrice> {
  const raw = require('./provider-prices.v1.json');
  return ProviderPricesFileSchema.parse(raw).models;
}

export type { AuditProfile, AuditProfileId };
export type { EngineRegistryEntry };
export type { ModelPrice };
export { AuditProfileSchema, AuditProfilesFileSchema };
export { EngineRegistryEntrySchema, EngineRegistryFileSchema } from './schemas/engine-registry.js';
export { ModelPriceSchema, ProviderPricesFileSchema } from './schemas/provider-prices.js';
