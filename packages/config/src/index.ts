import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { AuditProfileSchema, AuditProfilesFileSchema } from './schemas/audit-profile.js';
import { AuditProfilesV2FileSchema } from './schemas/audit-profile-v2.js';
import type { AuditProfileV2 } from './schemas/audit-profile-v2.js';
import { EngineRegistryFileSchema } from './schemas/engine-registry.js';
import { ProviderPricesFileSchema } from './schemas/provider-prices.js';
import { TaxonomySchema } from './schemas/taxonomy.js';
import { PromptSetSchema } from './schemas/prompt-set.js';
import { MethodologySchema } from './schemas/methodology.js';
import type { AuditProfile, AuditProfileId } from './schemas/audit-profile.js';
import type { EngineRegistryEntry } from './schemas/engine-registry.js';
import type { ModelPrice } from './schemas/provider-prices.js';
import type { CategoryEntry } from './schemas/taxonomy.js';
import type { PromptSet, Locale } from './schemas/prompt-set.js';
import type { Methodology } from './schemas/methodology.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const require = createRequire(import.meta.url);

function loadProfilesFile() {
  const raw = require('./audit-profiles.v1.json');
  return AuditProfilesFileSchema.parse(raw);
}

function loadEnginesFile() {
  const raw = require('./engines.v1.json');
  return EngineRegistryFileSchema.parse(raw);
}

export function getAuditProfileV2(id: string): AuditProfileV2 {
  const raw = require('./audit-profiles.v2.json');
  // The file schema validates every profile via z.record(AuditProfileV2Schema),
  // so the looked-up entry is already a parsed AuditProfileV2.
  const file = AuditProfilesV2FileSchema.parse(raw);
  if (!Object.hasOwn(file.profiles, id)) {
    throw new Error(
      `Unknown audit profile v2: "${id}". Known: ${Object.keys(file.profiles).join(', ')}`,
    );
  }
  return file.profiles[id]!;
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

export function getMethodology(): Methodology {
  const raw = require('./methodology.v1.json');
  return MethodologySchema.parse(raw);
}

export function getProviderPrices(): Record<string, ModelPrice> {
  const raw = require('./provider-prices.v1.json');
  return ProviderPricesFileSchema.parse(raw).models;
}

export function getTaxonomy(): CategoryEntry[] {
  const raw = require('./taxonomy.v1.json');
  return TaxonomySchema.parse(raw);
}

export function getCategoryById(id: string): CategoryEntry | undefined {
  return getTaxonomy().find((c) => c.id === id);
}

export function getPromptSet(categoryId: string, locale: Locale): PromptSet {
  const file = join(__dirname, 'prompts', 'categories', categoryId, `${locale}.v1.json`);
  const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  return PromptSetSchema.parse(raw);
}

export type { AuditProfile, AuditProfileId };
export type { EngineRegistryEntry };
export type { ModelPrice };
export type { CategoryEntry };
export { CategoryEntrySchema, TaxonomySchema } from './schemas/taxonomy.js';
export type { PromptSet, PromptEntry, Locale, PromptType } from './schemas/prompt-set.js';
export { PromptSetSchema, PromptEntrySchema, LOCALES, PROMPT_TYPES } from './schemas/prompt-set.js';
export { AuditProfileSchema, AuditProfilesFileSchema };
export { AuditProfileV2Schema, AuditProfilesV2FileSchema } from './schemas/audit-profile-v2.js';
export type { AuditProfileV2, AuditProfileV2Id } from './schemas/audit-profile-v2.js';
export { generatePromptBundle } from './prompt-bundle.js';
export type { PromptBundleInput } from './prompt-bundle.js';
export { PromptBundleSchema, BundledPromptEntrySchema, PROFILE_IDS, PROFILE_QUOTAS, BUNDLED_PROMPT_TYPES } from './schemas/prompt-bundle.js';
export type { PromptBundle, BundledPromptEntry, ProfileId } from './schemas/prompt-bundle.js';
export { EngineRegistryEntrySchema, EngineRegistryFileSchema } from './schemas/engine-registry.js';
export { ModelPriceSchema, ProviderPricesFileSchema } from './schemas/provider-prices.js';
export { MethodologySchema } from './schemas/methodology.js';
export type { Methodology, BlockerConfig, PillarConfig, CriterionConfig, BandConfig, IntervalConfig, BasketConfig } from './schemas/methodology.js';
