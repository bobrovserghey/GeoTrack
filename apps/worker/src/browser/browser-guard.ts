const ALLOWED_SCHEMES = new Set(['http:', 'https:']);
const ALLOWED_PORTS = new Set([80, 443]);
const BLOCKED_RESOURCE_TYPES = new Set(['media', 'font', 'websocket']);

// IPv4: x.x.x.x — IPv6: [::] brackets
// IPv4: four octets; IPv6: contains colon (WHATWG URL strips brackets from hostname)
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

export type BlockDecision = { blocked: false } | { blocked: true; reason: string };

function isIpLiteral(hostname: string): boolean {
  return IPV4_RE.test(hostname) || hostname.includes(':');
}

export function shouldBlockRequest(rawUrl: string, resourceType: string): BlockDecision {
  if (BLOCKED_RESOURCE_TYPES.has(resourceType)) {
    return { blocked: true, reason: `resource type blocked: ${resourceType}` };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { blocked: true, reason: `invalid URL: ${rawUrl}` };
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return { blocked: true, reason: `scheme not allowed: ${parsed.protocol}` };
  }

  if (isIpLiteral(parsed.hostname)) {
    return { blocked: true, reason: `IP literal in host: ${parsed.hostname}` };
  }

  const portStr = parsed.port;
  if (portStr !== '') {
    const port = parseInt(portStr, 10);
    if (!ALLOWED_PORTS.has(port)) {
      return { blocked: true, reason: `port not allowed: ${port}` };
    }
  }

  return { blocked: false };
}

// ADR-025 amendment: the internal PDF-render context only ever navigates to
// one code-configured internal origin (never an arbitrary user-supplied
// site), so the port-allowlist and IP-literal checks above don't apply to it
// — both are SSRF-shaped rules that assume the target is untrusted, and they
// would otherwise block completely ordinary deployments (localhost:3000 in
// dev, a container's internal hostname on a non-80/443 port). Any request to
// a DIFFERENT origin is blocked outright rather than subjected to the
// external-site rules: this context has no legitimate reason to reach
// anywhere else.
export function shouldBlockInternalRequest(
  rawUrl: string,
  resourceType: string,
  allowedOrigin: string,
): BlockDecision {
  if (BLOCKED_RESOURCE_TYPES.has(resourceType)) {
    return { blocked: true, reason: `resource type blocked: ${resourceType}` };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { blocked: true, reason: `invalid URL: ${rawUrl}` };
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return { blocked: true, reason: `scheme not allowed: ${parsed.protocol}` };
  }

  if (parsed.origin !== allowedOrigin) {
    return { blocked: true, reason: `origin not allowed: ${parsed.origin}` };
  }

  return { blocked: false };
}
