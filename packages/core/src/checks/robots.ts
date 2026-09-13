export const AI_BOTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'PerplexityBot',
  'Google-Extended',
  'Bingbot',
] as const;

export type BotName = (typeof AI_BOTS)[number];
export type BotPermission = 'allowed' | 'blocked' | 'not-specified';
export type RobotsPermissions = Record<BotName, BotPermission>;

type DirectiveGroup = { allows: string[]; disallows: string[] };

function parseGroups(text: string): Map<string, DirectiveGroup> {
  const groups = new Map<string, DirectiveGroup>();
  let agents: string[] = [];
  let group: DirectiveGroup = { allows: [], disallows: [] };

  const flush = () => {
    if (agents.length > 0) {
      for (const a of agents) {
        const key = a.toLowerCase();
        if (!groups.has(key)) groups.set(key, { allows: [], disallows: [] });
        const g = groups.get(key)!;
        g.allows.push(...group.allows);
        g.disallows.push(...group.disallows);
      }
    }
    agents = [];
    group = { allows: [], disallows: [] };
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) { flush(); continue; }
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      // A new User-agent: after directives starts a fresh block
      if (group.allows.length > 0 || group.disallows.length > 0) flush();
      agents.push(value);
    } else if (key === 'allow') {
      group.allows.push(value);
    } else if (key === 'disallow') {
      group.disallows.push(value);
    }
  }
  flush();
  return groups;
}

function longestMatch(path: string, rules: string[]): number {
  let best = -1;
  for (const r of rules) {
    if (r === '' || r === '/') { best = Math.max(best, r.length === 0 ? 0 : 1); }
    else if (path.startsWith(r)) best = Math.max(best, r.length);
  }
  return best;
}

function groupPermission(path: string, g: DirectiveGroup): BotPermission {
  if (g.disallows.length === 0 && g.allows.length === 0) return 'not-specified';

  const disAllLen = longestMatch(path, g.disallows);
  const allLen = longestMatch(path, g.allows);

  // Empty Disallow: means allow all
  const hasEmptyDisallow = g.disallows.includes('');
  if (hasEmptyDisallow && disAllLen <= 0) return 'allowed';

  if (disAllLen < 0) return 'allowed'; // no disallow matches
  if (allLen >= disAllLen) return 'allowed'; // allow wins on tie or longer
  return 'blocked';
}

/**
 * Parse robots.txt and return per-bot permission for the root path.
 * Specific bot rules take precedence over wildcard (*).
 */
export function parseRobotsPermissions(
  robotsTxt: string,
  checkPath = '/',
): RobotsPermissions {
  const groups = parseGroups(robotsTxt);
  const wildcard = groups.get('*');

  const result = {} as RobotsPermissions;
  for (const bot of AI_BOTS) {
    const specific = groups.get(bot.toLowerCase());
    if (specific) {
      result[bot] = groupPermission(checkPath, specific);
    } else if (wildcard) {
      result[bot] = groupPermission(checkPath, wildcard);
    } else {
      result[bot] = 'not-specified';
    }
  }
  return result;
}
