import { calcCallCost } from '../cost/calculator.js';
import type { EngineAdapter, EngineId, AskOptions, EngineAnswer } from '../contracts/engine.js';

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

type GeminiOptions = {
  apiKey: string;
  model?: string;
  fetch?: typeof globalThis.fetch;
};

export class GeminiAdapter implements EngineAdapter {
  readonly id: EngineId = 'gemini';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetch: typeof globalThis.fetch;

  constructor(opts: GeminiOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? GEMINI_MODEL;
    this.fetch = opts.fetch ?? globalThis.fetch;
  }

  async ask(prompt: string, opts: AskOptions): Promise<EngineAnswer> {
    const url = `${GEMINI_BASE}/${this.model}:generateContent?key=${this.apiKey}`;

    const res = await this.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      }),
    });

    if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);

    const raw = await res.json() as GeminiRawResponse;
    const candidate = raw.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text).join('') ?? '';

    const sources = (candidate?.grounding_metadata?.grounding_chunks ?? [])
      .flatMap((chunk) => (chunk.web ? [{ url: chunk.web.uri, title: chunk.web.title }] : []));

    const tokensIn = raw.usage_metadata?.prompt_token_count ?? 0;
    const tokensOut = raw.usage_metadata?.candidates_token_count ?? 0;
    const costUsd = calcCallCost('gemini', this.model, tokensIn, tokensOut, { groundingCalls: 1 });

    return {
      text,
      sources,
      raw,
      usage: { provider: 'gemini', model: this.model, tokensIn, tokensOut, costUsd },
    };
  }
}

type GeminiRawResponse = {
  candidates?: {
    content?: { parts?: { text: string }[] };
    grounding_metadata?: {
      grounding_chunks?: { web?: { uri: string; title?: string } }[];
    };
  }[];
  usage_metadata?: {
    prompt_token_count?: number;
    candidates_token_count?: number;
  };
};
