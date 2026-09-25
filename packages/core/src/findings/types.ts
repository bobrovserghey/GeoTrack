import type { TechCheckFacts } from '../steps/tech-check.js';
import type { ExtractMentionsOutput } from '../steps/extract-mentions.js';
import type { ContentCheckFacts } from '../steps/content-check.js';
import type { OffsiteSignalsOutput } from '../steps/offsite-signals.js';
import type { AccessibilityCheckOutput } from '../steps/accessibility-check.js';
import type { MachineReadableCheckOutput } from '../steps/machine-readable-check.js';
import type { AgentScenarioCheckOutput } from '../steps/agent-scenario-check.js';

export type FindingImpact = 'critical' | 'warning' | 'notice';

export type Evidence =
  | { type: 'code'; caption: string; text: string }
  | { type: 'text'; caption: string; text: string }
  | { type: 'table'; caption: string; headers: string[]; rows: string[][] };

export type Finding = {
  id: string;
  criterionId: string;
  pillar: 'A' | 'B' | 'C' | 'D' | 'E';
  title: string;
  description: string;
  impact: FindingImpact;
  /** Negative number: lost overall score (0–10) due to this issue. */
  expectedScoreDelta: number;
  effortHours: number;
  /** Higher = more important. Formula: |expectedScoreDelta| / effortHours */
  priority: number;
  evidence: Evidence | null;
  howToFix: string;
};

export type FindingsFacts = {
  techCheck: TechCheckFacts | null;
  mentions: ExtractMentionsOutput | null;
  content: ContentCheckFacts | null;
  offsite: OffsiteSignalsOutput | null;
  accessibility: AccessibilityCheckOutput | null;
  machineReadable: MachineReadableCheckOutput | null;
  agentScenarios: AgentScenarioCheckOutput | null;
};

export type FindingsScores = {
  pillarScores: Record<'A' | 'B' | 'C' | 'D' | 'E', number>;
  overallScore: number;
};

export type FindingTemplate = {
  id: string;
  criterionId: string;
  pillar: 'A' | 'B' | 'C' | 'D' | 'E';
  impact: FindingImpact;
  /** Max loss to overall score (0–10) when criterion score is 0. */
  maxDelta: number;
  effortHours: number;
  title: string;
  description: string;
  howToFix: string;
  condition: (facts: FindingsFacts) => boolean;
  buildEvidence: ((facts: FindingsFacts) => Evidence | null) | null;
};
