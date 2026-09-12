import { chromium } from 'playwright';
import type { BrowserContext } from 'playwright';
import { isBlockedIp } from '@geotrack/core/net/safe-fetch';
import { shouldBlockRequest } from './browser-guard.js';

export type AuditContextOptions = {
  auditId: string;
  resolver?: (hostname: string) => Promise<string[]>;
};

// Simple per-audit DNS cache: hostname → first safe IP
function makeAuditCache(resolver: (hostname: string) => Promise<string[]>) {
  const cache = new Map<string, string>();
  return async (hostname: string): Promise<string> => {
    if (cache.has(hostname)) return cache.get(hostname)!;
    const ips = await resolver(hostname);
    for (const ip of ips) {
      if (isBlockedIp(ip)) throw new Error(`Blocked IP for hostname ${hostname}: ${ip}`);
    }
    const first = ips[0];
    if (!first) throw new Error(`No addresses for ${hostname}`);
    cache.set(hostname, first);
    return first;
  };
}

async function defaultResolver(hostname: string): Promise<string[]> {
  const { resolve4, resolve6 } = await import('node:dns/promises');
  const results = await Promise.allSettled([resolve4(hostname), resolve6(hostname)]);
  const ips: string[] = [];
  for (const r of results) if (r.status === 'fulfilled') ips.push(...r.value);
  return ips;
}

export async function createAuditContext(options: AuditContextOptions): Promise<BrowserContext> {
  const resolveHostname = makeAuditCache(options.resolver ?? defaultResolver);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ javaScriptEnabled: true });

  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    const resourceType = request.resourceType();

    const decision = shouldBlockRequest(url, resourceType);
    if (decision.blocked) {
      await route.abort('blockedbyclient');
      return;
    }

    // Resolve hostname and check IPs (residual SSRF via Chromium DNS)
    try {
      const parsed = new URL(url);
      await resolveHostname(parsed.hostname);
    } catch {
      await route.abort('blockedbyclient');
      return;
    }

    await route.continue();
  });

  return context;
}
