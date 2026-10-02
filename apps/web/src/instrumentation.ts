// Next.js's official startup hook (stable since Next 15, no config flag
// needed): register() runs once per server instance, before the app starts
// serving requests, for both the Node.js and Edge runtimes — hence the
// NEXT_RUNTIME guard, since the env-var check below only makes sense once
// and uses Node APIs.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NODE_ENV !== 'production') return;

  try {
    // The import is inside the try on purpose: if it were outside and threw
    // (bad specifier, syntax error, a throwing side effect in the module),
    // register() would reject and we'd land in exactly the failure mode
    // described below — server up, 500s on every route — instead of exiting.
    const { validateWebEnv } = await import('./lib/env.js');
    validateWebEnv();
  } catch (err) {
    // A thrown instrumentation error does NOT crash the process on its own —
    // verified manually: `next start` logs it as an unhandled rejection and
    // keeps the server up, serving 500s on every route instead of refusing
    // to start. That defeats the whole point ("service does not start with
    // incomplete config"), so the process is killed explicitly here.
    //
    // Exit only once the message has actually reached stderr. When stderr is
    // a pipe (which is how Vercel/Railway/Docker capture logs) Node's writes
    // to it are asynchronous, and process.exit() does NOT flush pending async
    // writes — so `console.error(...); process.exit(1)` can truncate or lose
    // the one line the deploy-log reader gets. write()'s callback fires after
    // the flush, so the exit is deferred until then.
    //
    // Deliberately no `node:fs`/`fs` import for a synchronous writeSync, and it
    // stays that way. Today the app has no Edge entry at all (middleware.ts
    // declares `runtime: 'nodejs'`, so the build emits only
    // .next/server/instrumentation.js), but the moment one comes back — an Edge
    // middleware, an Edge route — this file gets compiled for Edge too, and
    // webpack builds its module graph statically: a dynamic import() with a
    // literal specifier is still a graph edge, so the runtime NEXT_RUNTIME guard
    // above cannot prune it. Importing fs here would then fail `next build` with
    // UnhandledSchemeError and break every deploy. process.stderr needs no
    // import.
    const message = err instanceof Error ? err.message : String(err);
    // Safety net armed BEFORE the write: if the callback never fires (stderr
    // closed/full) — or the write itself throws — the process must still
    // refuse to start rather than stay up serving traffic.
    setTimeout(() => process.exit(1), 1000);
    process.stderr.write(`${message}\n`, () => process.exit(1));
  }
}
