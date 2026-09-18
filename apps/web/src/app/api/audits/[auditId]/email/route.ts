import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Inngest } from 'inngest';
import { createClient as createSupabaseServer } from '@supabase/supabase-js';
import { getDb } from '@/lib/db';
import { reportTokens, users, audits } from '@geotrack/db';
import { hashProgressToken, normalizeEmail } from '@geotrack/core';
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
  const body = (await request.json()) as { progressToken?: string; email?: string };
  const { progressToken, email } = body;

  if (!progressToken) {
    return NextResponse.json({ error: 'progressToken required' }, { status: 400 });
  }
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'valid email required' }, { status: 400 });
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

  const emailNormalized = normalizeEmail(email);

  const rawEmail = email.trim().toLowerCase();

  await db
    .insert(users)
    .values({
      email: rawEmail,
      emailNormalized,
      emailVerified: false,
      authProvider: 'magic_link',
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { emailNormalized, authProvider: 'magic_link' },
    });

  await db
    .update(audits)
    .set({ emailNormalized })
    .where(eq(audits.id, auditId));

  await inngest.send({
    name: 'geotrack/audit.email.provided',
    data: { auditId, emailNormalized },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && supabaseServiceKey) {
    const supabase = createSupabaseServer(supabaseUrl, supabaseServiceKey);
    const reportUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/report/${auditId}`;
    await supabase.auth.signInWithOtp({
      email: rawEmail,
      options: { emailRedirectTo: reportUrl },
    });
  }

  return new NextResponse(null, { status: 204 });
}
