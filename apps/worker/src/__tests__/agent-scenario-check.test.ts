import { describe, it, expect } from 'vitest';
import { collectAgentScenarioCheck } from '../steps/agent-scenario-check.js';
import type {
  AgentScenarioCheckInput,
  AgentScenarioCheckDeps,
  ScenarioAttemptResult,
  RunScenarioFn,
} from '../steps/agent-scenario-check.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<AgentScenarioCheckInput> = {}): AgentScenarioCheckInput {
  return {
    origin: 'https://example.com',
    keyPages: [],
    ...overrides,
  };
}

const SUCCESS_RESULT: ScenarioAttemptResult = {
  success: true,
  steps: ['Navigated to homepage', 'Found pricing link', 'Pricing page loaded'],
  failurePoint: null,
};

const FAILURE_RESULT: ScenarioAttemptResult = {
  success: false,
  steps: ['Navigated to homepage', 'No pricing link found'],
  failurePoint: 'no pricing link in navigation',
};

function alwaysSucceeds(): RunScenarioFn {
  return async () => SUCCESS_RESULT;
}

function alwaysFails(): RunScenarioFn {
  return async () => FAILURE_RESULT;
}

function alwaysThrows(): RunScenarioFn {
  return async () => {
    throw new Error('Playwright unavailable');
  };
}

function succeedsOnAttempt(n: number): RunScenarioFn {
  let calls = 0;
  return async () => {
    calls++;
    if (calls >= n) return SUCCESS_RESULT;
    return FAILURE_RESULT;
  };
}

type ScenarioBehavior = 'success' | 'fail' | 'throw';

function perScenario(behaviors: Record<string, ScenarioBehavior>): RunScenarioFn {
  return async (_origin, scenario) => {
    const b = behaviors[scenario] ?? 'success';
    if (b === 'throw') throw new Error('runner error');
    if (b === 'success') return SUCCESS_RESULT;
    return FAILURE_RESULT;
  };
}

function makeDeps(runScenario: RunScenarioFn): AgentScenarioCheckDeps {
  return { runScenario };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('collectAgentScenarioCheck', () => {
  it('both scenarios succeed on first attempt → status ok, measured true', async () => {
    const result = await collectAgentScenarioCheck(makeInput(), makeDeps(alwaysSucceeds()));
    expect(result.status).toBe('ok');
    expect(result.data!.e1.measured).toBe(true);
    expect(result.data!.e1.findPrice.success).toBe(true);
    expect(result.data!.e1.findPrice.attempts).toBe(1);
    expect(result.data!.e1.startRegistration.success).toBe(true);
    expect(result.data!.e1.startRegistration.attempts).toBe(1);
  });

  it('find_price succeeds on 3rd attempt → attempts: 3, success: true', async () => {
    const result = await collectAgentScenarioCheck(
      makeInput(),
      makeDeps(perScenario({ find_price: 'fail', start_registration: 'success' })),
    );
    // find_price fails all 3, start_registration succeeds on 1st
    expect(result.data!.e1.findPrice.success).toBe(false);
    expect(result.data!.e1.findPrice.attempts).toBe(3);

    // now test actual 3rd-attempt success
    const result2 = await collectAgentScenarioCheck(
      makeInput(),
      makeDeps(succeedsOnAttempt(3)),
    );
    expect(result2.data!.e1.findPrice.success).toBe(true);
    expect(result2.data!.e1.findPrice.attempts).toBe(3);
  });

  it('start_registration fails all 3 attempts (no throw) → success false, attempts 3, failurePoint set', async () => {
    const result = await collectAgentScenarioCheck(
      makeInput(),
      makeDeps(perScenario({ find_price: 'success', start_registration: 'fail' })),
    );
    const sr = result.data!.e1.startRegistration;
    expect(sr.success).toBe(false);
    expect(sr.attempts).toBe(3);
    expect(sr.failurePoint).toBeTruthy();
  });

  it('both fail (no throw) → status ok, measured true, success false for both', async () => {
    const result = await collectAgentScenarioCheck(makeInput(), makeDeps(alwaysFails()));
    expect(result.status).toBe('ok');
    expect(result.data!.e1.measured).toBe(true);
    expect(result.data!.e1.findPrice.success).toBe(false);
    expect(result.data!.e1.startRegistration.success).toBe(false);
  });

  it('find_price runner throws, start_registration succeeds → status partial', async () => {
    const result = await collectAgentScenarioCheck(
      makeInput(),
      makeDeps(perScenario({ find_price: 'throw', start_registration: 'success' })),
    );
    expect(result.status).toBe('partial');
    expect(result.data!.e1.measured).toBe(true);
    expect(result.data!.e1.findPrice.attempts).toBe(0);
    expect(result.data!.e1.startRegistration.attempts).toBe(1);
    expect(result.data!.e1.startRegistration.success).toBe(true);
  });

  it('start_registration runner throws, find_price succeeds → status partial', async () => {
    const result = await collectAgentScenarioCheck(
      makeInput(),
      makeDeps(perScenario({ find_price: 'success', start_registration: 'throw' })),
    );
    expect(result.status).toBe('partial');
    expect(result.data!.e1.findPrice.attempts).toBe(1);
    expect(result.data!.e1.startRegistration.attempts).toBe(0);
  });

  it('both runners throw → status failed, measured false', async () => {
    const result = await collectAgentScenarioCheck(makeInput(), makeDeps(alwaysThrows()));
    expect(result.status).toBe('failed');
    expect(result.data!.e1.measured).toBe(false);
    expect(result.data!.e1.findPrice.attempts).toBe(0);
    expect(result.data!.e1.findPrice.failurePoint).toBe('runner unavailable');
    expect(result.data!.e1.startRegistration.attempts).toBe(0);
    expect(result.data!.e1.startRegistration.failurePoint).toBe('runner unavailable');
  });

  it('steps from successful attempt are recorded', async () => {
    const result = await collectAgentScenarioCheck(makeInput(), makeDeps(alwaysSucceeds()));
    expect(result.data!.e1.findPrice.steps).toEqual(SUCCESS_RESULT.steps);
    expect(result.data!.e1.findPrice.steps.length).toBeGreaterThan(0);
  });

  it('steps from last failed attempt are recorded when all fail', async () => {
    const result = await collectAgentScenarioCheck(makeInput(), makeDeps(alwaysFails()));
    expect(result.data!.e1.findPrice.steps).toEqual(FAILURE_RESULT.steps);
    expect(result.data!.e1.findPrice.steps.length).toBeGreaterThan(0);
  });

  it('trailing slash in origin is stripped', async () => {
    let capturedOrigin: string | null = null;
    const spy: RunScenarioFn = async (origin) => {
      capturedOrigin = origin;
      return SUCCESS_RESULT;
    };
    await collectAgentScenarioCheck(makeInput({ origin: 'https://example.com/' }), makeDeps(spy));
    expect(capturedOrigin).toBe('https://example.com');
  });
});
