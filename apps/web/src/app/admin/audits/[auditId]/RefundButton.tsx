'use client';

import { useState } from 'react';

export function RefundButton({ auditId }: { auditId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleRefund() {
    // Unlike restarting a step, this charges a real refund through Paddle —
    // not reversible from this UI, so it gets an explicit confirmation
    // unlike RestartButton's single click.
    if (!window.confirm('Refund this audit through Paddle? This cannot be undone from here.')) {
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/audits/${auditId}/refund`, { method: 'POST' });
      const json = (await res.json()) as { ok?: boolean; status?: string; error?: string };
      setResult(json.ok ? `Refunded — status: ${json.status}` : (json.error ?? 'Error'));
    } catch {
      setResult('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleRefund}
        disabled={loading}
        style={{ padding: '0.5rem 1rem', background: '#c00', color: '#fff', border: 'none', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer', fontSize: '0.875rem' }}
      >
        {loading ? 'Refunding…' : 'Refund'}
      </button>
      {result && <span style={{ marginLeft: '1rem', fontSize: '0.8rem', color: '#555' }}>{result}</span>}
    </div>
  );
}
