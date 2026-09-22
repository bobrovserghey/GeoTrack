/**
 * Eval harness for C2 content structure analysis (T-33).
 *
 * Reads fixtures/golden/content-structure/set-v1.json, runs each example
 * through the LLM (batched into a single call), and reports macro-F1 across
 * the three binary labels: hasAnswerFirstParagraph, hasQuestionHeaders, hasQABlocks.
 * Exits with code 1 if any label's F1 < THRESHOLD.
 *
 * Requires GEMINI_API_KEY env var. Skips (exit 0) when the key is absent.
 *
 * Usage: node --experimental-strip-types apps/worker/src/evals/content-structure.eval.ts
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildStructurePrompt, parseStructureResults } from '../steps/content-check.js';
import { GeminiModelAdapter } from '@geotrack/core';

// ── config ────────────────────────────────────────────────────────────────────

const THRESHOLD = 0.82;
const BATCH_SIZE = 10; // pages per LLM call

// ── types ─────────────────────────────────────────────────────────────────────

type StructureLabel = {
  hasAnswerFirstParagraph: boolean;
  hasQuestionHeaders: boolean;
  hasQABlocks: boolean;
};

type GoldenExample = {
  id: string;
  url: string;
  firstHeading: string;
  firstParagraph: string;
  contentSample: string;
  label: StructureLabel;
};

type GoldenSet = { version: number; examples: GoldenExample[] };

// ── load golden set ───────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = resolve(
  __dirname,
  '../../../../fixtures/golden/content-structure/set-v1.json',
);
const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf-8')) as GoldenSet;

// ── F1 computation ────────────────────────────────────────────────────────────

type BinaryMetrics = { tp: number; fp: number; fn: number };

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

  const metrics: Record<keyof StructureLabel, BinaryMetrics> = {
    hasAnswerFirstParagraph: { tp: 0, fp: 0, fn: 0 },
    hasQuestionHeaders: { tp: 0, fp: 0, fn: 0 },
    hasQABlocks: { tp: 0, fp: 0, fn: 0 },
  };

  const labelKeys: (keyof StructureLabel)[] = [
    'hasAnswerFirstParagraph',
    'hasQuestionHeaders',
    'hasQABlocks',
  ];

  const disagreements: { id: string; key: string; label: boolean; predicted: boolean }[] = [];

  console.log(`Running content-structure eval on ${examples.length} examples...`);

  // Process in batches
  for (let i = 0; i < examples.length; i += BATCH_SIZE) {
    const batch = examples.slice(i, i + BATCH_SIZE);
    const pages = batch.map((e) => ({
      url: e.url,
      text: e.contentSample,
      firstHeading: e.firstHeading,
      firstParagraph: e.firstParagraph,
    }));

    const prompt = buildStructurePrompt(pages);

    try {
      const answer = await model.generate(prompt, { jsonMode: true, timeoutMs: 30_000 });
      const results = parseStructureResults(answer.text, batch.map((e) => e.url));

      for (let j = 0; j < batch.length; j++) {
        const example = batch[j]!;
        const result = results[j]!;

        for (const key of labelKeys) {
          const predicted = result[key];
          const actual = example.label[key];

          if (actual && predicted) metrics[key].tp++;
          else if (!actual && predicted) metrics[key].fp++;
          else if (actual && !predicted) {
            metrics[key].fn++;
            disagreements.push({ id: example.id, key, label: actual, predicted });
          }
        }
      }
    } catch (err) {
      console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, err);
    }

    process.stdout.write(`  batch ${Math.min(i + BATCH_SIZE, examples.length)}/${examples.length}\r`);
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
    for (const d of disagreements.slice(0, 15)) {
      console.log(`  [${d.id}] ${d.key}: label=${d.label} predicted=${d.predicted}`);
    }
  }

  console.log(`\n${allPassed ? 'PASS' : 'FAIL'}: content-structure eval`);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
