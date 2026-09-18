import { notFound } from 'next/navigation';
import { eq, asc } from 'drizzle-orm';
import { createClient } from '@geotrack/db/client';
import {
  audits,
  scores,
  findings,
  techChecks,
  engineRuns,
  mentions,
  prompts,
} from '@geotrack/db/schema';
import ReportContent, {
  type ReportContentProps,
  type PillarScore,
  type FindingRow,
  type CitationData,
  type LockedFindingRow,
  type TechCheckItem,
  type MentionedBrand,
} from './report-content';
import AuditProgress from './audit-progress';

// ---- pillar display config --------------------------------------------------

const PILLAR_ORDER = ['A', 'B', 'C', 'D', 'E'];
// ---- tech check label mapping -----------------------------------------------

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
  return TECH_CHECK_LABELS[criterion] ?? criterion;
}

// ---- engine display name ----------------------------------------------------

function engineName(engine: string): string {
  switch (engine) {
    case 'perplexity': return 'Perplexity';
    case 'chatgpt': return 'ChatGPT';
    case 'gemini': return 'Gemini';
    default: return engine.charAt(0).toUpperCase() + engine.slice(1);
  }
}


// ---- demo data (shown when DATABASE_URL is not configured) ------------------

const DEMO_PROPS: ReportContentProps = {
  domain: 'acme.com',
  overallScore: 4.2,
  promptCount: 12,
  engineCount: 1,
  pillars: [
    { key: 'A', score: 2.8, medianScore: 5.2 },
    { key: 'B', score: 6.1, medianScore: 5.6 },
    { key: 'C', score: 3.5, medianScore: 4.9 },
    { key: 'D', score: 5.9, medianScore: 5.0 },
    { key: 'E', score: 2.6, medianScore: 4.4 },
  ],
  techChecks: [
    { label: 'robots.txt allows GPTBot', passing: true },
    { label: 'sitemap.xml present', passing: true },
    { label: 'llms.txt found', passing: true },
    { label: 'Key pages render without JavaScript', passing: true },
  ],
  findings: [
    {
      id: '1',
      title: 'PerplexityBot gets 403 from Cloudflare',
      description: 'Your Cloudflare WAF returns 403 to PerplexityBot, so Perplexity can\'t read any page on your site.',
      impact: 'critical',
      expectedScoreDelta: -0.6,
      evidence: {
        type: 'code',
        caption: 'Response headers',
        text: 'GET / HTTP/1.1\nUser-Agent: PerplexityBot/1.0\n\nHTTP/1.1 403 Forbidden\ncf-mitigated: challenge\nserver: cloudflare',
      },
    },
    {
      id: '2',
      title: 'Your pricing page is not indexed in Bing',
      description: 'Bing hasn\'t indexed /pricing, so Copilot can\'t cite your pricing directly.',
      impact: 'warning',
      expectedScoreDelta: -0.3,
      evidence: {
        type: 'table',
        caption: 'Bing index status',
        headers: ['Page', 'Indexed'],
        rows: [['/', 'Yes'], ['/pricing', 'No'], ['/features', 'Yes']],
      },
    },
    {
      id: '3',
      title: 'Not mentioned in 11 of 12 discovery prompts',
      description: 'Across the 12 buyer questions we asked, your brand appeared once.',
      impact: 'critical',
      expectedScoreDelta: -0.8,
      evidence: {
        type: 'table',
        caption: 'Prompt coverage (sample of 12)',
        headers: ['Prompt', 'Mentioned'],
        rows: [
          ['best time tracking for agencies', 'No'],
          ['billing software for design agencies', 'No'],
          ['agency time tracking with invoicing', 'No'],
        ],
      },
    },
  ],
  citation: {
    engine: 'Perplexity',
    promptText: 'best time tracking software for agencies',
    responsePreview: 'For agencies tracking billable hours, Toggl, Harvest and Clockify are the most recommended tools.',
    brands: [
      { brand: 'Toggl', isTarget: false },
      { brand: 'Harvest', isTarget: false },
      { brand: 'Clockify', isTarget: false },
    ],
    targetMentioned: false,
  },
  lockedFindings: [
    { impact: 'critical', delta: -0.9, title: 'Agent could not find pricing in 3 of 3 attempts' },
    { impact: 'critical', delta: -0.7, title: 'No llms.txt published' },
    { impact: 'critical', delta: -0.6, title: 'GPTBot blocked on 2 subdirectories' },
    { impact: 'warning', delta: -0.5, title: 'No Product schema on pricing page' },
    { impact: 'warning', delta: -0.4, title: 'No independent press coverage in 12 months' },
    { impact: 'warning', delta: -0.4, title: 'Inconsistent NAP across directories' },
    { impact: 'warning', delta: -0.3, title: 'Wikidata entry missing' },
    { impact: 'warning', delta: -0.3, title: 'Stale content dates on key pages' },
    { impact: 'notice', delta: -0.2, title: 'FAQ content not machine-parseable' },
    { impact: 'notice', delta: -0.2, title: 'Canonical tags inconsistent' },
    { impact: 'notice', delta: -0.1, title: 'Slow time-to-first-byte on 2 pages' },
    { impact: 'notice', delta: -0.1, title: 'Missing alt text on product screenshots' },
  ],
  lockedFindingsCost: -4.7,
};

// ---- server component -------------------------------------------------------

const READY_STATUSES = new Set(['completed', 'in_review', 'delivered']);

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ auditId: string }>;
  searchParams: Promise<{ pt?: string }>;
}) {
  const { auditId } = await params;
  const { pt } = await searchParams;

  if (!process.env.DATABASE_URL) {
    return <ReportContent {...DEMO_PROPS} />;
  }

  let db: ReturnType<typeof createClient>;
  try {
    db = createClient(process.env.DATABASE_URL);
  } catch {
    return <ReportContent {...DEMO_PROPS} />;
  }

  // --- audit ---
  let audit: { id: string; domain: string; url: string; status: string } | undefined;
  try {
    const rows = await db.select().from(audits).where(eq(audits.id, auditId)).limit(1);
    audit = rows[0];
  } catch {
    return <ReportContent {...DEMO_PROPS} />;
  }
  if (!audit) notFound();

  if (!READY_STATUSES.has(audit.status)) {
    return (
      <AuditProgress
        domain={audit.domain}
        auditId={auditId}
        progressToken={pt ?? null}
      />
    );
  }

  // --- scores ---
  const scoreRows = await db
    .select()
    .from(scores)
    .where(eq(scores.auditId, auditId));

  const scoreMap = new Map(scoreRows.map((s) => [`${s.scope}:${s.key}`, parseFloat(s.score)]));

  const overallScore = scoreMap.get('overall:total') ?? scoreMap.get('total:score') ?? null;

  const pillarScores: PillarScore[] = PILLAR_ORDER.map((key) => ({
    key,
    score: scoreMap.get(`pillar:${key}`) ?? null,
    medianScore: scoreMap.get(`category_median:${key}`) ?? null,
  }));

  // --- findings ---
  const findingRows = await db
    .select()
    .from(findings)
    .where(eq(findings.auditId, auditId))
    .orderBy(asc(findings.priority));

  const teaserFindings: FindingRow[] = findingRows.slice(0, 3).map((f) => ({
    id: f.id,
    title: f.title,
    description: f.description,
    impact: f.impact,
    expectedScoreDelta: f.expectedScoreDelta !== null ? parseFloat(f.expectedScoreDelta) : null,
    evidence: null,
  }));

  const lockedFindings: LockedFindingRow[] = findingRows.slice(3).map((f) => ({
    impact: f.impact,
    delta: f.expectedScoreDelta !== null ? parseFloat(f.expectedScoreDelta) : 0,
    title: f.title,
  }));

  const lockedFindingsCost = lockedFindings.reduce((sum, f) => sum + f.delta, 0);

  // --- tech checks ---
  const techCheckRows = await db
    .select()
    .from(techChecks)
    .where(eq(techChecks.auditId, auditId));

  const techCheckItems: TechCheckItem[] = techCheckRows.map((tc) => ({
    label: techCheckLabel(tc.criterion, tc.details as Record<string, unknown>),
    passing: tc.score !== null && parseFloat(tc.score) > 0,
  }));

  // --- engine runs / citation ---
  const engineRunRows = await db
    .select({
      id: engineRuns.id,
      engine: engineRuns.engine,
      promptId: engineRuns.promptId,
      responseTextPreview: engineRuns.responseTextPreview,
    })
    .from(engineRuns)
    .where(eq(engineRuns.auditId, auditId))
    .limit(10);

  let citation: CitationData | null = null;

  if (engineRunRows.length > 0) {
    const run = engineRunRows[0];

    const [prompt] = await db
      .select({ text: prompts.text })
      .from(prompts)
      .where(eq(prompts.id, run.promptId))
      .limit(1);

    const mentionRows = await db
      .select({ brand: mentions.brand, position: mentions.position, sentiment: mentions.sentiment })
      .from(mentions)
      .where(eq(mentions.engineRunId, run.id));

    const brands: MentionedBrand[] = mentionRows.map((m) => ({
      brand: m.brand,
      isTarget: m.position === 1,
    }));

    const targetMentioned = mentionRows.some((m) => m.position === 1);

    citation = {
      engine: engineName(run.engine),
      promptText: prompt?.text ?? '',
      responsePreview: run.responseTextPreview ?? null,
      brands,
      targetMentioned,
    };
  }

  // --- prompt/engine counts ---
  const promptCountRows = await db
    .select({ id: prompts.id })
    .from(prompts)
    .where(eq(prompts.auditId, auditId));

  const promptCount = promptCountRows.length || 12;

  const uniqueEngines = new Set(engineRunRows.map((r) => r.engine));
  const engineCount = uniqueEngines.size || 1;

  // --- props ---
  const props: ReportContentProps = {
    domain: audit.domain,
    overallScore,
    promptCount,
    engineCount,
    pillars: pillarScores,
    techChecks: techCheckItems,
    findings: teaserFindings,
    citation,
    lockedFindings,
    lockedFindingsCost,
  };

  return <ReportContent {...props} />;
}
