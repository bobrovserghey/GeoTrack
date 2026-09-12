const ALLOWED_SCHEMES = new Set(['http:', 'https:']);
const ALLOWED_PORTS = new Set([80, 443]);
const BLOCKED_RESOURCE_TYPES = new Set(['media', 'font', 'websocket']);

// IPv4: x.x.x.x — IPv6: [::] brackets
// IPv4: four octets; IPv6: contains colon (WHATWG URL strips brackets from hostname)
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

type BlockDecision = { blocked: false } | { blocked: true; reason: string };

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
