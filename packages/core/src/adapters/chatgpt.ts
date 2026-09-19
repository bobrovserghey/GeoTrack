import { calcCallCost } from '../cost/calculator.js';
import type { EngineAdapter, EngineId, AskOptions, EngineAnswer } from '../contracts/engine.js';

const CHATGPT_MODEL = 'gpt-4o-mini-search-preview';
const CHATGPT_URL = 'https://api.openai.com/v1/responses';

type ChatGptOptions = {
  apiKey: string;
  model?: string;
  fetch?: typeof globalThis.fetch;
};

export class ChatGptAdapter implements EngineAdapter {
  readonly id: EngineId = 'chatgpt';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetch: typeof globalThis.fetch;

  constructor(opts: ChatGptOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? CHATGPT_MODEL;
    this.fetch = opts.fetch ?? globalThis.fetch;
  }

  async ask(prompt: string, opts: AskOptions): Promise<EngineAnswer> {
    const res = await this.fetch(CHATGPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      signal: opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined,
      body: JSON.stringify({
        model: this.model,
        input: prompt,
        tools: [{ type: 'web_search_preview' }],
      }),
    });

    if (!res.ok) throw new Error(`ChatGPT Responses API error: ${res.status}`);

    const raw = await res.json() as ChatGptRawResponse;

    const messageOutput = raw.output?.find(o => o.type === 'message');
    const textContent = messageOutput?.content?.find(c => c.type === 'output_text');
    const text = textContent?.text ?? '';

    const seenUrls = new Set<string>();
    const sources: { url: string; title?: string }[] = [];
    for (const annotation of textContent?.annotations ?? []) {
      if (annotation.type === 'url_citation' && !seenUrls.has(annotation.url)) {
        seenUrls.add(annotation.url);
        sources.push({ url: annotation.url, ...(annotation.title ? { title: annotation.title } : {}) });
      }
    }

    const tokensIn = raw.usage?.input_tokens ?? 0;
    const tokensOut = raw.usage?.output_tokens ?? 0;
    const costUsd = calcCallCost('openai', this.model, tokensIn, tokensOut, { webSearchCalls: 1 });

    return {
      text,
      sources,
      raw,
      usage: { provider: 'openai', model: this.model, tokensIn, tokensOut, costUsd },
    };
  }
}

type ChatGptRawResponse = {
  output?: Array<{
    type: string;
    content?: Array<{
      type: string;
      text?: string;
      annotations?: Array<{
        type: string;
        url: string;
        title?: string;
        start_index?: number;
        end_index?: number;
      }>;
    }>;
  }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};
