export type RateLimitDeps = {
  countTeasersByDomain: (domain: string) => Promise<number>;
  countTeasersByEmail: (email: string) => Promise<number>;
  countByIpHour: (ip: string) => Promise<number>;
  countByIpDay: (ip: string) => Promise<number>;
  countTeasersToday: () => Promise<number>;
};

export type RateLimitContext = {
  domainNormalized: string;
  ipAddress: string;
  isInternal: boolean;
  dailyCeiling: number;
  emailNormalized?: string;
};

export type RateLimitResult =
  | { allowed: true; softBlock?: boolean }
  | { allowed: false; reason: 'domain_limit' | 'email_limit' | 'daily_ceiling'; scheduledDate?: string };

export async function checkRateLimits(
  ctx: RateLimitContext,
  deps: RateLimitDeps,
): Promise<RateLimitResult> {
  if (ctx.isInternal) {
    return { allowed: true };
  }

  const domainCount = await deps.countTeasersByDomain(ctx.domainNormalized);
  if (domainCount >= 1) {
    return { allowed: false, reason: 'domain_limit' };
  }

  if (ctx.emailNormalized) {
    const emailCount = await deps.countTeasersByEmail(ctx.emailNormalized);
    if (emailCount >= 3) {
      return { allowed: false, reason: 'email_limit' };
    }
  }

  const ceiling = ctx.dailyCeiling === 0 ? Infinity : ctx.dailyCeiling;
  if (ceiling !== Infinity) {
    const todayCount = await deps.countTeasersToday();
    if (todayCount >= ceiling) {
      const tomorrow = new Date();
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const scheduledDate = tomorrow.toISOString().slice(0, 10);
      return { allowed: false, reason: 'daily_ceiling', scheduledDate };
    }
  }

  const [ipHour, ipDay] = await Promise.all([
    deps.countByIpHour(ctx.ipAddress),
    deps.countByIpDay(ctx.ipAddress),
  ]);
  const softBlock = ipHour >= 5 || ipDay >= 20;

  return softBlock ? { allowed: true, softBlock: true } : { allowed: true };
}
