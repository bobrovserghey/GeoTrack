import { describe, it, expect } from 'vitest';
import { normalizeDomain } from '../net/normalize-domain.js';

describe('normalizeDomain', () => {
  it('strips protocol and path from full URL', () => {
    expect(normalizeDomain('https://example.com/pricing?ref=1')).toBe('example.com');
  });

  it('lowercases the result', () => {
    expect(normalizeDomain('https://ACME.COM')).toBe('acme.com');
  });

  it('strips www. wrapper', () => {
    expect(normalizeDomain('https://www.example.com')).toBe('example.com');
  });

  it('strips www2. wrapper', () => {
    expect(normalizeDomain('www2.example.com')).toBe('example.com');
  });

  it('strips m. wrapper', () => {
    expect(normalizeDomain('m.example.com')).toBe('example.com');
  });

  it('strips mobile. wrapper', () => {
    expect(normalizeDomain('mobile.example.com')).toBe('example.com');
  });

  it('does not strip non-wrapper subdomain', () => {
    expect(normalizeDomain('blog.example.com')).toBe('blog.example.com');
  });

  it('does not strip wrapper when result would be single label', () => {
    expect(normalizeDomain('www.localhost')).toBe('www.localhost');
  });

  it('strips trailing FQDN dot', () => {
    expect(normalizeDomain('example.com.')).toBe('example.com');
  });

  it('strips port', () => {
    expect(normalizeDomain('example.com:8080')).toBe('example.com');
  });

  it('handles plain domain without protocol', () => {
    expect(normalizeDomain('example.com')).toBe('example.com');
  });

  it('handles // scheme-relative URL', () => {
    expect(normalizeDomain('//www.example.com/path')).toBe('example.com');
  });

  it('handles mixed case URL with www', () => {
    expect(normalizeDomain('HTTPS://WWW.Acme.Com/pricing')).toBe('acme.com');
  });

  // punycode / IDN normalisation
  it('normalises IDN domain to ASCII punycode', () => {
    // Node WHATWG URL converts non-ASCII to punycode
    expect(normalizeDomain('münchen.de')).toBe('xn--mnchen-3ya.de');
  });

  it('normalises IDN in full URL to ASCII punycode', () => {
    expect(normalizeDomain('https://münchen.de/shop')).toBe('xn--mnchen-3ya.de');
  });

  it('strips www from IDN domain after punycode normalisation', () => {
    expect(normalizeDomain('www.münchen.de')).toBe('xn--mnchen-3ya.de');
  });

  // double TLD protection
  it('does not strip www from co.uk domain (double TLD)', () => {
    expect(normalizeDomain('www.example.co.uk')).toBe('example.co.uk');
  });

  it('does not strip m from com.au domain (double TLD)', () => {
    expect(normalizeDomain('m.example.com.au')).toBe('example.com.au');
  });
});
