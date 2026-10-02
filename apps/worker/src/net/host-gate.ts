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

/**
 * Thrown when a queued task outlives `taskTimeoutMs`. The queue slot is released
 * so one hung request (e.g. a Playwright render) cannot starve the whole host;
 * callers treat it as a degradation like any other request failure.
 */
export class HostTaskTimeoutError extends Error {
  constructor(readonly host: string, readonly timeoutMs: number) {
    super(`Host ${host}: task did not finish in ${timeoutMs}ms; queue released`);
    this.name = 'HostTaskTimeoutError';
  }
}

export type GatedFetchOptions = {
  /** Per-task ceiling before the queue slot is released. Defaults to 60000; 0 disables. */
  taskTimeoutMs?: number;
};

/** Default ceiling for one queued request or render. */
export const DEFAULT_TASK_TIMEOUT_MS = 60_000;

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

export function createGatedFetch(
  fetchFn: FetchFn,
  pauseMs: number,
  options: GatedFetchOptions = {},
): GatedFetch {
  const hosts = new Map<string, HostState>();
  const taskTimeoutMs = options.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;

  // The hung task keeps running detached — we cannot cancel an arbitrary promise —
  // but it no longer holds the host's queue.
  async function withTimeout<T>(host: string, task: () => Promise<T>): Promise<T> {
    if (taskTimeoutMs <= 0) return task();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        task(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new HostTaskTimeoutError(host, taskTimeoutMs)), taskTimeoutMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

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
      const result = await withTimeout(host, task);
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
