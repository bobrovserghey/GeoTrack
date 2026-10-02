import { describe, it, expect, vi } from 'vitest';
import { createGatedFetch, HostHaltedError, HostTaskTimeoutError } from '../net/host-gate.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('createGatedFetch', () => {
  it('runs same-host requests one at a time, in call order', async () => {
    const order: string[] = [];
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      order.push(`start ${url}`);
      await sleep(10);
      order.push(`end ${url}`);
      return new Response('ok');
    });
    const gate = createGatedFetch(fetchFn, 0);
    await Promise.all([gate.fetch('https://a.test/1'), gate.fetch('https://a.test/2')]);
    expect(order).toEqual([
      'start https://a.test/1',
      'end https://a.test/1',
      'start https://a.test/2',
      'end https://a.test/2',
    ]);
  });

  it('waits the pause after the previous request finished', async () => {
    const times: number[] = [];
    const fetchFn = vi.fn().mockImplementation(async () => {
      times.push(Date.now());
      return new Response('ok');
    });
    const gate = createGatedFetch(fetchFn, 50);
    await Promise.all([gate.fetch('https://a.test/1'), gate.fetch('https://a.test/2')]);
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(45);
  });

  it('different hosts run in parallel', async () => {
    let inFlight = 0;
    let max = 0;
    const fetchFn = vi.fn().mockImplementation(async () => {
      inFlight++;
      max = Math.max(max, inFlight);
      await sleep(10);
      inFlight--;
      return new Response('ok');
    });
    const gate = createGatedFetch(fetchFn, 0);
    await Promise.all([gate.fetch('https://a.test/'), gate.fetch('https://b.test/')]);
    expect(max).toBe(2);
  });

  it('after a 429 queued and later requests to that host are rejected without calling fetch', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('no', { status: 429 }));
    const gate = createGatedFetch(fetchFn, 0);
    const results = await Promise.allSettled([
      gate.fetch('https://a.test/1'),
      gate.fetch('https://a.test/2'),
    ]);
    expect(results[0]!.status).toBe('fulfilled');
    expect(results[1]!.status).toBe('rejected');
    expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(HostHaltedError);
    await expect(gate.fetch('https://a.test/3')).rejects.toBeInstanceOf(HostHaltedError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('a 429 on one host does not stop another', async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) =>
      new Response('x', { status: url.includes('a.test') ? 429 : 200 }),
    );
    const gate = createGatedFetch(fetchFn, 0);
    await gate.fetch('https://a.test/');
    const res = await gate.fetch('https://b.test/');
    expect(res.status).toBe(200);
  });

  it('a thrown error does not block the queue', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(new Response('ok'));
    const gate = createGatedFetch(fetchFn, 0);
    const [first, second] = await Promise.allSettled([
      gate.fetch('https://a.test/1'),
      gate.fetch('https://a.test/2'),
    ]);
    expect(first.status).toBe('rejected');
    expect(second.status).toBe('fulfilled');
  });

  it('timed() reports time inside fetch only, not queue wait or pause', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => {
      await sleep(10);
      return new Response('ok');
    });
    const gate = createGatedFetch(fetchFn, 60);
    const [, second] = await Promise.all([gate.timed('https://a.test/1'), gate.timed('https://a.test/2')]);
    expect(second.elapsedMs).toBeLessThan(50);
  });

  it('a hung task releases the queue after taskTimeoutMs instead of starving the host', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('ok'));
    const gate = createGatedFetch(fetchFn, 0, { taskTimeoutMs: 20 });
    const hung = gate.run('a.test', () => new Promise<void>(() => {}));
    await expect(hung).rejects.toBeInstanceOf(HostTaskTimeoutError);
    const res = await gate.fetch('https://a.test/x');
    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('a hung fetch also times out and does not halt the host', async () => {
    const fetchFn = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Response>(() => {}))
      .mockResolvedValue(new Response('ok'));
    const gate = createGatedFetch(fetchFn, 0, { taskTimeoutMs: 20 });
    const [first, second] = await Promise.allSettled([
      gate.fetch('https://a.test/1'),
      gate.fetch('https://a.test/2'),
    ]);
    expect(first.status).toBe('rejected');
    expect((first as PromiseRejectedResult).reason).toBeInstanceOf(HostTaskTimeoutError);
    expect(second.status).toBe('fulfilled');
  });

  it('a task finishing before the timeout is unaffected', async () => {
    const gate = createGatedFetch(vi.fn().mockResolvedValue(new Response('ok')), 0, {
      taskTimeoutMs: 1000,
    });
    await expect(gate.run('a.test', async () => 'done')).resolves.toBe('done');
  });

  it('run() queues arbitrary tasks with the host and honours a halt', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('no', { status: 429 }));
    const gate = createGatedFetch(fetchFn, 0);
    await gate.fetch('https://a.test/');
    const task = vi.fn().mockResolvedValue(1);
    await expect(gate.run('a.test', task)).rejects.toBeInstanceOf(HostHaltedError);
    expect(task).not.toHaveBeenCalled();
  });
});
