export type StepKeyInput = {
  auditId: string;
  stepName: string;
  stepVersion: string;
};

export function makeStepKey({ auditId, stepName, stepVersion }: StepKeyInput): string {
  return `${auditId}:${stepName}:${stepVersion}`;
}
