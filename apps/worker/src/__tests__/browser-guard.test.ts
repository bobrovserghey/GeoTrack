import { describe, it, expect } from 'vitest';
import { shouldBlockRequest } from '../browser/browser-guard.js';

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
