export type ReviewPlatformKey = 'g2' | 'capterra' | 'producthunt' | 'trustpilot';

export type ReviewPlatformFact = {
  platform: ReviewPlatformKey;
  profileFound: boolean;
  profileUrl: string | null;
};

export type D1ReviewFacts = {
  measured: boolean;
  clientPlatforms: ReviewPlatformFact[];
  clientPlatformCount: number;
};

export type D2CitationFacts = {
  measured: boolean;
  citedPagesAnalyzed: number;
  pagesWithClientMention: number;
  clientPresenceRatio: number;
};

export type D4EntityFacts = {
  measured: boolean;
  linkedInFound: boolean;
  linkedInUrl: string | null;
  crunchbaseFound: boolean;
  crunchbaseUrl: string | null;
};

export type OffsiteSignalsOutput = {
  d1: D1ReviewFacts;
  d2: D2CitationFacts;
  d4: D4EntityFacts;
  serpRequestsUsed: number;
};
