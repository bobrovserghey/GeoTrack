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

export const ADMIN_DEFAULT_PATH = '/admin';

/**
 * Narrows an attacker-controlled `?next=` value down to an app-internal path.
 *
 * The login form carries `next` through a hidden input and hands it to
 * redirect(), so an unvalidated value turns the sign-in page into an open
 * redirect (`?next=https://evil.example` → `Location: https://evil.example`).
 * Only a plain, single-slash-rooted path survives; everything else falls back
 * to the admin root.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return ADMIN_DEFAULT_PATH;

  // Browsers strip control characters and whitespace before parsing a URL, so
  // "/\t/evil.example" reaches the network as "//evil.example". Reject rather
  // than normalise — nothing legitimate needs them. Checked by code point
  // instead of a regex: a control-character class trips eslint's no-control-regex.
  for (const char of raw) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f) return ADMIN_DEFAULT_PATH;
  }

  // Backslashes are normalised to "/" by browsers, which makes "/\evil.example"
  // and "\\evil.example" host-relative.
  if (raw.includes('\\')) return ADMIN_DEFAULT_PATH;

  // Absolute URLs ("https://…", any "scheme:" form) and bare/relative values
  // never start with "/".
  if (!raw.startsWith('/')) return ADMIN_DEFAULT_PATH;

  // Protocol-relative "//host" — same origin-escape as an absolute URL.
  if (raw.startsWith('//')) return ADMIN_DEFAULT_PATH;

  return raw;
}
