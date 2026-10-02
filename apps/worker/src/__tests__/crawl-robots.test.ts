import { describe, it, expect, vi } from 'vitest';
import { crawl } from '../steps/crawl.js';

function makeHtmlFetch(pages: Record<string, string>) {
  return vi.fn().mockImplementation((url: string) => {
    const body = pages[new URL(url).pathname] ?? '';
    return Promise.resolve(
      new Response(body, { status: body ? 200 : 404, headers: { 'Content-Type': 'text/html' } }),
    );
  });
}

async function crawledPaths(robots: string, linked: string[]): Promise<string[]> {
  const pages: Record<string, string> = {
    '/robots.txt': robots,
    '/': `<html><body>${linked.map((p) => `<a href="${p}">x</a>`).join('')}</body></html>`,
  };
  for (const p of linked) pages[p.split('?')[0]!] = '<html><body>page</body></html>';
  const result = await crawl('https://example.com', 20, makeHtmlFetch(pages));
  return (result.data?.urls ?? []).map((u) => new URL(u).pathname);
}

describe('crawl — robots.txt (RFC 9309)', () => {
  it('a comment after Disallow does not hide the rule', async () => {
    const paths = await crawledPaths('User-agent: *\nDisallow: /private # hidden\n', [
      '/private/x',
      '/ok',
    ]);
    expect(paths).not.toContain('/private/x');
    expect(paths).toContain('/ok');
  });

  it('honours * and $', async () => {
    const paths = await crawledPaths('User-agent: *\nDisallow: /*.pdf$\nDisallow: /a/*/draft\n', [
      '/f/a.pdf',
      '/f/a.html',
      '/a/1/draft',
      '/a/1/final',
    ]);
    expect(paths).not.toContain('/f/a.pdf');
    expect(paths).not.toContain('/a/1/draft');
    expect(paths).toContain('/f/a.html');
    expect(paths).toContain('/a/1/final');
  });

  it('Allow carves an exception out of a Disallow', async () => {
    const paths = await crawledPaths('User-agent: *\nDisallow: /docs\nAllow: /docs/public\n', [
      '/docs/secret',
      '/docs/public/a',
    ]);
    expect(paths).not.toContain('/docs/secret');
    expect(paths).toContain('/docs/public/a');
  });

  it('the GeoTrack group is not overridden by a neighbouring * group', async () => {
    const paths = await crawledPaths(
      'User-agent: *\nDisallow: /\n\nUser-agent: GeoTrack\nDisallow: /secret\n',
      ['/open', '/secret/x'],
    );
    expect(paths).toContain('/open');
    expect(paths).not.toContain('/secret/x');
  });

  it('a non-ASCII Disallow written in raw UTF-8 is honoured (localised sites, ADR-019)', async () => {
    // crawl() matches URL.pathname, which is always percent-encoded, against the
    // rule as written in robots.txt.
    const encoded = new URL('/каталог/1', 'https://example.com').pathname;
    const pages: Record<string, string> = {
      '/robots.txt': 'User-agent: *\nDisallow: /каталог\n',
      '/': '<html><body><a href="/каталог/1">ru</a><a href="/catalog/1">en</a></body></html>',
      [encoded]: '<html><body>page</body></html>',
      '/catalog/1': '<html><body>page</body></html>',
    };
    const result = await crawl('https://example.com', 20, makeHtmlFetch(pages));
    const paths = (result.data?.urls ?? []).map((u) => new URL(u).pathname);
    expect(paths).not.toContain(encoded);
    expect(paths).toContain('/catalog/1');
  });

  it('a GeoTrackOther group does not apply to us', async () => {
    const paths = await crawledPaths('User-agent: GeoTrackOther\nDisallow: /\n', ['/open']);
    expect(paths).toContain('/open');
  });

  it('Crawl-delay between two user-agent lines does not unlock a Disallow: /', async () => {
    // Crawl-delay is an ignored record (RFC 9309 §2.2.4), so the two user-agent
    // lines form ONE group {GeoTrack, *} governed by "Disallow: /": nothing may
    // be crawled, the start URL included. Closing the agent list on an ignored
    // record made this crawl the whole site.
    const paths = await crawledPaths('User-agent: GeoTrack\nCrawl-delay: 10\n\nUser-agent: *\nDisallow: /\n', [
      '/a',
      '/b',
    ]);
    expect(paths).toEqual([]);
  });

  it('an explicitly empty Disallow for us wins over a Disallow: / for *', async () => {
    const paths = await crawledPaths('User-agent: GeoTrack\nDisallow:\n\nUser-agent: *\nDisallow: /\n', [
      '/a',
      '/b',
    ]);
    expect(paths).toEqual(['/', '/a', '/b']);
  });
});
