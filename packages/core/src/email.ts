export function normalizeEmail(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const atIdx = trimmed.lastIndexOf('@');
  if (atIdx < 0) return trimmed;

  let local = trimmed.slice(0, atIdx);
  const domain = trimmed.slice(atIdx + 1);

  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.replace(/\./g, '').replace(/\+.*$/, '');
  }

  return `${local}@${domain}`;
}
