// RFC 9309 matching for a single crawler token. Separate from robots.ts,
// which only covers the fixed AI_BOTS list and a prefix-only matcher.

type Rule = { allow: boolean; pattern: string };

type Group = { agents: string[]; rules: Rule[] };

function parseGroups(robotsTxt: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  // A group stays open across blank lines; only a user-agent line that
  // follows rules starts a new one.
  let collectingAgents = false;

  const text = robotsTxt.charCodeAt(0) === 0xfeff ? robotsTxt.slice(1) : robotsTxt;
  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === 'user-agent') {
      if (!current || !collectingAgents) {
        current = { agents: [], rules: [] };
        groups.push(current);
        collectingAgents = true;
      }
      current.agents.push(value.toLowerCase());
    } else if (key === 'allow' || key === 'disallow') {
      collectingAgents = false;
      // Rules before any user-agent line belong to no group.
      if (!current) continue;
      // An empty value matches nothing: "Disallow:" permits everything.
      if (value) current.rules.push({ allow: key === 'allow', pattern: value });
    }
  }
  return groups;
}

/** Linear-time matcher for `*` and a trailing `$`; avoids regex backtracking. */
function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const parts = body.split('*');
  const first = parts[0]!;
  if (!path.startsWith(first)) return false;
  if (parts.length === 1) return anchored ? path === first : true;

  let pos = first.length;
  for (let i = 1; i < parts.length - 1; i++) {
    const idx = path.indexOf(parts[i]!, pos);
    if (idx === -1) return false;
    pos = idx + parts[i]!.length;
  }
  const last = parts[parts.length - 1]!;
  if (anchored) return path.length - last.length >= pos && path.endsWith(last);
  return path.indexOf(last, pos) !== -1;
}

function productToken(userAgent: string): string {
  const m = userAgent.trim().match(/^[A-Za-z0-9_-]+/);
  return (m ? m[0] : userAgent.trim()).toLowerCase();
}

/**
 * Whether `userAgent` may fetch `path` (path plus optional query, starting
 * with "/") under robots.txt rules. The most specific group wins by exact
 * product token (never by substring), falling back to "*"; groups repeating
 * the same token are merged; the longest matching rule wins and Allow wins a tie.
 */
export function isPathAllowed(robotsTxt: string, userAgent: string, path: string): boolean {
  const token = productToken(userAgent);
  const groups = parseGroups(robotsTxt);

  let specific: Rule[] | null = null;
  let wildcard: Rule[] | null = null;
  for (const g of groups) {
    if (g.agents.includes(token)) specific = [...(specific ?? []), ...g.rules];
    if (g.agents.includes('*')) wildcard = [...(wildcard ?? []), ...g.rules];
  }
  const rules = specific ?? wildcard;
  if (!rules) return true;

  let bestLen = -1;
  let allowed = true;
  for (const r of rules) {
    if (!patternMatches(r.pattern, path)) continue;
    const len = r.pattern.length;
    if (len > bestLen || (len === bestLen && r.allow)) {
      bestLen = len;
      allowed = r.allow;
    }
  }
  return allowed;
}
