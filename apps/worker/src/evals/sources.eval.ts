/**
 * Eval harness for domain normalization (T-31).
 *
 * Reads fixtures/golden/sources/set-v1.json, runs each example through
 * normalizeDomain (deterministic, no API key), and reports accuracy.
 * Exits with code 1 if accuracy < THRESHOLD.
 *
 * Inlines normalizeDomain so this script runs standalone with
 * `node --experimental-strip-types`.
 *
 * Usage: node --experimental-strip-types apps/worker/src/evals/sources.eval.ts
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── config ─────────────────────────────────────────────────────────────────────

const THRESHOLD = 0.95;

// ── inlined normalization logic (mirror of packages/core/src/net/normalize-domain.ts) ──

const WRAPPER_SUBDOMAINS = new Set(['www', 'www2', 'm', 'mobile']);

const DOUBLE_TLDS = new Set([
  'co.uk', 'co.nz', 'co.za', 'co.jp', 'com.au', 'com.br', 'com.ar',
  'com.mx', 'com.tr', 'com.sg', 'net.au', 'org.uk', 'gov.uk',
]);

function toAsciiHostname(raw: string): string {
  try {
    return new URL('https://' + raw).hostname;
  } catch {
    return raw.toLowerCase();
  }
}

function normalizeDomain(input: string): string {
  let s = input.trim();

  if (s.includes('://')) {
    try { s = new URL(s).hostname; } catch { s = s.toLowerCase(); }
  } else if (s.startsWith('//')) {
    try { s = new URL('https:' + s).hostname; } catch { s = s.toLowerCase(); }
  } else {
    s = toAsciiHostname(s);
  }

  s = s.replace(/:\d+$/, '');
  s = s.replace(/\.$/, '');

  const parts = s.split('.');
  if (parts.length > 2 && WRAPPER_SUBDOMAINS.has(parts[0]!)) {
    const remainder = parts.slice(1).join('.');
    if (!DOUBLE_TLDS.has(remainder)) {
      s = remainder;
    }
  }

  return s;
}

// ── load golden set ────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

type GoldenExample = {
  id: string;
  sourceUrl: string;
  expectedDomain: string;
};

type GoldenSet = {
  examples: GoldenExample[];
};

const GOLDEN_PATH = resolve(__dirname, '../../../../fixtures/golden/sources/set-v1.json');
const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf-8')) as GoldenSet;

// ── main ───────────────────────────────────────────────────────────────────────

function main(): void {
  const { examples } = golden;

  if (examples.length === 0) {
    console.error('FAIL: golden set is empty');
    process.exit(1);
  }

  let correct = 0;
  const errors: { id: string; sourceUrl: string; expected: string; actual: string }[] = [];

  console.log(`Running eval on ${examples.length} examples...`);

  for (const example of examples) {
    const actual = normalizeDomain(example.sourceUrl);
    if (actual === example.expectedDomain) {
      correct++;
    } else {
      errors.push({
        id: example.id,
        sourceUrl: example.sourceUrl,
        expected: example.expectedDomain,
        actual,
      });
    }
  }

  const accuracy = correct / examples.length;
  console.log(`\nAccuracy: ${correct}/${examples.length} = ${(accuracy * 100).toFixed(1)}%`);
  console.log(`Threshold: ${(THRESHOLD * 100).toFixed(0)}%`);

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) {
      console.log(`  [${e.id}] "${e.sourceUrl}" → got "${e.actual}" expected "${e.expected}"`);
    }
  }

  if (accuracy < THRESHOLD) {
    console.error(`\nFAIL: accuracy ${(accuracy * 100).toFixed(1)}% < threshold ${(THRESHOLD * 100).toFixed(0)}%`);
    process.exit(1);
  } else {
    console.log(`\nPASS`);
  }
}

main();
