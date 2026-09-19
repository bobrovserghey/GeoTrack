import { getProviderPrices } from '@geotrack/config';

export type CalcOptions = {
  webSearchCalls?: number;
  groundingCalls?: number;
  freeGroundingCalls?: number;
  requestCount?: number;
};

export function calcCallCost(
  provider: string,
  model: string,
  tokensIn: number,
  tokensOut: number,
  options: CalcOptions = {},
): number {
  const prices = getProviderPrices();
  const key = `${provider}/${model}`;
  const price = prices[key];
  if (!price) throw new Error(`Unknown provider/model: "${key}"`);

  let cost = 0;
  if (price.inputPerMToken !== undefined) cost += (tokensIn / 1_000_000) * price.inputPerMToken;
  if (price.outputPerMToken !== undefined) cost += (tokensOut / 1_000_000) * price.outputPerMToken;
  if (price.requestPer1k !== undefined && options.requestCount)
    cost += (options.requestCount / 1000) * price.requestPer1k;
  if (price.webSearchCallPer1k !== undefined && options.webSearchCalls)
    cost += (options.webSearchCalls / 1000) * price.webSearchCallPer1k;
  if (price.groundingCallPer1k !== undefined && options.groundingCalls) {
    const paidGrounding = Math.max(0, options.groundingCalls - (options.freeGroundingCalls ?? 0));
    cost += (paidGrounding / 1000) * price.groundingCallPer1k;
  }

  return cost;
}
