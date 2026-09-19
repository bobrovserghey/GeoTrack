import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient as createSupabaseServer } from '@supabase/supabase-js';
import { Inngest } from 'inngest';
import { getDb } from '@/lib/db';
import { reportTokens, users, audits } from '@geotrack/db';
import { hashProgressToken, normalizeEmail } from '@geotrack/core';
import { eq, and } from 'drizzle-orm';

const inngest = new Inngest({
  id: 'geotrack-web',
  ...(process.env.INNGEST_EVENT_KEY ? { eventKey: process.env.INNGEST_EVENT_KEY } : {}),
});

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const auditId = searchParams.get('auditId');
  const progressToken = searchParams.get('progressToken');
  const providerHint = searchParams.get('provider') as 'google' | 'microsoft' | null;

  if (!code || !auditId || !progressToken) {
    return NextResponse.redirect(`${origin}/?error=missing_params`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(`${origin}/?error=supabase_not_configured`);
  }

  const supabase = createSupabaseServer(supabaseUrl, supabaseAnonKey);
  const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !sessionData?.user?.email) {
    return NextResponse.redirect(`${origin}/report/${auditId}?error=auth_failed`);
  }

  const rawEmail = sessionData.user.email.toLowerCase();
  const emailNormalized = normalizeEmail(rawEmail);

  const hash = hashProgressToken(progressToken);
  const db = getDb();

  const [tokenRow] = await db
    .select()
    .from(reportTokens)
    .where(and(eq(reportTokens.tokenHash, hash), eq(reportTokens.tokenType, 'progress'), eq(reportTokens.auditId, auditId)))
    .limit(1);

  if (!tokenRow) {
    return NextResponse.redirect(`${origin}/report/${auditId}?error=invalid_token`);
  }

  if (tokenRow.expiresAt && new Date() > tokenRow.expiresAt) {
    return NextResponse.redirect(`${origin}/report/${auditId}?error=token_expired`);
  }

  const provider = providerHint === 'microsoft' ? 'microsoft' : 'google';

  await db
    .insert(users)
    .values({
      email: rawEmail,
      emailNormalized,
      emailVerified: true,
      verifiedAt: new Date(),
      authProvider: provider,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { emailNormalized, emailVerified: true, verifiedAt: new Date(), authProvider: provider },
    });

  await db
    .update(audits)
    .set({ emailNormalized })
    .where(eq(audits.id, auditId));

  await inngest.send({
    name: 'geotrack/audit.email.provided',
    data: { auditId, emailNormalized },
  });

  return NextResponse.redirect(`${origin}/report/${auditId}`);
}
