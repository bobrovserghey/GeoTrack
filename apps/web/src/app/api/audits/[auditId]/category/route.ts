import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Inngest } from 'inngest';
import { getDb } from '@/lib/db';
import { reportTokens } from '@geotrack/db';
import { hashProgressToken } from '@geotrack/core';
import { eq, and } from 'drizzle-orm';

const inngest = new Inngest({
  id: 'geotrack-web',
  ...(process.env.INNGEST_EVENT_KEY ? { eventKey: process.env.INNGEST_EVENT_KEY } : {}),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;
  const body = (await request.json()) as { progressToken?: string; categoryId?: string };
  const { progressToken, categoryId } = body;

  if (!progressToken) {
    return NextResponse.json({ error: 'progressToken required' }, { status: 400 });
  }
  if (!categoryId) {
    return NextResponse.json({ error: 'categoryId required' }, { status: 400 });
  }

  const hash = hashProgressToken(progressToken);
  const db = getDb();

  const [tokenRow] = await db
    .select()
    .from(reportTokens)
    .where(and(eq(reportTokens.tokenHash, hash), eq(reportTokens.tokenType, 'progress'), eq(reportTokens.auditId, auditId)))
    .limit(1);

  if (!tokenRow) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  if (tokenRow.expiresAt && new Date() > tokenRow.expiresAt) {
    return NextResponse.json({ error: 'Token expired' }, { status: 401 });
  }

  await inngest.send({
    name: 'geotrack/audit.category.selected',
    data: { auditId, categoryId },
  });

  return new NextResponse(null, { status: 204 });
}
