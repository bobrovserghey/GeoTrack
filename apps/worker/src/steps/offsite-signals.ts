import type { StepResult } from '@geotrack/core';
import type { CitedPagesOutput } from '@geotrack/core/steps/cited-pages';
import type {
  OffsiteSignalsOutput,
  D1ReviewFacts,
  D2CitationFacts,
  D4EntityFacts,
  ReviewPlatformFact,
  ReviewPlatformKey,
} from '@geotrack/core/steps/offsite-signals';

// ---------------------------------------------------------------------------
// Deps & Input
// ---------------------------------------------------------------------------

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export type OffsiteSignalsDeps = {
  fetchFn: FetchFn;
};

export type OffsiteSignalsInput = {
  entityName: string;
  entityDomain: string;
  citedPages: CitedPagesOutput;
  serpApiKey: string | undefined;
};

// ---------------------------------------------------------------------------
// Review platforms
// ---------------------------------------------------------------------------

const REVIEW_PLATFORMS: Array<{ key: ReviewPlatformKey; domain: string }> = [
  { key: 'g2', domain: 'g2.com' },
  { key: 'capterra', domain: 'capterra.com' },
  { key: 'producthunt', domain: 'producthunt.com' },
  { key: 'trustpilot', domain: 'trustpilot.com' },
];

async function collectD1(
  entityName: string,
  serpApiKey: string,
  fetchFn: FetchFn,
): Promise<{ facts: D1ReviewFacts; requestsUsed: number }> {
  const clientPlatforms: ReviewPlatformFact[] = [];
  let requestsUsed = 0;

  for (const { key, domain } of REVIEW_PLATFORMS) {
    const query = `"${entityName}" site:${domain}`;
    const apiUrl =
      `https://serpapi.com/search.json` +
      `?engine=google&q=${encodeURIComponent(query)}&num=3` +
      `&api_key=${encodeURIComponent(serpApiKey)}`;

    try {
      const res = await fetchFn(apiUrl);
      requestsUsed++;

      if (!res.ok) {
        return {
          facts: { measured: false, clientPlatforms: [], clientPlatformCount: 0 },
          requestsUsed,
        };
      }

      const body = (await res.json()) as Record<string, unknown>;
      const organic = body['organic_results'];
      const firstResult =
        Array.isArray(organic) && organic.length > 0
          ? (organic[0] as Record<string, unknown>)
          : null;

      const profileUrl =
        firstResult && typeof firstResult['link'] === 'string' ? firstResult['link'] : null;
      const profileFound = profileUrl !== null && profileUrl.includes(domain);

      clientPlatforms.push({
        platform: key,
        profileFound,
        profileUrl: profileFound ? profileUrl : null,
      });
    } catch {
      return {
        facts: { measured: false, clientPlatforms: [], clientPlatformCount: 0 },
        requestsUsed,
      };
    }
  }

  const clientPlatformCount = clientPlatforms.filter((p) => p.profileFound).length;
  return {
    facts: { measured: true, clientPlatforms, clientPlatformCount },
    requestsUsed,
  };
}

// ---------------------------------------------------------------------------
// Citation presence (from T-34 output — no SerpAPI needed)
// ---------------------------------------------------------------------------

function collectD2(citedPages: CitedPagesOutput): D2CitationFacts {
  if (citedPages.analyzedPageCount === 0) {
    return {
      measured: false,
      citedPagesAnalyzed: 0,
      pagesWithClientMention: 0,
      clientPresenceRatio: 0,
    };
  }

  const clientPresenceRatio =
    citedPages.pagesWithClientMentionCount / citedPages.analyzedPageCount;

  return {
    measured: true,
    citedPagesAnalyzed: citedPages.analyzedPageCount,
    pagesWithClientMention: citedPages.pagesWithClientMentionCount,
    clientPresenceRatio,
  };
}

// ---------------------------------------------------------------------------
// Entity consistency (LinkedIn + Crunchbase)
// ---------------------------------------------------------------------------

async function collectD4(
  entityName: string,
  serpApiKey: string,
  fetchFn: FetchFn,
): Promise<{ facts: D4EntityFacts; requestsUsed: number }> {
  const entityQueries: Array<{
    query: string;
    matchDomain: string;
    field: 'linkedIn' | 'crunchbase';
  }> = [
    {
      query: `"${entityName}" linkedin company`,
      matchDomain: 'linkedin.com/company',
      field: 'linkedIn',
    },
    {
      query: `"${entityName}" crunchbase`,
      matchDomain: 'crunchbase.com',
      field: 'crunchbase',
    },
  ];

  let linkedInFound = false;
  let linkedInUrl: string | null = null;
  let crunchbaseFound = false;
  let crunchbaseUrl: string | null = null;
  let requestsUsed = 0;

  for (const { query, matchDomain, field } of entityQueries) {
    const apiUrl =
      `https://serpapi.com/search.json` +
      `?engine=google&q=${encodeURIComponent(query)}&num=3` +
      `&api_key=${encodeURIComponent(serpApiKey)}`;

    try {
      const res = await fetchFn(apiUrl);
      requestsUsed++;

      if (!res.ok) {
        return {
          facts: {
            measured: false,
            linkedInFound: false,
            linkedInUrl: null,
            crunchbaseFound: false,
            crunchbaseUrl: null,
          },
          requestsUsed,
        };
      }

      const body = (await res.json()) as Record<string, unknown>;
      const organic = body['organic_results'];
      const results = Array.isArray(organic) ? (organic as Record<string, unknown>[]) : [];

      const matchingResult = results.find(
        (r) => typeof r['link'] === 'string' && r['link'].includes(matchDomain),
      );
      const url = matchingResult ? (matchingResult['link'] as string) : null;

      if (field === 'linkedIn') {
        linkedInFound = url !== null;
        linkedInUrl = url;
      } else {
        crunchbaseFound = url !== null;
        crunchbaseUrl = url;
      }
    } catch {
      return {
        facts: {
          measured: false,
          linkedInFound: false,
          linkedInUrl: null,
          crunchbaseFound: false,
          crunchbaseUrl: null,
        },
        requestsUsed,
      };
    }
  }

  return {
    facts: { measured: true, linkedInFound, linkedInUrl, crunchbaseFound, crunchbaseUrl },
    requestsUsed,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function collectOffsiteSignals(
  input: OffsiteSignalsInput,
  deps: OffsiteSignalsDeps,
): Promise<StepResult<OffsiteSignalsOutput>> {
  const notes: string[] = [];
  let totalSerpRequests = 0;

  // D2 — no SerpAPI needed
  const d2 = collectD2(input.citedPages);

  // D1 + D4 — need SerpAPI
  let d1: D1ReviewFacts;
  let d4: D4EntityFacts;

  if (!input.serpApiKey) {
    d1 = { measured: false, clientPlatforms: [], clientPlatformCount: 0 };
    d4 = {
      measured: false,
      linkedInFound: false,
      linkedInUrl: null,
      crunchbaseFound: false,
      crunchbaseUrl: null,
    };
    notes.push('SerpAPI key not configured — D1 and D4 not measured');
  } else {
    const d1Result = await collectD1(input.entityName, input.serpApiKey, deps.fetchFn);
    d1 = d1Result.facts;
    totalSerpRequests += d1Result.requestsUsed;

    if (!d1.measured) {
      notes.push(`D1 not measured: SerpAPI error after ${d1Result.requestsUsed} request(s)`);
    }

    const d4Result = await collectD4(input.entityName, input.serpApiKey, deps.fetchFn);
    d4 = d4Result.facts;
    totalSerpRequests += d4Result.requestsUsed;

    if (!d4.measured) {
      notes.push(`D4 not measured: SerpAPI error after ${d4Result.requestsUsed} request(s)`);
    }
  }

  return {
    status: 'ok',
    data: { d1, d2, d4, serpRequestsUsed: totalSerpRequests },
    artifacts: [],
    usage: [],
    notes,
  };
}
