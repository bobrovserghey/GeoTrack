import type { ArtifactRef, StepResult } from '@geotrack/core';
import type { StorageClient } from '../storage/types.js';
import { createInternalRenderContext } from '../browser/internal-render-factory.js';
import type { BrowserContext } from '../browser/internal-render-factory.js';

// Footer text ported 1:1 from Geotrack_UI.zip / Report_Print.html's doc-page
// footer slot ("Geotrack · AI Visibility Audit · {domain}" / "Confidential").
// Playwright's footerTemplate renders in an isolated document with no access
// to the app's stylesheet, so the --text-tertiary / --font-mono values from
// globals.css are inlined literally here rather than referenced.
const FOOTER_TEXT_COLOR = '#64748B';
const FOOTER_FONT_FAMILY = "'JetBrains Mono', 'SF Mono', Consolas, monospace";

// The domain is interpolated into footer markup, so a quote or angle bracket in
// it would break the footer on every page (Chromium renders footerTemplate in an
// isolated document, so this is a correctness, not an XSS, concern).
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function footerTemplate(domain: string): string {
  return `<div style="width:100%; display:flex; justify-content:space-between; align-items:center; font-size:9px; font-family:${FOOTER_FONT_FAMILY}; color:${FOOTER_TEXT_COLOR}; padding:0 18mm;"><span>Geotrack · AI Visibility Audit · ${escapeHtml(domain)}</span><span>Confidential</span></div>`;
}

// A browser that hung (as opposed to crashed) makes close() never settle, not
// reject — awaiting it unbounded would leave generateReportPdf pending forever,
// which breaks "a PDF failure never blocks the web report" from the other side:
// the caller is stuck on a promise instead of getting a failed StepResult.
export const BROWSER_CLOSE_TIMEOUT_MS = 10_000;

// Bounds close() in time without pulling in a dependency: the close promise is
// raced against a timer, and the timer is always cleared once the race settles
// (plus unref'd, so it can never hold the Node process open on its own).
// Note this helper can still reject on the two paths that happen before the
// race is even armed — a synchronous throw from close(), or close() returning
// a non-thenable — so the caller must keep its own try/catch around it; the
// "never throws" guarantee of generateReportPdf lives there, not here.
async function closeBrowserWithTimeout(browser: { close: () => Promise<void> }): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      // Swallowed here rather than at the Promise.race: once the timeout wins,
      // a later rejection of the abandoned close promise would surface as an
      // unhandled rejection in the worker process.
      browser.close().catch(() => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, BROWSER_CLOSE_TIMEOUT_MS);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export type ReportPdfInput = {
  auditId: string;
  domain: string;
};

export type RenderContextFactory = (options: { serviceKey: string; baseUrl: string }) => Promise<BrowserContext>;

export type ReportPdfDeps = {
  baseUrl: string;
  serviceKey: string;
  storage: StorageClient;
  createRenderContext?: RenderContextFactory;
};

export type ReportPdfOutput = {
  pdfArtifact: ArtifactRef | null;
};

export async function generateReportPdf(
  input: ReportPdfInput,
  deps: ReportPdfDeps,
): Promise<StepResult<ReportPdfOutput>> {
  const { auditId, domain } = input;
  const { baseUrl, serviceKey, storage } = deps;
  const createRenderContext = deps.createRenderContext ?? createInternalRenderContext;

  let context: BrowserContext | null = null;
  try {
    context = await createRenderContext({ serviceKey, baseUrl });
    const page = await context.newPage();
    const url = `${baseUrl.replace(/\/+$/, '')}/internal/report-render/${auditId}`;
    const response = await page.goto(url, { waitUntil: 'networkidle' });

    if (!response || !response.ok()) {
      return {
        status: 'failed',
        data: { pdfArtifact: null },
        artifacts: [],
        usage: [],
        notes: [`internal render route returned ${response ? response.status() : 'no response'}`],
      };
    }

    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '18mm', bottom: '18mm', left: '18mm', right: '18mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: footerTemplate(domain),
      printBackground: true,
    });

    const pdfArtifact = await storage.upload({
      bucket: 'reports',
      key: `${auditId}/report.pdf`,
      data: pdfBuffer,
      mimeType: 'application/pdf',
    });

    return { status: 'ok', data: { pdfArtifact }, artifacts: [pdfArtifact], usage: [], notes: [] };
  } catch (err) {
    // T-44 acceptance criterion: a PDF failure must never block web-report
    // delivery — every failure path degrades to a failed StepResult instead
    // of throwing, so the caller can carry on without the PDF artifact.
    return {
      status: 'failed',
      data: { pdfArtifact: null },
      artifacts: [],
      usage: [],
      notes: [`pdf generation failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  } finally {
    // The factory hands back only a BrowserContext; closing through its
    // browser() accessor tears down both the context and the Chromium process.
    // close() itself can reject (typically when the browser already crashed —
    // i.e. right after the goto/pdf failure handled above), and an exception
    // thrown from `finally` would replace the StepResult already computed above
    // and propagate out of the step, breaking the acceptance criterion. So it is
    // swallowed deliberately: there is nothing left to clean up either way.
    // A hung browser is the mirror image of that: close() then never settles at
    // all, so it is bounded by BROWSER_CLOSE_TIMEOUT_MS — the step must always
    // settle, even at the cost of leaking a Chromium process that is already
    // unresponsive.
    try {
      const browser = context?.browser();
      if (browser) await closeBrowserWithTimeout(browser);
    } catch {
      // intentionally ignored — see comment above
    }
  }
}
