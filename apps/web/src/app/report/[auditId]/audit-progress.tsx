'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ---- types ------------------------------------------------------------------

type AuditEvent = {
  seq: number;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

type Candidate = { id: string; slug: string; name: string; confidence: number };

// ---- constants --------------------------------------------------------------

const READY_STATUSES = new Set(['completed', 'in_review', 'delivered']);

const LOGO_SVG =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTg1IiBoZWlnaHQ9IjI5IiB2aWV3Qm94PSIwIDAgMTg1IDI5IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOmMycGE9Imh0dHA6Ly9jMnBhLm9yZy9tYW5pZmVzdCI+PG1ldGFkYXRhPjxjMnBhOm1hbmlmZXN0PkFBQVdnbXAxYldJQUFBQWVhblZ0WkdNeWNHRUFFUUFRZ0FBQXFnQTRtM0VEWXpKd1lRQUFBQlpjYW5WdFlnQUFBRWRxZFcxa1l6SnRZUUFSQUJDQUFBQ3FBRGliY1FOMWNtNDZZekp3WVRwbVlqaGtZMkV5Tmkwd09EaGtMVFE0WWpZdE9HUTNZUzB3WVRVNFkyVmtZMk5rTldZQUFBQURsMnAxYldJQUFBQXBhblZ0WkdNeVlYTUFFUUFRZ0FBQXFnQTRtM0VEWXpKd1lTNWhjM05sY25ScGIyNXpBQUFBQUx4cWRXMWlBQUFBUkdwMWJXUmpZbTl5QUJFQUVJQUFBS29BT0p0eEUyTXljR0V1YVc1bmNtVmthV1Z1ZEM1Mk13QUFBQUFZWXpKemFDOTZKcjI1NmxQMGROZDZFVXhPL0o4QUFBQndZMkp2Y3FOcFpHTTZabTl5YldGMGJXbHRZV2RsTDNOMlp5dDRiV3hxYVc1emRHRnVZMlZKUkhnc2VHMXdPbWxwWkRveU1qWTRZbUl6T1MwM05EUTVMVFJqWVRBdE9EVXhaUzAxT0ROaU9XRTROakU1TVRSc2NtVnNZWFJwYjI1emFHbHdhSEJoY21WdWRFOW1BQUFCNGl...';

const PILLARS = [
  {
    key: 'A',
    name: 'Answer Visibility',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M4 6h16v10H9l-4 4V6z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 10h8M8 13h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'B',
    name: 'AI Crawlability',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="6" cy="18" r="2.2" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="18" cy="18" r="2.2" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="12" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 17l3-9M16 17l-3-9" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    key: 'C',
    name: 'Content Citability',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M7 8c-2 0-3 1.5-3 3.5S5 15 7 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M15 8c-2 0-3 1.5-3 3.5S13 15 15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'D',
    name: 'Entity & Authority',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    key: 'E',
    name: 'Agent-Readiness',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="5" width="17" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 10l3 2.5-3 2.5M12.5 15h4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

// ---- spinner / pending icons ------------------------------------------------

function SpinnerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="var(--accent-default)" strokeOpacity="0.3" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="var(--accent-default)" strokeWidth="2" strokeLinecap="round">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 8 8"
          to="360 8 8"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}

function PendingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" fill="none" stroke="var(--border-strong)" strokeWidth="2" strokeDasharray="2 3" />
    </svg>
  );
}

// ---- event text mapping -----------------------------------------------------

function eventToText(ev: AuditEvent): string | null {
  const p = ev.payload;
  if (ev.eventType === 'status.changed') {
    const to = p['to'] as string | undefined;
    if (to === 'running' && !('autoSelected' in p)) return 'Audit started';
    if (to === 'waiting_category') return 'Waiting for category selection';
    if (to === 'running' && 'autoSelected' in p) return 'Pipeline resumed';
    if (to === 'completed') return 'Analysis complete';
    if (to === 'in_review') return 'Report sent to review';
    if (to === 'delivered') return 'Report delivered';
  }
  if (ev.eventType === 'category.preset') return 'Category preset from landing page';
  if (ev.eventType === 'step.started') {
    const step = p['step'] as string | undefined;
    if (step === 'crawl.stub') return 'Crawling site…';
    if (step === 'engine-poll.stub') return 'Querying AI engines…';
    return `Starting ${step}…`;
  }
  if (ev.eventType === 'step.completed') {
    const step = p['step'] as string | undefined;
    if (step === 'crawl.stub') return 'Site crawl done';
    if (step === 'engine-poll.stub') return 'AI engine data collected';
    return `${step} complete`;
  }
  return null;
}

// ---- status → progress % ---------------------------------------------------

function statusToProgress(status: string, eventCount: number): number {
  if (status === 'queued') return 5;
  if (status === 'running') return Math.min(25 + eventCount * 5, 75);
  if (status === 'waiting_category') return 50;
  if (READY_STATUSES.has(status)) return 100;
  return 10;
}

// ---- main component ---------------------------------------------------------

export default function AuditProgress({
  domain,
  auditId,
  progressToken,
}: {
  domain: string;
  auditId: string;
  progressToken: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string>('queued');
  const [feedItems, setFeedItems] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [noneSelected, setNoneSelected] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [taxonomy, setTaxonomy] = useState<{ id: string; name: string }[]>([]);
  const [taxonomyLoaded, setTaxonomyLoaded] = useState(false);
  const [candidatesLoaded, setCandidatesLoaded] = useState(false);
  const [submittingCategory, setSubmittingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const lastSeqRef = useRef(-1);
  const feedEndRef = useRef<HTMLDivElement | null>(null);

  // Load taxonomy once for search
  const loadTaxonomy = useCallback(async () => {
    if (taxonomyLoaded) return;
    try {
      const res = await fetch('/api/taxonomy');
      if (res.ok) {
        const data = (await res.json()) as { categories: { id: string; name: string }[] };
        setTaxonomy(data.categories);
        setTaxonomyLoaded(true);
      }
    } catch {
      // ignore
    }
  }, [taxonomyLoaded]);

  // Load candidates when modal is shown
  const loadCandidates = useCallback(async () => {
    if (candidatesLoaded) return;
    if (!progressToken) return;
    try {
      const res = await fetch(
        `/api/audits/${auditId}/candidates?pt=${encodeURIComponent(progressToken)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { candidates: Candidate[] };
        setCandidates(data.candidates);
        setCandidatesLoaded(true);
      }
    } catch {
      // ignore
    }
  }, [auditId, progressToken, candidatesLoaded]);

  // Poll progress
  useEffect(() => {
    if (!progressToken) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(
          `/api/progress?token=${encodeURIComponent(progressToken)}&after_seq=${lastSeqRef.current}`,
        );
        if (res.ok) {
          const data = (await res.json()) as {
            status: string;
            isTerminal: boolean;
            events: AuditEvent[];
          };

          setStatus(data.status);

          // Accumulate feed items
          if (data.events.length > 0) {
            const newTexts = data.events
              .map(eventToText)
              .filter((t): t is string => t !== null);
            if (newTexts.length > 0) {
              setFeedItems((prev) => [...prev, ...newTexts]);
            }
            lastSeqRef.current = Math.max(...data.events.map((e) => e.seq));
          }

          // Show/hide category modal
          if (data.status === 'waiting_category' && !noneSelected) {
            setShowModal(true);
            setCategoryError(null);
            loadCandidates();
            loadTaxonomy();
          } else if (data.status !== 'waiting_category') {
            setShowModal(false);
          }

          if (data.isTerminal) {
            if (READY_STATUSES.has(data.status)) {
              router.replace(`/report/${auditId}`);
            }
            // stop polling for any terminal status (including failed)
            return;
          }
        }
      } catch {
        // network error — keep polling
      }
      if (!cancelled) {
        timeoutId = setTimeout(poll, 2000);
      }
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [progressToken, auditId, router, noneSelected, loadCandidates, loadTaxonomy]);

  // Scroll feed to bottom on new items
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [feedItems]);

  const progress = statusToProgress(status, feedItems.length);

  const handleSelectCategory = (id: string) => {
    setSelectedCategoryId((prev) => (prev === id ? null : id));
    setSearchQuery('');
  };

  const handleContinue = async () => {
    if (!selectedCategoryId || !progressToken || submittingCategory) return;
    setSubmittingCategory(true);
    try {
      const res = await fetch(`/api/audits/${auditId}/category`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progressToken, categoryId: selectedCategoryId }),
      });
      if (!res.ok) {
        setCategoryError('Failed to save. Please try again.');
      } else {
        setCategoryError(null);
        setShowModal(false);
      }
    } catch {
      setCategoryError('Failed to save. Please try again.');
    } finally {
      setSubmittingCategory(false);
    }
  };

  const filteredTaxonomy = searchQuery.length > 1
    ? taxonomy.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5)
    : [];

  const firstPillarActive = status === 'running';

  return (
    <div style={{ fontFamily: "'Google Sans Flex', var(--font-ui)", background: 'var(--bg-canvas)', color: 'var(--text-primary)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* NAV */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px clamp(16px, 4vw, 24px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <img src={LOGO_SVG} alt="Geotrack" style={{ height: 22, width: 'auto' }} />
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-full)', padding: 2 }}>
            <span style={{ fontFamily: 'var(--font-ui)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 'var(--radius-full)' }}>EN</span>
            <span style={{ fontFamily: 'var(--font-ui)', color: 'var(--text-tertiary)', fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 'var(--radius-full)' }}>RO</span>
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div style={{ flex: 1 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(20px, 4vw, 40px) clamp(16px, 4vw, 24px) 64px' }}>

          {/* Headline */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
            <h1 style={{ margin: 0, fontSize: 'clamp(22px, 3vw, 28px)', fontWeight: 700, color: 'var(--text-primary)' }}>
              Auditing{' '}
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{domain}</span>
            </h1>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Usually 2–4 minutes</div>
          </div>

          {/* Progress bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
            <div style={{ flex: '1 1 0%', height: 6, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--accent-default)', borderRadius: 'var(--radius-full)', width: `${progress}%`, transition: 'width 400ms var(--ease-out)' }} />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 38, textAlign: 'right' }}>
              {progress}%
            </span>
          </div>

          {/* Two-column grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 32 }}>

            {/* Left: Pillars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', marginBottom: 4 }}>Pillars</div>
              {PILLARS.map((pillar, idx) => (
                <div
                  key={pillar.key}
                  style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>{pillar.icon}</div>
                    <div style={{ flex: '1 1 0%', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{pillar.name}</div>
                    {idx === 0 && firstPillarActive ? <SpinnerIcon /> : <PendingIcon />}
                  </div>
                </div>
              ))}
            </div>

            {/* Right: Live feed + email */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>Live feed</div>
              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto' }}>
                {feedItems.length === 0 && (
                  <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Starting…</div>
                )}
                {feedItems.map((text, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                    <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>›</span>
                    <span>{text}</span>
                  </div>
                ))}
                <div ref={feedEndRef} />
              </div>

              {/* Email notification */}
              <div style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--accent-subtle-border)', background: 'var(--accent-subtle-bg)', borderRadius: 'var(--radius-lg)', padding: 18, fontFamily: 'var(--font-ui)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Email me the link when it&rsquo;s ready</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 0%', minWidth: 200, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <input
                        placeholder="you@company.com"
                        style={{ width: '100%', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', padding: '9px 12px', fontSize: 13, fontFamily: 'var(--font-ui)', background: 'var(--bg-surface)', color: 'var(--text-primary)', height: 38, boxSizing: 'border-box', outline: 'none' }}
                      />
                    </div>
                    <button style={{ flexShrink: 0, background: 'var(--accent-default)', color: 'var(--text-on-accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '0 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)', height: 38 }}>Notify me</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-tertiary)', fontSize: 12 }}>
                    <span style={{ flex: '1 1 0%', height: 1, background: 'var(--border-subtle)' }} />
                    or
                    <span style={{ flex: '1 1 0%', height: 1, background: 'var(--border-subtle)' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexDirection: 'row' }}>
                    <button style={{ flex: '1 1 0%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)', padding: '9px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
                      <svg width="15" height="15" viewBox="0 0 18 18">
                        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
                        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.36 0-4.35-1.6-5.06-3.75H.9v2.34C2.38 16 5.44 18 9 18z" />
                        <path fill="#FBBC05" d="M3.94 10.67A5.4 5.4 0 0 1 3.65 9c0-.58.1-1.14.29-1.67V4.99H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.01l3.04-2.34z" />
                        <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.44 0 2.38 2 .9 4.99l3.04 2.34C4.65 5.18 6.64 3.58 9 3.58z" />
                      </svg>
                      Continue with Google
                    </button>
                    <button style={{ flex: '1 1 0%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)', padding: '9px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
                      <svg width="14" height="14" viewBox="0 0 21 21">
                        <rect x="0" y="0" width="10" height="10" fill="#F25022" />
                        <rect x="11" y="0" width="10" height="10" fill="#7FBA00" />
                        <rect x="0" y="11" width="10" height="10" fill="#00A4EF" />
                        <rect x="11" y="11" width="10" height="10" fill="#FFB900" />
                      </svg>
                      Continue with Microsoft
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Report preview */}
          <div style={{ marginTop: 40 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', marginBottom: 12 }}>Report preview</div>
            <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)', padding: 'clamp(20px, 4vw, 32px)', display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <svg width="110" height="110" viewBox="0 0 110 110">
                  <circle cx="55" cy="55" r="45" fill="none" stroke="var(--border-subtle)" strokeWidth="8" />
                  <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" fontFamily="var(--font-mono)" fontWeight="700" fontSize="26" fill="var(--text-tertiary)">–</text>
                  <text x="50%" y="68%" textAnchor="middle" fontFamily="var(--font-ui)" fontSize="9" fill="var(--text-tertiary)">/ 10</text>
                </svg>
              </div>
              <div style={{ flex: '1 1 0%', minWidth: 200 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Audit in progress</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>– of 5 pillars scored. – findings, – critical.</div>
              </div>
              <a href="#" style={{ background: 'var(--bg-subtle)', color: 'var(--text-disabled)', border: 'none', borderRadius: 'var(--radius-md)', padding: '12px 22px', fontSize: 14, fontWeight: 600, textDecoration: 'none', flexShrink: 0, pointerEvents: 'none' }}>View full report</a>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px clamp(16px, 4vw, 24px)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-secondary)' }}>
          <span>© 2026 Geotrack</span>
          <a href="#" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Privacy</a>
          <a href="#" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Terms</a>
        </div>
      </div>

      {/* S3 CATEGORY MODAL */}
      {showModal && !noneSelected && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: 480, padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-primary)' }}>What category is {domain}?</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {candidates.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleSelectCategory(c.id)}
                  style={{
                    textAlign: 'left',
                    border: `1.5px solid ${selectedCategoryId === c.id ? 'var(--accent-default)' : 'var(--border-subtle)'}`,
                    background: selectedCategoryId === c.id ? 'var(--accent-subtle-bg)' : 'var(--bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px 14px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-ui)',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
                </button>
              ))}
              {candidates.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '8px 0' }}>Searching categories…</div>
              )}
            </div>

            {/* Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-app)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="5.2" stroke="var(--text-tertiary)" strokeWidth="1.4" />
                <path d="M11 11l3.5 3.5" stroke="var(--text-tertiary)" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <input
                placeholder="Search 200 categories"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ flex: '1 1 0%', border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}
              />
            </div>

            {/* Search results */}
            {filteredTaxonomy.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filteredTaxonomy.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectCategory(c.id)}
                    style={{
                      textAlign: 'left',
                      border: `1.5px solid ${selectedCategoryId === c.id ? 'var(--accent-default)' : 'var(--border-subtle)'}`,
                      background: selectedCategoryId === c.id ? 'var(--accent-subtle-bg)' : 'var(--bg-surface)',
                      borderRadius: 'var(--radius-md)',
                      padding: '10px 14px',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-ui)',
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setNoneSelected(true)}
              style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--accent-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 2, fontFamily: 'var(--font-ui)' }}
            >
              None of these
            </button>

            {categoryError !== null && (
              <div style={{ fontSize: 13, padding: '8px 12px', borderRadius: 'var(--radius-md)', background: 'var(--severity-critical-bg)', color: 'var(--severity-critical-fg)' }}>
                {categoryError}
              </div>
            )}

            <button
              onClick={handleContinue}
              disabled={!selectedCategoryId || submittingCategory}
              style={{
                background: selectedCategoryId ? 'var(--accent-default)' : 'var(--bg-subtle)',
                color: selectedCategoryId ? 'var(--text-on-accent)' : 'var(--text-disabled)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                padding: '12px 16px',
                fontSize: 14,
                fontWeight: 600,
                cursor: selectedCategoryId ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font-ui)',
              }}
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
