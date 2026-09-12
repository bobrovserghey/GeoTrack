import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { audits, auditEvents, engineRuns } from '@geotrack/db';
import { eq, asc } from 'drizzle-orm';
import { RestartButton } from './RestartButton';
import Link from 'next/link';

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

export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;
  const db = getDb();

  const [audit] = await db.select().from(audits).where(eq(audits.id, auditId)).limit(1);
  if (!audit) notFound();

  const events = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.auditId, auditId))
    .orderBy(asc(auditEvents.seq));

  const runs = await db
    .select()
    .from(engineRuns)
    .where(eq(engineRuns.auditId, auditId))
    .orderBy(asc(engineRuns.createdAt));

  const statusColor = STATUS_COLORS[audit.status] ?? '#888';

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <Link href="/admin/audits" style={{ color: '#06a', textDecoration: 'none', fontSize: '0.875rem' }}>
          ← All audits
        </Link>
        <h2 style={{ margin: 0 }}>{audit.domain}</h2>
        <span style={{ display: 'inline-block', padding: '0.1rem 0.6rem', borderRadius: 4, fontSize: '0.8rem', fontWeight: 700, color: '#fff', background: statusColor }}>
          {audit.status}
        </span>
      </div>

      {/* Summary */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {[
          ['Type', audit.auditType],
          ['Profile', audit.profileId],
          ['Cost', `$${Number(audit.costUsd).toFixed(6)}`],
          ['Locale', audit.locale],
          ['Created', new Date(audit.createdAt).toISOString().replace('T', ' ').slice(0, 19)],
          ['Updated', new Date(audit.updatedAt).toISOString().replace('T', ' ').slice(0, 19)],
        ].map(([label, value]) => (
          <div key={label} style={{ background: '#f8f8f8', padding: '0.75rem 1rem', borderRadius: 6 }}>
            <div style={{ fontSize: '0.7rem', color: '#888', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.25rem' }}>{label}</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{value}</div>
          </div>
        ))}
      </section>

      {/* Admin actions */}
      {audit.status === 'needs_attention' && (
        <section style={{ marginBottom: '2rem', padding: '1rem', background: '#fff5f5', border: '1px solid #fcc', borderRadius: 6 }}>
          <h3 style={{ margin: '0 0 0.75rem', color: '#c00', fontSize: '1rem' }}>Admin actions — needs attention</h3>
          <RestartButton auditId={auditId} />
        </section>
      )}

      {/* Events timeline */}
      <section style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>
          Events ({events.length})
        </h3>
        {events.length === 0 ? (
          <p style={{ color: '#888', fontSize: '0.875rem' }}>No events recorded.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                <th style={{ padding: '0.4rem 0.5rem' }}>#</th>
                <th style={{ padding: '0.4rem 0.5rem' }}>Event</th>
                <th style={{ padding: '0.4rem 0.5rem' }}>Payload</th>
                <th style={{ padding: '0.4rem 0.5rem' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {events.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '0.4rem 0.5rem', color: '#aaa' }}>{e.seq}</td>
                  <td style={{ padding: '0.4rem 0.5rem', fontWeight: 500 }}>{e.eventType}</td>
                  <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'monospace', fontSize: '0.75rem', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {JSON.stringify(e.payload)}
                  </td>
                  <td style={{ padding: '0.4rem 0.5rem', color: '#888', whiteSpace: 'nowrap' }}>
                    {new Date(e.createdAt).toISOString().replace('T', ' ').slice(0, 19)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Engine runs / artifacts */}
      <section>
        <h3 style={{ fontSize: '1rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>
          Engine runs / artifacts ({runs.length})
        </h3>
        {runs.length === 0 ? (
          <p style={{ color: '#888', fontSize: '0.875rem' }}>No engine runs yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                <th style={{ padding: '0.4rem 0.5rem' }}>Engine</th>
                <th style={{ padding: '0.4rem 0.5rem' }}>Cost</th>
                <th style={{ padding: '0.4rem 0.5rem' }}>Tokens in/out</th>
                <th style={{ padding: '0.4rem 0.5rem' }}>Preview</th>
                <th style={{ padding: '0.4rem 0.5rem' }}>Artifact</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '0.4rem 0.5rem', fontWeight: 500 }}>{r.engine}</td>
                  <td style={{ padding: '0.4rem 0.5rem' }}>${Number(r.costUsd).toFixed(6)}</td>
                  <td style={{ padding: '0.4rem 0.5rem' }}>{r.usageTokensIn} / {r.usageTokensOut}</td>
                  <td style={{ padding: '0.4rem 0.5rem', color: '#555', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.responseTextPreview ?? '—'}
                  </td>
                  <td style={{ padding: '0.4rem 0.5rem' }}>
                    {r.responseTextRef ? (
                      <a href={r.responseTextRef} target="_blank" rel="noopener noreferrer" style={{ color: '#06a', fontSize: '0.75rem' }}>
                        Download
                      </a>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
