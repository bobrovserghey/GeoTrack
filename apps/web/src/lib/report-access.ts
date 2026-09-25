import { and, eq } from 'drizzle-orm';
import { reportTokens } from '@geotrack/db';
import { generateReportToken, hashReportToken } from '@geotrack/core';
import type { createClient } from '@geotrack/db/client';

type DbClient = ReturnType<typeof createClient>;

/**
 * Checks a report token against `report_tokens` for the given audit (ADR-006).
 * Returns false for a missing, malformed, foreign or expired token — callers
 * answer 404 so a wrong token never confirms that the audit exists.
 */
export async function isValidReportToken(
  db: DbClient,
  auditId: string,
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;

  const rows = await db
    .select({ id: reportTokens.id, expiresAt: reportTokens.expiresAt })
    .from(reportTokens)
    .where(
      and(
        eq(reportTokens.auditId, auditId),
        eq(reportTokens.tokenType, 'report'),
        eq(reportTokens.tokenHash, hashReportToken(token)),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return false;
  if (row.expiresAt && new Date() > row.expiresAt) return false;
  return true;
}

export async function issueReportToken(db: DbClient, auditId: string): Promise<string> {
  const { token, hash } = generateReportToken();
  await db.insert(reportTokens).values({ auditId, tokenHash: hash, tokenType: 'report' });
  return token;
}
