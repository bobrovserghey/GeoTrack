import { describe, it, expect } from 'vitest';
import { getTaxonomy, getCategoryById } from '../index.js';
import { TaxonomySchema } from '../schemas/taxonomy.js';

describe('taxonomy.v1.json', () => {
  it('contains exactly 200 entries', () => {
    expect(getTaxonomy()).toHaveLength(200);
  });

  it('all ids are unique', () => {
    const ids = getTaxonomy().map((c) => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('all ids match kebab-case pattern', () => {
    const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    for (const entry of getTaxonomy()) {
      expect(entry.id, `id "${entry.id}" is not kebab-case`).toMatch(kebab);
    }
  });

  it('all names are non-empty and within 120 chars', () => {
    for (const entry of getTaxonomy()) {
      expect(entry.name.length, `name for "${entry.id}" is empty`).toBeGreaterThan(0);
      expect(entry.name.length, `name for "${entry.id}" exceeds 120 chars`).toBeLessThanOrEqual(120);
    }
  });

  it('all topPlayers arrays have 3–10 non-empty entries', () => {
    for (const entry of getTaxonomy()) {
      expect(
        entry.topPlayers.length,
        `"${entry.id}" has ${entry.topPlayers.length} topPlayers`,
      ).toBeGreaterThanOrEqual(3);
      expect(
        entry.topPlayers.length,
        `"${entry.id}" has ${entry.topPlayers.length} topPlayers`,
      ).toBeLessThanOrEqual(10);
      for (const player of entry.topPlayers) {
        expect(player.length, `empty player name in "${entry.id}"`).toBeGreaterThan(0);
      }
    }
  });

  it('Zod schema parses the full taxonomy without errors', () => {
    const raw = getTaxonomy();
    expect(() => TaxonomySchema.parse(raw)).not.toThrow();
  });

  it('getCategoryById returns the matching entry', () => {
    const entry = getCategoryById('crm-software');
    expect(entry).toBeDefined();
    expect(entry!.id).toBe('crm-software');
    expect(entry!.name).toBe('CRM Software');
  });

  it('getCategoryById returns undefined for unknown id', () => {
    expect(getCategoryById('nonexistent-category-xyz')).toBeUndefined();
  });
});
