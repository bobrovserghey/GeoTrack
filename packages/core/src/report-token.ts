import { randomBytes, createHash } from 'crypto';

export function generateReportToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashReportToken(token) };
}

export function hashReportToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
