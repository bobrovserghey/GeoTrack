import { describe, it, expect, vi, beforeEach } from 'vitest';

const initializePaddle = vi.fn(async (options: { token: string; environment?: string }) => ({
  mocked: 'paddle-instance',
  options,
}));
vi.mock('@paddle/paddle-js', () => ({ initializePaddle }));

describe('getPaddleClient', () => {
  beforeEach(() => {
    vi.resetModules();
    initializePaddle.mockClear();
    delete process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  });

  it('initializes with environment "sandbox" for a test_ token', async () => {
    process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = 'test_abc123';
    const { getPaddleClient } = await import('../paddle-client.js');
    await getPaddleClient();
    expect(initializePaddle).toHaveBeenCalledWith({ token: 'test_abc123', environment: 'sandbox' });
  });

  it('initializes with environment "production" for a live_ token', async () => {
    process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = 'live_abc123';
    const { getPaddleClient } = await import('../paddle-client.js');
    await getPaddleClient();
    expect(initializePaddle).toHaveBeenCalledWith({ token: 'live_abc123', environment: 'production' });
  });

  it('returns undefined without calling Paddle.js when no token is configured', async () => {
    const { getPaddleClient } = await import('../paddle-client.js');
    const result = await getPaddleClient();
    expect(result).toBeUndefined();
    expect(initializePaddle).not.toHaveBeenCalled();
  });

  it('only initializes once across repeated calls', async () => {
    process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = 'test_abc123';
    const { getPaddleClient } = await import('../paddle-client.js');
    await getPaddleClient();
    await getPaddleClient();
    expect(initializePaddle).toHaveBeenCalledTimes(1);
  });

  // A failed load (ad blocker, CSP, dropped network) must not be cached
  // forever — otherwise every later buy click replays the same rejection.
  it('retries initialization after a failed attempt', async () => {
    process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = 'test_abc123';
    initializePaddle.mockRejectedValueOnce(new Error('Paddle.js blocked'));
    const { getPaddleClient } = await import('../paddle-client.js');

    await expect(getPaddleClient()).rejects.toThrow('Paddle.js blocked');

    const result = await getPaddleClient();
    expect(result).toMatchObject({ mocked: 'paddle-instance' });
    expect(initializePaddle).toHaveBeenCalledTimes(2);
  });
});
