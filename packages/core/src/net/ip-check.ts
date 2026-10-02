import { isIPv4, isIPv6 } from 'node:net';

function ipv4ToUint32(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc * 256 + parseInt(octet, 10)) >>> 0, 0);
}

function inCidr(ip: number, base: string, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ip & mask) === (ipv4ToUint32(base) & mask);
}

function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToUint32(ip);
  return (
    inCidr(n, '10.0.0.0', 8) ||       // RFC 1918
    inCidr(n, '172.16.0.0', 12) ||    // RFC 1918
    inCidr(n, '192.168.0.0', 16) ||   // RFC 1918
    inCidr(n, '127.0.0.0', 8) ||      // loopback
    inCidr(n, '169.254.0.0', 16) ||   // link-local + metadata 169.254.169.254
    inCidr(n, '100.64.0.0', 10) ||    // shared address space RFC 6598
    inCidr(n, '0.0.0.0', 8) ||        // "this" network
    inCidr(n, '224.0.0.0', 4) ||      // multicast
    inCidr(n, '240.0.0.0', 4)         // reserved
  );
}

// Expands any textual IPv6 form (`::` compression, embedded dotted IPv4,
// zone id) into its eight 16-bit groups. Returns null when it cannot be parsed.
function parseIpv6(ip: string): number[] | null {
  let text = ip.toLowerCase();
  const zone = text.indexOf('%');
  if (zone !== -1) text = text.slice(0, zone);

  const dotted = text.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) {
    const o = dotted[2].split('.').map(Number);
    if (o.some((n) => n > 255)) return null;
    text = `${dotted[1]}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }

  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string): number[] | null => {
    if (part === '') return [];
    const groups = part.split(':').map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
    return groups.some(Number.isNaN) ? null : groups;
  };
  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  if (!head || !tail) return null;

  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return null;
  return [...head, ...new Array<number>(missing).fill(0), ...tail];
}

function groupsToIpv4(hi: number, lo: number): string {
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
}

function isBlockedIpv6(ip: string): boolean {
  const g = parseIpv6(ip);
  if (!g) return true; // unparseable → block

  const [a, b, c, d, e, f, hi, lo] = g;
  const firstFiveZero = a === 0 && b === 0 && c === 0 && d === 0 && e === 0;

  // ::/96 — unspecified (::), loopback (::1) and the deprecated IPv4-compatible
  // form (::d.d.d.d). None of it is a legitimate public destination; `::` in
  // particular reaches the local host on Linux.
  if (firstFiveZero && f === 0) return true;

  // ::ffff:0:0/96 — IPv4-mapped: judged by the embedded IPv4 address.
  if (firstFiveZero && f === 0xffff) return isBlockedIpv4(groupsToIpv4(hi, lo));

  // 64:ff9b::/96 — NAT64: judged by the embedded IPv4 address (a NAT64
  // gateway would forward 64:ff9b::7f00:1 to 127.0.0.1).
  if (a === 0x64 && b === 0xff9b && c === 0 && d === 0 && e === 0 && f === 0) {
    return isBlockedIpv4(groupsToIpv4(hi, lo));
  }
  // 64:ff9b:1::/48 — local-use NAT64 prefix, not globally routable.
  if (a === 0x64 && b === 0xff9b && c === 1) return true;

  // 2002::/16 — 6to4: the embedded IPv4 sits in groups 1–2.
  if (a === 0x2002) return isBlockedIpv4(groupsToIpv4(b, c));

  // 2001::/32 — Teredo: embeds (obfuscated) server/client IPv4, never a plain
  // public host.
  if (a === 0x2001 && b === 0) return true;

  // fc00::/7 — unique local
  if ((a & 0xfe00) === 0xfc00) return true;
  // fe80::/10 — link-local; fec0::/10 — deprecated site-local
  if ((a & 0xffc0) === 0xfe80 || (a & 0xffc0) === 0xfec0) return true;
  // ff00::/8 — multicast
  if ((a & 0xff00) === 0xff00) return true;

  return false;
}

export function isBlockedIp(ip: string): boolean {
  if (isIPv4(ip)) return isBlockedIpv4(ip);
  if (isIPv6(ip)) return isBlockedIpv6(ip);
  return true; // unrecognised format → block
}
