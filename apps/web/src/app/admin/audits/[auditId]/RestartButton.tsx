'use client';

import { useState } from 'react';

export function RestartButton({ auditId }: { auditId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleRestart() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/audits/${auditId}/restart-step`, { method: 'POST' });
      const json = await res.json() as { ok?: boolean; error?: string };
      setResult(json.ok ? 'Restart logged.' : (json.error ?? 'Error'));
    } catch {
      setResult('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleRestart}
        disabled={loading}
        style={{ padding: '0.5rem 1rem', background: '#c00', color: '#fff', border: 'none', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer', fontSize: '0.875rem' }}
      >
        {loading ? 'Logging…' : 'Restart step'}
      </button>
      {result && <span style={{ marginLeft: '1rem', fontSize: '0.8rem', color: '#555' }}>{result}</span>}
    </div>
  );
}
