FROM node:22-alpine AS builder
RUN npm install -g pnpm@11.1.2

ENV HUSKY=0

WORKDIR /app

# Copy workspace manifests first (layer cache for install)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# A slow link to the npm registry (the UAT host manages ~130 KB/s) fails the install on
# pnpm's default 60 s fetch timeout, so allow longer, retry, and fetch fewer files at once.
# These must be CLI flags: pnpm 11 ignores the npm_config_* environment variables.
RUN pnpm install --frozen-lockfile --ignore-scripts --fetch-timeout=600000 --fetch-retries=10 --fetch-retry-mintimeout=20000 --network-concurrency=8

# Copy source and build
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared

ARG VITE_API_URL=http://localhost:3001
ARG VITE_APP_DOMAIN=rooted.app
ARG VITE_PORTAL_SUBDOMAIN=
ARG VITE_SENTRY_DSN=
ARG VITE_GOOGLE_CLIENT_ID=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_DOMAIN=$VITE_APP_DOMAIN
ENV VITE_PORTAL_SUBDOMAIN=$VITE_PORTAL_SUBDOMAIN
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

RUN pnpm --filter web build

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
