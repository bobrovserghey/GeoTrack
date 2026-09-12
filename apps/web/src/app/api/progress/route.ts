import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { reportTokens, audits, auditEvents } from '@geotrack/db';
import { hashProgressToken, isTerminal } from '@geotrack/core';
import { eq, and, gt, asc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const token = searchParams.get('token');
  const afterSeq = parseInt(searchParams.get('after_seq') ?? '-1', 10);

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const hash = hashProgressToken(token);
  const db = getDb();

  const [tokenRow] = await db
    .select()
    .from(reportTokens)
    .where(and(eq(reportTokens.tokenHash, hash), eq(reportTokens.tokenType, 'progress')))
    .limit(1);

  if (!tokenRow) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  if (tokenRow.expiresAt && new Date() > tokenRow.expiresAt) {
    return NextResponse.json({ error: 'Token expired' }, { status: 401 });
  }

  const auditId = tokenRow.auditId;

  const [audit] = await db
    .select({ status: audits.status })
    .from(audits)
    .where(eq(audits.id, auditId))
    .limit(1);

  if (!audit) {
    return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
  }

  const events = await db
    .select({
      seq: auditEvents.seq,
      eventType: auditEvents.eventType,
      payload: auditEvents.payload,
      createdAt: auditEvents.createdAt,
    })
    .from(auditEvents)
    .where(and(eq(auditEvents.auditId, auditId), gt(auditEvents.seq, afterSeq)))
    .orderBy(asc(auditEvents.seq));

  return NextResponse.json({
    auditId,
    status: audit.status,
    isTerminal: isTerminal(audit.status),
    events,
  });
}
