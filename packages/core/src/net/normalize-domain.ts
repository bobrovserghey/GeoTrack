const WRAPPER_SUBDOMAINS = new Set(['www', 'www2', 'm', 'mobile']);

export function normalizeDomain(input: string): string {
  let s = input.trim().toLowerCase();

  // Extract hostname from URL
  if (s.includes('://')) {
    try { s = new URL(s).hostname; } catch { /* fall through */ }
  } else if (s.startsWith('//')) {
    try { s = new URL('https:' + s).hostname; } catch { /* fall through */ }
  }

  // Strip port
  s = s.replace(/:\d+$/, '');

  // Strip trailing FQDN dot
  s = s.replace(/\.$/, '');

  // Strip wrapper subdomain (only if result still has at least two labels)
  const parts = s.split('.');
  if (parts.length > 2 && WRAPPER_SUBDOMAINS.has(parts[0]!)) {
    s = parts.slice(1).join('.');
  }

  return s;
}
