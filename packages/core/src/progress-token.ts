import { randomBytes, createHash } from 'crypto';

export function generateProgressToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashProgressToken(token) };
}

export function hashProgressToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
