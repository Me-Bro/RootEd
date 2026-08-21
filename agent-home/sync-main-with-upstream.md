---
name: sync-main-with-upstream
description: Checkout local main, fast-forward it to the latest upstream/main, and push the result to origin (fork). Trigger on "checkout to main with latest pull of upstream", "sync main with upstream", "update main from upstream", or similar.
---

# Sync main with upstream

Fork workflow (`origin` = your fork, `upstream` = the source repo). Keeps local
`main` and `origin/main` fast-forwarded to `upstream/main` — no merge commits,
no local drift.

```bash
git checkout main
git fetch upstream
git merge --ff-only upstream/main
git push origin main
```

## Notes

- `--ff-only` refuses if local `main` has diverged (unpushed local commits on
  `main` itself) — if that happens, stop and ask rather than force anything.
- Feature branches should still be cut from a freshly fetched `upstream/main`
  (`git checkout -b feat/x upstream/main`), not from local `main`, in case
  local `main` is stale — see [[git_upstream_convention]].
- Pushing `origin/main` is a separate, explicit step — don't assume it's
  wanted just because `main` was updated locally.
