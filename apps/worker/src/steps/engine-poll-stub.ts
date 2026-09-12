import type { StepResult } from '@geotrack/core';

export type EnginePollStubOutput = { mentionsFound: number; engines: string[] };

export async function enginePollStub(_auditId: string): Promise<StepResult<EnginePollStubOutput>> {
  return {
    status: 'ok',
    data: { mentionsFound: 0, engines: [] },
    artifacts: [],
    usage: [],
    notes: ['stub: no real engine poll performed'],
  };
}
