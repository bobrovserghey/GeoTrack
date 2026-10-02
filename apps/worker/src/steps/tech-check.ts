import { parseRobotsPermissions, AI_BOTS } from '@geotrack/core/checks/robots';
import type { BotName } from '@geotrack/core/checks/robots';
import type { TechCheckFacts, B2Result, B4Page, B5Page } from '@geotrack/core/steps/tech-check';
import type { StepResult } from '@geotrack/core';
import { createGatedFetch, hostOf, HostHaltedError } from '../net/host-gate.js';
import type { GatedFetch } from '../net/host-gate.js';
import { Degradations } from './degradations.js';

// ---------------------------------------------------------------------------
// Dependencies (injectable for testing)
// ---------------------------------------------------------------------------

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** Returns {rawText, renderedText} for a URL; injected so tests can stub Playwright */
export type GetPageTextFn = (url: string) => Promise<{ rawText: string; renderedText: string }>;

export type TechCheckDeps = {
  fetchFn: FetchFn;
  getPageText: GetPageTextFn;
  /** Milliseconds to wait between user-agent requests. Defaults to 1000. */
  domainPauseMs?: number;
  /** Fixed "now" for staleness checks; defaults to Date.now(). */
  nowMs?: number;
  /**
   * Ceiling for one queued request or page render; on timeout the host queue is
   * released and the check degrades. Defaults to the host-gate default (60 s).
   */
  taskTimeoutMs?: number;
};

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type TechCheckInput = {
  origin: string;          // "https://example.com"
  robotsTxt: string;       // raw robots.txt content from crawler
  sitemapUrls: string[];   // URLs found in sitemap
  keyPages: string[];      // key pages from crawler (absolute URLs)
  serpApiKey?: string;     // if undefined → B4 not measured
  serpApiRequests: number; // from profile.serpApiRequests
};

// ---------------------------------------------------------------------------
// User-agent strings for each AI bot
// ---------------------------------------------------------------------------

const BOT_USER_AGENTS: Record<BotName, string> = {
  'GPTBot': 'GPTBot/1.1 (+https://openai.com/gptbot)',
  'OAI-SearchBot': 'OAI-SearchBot/1.0 (+https://openai.com/searchbot)',
  'ChatGPT-User': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
  'ClaudeBot': 'Claude-Web/1.0 (+https://www.anthropic.com/claude-web)',
  'Claude-User': 'Mozilla/5.0 (compatible; Claude-User/1.0; +https://www.anthropic.com)',
  'PerplexityBot': 'PerplexityBot/1.0 (+https://perplexity.ai/perplexitybot)',
  'Google-Extended': 'Googlebot-Extended/1.0 (+http://www.google.com/bot.html)',
  'Bingbot': 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract visible text from raw HTML (strip tags, collapse whitespace) */
export function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract canonical URL from HTML */
function extractCanonical(html: string): string | null {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)
    ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
  return m ? (m[1] ?? null) : null;
}

/** Extract lastmod dates from sitemap XML */
function extractLastmods(xml: string): string[] {
  const dates: string[] = [];
  const re = /<lastmod>([^<]+)<\/lastmod>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    dates.push(m[1]!.trim());
  }
  return dates;
}

const EIGHTEEN_MONTHS_MS = 18 * 30 * 24 * 60 * 60 * 1000;

/** Check if a date string is older than 18 months */
function isStale(dateStr: string | null, nowMs: number): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  return nowMs - d.getTime() > EIGHTEEN_MONTHS_MS;
}

type SitemapFetch =
  | { kind: 'ok'; xml: string }
  | { kind: 'missing' }
  | { kind: 'failed' };

/**
 * A 2xx (`ok`) and a 4xx other than 429 (`missing` — the host says "there is no
 * sitemap here") are both answers about the sitemap. `failed` means we have no
 * data at all: 429, 5xx, a network error or a host halt. A 5xx is the server
 * failing, not a statement about the sitemap, so it must not be recorded as
 * `sitemapPresent: false` (a −5 finding in scoreB5).
 */
function sitemapAnswered(sm: SitemapFetch): boolean {
  return sm.kind === 'ok' || sm.kind === 'missing';
}

// One request shared by B5 and B6.
async function fetchSitemap(
  origin: string,
  gate: GatedFetch,
  degraded: Degradations,
): Promise<SitemapFetch> {
  try {
    const res = await gate.fetch(`${origin}/sitemap.xml`);
    // 429 and 5xx are "we do not know", not "no sitemap" — same rule as
    // `makeProbe` in machine-readable-check.ts.
    if (res.status === 429 || res.status >= 500) {
      degraded.push(`sitemap.xml: ${res.status}`);
      return { kind: 'failed' };
    }
    if (!res.ok) return { kind: 'missing' };
    return { kind: 'ok', xml: await res.text() };
  } catch (err) {
    // Short canonical strings, matching the B2/B5/B6 notes for the same events;
    // the gate's own HostHaltedError message would be a different vocabulary.
    degraded.push(
      err instanceof HostHaltedError ? 'sitemap.xml: stopped on 429' : 'sitemap.xml: request failed',
    );
    return { kind: 'failed' };
  }
}

// ---------------------------------------------------------------------------
// B1: robots.txt
// ---------------------------------------------------------------------------

function checkB1(input: TechCheckInput): TechCheckFacts['b1'] {
  const present = input.robotsTxt.trim().length > 0;
  const permissions = parseRobotsPermissions(input.robotsTxt);
  return { measured: true, robotsTxtPresent: present, permissions };
}

// ---------------------------------------------------------------------------
// B2: server/CDN blocks
// ---------------------------------------------------------------------------

async function checkB2(
  input: TechCheckInput,
  gate: GatedFetch,
  degraded: Degradations,
): Promise<TechCheckFacts['b2']> {
  const pages = input.keyPages.slice(0, 5); // limit to 5 key pages for B2
  if (pages.length === 0) {
    return { measured: false, notMeasuredReason: 'no key pages' };
  }

  const results: B2Result[] = [];
  let stoppedOn429 = false;

  for (const bot of AI_BOTS) {
    if (stoppedOn429) break;
    for (const url of pages) {
      if (stoppedOn429) break;
      try {
        const res = await gate.fetch(url, {
          headers: { 'User-Agent': BOT_USER_AGENTS[bot] },
        });
        const status = res.status;
        if (status === 429) {
          stoppedOn429 = true;
          results.push({ bot, url, statusCode: status, blocked: true });
          break;
        }
        const blocked = status === 403 || (status >= 400 && status < 600 && status !== 404);
        results.push({ bot, url, statusCode: status, blocked });
      } catch (err) {
        if (err instanceof HostHaltedError) {
          // Another check got the 429 first; the host asked us to stop.
          stoppedOn429 = true;
          break;
        }
        results.push({ bot, url, statusCode: 0, blocked: false });
        degraded.push(`B2 ${bot}: request failed`);
      }
    }
  }

  if (stoppedOn429) degraded.push('B2: stopped on 429');
  // Two ways to stop: our own request returned 429 (that result is recorded just
  // above, so `results` is non-empty and B2 stays measured), or another check hit
  // the 429 first and the gate refused ours (HostHaltedError, nothing recorded).
  // The second path is what this guard covers; it must not depend on B2 being
  // first in the gate queue, so reordering the Promise.all below stays safe.
  if (results.length === 0) {
    return {
      measured: false,
      notMeasuredReason: stoppedOn429
        ? 'host answered 429 before any bot request'
        : 'no bot request completed',
    };
  }
  return { measured: true, results, stoppedOn429 };
}

// ---------------------------------------------------------------------------
// B3: JS rendering
// ---------------------------------------------------------------------------

async function checkB3(
  input: TechCheckInput,
  deps: TechCheckDeps,
  gate: GatedFetch,
  degraded: Degradations,
): Promise<TechCheckFacts['b3']> {
  const url = input.keyPages[0] ?? `${input.origin}/`;
  try {
    // Queued with the host's other requests so the page load obeys the same pause and 429 stop.
    const { rawText, renderedText } = await gate.run(hostOf(url), () => deps.getPageText(url));
    const rawLen = rawText.length;
    const rendLen = renderedText.length;
    const ratio = rendLen === 0 ? 1 : Math.min(1, rawLen / rendLen);
    return {
      measured: true,
      url,
      rawTextLength: rawLen,
      renderedTextLength: rendLen,
      contentRatio: ratio,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'getPageText failed';
    degraded.push(`B3: ${reason}`);
    return { measured: false, notMeasuredReason: reason };
  }
}

// ---------------------------------------------------------------------------
// B4: Bing indexation via SerpAPI
// ---------------------------------------------------------------------------

async function checkB4(
  input: TechCheckInput,
  gate: GatedFetch,
  degraded: Degradations,
): Promise<TechCheckFacts['b4']> {
  if (!input.serpApiKey) {
    return { measured: false, notMeasuredReason: 'SerpAPI key not configured' };
  }

  const maxRequests = input.serpApiRequests;
  const pages = input.keyPages.slice(0, maxRequests);
  const pagesChecked: B4Page[] = [];
  let requestsUsed = 0;

  for (const pageUrl of pages) {
    const apiUrl =
      `https://serpapi.com/search.json` +
      `?engine=bing&q=${encodeURIComponent(`site:${pageUrl}`)}` +
      `&api_key=${encodeURIComponent(input.serpApiKey)}` +
      `&num=1`;

    try {
      const res = await gate.fetch(apiUrl);
      requestsUsed++;
      if (!res.ok) {
        degraded.push(`B4: SerpAPI returned ${res.status}`);
        return { measured: false, notMeasuredReason: `SerpAPI returned ${res.status}` };
      }
      const body = (await res.json()) as Record<string, unknown>;
      const organic = body['organic_results'];
      const indexed = Array.isArray(organic) && organic.length > 0;
      pagesChecked.push({ url: pageUrl, indexed });
    } catch {
      degraded.push('B4: SerpAPI unavailable');
      return { measured: false, notMeasuredReason: 'SerpAPI unavailable' };
    }
  }

  return { measured: true, pagesChecked, requestsUsed };
}

// ---------------------------------------------------------------------------
// B5: Technical hygiene
// ---------------------------------------------------------------------------

async function checkB5(
  input: TechCheckInput,
  gate: GatedFetch,
  sitemap: Promise<SitemapFetch>,
  degraded: Degradations,
): Promise<TechCheckFacts['b5']> {
  let sitemapPresent = false;
  let sitemapUrlCount = 0;

  const sm = await sitemap;
  if (sm.kind === 'ok') {
    sitemapPresent = true;
    const urls = (sm.xml.match(/<loc>/g) ?? []).length;
    sitemapUrlCount = Math.max(urls, input.sitemapUrls.length);
  }

  const pageResults: B5Page[] = [];
  let halted = false;
  for (const url of input.keyPages.slice(0, 10)) {
    try {
      const { res, elapsedMs } = await gate.timed(url);
      if (res.status === 429) {
        // Not an observation about the page; the gate halts the host from here on.
        degraded.push('B5: 429');
        halted = true;
        break;
      }
      const html = await res.text();
      const canonical = extractCanonical(html);
      const isRedirect = res.status >= 300 && res.status < 400;
      pageResults.push({
        url,
        statusCode: res.status,
        canonical,
        isRedirect,
        // Time inside fetchFn only (no queue wait or domain pause). Not a true TTFB:
        // safe-fetch buffers the whole body before returning (see docs/specs/debt.md).
        ttfbMs: elapsedMs,
      });
    } catch (err) {
      if (err instanceof HostHaltedError) {
        degraded.push('B5: stopped on 429');
        halted = true;
        break;
      }
      pageResults.push({ url, statusCode: 0, canonical: null, isRedirect: false, ttfbMs: 0 });
      degraded.push('B5: request failed');
    }
  }

  // Nothing was observed at all — neither the sitemap nor a single page. Saying
  // "measured" here would let pillar-B count b5's full maxScore against a score
  // of 0 (see scoring/pillar-b.ts: scoreB5 early-returns on an empty list).
  // A sitemap answer alone is still a partial measurement and stays measured.
  if (!sitemapAnswered(sm) && pageResults.length === 0) {
    return {
      measured: false,
      notMeasuredReason: halted
        ? 'host answered 429: no sitemap and no page could be checked'
        : 'no sitemap and no page could be checked',
    };
  }

  return { measured: true, sitemapPresent, sitemapUrlCount, pageResults };
}

// ---------------------------------------------------------------------------
// B6: Freshness signals
// ---------------------------------------------------------------------------

async function checkB6(
  input: TechCheckInput,
  gate: GatedFetch,
  sitemap: Promise<SitemapFetch>,
  nowMs: number,
  degraded: Degradations,
): Promise<TechCheckFacts['b6']> {
  let sitemapLastmod: string | null = null;
  const sm = await sitemap;
  if (sm.kind === 'ok') {
    const dates = extractLastmods(sm.xml);
    if (dates.length > 0) {
      sitemapLastmod = dates.reduce((a, b) => (a > b ? a : b));
    }
  }

  let pagesWithLastModified = 0;
  let stalePageCount = 0;
  let pagesAnswered = 0;
  let halted = false;
  for (const url of input.keyPages.slice(0, 10)) {
    try {
      const res = await gate.fetch(url, { method: 'HEAD' });
      if (res.status === 429) {
        degraded.push('B6: 429');
        halted = true;
        break;
      }
      pagesAnswered++;
      const lm = res.headers.get('Last-Modified') ?? res.headers.get('last-modified');
      if (lm) {
        pagesWithLastModified++;
        if (isStale(lm, nowMs)) stalePageCount++;
      }
    } catch (err) {
      degraded.push(err instanceof HostHaltedError ? 'B6: stopped on 429' : 'B6: request failed');
      if (err instanceof HostHaltedError) {
        halted = true;
        break;
      }
    }
  }

  // With no page answered there is nothing honest to score, even if the sitemap
  // answered. scoreB6 (scoring/pillar-b.ts) derives at most 4 of its 10 points
  // from `sitemapLastmod`; the other 6 are a DEFAULT awarded whenever
  // `pagesWithLastModified + stalePageCount === 0` — i.e. exactly when no page
  // was reached. So a sitemap-only answer would still collect 6 undeserved
  // points out of 10. Reporting `measured: false` here deliberately throws away
  // a real `sitemapLastmod` signal: that is the honest trade, because the
  // default dwarfs it. The underlying modelling flaw (scoreB6 handing out 6/10
  // on `total6 === 0`) is recorded in docs/specs/debt.md — pillar-b.ts is
  // protected scoring config and changing it would move live scores.
  if (pagesAnswered === 0) {
    return {
      measured: false,
      notMeasuredReason: halted
        ? 'host answered 429: no page could be checked for freshness'
        : 'no page could be checked for freshness',
    };
  }

  return { measured: true, sitemapLastmod, pagesWithLastModified, stalePageCount };
}

// ---------------------------------------------------------------------------
// Public step
// ---------------------------------------------------------------------------

export async function techCheck(
  input: TechCheckInput,
  deps: TechCheckDeps,
): Promise<StepResult<TechCheckFacts>> {
  const gate = createGatedFetch(deps.fetchFn, deps.domainPauseMs ?? 1000, {
    taskTimeoutMs: deps.taskTimeoutMs,
  });
  const nowMs = deps.nowMs ?? Date.now();
  const degraded = new Degradations();
  // B2 enqueues first so a 429 on the very first request is attributed to the bot
  // probe rather than to the sitemap. This is cosmetic only: every check decides
  // its own `measured` flag from the data it actually collected, so changing the
  // order below cannot turn an unmeasured criterion into a measured one.
  const b2Promise = checkB2(input, gate, degraded);
  const sitemap = fetchSitemap(input.origin, gate, degraded);

  const [b1, b2, b3, b4, b5, b6] = await Promise.all([
    Promise.resolve(checkB1(input)),
    b2Promise,
    checkB3(input, deps, gate, degraded),
    checkB4(input, gate, degraded),
    checkB5(input, gate, sitemap, degraded),
    checkB6(input, gate, sitemap, nowMs, degraded),
  ]);

  const data: TechCheckFacts = { b1, b2, b3, b4, b5, b6 };

  return {
    status: degraded.isEmpty ? 'ok' : 'partial',
    data,
    artifacts: [],
    usage: [],
    notes: [`stepVersion:1`, ...degraded.toNotes()],
  };
}
