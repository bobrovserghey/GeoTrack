import { resolve4, resolve6 } from 'node:dns/promises';
import { Agent, fetch as undiciFetch } from 'undici';
import { isBlockedIp } from './ip-check.js';

export { isBlockedIp } from './ip-check.js';

export class SafeFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafeFetchError';
  }
}

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);
const ALLOWED_PORTS = new Set([80, 443, '']);
const MAX_REDIRECTS = 5;
const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;
const DEFAULT_DOMAIN_PAUSE_MS = 1000;

type Resolver = (hostname: string) => Promise<string[]>;
type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

async function defaultResolver(hostname: string): Promise<string[]> {
  const results = await Promise.allSettled([resolve4(hostname), resolve6(hostname)]);
  const ips: string[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') ips.push(...r.value);
  }
  if (ips.length === 0) throw new SafeFetchError(`DNS resolution failed for: ${hostname}`);
  return ips;
}

function defaultFetch(pinnedIp: string, hostname: string): FetchFn {
  const family = pinnedIp.includes(':') ? 6 : 4;
  const agent = new Agent({
    connect: {
      lookup(_host, _opts, cb) {
        cb(null, pinnedIp, family as 4 | 6);
      },
    },
  });
  return (url, init) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (undiciFetch as any)(url, {
      ...init,
      dispatcher: agent,
      headers: { ...(init.headers as Record<string, string>), Host: hostname },
      redirect: 'manual',
    }) as Promise<Response>;
}

export type SafeFetchOptions = {
  resolver?: Resolver;
  fetch?: FetchFn;
  maxBodyBytes?: number;
  domainPauseMs?: number;
};

export type SafeFetchFn = (url: string | URL, init?: RequestInit) => Promise<Response>;

function makePause(pauseMs: number) {
  const lastRequestMs = new Map<string, number>();
  return async (hostname: string) => {
    const last = lastRequestMs.get(hostname) ?? 0;
    const wait = pauseMs - (Date.now() - last);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestMs.set(hostname, Date.now());
  };
}

async function resolveAndCheck(hostname: string, resolver: Resolver): Promise<string> {
  const ips = await resolver(hostname);
  for (const ip of ips) {
    if (isBlockedIp(ip)) throw new SafeFetchError(`Blocked IP resolved for ${hostname}: ${ip}`);
  }
  const first = ips[0];
  if (!first) throw new SafeFetchError(`No addresses for ${hostname}`);
  return first;
}

type ResolvedOptions = Required<Omit<SafeFetchOptions, 'domainPauseMs'>> & {
  pauseIfNeeded: (hostname: string) => Promise<void>;
};

async function doFetch(
  url: string,
  init: RequestInit,
  redirectsLeft: number,
  options: ResolvedOptions,
): Promise<Response> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SafeFetchError(`Invalid URL: ${url}`);
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new SafeFetchError(`Scheme not allowed: ${parsed.protocol}`);
  }

  const portStr = parsed.port;
  const effectivePort = portStr === '' ? (parsed.protocol === 'https:' ? 443 : 80) : parseInt(portStr, 10);
  if (!ALLOWED_PORTS.has(portStr) && effectivePort !== 80 && effectivePort !== 443) {
    throw new SafeFetchError(`Port not allowed: ${effectivePort}`);
  }

  const pinnedIp = await resolveAndCheck(parsed.hostname, options.resolver);
  await options.pauseIfNeeded(parsed.hostname);

  const fetchFn = options.fetch ?? defaultFetch(pinnedIp, parsed.hostname);
  const res = await fetchFn(url, { ...init, redirect: 'manual' });

  if (res.status >= 300 && res.status < 400) {
    if (redirectsLeft === 0) throw new SafeFetchError('Too many redirects');
    const location = res.headers.get('Location');
    if (!location) throw new SafeFetchError('Redirect with no Location header');
    const nextUrl = new URL(location, url).toString();
    return doFetch(nextUrl, { method: 'GET' }, redirectsLeft - 1, options);
  }

  const contentLength = res.headers.get('Content-Length');
  if (contentLength && parseInt(contentLength, 10) > options.maxBodyBytes) {
    throw new SafeFetchError(`Response body too large: ${contentLength} bytes`);
  }

  const blob = await res.blob();
  if (blob.size > options.maxBodyBytes) {
    throw new SafeFetchError(`Response body too large: ${blob.size} bytes`);
  }

  return new Response(blob, { status: res.status, headers: res.headers });
}

export function createSafeFetch(options: SafeFetchOptions = {}): SafeFetchFn {
  const pauseIfNeeded = makePause(options.domainPauseMs ?? DEFAULT_DOMAIN_PAUSE_MS);
  const resolved: ResolvedOptions = {
    resolver: options.resolver ?? defaultResolver,
    fetch: options.fetch ?? (null as unknown as FetchFn),
    maxBodyBytes: options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
    pauseIfNeeded,
  };

  return (url, init = {}) =>
    doFetch(typeof url === 'string' ? url : url.toString(), init, MAX_REDIRECTS, resolved);
}

export const safeFetch = createSafeFetch();
