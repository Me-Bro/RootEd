FROM node:22-alpine AS builder
RUN npm install -g pnpm@11.1.2

ENV HUSKY=0

WORKDIR /app

# Copy workspace manifests first (layer cache for install)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/portal/package.json ./apps/portal/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source and build
COPY apps/portal ./apps/portal
COPY packages/shared ./packages/shared

# VITE_API_URL stays empty: the portal calls its own /__api path (see nginx.conf.template).
ARG VITE_APP_DOMAIN=rooted.app
ARG VITE_MAIN_APP_URL=
ARG VITE_SENTRY_DSN=
ENV VITE_APP_DOMAIN=$VITE_APP_DOMAIN
ENV VITE_MAIN_APP_URL=$VITE_MAIN_APP_URL
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN

RUN pnpm --filter portal build

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/portal/dist /usr/share/nginx/html

# The official image renders /etc/nginx/templates/*.template through envsubst at
# start-up. The filter keeps it to this one variable, so nginx's own $host / $uri
# are left alone.
COPY apps/portal/nginx.conf.template /etc/nginx/templates/default.conf.template
ENV PORTAL_API_HOST=localhost
ENV NGINX_ENVSUBST_FILTER=PORTAL_API_HOST

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
