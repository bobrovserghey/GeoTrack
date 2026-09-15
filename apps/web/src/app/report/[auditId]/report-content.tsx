'use client';

import { useState } from 'react';

// ---- types ------------------------------------------------------------------

export type PillarScore = {
  key: string;
  score: number | null;
  medianScore: number | null;
};

export type FindingRow = {
  id: string;
  title: string;
  description: string;
  impact: string;
  expectedScoreDelta: number | null;
  evidence: EvidenceBlock | null;
};

export type EvidenceBlock =
  | { type: 'code'; caption: string; text: string }
  | { type: 'table'; caption: string; headers: string[]; rows: string[][] };

export type MentionedBrand = {
  brand: string;
  isTarget: boolean;
};

export type CitationData = {
  engine: string;
  promptText: string;
  responsePreview: string | null;
  brands: MentionedBrand[];
  targetMentioned: boolean;
};

export type LockedFindingRow = {
  impact: string;
  delta: number;
  title: string;
};

export type TechCheckItem = {
  label: string;
  passing: boolean;
};

export type ReportContentProps = {
  domain: string;
  overallScore: number | null;
  promptCount: number;
  engineCount: number;
  pillars: PillarScore[];
  techChecks: TechCheckItem[];
  findings: FindingRow[];
  citation: CitationData | null;
  lockedFindings: LockedFindingRow[];
  lockedFindingsCost: number;
};

// ---- helpers ----------------------------------------------------------------

function bandClass(score: number | null): 'low' | 'mid' | 'high' {
  if (score === null) return 'low';
  if (score >= 7.5) return 'high';
  if (score >= 4.5) return 'mid';
  return 'low';
}

function bandFg(band: 'low' | 'mid' | 'high') {
  return `var(--band-${band}-fg)`;
}

function bandStrong(band: 'low' | 'mid' | 'high') {
  return `var(--band-${band}-strong)`;
}

function scoreLabel(score: number | null): string {
  if (score === null) return '—';
  return score.toFixed(1);
}

function gaugeArc(score: number): string {
  const r = 57;
  const circ = 2 * Math.PI * r;
  const filled = (score / 10) * circ;
  return `${filled} ${circ}`;
}

function impactStyle(impact: string): { bg: string; border: string; fg: string } {
  switch (impact.toLowerCase()) {
    case 'critical':
      return {
        bg: 'var(--severity-critical-bg)',
        border: 'var(--severity-critical-border)',
        fg: 'var(--severity-critical-fg)',
      };
    case 'warning':
      return {
        bg: 'var(--severity-warning-bg)',
        border: 'var(--severity-warning-border)',
        fg: 'var(--severity-warning-fg)',
      };
    default:
      return {
        bg: 'var(--bg-subtle)',
        border: 'var(--border-default)',
        fg: 'var(--text-secondary)',
      };
  }
}

const PILLAR_LABELS: Record<string, string> = {
  A: 'Answer Visibility',
  B: 'AI Crawlability',
  C: 'Content Citability',
  D: 'Entity & Authority',
  E: 'Agent-Readiness',
};

const LOCKED_PILLARS = new Set(['C', 'D', 'E']);

const LOCK_SVG = (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" stroke="var(--text-tertiary)" strokeWidth="1.4" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="var(--text-tertiary)" strokeWidth="1.4" fill="none" />
  </svg>
);

const GOOGLE_ICON = (
  <svg width="15" height="15" viewBox="0 0 18 18">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.36 0-4.35-1.6-5.06-3.75H.9v2.34C2.38 16 5.44 18 9 18z" />
    <path fill="#FBBC05" d="M3.94 10.67A5.4 5.4 0 0 1 3.65 9c0-.58.1-1.14.29-1.67V4.99H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.01l3.04-2.34z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.44 0 2.38 2 .9 4.99l3.04 2.34C4.65 5.18 6.64 3.58 9 3.58z" />
  </svg>
);

const MICROSOFT_ICON = (
  <svg width="14" height="14" viewBox="0 0 21 21">
    <rect x="0" y="0" width="10" height="10" fill="#F25022" />
    <rect x="11" y="0" width="10" height="10" fill="#7FBA00" />
    <rect x="0" y="11" width="10" height="10" fill="#00A4EF" />
    <rect x="11" y="11" width="10" height="10" fill="#FFB900" />
  </svg>
);

// ---- highlight brands in response text ---------------------------------------

function highlightBrands(text: string, brands: MentionedBrand[]): React.ReactNode[] {
  if (!brands.length) return [text];
  const brandNames = brands.map((b) => b.brand);
  const pattern = new RegExp(`(${brandNames.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const parts = text.split(pattern);
  return parts.map((part, i) => {
    const match = brandNames.find((b) => b.toLowerCase() === part.toLowerCase());
    if (match) {
      return (
        <mark key={i} style={{ background: 'var(--accent-subtle-bg)', color: 'var(--accent-text)', padding: '0 2px', borderRadius: 3, fontStyle: 'normal', fontWeight: 600 }}>
          {part}
        </mark>
      );
    }
    return part;
  });
}

// ---- sub-components ---------------------------------------------------------

function WorksAccordion({ items }: { items: TechCheckItem[] }) {
  const [open, setOpen] = useState(false);
  const passing = items.filter((i) => i.passing);

  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}
      >
        What already works
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500, fontSize: 13, color: 'var(--text-tertiary)' }}>
          {passing.length} checks passed
          <svg width="9" height="9" viewBox="0 0 24 24" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 200ms var(--ease-standard)' }}>
            <path d="M7 4L18 12L7 20" stroke="var(--text-tertiary)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      <div style={{ maxHeight: open ? 400 : 0, overflow: 'hidden', transition: 'max-height 200ms var(--ease-standard)' }}>
        <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {passing.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
              <svg width="14" height="14" viewBox="0 0 16 16" style={{ flexShrink: 0, marginTop: 2 }}>
                <path d="M3 8.5L6.2 11.5L13 4.5" stroke="var(--band-high-fg)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FindingCard({ finding }: { finding: FindingRow }) {
  const { bg, border, fg } = impactStyle(finding.impact);
  const delta = finding.expectedScoreDelta;

  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)' }}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 'var(--radius-sm)', background: bg, border: `1px solid ${border}`, color: fg, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentcolor', flexShrink: 0 }} />
            {finding.impact.charAt(0).toUpperCase() + finding.impact.slice(1).toLowerCase()}
          </span>
          {delta !== null && (
            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--band-low-fg)' }}>
              {delta > 0 ? '+' : ''}{delta.toFixed(1)} score
            </span>
          )}
        </div>

        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{finding.title}</div>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{finding.description}</div>

        {finding.evidence && finding.evidence.type === 'code' && (
          <div style={{ borderRadius: 'var(--radius-md)', background: 'var(--slate-900)', overflow: 'hidden' }}>
            <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: 12, color: 'var(--slate-400)' }}>
              {finding.evidence.caption}
            </div>
            <pre style={{ margin: 0, padding: 14, fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--slate-100)', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
              {finding.evidence.text}
            </pre>
          </div>
        )}

        {finding.evidence && finding.evidence.type === 'table' && (
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: 12, color: 'var(--text-tertiary)' }}>
              {finding.evidence.caption}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {finding.evidence.headers.map((h, i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '8px 14px', color: 'var(--text-tertiary)', fontWeight: 500, borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {finding.evidence.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <a href="#sticky-cta" style={{ alignSelf: 'flex-start', fontSize: 13, fontWeight: 600, color: 'var(--accent-text)', textDecoration: 'none' }}>
          See the fix in the full audit →
        </a>
      </div>
    </div>
  );
}

function EmailCapture() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  return (
    <div style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--accent-subtle-border)', background: 'var(--accent-subtle-bg)', borderRadius: 'var(--radius-lg)', padding: 18, fontFamily: 'var(--font-ui)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          {sent ? 'Link sent! Check your inbox.' : "We'll run 3 more checks about your brand and send you the link"}
        </div>

        {!sent && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 0', minWidth: 200, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ width: '100%', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', padding: '9px 12px', fontSize: 13, fontFamily: 'var(--font-ui)', background: 'var(--bg-surface)', color: 'var(--text-primary)', height: 38, boxSizing: 'border-box' }}
                />
              </div>
              <button
                onClick={() => email && setSent(true)}
                style={{ flexShrink: 0, background: 'var(--accent-default)', color: 'var(--text-on-accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '0 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)', height: 38 }}
              >
                Send my link
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-tertiary)', fontSize: 12 }}>
              <span style={{ flex: '1 1 0', height: 1, background: 'var(--border-subtle)' }} />
              or
              <span style={{ flex: '1 1 0', height: 1, background: 'var(--border-subtle)' }} />
            </div>

            <div style={{ display: 'flex', gap: 8, flexDirection: 'row' }}>
              <button style={{ flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)', padding: '9px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
                {GOOGLE_ICON}
                Continue with Google
              </button>
              <button style={{ flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)', padding: '9px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
                {MICROSOFT_ICON}
                Continue with Microsoft
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', padding: '9px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
    >
      {copied ? 'Copied!' : 'Copy link'}
    </button>
  );
}

// ---- main component ---------------------------------------------------------

export default function ReportContent(props: ReportContentProps) {
  const {
    domain,
    overallScore,
    promptCount,
    engineCount,
    pillars,
    techChecks,
    findings,
    citation,
    lockedFindings,
    lockedFindingsCost,
  } = props;

  const score = overallScore ?? 0;
  const band = bandClass(overallScore);
  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';

  const bandLabelMap: Record<string, string> = {
    low: 'Rarely mentioned',
    mid: 'Occasionally mentioned',
    high: 'Frequently mentioned',
  };

  const TRIANGLE_SVG = (
    <svg width="11" height="11" viewBox="0 0 12 12">
      <polygon points="6,1 11,11 1,11" fill="currentColor" />
    </svg>
  );

  return (
    <div style={{ fontFamily: 'var(--font-ui)', background: 'var(--bg-app)', minHeight: '100vh', position: 'relative' }}>

      {/* Nav */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px clamp(16px, 4vw, 24px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          {/* Logo — inline SVG (same base64 as design) */}
          <svg width="120" height="19" viewBox="0 0 185 29" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ height: 22, width: 'auto' }}>
            <path d="M34.088 25.512C30.7066 25.48 27.8746 24.3227 25.592 22.04C23.32 19.7467 22.184 16.904 22.184 13.512C22.184 10.088 23.3306 7.24532 25.624 4.9840C27.9173 2.71199 30.7493 1.5760 34.12 1.5760C35.2293 1.5760 36.28 1.69332 37.272 1.9280C38.264 2.16266 39.16 2.49866 39.96 2.9360C40.76 3.37332 41.4213 3.84266 41.944 4.3440C42.4666 4.84532 42.728 5.0960 42.728 5.0960L39.88 8.0720C39.88 8.0720 39.6826 7.88532 39.288 7.5120C38.904 7.1280 38.456 6.79732 37.944 6.5200C37.432 6.2320 36.856 6.01332 36.216 5.8640C35.5866 5.7040 34.9146 5.6240 34.2 5.6240C32.0026 5.6240 30.1626 6.35466 28.68 7.8160C27.208 9.26666 26.472 11.1867 26.472 13.576C26.472 15.944 27.2133 17.8693 28.696 19.352C30.1786 20.8347 32.024 21.576 34.232 21.576C36.2586 21.576 37.9013 21.0533 39.16 20.008C40.4186 18.952 41.1386 17.5067 41.32 15.672V15.704H33.992V12.248H45.448L45.464 14.232C45.464 17.6347 44.4133 20.3653 42.312 22.424C40.2106 24.4827 37.4693 25.512 34.088 25.512Z" fill="currentColor"/>
            <path d="M55.6442 25.512C53.1162 25.512 51.0576 24.6907 49.4682 23.048C47.8896 21.4053 47.1002 19.3093 47.1002 16.76C47.1002 14.2427 47.8896 12.1573 49.4682 10.504C51.0469 8.85066 53.0682 8.02399 55.5322 8.02399C57.9216 8.02399 59.8736 8.76532 61.3882 10.248C62.9029 11.72 63.6602 13.5973 63.6602 15.88V17.608H49.2282V15.176H59.6602C59.5856 14.088 59.1802 13.192 58.4442 12.488C57.7082 11.784 56.7376 11.432 55.5322 11.432C54.2309 11.432 53.1749 11.9013 52.3642 12.84C51.5536 13.7787 51.1482 15.0587 51.1482 16.68C51.1482 18.3653 51.6069 19.7093 52.5242 20.712C53.4416 21.704 54.6149 22.2 56.0442 22.2C56.7056 22.2 57.2816 22.1093 57.7722 21.928C58.2736 21.7467 58.7216 21.496 59.1162 21.176C59.5216 20.856 59.9802 20.3493 60.4922 19.656L63.2442 21.496C62.5509 22.5733 61.8469 23.3787 61.1322 23.912C60.4282 24.4347 59.6442 24.8293 58.7802 25.096C57.9269 25.3733 56.8816 25.512 55.6442 25.512Z" fill="currentColor"/>
            <path d="M74.3537 25.512C71.8044 25.512 69.6977 24.6853 68.0337 23.032C66.3697 21.368 65.5377 19.2827 65.5377 16.776C65.5377 14.2267 66.3697 12.1307 68.0337 10.488C69.6977 8.84532 71.8044 8.02399 74.3537 8.02399C76.9031 8.02399 79.0097 8.85066 80.6737 10.504C82.3484 12.1573 83.1857 14.248 83.1857 16.776C83.1857 19.2827 82.3537 21.368 80.6897 23.032C79.0257 24.6853 76.9137 25.512 74.3537 25.512ZM74.3697 21.88C75.6817 21.88 76.7857 21.4 77.6817 20.44C78.5884 19.48 79.0417 18.2587 79.0417 16.776C79.0417 15.2613 78.5884 14.0347 77.6817 13.096C76.7751 12.1467 75.6711 11.672 74.3697 11.672C73.0364 11.672 71.9164 12.1467 71.0097 13.096C70.1137 14.0453 69.6657 15.2667 69.6657 16.76C69.6657 18.2533 70.1137 19.48 71.0097 20.44C71.9057 21.4 73.0257 21.88 74.3697 21.88Z" fill="currentColor"/>
            <path d="M88.4608 25V4.16801H92.7808V25H88.4608ZM82.1248 6.10401V2.08801H99.0848V6.10401H82.1248Z" fill="currentColor"/>
            <path d="M99.9673 25V8.55199H103.999V11.608L103.551 11.096H104.095C104.426 10.1893 105.023 9.45332 105.887 8.88799C106.751 8.31199 107.658 8.02399 108.607 8.02399C108.895 8.02399 109.189 8.05066 109.487 8.10399C109.786 8.14666 110.058 8.21066 110.303 8.29599C110.549 8.37066 110.671 8.40799 110.671 8.40799V12.44C110.671 12.44 110.511 12.3867 110.191 12.28C109.871 12.1627 109.525 12.072 109.151 12.008C108.789 11.9333 108.453 11.896 108.143 11.896C107.023 11.896 106.085 12.312 105.327 13.144C104.581 13.976 104.207 15.0373 104.207 16.328V25H99.9673Z" fill="currentColor"/>
            <path d="M117.584 25.512C115.782 25.512 114.326 25.0213 113.216 24.04C112.107 23.048 111.552 21.752 111.552 20.152C111.552 18.4667 112.198 17.1333 113.488 16.152C114.79 15.16 116.48 14.664 118.56 14.664C119.403 14.664 120.214 14.7547 120.992 14.936C121.782 15.1067 122.443 15.3253 122.976 15.592V14.632C122.976 13.5973 122.619 12.7813 121.904 12.184C121.19 11.576 120.251 11.272 119.088 11.272C118.416 11.272 117.84 11.3467 117.36 11.496C116.891 11.6347 116.454 11.8267 116.048 12.072C115.654 12.3173 115.291 12.5947 114.96 12.904C114.64 13.2133 114.48 13.368 114.48 13.368L112.096 11.096C112.096 11.096 112.358 10.8667 112.88 10.408C113.414 9.94932 113.995 9.53866 114.624 9.17599C115.254 8.81332 115.963 8.53066 116.752 8.32799C117.542 8.12532 118.448 8.02399 119.472 8.02399C121.851 8.02399 123.707 8.60532 125.04 9.76799C126.374 10.92 127.04 12.5413 127.04 14.632V25H122.992V21.4L124.032 22.824H122.896C122.406 23.624 121.686 24.2747 120.736 24.776C119.798 25.2667 118.747 25.512 117.584 25.512ZM118.688 22.552C119.926 22.552 120.944 22.1147 121.744 21.24C122.555 20.3653 122.966 19.2667 122.976 17.944V17.928C122.518 17.6507 121.974 17.432 121.344 17.272C120.726 17.112 120.064 17.032 119.36 17.032C118.219 17.032 117.296 17.272 116.592 17.752C115.899 18.2213 115.552 18.936 115.552 19.896C115.552 20.7173 115.84 21.368 116.416 21.848C117.003 22.3173 117.76 22.552 118.688 22.552Z" fill="currentColor"/>
            <path d="M138.38 25.512C135.874 25.512 133.81 24.6907 132.188 23.048C130.567 21.4053 129.756 19.304 129.756 16.744C129.756 14.184 130.567 12.0933 132.188 10.472C133.82 8.83999 135.89 8.02399 138.396 8.02399C139.538 8.02399 140.572 8.18399 141.5 8.50399C142.428 8.82399 143.266 9.32532 144.012 10.008C144.77 10.68 145.431 11.656 145.996 12.936L142.444 14.328C142.082 13.6133 141.719 13.0747 141.356 12.712C140.994 12.3493 140.567 12.0827 140.076 11.912C139.586 11.7307 139.047 11.64 138.46 11.64C137.202 11.64 136.124 12.1093 135.228 13.048C134.332 13.9867 133.884 15.2133 133.884 16.728C133.884 18.2427 134.327 19.4853 135.212 20.456C136.098 21.416 137.175 21.896 138.444 21.896C139.031 21.896 139.575 21.8053 140.076 21.624C140.578 21.432 141.01 21.1707 141.372 20.84C141.735 20.4987 142.124 19.944 142.54 19.176L146.108 20.44C145.522 21.752 144.866 22.7493 144.14 23.432C143.426 24.104 142.583 24.6213 141.612 24.984C140.652 25.336 139.575 25.512 138.38 25.512Z" fill="currentColor"/>
            <path d="M148.686 25V17.016L159.358 8.55201H164.686L151.23 21.944ZM148.686 25V2.08801H152.926V25H148.686ZM159.774 25L154.59 16.712L157.534 13.768L164.894 25H159.774Z" fill="currentColor"/>
            <path d="M14 0L0 11.2934V17.6753L14 29V21.7422L4.38274 14.6095V14.3905L14 7.32039V0Z" fill="currentColor"/>
            <path d="M171 29L185 17.7066V11.3247L171 0V7.25782L180.617 14.3905V14.6095L171 21.6796V29Z" fill="currentColor"/>
          </svg>

          <div style={{ display: 'flex', gap: 2, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-full)', padding: 2 }}>
            <span style={{ fontFamily: 'var(--font-ui)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 'var(--radius-full)' }}>EN</span>
            <span style={{ fontFamily: 'var(--font-ui)', color: 'var(--text-tertiary)', fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 'var(--radius-full)' }}>RO</span>
          </div>
        </div>
      </div>

      {/* Breadcrumb */}
      <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '12px clamp(16px, 4vw, 24px)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, flexWrap: 'wrap' }}>
          <span style={{ background: 'var(--accent-default)', color: 'var(--text-on-accent)', fontWeight: 600, padding: '4px 10px', borderRadius: 999 }}>Free result</span>
          <span style={{ color: 'var(--border-strong)' }}>›</span>
          <span style={{ color: 'var(--text-disabled)' }}>Choose audit</span>
          <span style={{ color: 'var(--border-strong)' }}>›</span>
          <span style={{ color: 'var(--text-disabled)' }}>Payment</span>
          <span style={{ color: 'var(--border-strong)' }}>›</span>
          <span style={{ color: 'var(--text-disabled)' }}>Report (by email within 24 h)</span>
        </div>
      </div>

      {/* Main content */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: 'clamp(20px, 4vw, 40px) clamp(16px, 4vw, 24px) 120px', display: 'flex', flexDirection: 'column', gap: 32 }}>

        {/* Score card */}
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)', boxShadow: 'var(--shadow-md)', padding: 'clamp(20px, 4vw, 32px)', display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <svg width="140" height="140" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="57" fill="none" stroke="var(--border-subtle)" strokeWidth="9" />
              <circle cx="70" cy="70" r="57" fill="none" stroke={bandStrong(band)} strokeWidth="9" strokeDasharray={gaugeArc(score)} strokeLinecap="round" transform="rotate(-90 70 70)" />
              <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" fontFamily="var(--font-mono)" fontWeight="700" fontSize="32" fill="var(--text-primary)">{scoreLabel(overallScore)}</text>
              <text x="50%" y="67%" textAnchor="middle" fontFamily="var(--font-ui)" fontSize="10" fill="var(--text-tertiary)">/ 10</text>
            </svg>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: bandFg(band), fontWeight: 600, fontSize: 14 }}>
              {TRIANGLE_SVG}
              {bandLabelMap[band]}
            </div>
          </div>
          <div style={{ flex: '1 1 0', minWidth: 220, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              Preliminary · {promptCount} prompts · {engineCount} engine{engineCount !== 1 ? 's' : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-secondary)' }}>You vs category median</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>Category median 4.6</span>
              </div>
              <div style={{ position: 'relative', height: 8, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-full)' }}>
                <div style={{ position: 'absolute', inset: 0, width: `${(score / 10) * 100}%`, background: bandStrong(band), borderRadius: 'var(--radius-full)' }} />
                <div style={{ position: 'absolute', left: '46%', top: -3, bottom: -3, width: 2, background: 'var(--text-secondary)' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Email capture */}
        <EmailCapture />

        {/* Five pillars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Five pillars</div>

          {pillars.map((p) => {
            const locked = LOCKED_PILLARS.has(p.key);
            const pBand = bandClass(p.score);
            const pScore = p.score ?? 0;
            const medianPct = p.medianScore !== null ? (p.medianScore / 10) * 100 : 50;

            if (!locked) {
              return (
                <div key={p.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{PILLAR_LABELS[p.key] ?? p.key}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: bandFg(pBand) }}>{scoreLabel(p.score)}</span>
                  </div>
                  <div style={{ position: 'relative', height: 8, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-full)' }}>
                    <div style={{ position: 'absolute', inset: 0, width: `${(pScore / 10) * 100}%`, background: bandStrong(pBand), borderRadius: 'var(--radius-full)' }} />
                    <div style={{ position: 'absolute', left: `${medianPct}%`, top: -3, bottom: -3, width: 2, background: 'var(--text-secondary)' }} />
                  </div>
                </div>
              );
            }

            return (
              <div key={p.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{PILLAR_LABELS[p.key] ?? p.key}</span>
                  {LOCK_SVG}
                </div>
                <div style={{ position: 'relative', height: 8, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-full)', filter: 'blur(3px)', pointerEvents: 'none' }}>
                  <div style={{ position: 'absolute', inset: 0, width: `${(pScore / 10) * 100}%`, background: bandStrong(pBand), borderRadius: 'var(--radius-full)' }} />
                  <div style={{ position: 'absolute', left: `${medianPct}%`, top: -3, bottom: -3, width: 2, background: 'var(--text-secondary)' }} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Unlocked in the full audit</div>
              </div>
            );
          })}
        </div>

        {/* What already works */}
        <WorksAccordion items={techChecks} />

        {/* Findings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Findings</div>
          {findings.map((f) => <FindingCard key={f.id} finding={f} />)}
        </div>

        {/* Citation block */}
        {citation && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>What {citation.engine} said</div>
            <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: 12, color: 'var(--text-tertiary)' }}>
                Asked {citation.engine}: &ldquo;{citation.promptText}&rdquo;
              </div>
              {citation.responsePreview && (
                <div style={{ padding: 16, fontSize: 15, lineHeight: 1.6, fontStyle: 'italic', color: 'var(--text-primary)' }}>
                  &ldquo;{highlightBrands(citation.responsePreview, citation.brands)}&rdquo;
                </div>
              )}
              {!citation.responsePreview && (
                <div style={{ padding: 16, fontSize: 14, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                  Response not available.
                </div>
              )}
              <div style={{ padding: '0 16px 16px', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--band-low-fg)', fontSize: 13, fontWeight: 600 }}>
                {TRIANGLE_SVG}
                {citation.targetMentioned ? 'Your brand: mentioned' : 'Your brand: not mentioned'}
              </div>
              <div style={{ padding: '0 16px 14px', fontSize: 12.5, color: 'var(--text-tertiary)' }}>
                ChatGPT and Gemini answers are in the full audit.
              </div>
            </div>
          </div>
        )}

        {/* Upgrade card */}
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)', padding: 'clamp(20px, 3vw, 28px)', display: 'flex', gap: 32, flexWrap: 'wrap' }}>

          {/* Left: locked findings */}
          <div style={{ flex: '1 1 0', minWidth: 260, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
              {lockedFindings.length} more findings in the full audit
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {lockedFindings.map((lf, idx) => {
                const { bg: lfBg, border: lfBorder, fg: lfFg } = impactStyle(lf.impact);
                return (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 600, color: lfFg, background: lfBg, border: `1px solid ${lfBorder}`, borderRadius: 'var(--radius-sm)', padding: '2px 8px', whiteSpace: 'nowrap' }}>
                      {lf.impact.charAt(0).toUpperCase() + lf.impact.slice(1).toLowerCase()} · {lf.delta > 0 ? '+' : ''}{lf.delta.toFixed(1)}
                    </span>
                    <span style={{ flex: '1 1 0', fontSize: 13.5, color: 'var(--text-secondary)', filter: 'blur(3px)', pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                      {lf.title}
                    </span>
                    {LOCK_SVG}
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              Locked findings cost you &minus;{Math.abs(lockedFindingsCost).toFixed(1)} in total.
            </div>
          </div>

          {/* Right: Free vs Full */}
          <div style={{ flex: '1 1 0', minWidth: 260, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Free vs Full</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 0', color: 'var(--text-tertiary)', fontWeight: 500, borderBottom: '1px solid var(--border-subtle)' }} />
                  <th style={{ textAlign: 'center', padding: '6px 0', color: 'var(--text-tertiary)', fontWeight: 500, borderBottom: '1px solid var(--border-subtle)' }}>Free</th>
                  <th style={{ textAlign: 'center', padding: '6px 0', color: 'var(--text-tertiary)', fontWeight: 500, borderBottom: '1px solid var(--border-subtle)' }}>Full</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>Prompts</td>
                  <td style={{ textAlign: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>12</td>
                  <td style={{ textAlign: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>30</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>Engines</td>
                  <td style={{ textAlign: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>1</td>
                  <td style={{ textAlign: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>3</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>Competitors compared</td>
                  <td style={{ textAlign: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}>—</td>
                  <td style={{ textAlign: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>3</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>Findings</td>
                  <td style={{ textAlign: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>3</td>
                  <td style={{ textAlign: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>up to 15</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>Fix plan with priorities</td>
                  <td style={{ textAlign: 'center', padding: '8px 0', color: 'var(--text-tertiary)' }}>—</td>
                  <td style={{ textAlign: 'center', padding: '8px 0', color: 'var(--text-primary)', fontWeight: 600 }}>Included</td>
                </tr>
              </tbody>
            </table>
            <a href="#sticky-cta" style={{ textAlign: 'center', background: 'var(--accent-default)', color: 'var(--text-on-accent)', border: 'none', borderRadius: 'var(--radius-md)', padding: '12px 16px', fontSize: 14, fontWeight: 600, textDecoration: 'none', fontFamily: 'var(--font-ui)', display: 'block' }}>
              Get the full audit — $79
            </a>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <a href="#" style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'underline' }}>See a sample report</a>
              <a href="#" style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'underline' }}>How the audit works</a>
            </div>
          </div>
        </div>

        {/* Share */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Share this result</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ width: 220, aspectRatio: '1200 / 630', background: 'var(--slate-900)', borderRadius: 'var(--radius-md)', padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>Geotrack</div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 26, color: '#fff' }}>{scoreLabel(overallScore)}</div>
                <div style={{ fontSize: 8, color: 'var(--slate-400)' }}>{domain} · vs median 4.6</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <CopyLinkButton url={pageUrl} />
              <button style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', padding: '9px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
                Share on LinkedIn
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Footer */}
      <div style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px clamp(16px, 4vw, 24px) 92px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-secondary)' }}>
          <span>© 2026 Geotrack</span>
          <a href="#" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Privacy</a>
          <a href="#" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Terms</a>
        </div>
      </div>

      {/* Sticky CTA */}
      <div id="sticky-cta" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30, background: 'var(--bg-surface)', borderTop: '1px solid var(--border-default)', boxShadow: 'var(--shadow-lg)', padding: '14px clamp(16px, 4vw, 24px)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>30 prompts · 3 engines · 3 competitors · up to 15 findings · fix plan</div>
          <button style={{ background: 'var(--accent-default)', color: 'var(--text-on-accent)', border: 'none', borderRadius: 'var(--radius-md)', padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', flexShrink: 0, fontFamily: 'var(--font-ui)' }}>
            Get the full audit — $79
          </button>
        </div>
      </div>

    </div>
  );
}
