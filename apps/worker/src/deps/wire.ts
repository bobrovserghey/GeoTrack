import { createClient } from '@geotrack/db/client';
import { setAuditRunDeps } from '../functions/audit-run.js';
import { createAuditRunDeps } from './audit-run-deps.js';

// Connects the audit pipeline to the database at startup. Without
// DATABASE_URL the function keeps the placeholder deps in development and
// refuses to run in production (see resolveAuditRunDeps).
export function wireAuditRunDeps(env: Record<string, string | undefined> = process.env): boolean {
  const url = env['DATABASE_URL'];
  if (!url) return false;
  setAuditRunDeps(createAuditRunDeps(createClient(url)));
  return true;
}
