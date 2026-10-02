import type { StepResult } from '@geotrack/core';
import type {
  E4MachineReadableFacts,
  E5AgentInterfaceFacts,
  MachineReadableCheckOutput,
} from '@geotrack/core/steps/machine-readable-check';
import { createGatedFetch, HostHaltedError } from '../net/host-gate.js';
import type { GatedFetch } from '../net/host-gate.js';

// ── Injectable types ─────────────────────────────────────────────────────────

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export type MachineReadableCheckDeps = {
  fetchFn: FetchFn;
  /** Pause between requests to one host; safe-fetch applies its own on top. Defaults to 0. */
  domainPauseMs?: number;
};

// ── Input ────────────────────────────────────────────────────────────────────

export type MachineReadableCheckInput = {
  origin: string;
  keyPages: string[];
};

// ── helpers ───────────────────────────────────────────────────────────────────

const PRICING_PATTERNS = ['/pricing', '/plans', '/price', '/subscribe'];
const OPENAPI_PATHS = ['/openapi.json', '/openapi.yaml', '/swagger.json', '/.well-known/openapi.json'];
const API_DOCS_PATTERNS = ['/docs', '/api-docs', '/swagger', '/redoc', '/api/docs'];
const CATALOG_PATHS = ['/feed.xml', '/rss.xml', '/atom.xml', '/catalog.json', '/products.json'];

function matchesPathPattern(url: string, patterns: string[]): boolean {
  try {
    const pathname = new URL(url).pathname;
    return patterns.some((p) => pathname.includes(p));
  } catch {
    return false;
  }
}

function hasPricingStructure(html: string): boolean {
  if (/<table[\s>]/i.test(html)) return true;
  if (/itemprop="price"/i.test(html)) return true;
  const ldJsonRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = ldJsonRegex.exec(html)) !== null) {
    if (/"@type"\s*:\s*"(?:Offer|PriceSpecification|Product)"/i.test(match[1])) return true;
  }
  return false;
}

function hasCatalogContent(body: string): boolean {
  if (/<(?:rss|feed|channel)[\s>/]/i.test(body)) return true;
  try {
    const parsed = JSON.parse(body);
    return Array.isArray(parsed);
  } catch {
    return false;
  }
}

type Probe = (url: string) => Promise<{ ok: boolean; body: string }>;

// A 404 is an answer ("not there"); a thrown error, 429 or 5xx means we do not know.
function makeProbe(gate: GatedFetch, degraded: string[]): Probe {
  return async (url) => {
    try {
      const res = await gate.fetch(url);
      if (res.status === 429 || res.status >= 500) degraded.push(`${url}: ${res.status}`);
      if (!res.ok) return { ok: false, body: '' };
      const body = await res.text();
      return { ok: true, body };
    } catch (err) {
      degraded.push(
        err instanceof HostHaltedError ? `${url}: skipped after 429` : `${url}: request failed`,
      );
      return { ok: false, body: '' };
    }
  };
}

// ── E4 — machine-readable data ────────────────────────────────────────────────

async function collectE4(
  origin: string,
  keyPages: string[],
  probe: Probe,
): Promise<E4MachineReadableFacts> {
  const pricingUrl = keyPages.find((u) => matchesPathPattern(u, PRICING_PATTERNS)) ?? null;
  const pricingPageFound = pricingUrl !== null;
  let pricingStructured = false;
  if (pricingUrl) {
    const { ok, body } = await probe(pricingUrl);
    if (ok) pricingStructured = hasPricingStructure(body);
  }

  let openApiSpecFound = false;
  let openApiSpecUrl: string | null = null;
  for (const path of OPENAPI_PATHS) {
    const url = `${origin}${path}`;
    const { ok, body } = await probe(url);
    if (ok && body.length >= 10) {
      openApiSpecFound = true;
      openApiSpecUrl = url;
      break;
    }
  }

  let apiDocsFound = false;
  let apiDocsUrl: string | null = null;
  const apiDocsFromPages = keyPages.find((u) => matchesPathPattern(u, API_DOCS_PATTERNS)) ?? null;
  if (apiDocsFromPages) {
    apiDocsFound = true;
    apiDocsUrl = apiDocsFromPages;
  } else {
    for (const path of ['/docs', '/api-docs', '/swagger', '/redoc']) {
      const url = `${origin}${path}`;
      const { ok } = await probe(url);
      if (ok) {
        apiDocsFound = true;
        apiDocsUrl = url;
        break;
      }
    }
  }

  let productCatalogFound = false;
  let productCatalogUrl: string | null = null;
  for (const path of CATALOG_PATHS) {
    const url = `${origin}${path}`;
    const { ok, body } = await probe(url);
    if (ok && hasCatalogContent(body)) {
      productCatalogFound = true;
      productCatalogUrl = url;
      break;
    }
  }

  return {
    measured: true,
    pricingPageFound,
    pricingStructured,
    openApiSpecFound,
    openApiSpecUrl,
    apiDocsFound,
    apiDocsUrl,
    productCatalogFound,
    productCatalogUrl,
  };
}

// ── E5 — agent interfaces ─────────────────────────────────────────────────────

async function collectE5(origin: string, probe: Probe): Promise<E5AgentInterfaceFacts> {
  const llms = await probe(`${origin}/llms.txt`);
  const llmsTxtFound = llms.ok;
  const llmsTxtValid = llms.ok && llms.body.trim().length > 0;

  let agentsJsonFound = false;
  let agentsJsonUrl: string | null = null;
  for (const path of ['/agents.json', '/.well-known/agents.json']) {
    const url = `${origin}${path}`;
    const { ok } = await probe(url);
    if (ok) {
      agentsJsonFound = true;
      agentsJsonUrl = url;
      break;
    }
  }

  const webMcp = await probe(`${origin}/.well-known/webmcp-manifest.json`);
  const webMcpManifestFound = webMcp.ok;

  const mcp = await probe(`${origin}/.well-known/mcp.json`);
  const mcpServerFound = mcp.ok;

  return {
    measured: true,
    llmsTxtFound,
    llmsTxtValid,
    agentsJsonFound,
    agentsJsonUrl,
    webMcpManifestFound,
    mcpServerFound,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function collectMachineReadableCheck(
  input: MachineReadableCheckInput,
  deps: MachineReadableCheckDeps,
): Promise<StepResult<MachineReadableCheckOutput>> {
  const origin = input.origin.replace(/\/+$/, '');
  const { keyPages } = input;
  // E4 and E5 run in parallel; the gate keeps their requests to one host sequential.
  const gate = createGatedFetch(deps.fetchFn, deps.domainPauseMs ?? 0);
  const degraded: string[] = [];
  const probe = makeProbe(gate, degraded);

  const [e4, e5] = await Promise.all([
    collectE4(origin, keyPages, probe),
    collectE5(origin, probe),
  ]);

  return {
    status: degraded.length > 0 ? 'partial' : 'ok',
    data: { e4, e5 },
    artifacts: [],
    usage: [],
    notes: degraded.map((d) => `degraded: ${d}`),
  };
}
