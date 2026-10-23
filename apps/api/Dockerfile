FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++ && npm install -g pnpm@11.1.2

ENV HUSKY=0

WORKDIR /app

# Copy workspace manifests first (layer cache for install)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Install deps (skip all scripts), then rebuild only the native modules we need
# A slow link to the npm registry (the UAT host manages ~130 KB/s) fails the install on
# pnpm's default 60 s fetch timeout, so allow longer, retry, and fetch fewer files at once.
# These must be CLI flags: pnpm 11 ignores the npm_config_* environment variables.
RUN pnpm install --frozen-lockfile --ignore-scripts --fetch-timeout=600000 --fetch-retries=10 --fetch-retry-mintimeout=20000 --network-concurrency=8 && \
    pnpm --filter api rebuild argon2 msgpackr-extract

# Copy source
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared

# Create self-contained production deployment
RUN pnpm --filter api --prod deploy --legacy --ignore-scripts /deploy

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=builder /deploy .
EXPOSE 3001
CMD ["node", "src/index.js"]
