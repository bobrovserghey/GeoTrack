import type { StepResult } from '@geotrack/core';
import type {
  AxeViolation,
  E2AccessibilityFacts,
  E3BarrierFacts,
  AccessibilityCheckOutput,
} from '@geotrack/core/steps/accessibility-check';
import { extractText } from './html-text.js';

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
  /**
   * HTML ДО выполнения JS (ответ сервера): из него берётся видимый текст для сравнения
   * с рендером. Сериализация DOM после работы JS здесь непригодна — на таком входе
   * эвристика `jsOnlyContent` сравнивала бы рендер с самим собой. Откуда брать пре-JS
   * HTML — вопрос реализации `checkPage` (T-79).
   */
  rawHtml: string;
  renderedTextLength: number;
  statusCode: number;
};

export type CheckPageFn = (url: string) => Promise<PageCheckResult>;

export type AccessibilityCheckDeps = {
  checkPage: CheckPageFn;
};

// Защитный верхний предел шага: сколько бы страниц ни пришло от краулера, axe-прогон
// идёт не более чем по 10 из них (каждая — отдельный запуск браузера).
const MAX_KEY_PAGES = 10;

// Прежний множитель 3x сохранён, но сравниваем с видимым текстом сырого HTML, а не с
// размером разметки (иначе SPA-оболочка с 3 КБ HTML не детектировалась). Пол по длине
// рендера отсекает пустые/ошибочные страницы, где «втрое больше» — шум.
const JS_ONLY_RATIO = 3;
const JS_ONLY_MIN_RENDERED_CHARS = 500;

// rawHtml приходит от недоверенного сайта и ничем не ограничен по размеру, поэтому у
// разбора нужен верхний предел. extractText линеен (замеры на 2/8/16 МБ: обычная
// разметка 17/92/169 мс, незакрытые script/style 0.5/2/4 мс, вырожденный поток «<>»
// 106/585/1061 мс), так что 8 МБ остаются дешёвыми по CPU даже в худшем случае и с
// запасом покрывают реальные страницы с гидратационным JSON на 2–3 МБ.
const MAX_RAW_HTML_CHARS = 8 * 1024 * 1024;

type JsOnlyVerdict = {
  jsOnlyContent: boolean;
  /** rawHtml превысил лимит — вердикт не выносился. */
  skippedTooLarge: boolean;
};

function checkJsOnlyContent(rawHtml: string, renderedTextLength: number): JsOnlyVerdict {
  // Усекать вход нельзя: отрезанный хвост с настоящим текстом даёт видимый текст 0, и
  // условие вырождается в `renderedTextLength >= 500`, то есть флаг ставился бы почти
  // всегда (SSR-страница на 2.2 МБ с гидратационным JSON в <head> — ровно этот случай).
  // Поэтому на слишком большом входе вердикт не выносится, факт уходит в notes.
  if (rawHtml.length > MAX_RAW_HTML_CHARS) {
    return { jsOnlyContent: false, skippedTooLarge: true };
  }
  if (renderedTextLength < JS_ONLY_MIN_RENDERED_CHARS) {
    return { jsOnlyContent: false, skippedTooLarge: false };
  }
  return {
    jsOnlyContent: renderedTextLength > extractText(rawHtml).length * JS_ONLY_RATIO,
    skippedTooLarge: false,
  };
}

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

type E3Collected = { facts: E3BarrierFacts; notes: string[] };

async function collectE3(origin: string, checkPage: CheckPageFn): Promise<E3Collected> {
  try {
    const result = await checkPage(origin);
    const jsOnly = checkJsOnlyContent(result.rawHtml, result.renderedTextLength);
    return {
      facts: {
        measured: true,
        captchaDetected: result.hasCaptcha,
        captchaType: result.captchaType,
        antibotWallDetected: result.statusCode === 403 || result.statusCode === 429,
        jsOnlyContent: jsOnly.jsOnlyContent,
        blockingPopupDetected: result.hasBlockingPopup,
      },
      notes: jsOnly.skippedTooLarge
        ? [`jsOnlyContentSkipped:rawHtml ${result.rawHtml.length} > ${MAX_RAW_HTML_CHARS}`]
        : [],
    };
  } catch {
    return {
      facts: {
        measured: false,
        captchaDetected: false,
        captchaType: null,
        antibotWallDetected: false,
        jsOnlyContent: false,
        blockingPopupDetected: false,
      },
      notes: [],
    };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function collectAccessibilityCheck(
  input: AccessibilityCheckInput,
  deps: AccessibilityCheckDeps,
): Promise<StepResult<AccessibilityCheckOutput>> {
  const { origin } = input;
  const keyPages = input.keyPages.slice(0, MAX_KEY_PAGES);
  const { checkPage } = deps;

  const [e2Facts, e3] = await Promise.all([
    collectE2(keyPages, checkPage),
    collectE3(origin, checkPage),
  ]);
  const e3Facts = e3.facts;

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

  // Проектные лимиты — не отказ измерения (на статус не влияют), но факт фиксируем.
  const notes: string[] = [];
  if (input.keyPages.length > keyPages.length) {
    notes.push(`keyPagesTruncated:${input.keyPages.length}→${keyPages.length}`);
  }
  notes.push(...e3.notes);

  return { status, data, artifacts: [], usage: [], notes };
}
