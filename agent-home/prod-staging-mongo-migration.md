---
name: prod-staging-mongo-migration
description: Handoff/status doc for standing up rooted-uat.ruralrootcloud.com as a staging environment alongside the live rooted.ruralrootcloud.com prod deployment, sharing one Mongo instance with separate databases. Trigger on "staging setup", "rooted-uat", "shared mongo", "prod/staging split", or picking up where a prior session on this left off.
---

# Prod + staging split, shared Mongo — status and continuation guide

## Goal

Run RootEd as two environments on the same box:
- **prod**: `rooted.ruralrootcloud.com` (live)
- **staging**: `rooted-uat.ruralrootcloud.com` (live — stood up this session)

Two separate Docker Compose stacks (two checkouts), sharing **one** Mongo
instance with separate databases (`rooted` for prod, `rooted_uat` for
staging), behind the same Cloudflare Tunnel.

## Key architectural decision — read this before touching APP_DOMAIN

Do **not** set staging's `APP_DOMAIN` to `rooted-uat.ruralrootcloud.com`
directly. Cloudflare's free Universal SSL cert only covers one subdomain
level (`*.ruralrootcloud.com`); a second-level wildcard
(`*.rooted-uat.ruralrootcloud.com`) is not covered and TLS will fail (this is
exactly why prod already works the way it does — see
`docker-compose.tunnel.yml`'s header comment).

Instead, reuse the existing `PORTAL_SUBDOMAIN` mechanism
(`apps/api/src/config/env.js`, `getPortalHost()`): both environments keep
`APP_DOMAIN=ruralrootcloud.com`, and differ only in `PORTAL_SUBDOMAIN`:

| | APP_DOMAIN | PORTAL_SUBDOMAIN | portal host | tenant host |
|---|---|---|---|---|
| prod | `ruralrootcloud.com` | `rooted` | `rooted.ruralrootcloud.com` | `<tenant>-rooted.ruralrootcloud.com` |
| staging | `ruralrootcloud.com` | `rooted-uat` | `rooted-uat.ruralrootcloud.com` | `<tenant>-rooted-uat.ruralrootcloud.com` |

Both stay one level under `ruralrootcloud.com`, so both are covered by the
existing cert. Also set the matching `VITE_PORTAL_SUBDOMAIN` web build arg.

## Status: Phase 1 (Mongo/Redis/Minio hardening) — DONE and verified

### What changed

**Mongo** — extracted out of RootEd's own `docker-compose.yml` into a
standalone project at `~/Desktop/rooted-mongo-shared/docker-compose.yml`, so
neither the prod nor staging app stack owns its lifecycle. It reuses the
pre-existing `rooted_mongo_data` volume (no data migration — same data
directory, just a different container/project on top of it). Container name:
`rooted-mongo`. Network: external `rooted-shared-net` (create once with
`docker network create rooted-shared-net` — already done on this box).
Published to `127.0.0.1:27017` only (not `0.0.0.0`) for host-side tooling.

- `--auth` is enabled. **Gotcha**: `--replSet` + `--auth` requires
  `--keyFile` even for a single-member replica set, or mongod refuses to
  start (`security.keyFile is required when authorization is enabled with
  replica sets`). The keyfile lives at
  `~/Desktop/rooted-mongo-shared/mongo-keyfile`, generated via a throwaway
  `mongo:7` container so its ownership (uid 999, matching the image's
  `mongodb` user) is correct — regenerate the same way if it's ever lost,
  don't just `openssl rand` it directly on the host.
- Users created (root + 3 scoped app users, readWrite on their own DB **and**
  its `_monitoring` counterpart, since `MONITORING_MONGODB_URI` reuses the
  same credential): `root` (admin), `rooted_prod_app`→`rooted`,
  `rooted_test_app`→`rooted_test`, `rooted_uat_app`→`rooted_uat`
  (pre-provisioned for staging, not yet consumed by anything).
- Cross-DB access confirmed denied (e.g. `rooted_prod_app` cannot read
  `rooted_uat`).

**Redis** — `requirepass` via a mounted `redis/redis.conf` (gitignored,
contains the real password). Bound to `127.0.0.1:6379` only. The `redis`
service in `docker-compose.yml` also sets `REDISCLI_AUTH` so the healthcheck
(`redis-cli ping`) keeps working without putting the password on a command
line. Confirmed `NOAUTH` when unauthenticated.

**Minio** — root credentials rotated off the default `minioadmin`/`minioadmin`
(confirmed old creds now rejected). Bound to `127.0.0.1:9000`/`9001` only.
App switched from using root directly to scoped least-privilege users:
`rooted_prod_app` → `rooted` bucket only, `rooted_test_app` → `rooted-test`
bucket only (via `mc admin policy` + `mc admin user`, both run through
`docker exec rooted-minio-1 mc ...` since `mc` is bundled in the image).
Cross-bucket access confirmed denied.

### Where secrets live now

- `apps/api/.env` — prod, host-side dev-mode values (real secrets, gitignored)
- `apps/api/.env.test` — test/E2E values (real secrets; **was git-tracked,
  now untracked** — see below)
- `apps/api/.env.test.example` — new, git-tracked placeholder version of the
  above (`CHANGE_ME` values), mirrors the existing `.env`/`.env.example` split
- `/home/vibhanshu/Desktop/RootEd_ALL/RootEd_prod/.env` (repo root, new,
  gitignored) — Docker Compose variable-substitution only (`MONGODB_URI`,
  `MONGODB_URI_TEST`, `REDIS_URL`, `REDIS_PW`, `MINIO_ROOT_USER`,
  `MINIO_ROOT_PASSWORD`, `COMPOSE_PROJECT_NAME`). Not loaded by the api
  container directly — `docker-compose.yml` references these via `${VAR}` so
  no credential is hardcoded in the tracked YAML.
- `redis/redis.conf` (new, gitignored)
- The equivalent set of files under `RootEd_ALL/RootEd_uat/` for staging.

No new secret values are recorded in this doc — read them from the files
above. **Mongo's root/admin password was lost** (never written to any file
from the original Phase 1 session) and had to be recovered mid-session by
briefly restarting `rooted-mongo` with `--auth`/`--keyFile` removed from its
command, resetting it via an unauthenticated local connection, then
restoring `--auth`. It's rotated now — ask whoever ran that recovery for the
current value, or repeat the same procedure (`~/Desktop/rooted-mongo-shared/docker-compose.yml`)
if it's lost again. `rooted_uat_app`'s password was reset in the same
no-auth window and is recorded in `RootEd_uat/.env` /
`RootEd_uat/apps/api/.env` as usual.

### Repo changes made (uncommitted — nothing has been committed this session)

- `docker-compose.yml` — removed `mongo`/`mongo-init` services and the
  `mongo_data` volume; `api` now joins an external `shared` network
  (`rooted-shared-net`); `MONGODB_URI`/`REDIS_URL`/Minio root creds now come
  from `${VAR}` substitution instead of literals
- `docker-compose.test.yml` — same treatment (it also referenced the
  now-removed in-project `mongo` hostname; would have silently broken local
  E2E setup otherwise)
- `.gitignore` — added `apps/api/.env.test` and `redis/redis.conf`
- `apps/api/.env.test` untracked (`git rm --cached`), replaced by
  `apps/api/.env.test.example`

Run `git status --short` to see the live diff before deciding whether/how to
commit.

### Not touched — known residual risk

`docker-compose.dev.yml` and `docker-compose.local.yml` still each define
their **own** unauthenticated `mongo`/`mongo-init` service using the same
default volume name (`mongo_data`, which resolves to `rooted_mongo_data`
under this directory's default Compose project name). If anyone runs either
of those from this same `/home/vibhanshu/Desktop/RootEd` checkout while the
standalone `rooted-mongo` is also running, expect a volume-lock conflict.
Not fixed — out of scope for the prod/staging split, flagged only.

### Unrelated discovery — do not touch without checking first

There's a second, unrelated Mongo container on this box (`mongodb`, mongo:8,
project at `~/Desktop/mongodb/docker-compose.yml`, root/password creds). It
belongs to a **different project, LearnCloud** (`~/Desktop/LearnCloud`), not
RootEd. It currently has no Docker network attached at all (fully
unreachable) — likely a side effect of losing the port-27017 race against
RootEd's old `rooted-mongo-1` at some point. The user wasn't sure if
LearnCloud still needs it. **Not part of this task — leave it alone** unless
the user has separately resolved that question.

### Operational note: live-container actions get blocked by the harness

Any Bash command that stops/recreates a **live** container (prod Mongo,
Redis, Minio, api, or a `docker compose up`) may get denied by Claude Code's
auto-mode safety classifier, even mid-task with prior user approval. When
that happens, print the exact command and ask the user to run it themselves,
or ask them to explicitly re-confirm ("go ahead and do it yourself") — a
direct, explicit repeat of authorization sometimes lets the same command
through on retry. Don't try to route around a denial with a different tool.

## Status: Phases 2–4 — DONE and verified

Both `rooted.ruralrootcloud.com` (prod) and `rooted-uat.ruralrootcloud.com`
(staging) resolve and return 200 through the tunnel right now. Staging lives
at `/home/vibhanshu/Desktop/RootEd_ALL/RootEd_uat` (sibling of this checkout,
matching how this directory itself sits under `RootEd_ALL/` — not the
`/home/vibhanshu/Desktop/RootEd-uat` path originally sketched below).

### Phase 2 — the staging clone (as actually built)

- Cloned `origin`, branch `main`, into `RootEd_ALL/RootEd_uat`.
- **The Phase 1 `docker-compose.yml`/`docker-compose.test.yml`/`.gitignore`
  edits below were never committed/pushed**, so the fresh clone didn't have
  them — mirrored the same edits into the uat checkout by hand (not a
  commit) so both working trees match. If those Phase 1 changes get committed
  to `main` later, this manual mirror becomes redundant but harmless.
- `COMPOSE_PROJECT_NAME=rooted-uat` in `RootEd_uat/.env`; also added
  `COMPOSE_PROJECT_NAME=rooted` to **this** checkout's `.env` — not
  optional hygiene, see the bind-mount gotcha below.
- Fresh secrets generated for staging (`JWT_ACCESS_SECRET`,
  `JWT_REFRESH_SECRET`, `MASTER_ENCRYPTION_KEY`, `CSRF_SECRET`, its own
  `redis/redis.conf` password, its own Minio root creds) — none copied from
  prod. `rooted_uat_app`'s Mongo password is set (see "Where secrets live
  now" above for the root-password-recovery story); staging's E2E slice
  (`apps/api/.env.test`) reuses prod's
  `rooted_test_app`/`rooted_test` — disposable fixture data, not a tenancy
  boundary, so no separate `rooted_uat_test` DB was created.
- `docker-compose.tunnel.uat.yml` overlay: nginx `8080:80`, api `3002:3001`,
  web `5174:80`; redis unpublished from host (api reaches it by Docker
  service name only); **Minio published loopback-only on `9002`** (not fully
  unpublished as first planned) — the Cloudflare Tunnel process runs on the
  host and needs a `localhost:PORT` target for the `storage-rooted-uat`
  ingress rule, same as prod's `storage-rooted` rule targets `localhost:9000`.
  `PORTAL_SUBDOMAIN=rooted-uat` / `VITE_PORTAL_SUBDOMAIN=rooted-uat`.
- Brought up with
  `docker compose -f docker-compose.yml -f docker-compose.tunnel.uat.yml up -d --build`
  from `RootEd_uat` — all 5 containers healthy.

### Phase 3 — tunnel/DNS (as actually built)

- `cloudflared-rooted` is a **user-level** systemd unit
  (`systemctl --user restart cloudflared-rooted`, `systemctl --user status
  cloudflared-rooted`) — no sudo needed, contrary to what "systemd unit"
  might suggest. Config: `~/.cloudflared/rooted-prod-config.yml`. Always
  back up this file before editing (`cp` a timestamped copy) and run
  `cloudflared --config <file> tunnel ingress validate` before restarting.
- **cloudflared's wildcard ingress matching is full-label only**
  (`*.example.com`), confirmed empirically with
  `cloudflared --config <file> tunnel ingress rule https://<host>`: neither
  `*-rooted-uat.ruralrootcloud.com` nor `*rooted-uat.ruralrootcloud.com`
  matched `tenant1-rooted-uat.ruralrootcloud.com` — both silently fell
  through to the generic `*.ruralrootcloud.com` catch-all (which would have
  routed a staging tenant's traffic to **prod's** nginx). There is no
  ingress-level wildcard that means "anything ending in
  `-rooted-uat.ruralrootcloud.com`". Every staging hostname needs its own
  **exact** `hostname:` line above the catch-all:
  ```yaml
  - hostname: "storage-rooted-uat.ruralrootcloud.com"
    service: http://localhost:9002
  - hostname: "rooted-uat.ruralrootcloud.com"
    service: http://localhost:8080
  - hostname: "*.ruralrootcloud.com"   # existing catch-all, must stay last
    service: http://localhost:80
  ```
  **Onboarding a new staging tenant = add one more exact `hostname:` line
  here (`<tenant>-rooted-uat.ruralrootcloud.com` → `http://localhost:8080`)
  above the catch-all, then `systemctl --user restart cloudflared-rooted`** —
  in addition to the DNS route below. This is more manual than prod, which
  gets away with a single wildcard rule because all of prod's hostnames
  route to the same place (port 80).
- **`*.ruralrootcloud.com` already has a wildcard DNS record** — confirmed
  `rooted-uat.ruralrootcloud.com` resolved to the same Cloudflare edge IPs as
  `rooted.ruralrootcloud.com`, and actually served the staging app, *before*
  any DNS route was run for it. So `cloudflared tunnel route dns` is not
  strictly required for a new hostname under this zone to become reachable —
  only the ingress-config line above is. Ran it anyway for
  `rooted-uat.ruralrootcloud.com` and `storage-rooted-uat.ruralrootcloud.com`
  (`--overwrite-dns` makes it idempotent/safe either way), to keep an
  explicit CNAME per hostname matching prod's documented convention:
  `cloudflared tunnel route dns --overwrite-dns b14594a9-bc18-417a-88ae-a5f3d23c02b5 <hostname>`
  (tunnel **UUID**, not the name `rooted-prod` — see
  `docker-compose.tunnel.yml`'s header comment for why).

### Phase 4 — verify (done)

- `curl https://rooted.ruralrootcloud.com` and
  `curl https://rooted-uat.ruralrootcloud.com` both return 200, independently.
- `curl https://storage-rooted-uat.ruralrootcloud.com/minio/health/live`
  returns 200.
- Cross-tenant Mongo access confirmed denied both directions
  (`rooted_uat_app` → `rooted` and `rooted_prod_app` → `rooted_uat` both get
  `not authorized`); each app user reads its own DB fine.

## Gotchas discovered this session (read before touching either checkout again)

**This checkout was renamed from `RootEd` to `RootEd_prod` after the live
prod containers were already created.** Their bind mounts (nginx's
`nginx.tunnel.conf`/`certs`, redis's `redis.conf`) store the **absolute host
path at creation time** — `docker restart` on any of those containers fails
outright once the old path is gone (`docker inspect` also still shows the old
`working_dir` label; harmless on its own, but a strong hint this landmine is
present). Mid-session, `docker restart rooted-nginx-1` hit exactly this and
took prod's nginx down completely. **The fix, and the only safe way to touch
any bind-mounted prod container going forward: reconcile via
`docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d`
from the *current* directory** (never a bare `docker restart`/`docker stop`+
`start` on `rooted-nginx-1` or `rooted-redis-1`) — this is exactly why
`COMPOSE_PROJECT_NAME=rooted` had to be pinned in `.env` first, so compose
reconciles the *existing* `rooted` project instead of spinning up a
duplicate. Containers without bind mounts (api, web, minio — build-only or
named-volume-only) aren't affected and compose leaves them running untouched
if nothing else about their config changed.

**Unrelated unfixed prod incident found and fixed along the way:** prod was
returning 502 for several minutes before any of this session's tunnel work
started — `rooted-web-1` had cleanly restarted (`ExitCode 0`, not OOM) at
some point, got a new IP on the `rooted_rooted` bridge network, and
`rooted-nginx-1` (which hadn't restarted since) kept trying the old IP
(`nginx` resolves its `upstream { server web:80; }` once at startup, not
dynamically). Fixed by the same compose-reconcile action above, which
recreated nginx and let it re-resolve. Root cause of *why* `web` restarted on
its own is still unknown — worth keeping an eye on if it recurs.

## Still open / future work

- No staging tenant has been created yet. Creating one needs: the org-creation
  flow run against `rooted-uat.ruralrootcloud.com`, then **both** a new
  ingress line in `~/.cloudflared/rooted-prod-config.yml` (see Phase 3 above)
  **and** a `cloudflared tunnel route dns` call for
  `<tenant>-rooted-uat.ruralrootcloud.com`, then restart the tunnel unit.
- Minio least-privilege scoping (like prod's `rooted_prod_app` bucket-scoped
  user) was not set up for staging — its `apps/api/.env`/`.env.test` use
  Minio **root** creds directly. Low stakes (staging data, not prod), but a
  reasonable follow-up for parity.
- The Phase 1 `docker-compose.yml`/`docker-compose.test.yml`/`.gitignore`
  changes, and the `.env.test`→`.env.test.example` rename, are still
  uncommitted in *both* checkouts. Run `git status --short` in each before
  deciding whether/how to commit — they should be committed and pushed
  together (or the uat checkout's manual mirror will drift from what's
  actually in `main`).
