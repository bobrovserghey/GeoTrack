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

/**
 * RFC 9309 §2.3.1: 2xx — use the rules; 4xx ("unavailable", §2.3.1.3) — allow
 * all; 5xx and a failed request ("unreachable", §2.3.1.4) — disallow all.
 *
 * 429 is the one deliberate departure from the letter of §2.3.1.3: it is a 4xx,
 * but it means "you are asking too often", not "there are no rules". Crawling a
 * host that just told us to back off would also contradict the 429 host halt in
 * `net/host-gate.ts`, so we treat it as unreachable. Google's parser does the same.
 *
 * Second deliberate departure: redirect exhaustion. §2.3.1.2 says more than five
 * hops should be treated as "unavailable" (§2.3.1.3 — allow all), but `fetchFn`
 * follows redirects itself and surfaces exhaustion as a thrown error, which the
 * `catch` below maps to `unreachable` (crawl nothing). We keep it that way on
 * purpose: the direction is conservative, and recognising the case would mean
 * matching on an error message, which is fragile because `fetchFn` is injected
 * and need not be safe-fetch. See docs/specs/debt.md.
 */
type RobotsFetch =
  | { kind: 'rules'; text: string }
  | { kind: 'unavailable' }
  | { kind: 'unreachable'; reason: string };

async function fetchRobots(origin: string, fetchFn: FetchFn): Promise<RobotsFetch> {
  try {
    const res = await fetchFn(`${origin}/robots.txt`);
    if (res.status === 429 || res.status >= 500) {
      return { kind: 'unreachable', reason: `robots.txt: HTTP ${res.status}` };
    }
    if (!res.ok) return { kind: 'unavailable' };
    return { kind: 'rules', text: await res.text() };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'request failed';
    return { kind: 'unreachable', reason: `robots.txt: ${reason}` };
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
  const robots = await fetchRobots(origin, fetchFn);

  if (robots.kind === 'unreachable') {
    // "Unreachable" means a complete disallow (RFC 9309 §2.3.1.4): we must not
    // guess that everything is allowed, so nothing is crawled.
    return {
      status: 'partial',
      data: { pagesFound: 0, urls: [] },
      artifacts: [],
      usage: [],
      notes: [`${robots.reason}; unreachable robots.txt means a complete disallow (RFC 9309 §2.3.1.4)`],
    };
  }
  const robotsTxt = robots.kind === 'rules' ? robots.text : '';

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
