import { chromium } from 'playwright';
import type { BrowserContext } from 'playwright';
import { shouldBlockRequest } from './browser-guard.js';

export type { BrowserContext } from 'playwright';

// See ADR-025: this is a DELIBERATELY SEPARATE factory from createAuditContext
// (playwright-factory.ts). That one is hardened against SSRF for arbitrary
// external sites supplied by users; this one always targets our own internal
// render route, so there is no untrusted host to resolve or block. It still
// reuses shouldBlockRequest for scheme/port/resource-type hygiene, which holds
// regardless of how much the target is trusted.

export type InternalRenderContextOptions = {
  serviceKey: string;
};

export async function createInternalRenderContext(
  options: InternalRenderContextOptions,
): Promise<BrowserContext> {
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
      const decision = shouldBlockRequest(request.url(), request.resourceType());
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
