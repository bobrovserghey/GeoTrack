import { calcCallCost } from '../cost/calculator.js';
import type { ModelAdapter, GenerateOptions, ModelAnswer } from '../contracts/model.js';

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

type GeminiModelOptions = {
  apiKey: string;
  model?: string;
  fetch?: typeof globalThis.fetch;
};

export class GeminiModelAdapter implements ModelAdapter {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetch: typeof globalThis.fetch;

  constructor(opts: GeminiModelOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? GEMINI_MODEL;
    this.fetch = opts.fetch ?? globalThis.fetch;
  }

  async generate(prompt: string, opts: GenerateOptions = {}): Promise<ModelAnswer> {
    const url = `${GEMINI_BASE}/${this.model}:generateContent?key=${this.apiKey}`;

    const body: Record<string, unknown> = {
      contents: [{ parts: [{ text: prompt }] }],
    };

    if (opts.jsonMode) {
      body['generationConfig'] = { response_mime_type: 'application/json' };
    }

    const res = await this.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined,
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Gemini model API error: ${res.status}`);

    const raw = await res.json() as GeminiRawResponse;
    const text = raw.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';

    const tokensIn = raw.usage_metadata?.prompt_token_count ?? 0;
    const tokensOut = raw.usage_metadata?.candidates_token_count ?? 0;
    const costUsd = calcCallCost('gemini', this.model, tokensIn, tokensOut, {});

    return {
      text,
      usage: { provider: 'gemini', model: this.model, tokensIn, tokensOut, costUsd },
    };
  }
}

type GeminiRawResponse = {
  candidates?: { content?: { parts?: { text: string }[] } }[];
  usage_metadata?: { prompt_token_count?: number; candidates_token_count?: number };
};
