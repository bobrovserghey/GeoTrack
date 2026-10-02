import { createSafeFetch } from '@geotrack/core/net/safe-fetch';
import { isPathAllowed } from '@geotrack/core/checks/robots-rules';
import type { StepResult } from '@geotrack/core';

export type CrawlOutput = {
  pagesFound: number;
  urls: string[];
};

type FetchFn = (url: string) => Promise<Response>;

const CRAWLER_TOKEN = 'GeoTrack';

const HREF_RE = /href=["']([^"'#?][^"']*?)["']/gi;

async function fetchRobots(origin: string, fetchFn: FetchFn): Promise<string> {
  try {
    const res = await fetchFn(`${origin}/robots.txt`);
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
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

export async function crawl(
  startUrl: string,
  maxPages: number,
  fetchFn: FetchFn = createSafeFetch(),
): Promise<StepResult<CrawlOutput>> {
  const origin = new URL(startUrl).origin;
  const robotsTxt = await fetchRobots(origin, fetchFn);

  const visited = new Set<string>();
  const queue: string[] = [new URL(startUrl).href];
  const crawled: string[] = [];

  while (queue.length > 0 && crawled.length < maxPages) {
    const url = queue.shift()!;
    const normalised = url.split('#')[0]!;

    if (visited.has(normalised)) continue;
    visited.add(normalised);

    const parsed = new URL(normalised);
    if (!isPathAllowed(robotsTxt, CRAWLER_TOKEN, parsed.pathname + parsed.search)) continue;

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
