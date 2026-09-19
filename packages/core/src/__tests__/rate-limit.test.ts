import { describe, it, expect, vi } from 'vitest';
import { checkRateLimits } from '../rate-limit.js';
import type { RateLimitDeps } from '../rate-limit.js';

function makeDeps(overrides: Partial<RateLimitDeps> = {}): RateLimitDeps {
  return {
    countTeasersByDomain: vi.fn(async () => 0),
    countTeasersByEmail: vi.fn(async () => 0),
    countByIpHour: vi.fn(async () => 0),
    countByIpDay: vi.fn(async () => 0),
    countTeasersToday: vi.fn(async () => 0),
    ...overrides,
  };
}

const base = {
  domainNormalized: 'example.com',
  ipAddress: '1.2.3.4',
  isInternal: false,
  dailyCeiling: 100,
};

describe('checkRateLimits — domain limit', () => {
  it('allows first teaser on a domain', async () => {
    const result = await checkRateLimits(base, makeDeps({ countTeasersByDomain: vi.fn(async () => 0) }));
    expect(result.allowed).toBe(true);
  });

  it('blocks second teaser on same domain within 30 days', async () => {
    const result = await checkRateLimits(base, makeDeps({ countTeasersByDomain: vi.fn(async () => 1) }));
    expect(result.allowed).toBe(false);
    expect(result.allowed === false && result.reason).toBe('domain_limit');
  });

  it('allows when is_internal regardless of domain count', async () => {
    const result = await checkRateLimits(
      { ...base, isInternal: true },
      makeDeps({ countTeasersByDomain: vi.fn(async () => 5) }),
    );
    expect(result.allowed).toBe(true);
  });
});

describe('checkRateLimits — email limit', () => {
  it('allows when email count is 3 (below threshold)', async () => {
    const result = await checkRateLimits(
      { ...base, emailNormalized: 'user@example.com' },
      makeDeps({ countTeasersByEmail: vi.fn(async () => 3) }),
    );
    expect(result.allowed).toBe(true);
  });

  it('blocks 4th teaser on same verified email', async () => {
    const result = await checkRateLimits(
      { ...base, emailNormalized: 'user@example.com' },
      makeDeps({ countTeasersByEmail: vi.fn(async () => 4) }),
    );
    expect(result.allowed).toBe(false);
    expect(result.allowed === false && result.reason).toBe('email_limit');
  });

  it('skips email limit when emailNormalized is not provided', async () => {
    const deps = makeDeps({ countTeasersByEmail: vi.fn(async () => 99) });
    const result = await checkRateLimits(base, deps);
    expect(result.allowed).toBe(true);
    expect(deps.countTeasersByEmail).not.toHaveBeenCalled();
  });

  it('allows when is_internal regardless of email count', async () => {
    const result = await checkRateLimits(
      { ...base, isInternal: true, emailNormalized: 'user@example.com' },
      makeDeps({ countTeasersByEmail: vi.fn(async () => 99) }),
    );
    expect(result.allowed).toBe(true);
  });
});

describe('checkRateLimits — daily ceiling', () => {
  it('allows when below ceiling', async () => {
    const result = await checkRateLimits(
      { ...base, dailyCeiling: 100 },
      makeDeps({ countTeasersToday: vi.fn(async () => 99) }),
    );
    expect(result.allowed).toBe(true);
  });

  it('returns scheduledDate when ceiling is reached', async () => {
    const result = await checkRateLimits(
      { ...base, dailyCeiling: 50 },
      makeDeps({ countTeasersToday: vi.fn(async () => 50) }),
    );
    expect(result.allowed).toBe(false);
    expect(result.allowed === false && result.reason).toBe('daily_ceiling');
    expect(result.allowed === false && typeof result.scheduledDate).toBe('string');
    expect(result.allowed === false && result.scheduledDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('allows when is_internal even at ceiling', async () => {
    const result = await checkRateLimits(
      { ...base, isInternal: true, dailyCeiling: 1 },
      makeDeps({ countTeasersToday: vi.fn(async () => 100) }),
    );
    expect(result.allowed).toBe(true);
  });

  it('uses Infinity ceiling when dailyCeiling is 0 (disabled)', async () => {
    const result = await checkRateLimits(
      { ...base, dailyCeiling: 0 },
      makeDeps({ countTeasersToday: vi.fn(async () => 999) }),
    );
    expect(result.allowed).toBe(true);
  });
});

describe('checkRateLimits — IP soft block', () => {
  it('allows and sets softBlock when IP exceeds hourly threshold', async () => {
    const result = await checkRateLimits(
      base,
      makeDeps({ countByIpHour: vi.fn(async () => 5) }),
    );
    expect(result.allowed).toBe(true);
    expect(result.allowed && result.softBlock).toBe(true);
  });

  it('allows and sets softBlock when IP exceeds daily threshold', async () => {
    const result = await checkRateLimits(
      base,
      makeDeps({ countByIpDay: vi.fn(async () => 20) }),
    );
    expect(result.allowed).toBe(true);
    expect(result.allowed && result.softBlock).toBe(true);
  });

  it('does not set softBlock when IP is within limits', async () => {
    const result = await checkRateLimits(
      base,
      makeDeps({ countByIpHour: vi.fn(async () => 4), countByIpDay: vi.fn(async () => 19) }),
    );
    expect(result.allowed).toBe(true);
    expect(result.allowed && result.softBlock).toBeFalsy();
  });
});

describe('checkRateLimits — domain check runs before daily ceiling', () => {
  it('returns domain_limit even if ceiling is also exceeded', async () => {
    const result = await checkRateLimits(
      { ...base, dailyCeiling: 1 },
      makeDeps({
        countTeasersByDomain: vi.fn(async () => 1),
        countTeasersToday: vi.fn(async () => 100),
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.allowed === false && result.reason).toBe('domain_limit');
  });
});
