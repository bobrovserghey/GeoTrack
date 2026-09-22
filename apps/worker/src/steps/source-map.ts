import type { EngineId } from '@geotrack/core';
import type { EnginePollResponse } from '@geotrack/core/steps/engine-poll';
import type { StepResult, SourceMapEntry, SourceMapOutput } from '@geotrack/core';
import { normalizeDomain } from '@geotrack/core';

type DomainAccumulator = {
  responseKeys: Set<string>;
  urls: Set<string>;
  promptIds: Set<string>;
  engineIds: Set<EngineId>;
};

/** Returns true only for strings that look like a real hostname: must contain a dot, no spaces, no slashes. */
function isValidDomain(d: string): boolean {
  return d.includes('.') && !d.includes(' ') && !d.includes('/');
}

export function buildSourceMap(
  responses: EnginePollResponse[],
  clientDomain: string,
  competitorDomains: string[],
): StepResult<SourceMapOutput> {
  // Normalize clientDomain defensively — spec says it arrives normalized, but guard against
  // callers that pass a full URL or a www-prefixed value to prevent silent zero clientCitedCount.
  const normalizedClient = normalizeDomain(
    clientDomain.includes('://') ? clientDomain : `https://${clientDomain}`,
  );

  const accMap = new Map<string, DomainAccumulator>();

  for (const r of responses) {
    // Defensive guard: JSONB cache rows and unvalidated provider responses may deliver
    // null/undefined here at runtime, causing an unrecoverable TypeError in a step that
    // must always return status 'ok'.
    const sources = Array.isArray(r.sources) ? r.sources : [];
    for (const s of sources) {
      const domain = normalizeDomain(s.url);
      // Skip empty results and strings that don't look like valid hostnames (no dot, spaces, etc.)
      if (!domain || !isValidDomain(domain)) continue;

      let acc = accMap.get(domain);
      if (!acc) {
        acc = { responseKeys: new Set(), urls: new Set(), promptIds: new Set(), engineIds: new Set() };
        accMap.set(domain, acc);
      }

      // Use null-byte separator — promptId/engineId/repeatIndex never contain \x00,
      // so there is no risk of collisions that would under-count citedCount.
      acc.responseKeys.add(`${r.promptId}\x00${r.engineId}\x00${r.repeatIndex}`);
      acc.urls.add(s.url);
      acc.promptIds.add(r.promptId);
      acc.engineIds.add(r.engineId);
    }
  }

  const competitorNorms = new Set(
    competitorDomains.map((d) => normalizeDomain(d.includes('://') ? d : `https://${d}`)).filter(Boolean),
  );

  const entries: SourceMapEntry[] = Array.from(accMap.entries())
    .map(([domain, acc]) => ({
      domain,
      citedCount: acc.responseKeys.size,
      urls: Array.from(acc.urls),
      promptIds: Array.from(acc.promptIds),
      engineIds: Array.from(acc.engineIds),
      isClientDomain: domain === normalizedClient,
      isCompetitorDomain: competitorNorms.has(domain),
    }))
    .sort((a, b) => b.citedCount - a.citedCount || (a.domain < b.domain ? -1 : a.domain > b.domain ? 1 : 0));

  const clientCitedCount = entries.find((e) => e.isClientDomain)?.citedCount ?? 0;

  return {
    status: 'ok',
    data: { entries, clientCitedCount, totalResponses: responses.length },
    artifacts: [],
    usage: [],
    notes: [],
  };
}
