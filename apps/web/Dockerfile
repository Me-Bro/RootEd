FROM node:22-alpine AS builder
RUN npm install -g pnpm@11.1.2

ENV HUSKY=0

WORKDIR /app

# Copy workspace manifests first (layer cache for install)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source and build
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared

ARG VITE_API_URL=http://localhost:3001
ARG VITE_APP_DOMAIN=rooted.app
ARG VITE_SENTRY_DSN=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_DOMAIN=$VITE_APP_DOMAIN
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN

RUN pnpm --filter web build

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
