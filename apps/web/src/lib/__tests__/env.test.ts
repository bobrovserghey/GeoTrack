import { describe, it, expect } from 'vitest';
import { validateWebEnv, REQUIRED_WEB_ENV } from '../env.js';

// Built from REQUIRED_WEB_ENV itself, not a hand-kept duplicate list: a 4th
// copy here would be exactly the kind of drift env-list-sync.test.ts exists
// to catch for the other three. Adding a variable to env.ts is enough to
// extend coverage below automatically.
const COMPLETE_ENV: Record<string, string | undefined> = Object.fromEntries(
  REQUIRED_WEB_ENV.map((name) => [name, `test-value-${name}`]),
);

describe('validateWebEnv', () => {
  it('does not throw when every required variable is present', () => {
    expect(() => validateWebEnv(COMPLETE_ENV)).not.toThrow();
  });

  it('throws naming every missing variable, not just the first', () => {
    const env = { ...COMPLETE_ENV };
    const [first, second, third] = REQUIRED_WEB_ENV;
    delete env[first];
    delete env[second];
    delete env[third];

    let message = '';
    try {
      validateWebEnv(env);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain(first);
    expect(message).toContain(second);
    expect(message).toContain(third);
  });

  it('treats an empty string the same as missing', () => {
    const [first] = REQUIRED_WEB_ENV;
    const env = { ...COMPLETE_ENV, [first]: '' };
    expect(() => validateWebEnv(env)).toThrowError(new RegExp(first));
  });

  it.each(REQUIRED_WEB_ENV)('reports %s as missing on its own', (name) => {
    const env = { ...COMPLETE_ENV };
    delete env[name];
    expect(() => validateWebEnv(env)).toThrowError(new RegExp(name));
  });
});
