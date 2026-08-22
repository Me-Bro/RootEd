# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev servers (run separately)
pnpm dev:api          # Express API on :3001 (node --watch)
pnpm dev:web          # Vite frontend on :5173

# Full stack via Docker (production-like: built images, nginx with TLS)
docker compose up -d

# Full stack with hot reload (dev — API node --watch + Vite HMR, plain-HTTP nginx)
docker compose -f docker-compose.dev.yml up

# Fully local, no nginx/TLS at all (API :3001, Web :5173 direct)
docker compose -f docker-compose.local.yml up --build

# Build all
pnpm build

# Lint all packages
pnpm lint

# Format
prettier --write .

# Run API unit/integration tests (Jest, ESM mode)
pnpm --filter api test

# Run a single API test file
pnpm --filter api test -- --testPathPattern=tenant-isolation

# K6 load test
k6 run tests/k6/api-load.js

# E2E test stack (run in order)
docker compose -f docker-compose.yml -f docker-compose.test.yml up -d   # infra only (Mongo/Redis/Minio; web+nginx disabled)
node --env-file=apps/api/.env.test apps/api/src/index.js                 # API on :3001 with test DB
pnpm --filter web exec vite --mode test                                  # Web on :5173 with /__api proxy (Playwright's webServer also does this automatically)
pnpm --filter web test:e2e                                                # Run Playwright E2E (project: e2e, depends on auth setup project)
pnpm --filter web test:e2e:headed                                         # Same, headed browser
pnpm --filter web test:axe                                                # Accessibility spec only
pnpm --filter web test:e2e:report                                         # Open last HTML report

# Seed the E2E test DB (rooted_test) — outputs seeded IDs as JSON for Playwright fixtures
pnpm --filter api seed:test          # seed (no wipe)
pnpm --filter api seed:test:clean    # drop all collections, then seed
# Or from the web package, via the running docker stack's api container:
pnpm --filter web test:seed:docker

# Dump/restore a DB snapshot for faster E2E iteration
pnpm --filter web test:snapshot:dump
pnpm --filter web test:snapshot:restore

# Bootstrap a super_admin user against whatever MONGODB_URI is active
node apps/api/src/scripts/seed-super-admin.js --email=admin@rooted.app --password=SecurePass123

# Seed a full-scale realistic school (1000 students, 74 staff, real Indian names)
# into the dev DB. Run INSIDE the api container: the Mongo replica set advertises
# itself as `mongo:27017`, so a host-side connection dies after the handshake.
docker exec -w /app/apps/api rooted-api-1 node src/scripts/seed-bulk-data.js --reset
docker exec -w /app/apps/api rooted-api-1 node src/scripts/seed-bulk-data.js --students=250 --attendance-days=10 --reset
```

`seed-bulk-data.js` flags: `--students=N` (default 1000), `--tenant=<subdomain>`,
`--attendance-days=N` (default 20), `--today=YYYY-MM-DD`, `--reset` (purge the
tenant's data first, keeping the tenant, roles and the canonical login users).
Without `--reset` every write is an upsert keyed on the model's unique index, so
re-runs are idempotent. It seeds Grade 1-10 x sections A-D (40 sections), 8
subjects per class, a conflict-free 1600-slot timetable, ~20k attendance records,
4 assessment rounds of grades (~31k), fees/payroll/leave/expense/inventory. All
seeded users share password `TestPass123!`.

## Architecture

**Monorepo** (pnpm workspaces):
- `apps/api` — Express.js backend (ES Modules, Node 22)
- `apps/web` — React 19 SPA (Vite, no TypeScript)
- `packages/shared` — Zod validation schemas shared by both apps

**Multi-tenant model:** Shared MongoDB database, tenant-scoped via `tenantId` field. `apps/api/src/models/plugins/tenantScope.js` is a Mongoose plugin (applied to every model except `Tenant` and `User`) that throws on any find/update/save missing `tenantId` in its filter — this is the tenant-isolation guarantee, not an app-level convention. Callers that must cross tenants (e.g. super-admin routes) pass `{ _bypassTenantScope: true }` in query options. Compound indexes follow `{tenantId:1, ...}` pattern.

**Auth flow:** JWT (15m access token) + refresh token in httpOnly cookie (7d, `SameSite=Lax`). Revocation via Redis blocklist, checked two ways in `authenticate()`: per-token (`isTokenBlocked`) and per-user (`blocklist:user:<id>` timestamp set by the revoke-all-sessions runbook, compared against the token's `iat`). MFA via TOTP (otplib). Three-layer RBAC: System (`user.systemRole`, e.g. `super_admin`) → Tenant (`TenantMembership`) → Module permissions (`Role.permissions`, from a fixed `PERMISSIONS` list in `models/Role.js`); 5 role templates seeded per tenant (`tenant_admin`, `principal`, `teacher`, `accountant`, `librarian`). Resolved permissions are cached in Redis for 60s per `(tenantId, userId)` — role/membership changes can take up to a minute to take effect.

**Request lifecycle** (see `apps/api/src/app.js` for the actual middleware order — routers are mounted, not chained in one file):
1. Global: `helmet` → CORS (dev/test allows any origin; prod restricts to `*.${APP_DOMAIN}`) → cookie parser → JSON body parse → `sanitizeBody()` (DOMPurify XSS sanitization) → request logging/metrics → rate limiting → CSRF (double-submit cookie via `csrf-csrf`, skipped for `GET`/`HEAD`/`OPTIONS` and `/auth/login`, `/auth/refresh`)
2. `/auth` and `/admin` routers mount *before* `resolveTenant()` — they are tenant-agnostic (login, refresh, system-level admin)
3. `resolveTenant()` runs once, globally, before all tenant-scoped routers (`/tenant`, `/academic`, `/staff`, `/expense`, `/fee`, `/inventory`, `/billing`) — it strips `.${APP_DOMAIN}` off the request Host header to get the subdomain and loads the active `Tenant` into `req.tenant`
4. Each tenant router applies `authenticate()` (JWT + blocklist) via `router.use()`, then individual routes apply `requirePermission('module:action')` and Zod `validate(schema)` as needed

Because `resolveTenant()` matches on `Host` minus `APP_DOMAIN`, local/dev hosts must literally end in `.${APP_DOMAIN}` (default `rooted.app`) or resolution fails with "Tenant not found" — the test env overrides `APP_DOMAIN=localhost` so `testschool.localhost` resolves correctly instead.

**Background workers:** 6 in-process BullMQ workers (Redis-backed), started in `apps/api/src/index.js` alongside the HTTP server (not separate processes): `audit.worker.js`, `reportCard.worker.js`, `expenseEscalation.worker.js`, `inventoryOverdue.worker.js`, `trialExpiry.worker.js`, `stockValuation.worker.js`.

**Field encryption:** AES-256-GCM (`apps/api/src/utils/fieldEncryption.js`) for `StaffMember` PII (government ID, bank account, salary). Per-tenant DEK derived from `MASTER_ENCRYPTION_KEY` via HKDF-SHA256 (salt = tenantId, info = `'rooted-field-encryption'`). Transparent via Mongoose getters/setters — never decrypt/re-encrypt manually.

**Audit logging:** Mutations enqueue to the BullMQ audit worker, which writes immutable before/after diffs to the `AuditLog` collection asynchronously (not written inline with the request).

**Approval workflows:** `LeaveRequest`, `ExpenseEntry`, and `PurchaseRequisition` each embed their own `approvalChain` array + `currentApproverIndex` rather than using a shared workflow engine (see `docs/adr/004-workflow-engine.txt`) — advancing the chain is a service function called from each module's approve/reject route handler, and BullMQ delayed jobs drive auto-escalation. Sequential approvers only (no parallel steps in v1); the pattern is intentionally duplicated per module, not shared.

**Frontend API client:** `apps/web/src/lib/api.js` defaults `baseURL` to `${window.location.origin}/__api` when `VITE_API_URL` is unset, so requests stay same-origin (subdomain-based tenant resolution needs the real Host header, and the refresh cookie must stay first-party). Both the Vite dev proxy (`vite.config.js`, active only in `--mode test`) and the built web image's own nginx (`apps/web/nginx.conf`) rewrite `/__api/*` → the API, forwarding `Host`. Don't call the API by absolute URL/different hostname from the page — it breaks CORS and cookie handling by design.

## Key Files

| File | Purpose |
|------|---------|
| `apps/api/src/app.js` | Express setup, middleware chain order |
| `apps/api/src/index.js` | Process entrypoint — connects DB/Redis/S3, starts all 6 workers, then listens |
| `apps/api/src/config/env.js` | Zod-validated env schema — all required vars listed here |
| `apps/api/src/middleware/resolveTenant.js` | Tenant resolution logic (Host-header subdomain matching against `APP_DOMAIN`) |
| `apps/api/src/middleware/authenticate.js` | JWT + Redis blocklist check |
| `apps/api/src/middleware/requirePermission.js` | RBAC permission check + 60s Redis permission cache |
| `apps/api/src/models/plugins/tenantScope.js` | Enforces `tenantId` on every tenant-scoped query/write |
| `apps/api/src/routes/` | 8 routers: auth, admin, tenant, academic, staff, expense, fee, inventory, billing |
| `apps/api/src/scripts/seed-test-data.js` | Deterministic seed for `rooted_test` (tenant `testschool`, 4 users, academic/staff/fee/inventory data); `--clean` wipes all collections first |
| `apps/api/src/scripts/seed-super-admin.js` | Bootstraps one `systemRole: super_admin` user against whatever `MONGODB_URI` is active |
| `apps/web/src/App.jsx` | React Router setup |
| `apps/web/src/lib/api.js` | Axios client — same-origin `/__api` base URL logic |
| `apps/web/playwright.config.js` | E2E project setup — `setup` project builds per-role auth storage state before `e2e`/`axe` projects run; `webServer` auto-starts `vite --mode test` |
| `packages/shared/src/` | Zod schemas reused across API validation and frontend forms |
| `docs/adr/` | Architecture decision records — tenancy model, field encryption, in-process workers, approval workflow engine |

## Agent Skills

`agent-home/*.md` — repo-specific runbooks for Claude Code, not user-facing docs:
- `feature-tdd-seed-e2e.md` — plan → TDD → extend seed data → Playwright e2e workflow for building a feature end-to-end
- `restore-dev-stack.md` — **read this before touching Docker for local E2E**: switching between dev mode (`docker-compose.dev.yml`) and e2e mode (local API + `vite --mode test` on the same ports), the port-release race, and a `node_modules` corruption gotcha from the container's own `pnpm install` running against the bind-mounted volume
- `branch-commit-pr-from-upstream.md` — cut a branch from `upstream/main`, commit with hooks, PR against upstream (fork workflow: `origin` = your fork, `upstream` = source repo)
- `sync-main-with-upstream.md` — fast-forward local `main`/`origin/main` from `upstream/main`

## Environment Setup

### Dev
Copy `apps/api/.env.example` → `apps/api/.env`. Required vars:
- `MONGODB_URI`, `REDIS_URL`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (≥32 chars each)
- `MASTER_ENCRYPTION_KEY` (AES key for field encryption, ≥32 chars)
- `CSRF_SECRET` (≥32 chars)
- S3/Minio credentials (`S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`)
- `APP_DOMAIN` (default `rooted.app`) — must match the suffix of whatever Host you access the API through, or `resolveTenant()` 404s

Web build args (Dockerfile / `.env`): `VITE_API_URL`, `VITE_APP_DOMAIN`, `VITE_SENTRY_DSN`. Leave `VITE_API_URL` unset/empty to use the same-origin `/__api` proxy path described above.

Docker Compose (`docker-compose.yml`) brings up: MongoDB 7 (replica set `rs0`, initialized by a one-shot `mongo-init` service), Redis 7, Minio, API, Web (built static image), Nginx (wildcard-subdomain TLS — requires certs at `nginx/certs/fullchain.pem`/`privkey.pem`, which are **not** included in the repo; use `nginx/nginx.dev.conf` via `docker-compose.dev.yml` for a plain-HTTP local variant instead of generating certs).

`apps/web/.env.dev` is the known-good template for the `docker-compose.dev.yml` hot-reload workflow: `VITE_API_URL=` (empty — same-origin `/__api`, required for the CSRF double-submit cookie to match) and `VITE_APP_DOMAIN=localtest.me` (public wildcard DNS → `127.0.0.1`, matches `apps/api/.env`'s `APP_DOMAIN`). Copy it to `apps/web/.env` before running that stack — a stale/absolute `VITE_API_URL` in `apps/web/.env` (e.g. pointing at a tenant subdomain:3001 directly) causes `invalid csrf token` errors on every mutating request.

The Vite dev proxy's upstream target and tenant `Host` header (`vite.config.js`) are derived from `API_PROXY_TARGET` (default `http://localhost:3001`) and `VITE_APP_DOMAIN` respectively — `docker-compose.dev.yml` overrides `API_PROXY_TARGET: http://api:3001` for the `web` service, since inside that container `localhost` is the container itself, not the `api` container (`localhost:3001` there 502s).

### Test (E2E)
- `apps/api/.env.test` — separate `rooted_test` DB, `APP_DOMAIN=localhost` (never share with the dev DB/domain)
- `apps/web/.env.test` — sets `VITE_API_URL=http://127.0.0.1:5173/__api` (routes through Vite proxy)
- Vite proxy (`/__api` → `http://localhost:3001`) only active in `--mode test`; proxy injects `Host: testschool.localhost` so `resolveTenant()` resolves the correct tenant without custom DNS
- `docker-compose.test.yml` overlay disables web + nginx (Playwright/Vite run locally) and points `api` at `rooted_test` with `APP_DOMAIN=localhost`
- Seeded test users (password `TestPass123!`): `admin@test.local` (super_admin), `tadmin@testschool.local`, `teacher@testschool.local`, `viewer@testschool.local`

## Tech Stack

**Backend:** Express 4, Mongoose 8, BullMQ 5, ioredis, Argon2id, jsonwebtoken, Zod, Pino, Razorpay, pdfkit, prom-client, csrf-csrf, swagger-ui-express, Sentry
**Frontend:** React 19, Vite 8, TailwindCSS 4, Base UI (@base-ui/react), React Query 5, react-hook-form, Axios, i18next, Sentry, Storybook
**Testing:** Jest + Supertest + mongodb-memory-server (API), Playwright + axe-core (web E2E/accessibility), k6 (load), Lighthouse CI
**Infra:** Docker + Nginx (wildcard subdomain TLS in prod-like mode), MongoDB replica set, Redis, Minio (S3-compatible)

**CI** (`.github/workflows/ci.yml`): matrixed lint+test per app (api/web) against real Mongo/Redis service containers → axe accessibility check → Lighthouse CI → (on `main` only) Docker build/push to GHCR → staging deploy (placeholder step, not wired up).

## Code Conventions

- **JavaScript only** — no TypeScript in either app
- Conventional commits enforced by commitlint + Husky (feat/fix/docs/style/refactor/test/chore/perf/ci/revert)
- Pre-commit: lint-staged runs ESLint --fix + Prettier on staged files
- Prettier: `singleQuote: true`, `semi: true`, `tabWidth: 2`, `printWidth: 100`, `trailingComma: "es5"`
- Shared Zod schemas in `packages/shared` — always use these for validation rather than duplicating in API routes
- ESLint config is split by path in the root `eslint.config.js`: `apps/web/**` gets the React/browser-globals config, `apps/api/**` + `packages/shared/**` get the Node-globals config

## Current State

MVP largely complete. Known gaps and open bugs:
- Jest/Supertest integration tests minimal (only `apps/api/src/__tests__/tenant-isolation.test.js` exists — 4 tests against `mongodb-memory-server`); no route-level Supertest coverage
- Playwright E2E specs exist for auth, academic (attendance/students), fee payments, staff leaves, and expense entries, plus an axe accessibility spec — but coverage is not exhaustive
- i18n translation files incomplete (only `en`; `hi`/`ta`/`es`/`fr` not created)
- Real-time notifications not implemented — the notification bell polls every 60s
- `SES` is not a valid `EMAIL_PROVIDER` yet (only `smtp` and `postmark`)
- `/audit` and `/flags` web pages are placeholders ("Coming soon")
- `POST /fee/payments/verify` passes a hardcoded `amount: 0` instead of the Razorpay-verified charged amount
- New tenants don't get default `LeaveType`s auto-seeded
