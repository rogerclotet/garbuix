FROM node:25.2-slim AS base

RUN npm install -g pnpm@10.30.3

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS builder

COPY . .
RUN pnpm build

FROM base AS dev

ENV NODE_ENV=development

FROM base AS production

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml tsconfig.json drizzle.config.ts ./
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY src ./src
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.output ./.output

EXPOSE 3000

CMD ["sh", "-lc", "pnpm db:migrate && node .output/server/index.mjs"]

FROM alpine AS supercronic-download
ARG SUPERCRONIC_VERSION=0.2.33
ARG TARGETARCH
RUN wget -O /supercronic \
    "https://github.com/aptible/supercronic/releases/download/v${SUPERCRONIC_VERSION}/supercronic-linux-${TARGETARCH}" \
    && chmod +x /supercronic

FROM production AS scheduler
COPY --from=supercronic-download /supercronic /usr/local/bin/supercronic
COPY crontab ./crontab
CMD ["supercronic", "crontab"]
