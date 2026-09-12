import { getDb } from '@/lib/db';
import { audits } from '@geotrack/db';
import { eq, desc } from 'drizzle-orm';
import type { AuditStatus } from '@geotrack/core';
import Link from 'next/link';

const ALL_STATUSES: AuditStatus[] = [
  'needs_attention',
  'queued',
  'running',
  'waiting_category',
  'waiting_email',
  'completed',
  'in_review',
  'delivered',
  'failed',
  'cancelled',
];

const STATUS_COLORS: Record<string, string> = {
  needs_attention: '#c00',
  queued: '#888',
  running: '#06a',
  waiting_category: '#a60',
  waiting_email: '#a60',
  completed: '#060',
  in_review: '#006',
  delivered: '#040',
  failed: '#800',
  cancelled: '#aaa',
};

function badge(status: string) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.1rem 0.5rem',
      borderRadius: 4,
      fontSize: '0.75rem',
      fontWeight: 600,
      color: '#fff',
      background: STATUS_COLORS[status] ?? '#888',
    }}>
      {status}
    </span>
  );
}

export default async function AuditsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const db = getDb();

  const rows = status && ALL_STATUSES.includes(status as AuditStatus)
    ? await db.select().from(audits).where(eq(audits.status, status as AuditStatus)).orderBy(desc(audits.createdAt)).limit(100)
    : await db.select().from(audits).orderBy(desc(audits.createdAt)).limit(100);

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Audits{status ? ` — ${status}` : ''}</h2>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <Link href="/admin/audits" style={{ padding: '0.35rem 0.75rem', borderRadius: 4, background: !status ? '#111' : '#eee', color: !status ? '#fff' : '#333', textDecoration: 'none', fontSize: '0.8rem' }}>
          All
        </Link>
        {ALL_STATUSES.map(s => (
          <Link key={s} href={`/admin/audits?status=${s}`} style={{ padding: '0.35rem 0.75rem', borderRadius: 4, background: status === s ? STATUS_COLORS[s] : '#eee', color: status === s ? '#fff' : '#333', textDecoration: 'none', fontSize: '0.8rem' }}>
            {s}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p style={{ color: '#888' }}>No audits found.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem 0.75rem' }}>Domain</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Type</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Status</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Cost USD</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Created</th>
              <th style={{ padding: '0.5rem 0.75rem' }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(a => (
              <tr key={a.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>{a.domain}</td>
                <td style={{ padding: '0.5rem 0.75rem', color: '#666' }}>{a.auditType}</td>
                <td style={{ padding: '0.5rem 0.75rem' }}>{badge(a.status)}</td>
                <td style={{ padding: '0.5rem 0.75rem' }}>${Number(a.costUsd).toFixed(4)}</td>
                <td style={{ padding: '0.5rem 0.75rem', color: '#888', fontSize: '0.8rem' }}>
                  {new Date(a.createdAt).toISOString().replace('T', ' ').slice(0, 19)}
                </td>
                <td style={{ padding: '0.5rem 0.75rem' }}>
                  <Link href={`/admin/audits/${a.id}`} style={{ color: '#06a', textDecoration: 'none', fontSize: '0.8rem' }}>
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
