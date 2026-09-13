import { parseRobotsPermissions, AI_BOTS } from '@geotrack/core/checks/robots';
import type { BotName } from '@geotrack/core/checks/robots';
import type { TechCheckFacts, B2Result, B4Page, B5Page } from '@geotrack/core/steps/tech-check';
import type { StepResult } from '@geotrack/core';

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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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
function isStale(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() > EIGHTEEN_MONTHS_MS;
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
  deps: TechCheckDeps,
): Promise<TechCheckFacts['b2']> {
  const pages = input.keyPages.slice(0, 5); // limit to 5 key pages for B2
  if (pages.length === 0) {
    return { measured: false, notMeasuredReason: 'no key pages' };
  }

  const pauseMs = deps.domainPauseMs ?? 1000;
  const results: B2Result[] = [];
  let stoppedOn429 = false;

  for (const bot of AI_BOTS) {
    if (stoppedOn429) break;
    for (const url of pages) {
      if (stoppedOn429) break;
      await sleep(pauseMs);
      try {
        const res = await deps.fetchFn(url, {
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
      } catch {
        results.push({ bot, url, statusCode: 0, blocked: false });
      }
    }
  }

  return { measured: true, results, stoppedOn429 };
}

// ---------------------------------------------------------------------------
// B3: JS rendering
// ---------------------------------------------------------------------------

async function checkB3(
  input: TechCheckInput,
  deps: TechCheckDeps,
): Promise<TechCheckFacts['b3']> {
  const url = input.keyPages[0] ?? `${input.origin}/`;
  try {
    const { rawText, renderedText } = await deps.getPageText(url);
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
    return {
      measured: false,
      notMeasuredReason: err instanceof Error ? err.message : 'getPageText failed',
    };
  }
}

// ---------------------------------------------------------------------------
// B4: Bing indexation via SerpAPI
// ---------------------------------------------------------------------------

async function checkB4(
  input: TechCheckInput,
  deps: TechCheckDeps,
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
      const res = await deps.fetchFn(apiUrl);
      requestsUsed++;
      if (!res.ok) {
        return { measured: false, notMeasuredReason: `SerpAPI returned ${res.status}` };
      }
      const body = (await res.json()) as Record<string, unknown>;
      const organic = body['organic_results'];
      const indexed = Array.isArray(organic) && organic.length > 0;
      pagesChecked.push({ url: pageUrl, indexed });
    } catch {
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
  deps: TechCheckDeps,
): Promise<TechCheckFacts['b5']> {
  // Check sitemap
  const sitemapUrl = `${input.origin}/sitemap.xml`;
  let sitemapPresent = false;
  let sitemapUrlCount = 0;

  try {
    const res = await deps.fetchFn(sitemapUrl);
    if (res.ok) {
      const xml = await res.text();
      sitemapPresent = true;
      const urls = (xml.match(/<loc>/g) ?? []).length;
      sitemapUrlCount = Math.max(urls, input.sitemapUrls.length);
    }
  } catch {
    // not measured for sitemap is ok — sitemapPresent stays false
  }

  // Check key pages
  const pageResults: B5Page[] = [];
  for (const url of input.keyPages.slice(0, 10)) {
    const start = Date.now();
    try {
      const res = await deps.fetchFn(url);
      const ttfbMs = Date.now() - start;
      const html = await res.text();
      const canonical = extractCanonical(html);
      const isRedirect = res.status >= 300 && res.status < 400;
      pageResults.push({
        url,
        statusCode: res.status,
        canonical,
        isRedirect,
        ttfbMs,
      });
    } catch {
      pageResults.push({ url, statusCode: 0, canonical: null, isRedirect: false, ttfbMs: 0 });
    }
  }

  return { measured: true, sitemapPresent, sitemapUrlCount, pageResults };
}

// ---------------------------------------------------------------------------
// B6: Freshness signals
// ---------------------------------------------------------------------------

async function checkB6(
  input: TechCheckInput,
  deps: TechCheckDeps,
): Promise<TechCheckFacts['b6']> {
  // Parse lastmod from sitemap
  let sitemapLastmod: string | null = null;
  try {
    const res = await deps.fetchFn(`${input.origin}/sitemap.xml`);
    if (res.ok) {
      const xml = await res.text();
      const dates = extractLastmods(xml);
      if (dates.length > 0) {
        sitemapLastmod = dates.reduce((a, b) => (a > b ? a : b));
      }
    }
  } catch {
    // ignore
  }

  // Check Last-Modified headers on key pages
  let pagesWithLastModified = 0;
  let stalePageCount = 0;
  for (const url of input.keyPages.slice(0, 10)) {
    try {
      const res = await deps.fetchFn(url, { method: 'HEAD' });
      const lm = res.headers.get('Last-Modified') ?? res.headers.get('last-modified');
      if (lm) {
        pagesWithLastModified++;
        if (isStale(lm)) stalePageCount++;
      }
    } catch {
      // ignore per-page errors
    }
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
  const [b1, b2, b3, b4, b5, b6] = await Promise.all([
    Promise.resolve(checkB1(input)),
    checkB2(input, deps),
    checkB3(input, deps),
    checkB4(input, deps),
    checkB5(input, deps),
    checkB6(input, deps),
  ]);

  const data: TechCheckFacts = { b1, b2, b3, b4, b5, b6 };

  return {
    status: 'ok',
    data,
    artifacts: [],
    usage: [],
    notes: [`stepVersion:1`],
  };
}
