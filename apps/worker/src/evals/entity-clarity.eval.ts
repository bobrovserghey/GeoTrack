/**
 * Eval harness for C5 entity clarity check (T-33).
 *
 * Reads fixtures/golden/entity-clarity/set-v1.json, runs each example through
 * the LLM, and reports macro-F1 across the three binary labels:
 * entityMentioned, categoryMentioned, targetAudienceMentioned.
 * Exits with code 1 if any label's F1 < THRESHOLD.
 *
 * Requires GEMINI_API_KEY env var. Skips (exit 0) when the key is absent.
 *
 * Usage: node --experimental-strip-types apps/worker/src/evals/entity-clarity.eval.ts
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildEntityClarityPrompt, parseEntityClarityResult } from '../steps/content-check.js';
import { GeminiModelAdapter } from '@geotrack/core';

// ── config ────────────────────────────────────────────────────────────────────

const THRESHOLD = 0.82;

// ── types ─────────────────────────────────────────────────────────────────────

type ClarityLabel = {
  entityMentioned: boolean;
  categoryMentioned: boolean;
  targetAudienceMentioned: boolean;
};

type GoldenExample = {
  id: string;
  entityName: string;
  categoryLabel: string;
  text: string;
  label: ClarityLabel;
};

type GoldenSet = { version: number; examples: GoldenExample[] };

// ── load golden set ───────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = resolve(
  __dirname,
  '../../../../fixtures/golden/entity-clarity/set-v1.json',
);
const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf-8')) as GoldenSet;

// ── F1 computation ────────────────────────────────────────────────────────────

type BinaryMetrics = { tp: number; fp: number; fn: number; tn: number };

function f1(m: BinaryMetrics): number {
  const precision = m.tp + m.fp > 0 ? m.tp / (m.tp + m.fp) : 0;
  const recall = m.tp + m.fn > 0 ? m.tp / (m.tp + m.fn) : 0;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    console.log('SKIP: GEMINI_API_KEY not set');
    process.exit(0);
  }

  const model = new GeminiModelAdapter({ apiKey });
  const examples = golden.examples;
  if (examples.length === 0) {
    console.error('FAIL: golden set is empty');
    process.exit(1);
  }

  const labelKeys: (keyof ClarityLabel)[] = [
    'entityMentioned',
    'categoryMentioned',
    'targetAudienceMentioned',
  ];

  const metrics: Record<keyof ClarityLabel, BinaryMetrics> = {
    entityMentioned: { tp: 0, fp: 0, fn: 0, tn: 0 },
    categoryMentioned: { tp: 0, fp: 0, fn: 0, tn: 0 },
    targetAudienceMentioned: { tp: 0, fp: 0, fn: 0, tn: 0 },
  };

  const disagreements: { id: string; key: string; label: boolean; predicted: boolean }[] = [];

  console.log(`Running entity-clarity eval on ${examples.length} examples...`);

  for (let i = 0; i < examples.length; i++) {
    const example = examples[i]!;
    const prompt = buildEntityClarityPrompt(example.entityName, example.categoryLabel, example.text);

    try {
      const answer = await model.generate(prompt, { jsonMode: true, timeoutMs: 15_000 });
      const parsed = parseEntityClarityResult(answer.text);

      if (!parsed) {
        console.warn(`  [${example.id}] parse failure`);
        continue;
      }

      for (const key of labelKeys) {
        const predicted = parsed[key];
        const actual = example.label[key];

        if (actual && predicted) metrics[key].tp++;
        else if (!actual && predicted) metrics[key].fp++;
        else if (actual && !predicted) {
          metrics[key].fn++;
          disagreements.push({ id: example.id, key, label: actual, predicted });
        } else {
          metrics[key].tn++;
        }
      }
    } catch (err) {
      console.warn(`  [${example.id}] error:`, err);
    }

    process.stdout.write(`  ${i + 1}/${examples.length}\r`);
  }

  console.log('\n');
  let allPassed = true;

  for (const key of labelKeys) {
    const score = f1(metrics[key]);
    const passed = score >= THRESHOLD;
    console.log(`  ${key}: F1=${score.toFixed(3)} (threshold ${THRESHOLD}) — ${passed ? 'PASS' : 'FAIL'}`);
    if (!passed) allPassed = false;
  }

  if (disagreements.length > 0) {
    console.log('\nDisagreements (false negatives):');
    for (const d of disagreements.slice(0, 10)) {
      console.log(`  [${d.id}] ${d.key}: label=${d.label} predicted=${d.predicted}`);
    }
  }

  console.log(`\n${allPassed ? 'PASS' : 'FAIL'}: entity-clarity eval`);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
