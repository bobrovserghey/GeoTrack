export type BrandPromptsStubResult = {
  status: 'ok';
  data: Record<string, unknown>;
};

export async function brandPromptsStub(_auditId: string): Promise<BrandPromptsStubResult> {
  return { status: 'ok', data: {} };
}
