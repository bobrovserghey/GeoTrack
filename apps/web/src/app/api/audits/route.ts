import { NextResponse } from 'next/server';
import { Inngest } from 'inngest';
import { createClient } from '@geotrack/db/client';
import { audits, reportTokens } from '@geotrack/db';
import { normalizeDomain, generateProgressToken, checkRateLimits } from '@geotrack/core';
import type { RateLimitDeps } from '@geotrack/core';
import { getAuditProfile, getMethodology } from '@geotrack/config';
import { eq, and, gte, count } from 'drizzle-orm';

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

function validateServiceKey(headers: Headers): boolean {
  const serviceKey = process.env.AUDIT_SERVICE_KEY;
  if (!serviceKey) return false;
  return headers.get('x-service-key') === serviceKey;
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? '0.0.0.0';
  return '0.0.0.0';
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    url?: string;
    turnstileToken?: string;
    category?: string;
    competitors?: string;
  };
  const { url: rawUrl, turnstileToken, category, competitors } = body;

  if (!rawUrl) {
    return NextResponse.json({ error: 'url required' }, { status: 422 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
  } catch {
    return NextResponse.json({ error: 'invalid url' }, { status: 422 });
  }

  const isInternal = validateServiceKey(request.headers);

  if (!isInternal) {
    if (!turnstileToken) {
      return NextResponse.json({ error: 'turnstile token required' }, { status: 400 });
    }
    const valid = await verifyTurnstile(turnstileToken);
    if (!valid) {
      return NextResponse.json({ error: 'turnstile verification failed' }, { status: 400 });
    }
  }

  const db = createClient(process.env.DATABASE_URL!);
  const domain = normalizeDomain(parsedUrl.hostname);
  const ipAddress = getClientIp(request);
  const dailyCeiling = parseInt(process.env.FREE_DAILY_CEILING ?? '0', 10);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const rateLimitDeps: RateLimitDeps = {
    countTeasersByDomain: async (d) => {
      const [row] = await db
        .select({ n: count() })
        .from(audits)
        .where(and(
          eq(audits.domainNormalized, d),
          eq(audits.auditType, 'teaser'),
          gte(audits.createdAt, thirtyDaysAgo),
        ));
      return Number(row?.n ?? 0);
    },
    countTeasersByEmail: async (email) => {
      const [row] = await db
        .select({ n: count() })
        .from(audits)
        .where(and(
          eq(audits.emailNormalized, email),
          eq(audits.auditType, 'teaser'),
          gte(audits.createdAt, thirtyDaysAgo),
        ));
      return Number(row?.n ?? 0);
    },
    countByIpHour: async (_ip) => 0,
    countByIpDay: async (_ip) => 0,
    countTeasersToday: async () => {
      const [row] = await db
        .select({ n: count() })
        .from(audits)
        .where(and(
          eq(audits.auditType, 'teaser'),
          gte(audits.createdAt, todayUtc),
        ));
      return Number(row?.n ?? 0);
    },
  };

  void oneHourAgo; // IP counting via Postgres deferred to T-26b (Redis/partitioned table)

  const limitResult = await checkRateLimits(
    { domainNormalized: domain, ipAddress, isInternal, dailyCeiling },
    rateLimitDeps,
  );

  if (!limitResult.allowed) {
    if (limitResult.reason === 'daily_ceiling') {
      // Create audit with scheduled_for; respond 202
      const profile = getAuditProfile('teaser');
      const methodology = getMethodology();
      const [scheduledAudit] = await db
        .insert(audits)
        .values({
          domain,
          domainNormalized: domain,
          url: parsedUrl.toString(),
          status: 'queued',
          auditType: 'teaser',
          profileId: 'teaser',
          profileVersion: profile.version,
          isInternal,
          locale: 'en',
          methodologyVersion: String(methodology.version),
          scheduledFor: limitResult.scheduledDate,
        })
        .returning({ id: audits.id });

      return NextResponse.json(
        { auditId: scheduledAudit?.id, scheduledDate: limitResult.scheduledDate },
        { status: 202 },
      );
    }

    return NextResponse.json(
      { error: 'rate_limited', reason: limitResult.reason },
      { status: 429 },
    );
  }

  const profile = getAuditProfile('teaser');
  const methodology = getMethodology();

  const [audit] = await db
    .insert(audits)
    .values({
      domain,
      domainNormalized: domain,
      url: parsedUrl.toString(),
      status: 'queued',
      auditType: 'teaser',
      profileId: 'teaser',
      profileVersion: profile.version,
      isInternal,
      locale: 'en',
      methodologyVersion: String(methodology.version),
    })
    .returning({ id: audits.id });

  const { token: progressToken, hash } = generateProgressToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(reportTokens).values({
    auditId: audit.id,
    tokenHash: hash,
    tokenType: 'progress',
    expiresAt,
  });

  const competitorsList = competitors
    ? competitors.split(',').map((c) => c.trim()).filter(Boolean)
    : [];

  await inngest.send({
    name: 'geotrack/audit.queued',
    data: {
      auditId: audit.id,
      ...(category?.trim() ? { categoryHint: category.trim() } : {}),
      ...(competitorsList.length > 0 ? { competitors: competitorsList } : {}),
    },
  });

  const softBlock = limitResult.allowed && limitResult.softBlock === true;
  return NextResponse.json(
    { auditId: audit.id, progressToken, ...(softBlock ? { softBlock: true } : {}) },
    { status: 201 },
  );
}
