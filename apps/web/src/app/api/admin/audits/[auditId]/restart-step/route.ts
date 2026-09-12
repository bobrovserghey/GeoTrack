import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { isValidSession, ADMIN_COOKIE } from '@/lib/admin-auth';
import { getDb } from '@/lib/db';
import { audits, auditEvents } from '@geotrack/db';
import { eq, max } from 'drizzle-orm';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const cookieStore = await cookies();
  if (!isValidSession(cookieStore.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { auditId } = await params;
  const db = getDb();

  const [audit] = await db.select().from(audits).where(eq(audits.id, auditId)).limit(1);
  if (!audit) return NextResponse.json({ error: 'Audit not found' }, { status: 404 });

  const [seqRow] = await db
    .select({ maxSeq: max(auditEvents.seq) })
    .from(auditEvents)
    .where(eq(auditEvents.auditId, auditId));

  const nextSeq = (seqRow?.maxSeq ?? -1) + 1;

  await db.insert(auditEvents).values({
    auditId,
    seq: nextSeq,
    eventType: 'admin.step_restart',
    payload: { triggeredAt: new Date().toISOString() },
  });

  return NextResponse.json({ ok: true, seq: nextSeq });
}
