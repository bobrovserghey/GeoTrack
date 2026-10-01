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
});
