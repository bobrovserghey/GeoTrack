import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { audits } from '@geotrack/db';
import { createPaddleTransaction } from '@/lib/paddle';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Only the Standard tier has a buy button in the shipped teaser design
// (report-content.tsx) — Extended is purchasable server/webhook-side, but
// there is no 1:1-ported UI entry point for it yet. See docs/specs/T-45.md.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { teaserAuditId?: string } | null;
  const teaserAuditId = body?.teaserAuditId;

  if (typeof teaserAuditId !== 'string' || !UUID_RE.test(teaserAuditId)) {
    return NextResponse.json({ error: 'teaserAuditId required' }, { status: 422 });
  }

  const priceId = process.env.PADDLE_PRICE_ID_STANDARD;
  const apiKey = process.env.PADDLE_API_KEY;
  if (!priceId || !apiKey) {
    console.error('[checkout] PADDLE_PRICE_ID_STANDARD or PADDLE_API_KEY not configured');
    return NextResponse.json({ error: 'checkout not configured' }, { status: 500 });
  }

  const db = getDb();
  const [teaser] = await db.select({ id: audits.id, auditType: audits.auditType }).from(audits).where(eq(audits.id, teaserAuditId)).limit(1);
  if (!teaser || teaser.auditType !== 'teaser') {
    return NextResponse.json({ error: 'teaser audit not found' }, { status: 404 });
  }

  try {
    const { checkoutUrl } = await createPaddleTransaction(
      { apiKey },
      { priceId, customData: { teaserAuditId } },
    );
    return NextResponse.json({ checkoutUrl });
  } catch (err) {
    console.error('[checkout] failed to create Paddle transaction:', err);
    return NextResponse.json({ error: 'checkout failed' }, { status: 502 });
  }
}
