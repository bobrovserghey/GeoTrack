export type ScenarioResult = {
  success: boolean;
  attempts: number;
  steps: string[];
  failurePoint: string | null;
};

export type E1AgentScenarioFacts = {
  measured: boolean;
  findPrice: ScenarioResult;
  startRegistration: ScenarioResult;
};

export type AgentScenarioCheckOutput = {
  e1: E1AgentScenarioFacts;
};
