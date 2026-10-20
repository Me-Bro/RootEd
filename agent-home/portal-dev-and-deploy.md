---
name: portal-dev-and-deploy
description: Run, test and deploy apps/portal (RR Cloud Career Catalyst) — dev/e2e commands, how it reaches the API without any API change, and the host-owned DNS/cloudflared steps. Trigger on "run the portal", "deploy the portal", "catalyst hostname", "portal e2e".
---

# RR Cloud Career Catalyst portal (`apps/portal`)

A separate Vite + React app for trainers, college TPOs, students and the Rural
Root Cloud super admin. It uses the same API and database as `apps/web`; the
training data lives behind `/training`, `/me/progress` and
`/admin/training/outcomes` (the `training` module).

## How it reaches the API

The portal never talks to a tenant subdomain. Its server (vite in dev, nginx in
the image) proxies `/__api/*` to the API and sets `Host` to `PORTAL_API_HOST` —
the deployment's **existing portal host** (`rooted.ruralrootcloud.com` on prod).
The API already treats that host as "no tenant in the hostname" and takes the
college from the access token's `tenantId` claim (`resolveTenant()`), set by
`POST /auth/select-tenant` or by a single-college login. So:

- no API change is needed to serve the portal;
- sessions are separate from `apps/web` (cookies are host-only);
- the portal blanks `X-Forwarded-Host` — Express trusts it, so a browser could
  otherwise name any college. (`apps/web`'s nginx does not do this; pre-existing.)

Registration, password reset, invites, account claim and Google sign-in stay in
`apps/web`; the portal links there (`VITE_MAIN_APP_URL`). Emailed links
therefore open `apps/web`, not the portal.

## Dev

```bash
cp apps/portal/.env.example apps/portal/.env     # optional; defaults work with localtest.me
pnpm dev:portal                                  # http://localhost:5174, API at :3001
docker compose -f docker-compose.dev.yml up      # includes a hot-reload `portal` service on :5174
```

`PORTAL_API_HOST` (env, default `VITE_APP_DOMAIN`) is the Host the dev proxy
presents. With `APP_DOMAIN=localtest.me` the bare apex is the portal host.

## E2E (Playwright)

Same stack as `apps/web`'s e2e (see CLAUDE.md): infra up, API on the test DB,
then:

```bash
pnpm --filter api seed:test:clean
pnpm --filter portal test:e2e          # starts its own vite on :5174 with PORTAL_API_HOST=localhost
pnpm --filter portal test:axe
```

If the API is not on `:3001` set `API_PROXY_TARGET=http://127.0.0.1:<port>`.
On Windows, seeding from the host needs `directConnection=true` on
`MONGODB_URI` (the replica set advertises `mongo:27017`).

## Deploy (tunnel mode)

```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build portal nginx
# staging checkout:
docker compose -f docker-compose.yml -f docker-compose.tunnel.uat.yml up -d --build portal nginx
```

Hostnames (derived from the programme name, unconfirmed): `catalyst.ruralrootcloud.com`
(prod) and `catalyst-uat.ruralrootcloud.com` (staging). Both are served by the
`catalyst…` server block in `nginx/nginx.tunnel.conf`.

### Host-owned steps (not done by the repo)

1. DNS, per hostname, using the tunnel **UUID** (see `docker-compose.tunnel.yml`):
   `cloudflared tunnel route dns --overwrite-dns <UUID> catalyst.ruralrootcloud.com`
2. An explicit ingress line for each hostname in the cloudflared config — a
   wildcard rule alone does not match (see [[prod-staging-mongo-migration]]).
3. Mirror these repo changes into the sibling `RootEd_uat` checkout.
4. Make sure the `training` permissions exist on live roles: the API runs
   `0002-add-training-permissions` on boot; roles cache for up to 60 s.
5. A college must have the module: `college` orgType has it by default; other
   org types need a `Tenant.enabledModules` override that lists **every** module
   (the override replaces the list).

### Not verified from a dev machine

Real DNS/tunnel routing, the production TLS path (the `Secure` cookies and the
`X-Forwarded-Proto` chain through two nginx hops), and `catalyst-uat`.

## Code copied from `apps/web`

Kept identical on purpose so a later shared package is a mechanical move:
`src/lib/api.js`, `src/lib/utils.js`, `src/i18n/mergeHiEn.js`,
`src/i18n/languagePreference.js`, `src/contexts/auth-context.js`,
`src/contexts/useAuth.js`. `src/contexts/AuthContext.jsx` is a trimmed version
(no Google sign-in, no impersonation). UI primitives under `src/components/ui`
are the portal's own small native-element versions, not copies.
