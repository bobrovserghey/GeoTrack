import type { ModelAdapter } from '@geotrack/core/contracts/model';
import type { StepResult, UsageRecord, EngineId } from '@geotrack/core';
import type { PassportOutput } from '@geotrack/core';
import type { EnginePollResponse } from '@geotrack/core';
import type { EngineResponseFacts } from '@geotrack/core/steps/extract-mentions';
import type { AccuracyFact, AccuracyCheckOutput } from '@geotrack/core/steps/accuracy-check';

// ── prompt ────────────────────────────────────────────────────────────────────

export function buildPrompt(passport: PassportOutput, responseText: string): string {
  const features = passport.valueProps.slice(0, 6).join(', ');
  return [
    'You are a product accuracy checker.',
    '',
    'Product facts (source of truth):',
    `Name: ${passport.name}`,
    `Description: ${passport.description}`,
    `Key features: ${features}`,
    `Target audience: ${passport.targetAudience.summary}`,
    '',
    `AI search engine response to check:`,
    responseText,
    '',
    `Count factual claims made about ${passport.name} and classify each as accurate, inaccurate, or unverifiable based on the product facts above.`,
    '',
    'Return JSON only: {"accurate":N,"inaccurate":N,"unverifiable":N}',
  ].join('\n');
}

// ── output parsing ─────────────────────────────────────────────────────────────

type ClaimCounts = { accurate: number; inaccurate: number; unverifiable: number };

export function parseClaimCounts(text: string): ClaimCounts | null {
  try {
    const match = text.match(/\{[^}]+\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const n = (key: string) => (typeof parsed[key] === 'number' ? (parsed[key] as number) : 0);
    return { accurate: n('accurate'), inaccurate: n('inaccurate'), unverifiable: n('unverifiable') };
  } catch {
    return null;
  }
}

// ── main step ─────────────────────────────────────────────────────────────────

export async function checkAccuracy(
  responses: EnginePollResponse[],
  mentionFacts: EngineResponseFacts[],
  passport: PassportOutput,
  model: ModelAdapter,
): Promise<StepResult<AccuracyCheckOutput>> {
  const brandMentionedKeys = new Set(
    mentionFacts
      .filter((f) => f.brandMentioned)
      .map((f) => `${f.promptId}:${f.engineId}:${f.repeatIndex}`),
  );

  const accuracyFacts: AccuracyFact[] = [];
  const usageRecords: UsageRecord[] = [];
  const partialKeys: string[] = [];

  for (const response of responses) {
    const key = `${response.promptId}:${response.engineId}:${response.repeatIndex}`;
    if (!brandMentionedKeys.has(key) || !response.responseText.trim()) continue;

    try {
      const prompt = buildPrompt(passport, response.responseText);
      const answer = await model.generate(prompt, { jsonMode: true, timeoutMs: 15_000 });
      usageRecords.push(answer.usage);

      const counts = parseClaimCounts(answer.text);
      if (counts === null) {
        partialKeys.push(key);
      } else {
        accuracyFacts.push({
          promptId: response.promptId,
          engineId: response.engineId as EngineId,
          repeatIndex: response.repeatIndex,
          accurateClaims: counts.accurate,
          inaccurateClaims: counts.inaccurate,
          unverifiableClaims: counts.unverifiable,
        });
      }
    } catch {
      partialKeys.push(key);
    }
  }

  const accurateCount = accuracyFacts.filter((f) => f.inaccurateClaims === 0).length;
  const accuracyRate = accuracyFacts.length > 0 ? accurateCount / accuracyFacts.length : 0;

  return {
    status: partialKeys.length > 0 ? 'partial' : 'ok',
    data: { facts: accuracyFacts, accuracyRate },
    artifacts: [],
    usage: usageRecords,
    notes: partialKeys.length > 0 ? [`${partialKeys.length} response(s) could not be parsed`] : [],
  };
}
