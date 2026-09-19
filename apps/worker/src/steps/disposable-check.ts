import { isDisposableEmail, hasMxRecord, type MxResolver } from '@geotrack/core';

export type DisposableCheckResult = { blocked: false } | { blocked: true; reason: 'disposable' | 'no_mx' };

export async function runDisposableCheck(
  emailNormalized: string,
  resolveMx: MxResolver,
): Promise<DisposableCheckResult> {
  const atIdx = emailNormalized.lastIndexOf('@');
  const domain = atIdx >= 0 ? emailNormalized.slice(atIdx + 1) : emailNormalized;

  if (isDisposableEmail(domain)) {
    return { blocked: true, reason: 'disposable' };
  }

  const hasMx = await hasMxRecord(domain, resolveMx);
  if (!hasMx) {
    return { blocked: true, reason: 'no_mx' };
  }

  return { blocked: false };
}
