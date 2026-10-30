# RootEd

[![CI](https://github.com/Me-Bro/RootEd/actions/workflows/ci.yml/badge.svg)](https://github.com/Me-Bro/RootEd/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

_Where your school's roots grow digital._

RootEd is a multi-tenant school management platform that digitises academics, staff, expenses, and inventory in one system. The same API also powers **RR Cloud Career Catalyst**, a separate app for college training and placement tracking.

```
RootEd — Multi-tenant school management platform.
Academics · Staff · Expenses · Inventory
Built with React, Express, Node.js, and MongoDB. Containerised with Docker. Three-tier RBAC: Super Admin → Tenant Admin → Scoped Users.
```

## Features

- **Academics** — attendance, grades, timetable, report cards, academic years
- **Staff** — directory, leave requests (approval chains), salary/payroll
- **Fee** — fee structures, collection, Razorpay online payments, receipts
- **Expense** — expense entries with approval chains and auto-escalation, budgets
- **Inventory** — stock tracking, depreciation, overdue return alerts
- **Career Catalyst (training)** — batches, modules, learning roadmaps, assignments, completion, readiness and placement tracking for colleges, with its own SPA (`apps/catalyst`)
- **Multi-tenant** — one deployment, many schools; tenant-scoped data enforced at the DB-query layer
- **Three-tier RBAC** — Super Admin → Tenant Admin → module-permissioned roles
- **i18n** — English, Hindi, and a merged Hindi+English UI language
- **Field-level encryption** — AES-256-GCM for staff PII (government ID, bank account, salary)
- **Audit logging** — immutable before/after diffs for mutations

## Directory Structure

```
RootEd/
├── apps/
│   ├── api/                # Express backend (ES Modules, Node 22)
│   │   └── src/
│   │       ├── config/     # env schema, other app config
│   │       ├── middleware/ # auth, tenant resolution, RBAC, etc.
│   │       ├── models/     # Mongoose models + plugins (tenantScope, ...)
│   │       ├── migrations/ # ordered data migrations, run at boot
│   │       ├── routes/     # auth, admin, orgs, feedback, enquiries, me, tenant, academic, staff,
│   │       │               # expense, fee, inventory, training, roadmap, billing
│   │       ├── scripts/    # seed / bootstrap / migration scripts, runbooks/
│   │       ├── services/   # business logic used by routes/workers
│   │       ├── utils/      # field encryption, helpers
│   │       ├── workers/    # BullMQ background workers
│   │       ├── __tests__/  # Jest/Supertest tests
│   │       ├── app.js      # Express app + middleware chain
│   │       └── index.js    # process entrypoint
│   ├── rooted/              # React 19 SPA for schools (Vite, no TypeScript)
│   │   └── src/
│   │       ├── components/ # UI components (attendance, ui/, etc.)
│   │       ├── contexts/   # React context providers
│   │       ├── hooks/      # custom hooks
│   │       ├── i18n/       # i18next setup + en/hi locales, hi_en merge
│   │       ├── lib/        # API client (axios), etc.
│   │       ├── pages/      # route-level pages
│   │       ├── stories/    # Storybook stories
│   │       └── utils/      # frontend helpers
│   └── catalyst/            # RR Cloud Career Catalyst: React SPA for college training/placement
│       ├── src/            # pages, components, i18n, lib
│       └── tests/          # Playwright E2E specs
├── packages/
│   └── shared/              # Zod schemas shared by api, rooted and catalyst
├── docs/
│   ├── adr/                 # architecture decision records
│   ├── mobile-ui/           # mobile-responsive design mockups
│   ├── landing-page-mockup/ # landing page mockups
│   └── logo-mockup/         # logo mockups
├── nginx/                    # nginx configs (TLS, dev, plain-local, tunnel)
├── ops/                      # db-backup (daily mongodump container), minio (build from source)
├── redis/                    # redis config
├── scripts/                  # deploy-tunnel.sh, status.sh
├── tests/
│   └── k6/                   # k6 load tests
├── agent-home/                # Claude Code runbooks, requirements, plans (not user-facing docs)
├── docker-compose*.yml        # prod-like, dev, local, test, tunnel (prod + uat) variants
└── CLAUDE.md                  # full dev setup, commands, architecture notes
```

## Getting Started

See [CLAUDE.md](CLAUDE.md) for full dev setup, commands, and architecture notes.

```bash
pnpm install
pnpm dev:api        # Express API on :3001
pnpm dev:rooted     # RootEd school frontend (Vite) on :5173
pnpm dev:catalyst   # Career Catalyst frontend (Vite) on :5174
```

## Logging in

Three entry points share one API and one `POST /auth/login` (email or username). Seeded dev/test users share password `TestPass123!`.

| Login | Where | Account |
|---|---|---|
| **RootEd school** | `apps/rooted` on a tenant subdomain, e.g. `testschool-rooted.localtest.me` | `tadmin@testschool.local` (full access), `principal@`, `teacher@`, `student@` … `@testschool.local` |
| **Super admin** | `apps/rooted` on the bare domain (not a tenant subdomain) | `admin@test.local`, or create one with `seed-super-admin.js`. Sees platform pages only; use *Tenants → Impersonate* to enter a school |
| **Career Catalyst** | `apps/catalyst` at `localhost:5174` (dev) — no tenant subdomain, the college comes from your sign-in | `tadmin@`/`principal@`/`teacher@testschool.local` (dashboard), `student@` (my progress), `admin@test.local` (outcomes, enquiries) |

Details and gotchas: [CLAUDE.md](CLAUDE.md#logins).

## Deployment

Runs via Docker Compose in several modes — self-managed TLS, behind a Cloudflare Tunnel, hot-reload dev, or fully local — see [CLAUDE.md](CLAUDE.md#commands) for the exact compose invocations. Production and staging run as independent stacks sharing a single MongoDB instance (separate databases, separate credentials per environment).

## Tech Stack

**Backend:** Express 4, Mongoose 8, BullMQ 5, Redis, Argon2id, JWT, Zod
**Frontend:** React 19, Vite, TailwindCSS 4, React Query 5, i18next (English, Hindi, Hindi+English)
**Infra:** Docker, Nginx, Cloudflare Tunnel, MongoDB (replica set), Redis, Minio (S3-compatible)

## Testing

Unit/integration tests (Jest + Supertest), Playwright E2E for both frontends, and accessibility (axe) — see [CLAUDE.md](CLAUDE.md#commands) for exact commands and the [E2E-TEST-PLAN.md](E2E-TEST-PLAN.md) for coverage.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## License

[MIT](LICENSE)
