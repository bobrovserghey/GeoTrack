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

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  // loopback ::1
  if (lower === '::1') return true;

  // IPv4-mapped ::ffff:d.d.d.d
  const mappedDecimal = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mappedDecimal) return isBlockedIpv4(mappedDecimal[1]);

  // IPv4-mapped ::ffff:hhhh:hhhh (hex form)
  const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    const ipv4 = `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
    return isBlockedIpv4(ipv4);
  }

  // fc00::/7 — unique local (fc** or fd**)
  if (/^f[cd]/.test(lower)) return true;

  // fe80::/10 — link-local (fe80–febf)
  const fe = lower.match(/^fe([0-9a-f]{2})/);
  if (fe) {
    const byte = parseInt(fe[1], 16);
    if (byte >= 0x80 && byte <= 0xbf) return true;
  }

  return false;
}

export function isBlockedIp(ip: string): boolean {
  if (isIPv4(ip)) return isBlockedIpv4(ip);
  if (isIPv6(ip)) return isBlockedIpv6(ip);
  return true; // unrecognised format → block
}
