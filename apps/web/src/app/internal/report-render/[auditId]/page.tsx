import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { eq, inArray, sql } from 'drizzle-orm';
import { createClient } from '@geotrack/db/client';
import {
  audits,
  scores,
  findings,
  techChecks,
  mentions,
  engineRuns,
  prompts,
} from '@geotrack/db/schema';
import { isValidServiceKey } from '@/lib/service-auth';
import ReportPdfContent, {
  type ReportPdfContentProps,
  type PdfPillarTableRow,
  type PdfPillarSection,
  type PdfCompetitorRow,
  type PdfFixPlanItem,
  type PdfAppendixRow,
} from './report-pdf-content';

const PILLAR_ORDER = ['A', 'B', 'C', 'D', 'E'];

const PILLAR_LABELS: Record<string, string> = {
  A: 'Answer Visibility',
  B: 'AI Crawlability',
  C: 'Content Citability',
  D: 'Entity & Authority',
  E: 'Agent-Readiness',
};

const PILLAR_SUMMARIES: Record<string, string> = {
  A: 'How often AI assistants mention this brand when buyers ask category questions.',
  B: 'Whether AI crawlers can reach the site at all.',
  C: 'Whether the content is structured so assistants can quote it accurately.',
  D: "How consistently the web recognizes this brand as a distinct, credible entity.",
  E: 'Whether the site exposes machine-readable information for agents.',
};

const TECH_CHECK_LABELS: Record<string, string> = {
  b1: 'robots.txt allows GPTBot',
  b2: 'PerplexityBot not HTTP-blocked',
  b3: 'Key pages render without JavaScript',
  b4: 'Pages indexed in Bing',
  b5: 'llms.txt found',
  b6: 'Sitemap.xml present',
  a1: 'Mentioned in discovery prompts',
  a2: 'Mentioned in comparison prompts',
};

function techCheckLabel(criterion: string, details: Record<string, unknown>): string {
  if (details && typeof details.label === 'string') return details.label;
  // `criterion` comes straight from the DB, so an own-property check is required:
  // a plain-object lookup would resolve keys like 'toString' or 'valueOf' up the
  // prototype chain to a function, which neither `??` nor the declared return
  // type would catch (and React would then throw on a non-string child).
  return Object.hasOwn(TECH_CHECK_LABELS, criterion) ? TECH_CHECK_LABELS[criterion] : criterion;
}

// All data loading lives here, outside the component, so that every DB error
// degrades to `null` → notFound() instead of an unhandled 500 (a non-UUID
// auditId alone makes Postgres raise `invalid input syntax for type uuid`).
// Same pattern as the T-43 report page. notFound() is deliberately never called
// from inside this function: it throws a Next.js control-flow error that a
// catch-all here would swallow.
async function loadReportPdfProps(
  auditId: string,
  databaseUrl: string,
): Promise<ReportPdfContentProps | null> {
  // Both catches log before degrading: a silent 404 leaves the worker with
  // nothing but "internal render route returned 404" and loses the root cause
  // (which is not always the expected non-UUID auditId). Same precedent as
  // opengraph-image.tsx. Only the auditId and the error are logged — never the
  // connection string or the service key.
  let db: ReturnType<typeof createClient>;
  try {
    db = createClient(databaseUrl);
  } catch (err) {
    console.error(`[internal-report-render] DB client init failed, returning 404 for auditId=${auditId}:`, err);
    return null;
  }

  try {
    return await loadFromDb(db, auditId);
  } catch (err) {
    console.error(`[internal-report-render] DB error, returning 404 for auditId=${auditId}:`, err);
    return null;
  }
}

async function loadFromDb(
  db: ReturnType<typeof createClient>,
  auditId: string,
): Promise<ReportPdfContentProps | null> {
  const [audit] = await db.select().from(audits).where(eq(audits.id, auditId)).limit(1);
  if (!audit) return null;

  // --- scores ---
  const scoreRows = await db.select().from(scores).where(eq(scores.auditId, auditId));
  const scoreMap = new Map(
    scoreRows.map((s) => [
      `${s.scope}:${s.key}`,
      {
        score: parseFloat(s.score),
        low: s.confidenceLow !== null ? parseFloat(s.confidenceLow) : null,
        high: s.confidenceHigh !== null ? parseFloat(s.confidenceHigh) : null,
      },
    ]),
  );
  const overallEntry = scoreMap.get('overall:total') ?? scoreMap.get('total:score') ?? null;

  const pillarTable: PdfPillarTableRow[] = PILLAR_ORDER.map((key) => {
    const entry = scoreMap.get(`pillar:${key}`);
    const median = scoreMap.get(`category_median:${key}`);
    return {
      key,
      label: PILLAR_LABELS[key] ?? key,
      score: entry?.score ?? null,
      medianScore: median?.score ?? null,
    };
  });

  // --- findings, grouped by pillar (first letter of criterionKey) ---
  const findingRows = await db
    .select()
    .from(findings)
    .where(eq(findings.auditId, auditId))
    .orderBy(findings.priority);

  const findingsByPillar = new Map<string, typeof findingRows>();
  for (const f of findingRows) {
    const pillarKey = f.criterionKey.charAt(0).toUpperCase();
    const list = findingsByPillar.get(pillarKey) ?? [];
    list.push(f);
    findingsByPillar.set(pillarKey, list);
  }

  // --- tech checks, grouped by pillar ---
  const techCheckRows = await db.select().from(techChecks).where(eq(techChecks.auditId, auditId));
  const passedByPillar = new Map<string, string[]>();
  for (const tc of techCheckRows) {
    if (tc.score === null || parseFloat(tc.score) <= 0) continue;
    const pillarKey = tc.criterion.charAt(0).toUpperCase();
    const list = passedByPillar.get(pillarKey) ?? [];
    list.push(techCheckLabel(tc.criterion, tc.details as Record<string, unknown>));
    passedByPillar.set(pillarKey, list);
  }

  const pillarSections: PdfPillarSection[] = PILLAR_ORDER.map((key) => {
    const topFinding = findingsByPillar.get(key)?.[0];
    return {
      key,
      label: PILLAR_LABELS[key] ?? key,
      summary: PILLAR_SUMMARIES[key] ?? '',
      exampleFinding: topFinding
        ? {
            impact: topFinding.impact,
            title: topFinding.title,
            description: topFinding.description,
            expectedScoreDelta: topFinding.expectedScoreDelta !== null ? parseFloat(topFinding.expectedScoreDelta) : null,
            effortLabel: topFinding.effort || null,
          }
        : null,
      passedChecks: passedByPillar.get(key) ?? [],
    };
  });

  // --- fix plan: all findings, priority order (see report-pdf-content.tsx note on
  // why this isn't split into Quick wins / Strategic — no hours field to bucket by) ---
  const fixPlan: PdfFixPlanItem[] = findingRows.map((f) => ({
    title: f.title,
    expectedScoreDelta: f.expectedScoreDelta !== null ? parseFloat(f.expectedScoreDelta) : null,
    effortLabel: f.effort || null,
  }));

  // --- competitors: aggregate mentions by brand across all engine runs ---
  const mentionRows = await db
    .select({
      brand: mentions.brand,
      engineRunId: mentions.engineRunId,
      position: mentions.position,
      sentiment: mentions.sentiment,
    })
    .from(mentions)
    .where(eq(mentions.auditId, auditId))
    // orderBy is required for the same reason as in the appendix query below:
    // without it Postgres may return rows in a different order on each render,
    // and `sentiment` below is taken from the first row of each brand — so two
    // PDFs of the same audit could disagree. `id` is the primary key, so the
    // order is total.
    .orderBy(mentions.brand, mentions.createdAt, mentions.id);

  const totalRuns = await db
    .select({ count: sql<number>`count(*)` })
    .from(engineRuns)
    .where(eq(engineRuns.auditId, auditId));
  const totalRunCount = Number(totalRuns[0]?.count ?? 0);

  // `runIds` (not a raw row count): `mentions` has no uniqueness constraint on
  // (engine_run_id, brand), so counting rows can exceed the number of runs and
  // print a mention rate above 100%. The share is "runs that mentioned the brand".
  const byBrand = new Map<string, { positions: number[]; sentiments: string[]; runIds: Set<string> }>();
  for (const m of mentionRows) {
    const entry = byBrand.get(m.brand) ?? { positions: [], sentiments: [], runIds: new Set<string>() };
    entry.runIds.add(m.engineRunId);
    if (m.position !== null) entry.positions.push(m.position);
    entry.sentiments.push(m.sentiment);
    byBrand.set(m.brand, entry);
  }

  // Heuristic brand name for the audited site: strip a leading "www." and take
  // the first label (so "www.acme.co.uk" → "acme"). There is no brand-name field
  // in the schema yet; this stays a heuristic until one exists.
  const targetBrand = audit.domain.toLowerCase().replace(/^www\./, '').split('.')[0] ?? '';

  const competitors: PdfCompetitorRow[] = Array.from(byBrand.entries())
    .map(([brand, data]) => ({
      brand,
      isTarget: brand.toLowerCase() === targetBrand,
      mentionsPct: totalRunCount > 0 ? data.runIds.size / totalRunCount : null,
      // Citation rate per brand isn't computed anywhere in the pipeline yet
      // (no "cited" signal distinct from "mentioned" — see docs/specs/debt.md).
      citationsPct: null,
      avgPosition: data.positions.length > 0 ? data.positions.reduce((a, b) => a + b, 0) / data.positions.length : null,
      sentiment: data.sentiments[0] ?? null,
    }))
    // The brand tie-breaker is not cosmetic: with `totalRunCount === 0` every
    // mentionsPct is null, so the primary comparison returns 0 for every pair
    // and the resulting order would depend on the input order. Ties must resolve
    // the same way on every render for the step to stay idempotent.
    .sort(
      (a, b) =>
        (b.mentionsPct ?? 0) - (a.mentionsPct ?? 0) ||
        (a.brand < b.brand ? -1 : a.brand > b.brand ? 1 : 0),
    );

  // --- appendix: prompts & answers, up to 20 rows ---
  // orderBy is required, not cosmetic: `limit(20)` without it lets Postgres
  // return a different subset/order on each render, which would break step
  // idempotency (two PDFs of the same audit must have the same appendix).
  // The prompt is joined instead of fetched per run (was 1 + 2N round-trips).
  const appendixEngineRuns = await db
    .select({
      id: engineRuns.id,
      engine: engineRuns.engine,
      promptText: prompts.text,
      promptType: prompts.promptType,
      answerPreview: engineRuns.responseTextPreview,
    })
    .from(engineRuns)
    .leftJoin(prompts, eq(prompts.id, engineRuns.promptId))
    .where(eq(engineRuns.auditId, auditId))
    .orderBy(engineRuns.createdAt, engineRuns.id)
    .limit(20);

  const appendixRunIds = appendixEngineRuns.map((run) => run.id);
  const appendixMentions =
    appendixRunIds.length > 0
      ? await db
          .select({ engineRunId: mentions.engineRunId, brand: mentions.brand })
          .from(mentions)
          .where(inArray(mentions.engineRunId, appendixRunIds))
      : [];
  // "Mentioned" means the audited brand itself showed up in this run's answer —
  // not "some brand (possibly a competitor) ranked #1", which is what an earlier
  // version of this check did (`position === 1` with no brand filter). Uses the
  // same targetBrand heuristic as the competitors table above, so the appendix
  // and the competitors section agree on what "the target brand" means.
  const mentionedRunIds = new Set(
    appendixMentions
      .filter((m) => m.brand.toLowerCase() === targetBrand)
      .map((m) => m.engineRunId),
  );

  const appendixRows: PdfAppendixRow[] = appendixEngineRuns.map((run) => ({
    engine: run.engine,
    promptType: run.promptType ?? '',
    promptText: run.promptText ?? '',
    answerPreview: run.answerPreview ?? null,
    mentioned: mentionedRunIds.has(run.id),
  }));

  return {
    domain: audit.domain,
    auditDateLabel: new Date(audit.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    methodologyVersion: audit.methodologyVersion,
    overallScore: overallEntry?.score ?? null,
    scoreIntervalLow: overallEntry?.low ?? null,
    scoreIntervalHigh: overallEntry?.high ?? null,
    categoryMedian: scoreMap.get('category_median:overall')?.score ?? null,
    // "What capped your score" needs applied-blocker data, which score.compute
    // doesn't persist anywhere queryable yet (packages/core returns it in memory
    // only) — omitted rather than guessed. See docs/specs/debt.md.
    cappedPillarNotes: [],
    pillarTable,
    pillarSections,
    competitors,
    fixPlan,
    appendixRows,
  };
}

export default async function InternalReportRenderPage({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;
  const requestHeaders = await headers();
  if (!isValidServiceKey(requestHeaders)) notFound();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) notFound();

  const props = await loadReportPdfProps(auditId, databaseUrl);
  if (!props) notFound();

  return <ReportPdfContent {...props} />;
}
