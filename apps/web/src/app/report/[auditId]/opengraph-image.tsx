import { ImageResponse } from 'next/og';
import { eq } from 'drizzle-orm';
import { createClient } from '@geotrack/db/client';
import { audits, scores } from '@geotrack/db/schema';
import { LOGO_DATA_URI } from '@/lib/logo-data-uri';

export const runtime = 'nodejs';
export const alt = 'GeoTrack AI visibility audit result';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const db = process.env.DATABASE_URL ? createClient(process.env.DATABASE_URL) : null;

const PILLAR_NAMES: Record<string, string> = {
  A: 'Answer Visibility',
  B: 'AI Crawlability',
  C: 'Content Citability',
  D: 'Entity & Authority',
  E: 'Agent-Readiness',
};

const PILLAR_ORDER = ['A', 'B', 'C', 'D', 'E'];

// Score bands: < 4 = low (red), 4–7 = mid (amber), ≥ 7 = high (green)
function bandColor(score: number): string {
  if (score >= 7) return '#3A7055';
  if (score >= 4) return '#F0A213';
  return '#DB4E1D';
}

function bandLabel(score: number): string {
  if (score >= 7) return 'Frequently mentioned';
  if (score >= 4) return 'Sometimes mentioned';
  return 'Rarely mentioned';
}

function safeScore(val: number | undefined, fallback: number): number {
  return val !== undefined && !Number.isNaN(val) ? val : fallback;
}

async function fetchGoogleFont(family: string, weight: number): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&display=swap`,
      {
        headers: { 'User-Agent': 'Mozilla/4.0 (compatible; MSIE 6.0)' },
        signal: controller.signal,
      },
    ).then((r) => r.text());
    const match = css.match(/src: url\((.+?)\)/);
    if (!match?.[1]) throw new Error(`Google Font URL not found: ${family} ${weight}`);
    const controller2 = new AbortController();
    const timeout2 = setTimeout(() => controller2.abort(), 5000);
    try {
      return await fetch(match[1], { signal: controller2.signal }).then((r) => r.arrayBuffer());
    } finally {
      clearTimeout(timeout2);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;

  let fonts: { name: string; data: ArrayBuffer; weight: number; style: string }[] = [];
  try {
    const [interFont, monoFont] = await Promise.all([
      fetchGoogleFont('Inter', 600),
      fetchGoogleFont('JetBrains+Mono', 700),
    ]);
    fonts = [
      { name: 'Inter', data: interFont, weight: 600, style: 'normal' },
      { name: 'JetBrains Mono', data: monoFont, weight: 700, style: 'normal' },
    ];
  } catch {
    // font loading failed — render without custom fonts
  }

  // Default demo data — used when DATABASE_URL is not configured
  let domain = 'example.com';
  let overallScore = 4.2;
  const pillarMap: Record<string, number> = { A: 2.8, B: 6.1, C: 3.5, D: 5.9, E: 2.6 };
  let categoryMedian: number | null = 4.6;
  let auditDate = new Date();

  if (db) {
    try {
      const [audit] = await db
        .select({ domain: audits.domain, createdAt: audits.createdAt })
        .from(audits)
        .where(eq(audits.id, auditId))
        .limit(1);

      if (audit) {
        domain = audit.domain;
        auditDate = audit.createdAt;
        const scoreRows = await db
          .select({ scope: scores.scope, key: scores.key, score: scores.score })
          .from(scores)
          .where(eq(scores.auditId, auditId));
        const sm = new Map(scoreRows.map((s) => [`${s.scope}:${s.key}`, parseFloat(s.score)]));
        overallScore = safeScore(sm.get('overall:total') ?? sm.get('total:score'), overallScore);
        categoryMedian = (() => {
          const v = sm.get('category_median:total');
          return v !== undefined && !Number.isNaN(v) ? v : null;
        })();
        for (const key of PILLAR_ORDER) {
          const val = sm.get(`pillar:${key}`);
          if (val !== undefined && !Number.isNaN(val)) pillarMap[key] = val;
        }
      }
    } catch (err) {
      console.error('[opengraph-image] DB error, falling back to demo data:', err);
    }
  }

  const mainColor = bandColor(overallScore);
  const mainLabel = bandLabel(overallScore);
  const dateStr = auditDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          backgroundColor: '#020617',
          fontFamily: 'Inter',
          padding: '56px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxSizing: 'border-box',
        }}
      >
        {/* Top: logo + domain */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_DATA_URI} width={179} height={28} alt="Geotrack" />
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 18, color: '#94A3B8' }}>
            {domain}
          </span>
        </div>

        {/* Middle: big score + pillar bars */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '56px' }}>
          {/* Left: score + band label */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontFamily: 'JetBrains Mono',
                fontWeight: 700,
                fontSize: 150,
                lineHeight: 1,
                color: '#ffffff',
              }}
            >
              {overallScore.toFixed(1)}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                color: mainColor,
                fontWeight: 600,
                fontSize: 22,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 12 12">
                <polygon points="6,1 11,11 1,11" fill="currentColor" />
              </svg>
              {mainLabel}
            </div>
          </div>

          {/* Right: category median + pillar rows */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            {categoryMedian !== null && (
              <div style={{ fontSize: 15, color: '#94A3B8' }}>
                {'vs category median '}
                <span
                  style={{
                    color: '#ffffff',
                    fontWeight: 600,
                    fontFamily: 'JetBrains Mono',
                  }}
                >
                  {categoryMedian.toFixed(1)}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {PILLAR_ORDER.map((key) => {
                const s = pillarMap[key] ?? 0;
                const c = bandColor(s);
                return (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 13,
                        color: '#94A3B8',
                      }}
                    >
                      <span>{PILLAR_NAMES[key]}</span>
                      <span style={{ fontFamily: 'JetBrains Mono', color: c }}>
                        {s.toFixed(1)}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        backgroundColor: 'rgba(255,255,255,0.1)',
                        borderRadius: 999,
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(s * 10, 100)}%`,
                          height: '100%',
                          backgroundColor: c,
                          borderRadius: 999,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom: label + date */}
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
        >
          <span style={{ fontSize: 16, color: '#ffffff', fontWeight: 600 }}>
            Geotrack AI visibility audit
          </span>
          <span style={{ fontSize: 14, color: '#94A3B8' }}>{dateStr}</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts,
    },
  );
}
