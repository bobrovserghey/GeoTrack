import { calcCallCost } from '../cost/calculator.js';
import type { EngineAdapter, EngineId, AskOptions, EngineAnswer } from '../contracts/engine.js';

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 1024;

type ClaudeOptions = {
  apiKey: string;
  model?: string;
  fetch?: typeof globalThis.fetch;
};

export class ClaudeAdapter implements EngineAdapter {
  readonly id: EngineId = 'claude';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetch: typeof globalThis.fetch;

  constructor(opts: ClaudeOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? CLAUDE_MODEL;
    this.fetch = opts.fetch ?? globalThis.fetch;
  }

  async ask(prompt: string, opts: AskOptions): Promise<EngineAnswer> {
    const res = await this.fetch(CLAUDE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      signal: opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined,
      body: JSON.stringify({
        model: this.model,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
        // Claude decides freely how many times to search per call; without a
        // cap each additional search bills separately (§8.1 tech plan, T-78).
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }],
      }),
    });

    if (!res.ok) throw new Error(`Claude Messages API error: ${res.status}`);

    const raw = await res.json() as ClaudeRawResponse;

    const textBlocks = (raw.content ?? []).filter(
      (b): b is ClaudeTextBlock => b.type === 'text',
    );
    const text = textBlocks.map((b) => b.text).join('');

    const seenUrls = new Set<string>();
    const sources: { url: string; title?: string }[] = [];
    for (const block of textBlocks) {
      for (const citation of block.citations ?? []) {
        if (citation.type === 'web_search_result_location' && !seenUrls.has(citation.url)) {
          seenUrls.add(citation.url);
          sources.push({ url: citation.url, ...(citation.title ? { title: citation.title } : {}) });
        }
      }
    }

    const tokensIn = raw.usage?.input_tokens ?? 0;
    const tokensOut = raw.usage?.output_tokens ?? 0;
    // Billed per actual search performed, not assumed: a response where Claude
    // chose not to search reports 0 here, never more than 1 thanks to max_uses.
    const webSearchCalls = raw.usage?.server_tool_use?.web_search_requests ?? 0;
    const costUsd = calcCallCost('anthropic', this.model, tokensIn, tokensOut, { webSearchCalls });

    return {
      text,
      sources,
      raw,
      usage: { provider: 'anthropic', model: this.model, tokensIn, tokensOut, costUsd },
    };
  }
}

type ClaudeTextBlock = {
  type: 'text';
  text: string;
  citations?: Array<{ type: string; url: string; title?: string }>;
};

type ClaudeRawResponse = {
  content?: Array<
    | ClaudeTextBlock
    | { type: 'server_tool_use'; id: string; name: string; input?: unknown }
    | { type: 'web_search_tool_result'; tool_use_id: string; content?: unknown }
  >;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    server_tool_use?: { web_search_requests?: number };
  };
};
