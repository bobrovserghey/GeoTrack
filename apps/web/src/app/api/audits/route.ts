import { NextResponse } from 'next/server';
import { Inngest } from 'inngest';
import { createClient } from '@geotrack/db/client';
import { audits } from '@geotrack/db/schema';
import { normalizeDomain } from '@geotrack/core';
import { getAuditProfile, getMethodology } from '@geotrack/config';

const inngest = new Inngest({
  id: 'geotrack-web',
  ...(process.env.INNGEST_EVENT_KEY ? { eventKey: process.env.INNGEST_EVENT_KEY } : {}),
});

async function verifyTurnstile(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // dev mode — skip verification
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, response: token }),
  });
  const data = (await res.json()) as { success: boolean };
  return data.success;
}

export async function POST(request: Request) {
  const body = (await request.json()) as { url?: string; turnstileToken?: string };
  const { url: rawUrl, turnstileToken } = body;

  if (!rawUrl) {
    return NextResponse.json({ error: 'url required' }, { status: 422 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
  } catch {
    return NextResponse.json({ error: 'invalid url' }, { status: 422 });
  }

  if (!turnstileToken) {
    return NextResponse.json({ error: 'turnstile token required' }, { status: 400 });
  }

  const valid = await verifyTurnstile(turnstileToken);
  if (!valid) {
    return NextResponse.json({ error: 'turnstile verification failed' }, { status: 400 });
  }

  const db = createClient(process.env.DATABASE_URL!);
  const domain = normalizeDomain(parsedUrl.hostname);
  const profile = getAuditProfile('teaser');
  const methodology = getMethodology();

  const [audit] = await db
    .insert(audits)
    .values({
      domain,
      url: parsedUrl.toString(),
      status: 'queued',
      auditType: 'teaser',
      profileId: 'teaser',
      profileVersion: profile.version,
      isInternal: false,
      locale: 'en',
      methodologyVersion: String(methodology.version),
    })
    .returning({ id: audits.id });

  await inngest.send({ name: 'geotrack/audit.queued', data: { auditId: audit.id } });

  return NextResponse.json({ auditId: audit.id }, { status: 201 });
}
