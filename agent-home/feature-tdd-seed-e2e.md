---
name: feature-tdd-seed-e2e
description: Plan a feature step-by-step with a TDD approach, extend seed data for it, then verify with Playwright e2e. Trigger on "prepare a step by step plan with TDD approach", "seed required data", "do e2e testing", or when asked to implement + verify a feature end-to-end in this repo.
---

# Feature: TDD plan → seed data → e2e testing

RootEd-specific workflow for building a feature so it's actually verified, not
just written. Four phases, run in order.

## 1. Plan (before writing code)

- Read the existing routes/models/pages the feature touches. Prefer reusing
  endpoints that already exist over adding new ones (e.g. read/detail routes
  the UI never wired up).
- Write the plan: what changes, which files, what's reused vs new, how it'll
  be tested, how it'll be verified. Get it approved before implementing.

## 2. TDD for any extractable logic

- Anything with real branching (a filter builder, a status-transition rule, a
  calculation) — pull it into a small pure function/module first.
- Write the test for it before the implementation exists (confirm it fails —
  `Cannot find module`/`is not a function` counts as red).
- Implement, rerun, confirm green.
- API unit tests: Jest, `apps/api/src/__tests__/*.test.js`. Only reach for
  `mongodb-memory-server` (see `tenant-isolation.test.js`) if the logic needs
  a real DB — pure functions don't.
- Run: `pnpm --filter api test -- <name>`.

## 3. Seed data

- Extend `apps/api/src/scripts/seed-test-data.js` with whatever fixtures the
  new UI/route needs (extra records, a second status value, related
  documents in other collections) — **add, don't mutate** the existing
  seeded IDs/counts other specs already depend on.
- If a fixture needs a service-layer side effect (PDF generation, S3 upload,
  a queued job), create the DB records directly instead of calling the
  service — seeding shouldn't need Minio/Redis just to exist.
- Verify by actually running it: `node --env-file=.env.test src/scripts/seed-test-data.js --clean`
  from `apps/api/`, and check the emitted JSON has the new fields.

## 4. E2E testing

- Write/extend Playwright specs under `apps/web/tests/` *before* or alongside
  the UI (same red→green discipline as step 2).
- Bring up the stack per `CLAUDE.md`'s E2E section — infra via
  `docker compose -f docker-compose.yml -f docker-compose.test.yml up -d`,
  API via `node --env-file=apps/api/.env.test apps/api/src/index.js`, web via
  `pnpm --filter web exec vite --mode test`.
- **If a dev stack is already running on those ports** (`docker ps`), don't
  fight it — `docker stop` just `web`/`nginx`/`api` for the duration, run
  local instead, and restore the dev stack afterward
  (`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`).
  Note the exact compose files in use before touching anything
  (`docker inspect <container> --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}'`)
  so the restore is exact.
- Reseed (`seed:test:clean`), then run the new spec(s) plus the specs for any
  module the change touches or reads from (regression check) — not
  necessarily the whole suite.
- `e2e` project's default Playwright storageState may not have tenant
  permissions (see `playwright.config.js` — currently `super_admin`, which
  gets `permissions: []` on tenant pages without impersonation). If specs
  fail across the board including ones you didn't touch, check this before
  assuming your code is broken — diagnose with `test.use({ storageState:
  'tests/fixtures/.auth/tenant_admin.json' })`, temporarily, then revert the
  config.
- A failure that's a real bug (not a bad selector/pre-existing issue) — fix
  it and rerun. Don't report green until the actual run says so.
