export type IntentType = 'pricing' | 'comparison' | 'alternatives' | 'use-cases' | 'docs' | 'faq';

export type IntentPageMap = Record<IntentType, string | null>;

export type PageStructureFact = {
  url: string;
  hasAnswerFirstParagraph: boolean;
  hasQuestionHeaders: boolean;
  hasQABlocks: boolean;
  hasListsOrTables: boolean;
};

export type PageStatsFact = {
  url: string;
  wordCount: number;
  numericFactsPer1kWords: number;
  citationPatternsPer1kWords: number;
};

export type PageFreshnessFact = {
  url: string;
  lastModified: string | null;
  ageDays: number | null;
};

export type PageUrlFact = {
  url: string;
  title: string;
  h1: string;
  urlReadable: boolean;
};

export type EntityClarityFact = {
  entityMentioned: boolean;
  categoryMentioned: boolean;
  targetAudienceMentioned: boolean;
  testedText: string;
};

export type ContentCheckFacts = {
  analyzedPageCount: number;
  c1: {
    pageTypeMap: IntentPageMap;
    gapTypes: IntentType[];
  };
  c2: {
    pages: PageStructureFact[];
  };
  c3: {
    pages: PageStatsFact[];
    medianNumericFactsPer1kWords: number;
  };
  c4: {
    pages: PageFreshnessFact[];
    medianAgeDays: number | null;
  };
  c5: EntityClarityFact;
  c6: {
    pages: PageUrlFact[];
    readableUrlRatio: number;
  };
};
