import type { ModelAdapter } from '@geotrack/core/contracts/model';
import type { StepResult, UsageRecord, EngineId } from '@geotrack/core';
import type { PassportOutput } from '@geotrack/core';
import type { EnginePollResponse } from '@geotrack/core';
import type { EngineResponseFacts } from '@geotrack/core/steps/extract-mentions';
import type { ToneFact, ToneCheckOutput, Tone } from '@geotrack/core/steps/tone-check';

// ── prompt ────────────────────────────────────────────────────────────────────

export function buildPrompt(passport: PassportOutput, responseText: string): string {
  return [
    'You are a brand tone classifier.',
    '',
    `Product: ${passport.name}`,
    '',
    'AI search engine response to classify:',
    responseText,
    '',
    `Classify how ${passport.name} is mentioned in this response:`,
    '- "positive": the response recommends, praises, or endorses the product',
    '- "neutral": the response mentions the product factually without clear praise or criticism',
    '- "negative": the response warns against, criticises, or discourages the product',
    '',
    'Return JSON only: {"tone":"positive"|"neutral"|"negative"}',
  ].join('\n');
}

// ── output parsing ─────────────────────────────────────────────────────────────

export function parseTone(text: string): Tone | null {
  try {
    const match = text.match(/\{[^}]+\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const tone = parsed['tone'];
    if (tone === 'positive' || tone === 'neutral' || tone === 'negative') return tone;
    return null;
  } catch {
    return null;
  }
}

// ── main step ─────────────────────────────────────────────────────────────────

export async function classifyTone(
  responses: EnginePollResponse[],
  mentionFacts: EngineResponseFacts[],
  passport: PassportOutput,
  model: ModelAdapter,
): Promise<StepResult<ToneCheckOutput>> {
  const brandMentionedKeys = new Set(
    mentionFacts
      .filter((f) => f.brandMentioned)
      .map((f) => `${f.promptId}:${f.engineId}:${f.repeatIndex}`),
  );

  const toneFacts: ToneFact[] = [];
  const usageRecords: UsageRecord[] = [];
  const partialKeys: string[] = [];

  for (const response of responses) {
    const key = `${response.promptId}:${response.engineId}:${response.repeatIndex}`;
    if (!brandMentionedKeys.has(key) || !response.responseText.trim()) continue;

    try {
      const prompt = buildPrompt(passport, response.responseText);
      const answer = await model.generate(prompt, { jsonMode: true, timeoutMs: 15_000 });
      usageRecords.push(answer.usage);

      const tone = parseTone(answer.text);
      if (tone === null) {
        partialKeys.push(key);
      } else {
        toneFacts.push({
          promptId: response.promptId,
          engineId: response.engineId as EngineId,
          repeatIndex: response.repeatIndex,
          tone,
        });
      }
    } catch {
      partialKeys.push(key);
    }
  }

  const positiveCount = toneFacts.filter((f) => f.tone === 'positive').length;
  const positiveRate = toneFacts.length > 0 ? positiveCount / toneFacts.length : 0;

  return {
    status: partialKeys.length > 0 ? 'partial' : 'ok',
    data: { facts: toneFacts, positiveRate },
    artifacts: [],
    usage: usageRecords,
    notes: partialKeys.length > 0 ? [`${partialKeys.length} response(s) could not be classified`] : [],
  };
}
