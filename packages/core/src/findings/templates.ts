import type { FindingTemplate, Evidence, FindingsFacts } from './types.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function b2BlockedBots(facts: FindingsFacts): string[] {
  if (!facts.techCheck) return [];
  const b2 = facts.techCheck.b2;
  if (!b2.measured) return [];
  return b2.results.filter((r) => r.blocked).map((r) => r.bot);
}

function b1BlockedBots(facts: FindingsFacts): string[] {
  if (!facts.techCheck) return [];
  const b1 = facts.techCheck.b1;
  if (!b1.measured) return [];
  return Object.entries(b1.permissions)
    .filter(([, perm]) => perm === 'blocked')
    .map(([bot]) => bot);
}

function mentionRate(facts: FindingsFacts): number {
  if (!facts.mentions || facts.mentions.facts.length === 0) return 0;
  const mentioned = facts.mentions.facts.filter((f) => f.brandMentioned).length;
  return mentioned / facts.mentions.facts.length;
}

// ── templates ────────────────────────────────────────────────────────────────

export const FINDING_TEMPLATES: FindingTemplate[] = [
  // ── Pillar B ──────────────────────────────────────────────────────────────

  {
    id: 'b1_gptbot_blocked',
    criterionId: 'b1',
    pillar: 'B',
    impact: 'critical',
    maxDelta: -0.6,
    effortHours: 2,
    title: 'GPTBot is blocked by robots.txt',
    description:
      'Your robots.txt disallows GPTBot, preventing ChatGPT from indexing and citing your content in responses.',
    howToFix:
      'Add `User-agent: GPTBot` / `Allow: /` to your robots.txt, or remove the blocking rule. Verify with `curl -A GPTBot https://yourdomain.com/robots.txt`.',
    condition: (facts) => b1BlockedBots(facts).includes('GPTBot'),
    buildEvidence: (facts) => {
      const blocked = b1BlockedBots(facts);
      if (blocked.length === 0) return null;
      return {
        type: 'code',
        caption: 'Blocked bots in robots.txt',
        text: blocked.map((b) => `User-agent: ${b}\nDisallow: /`).join('\n\n'),
      };
    },
  },

  {
    id: 'b1_perplexitybot_blocked',
    criterionId: 'b1',
    pillar: 'B',
    impact: 'critical',
    maxDelta: -0.6,
    effortHours: 2,
    title: 'PerplexityBot is blocked by robots.txt',
    description:
      'Your robots.txt disallows PerplexityBot, preventing Perplexity from reading your pages when answering user queries.',
    howToFix:
      'Add `User-agent: PerplexityBot` / `Allow: /` to your robots.txt. Then re-check with `curl -A PerplexityBot https://yourdomain.com/`.',
    condition: (facts) => b1BlockedBots(facts).includes('PerplexityBot'),
    buildEvidence: null,
  },

  {
    id: 'b2_http_blocked',
    criterionId: 'b2',
    pillar: 'B',
    impact: 'critical',
    maxDelta: -0.8,
    effortHours: 4,
    title: 'AI crawler gets HTTP 4xx from your server',
    description:
      'One or more AI crawlers receive a 403 or 429 HTTP response, effectively blocking them at the network level regardless of robots.txt settings.',
    howToFix:
      'Check your CDN/WAF rules for User-agent based blocking. Add AI bot user-agents to the allowlist in Cloudflare, Nginx or your WAF configuration.',
    condition: (facts) => b2BlockedBots(facts).length > 0,
    buildEvidence: (facts): Evidence | null => {
      if (!facts.techCheck) return null;
      const b2 = facts.techCheck.b2;
      if (!b2.measured) return null;
      const blocked = b2.results.filter((r) => r.blocked);
      if (blocked.length === 0) return null;
      return {
        type: 'table',
        caption: 'HTTP responses to AI crawlers',
        headers: ['Bot', 'URL', 'Status'],
        rows: blocked.map((r) => [r.bot, r.url, String(r.statusCode)]),
      };
    },
  },

  {
    id: 'b3_js_only',
    criterionId: 'b3',
    pillar: 'B',
    impact: 'warning',
    maxDelta: -0.4,
    effortHours: 16,
    title: 'Key page has little content without JavaScript',
    description:
      'Your main page renders almost no text without JavaScript. AI crawlers that do not execute JS will see an empty page and cannot extract facts about your product.',
    howToFix:
      'Implement server-side rendering (SSR) or static site generation (SSG) for key pages. At minimum, ensure the hero text, product description, and pricing exist in the HTML response.',
    condition: (facts) => {
      if (!facts.techCheck) return false;
      const b3 = facts.techCheck.b3;
      return b3.measured && b3.contentRatio < 0.2;
    },
    buildEvidence: (facts): Evidence | null => {
      if (!facts.techCheck) return null;
      const b3 = facts.techCheck.b3;
      if (!b3.measured) return null;
      return {
        type: 'table',
        caption: 'Content availability without JavaScript',
        headers: ['Metric', 'Value'],
        rows: [
          ['Raw HTML text length', `${b3.rawTextLength} chars`],
          ['Rendered text length', `${b3.renderedTextLength} chars`],
          ['Content ratio', `${Math.round(b3.contentRatio * 100)}%`],
        ],
      };
    },
  },

  {
    id: 'b4_bing_not_indexed',
    criterionId: 'b4',
    pillar: 'B',
    impact: 'warning',
    maxDelta: -0.4,
    effortHours: 4,
    title: 'Key pages are not indexed in Bing',
    description:
      'One or more important pages are missing from Bing\'s index. Microsoft Copilot relies on Bing for web citations, so un-indexed pages cannot be cited.',
    howToFix:
      'Submit your sitemap to Bing Webmaster Tools. Check for noindex tags on affected pages and fix any crawl errors in the Bing Webmaster dashboard.',
    condition: (facts) => {
      if (!facts.techCheck) return false;
      const b4 = facts.techCheck.b4;
      if (!b4.measured) return false;
      return b4.pagesChecked.some((p) => !p.indexed);
    },
    buildEvidence: (facts): Evidence | null => {
      if (!facts.techCheck) return null;
      const b4 = facts.techCheck.b4;
      if (!b4.measured) return null;
      const notIndexed = b4.pagesChecked.filter((p) => !p.indexed);
      if (notIndexed.length === 0) return null;
      return {
        type: 'table',
        caption: 'Bing index status',
        headers: ['Page', 'Indexed'],
        rows: [
          ...b4.pagesChecked.map((p) => [p.url, p.indexed ? 'Yes' : 'No']),
        ],
      };
    },
  },

  {
    id: 'b5_no_sitemap',
    criterionId: 'b5',
    pillar: 'B',
    impact: 'notice',
    maxDelta: -0.2,
    effortHours: 1,
    title: 'No sitemap.xml found',
    description:
      'There is no sitemap.xml at the expected location. Search engines and AI crawlers use sitemaps to discover pages efficiently.',
    howToFix:
      'Generate a sitemap with your CMS or a tool like `next-sitemap`. Submit it to Google Search Console and Bing Webmaster Tools.',
    condition: (facts) => {
      if (!facts.techCheck) return false;
      const b5 = facts.techCheck.b5;
      return b5.measured && !b5.sitemapPresent;
    },
    buildEvidence: null,
  },

  // ── Pillar A ──────────────────────────────────────────────────────────────

  {
    id: 'a_not_mentioned',
    criterionId: 'a1',
    pillar: 'A',
    impact: 'critical',
    maxDelta: -1.2,
    effortHours: 40,
    title: 'Brand rarely appears in AI discovery prompts',
    description:
      'Your brand was mentioned in fewer than 20% of the discovery queries we tested. AI engines are not surfacing your product to buyers actively searching in your category.',
    howToFix:
      'Create authoritative content for each buyer job-to-be-done in your category. Build backlinks from sources AI engines cite (comparison sites, review platforms, analyst blogs). Ensure your product description matches the language buyers use in prompts.',
    condition: (facts) => {
      if (!facts.mentions || facts.mentions.facts.length === 0) return false;
      return mentionRate(facts) < 0.2;
    },
    buildEvidence: (facts): Evidence | null => {
      if (!facts.mentions || facts.mentions.facts.length === 0) return null;
      const total = facts.mentions.facts.length;
      const mentioned = facts.mentions.facts.filter((f) => f.brandMentioned).length;
      return {
        type: 'table',
        caption: 'Brand mention coverage',
        headers: ['Metric', 'Value'],
        rows: [
          ['Prompts tested', String(total)],
          ['Prompts with brand mention', String(mentioned)],
          ['Mention rate', `${Math.round((mentioned / total) * 100)}%`],
        ],
      };
    },
  },

  {
    id: 'a_low_mention_rate',
    criterionId: 'a1',
    pillar: 'A',
    impact: 'warning',
    maxDelta: -0.7,
    effortHours: 20,
    title: 'Brand mentioned in less than half of discovery prompts',
    description:
      'Your brand appears in 20–50% of tested discovery queries. There is significant room to increase AI engine coverage.',
    howToFix:
      'Identify the query types where you are missing (comparison, alternative, use-case). Create dedicated landing pages or blog content targeting those query patterns.',
    condition: (facts) => {
      if (!facts.mentions || facts.mentions.facts.length === 0) return false;
      const rate = mentionRate(facts);
      return rate >= 0.2 && rate < 0.5;
    },
    buildEvidence: null,
  },

  // ── Pillar C ──────────────────────────────────────────────────────────────

  {
    id: 'c1_missing_pricing_page',
    criterionId: 'c1',
    pillar: 'C',
    impact: 'warning',
    maxDelta: -0.3,
    effortHours: 4,
    title: 'No dedicated pricing page found',
    description:
      'AI engines frequently cite pricing pages when answering buyer cost questions. Without one, your pricing information cannot be directly quoted.',
    howToFix:
      'Create a clear /pricing page with plan names, prices, and a feature comparison table. Use structured data (Product schema) to help AI engines parse it.',
    condition: (facts) => {
      if (!facts.content) return false;
      if (facts.content.analyzedPageCount === 0) return false;
      return facts.content.c1.pageTypeMap.pricing === null;
    },
    buildEvidence: null,
  },

  {
    id: 'c4_stale_content',
    criterionId: 'c4',
    pillar: 'C',
    impact: 'notice',
    maxDelta: -0.2,
    effortHours: 8,
    title: 'Key pages have not been updated in 6+ months',
    description:
      'AI engines prefer fresh, recently updated content. Pages with old last-modified dates may be ranked lower in citations.',
    howToFix:
      'Add a publication/update date to key pages. Review and refresh content on pricing, features, and comparison pages at least quarterly.',
    condition: (facts) => {
      if (!facts.content) return false;
      const median = facts.content.c4.medianAgeDays;
      return median !== null && median > 180;
    },
    buildEvidence: null,
  },

  {
    id: 'c5_entity_unclear',
    criterionId: 'c5',
    pillar: 'C',
    impact: 'warning',
    maxDelta: -0.3,
    effortHours: 4,
    title: 'Product entity not clearly identified on homepage',
    description:
      'The homepage does not clearly state what your product does, who it is for, or what category it belongs to. AI engines need explicit entity signals to classify and cite your product.',
    howToFix:
      'Ensure the hero section answers: what is the product, who is it for, and what category does it solve for. Use clear H1 and opening paragraph with these facts.',
    condition: (facts) => {
      if (!facts.content) return false;
      if (facts.content.analyzedPageCount === 0) return false;
      const c5 = facts.content.c5;
      return !c5.entityMentioned || !c5.categoryMentioned;
    },
    buildEvidence: null,
  },

  // ── Pillar D ──────────────────────────────────────────────────────────────

  {
    id: 'd1_no_review_profiles',
    criterionId: 'd1',
    pillar: 'D',
    impact: 'warning',
    maxDelta: -0.3,
    effortHours: 8,
    title: 'No profiles on major review platforms',
    description:
      'G2, Capterra, and similar platforms are heavily cited by AI engines when users ask for software recommendations. Your absence means competitors with profiles get cited instead.',
    howToFix:
      'Create and verify profiles on G2, Capterra, and Product Hunt. Collect at least 10 reviews on each to become eligible for "best of" lists that AI engines reference.',
    condition: (facts) => {
      if (!facts.offsite) return false;
      const d1 = facts.offsite.d1;
      return d1.measured && d1.clientPlatformCount === 0;
    },
    buildEvidence: null,
  },

  {
    id: 'd2_low_citation',
    criterionId: 'd2',
    pillar: 'D',
    impact: 'critical',
    maxDelta: -0.5,
    effortHours: 20,
    title: 'Rarely cited in sources AI engines reference',
    description:
      'Less than 10% of the third-party pages cited by AI engines when discussing your category mention your brand. You have low organic third-party coverage.',
    howToFix:
      'Build PR mentions in outlets that AI engines cite (TechCrunch, G2, Capterra, relevant blogs). Create content that earns backlinks: case studies, benchmarks, research data.',
    condition: (facts) => {
      if (!facts.offsite) return false;
      const d2 = facts.offsite.d2;
      return d2.measured && d2.citedPagesAnalyzed > 0 && d2.clientPresenceRatio < 0.1;
    },
    buildEvidence: (facts): Evidence | null => {
      if (!facts.offsite) return null;
      const d2 = facts.offsite.d2;
      if (!d2.measured) return null;
      return {
        type: 'table',
        caption: 'Citation presence on AI-cited pages',
        headers: ['Metric', 'Value'],
        rows: [
          ['Cited pages analyzed', String(d2.citedPagesAnalyzed)],
          ['Pages mentioning brand', String(d2.pagesWithClientMention)],
          ['Presence ratio', `${Math.round(d2.clientPresenceRatio * 100)}%`],
        ],
      };
    },
  },

  {
    id: 'd4_no_entity',
    criterionId: 'd4',
    pillar: 'D',
    impact: 'notice',
    maxDelta: -0.15,
    effortHours: 2,
    title: 'No LinkedIn company page or Crunchbase profile found',
    description:
      'AI engines use structured entity data from LinkedIn and Crunchbase to verify company existence and build context. Missing profiles reduce your entity confidence score.',
    howToFix:
      'Create or claim a LinkedIn Company page and a Crunchbase profile. Ensure the company name, description, and website URL match across all profiles.',
    condition: (facts) => {
      if (!facts.offsite) return false;
      const d4 = facts.offsite.d4;
      return d4.measured && !d4.linkedInFound && !d4.crunchbaseFound;
    },
    buildEvidence: null,
  },

  // ── Pillar E ──────────────────────────────────────────────────────────────

  {
    id: 'e1_find_price_failed',
    criterionId: 'e1',
    pillar: 'E',
    impact: 'critical',
    maxDelta: -0.6,
    effortHours: 8,
    title: 'AI agent could not find pricing in 3 attempts',
    description:
      'Our scripted agent attempted to locate pricing information 3 times and failed each time. An AI assistant helping a buyer evaluate your product will hit the same wall.',
    howToFix:
      'Ensure your pricing page is reachable with no login requirement. Add a clear "Pricing" link in the main navigation. Remove CAPTCHAs or login gates from the pricing page.',
    condition: (facts) => {
      if (!facts.agentScenarios) return false;
      const e1 = facts.agentScenarios.e1;
      return e1.measured && e1.findPrice.attempts > 0 && !e1.findPrice.success;
    },
    buildEvidence: (facts): Evidence | null => {
      if (!facts.agentScenarios) return null;
      const fp = facts.agentScenarios.e1.findPrice;
      if (fp.failurePoint === null) return null;
      return {
        type: 'text',
        caption: 'Where the agent got stuck',
        text: fp.failurePoint,
      };
    },
  },

  {
    id: 'e3_captcha',
    criterionId: 'e3',
    pillar: 'E',
    impact: 'critical',
    maxDelta: -0.5,
    effortHours: 4,
    title: 'CAPTCHA blocks AI agents from reaching key pages',
    description:
      'A CAPTCHA challenge was detected on a key page. AI agents and automated evaluators cannot solve CAPTCHAs, so they cannot access the protected content.',
    howToFix:
      'Move CAPTCHA to form submission only (not page load). Use bot-score-based rules in your WAF to challenge only suspicious traffic rather than all automated requests.',
    condition: (facts) => {
      if (!facts.accessibility) return false;
      return facts.accessibility.e3.measured && facts.accessibility.e3.captchaDetected;
    },
    buildEvidence: (facts): Evidence | null => {
      if (!facts.accessibility) return null;
      const e3 = facts.accessibility.e3;
      if (!e3.measured || !e3.captchaDetected) return null;
      return {
        type: 'text',
        caption: 'CAPTCHA type detected',
        text: e3.captchaType ?? 'unknown',
      };
    },
  },

  {
    id: 'e3_antibot',
    criterionId: 'e3',
    pillar: 'E',
    impact: 'critical',
    maxDelta: -0.5,
    effortHours: 4,
    title: 'Anti-bot wall prevents agent access',
    description:
      'An anti-bot protection layer is blocking automated access to your site. AI agents cannot complete tasks or gather information on pages protected this way.',
    howToFix:
      'Configure your anti-bot solution to allow requests with known AI crawler user-agents. Add GPTBot, PerplexityBot, and ClaudeBot to your allowlist.',
    condition: (facts) => {
      if (!facts.accessibility) return false;
      const e3 = facts.accessibility.e3;
      return e3.measured && e3.antibotWallDetected;
    },
    buildEvidence: null,
  },

  {
    id: 'e4_no_pricing_structured',
    criterionId: 'e4',
    pillar: 'E',
    impact: 'warning',
    maxDelta: -0.3,
    effortHours: 4,
    title: 'No structured pricing data available',
    description:
      'Your pricing page exists but is not structured with machine-readable markup. AI engines cannot reliably parse plan names, prices, and features from unstructured HTML.',
    howToFix:
      'Add JSON-LD Product/Offer schema to your pricing page. Alternatively, publish pricing as a structured data feed (JSON endpoint) linked from your llms.txt.',
    condition: (facts) => {
      if (!facts.machineReadable) return false;
      const e4 = facts.machineReadable.e4;
      return e4.measured && e4.pricingPageFound && !e4.pricingStructured;
    },
    buildEvidence: null,
  },

  {
    id: 'e5_no_llms_txt',
    criterionId: 'e5',
    pillar: 'E',
    impact: 'warning',
    maxDelta: -0.3,
    effortHours: 2,
    title: 'No llms.txt published',
    description:
      'llms.txt is the emerging standard for telling AI systems what your product does and how to navigate your site. Without it, AI agents rely on HTML scraping rather than your curated summary.',
    howToFix:
      'Create /llms.txt with a brief product description, key page links (pricing, docs, API), and contact information. See llmstxt.org for the format specification.',
    condition: (facts) => {
      if (!facts.machineReadable) return false;
      const e5 = facts.machineReadable.e5;
      return e5.measured && !e5.llmsTxtFound;
    },
    buildEvidence: null,
  },
];
