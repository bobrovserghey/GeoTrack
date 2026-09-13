#!/usr/bin/env node
/**
 * Generates canonical prompt sets for all 200 categories × 2 locales.
 * Output: packages/config/src/prompts/categories/<category-id>/<locale>.v1.json
 *
 * Run: pnpm prompts:generate-categories
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'src', 'prompts', 'categories');
const GENERATED_AT = new Date().toISOString().slice(0, 10);

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Taxonomy loader
// ---------------------------------------------------------------------------

interface CategoryEntry {
  id: string;
  name: string;
  topPlayers: string[];
}

const taxonomy: CategoryEntry[] = require('../src/taxonomy.v1.json') as CategoryEntry[];

// ---------------------------------------------------------------------------
// Helper: strip common generic suffixes to get the core topic phrase
// Used in problem-led templates: "Project Management Software" → "project management"
// ---------------------------------------------------------------------------

const STRIP_SUFFIXES = [
  'software', 'platform', 'system', 'tool', 'tools', 'service', 'services',
  'solution', 'solutions', 'app', 'application', 'applications',
];

function coreTopic(name: string): string {
  const words = name.toLowerCase().split(/\s+/);
  while (words.length > 1 && STRIP_SUFFIXES.includes(words[words.length - 1]!)) {
    words.pop();
  }
  return words.join(' ');
}

// ---------------------------------------------------------------------------
// Pick up to 5 top players for comparisons (min available)
// ---------------------------------------------------------------------------

function topFive(players: string[]): string[] {
  return players.slice(0, 5);
}

// Generate exactly 8 comparison pairs from available players.
// If fewer unique pairs exist, repeat with alternate phrasings.
function comparisonPairs(players: string[]): [string, string][] {
  const list = topFive(players);
  const pairs: [string, string][] = [];
  for (let i = 0; i < list.length && pairs.length < 8; i++) {
    for (let j = i + 1; j < list.length && pairs.length < 8; j++) {
      pairs.push([list[i]!, list[j]!]);
    }
  }
  // Pad with reversed pairs if needed
  let rev = 0;
  while (pairs.length < 8) {
    const base = pairs[rev % Math.min(pairs.length, 4)]!;
    pairs.push([base[1], base[0]]);
    rev++;
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// English templates
// ---------------------------------------------------------------------------

function buildEnPrompts(cat: CategoryEntry): { id: string; text: string; type: string }[] {
  const n = cat.name;                         // "Project Management Software"
  const topic = coreTopic(n);                 // "project management"
  const leader = cat.topPlayers[0]!;          // "Asana"
  const pairs = comparisonPairs(cat.topPlayers);

  const discovery = [
    `best ${n.toLowerCase()}`,
    `top ${n.toLowerCase()} tools`,
    `${n.toLowerCase()} comparison`,
    `what is ${n.toLowerCase()}`,
    `how to choose ${n.toLowerCase()}`,
    `${n.toLowerCase()} for small business`,
    `${n.toLowerCase()} for remote teams`,
    `${n.toLowerCase()} for startups`,
    `${n.toLowerCase()} features`,
    `${n.toLowerCase()} pricing`,
    `cloud-based ${n.toLowerCase()}`,
    `${n.toLowerCase()} reviews`,
    `enterprise ${n.toLowerCase()}`,
    `free ${n.toLowerCase()}`,
    `${n.toLowerCase()} 2025`,
    `recommended ${n.toLowerCase()}`,
  ];

  const problemLed = [
    `how to improve ${topic}`,
    `best tools for ${topic}`,
    `software to help with ${topic}`,
    `how to automate ${topic}`,
    `how to track ${topic}`,
    `how to organize ${topic} workflow`,
    `how to scale ${topic} operations`,
    `best way to handle ${topic}`,
    `what do companies use for ${topic}`,
    `how to streamline ${topic} processes`,
  ];

  const comparison = pairs.map(([a, b]) => `${a} vs ${b}`);

  const alternative = [
    `${leader} alternatives`,
    `best alternative to ${leader}`,
    `replace ${leader}`,
    `${leader} competitors`,
  ];

  const local = [
    `best ${n.toLowerCase()} for US companies`,
    `top ${topic} tools for English-speaking teams`,
  ];

  return [
    ...discovery.map((text, i) => ({ id: `discovery-${String(i + 1).padStart(2, '0')}`, text, type: 'discovery' })),
    ...problemLed.map((text, i) => ({ id: `problem-${String(i + 1).padStart(2, '0')}`, text, type: 'problem-led' })),
    ...comparison.map((text, i) => ({ id: `comparison-${String(i + 1).padStart(2, '0')}`, text, type: 'comparison' })),
    ...alternative.map((text, i) => ({ id: `alternative-${String(i + 1).padStart(2, '0')}`, text, type: 'alternative' })),
    ...local.map((text, i) => ({ id: `local-${String(i + 1).padStart(2, '0')}`, text, type: 'local' })),
  ];
}

// ---------------------------------------------------------------------------
// Romanian templates
// ---------------------------------------------------------------------------

function buildRoPrompts(cat: CategoryEntry): { id: string; text: string; type: string }[] {
  const n = cat.name;
  const topic = coreTopic(n);
  const leader = cat.topPlayers[0]!;
  const pairs = comparisonPairs(cat.topPlayers);

  const discovery = [
    `cel mai bun software de tip ${n.toLowerCase()}`,
    `top instrumente ${n.toLowerCase()}`,
    `comparație ${n.toLowerCase()}`,
    `ce este ${n.toLowerCase()}`,
    `cum să alegi ${n.toLowerCase()}`,
    `${n.toLowerCase()} pentru companii mici`,
    `${n.toLowerCase()} pentru echipe la distanță`,
    `${n.toLowerCase()} pentru startup-uri`,
    `funcționalități ${n.toLowerCase()}`,
    `prețuri ${n.toLowerCase()}`,
    `${n.toLowerCase()} în cloud`,
    `recenzii ${n.toLowerCase()}`,
    `soluție enterprise ${n.toLowerCase()}`,
    `${n.toLowerCase()} gratuit`,
    `${n.toLowerCase()} 2025`,
    `${n.toLowerCase()} recomandat`,
  ];

  const problemLed = [
    `cum să îmbunătățești ${topic}`,
    `cele mai bune instrumente pentru ${topic}`,
    `software care ajută cu ${topic}`,
    `cum să automatizezi ${topic}`,
    `cum să urmărești ${topic}`,
    `cum să organizezi fluxul de lucru ${topic}`,
    `cum să scalezi operațiunile de ${topic}`,
    `cel mai bun mod de a gestiona ${topic}`,
    `ce software folosesc companiile pentru ${topic}`,
    `cum să optimizezi procesele de ${topic}`,
  ];

  const comparison = pairs.map(([a, b]) => `${a} vs ${b}`);

  const alternative = [
    `alternative la ${leader}`,
    `cea mai bună alternativă la ${leader}`,
    `înlocuitor pentru ${leader}`,
    `concurenți ${leader}`,
  ];

  const local = [
    `cel mai bun ${n.toLowerCase()} pentru companii din România`,
    `instrumente ${topic} recomandate în română`,
  ];

  return [
    ...discovery.map((text, i) => ({ id: `discovery-${String(i + 1).padStart(2, '0')}`, text, type: 'discovery' })),
    ...problemLed.map((text, i) => ({ id: `problem-${String(i + 1).padStart(2, '0')}`, text, type: 'problem-led' })),
    ...comparison.map((text, i) => ({ id: `comparison-${String(i + 1).padStart(2, '0')}`, text, type: 'comparison' })),
    ...alternative.map((text, i) => ({ id: `alternative-${String(i + 1).padStart(2, '0')}`, text, type: 'alternative' })),
    ...local.map((text, i) => ({ id: `local-${String(i + 1).padStart(2, '0')}`, text, type: 'local' })),
  ];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let generated = 0;

for (const cat of taxonomy) {
  for (const [locale, builder] of [['en', buildEnPrompts], ['ro', buildRoPrompts]] as const) {
    const rawPrompts = builder(cat);

    if (rawPrompts.length !== 40) {
      throw new Error(`Expected 40 prompts for ${cat.id}/${locale}, got ${rawPrompts.length}`);
    }

    const prompts = rawPrompts.map((p, idx) => ({
      id: p.id,
      text: p.text,
      type: p.type,
      priority: idx + 1,
    }));

    const set = {
      categoryId: cat.id,
      locale,
      version: '1',
      generatedAt: GENERATED_AT,
      prompts,
    };

    const dir = join(OUT_DIR, cat.id);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${locale}.v1.json`);
    writeFileSync(file, JSON.stringify(set, null, 2) + '\n', 'utf8');
    generated++;
  }
}

console.log(`✓ Generated ${generated} prompt sets (${taxonomy.length} categories × 2 locales)`);
