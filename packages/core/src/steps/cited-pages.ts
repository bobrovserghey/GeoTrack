import type { PageStructureFact, PageStatsFact, PageFreshnessFact } from './content-check.js';

export type { PageStructureFact, PageStatsFact, PageFreshnessFact };

export type CitedPageFact = {
  url: string;
  domain: string;
  citedCount: number;
  structure: PageStructureFact;
  stats: PageStatsFact;
  freshness: PageFreshnessFact;
  mentionsClient: boolean;
  mentionedCompetitors: string[];
};

export type CitedPagesOutput = {
  analyzedPageCount: number;
  pages: CitedPageFact[];
  medianHasAnswerFirstParagraphRatio: number;
  medianHasListsOrTablesRatio: number;
  medianNumericFactsPer1kWords: number;
  medianAgeDays: number | null;
  pagesWithClientMentionCount: number;
};
