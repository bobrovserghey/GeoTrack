import http from 'node:http';
import { writeSync } from 'node:fs';
import { handler } from './index.js';
import { validateWorkerEnv } from './env.js';
import { wireAuditRunDeps } from './deps/wire.js';

// Written with fs.writeSync rather than console.error because every call site
// below is immediately followed by process.exit(): when stderr is a pipe (how
// Railway/Docker capture logs) Node's stderr writes are asynchronous, and
// process.exit() does not flush pending async writes, so the message can be
// truncated or lost — and it is the only diagnostic the deploy log gets.
function fatal(message: string): never {
  writeSync(2, `${message}\n`);
  process.exit(1);
}

// T-00: fail loudly before binding the port in a real deploy — Railway
// surfaces a crashing container in its deploy logs immediately, instead of
// the first Inngest webhook failing with no clear cause. Local dev
// (`pnpm dev`, NODE_ENV=development) is intentionally exempt, same as the
// web app's instrumentation.ts.
if (process.env.NODE_ENV === 'production') {
  try {
    validateWorkerEnv();
  } catch (err) {
    // A clean one-line message, not a raw stack trace: docs/specs/T-00.md
    // promises the process "падает с понятным сообщением" in the deploy log.
    fatal(err instanceof Error ? err.message : String(err));
  }
}

// T-79: connect the audit pipeline to the database before the port is bound.
// In production DATABASE_URL is required (validateWorkerEnv above), so this
// cannot silently fall back to the placeholder deps there.
if (!wireAuditRunDeps()) {
  console.warn('geotrack-worker: DATABASE_URL is not set — audit-run uses placeholder deps (development only)');
}

// `Number(process.env.PORT ?? 3000)` is not enough: ?? only guards undefined,
// so PORT="" (an empty value set in a dashboard) yields Number('') === 0, and
// listen(0) binds a random ephemeral port. The container then logs "listening
// on port 0" and Railway's healthcheck fails with nothing explaining why.
// Anything that isn't a usable port number falls back to 3000.
function resolvePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 3000;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return 3000;
  return parsed;
}

const PORT = resolvePort(process.env.PORT);

// inngest/node's serve() is typed as a plain http.RequestListener, so it can
// be composed directly with the health-check branch below rather than needing
// a framework. (At runtime it is actually async — see the thenable check
// further down, which is why the return value isn't simply ignored.)
const server = http.createServer((req, res) => {
  // Compare the parsed pathname, not the raw req.url: `/healthz/` and
  // `/healthz?x=1` are the same endpoint, and a raw string compare would fall
  // them through to the Inngest handler (which answers them with an error).
  // req.url is origin-form here, so a dummy base is only there to satisfy URL.
  let pathname = req.url ?? '/';
  try {
    pathname = new URL(pathname, 'http://localhost').pathname;
  } catch {
    // Unparseable request target — leave it as-is and let Inngest reject it.
  }

  if (pathname === '/healthz' || pathname === '/healthz/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  // An uncaught throw or rejected promise out of the Inngest handler would be
  // an uncaughtException / unhandledRejection, both fatal by default in Node
  // 22 — one malformed webhook would take the whole container down. Fail the
  // single request with a 500 instead.
  const failRequest = (err: unknown) => {
    console.error('inngest handler failed:', err);
    // Already fully responded: nothing to salvage, and destroying here would
    // tear down a healthy keep-alive socket for a request that succeeded.
    if (res.writableEnded) return;
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('internal server error');
  };

  try {
    // Duck-typed rather than `instanceof Promise`: inngest/node's serve() is
    // typed as a plain RequestListener but is in fact async, and a thenable
    // or a cross-realm promise would slip past an instanceof check, leaving
    // the rejection unhandled (fatal in Node 22).
    // Promise.resolve() rather than a cast to Promise: it adopts a real
    // promise, a bare thenable, and a cross-realm promise alike, so this
    // cannot itself throw on a thenable that has `then` but no `catch`.
    const result = handler(req, res) as unknown;
    if (result !== null && result !== undefined) {
      Promise.resolve(result).catch(failRequest);
    }
  } catch (err) {
    failRequest(err);
  }
});

// Set before the 'error' handler below needs it: server.close() flips
// server.listening to false synchronously, so without this flag an 'error'
// arriving mid-shutdown would be misread as a bind failure and exit 1, making
// an ordinary Railway redeploy look like a crash.
let shuttingDown = false;

// Without this, a bind failure (EADDRINUSE, EACCES on a privileged port)
// surfaces as an unhandled 'error' event — a stack trace and a non-obvious
// crash instead of a readable cause.
server.on('error', (err: NodeJS.ErrnoException) => {
  // Only before listen() succeeds does an 'error' mean the port could not be
  // taken — unrecoverable, so fail the container with a readable cause. Once
  // listening (or already shutting down), a server-level 'error' is a one-off
  // and must not take a healthy worker down.
  if (!server.listening && !shuttingDown) {
    fatal(`geotrack-worker failed to bind port ${PORT}: ${err.code ?? ''} ${err.message}`.trim());
  }
  console.error('geotrack-worker server error:', err);
});

// Railway sends SIGTERM on every redeploy. Without this the process dies at
// once and in-flight Inngest webhook requests are dropped mid-response;
// server.close() stops accepting new connections and lets running ones finish.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`geotrack-worker received ${signal}, shutting down`);
    server.close(() => process.exit(0));
  });
}

server.listen(PORT, () => {
  console.log(`geotrack-worker listening on port ${PORT}`);
});
