import type { ModelAdapter } from '@geotrack/core/contracts/model';
import type { StepResult, SourceMapOutput, ModelAnswer } from '@geotrack/core';
import type { CitedPageFact, CitedPagesOutput } from '@geotrack/core/steps/cited-pages';
import type { PageStructureFact, PageStatsFact, PageFreshnessFact } from '@geotrack/core/steps/content-check';
import {
  stripHtml,
  computeStatsFact,
  extractLastModified,
  buildStructurePrompt,
  parseStructureResults,
} from './content-check.js';

// ── injectable dependencies ──────────────────────────────────────────────────

export type GetPageDataFn = (url: string) => Promise<{ html: string }>;

export type CitedPagesDeps = {
  getPageData: GetPageDataFn;
  model: ModelAdapter;
  nowMs?: number;
};

// ── input ────────────────────────────────────────────────────────────────────

export type CitedPagesInput = {
  entityName: string;
  competitorNames: string[];
  sourceMap: SourceMapOutput;
  maxPages?: number;
};

// ── helpers ──────────────────────────────────────────────────────────────────

function extractFirstHeadingText(html: string): string {
  const match = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(html);
  if (!match?.[1]) return '';
  return stripHtml(match[1]).trim();
}

function extractFirstParagraphText(html: string): string {
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const text = stripHtml(match[1] ?? '').trim();
    if (text.length >= 20) return text.slice(0, 300);
  }
  return '';
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

function ratio(values: boolean[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.filter(Boolean).length / values.length) * 1000) / 1000;
}

function mentionsName(text: string, name: string): boolean {
  if (!name.trim()) return false;
  return text.toLowerCase().includes(name.toLowerCase());
}

function getDomainForUrl(url: string, sourceMap: SourceMapOutput): string {
  for (const entry of sourceMap.entries) {
    if (entry.urls.includes(url)) return entry.domain;
  }
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function getCitedCountForUrl(url: string, sourceMap: SourceMapOutput): number {
  for (const entry of sourceMap.entries) {
    if (entry.urls.includes(url)) return entry.citedCount;
  }
  return 1;
}

// ── main step ────────────────────────────────────────────────────────────────

export async function analyzeCitedPages(
  input: CitedPagesInput,
  deps: CitedPagesDeps,
): Promise<StepResult<CitedPagesOutput>> {
  const nowMs = deps.nowMs ?? Date.now();
  const maxPages = input.maxPages ?? 20;

  // 1. Select top non-client URLs sorted by citedCount DESC, deduplicated
  const seenUrls = new Set<string>();
  const candidateUrls: string[] = [];

  const sortedEntries = [...input.sourceMap.entries].sort((a, b) => b.citedCount - a.citedCount);

  for (const entry of sortedEntries) {
    if (entry.isClientDomain) continue;
    for (const url of entry.urls) {
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        candidateUrls.push(url);
        if (candidateUrls.length >= maxPages) break;
      }
    }
    if (candidateUrls.length >= maxPages) break;
  }

  // 2. Fetch pages
  const usageRecords: ModelAnswer['usage'][] = [];

  type FetchedPage = {
    url: string;
    html: string;
    text: string;
    firstHeading: string;
    firstParagraph: string;
  };

  const fetchedPages: FetchedPage[] = [];
  const notes: string[] = [];

  for (const url of candidateUrls) {
    try {
      const { html } = await deps.getPageData(url);
      fetchedPages.push({
        url,
        html,
        text: stripHtml(html),
        firstHeading: extractFirstHeadingText(html),
        firstParagraph: extractFirstParagraphText(html),
      });
    } catch {
      notes.push(`fetch failed: ${url}`);
    }
  }

  if (fetchedPages.length === 0) {
    return {
      status: 'ok',
      data: {
        analyzedPageCount: 0,
        pages: [],
        medianHasAnswerFirstParagraphRatio: 0,
        medianHasListsOrTablesRatio: 0,
        medianNumericFactsPer1kWords: 0,
        medianAgeDays: null,
        pagesWithClientMentionCount: 0,
      },
      artifacts: [],
      usage: usageRecords,
      notes,
    };
  }

  // 3. C3 (stats) and C4 (freshness) — deterministic
  const statsMap = new Map<string, PageStatsFact>();
  const freshnessMap = new Map<string, PageFreshnessFact>();

  for (const p of fetchedPages) {
    statsMap.set(p.url, computeStatsFact(p.url, p.text));
    const lastModified = extractLastModified(p.html);
    const ageDaysRaw =
      lastModified !== null
        ? Math.round((nowMs - new Date(lastModified).getTime()) / 86_400_000)
        : null;
    const ageDays = ageDaysRaw !== null && Number.isFinite(ageDaysRaw) ? ageDaysRaw : null;
    freshnessMap.set(p.url, { url: p.url, lastModified, ageDays });
  }

  // 4. C2 (structure) — batched LLM call
  const structureMap = new Map<string, PageStructureFact>();

  try {
    const structurePrompt = buildStructurePrompt(
      fetchedPages.map((p) => ({
        url: p.url,
        text: p.text,
        firstHeading: p.firstHeading,
        firstParagraph: p.firstParagraph,
      })),
    );
    const answer = await deps.model.generate(structurePrompt, { jsonMode: true, timeoutMs: 30_000 });
    usageRecords.push(answer.usage);
    const structureResults = parseStructureResults(answer.text, fetchedPages.map((p) => p.url));

    for (const result of structureResults) {
      const html = fetchedPages.find((p) => p.url === result.url)?.html ?? '';
      structureMap.set(result.url, {
        url: result.url,
        hasAnswerFirstParagraph: result.hasAnswerFirstParagraph,
        hasQuestionHeaders: result.hasQuestionHeaders,
        hasQABlocks: result.hasQABlocks,
        hasListsOrTables: /<ul\b|<ol\b|<table\b/i.test(html),
      });
    }
  } catch {
    notes.push('C2 LLM call failed — fallback to false for all pages');
    for (const p of fetchedPages) {
      structureMap.set(p.url, {
        url: p.url,
        hasAnswerFirstParagraph: false,
        hasQuestionHeaders: false,
        hasQABlocks: false,
        hasListsOrTables: /<ul\b|<ol\b|<table\b/i.test(p.html),
      });
    }
  }

  // 5. Assemble CitedPageFact entries
  const pages: CitedPageFact[] = [];

  for (const p of fetchedPages) {
    const mentionedCompetitors = input.competitorNames.filter((name) =>
      mentionsName(p.text, name),
    );

    pages.push({
      url: p.url,
      domain: getDomainForUrl(p.url, input.sourceMap),
      citedCount: getCitedCountForUrl(p.url, input.sourceMap),
      structure: structureMap.get(p.url) ?? {
        url: p.url,
        hasAnswerFirstParagraph: false,
        hasQuestionHeaders: false,
        hasQABlocks: false,
        hasListsOrTables: false,
      },
      stats: statsMap.get(p.url) ?? { url: p.url, wordCount: 0, numericFactsPer1kWords: 0, citationPatternsPer1kWords: 0 },
      freshness: freshnessMap.get(p.url) ?? { url: p.url, lastModified: null, ageDays: null },
      mentionsClient: mentionsName(p.text, input.entityName),
      mentionedCompetitors,
    });
  }

  // 6. Compute aggregate metrics
  const ageDaysValues = pages.map((p) => p.freshness.ageDays).filter((v): v is number => v !== null && Number.isFinite(v));

  return {
    status: 'ok',
    data: {
      analyzedPageCount: pages.length,
      pages,
      medianHasAnswerFirstParagraphRatio: ratio(pages.map((p) => p.structure.hasAnswerFirstParagraph)),
      medianHasListsOrTablesRatio: ratio(pages.map((p) => p.structure.hasListsOrTables)),
      medianNumericFactsPer1kWords: median(pages.map((p) => p.stats.numericFactsPer1kWords)),
      medianAgeDays: ageDaysValues.length > 0 ? median(ageDaysValues) : null,
      pagesWithClientMentionCount: pages.filter((p) => p.mentionsClient).length,
    },
    artifacts: [],
    usage: usageRecords,
    notes,
  };
}
