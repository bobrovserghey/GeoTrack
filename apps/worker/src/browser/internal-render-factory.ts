import { chromium } from 'playwright';
import type { BrowserContext } from 'playwright';
import { shouldBlockInternalRequest } from './browser-guard.js';

export type { BrowserContext } from 'playwright';

// See ADR-025 (amended 2026-10-01): this is a DELIBERATELY SEPARATE factory
// from createAuditContext (playwright-factory.ts). That one is hardened
// against SSRF for arbitrary external sites supplied by users; this one
// always targets our own internal render route, so there is no untrusted
// host to resolve or block. It no longer reuses shouldBlockRequest's
// port-allowlist/IP-literal checks (those assume an untrusted target and
// would block ordinary deployments — localhost:3000 in dev, a container's
// internal hostname on a non-80/443 port); instead it allows only the one
// configured `baseUrl` origin via shouldBlockInternalRequest, and blocks
// every other origin outright.

export type InternalRenderContextOptions = {
  serviceKey: string;
  baseUrl: string;
};

// `new URL()` alone is a derivation, not a validation: `new URL('localhost:3000')`
// does NOT throw — WHATWG parses it as a non-special scheme (protocol
// 'localhost:', origin the *string* "null"). A schemeless or file:/ftp: baseUrl
// would therefore produce an allowedOrigin that no http(s) request can ever
// match, and every request would be aborted with ERR_BLOCKED_BY_CLIENT — safe
// (fails closed) but undiagnosable. Fail loudly on the config instead.
// These messages end up in the step's `notes` (see steps/report-pdf.ts), which
// are logged and persisted — so they must never echo the raw baseUrl back. A
// misconfiguration that lands a connection string here (postgres://user:pass@…)
// or a URL with ?apikey=… would otherwise write the secret straight to the log,
// which CLAUDE.md forbids. Only the scheme and host are ever quoted, never
// userinfo, path or query.
function resolveAllowedOrigin(baseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    // Unparseable: nothing can be safely extracted, so quote nothing at all.
    throw new Error('createInternalRenderContext: baseUrl is not a valid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `createInternalRenderContext: baseUrl must be http(s), got scheme ${parsed.protocol} for host ${parsed.host || '(none)'}`,
    );
  }
  return parsed.origin;
}

export async function createInternalRenderContext(
  options: InternalRenderContextOptions,
): Promise<BrowserContext> {
  // Deliberately before chromium.launch(): a bad baseUrl must throw without
  // leaving an orphaned Chromium process behind.
  const allowedOrigin = resolveAllowedOrigin(options.baseUrl);
  const browser = await chromium.launch({ headless: true });

  // Only the BrowserContext is handed back, so the caller has no handle on the
  // browser until this function returns successfully: any failure after launch
  // must close the browser here, or the Chromium process leaks per failure.
  try {
    const context = await browser.newContext({
      javaScriptEnabled: true,
      extraHTTPHeaders: { 'x-service-key': options.serviceKey },
    });

    await context.route('**/*', async (route) => {
      const request = route.request();
      const decision = shouldBlockInternalRequest(request.url(), request.resourceType(), allowedOrigin);
      if (decision.blocked) {
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });

    return context;
  } catch (err) {
    await browser.close().catch(() => {});
    throw err;
  }
}
