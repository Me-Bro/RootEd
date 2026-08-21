---
name: restore-dev-stack
description: Fix the recurring "port is already allocated" / crash-loop failures when bringing up the docker-compose.dev.yml web/nginx dev stack (e.g. after stopping it for a local E2E run per feature-tdd-seed-e2e.md). Trigger on "restore the dev stack", "bring the dev containers back up", "web container port already allocated", or "nginx host not found in upstream".
---

# Fix flaky web/nginx startup in the dev stack

`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`
(e.g. restoring the stack after `feature-tdd-seed-e2e.md` step 4's E2E run)
reliably fails 2-3 times in a row on `web`/`nginx`, each failure looking like
a fresh bug: `port is already allocated`, then `nginx: host not found in
upstream "web:5173"`, then `web` exiting with `EAI_AGAIN`. These aren't
independent flakes — the root cause is one real bug in
`docker-compose.dev.yml`, and it's already fixed (see below). If you hit
this again anyway (e.g. a future edit reintroduces it, or on a fresh
checkout before the fix lands), diagnose and fix it the same way.

## Root cause: duplicate `ports:` across compose files

`docker-compose.yml` (base, prod-like) publishes `web` as `'5173:80'`
(container's nginx serving the built static bundle on 80). `docker-compose.dev.yml`
(dev overlay) needs `'5173:5173'` instead (Vite dev server listens on 5173,
nothing listens on 80 in dev mode). Docker Compose **concatenates** `ports:`
lists across `-f` files by default — it does not replace them — so the
merged `web` service ends up with *both* rules trying to publish the same
host port 5173 to two different container ports. Confirm with:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml config | grep -A8 '^  web:'
# BEFORE the fix, this shows TWO ports entries for web, both published: "5173"
```

Which of the two colliding rules "wins" a given `docker compose up` is
non-deterministic — that's the entire flakiness. It shows up as three
different symptoms depending on which rule loses the race:

1. **`Bind for 0.0.0.0:5173 failed: port is already allocated`** — Docker
   tries to bind both, the second one always fails outright.
2. **`web` comes up with no host-published port** (`docker ps` shows bare
   `80/tcp, 5173/tcp` instead of `0.0.0.0:5173->5173/tcp`) — the wrong rule
   (`5173:80`) won silently; Vite is listening on 5173 inside the container
   but nothing maps it to the host.
3. **`nginx` crashes with `host not found in upstream "web:5173"`** —
   downstream of #2: nginx's `nginx.dev.conf` proxies to `web:5173`
   (container-to-container, doesn't need the host mapping at all), but if
   `web` never came up cleanly because of #1, nginx — which resolves
   upstream hostnames once at boot and does not retry — crashes and stays
   crashed until manually restarted.
4. **`web` exits with `npm error ... EAI_AGAIN registry.npmjs.org`** — a
   separate, genuinely transient issue: `web`'s entrypoint runs `npm
   install -g pnpm` on every boot, and right after heavy container
   churn (multiple failed create/recreate cycles from #1) Docker's embedded
   DNS can be briefly unready. Self-clears — just retry.

## The fix (already applied)

`docker-compose.dev.yml`'s `web` service uses the Compose Specification's
`!override` merge tag so its `ports:` *replaces* the base file's instead of
appending to it:

```yaml
  web:
    ports: !override
      - '5173:5173'
```

Requires Docker Compose v2.24+ (`docker compose version` — this repo has
v5.4.0, fine). Verify the fix with the `config | grep` command above: it
should show exactly **one** `ports:` entry for `web`, `target: 5173`.

## If you still see failures after the fix

That means something is stale, not the compose file — don't re-debug the
merge logic:

```bash
# Port-forward proxy (Docker Desktop, Windows/WSL2) can lag a few seconds
# after a stop/rm before it actually releases the host port. If a fresh
# `up -d web` still says "port is already allocated", just wait it out:
until ! (netstat -ano | grep -q ':5173.*LISTENING'); do sleep 1; done

# Force-recreate clears any container left in a half-configured state from
# an earlier failed attempt (empty logs, `Created` but never `Up`):
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --force-recreate web nginx
```

`nginx` depends on `web` — bringing `web` up cleanly first (and letting it
actually start listening) before starting `nginx` avoids the DNS-not-yet-
registered race even under `--force-recreate`.
