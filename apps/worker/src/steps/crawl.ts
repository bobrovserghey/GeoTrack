import { createSafeFetch } from '@geotrack/core/net/safe-fetch';
import type { StepResult } from '@geotrack/core';

export type CrawlOutput = {
  pagesFound: number;
  urls: string[];
};

type FetchFn = (url: string) => Promise<Response>;

const HREF_RE = /href=["']([^"'#?][^"']*?)["']/gi;

async function fetchRobots(origin: string, fetchFn: FetchFn): Promise<string[]> {
  try {
    const res = await fetchFn(`${origin}/robots.txt`);
    if (!res.ok) return [];
    const text = await res.text();
    const disallowed: string[] = [];
    let inScope = false;
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (/^User-agent:/i.test(trimmed)) {
        inScope = /:\s*\*/i.test(trimmed) || /:\s*GeoTrack/i.test(trimmed);
      } else if (inScope && /^Disallow:/i.test(trimmed)) {
        const path = trimmed.replace(/^Disallow:\s*/i, '').trim();
        if (path) disallowed.push(path);
      }
    }
    return disallowed;
  } catch {
    return [];
  }
}

function extractLinks(html: string, baseUrl: URL): string[] {
  const links: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(HREF_RE.source, 'gi');
  while ((match = re.exec(html)) !== null) {
    try {
      const href = match[1];
      if (!href) continue;
      const resolved = new URL(href, baseUrl);
      if (resolved.origin === baseUrl.origin) {
        resolved.hash = '';
        links.push(resolved.href);
      }
    } catch {
      // ignore invalid URLs
    }
  }
  return links;
}

function isDisallowed(path: string, disallowed: string[]): boolean {
  return disallowed.some((rule) => path.startsWith(rule));
}

export async function crawl(
  startUrl: string,
  maxPages: number,
  fetchFn: FetchFn = createSafeFetch(),
): Promise<StepResult<CrawlOutput>> {
  const origin = new URL(startUrl).origin;
  const disallowed = await fetchRobots(origin, fetchFn);

  const visited = new Set<string>();
  const queue: string[] = [new URL(startUrl).href];
  const crawled: string[] = [];

  while (queue.length > 0 && crawled.length < maxPages) {
    const url = queue.shift()!;
    const normalised = url.split('#')[0]!;

    if (visited.has(normalised)) continue;
    visited.add(normalised);

    const parsedPath = new URL(normalised).pathname;
    if (isDisallowed(parsedPath, disallowed)) continue;

    try {
      const res = await fetchFn(normalised);
      if (!res.ok) continue;

      const contentType = res.headers.get('Content-Type') ?? '';
      if (!contentType.includes('html')) continue;

      const html = await res.text();
      crawled.push(normalised);

      const links = extractLinks(html, new URL(normalised));
      for (const link of links) {
        if (!visited.has(link)) queue.push(link);
      }
    } catch {
      // skip pages that fail to load
    }
  }

  return {
    status: 'ok',
    data: { pagesFound: crawled.length, urls: crawled },
    artifacts: [],
    usage: [],
    notes: [],
  };
}
