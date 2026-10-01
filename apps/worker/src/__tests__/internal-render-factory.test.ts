import { describe, it, expect, vi, beforeEach } from 'vitest';

// chromium is mocked so "rejects before launching a browser" is an actual
// assertion rather than an accident of Playwright's browsers not being
// installed in CI. Without the mock, a regression that moved validation after
// launch() would still fail the test, but for the wrong reason ("Executable
// doesn't exist"), and would start passing the moment browsers got installed.
const launch = vi.fn(async () => {
  throw new Error('chromium.launch() must not be reached for an invalid baseUrl');
});
vi.mock('playwright', () => ({ chromium: { launch } }));

const { createInternalRenderContext } = await import('../browser/internal-render-factory.js');

describe('createInternalRenderContext — baseUrl validation', () => {
  beforeEach(() => {
    launch.mockClear();
  });

  it('rejects an unparseable baseUrl before launching a browser', async () => {
    await expect(
      createInternalRenderContext({ serviceKey: 'k', baseUrl: 'not a url' }),
    ).rejects.toThrow(/not a valid URL/);
    expect(launch).not.toHaveBeenCalled();
  });

  // The important one: new URL('localhost:3000') does NOT throw, it parses as
  // scheme 'localhost:' with an opaque origin. Without an explicit scheme check
  // this would silently block every request instead of reporting bad config.
  it('rejects a schemeless baseUrl that new URL() would happily parse', async () => {
    await expect(
      createInternalRenderContext({ serviceKey: 'k', baseUrl: 'localhost:3000' }),
    ).rejects.toThrow(/must be http\(s\)/);
    expect(launch).not.toHaveBeenCalled();
  });

  it('rejects a non-http(s) scheme before launching a browser', async () => {
    await expect(
      createInternalRenderContext({ serviceKey: 'k', baseUrl: 'file:///etc/passwd' }),
    ).rejects.toThrow(/must be http\(s\)/);
    await expect(
      createInternalRenderContext({ serviceKey: 'k', baseUrl: 'ftp://geotrack.internal' }),
    ).rejects.toThrow(/must be http\(s\)/);
    expect(launch).not.toHaveBeenCalled();
  });

  it('does not leak the service key in the thrown message', async () => {
    await expect(
      createInternalRenderContext({ serviceKey: 'super-secret', baseUrl: 'not a url' }),
    ).rejects.toThrow(/^(?!.*super-secret).*$/s);
  });

  // The error text reaches the step's `notes`, which are logged and persisted.
  // A misconfigured baseUrl carrying credentials must not be echoed there.
  it('does not leak credentials or query from a misconfigured baseUrl', async () => {
    await expect(
      createInternalRenderContext({ serviceKey: 'k', baseUrl: 'postgres://dbuser:dbpass@db.internal/geotrack' }),
    ).rejects.toThrow(/^(?!.*dbpass).*$/s);
    await expect(
      createInternalRenderContext({ serviceKey: 'k', baseUrl: 'ftp://host/x?apikey=leaky-value' }),
    ).rejects.toThrow(/^(?!.*leaky-value).*$/s);
  });
});
