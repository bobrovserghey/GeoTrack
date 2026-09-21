/**
 * Eval harness for brand mention detection (T-31).
 *
 * Reads fixtures/golden/mentions/set-v1.json, runs each example through
 * detectBrandMention (deterministic, no API key), and reports F-measure.
 * Exits with code 1 if F-measure < THRESHOLD.
 *
 * Inlines detectBrandMention so this script runs standalone with
 * `node --experimental-strip-types`.
 *
 * Usage: node --experimental-strip-types apps/worker/src/evals/mentions.eval.ts
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── config ─────────────────────────────────────────────────────────────────────

const THRESHOLD = 0.90;

// ── inlined detection logic (mirror of apps/worker/src/steps/extract-mentions.ts) ──

function buildMatcher(terms: string[]): RegExp {
  const nonEmpty = terms.filter(Boolean);
  if (nonEmpty.length === 0) throw new RangeError('no terms');
  const escaped = nonEmpty.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
}

function detectBrandMention(text: string, brandName: string, variants: string[]): boolean {
  const terms = [brandName, ...variants].filter(Boolean);
  if (terms.length === 0 || !text) return false;
  try {
    return buildMatcher(terms).test(text);
  } catch {
    return false;
  }
}

// ── load golden set ────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

type GoldenExample = {
  id: string;
  responseText: string;
  label: boolean;
};

type GoldenSet = {
  brandName: string;
  brandVariants: string[];
  examples: GoldenExample[];
};

const GOLDEN_PATH = resolve(__dirname, '../../../../fixtures/golden/mentions/set-v1.json');
const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf-8')) as GoldenSet;

// ── main ───────────────────────────────────────────────────────────────────────

function main(): void {
  const { brandName, brandVariants, examples } = golden;

  if (examples.length === 0) {
    console.error('FAIL: golden set is empty');
    process.exit(1);
  }

  let tp = 0;
  let fp = 0;
  let fn = 0;
  const errors: { id: string; label: boolean; predicted: boolean }[] = [];

  console.log(`Running eval on ${examples.length} examples...`);

  for (const example of examples) {
    const predicted = detectBrandMention(example.responseText, brandName, brandVariants);
    if (predicted && example.label) {
      tp++;
    } else if (predicted && !example.label) {
      fp++;
      errors.push({ id: example.id, label: example.label, predicted });
    } else if (!predicted && example.label) {
      fn++;
      errors.push({ id: example.id, label: example.label, predicted });
    }
  }

  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const fMeasure = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  console.log(`\nTP=${tp} FP=${fp} FN=${fn}`);
  console.log(`Precision: ${(precision * 100).toFixed(1)}%`);
  console.log(`Recall:    ${(recall * 100).toFixed(1)}%`);
  console.log(`F-measure: ${(fMeasure * 100).toFixed(1)}%`);
  console.log(`Threshold: ${(THRESHOLD * 100).toFixed(0)}%`);

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) {
      console.log(`  [${e.id}] label=${e.label} predicted=${e.predicted}`);
    }
  }

  if (fMeasure < THRESHOLD) {
    console.error(`\nFAIL: F-measure ${(fMeasure * 100).toFixed(1)}% < threshold ${(THRESHOLD * 100).toFixed(0)}%`);
    process.exit(1);
  } else {
    console.log(`\nPASS`);
  }
}

main();
