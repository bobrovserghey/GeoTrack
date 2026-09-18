import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { reportTokens, categories } from '@geotrack/db';
import { hashProgressToken } from '@geotrack/core';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;
  const pt = request.nextUrl.searchParams.get('pt');

  if (!pt) {
    return NextResponse.json({ error: 'pt required' }, { status: 400 });
  }

  const hash = hashProgressToken(pt);
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

  const rows = await db
    .select({ slug: categories.slug, name: categories.name, confidence: categories.confidence })
    .from(categories)
    .where(eq(categories.auditId, auditId))
    .orderBy(desc(categories.confidence))
    .limit(3);

  return NextResponse.json({
    candidates: rows.map((r) => ({
      id: r.slug,
      slug: r.slug,
      name: r.name,
      confidence: parseFloat(r.confidence),
    })),
  });
}
