// RFC 9309 matching for a single crawler token. Separate from robots.ts,
// which only covers the fixed AI_BOTS list and a prefix-only matcher.

type Rule = { allow: boolean; pattern: string };

type Group = { agents: string[]; rules: Rule[] };

/**
 * Characters a percent-encoded path keeps literally (RFC 3986 pchar plus "/" and
 * "?", as WHATWG URL serialisation leaves them), plus the robots wildcards
 * `*` and `$` — which are sub-delims anyway and must never be encoded.
 */
const PATH_LITERAL = new Set(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~!$&'()*+,;=:@/?[]".split(''),
);

const HEX_PAIR = /^[0-9A-Fa-f]{2}$/;

/** A single character outside the literal set, or any "%": nothing else needs work. */
const NEEDS_ENCODING = /[^A-Za-z0-9\-._~!$&'()*+,;=:@/?[\]]/;

/**
 * Brings a rule pattern or a path to one percent-encoded form so both sides of
 * the comparison are octet-for-octet comparable (RFC 9309 §2.2.2): existing
 * `%xx` escapes are kept (upper-cased, never decoded, so `%2F` stays distinct
 * from `/`), everything outside the literal set is UTF-8 percent-encoded.
 * Linear in the input length.
 */
function normalisePercentEncoding(input: string): string {
  // "%" is not in the literal set, so an already-clean ASCII string short-circuits.
  if (!NEEDS_ENCODING.test(input)) return input;
  let out = '';
  for (let i = 0; i < input.length; ) {
    const ch = input[i]!;
    if (ch === '%' && HEX_PAIR.test(input.slice(i + 1, i + 3))) {
      out += '%' + input.slice(i + 1, i + 3).toUpperCase();
      i += 3;
      continue;
    }
    if (PATH_LITERAL.has(ch)) {
      out += ch;
      i += 1;
      continue;
    }
    const chunk = String.fromCodePoint(input.codePointAt(i)!);
    try {
      out += encodeURIComponent(chunk);
    } catch {
      // Lone surrogate: not encodable, keep it as-is on both sides.
      out += chunk;
    }
    i += chunk.length;
  }
  return out;
}

function parseGroups(robotsTxt: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  // A group stays open across blank lines; only a user-agent line that follows a
  // rule (allow/disallow) starts a new group. Records other than user-agent,
  // allow and disallow — Crawl-delay, Sitemap, Host, anything unknown — MUST be
  // ignored (RFC 9309 §2.2.4), which leaves the user-agent lines around them
  // adjacent, i.e. one group with all of their agents. Google's reference parser
  // behaves the same way: it sets the group separator only on allow/disallow.
  // Closing the agent list on an ignored record under-blocks: it would turn a
  // rule-less "User-agent: X\nCrawl-delay: N" into a matching specific group
  // with zero rules and discard a following "User-agent: *\nDisallow: /".
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
      current.agents.push(productToken(value));
    } else if (key === 'allow' || key === 'disallow') {
      collectingAgents = false;
      // Rules before any user-agent line belong to no group.
      if (!current) continue;
      // An empty value matches nothing: "Disallow:" permits everything. The
      // group still exists with zero rules, so an explicitly rule-less specific
      // group governs and must NOT fall back to "*" (see isPathAllowed).
      if (value) {
        current.rules.push({ allow: key === 'allow', pattern: normalisePercentEncoding(value) });
      }
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

/**
 * Product token of a user-agent value, applied to BOTH sides of the comparison:
 * the caller's user-agent and the `User-agent:` values in robots.txt (so
 * "User-agent: GeoTrack/1.0" is tolerated, as Google's parser does). "*" has no
 * token characters and is kept verbatim.
 */
function productToken(userAgent: string): string {
  const m = userAgent.trim().match(/^[A-Za-z0-9_-]+/);
  return (m ? m[0] : userAgent.trim()).toLowerCase();
}

/**
 * Whether `userAgent` may fetch `path` (path plus optional query, starting
 * with "/") under robots.txt rules. The most specific group wins by exact
 * product token (never by substring), falling back to "*"; groups repeating
 * the same token are merged; the longest matching rule wins and Allow wins a tie.
 * Rule patterns and the path are percent-encoded the same way before matching,
 * so a raw UTF-8 rule ("Disallow: /café") matches an encoded path ("/caf%C3%A9").
 */
export function isPathAllowed(robotsTxt: string, userAgent: string, rawPath: string): boolean {
  const token = productToken(userAgent);
  const path = normalisePercentEncoding(rawPath);
  const groups = parseGroups(robotsTxt);

  let specific: Rule[] | null = null;
  let wildcard: Rule[] | null = null;
  for (const g of groups) {
    if (g.agents.includes(token)) specific = [...(specific ?? []), ...g.rules];
    if (g.agents.includes('*')) wildcard = [...(wildcard ?? []), ...g.rules];
  }
  // Nullish, not truthy: an empty `specific` means a group for our token exists
  // and carries no rules, which still governs — it must not fall back to "*".
  // Two shapes reach here: an explicit empty rule ("User-agent: X\nDisallow:")
  // and a trailing group with no rules at all ("...\nDisallow: /\n\nUser-agent: X"
  // at EOF). Both are the site naming us, so both govern. This matches
  // google/robotstxt's RobotsMatcher::disallow(), which returns "allowed" once a
  // specific agent was seen and its priorities stayed 0, and RFC 9309 §2.2.1
  // ("the most specific group wins"). Do not change this to
  // `specific.length > 0 ? specific : wildcard` — see the regression test
  // "an explicitly rule-less specific group governs" in robots-rules.test.ts.
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
