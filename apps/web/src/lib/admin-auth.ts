import { createHash } from 'crypto';

export const ADMIN_COOKIE = 'gt_admin_session';

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function getExpectedHash(): string | null {
  const secret = process.env['ADMIN_SECRET'];
  if (!secret) return null;
  return hashSecret(secret);
}

export function isValidSession(cookieValue: string | undefined): boolean {
  const expected = getExpectedHash();
  if (!expected || !cookieValue) return false;
  return cookieValue === expected;
}
