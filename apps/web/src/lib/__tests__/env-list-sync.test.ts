import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { REQUIRED_WEB_ENV } from '../env.js';

// The list of required web env vars exists in three places that cannot import
// one another:
//   1. src/lib/env.ts            — the source of truth (runtime check)
//   2. scripts/check-env.mjs     — plain JS, runs under bare `node` before
//                                  `next build`, so it cannot import the .ts
//   3. .github/workflows/ci.yml  — dummy values so the `Build web` step runs
// Drift between them is silent and defeats the point of T-00: the build-time
// gate would stop covering a variable while every test still passes. These
// tests make drift a CI failure instead.

const WEB_ROOT = join(import.meta.dirname, '..', '..', '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');

function parseCheckEnvScript(): string[] {
  const source = readFileSync(join(WEB_ROOT, 'scripts', 'check-env.mjs'), 'utf8');
  const block = /const REQUIRED_WEB_ENV = \[([\s\S]*?)\];/.exec(source);
  if (!block) throw new Error('could not find REQUIRED_WEB_ENV in check-env.mjs');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function parseCiBuildWebEnv(): string[] {
  const source = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  const step = /- name: Build web\b[\s\S]*?\n {8}env:\n([\s\S]*?)(?=\n {6}- |\n*$)/.exec(source);
  if (!step) throw new Error('could not find the `Build web` step env block in ci.yml');
  return [...step[1].matchAll(/^ {10}([A-Z0-9_]+):/gm)].map((m) => m[1]);
}

describe('required web env list stays in sync across its three copies', () => {
  it('check-env.mjs lists exactly the same variables, in the same order', () => {
    expect(parseCheckEnvScript()).toEqual([...REQUIRED_WEB_ENV]);
  });

  it("ci.yml's `Build web` step supplies exactly the required variables", () => {
    // Order is irrelevant in a YAML mapping, so compare as sets.
    expect(parseCiBuildWebEnv().slice().sort()).toEqual([...REQUIRED_WEB_ENV].slice().sort());
  });

  it('parses a non-empty list from each copy (guards the regexes themselves)', () => {
    // Without this, a regex that silently matched nothing would make both
    // assertions above vacuously compare two empty arrays.
    expect(REQUIRED_WEB_ENV.length).toBeGreaterThan(0);
    expect(parseCheckEnvScript().length).toBe(REQUIRED_WEB_ENV.length);
    expect(parseCiBuildWebEnv().length).toBe(REQUIRED_WEB_ENV.length);
  });
});
