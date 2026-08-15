## What

<!-- What does this PR change? -->

## Why

<!-- What problem does this solve, or what does it enable? -->

## How to test

<!-- Steps to verify this locally -->

## Checklist

- [ ] `pnpm lint` passes
- [ ] `pnpm --filter api test` passes (if API code changed)
- [ ] Added/updated tests for the change
- [ ] Any tenant-scoped Mongoose query includes `tenantId` in its filter
- [ ] No secrets, tokens, or `.env`/cookie files included in the diff
- [ ] Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
