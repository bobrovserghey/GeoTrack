export type E4MachineReadableFacts = {
  measured: boolean;
  pricingPageFound: boolean;
  pricingStructured: boolean;
  openApiSpecFound: boolean;
  openApiSpecUrl: string | null;
  apiDocsFound: boolean;
  apiDocsUrl: string | null;
  productCatalogFound: boolean;
  productCatalogUrl: string | null;
};

export type E5AgentInterfaceFacts = {
  measured: boolean;
  llmsTxtFound: boolean;
  llmsTxtValid: boolean;
  agentsJsonFound: boolean;
  agentsJsonUrl: string | null;
  webMcpManifestFound: boolean;
  mcpServerFound: boolean;
};

export type MachineReadableCheckOutput = {
  e4: E4MachineReadableFacts;
  e5: E5AgentInterfaceFacts;
};
