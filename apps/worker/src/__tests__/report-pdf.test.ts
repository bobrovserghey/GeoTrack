import { describe, it, expect, vi } from 'vitest';
import type { BrowserContext } from '../browser/internal-render-factory.js';
import { generateReportPdf, BROWSER_CLOSE_TIMEOUT_MS } from '../steps/report-pdf.js';
import type { ReportPdfDeps, ReportPdfInput, RenderContextFactory } from '../steps/report-pdf.js';
import type { StorageClient } from '../storage/types.js';
import type { ArtifactRef } from '@geotrack/core';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<ReportPdfInput> = {}): ReportPdfInput {
  return { auditId: 'audit-123', domain: 'acme.com', ...overrides };
}

type FakePageOptions = {
  gotoResponse?: { ok: () => boolean; status: () => number } | null;
  gotoError?: Error;
  pdfResult?: Buffer;
  pdfError?: Error;
  goto?: ReturnType<typeof vi.fn>;
  pdf?: ReturnType<typeof vi.fn>;
  newPageError?: unknown;
  closeError?: unknown;
  nullBrowser?: boolean;
};

function makeFakeContext(options: FakePageOptions = {}, closeSpy?: () => void): BrowserContext {
  const goto =
    options.goto ??
    vi.fn(async () => {
      if (options.gotoError) throw options.gotoError;
      return options.gotoResponse ?? { ok: () => true, status: () => 200 };
    });

  const pdf =
    options.pdf ??
    vi.fn(async () => {
      if (options.pdfError) throw options.pdfError;
      return options.pdfResult ?? Buffer.from('%PDF-fake');
    });

  const page = { goto, pdf };
  const browser = {
    close: async () => {
      closeSpy?.();
      if (options.closeError !== undefined) throw options.closeError;
    },
  };

  return {
    newPage: async () => {
      if (options.newPageError !== undefined) throw options.newPageError;
      return page;
    },
    browser: () => (options.nullBrowser ? null : browser),
  } as unknown as BrowserContext;
}

function makeStubStorage(overrides: Partial<StorageClient> = {}): StorageClient {
  return {
    upload: async (input): Promise<ArtifactRef> => ({
      bucket: input.bucket,
      key: input.key,
      sizeBytes: input.data.length,
      hash: 'fake-hash',
      mimeType: input.mimeType,
    }),
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ReportPdfDeps> = {}): ReportPdfDeps {
  return {
    baseUrl: 'https://geotrack.example',
    serviceKey: 'test-service-key',
    storage: makeStubStorage(),
    createRenderContext: (async () => makeFakeContext()) as RenderContextFactory,
    ...overrides,
  };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('generateReportPdf', () => {
  it('renders the internal route, uploads the PDF, and returns the artifact', async () => {
    const closeSpy = vi.fn();
    const context = makeFakeContext({}, closeSpy);
    const deps = makeDeps({ createRenderContext: async () => context });

    const result = await generateReportPdf(makeInput(), deps);

    expect(result.status).toBe('ok');
    expect(result.data?.pdfArtifact).toMatchObject({
      bucket: 'reports',
      key: 'audit-123/report.pdf',
      mimeType: 'application/pdf',
    });
    expect(result.artifacts).toEqual(result.data?.pdfArtifact ? [result.data.pdfArtifact] : []);
    expect(result.notes).toEqual([]);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('navigates to the internal render route for the given auditId with a trailing slash trimmed', async () => {
    const goto = vi.fn(async () => ({ ok: () => true, status: () => 200 }));
    const context = makeFakeContext({ goto });
    const deps = makeDeps({ baseUrl: 'https://geotrack.example/', createRenderContext: async () => context });

    await generateReportPdf(makeInput({ auditId: 'audit-xyz' }), deps);

    expect(goto).toHaveBeenCalledWith(
      'https://geotrack.example/internal/report-render/audit-xyz',
      expect.objectContaining({ waitUntil: 'networkidle' }),
    );
  });

  it('bakes the domain into the footer template', async () => {
    const pdf = vi.fn(async (_opts: { footerTemplate: string }) => Buffer.from('%PDF-fake'));
    const context = makeFakeContext({ pdf });
    const deps = makeDeps({ createRenderContext: async () => context });

    await generateReportPdf(makeInput({ domain: 'example.org' }), deps);

    const pdfOptions = pdf.mock.calls[0]?.[0];
    expect(pdfOptions?.footerTemplate).toContain('example.org');
    expect(pdfOptions?.footerTemplate).toContain('Confidential');
  });

  it('passes the service key and base URL through to the render context factory', async () => {
    const createRenderContext = vi.fn(async () => makeFakeContext());
    const deps = makeDeps({ serviceKey: 'super-secret', baseUrl: 'https://geotrack.example', createRenderContext });

    await generateReportPdf(makeInput(), deps);

    expect(createRenderContext).toHaveBeenCalledWith({ serviceKey: 'super-secret', baseUrl: 'https://geotrack.example' });
  });

  it('fails without throwing when the render route responds with a non-ok status', async () => {
    const closeSpy = vi.fn();
    const context = makeFakeContext({ gotoResponse: { ok: () => false, status: () => 404 } }, closeSpy);
    const deps = makeDeps({ createRenderContext: async () => context });

    const result = await generateReportPdf(makeInput(), deps);

    expect(result.status).toBe('failed');
    expect(result.data?.pdfArtifact).toBeNull();
    expect(result.artifacts).toEqual([]);
    expect(result.notes[0]).toMatch(/404/);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('fails without throwing when navigation rejects', async () => {
    const closeSpy = vi.fn();
    const context = makeFakeContext({ gotoError: new Error('ECONNREFUSED') }, closeSpy);
    const deps = makeDeps({ createRenderContext: async () => context });

    const result = await generateReportPdf(makeInput(), deps);

    expect(result.status).toBe('failed');
    expect(result.data?.pdfArtifact).toBeNull();
    expect(result.notes[0]).toMatch(/ECONNREFUSED/);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('fails without throwing when page.pdf() rejects', async () => {
    const closeSpy = vi.fn();
    const context = makeFakeContext({ pdfError: new Error('render timeout') }, closeSpy);
    const deps = makeDeps({ createRenderContext: async () => context });

    const result = await generateReportPdf(makeInput(), deps);

    expect(result.status).toBe('failed');
    expect(result.data?.pdfArtifact).toBeNull();
    expect(result.notes[0]).toMatch(/render timeout/);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('fails without throwing when storage upload rejects', async () => {
    const closeSpy = vi.fn();
    const context = makeFakeContext({}, closeSpy);
    const storage: StorageClient = {
      upload: async () => {
        throw new Error('bucket unreachable');
      },
    };
    const deps = makeDeps({ storage, createRenderContext: async () => context });

    const result = await generateReportPdf(makeInput(), deps);

    expect(result.status).toBe('failed');
    expect(result.data?.pdfArtifact).toBeNull();
    expect(result.notes[0]).toMatch(/bucket unreachable/);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('fails without throwing when the render context factory itself rejects', async () => {
    const deps = makeDeps({
      createRenderContext: async () => {
        throw new Error('chromium launch failed');
      },
    });

    const result = await generateReportPdf(makeInput(), deps);

    expect(result.status).toBe('failed');
    expect(result.data?.pdfArtifact).toBeNull();
    expect(result.notes[0]).toMatch(/chromium launch failed/);
  });

  it('fails without throwing when newPage() rejects', async () => {
    const closeSpy = vi.fn();
    const context = makeFakeContext({ newPageError: new Error('target closed') }, closeSpy);
    const deps = makeDeps({ createRenderContext: async () => context });

    const result = await generateReportPdf(makeInput(), deps);

    expect(result.status).toBe('failed');
    expect(result.data?.pdfArtifact).toBeNull();
    expect(result.artifacts).toEqual([]);
    expect(result.notes[0]).toMatch(/target closed/);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('reports a non-Error thrown value without throwing', async () => {
    const context = makeFakeContext({ pdf: vi.fn(async () => { throw 'string failure'; }) });
    const deps = makeDeps({ createRenderContext: async () => context });

    const result = await generateReportPdf(makeInput(), deps);

    expect(result.status).toBe('failed');
    expect(result.data?.pdfArtifact).toBeNull();
    expect(result.notes[0]).toMatch(/string failure/);
  });

  // A crashed browser makes close() reject — exactly the state left behind by a
  // goto/pdf failure. Throwing from the `finally` block would replace the
  // already-computed StepResult and break "a PDF failure never blocks the web
  // report" (and lose the diagnostic note with it).
  it('still resolves ok when browser.close() rejects after a successful render', async () => {
    const context = makeFakeContext({ closeError: new Error('browser already closed') });
    const deps = makeDeps({ createRenderContext: async () => context });

    const result = await generateReportPdf(makeInput(), deps);

    expect(result.status).toBe('ok');
    expect(result.data?.pdfArtifact).toMatchObject({ key: 'audit-123/report.pdf' });
    expect(result.notes).toEqual([]);
  });

  it('preserves the original failure note when browser.close() also rejects', async () => {
    const context = makeFakeContext({
      pdfError: new Error('render timeout'),
      closeError: new Error('browser already closed'),
    });
    const deps = makeDeps({ createRenderContext: async () => context });

    const result = await generateReportPdf(makeInput(), deps);

    expect(result.status).toBe('failed');
    expect(result.data?.pdfArtifact).toBeNull();
    expect(result.notes[0]).toMatch(/render timeout/);
    expect(result.notes[0]).not.toMatch(/browser already closed/);
  });

  // A hung (not crashed) browser makes close() never settle. Without a bound on
  // it the step itself would never settle either, so the caller would be blocked
  // by a pending promise instead of receiving a StepResult.
  it('still settles when browser.close() never settles', async () => {
    vi.useFakeTimers();
    try {
      let closeCalled = false;
      const context = {
        newPage: async () => ({
          goto: async () => ({ ok: () => true, status: () => 200 }),
          pdf: async () => Buffer.from('%PDF-fake'),
        }),
        browser: () => ({
          close: () => {
            closeCalled = true;
            return new Promise<void>(() => {
              /* never settles */
            });
          },
        }),
      } as unknown as BrowserContext;
      const deps = makeDeps({ createRenderContext: async () => context });

      const resultPromise = generateReportPdf(makeInput(), deps);
      for (let i = 0; i < 100 && !closeCalled; i += 1) await Promise.resolve();
      expect(closeCalled).toBe(true);

      await vi.advanceTimersByTimeAsync(BROWSER_CLOSE_TIMEOUT_MS);

      const result = await resultPromise;
      expect(result.status).toBe('ok');
      expect(result.data?.pdfArtifact).toMatchObject({ key: 'audit-123/report.pdf' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not crash when context.browser() returns null', async () => {
    const context = makeFakeContext({ nullBrowser: true });
    const deps = makeDeps({ createRenderContext: async () => context });

    const result = await generateReportPdf(makeInput(), deps);

    expect(result.status).toBe('ok');
    expect(result.data?.pdfArtifact).toMatchObject({ key: 'audit-123/report.pdf' });
  });

  it('html-escapes the domain in the footer template', async () => {
    const pdf = vi.fn(async (_opts: { footerTemplate: string }) => Buffer.from('%PDF-fake'));
    const context = makeFakeContext({ pdf });
    const deps = makeDeps({ createRenderContext: async () => context });

    await generateReportPdf(makeInput({ domain: 'a"<b>&\'c' }), deps);

    const footer = pdf.mock.calls[0]?.[0]?.footerTemplate ?? '';
    expect(footer).toContain('a&quot;&lt;b&gt;&amp;&#39;c');
    expect(footer).not.toContain('<b>');
    // the surrounding markup must stay intact
    expect(footer).toContain('<span>Confidential</span>');
  });
});
