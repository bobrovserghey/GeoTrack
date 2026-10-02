import { describe, it, expect } from 'vitest';
import { isPathAllowed } from '../checks/robots-rules.js';

const UA = 'GeoTrack';
const allowed = (txt: string, path: string, ua = UA) => isPathAllowed(txt, ua, path);

describe('isPathAllowed (RFC 9309)', () => {
  it('no robots / no matching group → allowed', () => {
    expect(allowed('', '/x')).toBe(true);
    expect(allowed('User-agent: Other\nDisallow: /\n', '/x')).toBe(true);
  });

  it('empty Disallow allows everything', () => {
    expect(allowed('User-agent: *\nDisallow:\n', '/anything')).toBe(true);
  });

  it('trailing comment in Disallow is stripped', () => {
    const txt = 'User-agent: *\nDisallow: /private # secret area\n';
    expect(allowed(txt, '/private/x')).toBe(false);
  });

  it('comment-only and blank lines do not break a group', () => {
    const txt = 'User-agent: *\n\n# note\n\nDisallow: /a\n';
    expect(allowed(txt, '/a/b')).toBe(false);
  });

  it('wildcard * in a rule', () => {
    const txt = 'User-agent: *\nDisallow: /*/draft\n';
    expect(allowed(txt, '/blog/draft')).toBe(false);
    expect(allowed(txt, '/blog/final')).toBe(true);
  });

  it('$ anchors the end of the path', () => {
    const txt = 'User-agent: *\nDisallow: /*.pdf$\n';
    expect(allowed(txt, '/files/a.pdf')).toBe(false);
    expect(allowed(txt, '/files/a.pdf?x=1')).toBe(true);
    expect(allowed(txt, '/files/a.pdfx')).toBe(true);
  });

  it('Allow overrides a shorter Disallow (longest match)', () => {
    const txt = 'User-agent: *\nDisallow: /docs\nAllow: /docs/public\n';
    expect(allowed(txt, '/docs/secret')).toBe(false);
    expect(allowed(txt, '/docs/public/a')).toBe(true);
  });

  it('a longer Disallow overrides a shorter Allow', () => {
    const txt = 'User-agent: *\nAllow: /docs\nDisallow: /docs/private\n';
    expect(allowed(txt, '/docs/private/a')).toBe(false);
    expect(allowed(txt, '/docs/a')).toBe(true);
  });

  it('equal length: Allow wins', () => {
    const txt = 'User-agent: *\nDisallow: /page\nAllow: /page\n';
    expect(allowed(txt, '/page')).toBe(true);
  });

  it('GeoTrack group beats a neighbouring * group (no merging)', () => {
    const txt = 'User-agent: *\nDisallow: /\n\nUser-agent: GeoTrack\nDisallow: /secret\n';
    expect(allowed(txt, '/open')).toBe(true);
    expect(allowed(txt, '/secret/x')).toBe(false);
  });

  it('group order does not matter', () => {
    const txt = 'User-agent: GeoTrack\nDisallow: /secret\n\nUser-agent: *\nDisallow: /\n';
    expect(allowed(txt, '/open')).toBe(true);
  });

  it('GeoTrackOther is not our agent (exact token, not substring)', () => {
    const txt = 'User-agent: GeoTrackOther\nDisallow: /\n';
    expect(allowed(txt, '/x')).toBe(true);
    expect(allowed(txt, '/x', 'GeoTrackOther')).toBe(false);
  });

  it('agent token match is case-insensitive and ignores the version suffix', () => {
    const txt = 'User-agent: geotrack\nDisallow: /x\n';
    expect(isPathAllowed(txt, 'GeoTrack/1.0 (+https://geotrack.example)', '/x')).toBe(false);
  });

  it('multiple user-agent lines share one group', () => {
    const txt = 'User-agent: Foo\nUser-agent: GeoTrack\nDisallow: /x\n';
    expect(allowed(txt, '/x')).toBe(false);
  });

  it('repeated groups for the same agent are merged', () => {
    const txt =
      'User-agent: GeoTrack\nDisallow: /a\n\nUser-agent: Other\nDisallow: /\n\nUser-agent: GeoTrack\nDisallow: /b\n';
    expect(allowed(txt, '/a/1')).toBe(false);
    expect(allowed(txt, '/b/1')).toBe(false);
    expect(allowed(txt, '/c')).toBe(true);
  });

  it('handles CRLF and BOM', () => {
    const txt = '﻿User-agent: *\r\nDisallow: /x\r\n';
    expect(allowed(txt, '/x')).toBe(false);
  });

  it('matches against path with query string', () => {
    const txt = 'User-agent: *\nDisallow: /search?\n';
    expect(allowed(txt, '/search?q=1')).toBe(false);
    expect(allowed(txt, '/search')).toBe(true);
  });

  it('pathological pattern completes quickly', () => {
    const txt = `User-agent: *\nDisallow: /${'*a'.repeat(30)}b\n`;
    const start = Date.now();
    expect(allowed(txt, '/' + 'a'.repeat(5000))).toBe(true);
    expect(Date.now() - start).toBeLessThan(500);
  });
});
