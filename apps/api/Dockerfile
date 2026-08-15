FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++ && npm install -g pnpm@11.1.2

ENV HUSKY=0

WORKDIR /app

# Copy workspace manifests first (layer cache for install)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Install deps (skip all scripts), then rebuild only the native modules we need
RUN pnpm install --frozen-lockfile --ignore-scripts && \
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
