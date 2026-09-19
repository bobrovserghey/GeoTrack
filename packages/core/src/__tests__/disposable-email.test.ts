import { describe, it, expect, vi } from 'vitest';
import { isDisposableEmail, hasMxRecord } from '../disposable-email.js';

describe('isDisposableEmail', () => {
  it('identifies mailinator.com as disposable', () => {
    expect(isDisposableEmail('mailinator.com')).toBe(true);
  });

  it('identifies guerrillamail.com as disposable', () => {
    expect(isDisposableEmail('guerrillamail.com')).toBe(true);
  });

  it('identifies temp-mail.org as disposable', () => {
    expect(isDisposableEmail('temp-mail.org')).toBe(true);
  });

  it('identifies yopmail.com as disposable', () => {
    expect(isDisposableEmail('yopmail.com')).toBe(true);
  });

  it('does not flag gmail.com as disposable', () => {
    expect(isDisposableEmail('gmail.com')).toBe(false);
  });

  it('does not flag outlook.com as disposable', () => {
    expect(isDisposableEmail('outlook.com')).toBe(false);
  });

  it('does not flag yahoo.com as disposable', () => {
    expect(isDisposableEmail('yahoo.com')).toBe(false);
  });

  it('does not flag a typical business domain as disposable', () => {
    expect(isDisposableEmail('acmecorp.com')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isDisposableEmail('MAILINATOR.COM')).toBe(true);
  });
});

describe('hasMxRecord', () => {
  it('returns true when resolver returns MX records', async () => {
    const resolveMx = vi.fn(async () => ['mail.example.com']);
    const result = await hasMxRecord('example.com', resolveMx);
    expect(result).toBe(true);
    expect(resolveMx).toHaveBeenCalledWith('example.com');
  });

  it('returns false when resolver returns empty array', async () => {
    const resolveMx = vi.fn(async () => []);
    const result = await hasMxRecord('no-mx.example', resolveMx);
    expect(result).toBe(false);
  });

  it('returns false when resolver throws (domain not found)', async () => {
    const resolveMx = vi.fn(async () => { throw new Error('ENOTFOUND'); });
    const result = await hasMxRecord('nonexistent.invalid', resolveMx);
    expect(result).toBe(false);
  });

  it('returns true for gmail.com (has MX)', async () => {
    const resolveMx = vi.fn(async () => ['gmail-smtp-in.l.google.com']);
    const result = await hasMxRecord('gmail.com', resolveMx);
    expect(result).toBe(true);
  });
});
