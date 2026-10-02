// Per-host request serialization on top of an injected fetch. safe-fetch's own
// domain pause reads its "last request" timestamp before awaiting, so it cannot
// space concurrent requests; serializing here is what makes that pause (and ours)
// hold. safe-fetch itself is protected (ADR-015) and is not touched.

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** Thrown for requests refused because the host already answered 429. */
export class HostHaltedError extends Error {
  constructor(readonly host: string) {
    super(`Host ${host} asked to stop (429); request skipped`);
    this.name = 'HostHaltedError';
  }
}

type HostState = { tail: Promise<void>; lastEndMs: number | null; halted: boolean };

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export type TimedResponse = { res: Response; elapsedMs: number };

export type GatedFetch = {
  fetch: FetchFn;
  /** Same request, plus time spent inside fetchFn only (queue wait and pause excluded). */
  timed: (url: string, init?: RequestInit) => Promise<TimedResponse>;
  /** Runs a non-fetch task (e.g. a Playwright page load) in the host's queue. */
  run: <T>(host: string, task: () => Promise<T>) => Promise<T>;
};

export function createGatedFetch(fetchFn: FetchFn, pauseMs: number): GatedFetch {
  const hosts = new Map<string, HostState>();

  async function schedule<T>(
    host: string,
    task: () => Promise<T>,
    haltsHost: (result: T) => boolean,
  ): Promise<T> {
    let state = hosts.get(host);
    if (!state) {
      state = { tail: Promise.resolve(), lastEndMs: null, halted: false };
      hosts.set(host, state);
    }
    const previous = state.tail;
    let release!: () => void;
    state.tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      if (state.halted) throw new HostHaltedError(host);
      if (state.lastEndMs !== null) {
        const wait = pauseMs - (Date.now() - state.lastEndMs);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      }
      const result = await task();
      if (haltsHost(result)) state.halted = true;
      return result;
    } finally {
      state.lastEndMs = Date.now();
      release();
    }
  }

  const timed = (url: string, init?: RequestInit): Promise<TimedResponse> =>
    schedule(
      hostOf(url),
      async () => {
        const start = Date.now();
        const res = await fetchFn(url, init);
        return { res, elapsedMs: Date.now() - start };
      },
      (r) => r.res.status === 429,
    );

  return {
    fetch: async (url, init) => (await timed(url, init)).res,
    timed,
    run: (host, task) => schedule(host, task, () => false),
  };
}
