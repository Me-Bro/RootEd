# Contributing to RootEd

Thanks for taking interest in RootEd. This doc covers setup, workflow, and what a PR needs to get merged.

## Setup

See [CLAUDE.md](CLAUDE.md) for full dev environment setup (env vars, Docker variants, seeding). Quick start:

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # fill in required vars, see CLAUDE.md
pnpm dev:api
pnpm dev:web
```

## Workflow

1. Fork the repo, branch off `main`.
2. Use a descriptive branch name (`fix/tenant-scope-leak`, `feat/leave-type-seed`).
3. Make your change. Keep PRs focused — one concern per PR.
4. Commit using [Conventional Commits](https://www.conventionalcommits.org/) — enforced by commitlint via Husky pre-commit hook. Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`, `revert`.
5. Push and open a PR against `main`.

## Before opening a PR

Run locally:

```bash
pnpm lint
pnpm --filter api test
pnpm build
```

If your change touches API routes, models, or auth/tenant logic, add or update a Jest test under `apps/api/src/__tests__/`. If it touches a user-facing flow in the web app, consider a Playwright E2E spec (see `E2E-TEST-PLAN.md` and the E2E commands in `CLAUDE.md`).

CI (`.github/workflows/ci.yml`) runs lint + test for both apps against real Mongo/Redis containers, an axe accessibility check, and Lighthouse CI. A PR won't merge with a red CI run.

## Code conventions

- JavaScript only — no TypeScript in either app.
- Prettier (`singleQuote`, `semi`, 2-space indent, 100 print width) + ESLint auto-fix run on staged files via lint-staged; don't fight the formatter, just run `pnpm format` if unsure.
- Validation schemas belong in `packages/shared` — reuse Zod schemas from there rather than duplicating validation in API routes.
- Every tenant-scoped Mongoose query must include `tenantId` in its filter — the `tenantScope` plugin throws otherwise. This is a security boundary, not a style choice; see the tenancy note in `CLAUDE.md` before touching any model.

## Reporting bugs / requesting features

Use the GitHub issue templates. For anything touching auth, tenant isolation, or PII (staff government ID, bank details, salary), see [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Questions

Open a [Discussion](../../discussions) or a draft PR if you want early feedback on approach before investing in a full implementation.
