import { describe, it, expect } from 'vitest';
import { generateReportToken, hashReportToken } from '../report-token.js';

describe('generateReportToken', () => {
  it('returns a token and a hash', () => {
    const { token, hash } = generateReportToken();
    expect(typeof token).toBe('string');
    expect(typeof hash).toBe('string');
  });

  it('token is URL-safe (no +, /, =)', () => {
    for (let i = 0; i < 20; i++) {
      const { token } = generateReportToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('token has at least 40 characters (32 bytes base64url)', () => {
    const { token } = generateReportToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it('hash is 64-character hex string', () => {
    const { hash } = generateReportToken();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('two calls produce different tokens', () => {
    const a = generateReportToken();
    const b = generateReportToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).not.toBe(b.hash);
  });

  it('hash in result matches hashReportToken(token)', () => {
    const { token, hash } = generateReportToken();
    expect(hashReportToken(token)).toBe(hash);
  });
});

describe('hashReportToken', () => {
  it('is deterministic — same input gives same output', () => {
    const token = 'test-token-abc123';
    expect(hashReportToken(token)).toBe(hashReportToken(token));
  });

  it('different tokens produce different hashes', () => {
    expect(hashReportToken('token-a')).not.toBe(hashReportToken('token-b'));
  });

  it('output is 64-char lowercase hex', () => {
    const hash = hashReportToken('any-token');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
