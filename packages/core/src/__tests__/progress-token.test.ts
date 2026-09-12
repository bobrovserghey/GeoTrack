import { describe, it, expect } from 'vitest';
import { generateProgressToken, hashProgressToken } from '../progress-token.js';

describe('generateProgressToken', () => {
  it('returns a token and a hash', () => {
    const { token, hash } = generateProgressToken();
    expect(typeof token).toBe('string');
    expect(typeof hash).toBe('string');
  });

  it('token is URL-safe (no +, /, =)', () => {
    for (let i = 0; i < 20; i++) {
      const { token } = generateProgressToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('token has at least 40 characters (32 bytes base64url)', () => {
    const { token } = generateProgressToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it('hash is 64-character hex string', () => {
    const { hash } = generateProgressToken();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('two calls produce different tokens', () => {
    const a = generateProgressToken();
    const b = generateProgressToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).not.toBe(b.hash);
  });

  it('hash in result matches hashProgressToken(token)', () => {
    const { token, hash } = generateProgressToken();
    expect(hashProgressToken(token)).toBe(hash);
  });
});

describe('hashProgressToken', () => {
  it('is deterministic — same input gives same output', () => {
    const token = 'test-token-abc123';
    expect(hashProgressToken(token)).toBe(hashProgressToken(token));
  });

  it('different tokens produce different hashes', () => {
    expect(hashProgressToken('token-a')).not.toBe(hashProgressToken('token-b'));
  });

  it('output is 64-char lowercase hex', () => {
    const hash = hashProgressToken('any-token');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
