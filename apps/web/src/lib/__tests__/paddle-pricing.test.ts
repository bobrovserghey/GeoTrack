import { describe, it, expect } from 'vitest';
import { getPaddlePriceMap, resolvePaddlePrice } from '../paddle-pricing.js';

const ENV = {
  PADDLE_PRICE_ID_STANDARD: 'pri_standard_123',
  PADDLE_PRICE_ID_EXTENDED: 'pri_extended_456',
};

describe('getPaddlePriceMap', () => {
  it('maps both configured price ids', () => {
    const map = getPaddlePriceMap(ENV);
    expect(map['pri_standard_123']).toEqual({ profileId: 'standard', priceUsd: 79 });
    expect(map['pri_extended_456']).toEqual({ profileId: 'extended', priceUsd: 199 });
  });

  it('omits a tier whose env var is unset', () => {
    const map = getPaddlePriceMap({ PADDLE_PRICE_ID_STANDARD: 'pri_standard_123' });
    expect(map['pri_standard_123']).toBeDefined();
    expect(Object.keys(map)).toEqual(['pri_standard_123']);
  });

  it('returns an empty map when nothing is configured', () => {
    expect(getPaddlePriceMap({})).toEqual({});
  });
});

describe('resolvePaddlePrice', () => {
  it('resolves a known price id', () => {
    expect(resolvePaddlePrice('pri_standard_123', ENV)).toEqual({ profileId: 'standard', priceUsd: 79 });
  });

  it('returns null for an unknown price id', () => {
    expect(resolvePaddlePrice('pri_unknown', ENV)).toBeNull();
  });

  it('is not fooled by a prototype-chain property name', () => {
    expect(resolvePaddlePrice('toString', ENV)).toBeNull();
    expect(resolvePaddlePrice('constructor', ENV)).toBeNull();
  });
});
