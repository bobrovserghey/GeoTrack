import { describe, it, expect } from 'vitest';
import { collectMachineReadableCheck } from '../steps/machine-readable-check.js';
import type {
  MachineReadableCheckInput,
  FetchFn,
} from '../steps/machine-readable-check.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<MachineReadableCheckInput> = {}): MachineReadableCheckInput {
  return {
    origin: 'https://example.com',
    keyPages: [],
    ...overrides,
  };
}

type RouteMap = Record<string, { status: number; body: string }>;

function stubFetch(routes: RouteMap): FetchFn {
  return async (url: string) => {
    const entry = routes[url];
    if (!entry) {
      return { ok: false, status: 404, text: async () => '' } as unknown as Response;
    }
    const { status, body } = entry;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
    } as unknown as Response;
  };
}

const JSON_LD_PRICING = `
<html><body>
<script type="application/ld+json">{"@type":"Offer","price":"99"}</script>
</body></html>`;

const PLAIN_PRICING = `<html><body><h1>Pricing</h1><p>$99 per month</p></body></html>`;
const TABLE_PRICING = `<html><body><h1>Plans</h1><table><tr><td>$99</td></tr></table></body></html>`;
const RSS_FEED = `<?xml version="1.0"?><rss version="2.0"><channel><title>Products</title></channel></rss>`;
const ARRAY_CATALOG = JSON.stringify([{ id: 1, name: 'Product A' }]);

// ── E4: machine-readable data ─────────────────────────────────────────────────

describe('E4 — machine-readable data', () => {
  it('pricing URL in keyPages + JSON-LD Offer → pricingStructured: true', async () => {
    const routes: RouteMap = {
      'https://example.com/pricing': { status: 200, body: JSON_LD_PRICING },
    };
    const result = await collectMachineReadableCheck(
      makeInput({ keyPages: ['https://example.com/', 'https://example.com/pricing'] }),
      { fetchFn: stubFetch(routes) },
    );
    expect(result.data!.e4.pricingPageFound).toBe(true);
    expect(result.data!.e4.pricingStructured).toBe(true);
    expect(result.data!.e4.measured).toBe(true);
  });

  it('pricing URL in keyPages + plain HTML → pricingStructured: false', async () => {
    const routes: RouteMap = {
      'https://example.com/pricing': { status: 200, body: PLAIN_PRICING },
    };
    const result = await collectMachineReadableCheck(
      makeInput({ keyPages: ['https://example.com/pricing'] }),
      { fetchFn: stubFetch(routes) },
    );
    expect(result.data!.e4.pricingPageFound).toBe(true);
    expect(result.data!.e4.pricingStructured).toBe(false);
  });

  it('pricing page with <table> → pricingStructured: true', async () => {
    const routes: RouteMap = {
      'https://example.com/plans': { status: 200, body: TABLE_PRICING },
    };
    const result = await collectMachineReadableCheck(
      makeInput({ keyPages: ['https://example.com/plans'] }),
      { fetchFn: stubFetch(routes) },
    );
    expect(result.data!.e4.pricingStructured).toBe(true);
  });

  it('OpenAPI spec found at /openapi.json', async () => {
    const routes: RouteMap = {
      'https://example.com/openapi.json': { status: 200, body: '{"openapi":"3.0.0"}' },
    };
    const result = await collectMachineReadableCheck(makeInput(), { fetchFn: stubFetch(routes) });
    expect(result.data!.e4.openApiSpecFound).toBe(true);
    expect(result.data!.e4.openApiSpecUrl).toBe('https://example.com/openapi.json');
  });

  it('first OpenAPI path 404, second /swagger.json 200 → openApiSpecUrl points to swagger.json', async () => {
    const routes: RouteMap = {
      'https://example.com/swagger.json': { status: 200, body: '{"swagger":"2.0"}' },
    };
    const result = await collectMachineReadableCheck(makeInput(), { fetchFn: stubFetch(routes) });
    expect(result.data!.e4.openApiSpecFound).toBe(true);
    expect(result.data!.e4.openApiSpecUrl).toBe('https://example.com/swagger.json');
  });

  it('API docs URL found in keyPages', async () => {
    const result = await collectMachineReadableCheck(
      makeInput({ keyPages: ['https://example.com/docs', 'https://example.com/about'] }),
      { fetchFn: stubFetch({}) },
    );
    expect(result.data!.e4.apiDocsFound).toBe(true);
    expect(result.data!.e4.apiDocsUrl).toBe('https://example.com/docs');
  });

  it('API docs not in keyPages, /docs returns 200 → found via probe', async () => {
    const routes: RouteMap = {
      'https://example.com/docs': { status: 200, body: '<html>API Reference</html>' },
    };
    const result = await collectMachineReadableCheck(makeInput(), { fetchFn: stubFetch(routes) });
    expect(result.data!.e4.apiDocsFound).toBe(true);
    expect(result.data!.e4.apiDocsUrl).toBe('https://example.com/docs');
  });

  it('product catalog found at /feed.xml with RSS content', async () => {
    const routes: RouteMap = {
      'https://example.com/feed.xml': { status: 200, body: RSS_FEED },
    };
    const result = await collectMachineReadableCheck(makeInput(), { fetchFn: stubFetch(routes) });
    expect(result.data!.e4.productCatalogFound).toBe(true);
    expect(result.data!.e4.productCatalogUrl).toBe('https://example.com/feed.xml');
  });

  it('catalog.json with JSON array → productCatalogFound: true', async () => {
    const routes: RouteMap = {
      'https://example.com/catalog.json': { status: 200, body: ARRAY_CATALOG },
    };
    const result = await collectMachineReadableCheck(makeInput(), { fetchFn: stubFetch(routes) });
    expect(result.data!.e4.productCatalogFound).toBe(true);
  });

  it('nothing found → all false, measured: true', async () => {
    const result = await collectMachineReadableCheck(makeInput(), { fetchFn: stubFetch({}) });
    const e4 = result.data!.e4;
    expect(e4.measured).toBe(true);
    expect(e4.pricingPageFound).toBe(false);
    expect(e4.openApiSpecFound).toBe(false);
    expect(e4.apiDocsFound).toBe(false);
    expect(e4.productCatalogFound).toBe(false);
  });
});

// ── E5: agent interfaces ──────────────────────────────────────────────────────

describe('E5 — agent interfaces', () => {
  it('llms.txt found with content → llmsTxtFound: true, llmsTxtValid: true', async () => {
    const routes: RouteMap = {
      'https://example.com/llms.txt': { status: 200, body: '# LLMs\nThis is Acme Corp.' },
    };
    const result = await collectMachineReadableCheck(makeInput(), { fetchFn: stubFetch(routes) });
    expect(result.data!.e5.llmsTxtFound).toBe(true);
    expect(result.data!.e5.llmsTxtValid).toBe(true);
  });

  it('llms.txt returns 200 with empty body → llmsTxtValid: false', async () => {
    const routes: RouteMap = {
      'https://example.com/llms.txt': { status: 200, body: '   ' },
    };
    const result = await collectMachineReadableCheck(makeInput(), { fetchFn: stubFetch(routes) });
    expect(result.data!.e5.llmsTxtFound).toBe(true);
    expect(result.data!.e5.llmsTxtValid).toBe(false);
  });

  it('agents.json not found at primary path, found at /.well-known/agents.json', async () => {
    const routes: RouteMap = {
      'https://example.com/.well-known/agents.json': { status: 200, body: '{}' },
    };
    const result = await collectMachineReadableCheck(makeInput(), { fetchFn: stubFetch(routes) });
    expect(result.data!.e5.agentsJsonFound).toBe(true);
    expect(result.data!.e5.agentsJsonUrl).toBe('https://example.com/.well-known/agents.json');
  });

  it('webmcp-manifest.json found', async () => {
    const routes: RouteMap = {
      'https://example.com/.well-known/webmcp-manifest.json': { status: 200, body: '{"version":"1"}' },
    };
    const result = await collectMachineReadableCheck(makeInput(), { fetchFn: stubFetch(routes) });
    expect(result.data!.e5.webMcpManifestFound).toBe(true);
  });

  it('mcp.json found → mcpServerFound: true', async () => {
    const routes: RouteMap = {
      'https://example.com/.well-known/mcp.json': { status: 200, body: '{"endpoint":"/mcp"}' },
    };
    const result = await collectMachineReadableCheck(makeInput(), { fetchFn: stubFetch(routes) });
    expect(result.data!.e5.mcpServerFound).toBe(true);
  });

  it('all paths 404 → all false, measured: true', async () => {
    const result = await collectMachineReadableCheck(makeInput(), { fetchFn: stubFetch({}) });
    const e5 = result.data!.e5;
    expect(e5.measured).toBe(true);
    expect(e5.llmsTxtFound).toBe(false);
    expect(e5.agentsJsonFound).toBe(false);
    expect(e5.webMcpManifestFound).toBe(false);
    expect(e5.mcpServerFound).toBe(false);
  });
});

// ── combined ──────────────────────────────────────────────────────────────────

describe('combined', () => {
  it('E4 and E5 both measured → status: ok', async () => {
    const result = await collectMachineReadableCheck(makeInput(), { fetchFn: stubFetch({}) });
    expect(result.status).toBe('ok');
    expect(result.data!.e4.measured).toBe(true);
    expect(result.data!.e5.measured).toBe(true);
  });
});
