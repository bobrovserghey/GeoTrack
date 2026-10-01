// Price → profile mapping lives here, not in audit-profiles.v2.json: that
// file is a protected invariant (CLAUDE.md) describing pipeline parameters,
// not commercial pricing, and Paddle price IDs are an operational detail of
// this one integration. See docs/specs/T-45.md.

export type PaddlePriceMapping = {
  profileId: 'standard' | 'extended';
  priceUsd: number;
};

export function getPaddlePriceMap(
  env: Record<string, string | undefined> = process.env,
): Record<string, PaddlePriceMapping> {
  const map: Record<string, PaddlePriceMapping> = {};
  if (env.PADDLE_PRICE_ID_STANDARD) {
    map[env.PADDLE_PRICE_ID_STANDARD] = { profileId: 'standard', priceUsd: 79 };
  }
  if (env.PADDLE_PRICE_ID_EXTENDED) {
    map[env.PADDLE_PRICE_ID_EXTENDED] = { profileId: 'extended', priceUsd: 199 };
  }
  return map;
}

export function resolvePaddlePrice(
  priceId: string,
  env: Record<string, string | undefined> = process.env,
): PaddlePriceMapping | null {
  const map = getPaddlePriceMap(env);
  return Object.hasOwn(map, priceId) ? map[priceId]! : null;
}
