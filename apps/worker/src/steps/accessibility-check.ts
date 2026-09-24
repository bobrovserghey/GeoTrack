import type { StepResult } from '@geotrack/core';
import type {
  AxeViolation,
  E2AccessibilityFacts,
  E3BarrierFacts,
  AccessibilityCheckOutput,
} from '@geotrack/core/steps/accessibility-check';

// ── Injectable types ─────────────────────────────────────────────────────────

export type RawAxeViolation = {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  nodeCount: number;
};

export type PageCheckResult = {
  url: string;
  axeViolations: RawAxeViolation[];
  hasCaptcha: boolean;
  captchaType: string | null;
  hasBlockingPopup: boolean;
  rawHtmlLength: number;
  renderedTextLength: number;
  statusCode: number;
};

export type CheckPageFn = (url: string) => Promise<PageCheckResult>;

export type AccessibilityCheckDeps = {
  checkPage: CheckPageFn;
};

// ── Input ────────────────────────────────────────────────────────────────────

export type AccessibilityCheckInput = {
  keyPages: string[];
  origin: string;
};

// ── E2 — accessibility ───────────────────────────────────────────────────────

async function collectE2(
  keyPages: string[],
  checkPage: CheckPageFn,
): Promise<E2AccessibilityFacts> {
  if (keyPages.length === 0) {
    return { measured: false, pagesAudited: 0, criticalCount: 0, seriousCount: 0, moderateCount: 0, minorCount: 0, violations: [] };
  }

  const violationMap = new Map<string, AxeViolation>();
  let pagesAudited = 0;

  for (const url of keyPages) {
    try {
      const result = await checkPage(url);
      pagesAudited++;
      for (const v of result.axeViolations) {
        const existing = violationMap.get(v.id);
        if (existing) {
          existing.nodeCount += v.nodeCount;
        } else {
          violationMap.set(v.id, { ...v });
        }
      }
    } catch {
      // page failed — continue with remaining pages
    }
  }

  if (pagesAudited === 0) {
    return { measured: false, pagesAudited: 0, criticalCount: 0, seriousCount: 0, moderateCount: 0, minorCount: 0, violations: [] };
  }

  const violations = Array.from(violationMap.values());
  const countByImpact = (impact: AxeViolation['impact']) =>
    violations.filter((v) => v.impact === impact).reduce((sum, v) => sum + v.nodeCount, 0);

  return {
    measured: true,
    pagesAudited,
    criticalCount: countByImpact('critical'),
    seriousCount: countByImpact('serious'),
    moderateCount: countByImpact('moderate'),
    minorCount: countByImpact('minor'),
    violations,
  };
}

// ── E3 — barriers ────────────────────────────────────────────────────────────

async function collectE3(origin: string, checkPage: CheckPageFn): Promise<E3BarrierFacts> {
  try {
    const result = await checkPage(origin);
    return {
      measured: true,
      captchaDetected: result.hasCaptcha,
      captchaType: result.captchaType,
      antibotWallDetected: result.statusCode === 403 || result.statusCode === 429,
      jsOnlyContent: result.renderedTextLength > result.rawHtmlLength * 3,
      blockingPopupDetected: result.hasBlockingPopup,
    };
  } catch {
    return {
      measured: false,
      captchaDetected: false,
      captchaType: null,
      antibotWallDetected: false,
      jsOnlyContent: false,
      blockingPopupDetected: false,
    };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function collectAccessibilityCheck(
  input: AccessibilityCheckInput,
  deps: AccessibilityCheckDeps,
): Promise<StepResult<AccessibilityCheckOutput>> {
  const { keyPages, origin } = input;
  const { checkPage } = deps;

  const [e2Facts, e3Facts] = await Promise.all([
    collectE2(keyPages, checkPage),
    collectE3(origin, checkPage),
  ]);

  const data: AccessibilityCheckOutput = { e2: e2Facts, e3: e3Facts };

  const e2PartialPages =
    keyPages.length > 0 &&
    e2Facts.pagesAudited > 0 &&
    e2Facts.pagesAudited < keyPages.length;

  let status: StepResult<AccessibilityCheckOutput>['status'];
  if (!e2Facts.measured && !e3Facts.measured) {
    status = 'failed';
  } else if (!e2Facts.measured || !e3Facts.measured || e2PartialPages) {
    status = 'partial';
  } else {
    status = 'ok';
  }

  return { status, data, artifacts: [], usage: [], notes: [] };
}
