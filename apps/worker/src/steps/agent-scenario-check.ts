import type { StepResult } from '@geotrack/core';
import type {
  ScenarioResult,
  E1AgentScenarioFacts,
  AgentScenarioCheckOutput,
} from '@geotrack/core/steps/agent-scenario-check';

// ── Injectable types ─────────────────────────────────────────────────────────

export type ScenarioAttemptResult = {
  success: boolean;
  steps: string[];
  failurePoint: string | null;
};

export type RunScenarioFn = (
  origin: string,
  scenario: 'find_price' | 'start_registration',
) => Promise<ScenarioAttemptResult>;

export type AgentScenarioCheckDeps = {
  runScenario: RunScenarioFn;
};

// ── Input ────────────────────────────────────────────────────────────────────

export type AgentScenarioCheckInput = {
  origin: string;
  keyPages: string[];
};

// ── helpers ───────────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 3;

async function runWithRetries(
  origin: string,
  scenario: 'find_price' | 'start_registration',
  runScenario: RunScenarioFn,
): Promise<ScenarioResult> {
  let ran = 0;
  let lastResult: ScenarioAttemptResult | null = null;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      const result = await runScenario(origin, scenario);
      ran++;
      lastResult = result;
      if (result.success) {
        return { ...result, attempts: ran };
      }
    } catch {
      // runner threw — try again
    }
  }

  if (lastResult !== null) {
    return { ...lastResult, attempts: ran };
  }

  // all attempts threw — runner was unavailable
  return { success: false, attempts: 0, steps: [], failurePoint: 'runner unavailable' };
}

// ── E1 — agent scenarios ──────────────────────────────────────────────────────

async function collectE1(
  origin: string,
  deps: AgentScenarioCheckDeps,
): Promise<E1AgentScenarioFacts> {
  const { runScenario } = deps;

  // sequential — single Playwright context is safer for multi-step interactions
  const findPrice = await runWithRetries(origin, 'find_price', runScenario);
  const startRegistration = await runWithRetries(origin, 'start_registration', runScenario);

  const measured = findPrice.attempts > 0 || startRegistration.attempts > 0;

  return { measured, findPrice, startRegistration };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function collectAgentScenarioCheck(
  input: AgentScenarioCheckInput,
  deps: AgentScenarioCheckDeps,
): Promise<StepResult<AgentScenarioCheckOutput>> {
  const origin = input.origin.replace(/\/+$/, '');

  const e1 = await collectE1(origin, deps);

  let status: StepResult<AgentScenarioCheckOutput>['status'];
  if (!e1.measured) {
    status = 'failed';
  } else if (e1.findPrice.attempts === 0 || e1.startRegistration.attempts === 0) {
    status = 'partial';
  } else {
    status = 'ok';
  }

  return { status, data: { e1 }, artifacts: [], usage: [], notes: [] };
}
