import { describe, it, expect, vi } from 'vitest';
import { createSafeFetch, SafeFetchError, type SafeFetchOptions } from '../net/safe-fetch.js';

const PUBLIC_IP = '93.184.216.34';
const PRIVATE_IP = '192.168.1.1';
const METADATA_IP = '169.254.169.254';

function makeFetch(opts: SafeFetchOptions) {
  return createSafeFetch({ domainPauseMs: 0, ...opts });
}

function makeResolver(ips: string[]) {
  return vi.fn().mockResolvedValue(ips);
}

function makeOkFetch(body = 'hello', status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(body, { status, headers: { 'Content-Type': 'text/html' } }),
  );
}

describe('createSafeFetch — IP blocking', () => {
  it('blocks request when resolver returns a private IPv4', async () => {
    const fetch = makeFetch({ resolver: makeResolver([PRIVATE_IP]), fetch: makeOkFetch() });
    await expect(fetch('https://example.com/')).rejects.toThrow(SafeFetchError);
  });

  it('blocks when resolver returns multiple IPs and one is private', async () => {
    const fetch = makeFetch({ resolver: makeResolver([PUBLIC_IP, PRIVATE_IP]), fetch: makeOkFetch() });
    await expect(fetch('https://example.com/')).rejects.toThrow(SafeFetchError);
  });

  it('blocks IPv4-mapped IPv6 private address', async () => {
    const fetch = makeFetch({ resolver: makeResolver(['::ffff:192.168.1.1']), fetch: makeOkFetch() });
    await expect(fetch('https://example.com/')).rejects.toThrow(SafeFetchError);
  });

  it('blocks metadata endpoint (169.254.169.254)', async () => {
    const fetch = makeFetch({ resolver: makeResolver([METADATA_IP]), fetch: makeOkFetch() });
    await expect(fetch('https://example.com/')).rejects.toThrow(SafeFetchError);
  });

  it('allows request when resolver returns a public IP', async () => {
    const mockFetch = makeOkFetch();
    const fetch = makeFetch({ resolver: makeResolver([PUBLIC_IP]), fetch: mockFetch });
    const res = await fetch('https://example.com/');
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledOnce();
  });
});

describe('createSafeFetch — scheme and port', () => {
  it('blocks non-http/https schemes', async () => {
    const fetch = makeFetch({ resolver: makeResolver([PUBLIC_IP]), fetch: makeOkFetch() });
    await expect(fetch('ftp://example.com/')).rejects.toThrow(SafeFetchError);
    await expect(fetch('file:///etc/passwd')).rejects.toThrow(SafeFetchError);
  });

  it('blocks port 8080', async () => {
    const fetch = makeFetch({ resolver: makeResolver([PUBLIC_IP]), fetch: makeOkFetch() });
    await expect(fetch('https://example.com:8080/')).rejects.toThrow(SafeFetchError);
  });

  it('allows default http port 80', async () => {
    const mockFetch = makeOkFetch();
    const fetch = makeFetch({ resolver: makeResolver([PUBLIC_IP]), fetch: mockFetch });
    await expect(fetch('http://example.com/')).resolves.toBeDefined();
  });

  it('allows default https port 443', async () => {
    const mockFetch = makeOkFetch();
    const fetch = makeFetch({ resolver: makeResolver([PUBLIC_IP]), fetch: mockFetch });
    await expect(fetch('https://example.com:443/')).resolves.toBeDefined();
  });
});

describe('createSafeFetch — redirects', () => {
  it('blocks redirect from public to private IP', async () => {
    const resolver = vi.fn()
      .mockResolvedValueOnce([PUBLIC_IP])
      .mockResolvedValueOnce([PRIVATE_IP]);
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(null, { status: 301, headers: { Location: 'https://internal.example.com/' } }),
    );
    const fetch = makeFetch({ resolver, fetch: mockFetch });
    await expect(fetch('https://example.com/')).rejects.toThrow(SafeFetchError);
  });

  it('follows up to 5 redirects', async () => {
    const resolver = makeResolver([PUBLIC_IP]);
    let call = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      call++;
      if (call <= 5)
        return Promise.resolve(new Response(null, { status: 301, headers: { Location: 'https://example.com/next' } }));
      return Promise.resolve(new Response('final', { status: 200 }));
    });
    const fetch = makeFetch({ resolver, fetch: mockFetch });
    const res = await fetch('https://example.com/');
    expect(res.status).toBe(200);
    expect(call).toBe(6);
  });

  it('blocks on the 6th redirect', async () => {
    const resolver = makeResolver([PUBLIC_IP]);
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 301, headers: { Location: 'https://example.com/loop' } }),
    );
    const fetch = makeFetch({ resolver, fetch: mockFetch });
    await expect(fetch('https://example.com/')).rejects.toThrow(SafeFetchError);
  });
});

describe('createSafeFetch — body size', () => {
  it('rejects bodies larger than maxBodyBytes', async () => {
    const big = 'x'.repeat(2 * 1024 * 1024 + 1);
    const mockFetch = vi.fn().mockResolvedValue(new Response(big, { status: 200 }));
    const fetch = makeFetch({ resolver: makeResolver([PUBLIC_IP]), fetch: mockFetch, maxBodyBytes: 2 * 1024 * 1024 });
    await expect(fetch('https://example.com/')).rejects.toThrow(SafeFetchError);
  });

  it('accepts bodies within maxBodyBytes', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('x'.repeat(100), { status: 200 }));
    const fetch = makeFetch({ resolver: makeResolver([PUBLIC_IP]), fetch: mockFetch, maxBodyBytes: 2 * 1024 * 1024 });
    const res = await fetch('https://example.com/');
    expect(res.status).toBe(200);
  });
});
