# syntax=docker/dockerfile:1
#
# Build context: repo root (see railway.json). pnpm resolves `workspace:*`
# dependencies across the whole monorepo, so this Dockerfile needs the full
# repo, not just apps/worker — see docs/specs/T-00.md. apps/worker declares
# two direct workspace deps (@geotrack/core, @geotrack/db); @geotrack/config
# is pulled in transitively through @geotrack/core, not declared here.
# See also /.dockerignore — without it this COPY would drag in host
# node_modules (wrong-platform binaries) and any .env files.

FROM node:22 AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile

# `pnpm deploy` (pnpm's own command, distinct from npm/yarn) produces a
# self-contained, pruned install of a single workspace package: its own
# files plus only the production dependencies it actually needs, with
# `workspace:*` deps copied in as real files instead of symlinks. This is
# pnpm's documented way to build a single-service image from a monorepo.
RUN pnpm --filter geotrack-worker deploy --prod /deploy/worker

FROM node:22 AS runtime
WORKDIR /app
COPY --from=build /deploy/worker ./

# Playwright's own CLI installs the Chromium build matching the installed
# playwright package version, plus the system libraries it needs — safer
# than pinning a Docker base-image tag that could drift from package.json.
RUN npx playwright install --with-deps chromium

ENV NODE_ENV=production
EXPOSE 3000

# Not `node --experimental-strip-types`: Node's native type-stripping requires
# relative import specifiers to carry the real .ts extension (its docs say so
# explicitly), but this whole monorepo writes `.js` in relative imports by
# TypeScript's own NodeNext/bundler convention (actual files are .ts). Vitest
# and Next.js both resolve that happily through their own bundler-based
# loaders; plain `node` does not — confirmed on pre-existing code, not just
# new code: `pnpm test:eval`'s 6 eval scripts fail the same way. (The repo's
# other strip-types script, `prompts:generate-categories`, is NOT affected —
# it imports only Node builtins and no relative `.js` specifier. See
# docs/specs/debt.md.) `tsx` is a `dependency` (not `devDependency`) of
# apps/worker specifically so it ships in this image.
#
# Invoked via node_modules/.bin rather than `npx`: `pnpm deploy` produces that
# bin, and npx would otherwise be willing to reach for the registry at
# container start if the binary were ever missing. Keep in sync with the
# `start` script in apps/worker/package.json.
CMD ["./node_modules/.bin/tsx", "src/server.ts"]
