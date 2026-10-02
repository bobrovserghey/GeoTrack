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

  it('a raw UTF-8 rule matches the percent-encoded path (RFC 9309 §2.2.2)', () => {
    const txt = 'User-agent: *\nDisallow: /café\n';
    expect(allowed(txt, '/caf%C3%A9')).toBe(false);
    expect(allowed(txt, '/caf%c3%a9')).toBe(false); // escape case is normalised
    expect(allowed(txt, '/café')).toBe(false);
    expect(allowed(txt, '/cafe')).toBe(true);
  });

  it('an already-encoded rule keeps working', () => {
    const txt = 'User-agent: *\nDisallow: /caf%C3%A9\n';
    expect(allowed(txt, '/caf%C3%A9')).toBe(false);
    expect(allowed(txt, '/caf%C3%A9/menu')).toBe(false);
  });

  it('%2F is not a path separator', () => {
    expect(allowed('User-agent: *\nDisallow: /a/b\n', '/a%2Fb')).toBe(true);
    expect(allowed('User-agent: *\nDisallow: /a%2Fb\n', '/a/b')).toBe(true);
    expect(allowed('User-agent: *\nDisallow: /a%2Fb\n', '/a%2Fb')).toBe(false);
  });

  it('* and $ survive percent-encoding normalisation', () => {
    const txt = 'User-agent: *\nDisallow: /*/café$\n';
    expect(allowed(txt, '/blog/caf%C3%A9')).toBe(false);
    expect(allowed(txt, '/blog/caf%C3%A9/x')).toBe(true);
    // Cyrillic path with a wildcard
    expect(allowed('User-agent: *\nDisallow: /раздел*\n', '/%D1%80%D0%B0%D0%B7%D0%B4%D0%B5%D0%BB/1')).toBe(false);
  });

  it('an ignored record does not end the agent list (RFC 9309 §2.2.4)', () => {
    // Authority: RFC 9309 §2.2.4 requires records other than user-agent/allow/
    // disallow to be IGNORED, so the two "User-agent:" lines are consecutive
    // start-of-group lines — ONE group with agents {geotrack, *} and the rule
    // "Disallow: /". Google's reference parser agrees: it sets the group
    // separator only on allow/disallow. Treating Crawl-delay as a group boundary
    // instead produced a matching specific group with zero rules, which silently
    // discarded "Disallow: /" and under-blocked. Do not "re-fix" this.
    const txt = 'User-agent: GeoTrack\nCrawl-delay: 10\n\nUser-agent: *\nDisallow: /\n';
    expect(allowed(txt, '/x')).toBe(false);
    // Same for Sitemap / Host / Noindex / unknown keys.
    for (const line of ['Sitemap: https://e.test/s.xml', 'Host: e.test', 'Noindex: /n', 'Unknown-key: 1']) {
      expect(allowed(`User-agent: GeoTrack\n${line}\n\nUser-agent: *\nDisallow: /\n`, '/x')).toBe(false);
    }
    // An agent we are not has no group of its own here: it is governed by the "*"
    // that was merged into the single group, so it is disallowed for the same reason.
    expect(allowed(txt, '/x', 'OtherBot')).toBe(false);
  });

  it('an explicitly rule-less specific group governs and does not fall back to *', () => {
    // "Disallow:" is a rule line: it closes the agent list and leaves a real,
    // deliberately empty GeoTrack group. Falling back to the "*" rules here
    // (`specific.length ? specific : wildcard`) would wrongly block everything.
    const txt = 'User-agent: GeoTrack\nDisallow:\n\nUser-agent: *\nDisallow: /\n';
    expect(allowed(txt, '/x')).toBe(true);
    expect(allowed(txt, '/')).toBe(true);
    // Another agent is governed by the "*" group as usual.
    expect(allowed(txt, '/x', 'OtherBot')).toBe(false);
  });

  it('an ignored record between two user-agent lines makes one group, Allow included', () => {
    // Same authority as above (RFC 9309 §2.2.4 + Google's parser): Crawl-delay is
    // ignored, so "*" and "SomeBot" start one group whose "Allow: /admin"
    // legitimately applies to "*" too. Equal-length tie → Allow wins, so /admin
    // is allowed for every agent. This is a property of the group syntax, not a
    // leak: the earlier expectation here encoded the same mistaken premise.
    const txt =
      'User-agent: *\nCrawl-delay: 1\n\nUser-agent: SomeBot\nAllow: /admin\n\nUser-agent: *\nDisallow: /admin\n';
    expect(allowed(txt, '/admin')).toBe(true);
    expect(allowed(txt, '/admin', 'SomeBot')).toBe(true);
    // With a rule in place of the ignored record the groups really are separate,
    // and SomeBot's Allow stays out of the "*" rules.
    const separated =
      'User-agent: *\nDisallow: /a\n\nUser-agent: SomeBot\nAllow: /admin\n\nUser-agent: *\nDisallow: /admin\n';
    expect(allowed(separated, '/admin')).toBe(false);
    expect(allowed(separated, '/admin', 'SomeBot')).toBe(true);
  });

  it('a version suffix in the robots.txt User-agent value is tolerated', () => {
    expect(allowed('User-agent: GeoTrack/1.0\nDisallow: /x\n', '/x')).toBe(false);
    expect(allowed('User-agent: GeoTrack/1.0\nDisallow: /x\n', '/y')).toBe(true);
    // Still no substring matching, and "*" still works.
    expect(allowed('User-agent: GeoTrackOther/2\nDisallow: /x\n', '/x')).toBe(true);
    expect(allowed('User-agent: *\nDisallow: /x\n', '/x')).toBe(false);
  });

  it('pathological pattern completes quickly', () => {
    const txt = `User-agent: *\nDisallow: /${'*a'.repeat(30)}b\n`;
    const start = Date.now();
    expect(allowed(txt, '/' + 'a'.repeat(5000))).toBe(true);
    expect(Date.now() - start).toBeLessThan(500);
  });

  it('stays linear after normalisation (80 wildcards against a 200 000-char path)', () => {
    const txt = `User-agent: *\nDisallow: /${'*a'.repeat(80)}b\n`;
    const start = Date.now();
    expect(allowed(txt, '/' + 'a'.repeat(200_000))).toBe(true);
    expect(Date.now() - start).toBeLessThan(500);
  });
});
