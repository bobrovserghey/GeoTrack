import { calcCallCost } from '../cost/calculator.js';
import type { EngineAdapter, EngineId, AskOptions, EngineAnswer } from '../contracts/engine.js';

const PERPLEXITY_MODEL = 'sonar';
const PERPLEXITY_URL = 'https://api.perplexity.ai/chat/completions';

type PerplexityOptions = {
  apiKey: string;
  model?: string;
  fetch?: typeof globalThis.fetch;
};

export class PerplexityAdapter implements EngineAdapter {
  readonly id: EngineId = 'perplexity';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetch: typeof globalThis.fetch;

  constructor(opts: PerplexityOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? PERPLEXITY_MODEL;
    this.fetch = opts.fetch ?? globalThis.fetch;
  }

  async ask(prompt: string, opts: AskOptions): Promise<EngineAnswer> {
    const res = await this.fetch(PERPLEXITY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      signal: opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined,
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`Perplexity API error: ${res.status}`);

    const raw = await res.json() as PerplexityRawResponse;
    const text = raw.choices?.[0]?.message?.content ?? '';
    const sources = (raw.citations ?? []).map((url) => ({ url }));

    const tokensIn = raw.usage?.prompt_tokens ?? 0;
    const tokensOut = raw.usage?.completion_tokens ?? 0;
    const costUsd = calcCallCost('perplexity', this.model, tokensIn, tokensOut, { requestCount: 1 });

    return {
      text,
      sources,
      raw,
      usage: { provider: 'perplexity', model: this.model, tokensIn, tokensOut, costUsd },
    };
  }
}

type PerplexityRawResponse = {
  choices?: { message?: { content?: string } }[];
  citations?: string[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};
