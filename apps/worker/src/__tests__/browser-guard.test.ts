import { describe, it, expect } from 'vitest';
import { shouldBlockRequest, shouldBlockInternalRequest } from '../browser/browser-guard.js';

describe('shouldBlockRequest — scheme', () => {
  it('blocks file: scheme', () => {
    expect(shouldBlockRequest('file:///etc/passwd', 'document')).toMatchObject({ blocked: true });
  });

  it('blocks data: scheme', () => {
    expect(shouldBlockRequest('data:text/html,<h1>hi</h1>', 'document')).toMatchObject({ blocked: true });
  });

  it('allows http:', () => {
    expect(shouldBlockRequest('http://example.com/', 'document')).toMatchObject({ blocked: false });
  });

  it('allows https:', () => {
    expect(shouldBlockRequest('https://example.com/', 'document')).toMatchObject({ blocked: false });
  });
});

describe('shouldBlockRequest — port', () => {
  it('blocks port 8080', () => {
    expect(shouldBlockRequest('https://example.com:8080/', 'document')).toMatchObject({ blocked: true });
  });

  it('blocks port 22', () => {
    expect(shouldBlockRequest('https://example.com:22/', 'document')).toMatchObject({ blocked: true });
  });

  it('allows port 80 explicitly', () => {
    expect(shouldBlockRequest('http://example.com:80/', 'document')).toMatchObject({ blocked: false });
  });

  it('allows port 443 explicitly', () => {
    expect(shouldBlockRequest('https://example.com:443/', 'document')).toMatchObject({ blocked: false });
  });
});

describe('shouldBlockRequest — IP literal in host', () => {
  it('blocks IPv4 literal', () => {
    expect(shouldBlockRequest('https://192.168.1.1/', 'document')).toMatchObject({ blocked: true });
  });

  it('blocks private IPv4 literal', () => {
    expect(shouldBlockRequest('http://10.0.0.1/path', 'document')).toMatchObject({ blocked: true });
  });

  it('blocks IPv6 literal', () => {
    expect(shouldBlockRequest('https://[::1]/', 'document')).toMatchObject({ blocked: true });
  });

  it('blocks public IPv4 literal (IP literals always blocked — use hostname)', () => {
    expect(shouldBlockRequest('https://1.1.1.1/', 'document')).toMatchObject({ blocked: true });
  });
});

describe('shouldBlockRequest — resource type', () => {
  it('blocks media resource type', () => {
    expect(shouldBlockRequest('https://example.com/video.mp4', 'media')).toMatchObject({ blocked: true });
  });

  it('blocks font resource type', () => {
    expect(shouldBlockRequest('https://example.com/font.woff2', 'font')).toMatchObject({ blocked: true });
  });

  it('blocks websocket', () => {
    expect(shouldBlockRequest('wss://example.com/ws', 'websocket')).toMatchObject({ blocked: true });
  });

  it('allows document resource type', () => {
    expect(shouldBlockRequest('https://example.com/', 'document')).toMatchObject({ blocked: false });
  });

  it('allows stylesheet resource type', () => {
    expect(shouldBlockRequest('https://example.com/style.css', 'stylesheet')).toMatchObject({ blocked: false });
  });

  it('allows script resource type', () => {
    expect(shouldBlockRequest('https://example.com/app.js', 'script')).toMatchObject({ blocked: false });
  });
});

describe('shouldBlockInternalRequest', () => {
  const ALLOWED = 'https://geotrack.internal:8443';

  it('allows a request to the configured origin, including a non-80/443 port', () => {
    expect(shouldBlockInternalRequest('https://geotrack.internal:8443/report-render/x', 'document', ALLOWED)).toMatchObject({ blocked: false });
  });

  it('allows localhost on a dev port when that is the configured origin', () => {
    expect(shouldBlockInternalRequest('http://localhost:3000/internal/report-render/x', 'document', 'http://localhost:3000')).toMatchObject({ blocked: false });
  });

  it('allows an IP-literal origin when that is the configured origin (container networking)', () => {
    expect(shouldBlockInternalRequest('http://10.0.0.5:8080/internal/report-render/x', 'document', 'http://10.0.0.5:8080')).toMatchObject({ blocked: false });
  });

  it('blocks a different host than the configured origin', () => {
    expect(shouldBlockInternalRequest('https://evil.example/', 'document', ALLOWED)).toMatchObject({ blocked: true });
  });

  it('blocks a different port on the same hostname than the configured origin', () => {
    expect(shouldBlockInternalRequest('https://geotrack.internal:9999/', 'document', ALLOWED)).toMatchObject({ blocked: true });
  });

  it('blocks a different scheme on the same host/port than the configured origin', () => {
    expect(shouldBlockInternalRequest('http://geotrack.internal:8443/', 'document', ALLOWED)).toMatchObject({ blocked: true });
  });

  it('still blocks disallowed schemes even against the configured origin check', () => {
    expect(shouldBlockInternalRequest('file:///etc/passwd', 'document', ALLOWED)).toMatchObject({ blocked: true });
  });

  it('still blocks disallowed resource types regardless of origin', () => {
    expect(shouldBlockInternalRequest(`${ALLOWED}/font.woff2`, 'font', ALLOWED)).toMatchObject({ blocked: true });
  });

  it('blocks an invalid URL', () => {
    expect(shouldBlockInternalRequest('not a url', 'document', ALLOWED)).toMatchObject({ blocked: true });
  });

  // The classic origin-check bypass: everything left of "@" is userinfo, so the
  // real host is evil.example. new URL().origin resolves this correctly — this
  // test pins that behaviour so a future hand-rolled string compare can't
  // reintroduce the bug.
  it('blocks userinfo confusion that makes the allowed origin look like the host', () => {
    expect(
      shouldBlockInternalRequest('https://geotrack.internal:8443@evil.example/', 'document', ALLOWED),
    ).toMatchObject({ blocked: true });
  });

  it('blocks javascript: and data: URLs', () => {
    expect(shouldBlockInternalRequest('javascript:alert(1)', 'document', ALLOWED)).toMatchObject({ blocked: true });
    expect(shouldBlockInternalRequest('data:text/html,<h1>x</h1>', 'document', ALLOWED)).toMatchObject({
      blocked: true,
    });
  });

  // Both sides go through the WHATWG parser, so scheme and host case must not
  // matter. If either side were ever compared as a raw string, this would fail.
  it('treats scheme and host case-insensitively on both sides', () => {
    expect(
      shouldBlockInternalRequest('HTTPS://GEOTRACK.INTERNAL:8443/x', 'document', 'HTTPS://GEOTRACK.INTERNAL:8443'),
    ).toMatchObject({ blocked: false });
  });

  // https + :443 is the same origin as https with no port; http + :443 is not.
  it('normalizes the default port when comparing origins', () => {
    expect(shouldBlockInternalRequest('https://geotrack.example/x', 'document', 'https://geotrack.example:443')).toMatchObject({
      blocked: false,
    });
    expect(shouldBlockInternalRequest('http://geotrack.example:443/x', 'document', 'https://geotrack.example:443')).toMatchObject({
      blocked: true,
    });
  });

  it('ignores a path or trailing slash in the request URL when matching origin', () => {
    expect(shouldBlockInternalRequest(`${ALLOWED}/`, 'document', ALLOWED)).toMatchObject({ blocked: false });
    expect(
      shouldBlockInternalRequest(`${ALLOWED}/internal/report-render/abc?x=1#y`, 'document', ALLOWED),
    ).toMatchObject({ blocked: false });
  });

  // A relative or protocol-relative URL has no origin of its own, so it must
  // never be treated as same-origin. new URL() without a base throws on both.
  it('blocks relative and protocol-relative URLs', () => {
    expect(shouldBlockInternalRequest('/internal/report-render/x', 'document', ALLOWED)).toMatchObject({
      blocked: true,
    });
    expect(shouldBlockInternalRequest('//evil.example/x', 'document', ALLOWED)).toMatchObject({ blocked: true });
  });

  // An unusable allowedOrigin must fail closed rather than allow everything.
  // Three distinct shapes, previously conflated under one vague test name:
  it('fails closed when allowedOrigin is unparseable', () => {
    expect(shouldBlockInternalRequest(`${ALLOWED}/x`, 'document', 'null')).toMatchObject({ blocked: true });
    expect(shouldBlockInternalRequest(`${ALLOWED}/x`, 'document', '')).toMatchObject({ blocked: true });
  });

  // 'localhost:3000' parses but is genuinely opaque (origin === "null"), which
  // is the shape that silently broke dev configs before baseUrl was validated.
  it('fails closed when allowedOrigin parses but has an opaque origin', () => {
    expect(shouldBlockInternalRequest('http://localhost:3000/x', 'document', 'localhost:3000')).toMatchObject({
      blocked: true,
    });
  });

  it('fails closed when allowedOrigin is a non-http(s) scheme', () => {
    expect(shouldBlockInternalRequest(`${ALLOWED}/x`, 'document', 'file:///etc/passwd')).toMatchObject({
      blocked: true,
    });
    expect(shouldBlockInternalRequest('ftp://host/x', 'document', 'ftp://host')).toMatchObject({ blocked: true });
  });
});
