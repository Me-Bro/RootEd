# RootEd

[![CI](https://github.com/Me-Bro/RootEd/actions/workflows/ci.yml/badge.svg)](https://github.com/Me-Bro/RootEd/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

_Where your school's roots grow digital._

RootEd is a multi-tenant school management platform that digitises academics, staff, expenses, and inventory in one system.

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
│   │       ├── routes/     # auth, admin, tenant, academic, staff, expense, fee, inventory, billing
│   │       ├── scripts/    # seed / bootstrap scripts
│   │       ├── services/   # business logic used by routes/workers
│   │       ├── utils/      # field encryption, helpers
│   │       ├── workers/    # BullMQ background workers
│   │       ├── __tests__/  # Jest/Supertest tests
│   │       ├── app.js      # Express app + middleware chain
│   │       └── index.js    # process entrypoint
│   └── web/                 # React 19 SPA (Vite, no TypeScript)
│       └── src/
│           ├── components/ # UI components (attendance, ui/, etc.)
│           ├── contexts/   # React context providers
│           ├── hooks/      # custom hooks
│           ├── i18n/       # i18next setup + en/hi locales, hi_en merge
│           ├── lib/        # API client (axios), etc.
│           ├── pages/      # route-level pages
│           ├── stories/    # Storybook stories
│           └── utils/      # frontend helpers
├── packages/
│   └── shared/              # Zod schemas shared by api + web
├── docs/
│   ├── adr/                 # architecture decision records
│   └── mobile-ui/           # mobile-responsive design notes
├── nginx/                    # nginx configs (TLS + dev/plain variants)
├── tests/
│   └── k6/                   # k6 load tests
├── agent-home/                # Claude Code runbooks (not user-facing docs)
├── docker-compose*.yml        # prod-like, dev, local, test, tunnel variants
└── CLAUDE.md                  # full dev setup, commands, architecture notes
```

## Getting Started

See [CLAUDE.md](CLAUDE.md) for full dev setup, commands, and architecture notes.

```bash
pnpm install
pnpm dev:api    # Express API on :3001
pnpm dev:web    # Vite frontend on :5173
```

## Tech Stack

**Backend:** Express 4, Mongoose 8, BullMQ 5, Redis, Argon2id, JWT, Zod
**Frontend:** React 19, Vite, TailwindCSS 4, React Query 5, i18next (English, Hindi, Hindi+English)
**Infra:** Docker, Nginx, MongoDB (replica set), Redis, Minio (S3-compatible)

## Testing

Unit/integration tests (Jest + Supertest), Playwright E2E, and accessibility (axe) — see [CLAUDE.md](CLAUDE.md#commands) for exact commands and the [E2E-TEST-PLAN.md](E2E-TEST-PLAN.md) for coverage.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## License

[MIT](LICENSE)
