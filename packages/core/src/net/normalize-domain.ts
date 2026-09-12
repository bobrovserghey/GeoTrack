const WRAPPER_SUBDOMAINS = new Set(['www', 'www2', 'm', 'mobile']);

// Known two-part TLDs that shouldn't be treated as registrable on their own.
// Minimal list for MVP; full PSL support can be added via tldts when T-26 is built.
const DOUBLE_TLDS = new Set([
  'co.uk', 'co.nz', 'co.za', 'co.jp', 'com.au', 'com.br', 'com.ar',
  'com.mx', 'com.tr', 'com.sg', 'net.au', 'org.uk', 'gov.uk',
]);

function toAsciiHostname(raw: string): string {
  // WHATWG URL parser normalises IDN to punycode and lowercases
  try {
    return new URL('https://' + raw).hostname;
  } catch {
    return raw.toLowerCase();
  }
}

export function normalizeDomain(input: string): string {
  let s = input.trim();

  // Extract hostname from URL (preserves IDN handling by URL parser)
  if (s.includes('://')) {
    try { s = new URL(s).hostname; } catch { s = s.toLowerCase(); }
  } else if (s.startsWith('//')) {
    try { s = new URL('https:' + s).hostname; } catch { s = s.toLowerCase(); }
  } else {
    // Plain hostname or IDN domain — pass through URL parser for punycode normalisation
    s = toAsciiHostname(s);
  }

  // Strip port (shouldn't appear after URL parse, but handle bare host:port input)
  s = s.replace(/:\d+$/, '');

  // Strip trailing FQDN dot
  s = s.replace(/\.$/, '');

  // Strip wrapper subdomain — only when the remainder is still a valid multi-label domain
  const parts = s.split('.');
  if (parts.length > 2 && WRAPPER_SUBDOMAINS.has(parts[0]!)) {
    const remainder = parts.slice(1).join('.');
    // Don't over-strip: if remainder is a known double TLD (e.g. co.uk), keep wrapper
    if (!DOUBLE_TLDS.has(remainder)) {
      s = remainder;
    }
  }

  return s;
}
