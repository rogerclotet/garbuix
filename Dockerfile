# syntax=docker/dockerfile:1
FROM node:25.2-slim AS base

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@11.25.0

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS builder

COPY . .
ARG SENTRY_RELEASE
ARG VITE_SENTRY_DSN
ARG SENTRY_URL
ARG SENTRY_ORG
ARG SENTRY_PROJECT
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN pnpm build

FROM base AS dev

ENV NODE_ENV=development

FROM base AS production

ENV NODE_ENV=production
# Dependencies are verified in the deps stage; do not reinstall at startup.
ENV pnpm_config_verify_deps_before_run=false

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json drizzle.config.ts ./
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY src ./src
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.output ./.output
# CLI jobs use the same instrumentation and release as the web server.
COPY --from=builder /app/.output/server/instrument.server.mjs /app/.output/server/sentry-privacy.ts /app/.output/server/version.json ./
COPY --from=builder /app/src/data/catalan-words.json ./src/data/catalan-words.json
COPY --from=builder /app/src/data/catalan-guess-words.json ./src/data/catalan-guess-words.json
COPY --from=builder /app/src/data/catalan-syllables.json ./src/data/catalan-syllables.json
COPY --from=builder /app/src/data/catalan-syllable-words.json ./src/data/catalan-syllable-words.json

EXPOSE 3000

# deploy-compose.sh migrates once before starting either writer.
# Launch Node directly to avoid package-manager overhead during the switchover.
CMD ["node", "--env-file-if-exists=.env", "--import", "./.output/server/instrument.server.mjs", ".output/server/index.mjs"]

FROM alpine AS supercronic-download
ARG SUPERCRONIC_VERSION=0.2.49
ARG TARGETARCH
RUN wget -O /supercronic \
    "https://github.com/aptible/supercronic/releases/download/v${SUPERCRONIC_VERSION}/supercronic-linux-${TARGETARCH}" \
    && chmod +x /supercronic

FROM production AS scheduler
COPY --from=supercronic-download /supercronic /usr/local/bin/supercronic
COPY crontab ./crontab
CMD ["sh", "-lc", "/app/scripts/pre-generate.sh || true; exec supercronic crontab"]
