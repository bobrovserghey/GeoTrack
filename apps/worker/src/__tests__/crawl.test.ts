import { describe, it, expect, vi } from 'vitest';
import { crawl } from '../steps/crawl.js';

const HOME_HTML = `
<html><body>
  <a href="/about">About</a>
  <a href="/pricing">Pricing</a>
  <a href="https://external.com/link">External</a>
  <a href="#anchor">Anchor only</a>
</body></html>`;

const ABOUT_HTML = '<html><body><a href="/contact">Contact</a></body></html>';
const PRICING_HTML = '<html><body><p>Pricing page</p></body></html>';
const CONTACT_HTML = '<html><body><p>Contact page</p></body></html>';
const ROBOTS_ALLOW_ALL = 'User-agent: *\nDisallow:\n';
const ROBOTS_DISALLOW_PRICING = 'User-agent: *\nDisallow: /pricing\n';

function makeHtmlFetch(pages: Record<string, string>) {
  return vi.fn().mockImplementation((url: string) => {
    const key = new URL(url).pathname === '/' ? '/' : new URL(url).pathname;
    const body = pages[key] ?? pages[url] ?? '';
    return Promise.resolve(new Response(body, {
      status: body ? 200 : 404,
      headers: { 'Content-Type': 'text/html' },
    }));
  });
}

describe('crawl', () => {
  it('returns pagesFound = 1 for a page with no same-origin links', async () => {
    const fetchFn = makeHtmlFetch({ '/': '<html><body>Hello</body></html>', '/robots.txt': ROBOTS_ALLOW_ALL });
    const result = await crawl('https://example.com', 10, fetchFn);
    expect(result.status).toBe('ok');
    expect(result.data?.pagesFound).toBeGreaterThanOrEqual(1);
  });

  it('follows same-origin links and ignores external links', async () => {
    const fetchFn = makeHtmlFetch({
      '/robots.txt': ROBOTS_ALLOW_ALL,
      '/': HOME_HTML,
      '/about': ABOUT_HTML,
      '/pricing': PRICING_HTML,
      '/contact': CONTACT_HTML,
    });
    const result = await crawl('https://example.com', 10, fetchFn);
    expect(result.status).toBe('ok');
    expect(result.data?.pagesFound).toBeGreaterThanOrEqual(3); // /, /about, /pricing
    const urls = result.data?.urls ?? [];
    expect(urls.some((u) => u.includes('external.com'))).toBe(false);
  });

  it('respects maxPages limit from profile', async () => {
    const fetchFn = makeHtmlFetch({
      '/robots.txt': ROBOTS_ALLOW_ALL,
      '/': HOME_HTML,
      '/about': ABOUT_HTML,
      '/pricing': PRICING_HTML,
    });
    const result = await crawl('https://example.com', 2, fetchFn);
    expect(result.status).toBe('ok');
    expect(result.data?.pagesFound).toBeLessThanOrEqual(2);
  });

  it('skips URLs disallowed by robots.txt', async () => {
    const fetchFn = makeHtmlFetch({
      '/robots.txt': ROBOTS_DISALLOW_PRICING,
      '/': HOME_HTML,
      '/about': ABOUT_HTML,
      '/pricing': PRICING_HTML,
    });
    const result = await crawl('https://example.com', 10, fetchFn);
    const urls = result.data?.urls ?? [];
    expect(urls.some((u) => u.includes('/pricing'))).toBe(false);
  });

  it('does not visit the same URL twice', async () => {
    const circular = '<html><body><a href="/">Home</a><a href="/about">About</a></body></html>';
    const fetchFn = makeHtmlFetch({
      '/robots.txt': ROBOTS_ALLOW_ALL,
      '/': circular,
      '/about': circular,
    });
    const result = await crawl('https://example.com', 10, fetchFn);
    const urls = result.data?.urls ?? [];
    const unique = new Set(urls);
    expect(urls.length).toBe(unique.size);
  });

  it('returns status ok even when robots.txt is missing', async () => {
    const fetchFn = makeHtmlFetch({
      '/robots.txt': '',
      '/': '<html><body>Hello</body></html>',
    });
    const result = await crawl('https://example.com', 10, fetchFn);
    expect(result.status).toBe('ok');
  });
});
