import { describe, it, expect } from 'vitest';
import { collectAccessibilityCheck } from '../steps/accessibility-check.js';
import type {
  AccessibilityCheckDeps,
  AccessibilityCheckInput,
  PageCheckResult,
  RawAxeViolation,
} from '../steps/accessibility-check.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeViolation(
  id: string,
  impact: RawAxeViolation['impact'],
  nodeCount = 1,
): RawAxeViolation {
  return { id, impact, description: `${id} violation`, nodeCount };
}

function makePageResult(overrides: Partial<PageCheckResult> = {}): PageCheckResult {
  return {
    url: 'https://example.com',
    axeViolations: [],
    hasCaptcha: false,
    captchaType: null,
    hasBlockingPopup: false,
    rawHtmlLength: 5000,
    renderedTextLength: 5500,
    statusCode: 200,
    ...overrides,
  };
}

function makeInput(overrides: Partial<AccessibilityCheckInput> = {}): AccessibilityCheckInput {
  return {
    keyPages: ['https://example.com', 'https://example.com/about'],
    origin: 'https://example.com',
    ...overrides,
  };
}

function stubDeps(pages: Map<string, PageCheckResult | Error>): AccessibilityCheckDeps {
  return {
    checkPage: async (url: string) => {
      const val = pages.get(url) ?? makePageResult({ url });
      if (val instanceof Error) throw val;
      return val;
    },
  };
}

// ── E2: accessibility ─────────────────────────────────────────────────────────

describe('E2 — accessibility', () => {
  it('violations aggregated across pages', async () => {
    const pages = new Map([
      [
        'https://example.com',
        makePageResult({
          url: 'https://example.com',
          axeViolations: [makeViolation('color-contrast', 'serious', 3)],
        }),
      ],
      [
        'https://example.com/about',
        makePageResult({
          url: 'https://example.com/about',
          axeViolations: [makeViolation('color-contrast', 'serious', 3)],
        }),
      ],
    ]);
    const result = await collectAccessibilityCheck(makeInput(), stubDeps(pages));
    expect(result.data!.e2.measured).toBe(true);
    expect(result.data!.e2.pagesAudited).toBe(2);
    const cc = result.data!.e2.violations.find((v) => v.id === 'color-contrast');
    expect(cc?.nodeCount).toBe(6);
  });

  it('violations deduplicated by id, nodeCount summed', async () => {
    const pages = new Map([
      [
        'https://example.com',
        makePageResult({
          url: 'https://example.com',
          axeViolations: [
            makeViolation('color-contrast', 'serious', 2),
            makeViolation('aria-label', 'critical', 1),
          ],
        }),
      ],
      [
        'https://example.com/about',
        makePageResult({
          url: 'https://example.com/about',
          axeViolations: [
            makeViolation('color-contrast', 'serious', 4),
            makeViolation('missing-lang', 'moderate', 1),
          ],
        }),
      ],
    ]);
    const result = await collectAccessibilityCheck(makeInput(), stubDeps(pages));
    const violations = result.data!.e2.violations;
    expect(violations).toHaveLength(3);
    expect(violations.find((v) => v.id === 'color-contrast')?.nodeCount).toBe(6);
    expect(violations.find((v) => v.id === 'aria-label')?.nodeCount).toBe(1);
    expect(violations.find((v) => v.id === 'missing-lang')?.nodeCount).toBe(1);
  });

  it('criticalCount, seriousCount, moderateCount, minorCount correct', async () => {
    const pages = new Map([
      [
        'https://example.com',
        makePageResult({
          url: 'https://example.com',
          axeViolations: [
            makeViolation('v1', 'critical', 2),
            makeViolation('v2', 'serious', 3),
            makeViolation('v3', 'moderate', 1),
            makeViolation('v4', 'minor', 5),
          ],
        }),
      ],
    ]);
    const result = await collectAccessibilityCheck(makeInput({ keyPages: ['https://example.com'] }), stubDeps(pages));
    expect(result.data!.e2.criticalCount).toBe(2);
    expect(result.data!.e2.seriousCount).toBe(3);
    expect(result.data!.e2.moderateCount).toBe(1);
    expect(result.data!.e2.minorCount).toBe(5);
  });

  it('empty keyPages → e2.measured = false', async () => {
    const result = await collectAccessibilityCheck(
      makeInput({ keyPages: [] }),
      stubDeps(new Map()),
    );
    expect(result.data!.e2.measured).toBe(false);
    expect(result.data!.e2.pagesAudited).toBe(0);
  });

  it('all checkPage calls throw → e2.measured = false', async () => {
    const pages = new Map<string, PageCheckResult | Error>([
      ['https://example.com', new Error('network error')],
      ['https://example.com/about', new Error('timeout')],
    ]);
    const result = await collectAccessibilityCheck(makeInput(), stubDeps(pages));
    expect(result.data!.e2.measured).toBe(false);
  });

  it('partial failure — succeeding pages are counted', async () => {
    const pages = new Map<string, PageCheckResult | Error>([
      ['https://example.com', new Error('timeout')],
      [
        'https://example.com/about',
        makePageResult({
          url: 'https://example.com/about',
          axeViolations: [makeViolation('color-contrast', 'serious', 1)],
        }),
      ],
    ]);
    // origin is different from any failing key page so E3 is measured
    const result = await collectAccessibilityCheck(
      makeInput({ origin: 'https://example.com/origin-check' }),
      stubDeps(pages),
    );
    expect(result.data!.e2.measured).toBe(true);
    expect(result.data!.e2.pagesAudited).toBe(1);
    expect(result.data!.e3.measured).toBe(true);
    expect(result.status).toBe('partial');
  });

  it('no violations → all counts 0, measured: true', async () => {
    const pages = new Map([
      ['https://example.com', makePageResult({ url: 'https://example.com' })],
    ]);
    const result = await collectAccessibilityCheck(
      makeInput({ keyPages: ['https://example.com'] }),
      stubDeps(pages),
    );
    expect(result.data!.e2.measured).toBe(true);
    expect(result.data!.e2.criticalCount).toBe(0);
    expect(result.data!.e2.violations).toHaveLength(0);
  });
});

// ── E3: barriers ──────────────────────────────────────────────────────────────

describe('E3 — barriers', () => {
  it('no barriers → all flags false, measured: true', async () => {
    const pages = new Map([
      ['https://example.com', makePageResult({ url: 'https://example.com' })],
    ]);
    const result = await collectAccessibilityCheck(makeInput(), stubDeps(pages));
    expect(result.data!.e3.measured).toBe(true);
    expect(result.data!.e3.captchaDetected).toBe(false);
    expect(result.data!.e3.antibotWallDetected).toBe(false);
    expect(result.data!.e3.jsOnlyContent).toBe(false);
    expect(result.data!.e3.blockingPopupDetected).toBe(false);
  });

  it('captcha detected', async () => {
    const pages = new Map([
      [
        'https://example.com',
        makePageResult({ url: 'https://example.com', hasCaptcha: true, captchaType: 'recaptcha' }),
      ],
    ]);
    const result = await collectAccessibilityCheck(makeInput(), stubDeps(pages));
    expect(result.data!.e3.captchaDetected).toBe(true);
    expect(result.data!.e3.captchaType).toBe('recaptcha');
  });

  it('antibot wall — statusCode 403', async () => {
    const pages = new Map([
      ['https://example.com', makePageResult({ url: 'https://example.com', statusCode: 403 })],
    ]);
    const result = await collectAccessibilityCheck(makeInput(), stubDeps(pages));
    expect(result.data!.e3.antibotWallDetected).toBe(true);
  });

  it('JS-only content — renderedTextLength > rawHtmlLength * 3', async () => {
    const pages = new Map([
      [
        'https://example.com',
        makePageResult({
          url: 'https://example.com',
          rawHtmlLength: 2000,
          renderedTextLength: 9001,
        }),
      ],
    ]);
    const result = await collectAccessibilityCheck(makeInput(), stubDeps(pages));
    expect(result.data!.e3.jsOnlyContent).toBe(true);
  });

  it('boundary: renderedTextLength == rawHtmlLength * 3 → jsOnlyContent false', async () => {
    const pages = new Map([
      [
        'https://example.com',
        makePageResult({
          url: 'https://example.com',
          rawHtmlLength: 2000,
          renderedTextLength: 6000,
        }),
      ],
    ]);
    const result = await collectAccessibilityCheck(makeInput(), stubDeps(pages));
    expect(result.data!.e3.jsOnlyContent).toBe(false);
  });

  it('checkPage throws → e3.measured = false', async () => {
    const deps: AccessibilityCheckDeps = {
      checkPage: async (_url: string) => { throw new Error('connection refused'); },
    };
    const result = await collectAccessibilityCheck(makeInput(), deps);
    expect(result.data!.e3.measured).toBe(false);
  });
});

// ── combined ──────────────────────────────────────────────────────────────────

describe('combined', () => {
  it('E2 not measured (empty pages), E3 measured — status partial', async () => {
    const pages = new Map([
      ['https://example.com', makePageResult({ url: 'https://example.com' })],
    ]);
    const result = await collectAccessibilityCheck(
      makeInput({ keyPages: [] }),
      stubDeps(pages),
    );
    expect(result.data!.e2.measured).toBe(false);
    expect(result.data!.e3.measured).toBe(true);
    expect(result.status).toBe('partial');
  });
});
