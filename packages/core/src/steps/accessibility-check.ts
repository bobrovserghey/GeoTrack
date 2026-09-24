export type AxeViolation = {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  nodeCount: number;
};

export type E2AccessibilityFacts = {
  measured: boolean;
  pagesAudited: number;
  criticalCount: number;
  seriousCount: number;
  moderateCount: number;
  minorCount: number;
  violations: AxeViolation[];
};

export type E3BarrierFacts = {
  measured: boolean;
  captchaDetected: boolean;
  captchaType: string | null;
  antibotWallDetected: boolean;
  jsOnlyContent: boolean;
  blockingPopupDetected: boolean;
};

export type AccessibilityCheckOutput = {
  e2: E2AccessibilityFacts;
  e3: E3BarrierFacts;
};
