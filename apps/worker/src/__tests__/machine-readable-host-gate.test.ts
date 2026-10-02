import { describe, it, expect, vi } from 'vitest';
import { collectMachineReadableCheck } from '../steps/machine-readable-check.js';

const input = { origin: 'https://example.com', keyPages: [] as string[] };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const notFound = () => new Response('', { status: 404 });

describe('collectMachineReadableCheck — host gate and status', () => {
  it('E4 and E5 never hit the same host concurrently', async () => {
    let inFlight = 0;
    let max = 0;
    const fetchFn = vi.fn().mockImplementation(async () => {
      inFlight++;
      max = Math.max(max, inFlight);
      await sleep(2);
      inFlight--;
      return notFound();
    });
    await collectMachineReadableCheck(input, { fetchFn });
    expect(max).toBe(1);
  });

  it('status ok when every probe gets a definite answer (404 is an answer)', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => notFound());
    const result = await collectMachineReadableCheck(input, { fetchFn });
    expect(result.status).toBe('ok');
  });

  it('status partial when a probe fails with a network error', async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/llms.txt')) throw new Error('ECONNRESET');
      return notFound();
    });
    const result = await collectMachineReadableCheck(input, { fetchFn });
    expect(result.status).toBe('partial');
    expect(result.notes.some((n) => n.includes('/llms.txt'))).toBe(true);
  });

  it('a 429 stops the remaining probes to that host and marks the result partial', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => new Response('slow down', { status: 429 }));
    const result = await collectMachineReadableCheck(input, { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('partial');
  });

  it('a halted host produces one counted note, not one per skipped probe', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => new Response('slow down', { status: 429 }));
    const result = await collectMachineReadableCheck(input, { fetchFn });
    const degradedNotes = result.notes.filter((n) => n.startsWith('degraded:'));
    expect(new Set(degradedNotes).size).toBe(degradedNotes.length);
    expect(degradedNotes.length).toBeLessThanOrEqual(3);
    const skipped = degradedNotes.find((n) => n.includes('host halted'));
    expect(skipped).toMatch(/\(x\d+\)/); // all remaining probes counted in one note
  });

  it('a 5xx is not a definite "absent" answer', async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) =>
      url.endsWith('/llms.txt') ? new Response('', { status: 503 }) : notFound(),
    );
    const result = await collectMachineReadableCheck(input, { fetchFn });
    expect(result.status).toBe('partial');
  });
});
