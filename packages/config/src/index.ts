import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { AuditProfileSchema, AuditProfilesFileSchema } from './schemas/audit-profile.js';
import { EngineRegistryFileSchema } from './schemas/engine-registry.js';
import { ProviderPricesFileSchema } from './schemas/provider-prices.js';
import { TaxonomySchema } from './schemas/taxonomy.js';
import { PromptSetSchema } from './schemas/prompt-set.js';
import type { AuditProfile, AuditProfileId } from './schemas/audit-profile.js';
import type { EngineRegistryEntry } from './schemas/engine-registry.js';
import type { ModelPrice } from './schemas/provider-prices.js';
import type { CategoryEntry } from './schemas/taxonomy.js';
import type { PromptSet, Locale } from './schemas/prompt-set.js';

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
export { EngineRegistryEntrySchema, EngineRegistryFileSchema } from './schemas/engine-registry.js';
export { ModelPriceSchema, ProviderPricesFileSchema } from './schemas/provider-prices.js';
