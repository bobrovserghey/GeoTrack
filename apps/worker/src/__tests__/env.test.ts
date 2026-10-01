import { describe, it, expect } from 'vitest';
import { validateWorkerEnv } from '../env.js';

describe('validateWorkerEnv', () => {
  it('does not throw when every required variable is present', () => {
    expect(() => validateWorkerEnv({ INNGEST_SIGNING_KEY: 'signkey-test' })).not.toThrow();
  });

  it('throws naming the missing variable', () => {
    expect(() => validateWorkerEnv({})).toThrowError(/INNGEST_SIGNING_KEY/);
  });

  it('treats an empty string the same as missing', () => {
    expect(() => validateWorkerEnv({ INNGEST_SIGNING_KEY: '' })).toThrowError(/INNGEST_SIGNING_KEY/);
  });
});
