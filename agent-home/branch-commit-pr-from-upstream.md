---
name: branch-commit-pr-from-upstream
description: Cut a feature branch from upstream/main, commit with hooks enabled, push to origin (fork), and raise a PR against upstream/main. Trigger on "create a branch from upstream main and raise a PR", "commit and raise the PR", "open a PR using origin for upstream main", or similar.
---

# Branch → commit (with hooks) → PR against upstream

Fork workflow (`origin` = your fork, `upstream` = the source repo, e.g.
`Me-Bro/RootEd` here). Used for actual code contributions — as opposed to
[[sync-main-with-upstream]], which just fast-forwards `main`.

```bash
# 1. Branch from a fresh upstream/main, not local main (which may be stale)
git fetch upstream
git checkout -b <type>/<short-topic> upstream/main

# 2. Stage specific files — never `git add -A`/`.`
git add <file1> <file2> ...

# 3. Commit — let Husky/lint-staged hooks run (pre-commit runs eslint --fix +
#    prettier on staged files and may reformat them). Never --no-verify.
#    Conventional commit type (feat/fix/docs/chore/...), no AI attribution line.
git commit -m "$(cat <<'EOF'
<type>(<scope>): <summary>

<why, 1-3 sentences>
EOF
)"

# 4. Push to your fork
git push -u origin <type>/<short-topic>

# 5. Open the PR against upstream (not origin) main
gh pr create --repo <upstream-owner>/<repo> --base main \
  --head <your-github-username>:<type>/<short-topic> \
  --title "<type>(<scope>): <summary>" \
  --body "$(cat <<'EOF'
## Summary
- ...

## Test plan
- [x] ...
EOF
)"
```

## Notes

- If the pre-commit hook reformats/fixes files, that's expected — the commit
  still lands with the fixed content; no need to amend unless the hook
  genuinely fails (then fix the real issue and commit again, don't retry
  with `--no-verify`).
- After the PR merges, run [[sync-main-with-upstream]] to bring local `main`
  and `origin/main` up to date — don't keep working off the feature branch.
- If asked to "commit and push" with no mention of a branch/PR, that's a
  different, smaller ask — see whether it's meant to land on `main` directly
  (fork-only content, e.g. agent notes) before assuming a branch is wanted.
