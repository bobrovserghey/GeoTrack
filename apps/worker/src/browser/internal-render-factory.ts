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

export async function createInternalRenderContext(
  options: InternalRenderContextOptions,
): Promise<BrowserContext> {
  const allowedOrigin = new URL(options.baseUrl).origin;
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
