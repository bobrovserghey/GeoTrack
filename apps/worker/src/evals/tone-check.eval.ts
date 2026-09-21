/**
 * Eval harness for A6 tone classification (T-31).
 *
 * Reads fixtures/golden/tone/set-v1.json, runs each example through the
 * model, compares prediction with the human label, and reports accuracy.
 * Exits with code 1 if accuracy < THRESHOLD.
 *
 * Requires GEMINI_API_KEY env var. Skips (exit 0) when the key is absent.
 *
 * Usage: node --experimental-strip-types apps/worker/src/evals/tone-check.eval.ts
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseTone, buildPrompt } from '../steps/tone-check.js';
import { GeminiModelAdapter } from '@geotrack/core';
import type { PassportOutput } from '@geotrack/core';

// ── config ─────────────────────────────────────────────────────────────────────

const THRESHOLD = 0.80;

// ── load golden set ────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

type ToneLabel = 'positive' | 'neutral' | 'negative';

type GoldenExample = {
  id: string;
  responseText: string;
  label: ToneLabel;
};

type GoldenSet = {
  passport: PassportOutput;
  examples: GoldenExample[];
};

const GOLDEN_PATH = resolve(__dirname, '../../../../fixtures/golden/tone/set-v1.json');
const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf-8')) as GoldenSet;

// ── main ───────────────────────────────────────────────────────────────────────

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
  const passport = golden.passport;

  let correct = 0;
  const disagreements: { id: string; label: string; predicted: string; response: string }[] = [];

  console.log(`Running eval on ${examples.length} examples...`);

  for (const example of examples) {
    const prompt = buildPrompt(passport, example.responseText);
    try {
      const answer = await model.generate(prompt, { jsonMode: true, timeoutMs: 15_000 });
      const predicted = parseTone(answer.text);
      if (predicted === example.label) {
        correct++;
      } else {
        disagreements.push({
          id: example.id,
          label: example.label,
          predicted: predicted ?? '(null)',
          response: example.responseText.slice(0, 80),
        });
      }
    } catch (err) {
      console.error(`Error on ${example.id}: ${String(err)}`);
    }
  }

  const accuracy = correct / examples.length;
  console.log(`\nAccuracy: ${correct}/${examples.length} = ${(accuracy * 100).toFixed(1)}%`);
  console.log(`Threshold: ${(THRESHOLD * 100).toFixed(0)}%`);

  if (disagreements.length > 0) {
    console.log(`\nDisagreements (${disagreements.length}):`);
    for (const d of disagreements) {
      console.log(`  [${d.id}] label=${d.label} predicted=${d.predicted} — "${d.response}..."`);
    }
  }

  if (accuracy < THRESHOLD) {
    console.error(`\nFAIL: accuracy ${(accuracy * 100).toFixed(1)}% < threshold ${(THRESHOLD * 100).toFixed(0)}%`);
    process.exit(1);
  } else {
    console.log(`\nPASS`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
