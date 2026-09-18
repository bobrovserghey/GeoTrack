'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase';

type Props = {
  auditId: string;
  progressToken: string;
};

export function EmailGate({ auditId, progressToken }: Props) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/audits/${auditId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progressToken, email }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? 'Something went wrong');
        return;
      }
      setSent(true);
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOAuth(provider: 'google' | 'microsoft') {
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const callbackUrl =
        `${window.location.origin}/api/auth/callback` +
        `?auditId=${encodeURIComponent(auditId)}` +
        `&progressToken=${encodeURIComponent(progressToken)}` +
        `&provider=${provider}`;
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: provider === 'microsoft' ? 'azure' : 'google',
        options: { redirectTo: callbackUrl },
      });
      if (oauthError || !data.url) {
        setError(oauthError?.message ?? 'OAuth failed');
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Network error');
    }
  }

  if (sent) {
    return (
      <div style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--accent-subtle-border)', background: 'var(--accent-subtle-bg)', borderRadius: 'var(--radius-lg)', padding: '18px', fontFamily: 'var(--font-ui)' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Check your inbox — we sent you a link.
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--accent-subtle-border)', background: 'var(--accent-subtle-bg)', borderRadius: 'var(--radius-lg)', padding: '18px', fontFamily: 'var(--font-ui)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
          We'll run 3 more checks about your brand and send you the link
        </div>

        <form onSubmit={handleMagicLink} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 0%', minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{ width: '100%', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', padding: '9px 12px', fontSize: '13px', fontFamily: 'var(--font-ui)', background: 'var(--bg-surface)', color: 'var(--text-primary)', height: '38px', boxSizing: 'border-box' }}
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            style={{ flexShrink: 0, background: 'var(--accent-default)', color: 'var(--text-on-accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '0px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)', height: '38px' }}
          >
            Send my link
          </button>
        </form>

        {error && (
          <div style={{ fontSize: '12px', color: 'var(--text-error, red)' }}>{error}</div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-tertiary)', fontSize: '12px' }}>
          <span style={{ flex: '1 1 0%', height: '1px', background: 'var(--border-subtle)' }} />
          or
          <span style={{ flex: '1 1 0%', height: '1px', background: 'var(--border-subtle)' }} />
        </div>

        <div style={{ display: 'flex', gap: '8px', flexDirection: 'row' }}>
          <button
            type="button"
            onClick={() => handleOAuth('google')}
            style={{ flex: '1 1 0%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)', padding: '9px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
          >
            <svg width="15" height="15" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.36 0-4.35-1.6-5.06-3.75H.9v2.34C2.38 16 5.44 18 9 18z" />
              <path fill="#FBBC05" d="M3.94 10.67A5.4 5.4 0 0 1 3.65 9c0-.58.1-1.14.29-1.67V4.99H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.01l3.04-2.34z" />
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.44 0 2.38 2 .9 4.99l3.04 2.34C4.65 5.18 6.64 3.58 9 3.58z" />
            </svg>
            Continue with Google
          </button>
          <button
            type="button"
            onClick={() => handleOAuth('microsoft')}
            style={{ flex: '1 1 0%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)', padding: '9px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
          >
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
  );
}
