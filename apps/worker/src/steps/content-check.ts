import type { ModelAdapter } from '@geotrack/core/contracts/model';
import type { StepResult, UsageRecord } from '@geotrack/core';
import type {
  IntentType,
  IntentPageMap,
  PageStructureFact,
  PageStatsFact,
  PageFreshnessFact,
  PageUrlFact,
  EntityClarityFact,
  ContentCheckFacts,
} from '@geotrack/core/steps/content-check';

// ── injectable dependencies ─────────────────────────────────────────────────

export type GetPageDataFn = (url: string) => Promise<{ html: string }>;

export type ContentCheckDeps = {
  getPageData: GetPageDataFn;
  model: ModelAdapter;
  nowMs?: number;
};

// ── input ───────────────────────────────────────────────────────────────────

export type ContentCheckInput = {
  domain: string;
  entityName: string;
  categoryLabel: string;
  keyPages: string[];   // first URL is treated as the homepage
};

// ── HTML helpers ─────────────────────────────────────────────────────────────

/** Strip all HTML tags and collapse whitespace to plain text. */
export function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract first N words from plain text. */
export function firstNWords(text: string, n: number): string {
  return text.split(/\s+/).slice(0, n).join(' ');
}

/** Extract text content of the first matching tag (case-insensitive). */
function extractTag(html: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = re.exec(html);
  if (!match?.[1]) return '';
  return stripHtml(match[1]).trim();
}

/** Extract first H1 text. */
export function extractH1(html: string): string {
  return extractTag(html, 'h1');
}

/** Extract <title> text. */
export function extractTitle(html: string): string {
  return extractTag(html, 'title');
}

// ── C1: intent page detection ────────────────────────────────────────────────

const INTENT_PATTERNS: Record<IntentType, RegExp[]> = {
  pricing:      [/\/pricing\b/i, /\/plans\b/i, /\/tariff/i, /\bpric(e|ing|es)\b/i],
  comparison:   [/\-vs\-/i, /\/vs\//i, /\/compare\b/i, /\bvs\s/i, /\bcomparison\b/i],
  alternatives: [/alternativ/i],
  'use-cases':  [/use[\s\-]case/i, /\/solution/i, /\/use[\s\-]cases?\b/i],
  docs:         [/\/docs\b/i, /\/documentation\b/i, /\/help\b/i, /\/support\b/i, /\/guide/i],
  faq:          [/\/faq\b/i, /frequently[\s\-]asked/i, /\bfaq\b/i],
};

function detectIntentType(url: string, title: string, h1: string): IntentType | null {
  const haystack = `${url} ${title} ${h1}`.toLowerCase();
  for (const [type, patterns] of Object.entries(INTENT_PATTERNS) as [IntentType, RegExp[]][]) {
    if (patterns.some((p) => p.test(haystack))) return type;
  }
  return null;
}

function buildIntentPageMap(
  pages: Array<{ url: string; title: string; h1: string }>,
): { pageTypeMap: IntentPageMap; gapTypes: IntentType[] } {
  const ALL_TYPES: IntentType[] = ['pricing', 'comparison', 'alternatives', 'use-cases', 'docs', 'faq'];
  const pageTypeMap: IntentPageMap = {
    pricing: null, comparison: null, alternatives: null,
    'use-cases': null, docs: null, faq: null,
  };

  for (const { url, title, h1 } of pages) {
    const type = detectIntentType(url, title, h1);
    if (type && pageTypeMap[type] === null) {
      pageTypeMap[type] = url;
    }
  }

  return {
    pageTypeMap,
    gapTypes: ALL_TYPES.filter((t) => pageTypeMap[t] === null),
  };
}

// ── C2: LLM structure analysis ───────────────────────────────────────────────

type StructureResult = {
  url: string;
  hasAnswerFirstParagraph: boolean;
  hasQuestionHeaders: boolean;
  hasQABlocks: boolean;
};

export function buildStructurePrompt(
  pages: Array<{ url: string; text: string; firstHeading: string; firstParagraph: string }>,
): string {
  const pageBlocks = pages
    .map(
      (p) =>
        `URL: ${p.url}\nHeading: ${p.firstHeading}\nFirst paragraph: ${p.firstParagraph}\nContent sample: ${firstNWords(p.text, 300)}`,
    )
    .join('\n\n---\n\n');

  return [
    'You are a content structure analyzer.',
    '',
    'For each page below, analyze the content and return a JSON array.',
    'Each item: {"url":"...","hasAnswerFirstParagraph":bool,"hasQuestionHeaders":bool,"hasQABlocks":bool}',
    '',
    'Rules:',
    '- hasAnswerFirstParagraph: true if the first paragraph directly answers the main heading question',
    '- hasQuestionHeaders: true if at least one heading (H2 or H3) is phrased as a question (ends with ?)',
    '- hasQABlocks: true if there is a visible FAQ or Q&A section',
    '',
    'Pages:',
    pageBlocks,
    '',
    'Return JSON array only.',
  ].join('\n');
}

export function parseStructureResults(text: string, urls: string[]): StructureResult[] {
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return urls.map((url) => fallbackStructure(url));
    const parsed = JSON.parse(match[0]) as unknown[];
    if (!Array.isArray(parsed)) return urls.map((url) => fallbackStructure(url));
    return urls.map((url) => {
      const found = parsed.find(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null && (item as Record<string, unknown>)['url'] === url,
      );
      if (!found) return fallbackStructure(url);
      return {
        url,
        hasAnswerFirstParagraph: !!found['hasAnswerFirstParagraph'],
        hasQuestionHeaders: !!found['hasQuestionHeaders'],
        hasQABlocks: !!found['hasQABlocks'],
      };
    });
  } catch {
    return urls.map((url) => fallbackStructure(url));
  }
}

function fallbackStructure(url: string): StructureResult {
  return { url, hasAnswerFirstParagraph: false, hasQuestionHeaders: false, hasQABlocks: false };
}

function hasListsOrTablesInHtml(html: string): boolean {
  return /<ul\b|<ol\b|<table\b/i.test(html);
}

function extractFirstHeading(html: string): string {
  const match = /<h[1-6][^>]*>([^<]*)<\/h[1-6]>/i.exec(html);
  return (match?.[1] ?? '').trim();
}

function extractFirstParagraph(html: string): string {
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const text = stripHtml(match[1] ?? '').trim();
    if (text.length >= 20) return text.slice(0, 300);
  }
  return '';
}

// ── C3: stats density ────────────────────────────────────────────────────────

const NUMERIC_FACT_RE = /\b\d+\.?\d*\s*(%|x\b|times\b|percent)/gi;
const SIMPLE_NUMBER_RE = /\b\d{2,}\b/g; // 2+ digit numbers as facts
const CITATION_RE = /\[\d+\]|\(\w[\w\s]+,\s*\d{4}\)|\[\w[\w\s]+\s+\d{4}\]/g;

export function computeStatsFact(url: string, text: string): PageStatsFact {
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const per1k = wordCount > 0 ? 1000 / wordCount : 0;

  const numericWithUnits = text.match(NUMERIC_FACT_RE)?.length ?? 0;
  // Remove already-counted numbers before applying simple number regex
  const textWithoutUnits = text.replace(NUMERIC_FACT_RE, ' COUNTED ');
  const simpleNumbers = textWithoutUnits.match(SIMPLE_NUMBER_RE)?.length ?? 0;
  const numericMatches = numericWithUnits + simpleNumbers;
  const citationMatches = text.match(CITATION_RE)?.length ?? 0;

  return {
    url,
    wordCount,
    numericFactsPer1kWords: Math.round(numericMatches * per1k * 10) / 10,
    citationPatternsPer1kWords: Math.round(citationMatches * per1k * 10) / 10,
  };
}

// ── C4: freshness ────────────────────────────────────────────────────────────

const DATE_PATTERNS = [
  // 1. JSON-LD (highest priority)
  /"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})/,
  /"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})/,
  // 2. Specific meta tags (before generic content= catch-all)
  /property="article:modified_time"[^>]+content="([^"]+)"/i,
  /name="last-modified"[^>]+content="([^"]+)"/i,
  // 3. Generic Open Graph content= with ISO date
  /property="[^"]*"[^>]+content="(\d{4}-\d{2}-\d{2})/i,
  // 4. Visible text patterns (lowest priority)
  /(?:updated?|last\s+updated?|modified)\s*:?\s*(\w+\s+\d{1,2},?\s+\d{4})/i,
  /(?:updated?|last\s+updated?|modified)\s*:?\s*(\w+\s+\d{4})/i,
];

const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function parseFlexibleDate(raw: string): string | null {
  // Try ISO first
  const iso = /(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (iso) return iso[1]!;

  // "Month YYYY" or "Month DD, YYYY"
  const monthYearFull = /(\w+)\s+(\d{1,2}),?\s+(\d{4})/.exec(raw);
  if (monthYearFull) {
    const month = MONTH_MAP[monthYearFull[1]!.toLowerCase()];
    if (month) return `${monthYearFull[3]}-${String(month).padStart(2, '0')}-${String(monthYearFull[2]).padStart(2, '0')}`;
  }

  const monthYear = /(\w+)\s+(\d{4})/.exec(raw);
  if (monthYear) {
    const month = MONTH_MAP[monthYear[1]!.toLowerCase()];
    if (month) return `${monthYear[2]}-${String(month).padStart(2, '0')}-01`;
  }

  return null;
}

export function extractLastModified(html: string): string | null {
  for (const pattern of DATE_PATTERNS) {
    const match = pattern.exec(html);
    if (match?.[1]) {
      const parsed = parseFlexibleDate(match[1]);
      if (parsed) return parsed;
    }
  }
  return null;
}

function computeFreshnessFact(url: string, html: string, nowMs: number): PageFreshnessFact {
  const lastModified = extractLastModified(html);
  const ageDays =
    lastModified !== null
      ? Math.round((nowMs - new Date(lastModified).getTime()) / 86_400_000)
      : null;
  return { url, lastModified, ageDays };
}

// ── C5: LLM entity clarity ───────────────────────────────────────────────────

export function buildEntityClarityPrompt(entityName: string, categoryLabel: string, text: string): string {
  return [
    'You are checking whether a homepage clearly communicates what the product is.',
    '',
    `Product name: ${entityName}`,
    `Category: ${categoryLabel}`,
    '',
    `First 100 words of homepage:`,
    `"${text}"`,
    '',
    'Return JSON only: {"entityMentioned":bool,"categoryMentioned":bool,"targetAudienceMentioned":bool}',
    '- entityMentioned: the product/brand name appears in these 100 words',
    '- categoryMentioned: the product category or main use case is mentioned',
    '- targetAudienceMentioned: the target audience (who this is for) is mentioned',
  ].join('\n');
}

export function parseEntityClarityResult(text: string): Omit<EntityClarityFact, 'testedText'> | null {
  try {
    const match = text.match(/\{[^}]+\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    return {
      entityMentioned: !!parsed['entityMentioned'],
      categoryMentioned: !!parsed['categoryMentioned'],
      targetAudienceMentioned: !!parsed['targetAudienceMentioned'],
    };
  } catch {
    return null;
  }
}

// ── C6: URL/title quality ────────────────────────────────────────────────────

const UNREADABLE_SEGMENT_RE = /[0-9a-f]{8,}|^\d{4,}$|[0-9]{6,}/i;

export function isUrlReadable(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) return true; // root page
    return segments.every((seg) => !UNREADABLE_SEGMENT_RE.test(seg));
  } catch {
    return false;
  }
}

function buildUrlFact(url: string, html: string): PageUrlFact {
  return {
    url,
    title: extractTitle(html),
    h1: extractH1(html),
    urlReadable: isUrlReadable(url),
  };
}

// ── median helper ─────────────────────────────────────────────────────────────

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

// ── main step ────────────────────────────────────────────────────────────────

export async function analyzeContent(
  input: ContentCheckInput,
  deps: ContentCheckDeps,
): Promise<StepResult<ContentCheckFacts>> {
  const nowMs = deps.nowMs ?? Date.now();
  const usageRecords: UsageRecord[] = [];
  const notes: string[] = [];

  // Load pages
  const pageData: Array<{ url: string; html: string }> = [];
  for (const url of input.keyPages.slice(0, 10)) {
    try {
      const { html } = await deps.getPageData(url);
      pageData.push({ url, html });
    } catch (err) {
      notes.push(`page_fetch_failed: ${url} — ${String(err)}`);
    }
  }

  if (pageData.length === 0) {
    return {
      status: 'ok',
      data: {
        analyzedPageCount: 0,
        c1: { pageTypeMap: { pricing: null, comparison: null, alternatives: null, 'use-cases': null, docs: null, faq: null }, gapTypes: ['pricing', 'comparison', 'alternatives', 'use-cases', 'docs', 'faq'] },
        c2: { pages: [] },
        c3: { pages: [], medianNumericFactsPer1kWords: 0 },
        c4: { pages: [], medianAgeDays: null },
        c5: { entityMentioned: false, categoryMentioned: false, targetAudienceMentioned: false, testedText: '' },
        c6: { pages: [], readableUrlRatio: 0 },
      },
      artifacts: [],
      usage: [],
      notes,
    };
  }

  // Pre-extract text/metadata for each page
  const pageMeta = pageData.map(({ url, html }) => ({
    url,
    html,
    text: stripHtml(html),
    title: extractTitle(html),
    h1: extractH1(html),
    firstHeading: extractFirstHeading(html),
    firstParagraph: extractFirstParagraph(html),
  }));

  // C1
  const c1 = buildIntentPageMap(pageMeta);

  // C2 (LLM)
  const structurePrompt = buildStructurePrompt(
    pageMeta.map((p) => ({
      url: p.url,
      text: p.text,
      firstHeading: p.firstHeading,
      firstParagraph: p.firstParagraph,
    })),
  );
  let structureResults: StructureResult[] = pageMeta.map((p) => fallbackStructure(p.url));
  try {
    const structureAnswer = await deps.model.generate(structurePrompt, { jsonMode: true, timeoutMs: 30_000 });
    usageRecords.push(structureAnswer.usage);
    structureResults = parseStructureResults(structureAnswer.text, pageMeta.map((p) => p.url));
  } catch (err) {
    notes.push(`c2_llm_failed: ${String(err)}`);
    // partial: keep fallback
  }

  const c2Pages: PageStructureFact[] = pageMeta.map((p, i) => ({
    ...structureResults[i]!,
    hasListsOrTables: hasListsOrTablesInHtml(p.html),
  }));

  // C3 (heuristic)
  const c3Pages = pageMeta.map((p) => computeStatsFact(p.url, p.text));
  const medianNumeric = median(c3Pages.map((p) => p.numericFactsPer1kWords)) ?? 0;

  // C4 (deterministic)
  const c4Pages = pageMeta.map((p) => computeFreshnessFact(p.url, p.html, nowMs));
  const ageDaysValues = c4Pages.map((p) => p.ageDays).filter((d): d is number => d !== null);
  const medianAgeDays = median(ageDaysValues);

  // C5 (LLM — homepage only)
  const homepage = pageMeta[0]!;
  const testedText = firstNWords(homepage.text, 100);
  const clarityPrompt = buildEntityClarityPrompt(input.entityName, input.categoryLabel, testedText);
  let c5: EntityClarityFact = {
    entityMentioned: false,
    categoryMentioned: false,
    targetAudienceMentioned: false,
    testedText,
  };
  try {
    const clarityAnswer = await deps.model.generate(clarityPrompt, { jsonMode: true, timeoutMs: 15_000 });
    usageRecords.push(clarityAnswer.usage);
    const parsed = parseEntityClarityResult(clarityAnswer.text);
    if (parsed) {
      c5 = { ...parsed, testedText };
    }
  } catch (err) {
    notes.push(`c5_llm_failed: ${String(err)}`);
    // partial: keep fallback
  }

  // C6 (deterministic)
  const c6Pages: PageUrlFact[] = pageMeta.map((p) => buildUrlFact(p.url, p.html));
  const readableCount = c6Pages.filter((p) => p.urlReadable).length;
  const readableUrlRatio = c6Pages.length > 0 ? readableCount / c6Pages.length : 0;

  return {
    status: 'ok',
    data: {
      analyzedPageCount: pageData.length,
      c1,
      c2: { pages: c2Pages },
      c3: { pages: c3Pages, medianNumericFactsPer1kWords: medianNumeric },
      c4: { pages: c4Pages, medianAgeDays },
      c5,
      c6: { pages: c6Pages, readableUrlRatio },
    },
    artifacts: [],
    usage: usageRecords,
    notes,
  };
}
