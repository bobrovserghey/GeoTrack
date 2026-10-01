import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isValidServiceKey } from '../service-auth.js';

const ORIGINAL_ENV = process.env.AUDIT_SERVICE_KEY;

beforeEach(() => {
  process.env.AUDIT_SERVICE_KEY = 'correct-key';
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.AUDIT_SERVICE_KEY;
  } else {
    process.env.AUDIT_SERVICE_KEY = ORIGINAL_ENV;
  }
});

describe('isValidServiceKey', () => {
  it('accepts a matching x-service-key header', () => {
    const headers = new Headers({ 'x-service-key': 'correct-key' });
    expect(isValidServiceKey(headers)).toBe(true);
  });

  it('rejects a mismatched header value', () => {
    const headers = new Headers({ 'x-service-key': 'wrong-key' });
    expect(isValidServiceKey(headers)).toBe(false);
  });

  it('rejects a missing header', () => {
    const headers = new Headers();
    expect(isValidServiceKey(headers)).toBe(false);
  });

  it('rejects every request when AUDIT_SERVICE_KEY is unset, even an empty header', () => {
    delete process.env.AUDIT_SERVICE_KEY;
    const headers = new Headers({ 'x-service-key': '' });
    expect(isValidServiceKey(headers)).toBe(false);
  });
});
