---
name: portal-dev-and-deploy
description: Run, test and deploy apps/catalyst (RR Cloud Career Catalyst) — dev/e2e commands, how it reaches the API without any API change, and the host-owned DNS/cloudflared steps. Trigger on "run the portal", "deploy the portal", "catalyst hostname", "portal e2e".
---

# RR Cloud Career Catalyst portal (`apps/catalyst`)

A separate Vite + React app for trainers, college TPOs, students and the Rural
Root Cloud super admin. It uses the same API and database as `apps/rooted`; the
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
- sessions are separate from `apps/rooted` (cookies are host-only);
- the portal blanks `X-Forwarded-Host` — Express trusts it, so a browser could
  otherwise name any college. (`apps/rooted`'s nginx does not do this; pre-existing.)

Registration, invites and Google sign-in stay in `apps/rooted`; the portal links there
(`VITE_MAIN_APP_URL`). Password reset and account claim have portal pages
(`/forgot-password`, `/reset-password`, the latter with `&welcome=1` for a claim), and with
`CATALYST_PUBLIC_URL` set on the api, reset and claim links for colleges on the training
module open there (`getResetBaseUrl`, `claimUrlFor`). Other emailed links (staff invites)
still open `apps/rooted`.

## People (students and team)

`/people/students` and `/people/team` are the college administrator's screens for logins;
they are thin wrappers over the api, which the main app also uses.

- Students (`students:read`, actions need `students:write`; suspend needs `roles:write`): batch
  filter, search, add, CSV import into a picked batch (`sectionId` form field, so repeated
  section names cannot misplace anyone), give a login to an existing student
  (`POST /academic/students/:id/account`), resend the claim link
  (`.../account/resend`), suspend/reactivate (`PATCH /tenant/members/:id/status`). The login
  column comes from `account` on `GET /academic/students`, sent only to `students:write`.
- Team (`roles:read`, actions need `roles:write`): add a mentor/TPO/admin with a claimable
  login (`POST /tenant/members`; the invite flow needs an existing account, which the portal
  cannot create), change role, suspend, remove, resend link, approve/reject join requests.
  `GET /tenant/members?audience=staff|students` splits the list.
- Nobody is hard-deleted from the students page; suspend is the way to cut access.

## Dev

```bash
cp apps/catalyst/.env.example apps/catalyst/.env     # optional; defaults work with localtest.me
pnpm dev:catalyst                                  # http://localhost:5174, API at :3001
docker compose -f docker-compose.dev.yml up      # includes a hot-reload `portal` service on :5174
```

`PORTAL_API_HOST` (env, default `VITE_APP_DOMAIN`) is the Host the dev proxy
presents. With `APP_DOMAIN=localtest.me` the bare apex is the portal host.

## E2E (Playwright)

Same stack as `apps/rooted`'s e2e (see CLAUDE.md): infra up, API on the test DB,
then:

```bash
pnpm --filter api seed:test:clean
pnpm --filter catalyst test:e2e          # starts its own vite on :5174 with PORTAL_API_HOST=localhost
pnpm --filter catalyst test:axe
pnpm --filter catalyst exec playwright test --project=mobile   # phone viewport (Pixel 7)
```

If the API is not on `:3001` set `API_PROXY_TARGET=http://127.0.0.1:<port>`.
On Windows, seeding from the host needs `directConnection=true` on
`MONGODB_URI` (the replica set advertises `mongo:27017`).

## Learning roadmap

Mentors build it at `/roadmap` (`training:read` to look, `training:write` to change);
students use `/me/roadmap` and `/me/leaderboard` (`self:training:read`, and
`self:training:write` to tick, answer or link). Facts to keep true:

- **Self-reported, never scored.** It does not feed `trainingMetrics` or readiness.
- **The server withholds a closed item's body, prompt and link** (`services/roadmap.service.js`);
  never move that decision into the UI. A closed item accepts only an un-tick.
- **The leaderboard is a whitelist** (rank, name, counts, `isMe`): classmates' answers,
  links and dates must never join it. Dropped students are left out.
- **E2E state.** The seed adds one published roadmap and one draft on the primary batch with
  known progress (Student2 50%, Student3 25%, dropped Student10 excluded). Specs that change
  Student1's roadmap restore it in `afterAll`; `leaderboard.spec.js` runs before
  `my-roadmap.spec.js` on purpose.
- **Running beside a dev stack.** The dev compose stack owns `:3001`/`:5174`. To run the
  suite without stopping it, start the API on another port (`PORT=3101`, `REDIS_URL` on a
  spare db such as `/5` so the dev API's workers do not pick up its jobs, `directConnection=true`
  Mongo URI) and point a throwaway Playwright config at a spare port with
  `API_PROXY_TARGET=http://localhost:3101`.

## Public landing page and enquiries

`/` is public (`src/pages/LandingPage.jsx`, sections in `src/components/landing/`);
a signed-in visitor is redirected to `homeRoute()`. Facts to keep true:

- **No prices, no job guarantee, no invented figures.** The pilot targets are read
  from `TRAINING_TARGETS` in `packages/shared`, the same constant the dashboard uses.
- **Contact details** live in `src/lib/contact.js`. `CONTACT_PHONE` is empty until the
  team supplies a number; the page then shows the email alone.
- **English only for now.** `landing.*` and `enquiries.*` hold English text in
  `hi.json` as placeholders (the key-parity spec needs them) and are skipped by the
  "Hindi is translated" check via `ENGLISH_ONLY_PREFIXES` in `tests/i18n.spec.js`.
  Translate, then remove the prefix there.
- **The form** posts to the public `POST /enquiries` (rate limited to 5 an hour per IP in
  production, hidden `website` honeypot). Rows are `CollegeEnquiry` documents with no
  tenant; `super_admin` reads and moves them at `/enquiries`. Nothing emails the team yet.
- **Visitor address behind the tunnel.** The `catalyst` vhost in `nginx/nginx.tunnel.conf`
  sends Cloudflare's `CF-Connecting-IP` as `X-Real-IP`; the portal's own nginx forwards it
  to the API as the only `X-Forwarded-For` entry. Without that, Express (`trust proxy 1`)
  sees every visitor as the proxy in front and the form's 5-an-hour limit is one shared
  bucket. Not verifiable from a dev machine: after deploy, check `RequestLog.ip` shows
  real addresses for portal requests.
- **No screenshots** of the portal on the page: the seed data is invented and looks it.
  Add real, approved ones deliberately if wanted.

## Deploy (tunnel mode)

```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build catalyst nginx
# staging checkout:
docker compose -f docker-compose.yml -f docker-compose.tunnel.uat.yml up -d --build catalyst nginx
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

## Code copied from `apps/rooted`

Kept identical on purpose so a later shared package is a mechanical move:
`src/lib/api.js`, `src/lib/utils.js`, `src/i18n/mergeHiEn.js`,
`src/i18n/languagePreference.js`, `src/contexts/auth-context.js`,
`src/contexts/useAuth.js`. `src/contexts/AuthContext.jsx` is a trimmed version
(no Google sign-in, no impersonation). UI primitives under `src/components/ui`
are the portal's own small native-element versions, not copies.
