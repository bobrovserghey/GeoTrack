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
