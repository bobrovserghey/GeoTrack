import { describe, it, expect } from 'vitest';
import { isBlockedIp } from '../net/ip-check.js';

describe('isBlockedIp — blocked ranges', () => {
  it('blocks 10.0.0.0/8', () => {
    expect(isBlockedIp('10.0.0.1')).toBe(true);
    expect(isBlockedIp('10.255.255.255')).toBe(true);
  });

  it('blocks 172.16.0.0/12', () => {
    expect(isBlockedIp('172.16.0.1')).toBe(true);
    expect(isBlockedIp('172.31.255.255')).toBe(true);
  });

  it('blocks 192.168.0.0/16', () => {
    expect(isBlockedIp('192.168.0.1')).toBe(true);
    expect(isBlockedIp('192.168.255.254')).toBe(true);
  });

  it('blocks 127.0.0.0/8 (loopback)', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true);
    expect(isBlockedIp('127.255.255.255')).toBe(true);
  });

  it('blocks 169.254.0.0/16 (link-local, includes metadata endpoint)', () => {
    expect(isBlockedIp('169.254.0.1')).toBe(true);
    expect(isBlockedIp('169.254.169.254')).toBe(true);
  });

  it('blocks 100.64.0.0/10 (shared address space)', () => {
    expect(isBlockedIp('100.64.0.1')).toBe(true);
    expect(isBlockedIp('100.127.255.255')).toBe(true);
  });

  it('blocks 0.0.0.0/8', () => {
    expect(isBlockedIp('0.0.0.1')).toBe(true);
    expect(isBlockedIp('0.255.255.255')).toBe(true);
  });

  it('blocks 224.0.0.0/4 (multicast)', () => {
    expect(isBlockedIp('224.0.0.1')).toBe(true);
    expect(isBlockedIp('239.255.255.255')).toBe(true);
  });

  it('blocks 240.0.0.0/4 (reserved)', () => {
    expect(isBlockedIp('240.0.0.1')).toBe(true);
    expect(isBlockedIp('255.255.255.255')).toBe(true);
  });

  it('blocks ::1 (IPv6 loopback)', () => {
    expect(isBlockedIp('::1')).toBe(true);
  });

  it('blocks fc00::/7 (IPv6 unique local)', () => {
    expect(isBlockedIp('fc00::1')).toBe(true);
    expect(isBlockedIp('fd00::1')).toBe(true);
    expect(isBlockedIp('fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff')).toBe(true);
  });

  it('blocks fe80::/10 (IPv6 link-local)', () => {
    expect(isBlockedIp('fe80::1')).toBe(true);
    expect(isBlockedIp('febf::1')).toBe(true);
  });

  it('blocks IPv4-mapped IPv6 (::ffff:192.168.x.x)', () => {
    expect(isBlockedIp('::ffff:192.168.1.1')).toBe(true);
    expect(isBlockedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedIp('::ffff:169.254.169.254')).toBe(true);
  });
});

describe('isBlockedIp — allowed ranges', () => {
  it('allows public IPv4', () => {
    expect(isBlockedIp('1.1.1.1')).toBe(false);
    expect(isBlockedIp('8.8.8.8')).toBe(false);
    expect(isBlockedIp('93.184.216.34')).toBe(false);
  });

  it('allows public IPv6', () => {
    expect(isBlockedIp('2001:db8::1')).toBe(false);
    expect(isBlockedIp('2606:4700:4700::1111')).toBe(false);
  });

  it('allows IPv4-mapped public IPv6', () => {
    expect(isBlockedIp('::ffff:1.1.1.1')).toBe(false);
    expect(isBlockedIp('::ffff:8.8.8.8')).toBe(false);
  });
});

describe('isBlockedIp — IPv6 forms that embed or alias an IPv4/loopback address', () => {
  it.each([
    ['::', 'unspecified address'],
    ['0:0:0:0:0:0:0:0', 'unspecified address, uncompressed'],
    ['::1', 'loopback'],
    ['0:0:0:0:0:0:0:1', 'loopback, uncompressed'],
    ['::127.0.0.1', 'IPv4-compatible loopback'],
    ['::7f00:1', 'IPv4-compatible loopback, hex'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['::ffff:7f00:1', 'IPv4-mapped loopback, hex'],
    ['::ffff:169.254.169.254', 'IPv4-mapped metadata endpoint'],
    ['64:ff9b::7f00:1', 'NAT64 loopback'],
    ['64:ff9b::127.0.0.1', 'NAT64 loopback, dotted'],
    ['64:ff9b::a9fe:a9fe', 'NAT64 metadata endpoint'],
    ['64:ff9b:1::1', 'local-use NAT64 prefix'],
    ['2002:7f00:1::', '6to4 loopback'],
    ['2002:a9fe:a9fe::1', '6to4 metadata endpoint'],
    ['2002:0a00:0001::', '6to4 10.0.0.1'],
    ['2001:0:4136:e378:8000:63bf:3fff:fdd2', 'Teredo'],
    ['fec0::1', 'deprecated site-local'],
    ['ff02::1', 'multicast'],
    ['fe80::1%eth0', 'link-local with zone id'],
    ['not-an-ip::zz', 'unparseable'],
  ])('blocks %s (%s)', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each([
    ['2606:4700:4700::1111', 'Cloudflare DNS'],
    ['2a00:1450:4001:81b::200e', 'Google'],
    ['::ffff:8.8.8.8', 'IPv4-mapped public address'],
    ['64:ff9b::808:808', 'NAT64 of a public address'],
    ['2002:808:808::', '6to4 of a public address'],
  ])('still allows %s (%s)', (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });
});

describe('isBlockedIp — additional special-purpose ranges', () => {
  it.each(['192.0.0.192', '192.0.0.1', '192.88.99.1', '198.18.0.1', '198.19.255.254'])('blocks %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it('blocks IPv4-translated (SIIT) loopback but not a public one', () => {
    expect(isBlockedIp('::ffff:0:7f00:1')).toBe(true);
    expect(isBlockedIp('::ffff:0:808:808')).toBe(false);
  });

  it('does not block public neighbours of the new ranges', () => {
    expect(isBlockedIp('198.20.0.1')).toBe(false);
    expect(isBlockedIp('192.1.0.1')).toBe(false);
  });
});
