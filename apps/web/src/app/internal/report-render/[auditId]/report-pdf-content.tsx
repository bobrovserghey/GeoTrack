import type { CSSProperties } from 'react';

// Ported 1:1 from Geotrack_UI.zip / Geotrack_Prototype/pages/Report_Print.html
// (design rule: эталонные страницы переносятся без изменений дизайна).
// This is deliberately a SEPARATE component from ../../report/[auditId]/report-content.tsx:
// Report_Print.html is its own print-specific layout (A4 pages, one example finding
// per pillar, no interactive chrome), not a stripped-down copy of the web report.
// See docs/specs/T-44.md for the data-availability notes on the two spots where this
// component simplifies the reference design (combined fix-plan table; omitted
// "what capped your score" box) because the underlying data isn't computed anywhere
// in the pipeline yet.

export type PdfPillarTableRow = {
  key: string;
  label: string;
  score: number | null;
  medianScore: number | null;
};

export type PdfExampleFinding = {
  impact: string;
  title: string;
  description: string;
  expectedScoreDelta: number | null;
  effortLabel: string | null;
};

export type PdfPillarSection = {
  key: string;
  label: string;
  summary: string;
  exampleFinding: PdfExampleFinding | null;
  passedChecks: string[];
};

export type PdfCompetitorRow = {
  brand: string;
  isTarget: boolean;
  mentionsPct: number | null;
  citationsPct: number | null;
  avgPosition: number | null;
  sentiment: string | null;
};

export type PdfFixPlanItem = {
  title: string;
  expectedScoreDelta: number | null;
  effortLabel: string | null;
};

export type PdfAppendixRow = {
  engine: string;
  promptType: string;
  promptText: string;
  answerPreview: string | null;
  mentioned: boolean;
};

export type ReportPdfContentProps = {
  domain: string;
  auditDateLabel: string;
  methodologyVersion: string;
  overallScore: number | null;
  scoreIntervalLow: number | null;
  scoreIntervalHigh: number | null;
  categoryMedian: number | null;
  cappedPillarNotes: string[];
  pillarTable: PdfPillarTableRow[];
  pillarSections: PdfPillarSection[];
  competitors: PdfCompetitorRow[];
  fixPlan: PdfFixPlanItem[];
  appendixRows: PdfAppendixRow[];
};

function bandFgFromScore(score: number | null): string {
  if (score === null) return 'var(--text-tertiary)';
  if (score >= 7.5) return 'var(--band-high-fg)';
  if (score >= 4.5) return 'var(--band-mid-fg)';
  return 'var(--band-low-fg)';
}

function scoreLabel(score: number | null): string {
  if (score === null) return '—';
  return score.toFixed(1);
}

function pctLabel(pct: number | null): string {
  if (pct === null) return '—';
  return `${Math.round(pct * 100)}%`;
}

function impactColor(impact: string): string {
  return impact.toLowerCase() === 'critical' ? 'var(--severity-critical-fg)' : 'var(--severity-warning-fg)';
}

// expectedScoreDelta is shown with its own sign, never forced to a fixed "+"
// like an earlier version of the Fix plan table did (`+${Math.abs(...)}`).
// In practice it is always <= 0: every template in packages/core findings
// templates.ts has a negative maxDelta, and buildFindings only scales it by a
// factor in [0, 1]. So the delta reads as "this much score is being lost
// today" — the minus sign is the point, and the `> 0` branches below exist
// only so a future positive template renders sensibly rather than silently.
//
// Both the label and the colour match the already-shipped T-43 web report
// chip (apps/web/src/app/report/[auditId]/report-content.tsx), which renders
// the same value as `{delta > 0 ? '+' : ''}{delta.toFixed(1)}` in
// var(--band-low-fg). Keeping PDF and web identical here is the 1:1 rule, so
// the zero case follows the web report too rather than inventing a colour.
function scoreDeltaLabel(delta: number): string {
  return delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1);
}

function scoreDeltaColor(delta: number): string {
  return delta > 0 ? 'var(--band-high-fg)' : 'var(--band-low-fg)';
}

const th: CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px',
  borderBottom: '1px solid var(--border-default)',
  color: 'var(--text-tertiary)',
  fontWeight: 600,
};

const td: CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid var(--border-subtle)',
};

const tdLast: CSSProperties = {
  padding: '6px 8px',
};

export default function ReportPdfContent(props: ReportPdfContentProps) {
  const {
    domain,
    auditDateLabel,
    methodologyVersion,
    overallScore,
    scoreIntervalLow,
    scoreIntervalHigh,
    categoryMedian,
    cappedPillarNotes,
    pillarTable,
    pillarSections,
    competitors,
    fixPlan,
    appendixRows,
  } = props;

  const band = bandFgFromScore(overallScore);
  const bandLabel = overallScore === null ? '—' : overallScore >= 7.5 ? 'High visibility' : overallScore >= 4.5 ? 'Occasional visibility' : 'Low visibility';

  return (
    <div style={{ fontFamily: 'var(--font-ui)', color: 'var(--text-primary)' }}>

      {/* Cover page */}
      <div style={{ breakAfter: 'page', minHeight: '240mm', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 20 }}>
        <svg width="140" height="22" viewBox="0 0 185 29" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M34.088 25.512C30.7066 25.48 27.8746 24.3227 25.592 22.04C23.32 19.7467 22.184 16.904 22.184 13.512C22.184 10.088 23.3306 7.24532 25.624 4.9840C27.9173 2.71199 30.7493 1.5760 34.12 1.5760C35.2293 1.5760 36.28 1.69332 37.272 1.9280C38.264 2.16266 39.16 2.49866 39.96 2.9360C40.76 3.37332 41.4213 3.84266 41.944 4.3440C42.4666 4.84532 42.728 5.0960 42.728 5.0960L39.88 8.0720C39.88 8.0720 39.6826 7.88532 39.288 7.5120C38.904 7.1280 38.456 6.79732 37.944 6.5200C37.432 6.2320 36.856 6.01332 36.216 5.8640C35.5866 5.7040 34.9146 5.6240 34.2 5.6240C32.0026 5.6240 30.1626 6.35466 28.68 7.8160C27.208 9.26666 26.472 11.1867 26.472 13.576C26.472 15.944 27.2133 17.8693 28.696 19.352C30.1786 20.8347 32.024 21.576 34.232 21.576C36.2586 21.576 37.9013 21.0533 39.16 20.008C40.4186 18.952 41.1386 17.5067 41.32 15.672V15.704H33.992V12.248H45.448L45.464 14.232C45.464 17.6347 44.4133 20.3653 42.312 22.424C40.2106 24.4827 37.4693 25.512 34.088 25.512Z" fill="currentColor" />
          <path d="M14 0L0 11.2934V17.6753L14 29V21.7422L4.38274 14.6095V14.3905L14 7.32039V0Z" fill="currentColor" />
          <path d="M171 29L185 17.7066V11.3247L171 0V7.25782L180.617 14.3905V14.6095L171 21.6796V29Z" fill="currentColor" />
        </svg>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>{domain}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 64, color: band, margin: '16px 0 8px' }}>
          {scoreLabel(overallScore)}<span style={{ fontSize: 22, color: 'var(--text-tertiary)' }}> / 10</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: band, fontWeight: 600, fontSize: 16, marginTop: 12 }}>
          <svg width="13" height="13" viewBox="0 0 12 12"><polygon points="6,1 11,11 1,11" fill="currentColor" /></svg>
          {bandLabel}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-tertiary)', marginTop: 24 }}>AI Visibility Audit</div>
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Audited {auditDateLabel} · Methodology v{methodologyVersion}</div>
      </div>

      {/* Overview */}
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px' }}>Overview</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: '150mm' }}>
        Overall score {scoreLabel(overallScore)}
        {scoreIntervalLow !== null && scoreIntervalHigh !== null && ` (interval ${scoreIntervalLow.toFixed(1)}–${scoreIntervalHigh.toFixed(1)})`}
        {categoryMedian !== null && `, against a category median of ${categoryMedian.toFixed(1)}`}.
      </p>

      {cappedPillarNotes.length > 0 && (
        <div style={{ breakInside: 'avoid', border: '1px solid var(--severity-warning-border)', background: 'var(--severity-warning-bg)', borderRadius: 6, padding: '10px 12px', margin: '8px 0 20px', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {cappedPillarNotes.map((note, i) => (
            <div key={i}>▲ {note}</div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pillar scores</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr><th style={th}>Pillar</th><th style={th}>Score</th><th style={th}>Category median</th></tr></thead>
          <tbody>
            {pillarTable.map((p, i) => (
              <tr key={p.key} style={{ breakInside: 'avoid' }}>
                <td style={i === pillarTable.length - 1 ? tdLast : td}>{p.label}</td>
                <td style={{ ...(i === pillarTable.length - 1 ? tdLast : td), fontFamily: 'var(--font-mono)', color: bandFgFromScore(p.score) }}>{scoreLabel(p.score)}</td>
                <td style={{ ...(i === pillarTable.length - 1 ? tdLast : td), fontFamily: 'var(--font-mono)' }}>{scoreLabel(p.medianScore)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Competitors */}
      {competitors.length > 0 && (
        <>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px' }}>You vs competitors</h1>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginBottom: 28 }}>
            <thead>
              <tr>
                <th style={th}>Brand</th>
                <th style={th}>Mentions</th>
                <th style={th}>Citations</th>
                <th style={th}>Avg position</th>
                <th style={th}>Sentiment</th>
              </tr>
            </thead>
            <tbody>
              {competitors.map((c, i) => (
                <tr key={i} style={{ breakInside: 'avoid', background: c.isTarget ? 'var(--accent-subtle-bg)' : undefined }}>
                  <td style={td}>{c.isTarget ? `${c.brand} (you)` : c.brand}</td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)' }}>{pctLabel(c.mentionsPct)}</td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)' }}>{pctLabel(c.citationsPct)}</td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)' }}>{c.avgPosition !== null ? c.avgPosition.toFixed(1) : '—'}</td>
                  <td style={td}>{c.sentiment ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Pillar detail */}
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '28px 0 12px', breakBefore: 'page' }}>Pillar detail</h1>
      {pillarSections.map((section) => (
        <div key={section.key} style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>{section.label}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 10px' }}>{section.summary}</p>
          {section.exampleFinding && (
            <div style={{ breakInside: 'avoid', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 12, marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: impactColor(section.exampleFinding.impact), textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                {section.exampleFinding.impact}
                {section.exampleFinding.expectedScoreDelta !== null && ` · ${scoreDeltaLabel(section.exampleFinding.expectedScoreDelta)} score`}
                {section.exampleFinding.effortLabel && ` · ${section.exampleFinding.effortLabel}`}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{section.exampleFinding.title}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{section.exampleFinding.description}</div>
            </div>
          )}
          {section.passedChecks.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              Passed checks ({section.passedChecks.length}): {section.passedChecks.join(' · ')}
            </div>
          )}
        </div>
      ))}

      {/* Fix plan — one priority-ordered table (see docs/specs/T-44.md: the
          reference design's Quick wins / Strategic initiatives split needs an
          hours-based bucket that isn't computed anywhere in the pipeline yet;
          `findings.effort` is a free-text label, not a number) */}
      {fixPlan.length > 0 && (
        <>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '28px 0 12px', breakBefore: 'page' }}>Fix plan</h1>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <tbody>
              {fixPlan.map((item, i) => (
                <tr key={i} style={{ breakInside: 'avoid' }}>
                  <td style={i === fixPlan.length - 1 ? tdLast : td}>{item.title}</td>
                  <td
                    style={{
                      ...(i === fixPlan.length - 1 ? tdLast : td),
                      fontFamily: 'var(--font-mono)',
                      color: item.expectedScoreDelta !== null ? scoreDeltaColor(item.expectedScoreDelta) : 'var(--text-tertiary)',
                    }}
                  >
                    {item.expectedScoreDelta !== null ? scoreDeltaLabel(item.expectedScoreDelta) : '—'}
                  </td>
                  <td style={{ ...(i === fixPlan.length - 1 ? tdLast : td), color: 'var(--text-tertiary)' }}>{item.effortLabel ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Appendix */}
      {appendixRows.length > 0 && (
        <>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '28px 0 12px', breakBefore: 'page' }}>Appendix: prompts &amp; answers</h1>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={th}>Engine</th>
                <th style={th}>Type</th>
                <th style={th}>Prompt</th>
                <th style={th}>Answer</th>
                <th style={th}>Mentioned</th>
              </tr>
            </thead>
            <tbody>
              {appendixRows.map((row, i) => (
                <tr key={i} style={{ breakInside: 'avoid' }}>
                  <td style={i === appendixRows.length - 1 ? tdLast : td}>{row.engine}</td>
                  <td style={i === appendixRows.length - 1 ? tdLast : td}>{row.promptType}</td>
                  <td style={{ ...(i === appendixRows.length - 1 ? tdLast : td), fontFamily: 'var(--font-mono)' }}>{row.promptText}</td>
                  <td style={i === appendixRows.length - 1 ? tdLast : td}>{row.answerPreview ?? '—'}</td>
                  <td style={{ ...(i === appendixRows.length - 1 ? tdLast : td), color: row.mentioned ? 'var(--band-high-fg)' : 'var(--band-low-fg)' }}>{row.mentioned ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 16 }}>
            Full evidence artefacts (screenshots, raw HTTP responses) are available at the web report&apos;s appendix.
          </p>
        </>
      )}
    </div>
  );
}
