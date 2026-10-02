import { describe, it, expect } from 'vitest';
import { validateWorkerEnv } from '../env.js';

const COMPLETE = { INNGEST_SIGNING_KEY: 'signkey-test', DATABASE_URL: 'postgres://u:p@h/db' };

describe('validateWorkerEnv', () => {
  it('does not throw when every required variable is present', () => {
    expect(() => validateWorkerEnv(COMPLETE)).not.toThrow();
  });

  it.each(Object.keys(COMPLETE))('throws naming the missing variable %s', (name) => {
    const env: Record<string, string> = { ...COMPLETE };
    delete env[name];
    expect(() => validateWorkerEnv(env)).toThrowError(new RegExp(name));
  });

  it('treats an empty string the same as missing', () => {
    expect(() => validateWorkerEnv({ ...COMPLETE, INNGEST_SIGNING_KEY: '' })).toThrowError(/INNGEST_SIGNING_KEY/);
    expect(() => validateWorkerEnv({ ...COMPLETE, DATABASE_URL: '' })).toThrowError(/DATABASE_URL/);
  });

  it('reports every missing variable at once', () => {
    expect(() => validateWorkerEnv({})).toThrowError(/INNGEST_SIGNING_KEY.*DATABASE_URL/);
  });
});
