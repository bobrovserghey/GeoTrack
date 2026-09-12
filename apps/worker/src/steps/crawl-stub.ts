import type { StepResult } from '@geotrack/core';

export type CrawlStubOutput = { pagesFound: number };

export async function crawlStub(_auditId: string): Promise<StepResult<CrawlStubOutput>> {
  return {
    status: 'ok',
    data: { pagesFound: 0 },
    artifacts: [],
    usage: [],
    notes: ['stub: no real crawl performed'],
  };
}
