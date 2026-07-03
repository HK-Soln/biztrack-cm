# syntax=docker/dockerfile:1

# Multi-stage build for @biztrack/api (NestJS).
#
# Build context is the repo ROOT (see api-deploy.yml `context: .`) so the pnpm
# workspace — lockfile + shared packages — is visible. We use `turbo prune` to
# reduce the monorepo to just the API and its internal deps, so this file never
# needs a hand-maintained list of @biztrack/* packages (that list rots).
#
#   builder   → turbo prune @biztrack/api --docker  (emits out/json + out/full)
#   installer → install pruned deps, copy source, build api + its workspace deps
#   runner    → minimal runtime: built output + node_modules, non-root

FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

# ---- Prune the workspace down to the API ----------------------------------
FROM base AS builder
WORKDIR /app
COPY . .
# `pnpm dlx` fetches turbo on demand — no global-bin PATH setup needed. Pinned
# to match the repo's turbo so the prune format stays in lockstep.
RUN pnpm dlx turbo@2.8.17 prune @biztrack/api --docker
# `turbo prune` copies package files but not root-level configs. apps/api's
# tsconfig extends ../../tsconfig.json, so seed it into the pruned tree —
# otherwise tsc can't find the base config and silently falls back to defaults
# (esModuleInterop off → 100+ spurious errors from shared-package .d.ts files).
RUN cp tsconfig.json out/full/tsconfig.json

# ---- Install + build ------------------------------------------------------
FROM base AS installer
WORKDIR /app
# out/json = package.json files + pruned pnpm-lock.yaml + pnpm-workspace.yaml.
# Installing from just these keeps this layer cached until a manifest changes.
COPY --from=builder /app/out/json/ ./
RUN pnpm install --frozen-lockfile
# out/full = the pruned source tree.
COPY --from=builder /app/out/full/ ./
# `build` dependsOn ^build, so turbo builds every workspace dep first, in order.
# nest-cli copies src/i18n/** into dist/i18n, so translations ship with dist.
RUN pnpm turbo run build --filter=@biztrack/api

# ---- Runtime --------------------------------------------------------------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# @biztrack/logger writes rotating log FILES when LOG_DIR is set, defaulting to
# ./logs in production. In a container, logs belong on stdout (Railway/ECS
# capture it) and ./logs isn't writable by the non-root user anyway. An empty
# LOG_DIR keeps only the JSON console transport. To persist files instead, set
# LOG_DIR to a writable, volume-mounted path.
ENV LOG_DIR=""
# Run as an unprivileged user.
RUN groupadd --gid 1001 nodejs \
  && useradd --uid 1001 --gid nodejs --shell /usr/sbin/nologin nestjs
COPY --from=installer --chown=nestjs:nodejs /app ./
USER nestjs

# API default port (config default + main.ts fallback = 3001; overridable via
# the PORT env var, which Railway/ECS inject). EXPOSE is documentation only.
EXPOSE 3001
# Entrypoint runs DB migrations (+ any release scripts) first, then execs the CMD.
ENTRYPOINT ["sh", "apps/api/scripts/docker-entrypoint.sh"]
CMD ["node", "apps/api/dist/main.js"]
