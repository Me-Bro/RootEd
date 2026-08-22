---
name: restore-dev-stack
description: Switch this repo's local environment between "dev mode" (docker-compose.dev.yml web/api/nginx) and "e2e mode" (local API + `vite --mode test` on the same ports, per feature-tdd-seed-e2e.md step 4), and fix the recurring "port is already allocated" / crash-loop failures either direction produces. Trigger on "switch to e2e mode", "run local e2e", "restore the dev stack", "bring the dev containers back up", "web container port already allocated", or "nginx host not found in upstream".
---

# Switching between dev mode and e2e mode

Both modes want ports **3001** (API) and **5173** (web) on the host, so
switching direction always means: stop whoever holds those ports, wait for
Docker's port-forward proxy to actually release them (it lags, see below),
then start the other side. Do this in order — starting the new side before
the old holder has released the port produces the exact flaky failures this
doc exists to prevent.

## Switch dev → e2e (run local API + Vite against `.env.test`)

```bash
# 1. Stop only web/api/nginx — leave mongo/redis/minio running, e2e reuses them
docker stop rooted-web-1 rooted-api-1 rooted-nginx-1

# 2. Docker Desktop's port-forward proxy (com.docker.backend.exe on Windows/WSL2)
#    holds 3001/5173 for several seconds after stop, even once the container
#    shows Exited. Starting local processes before this clears reproduces the
#    same "port already allocated" symptom described below — always wait it out:
until ! (netstat -ano | grep -q ':3001.*LISTENING'); do sleep 2; done
until ! (netstat -ano | grep -q ':5173.*LISTENING'); do sleep 2; done

# 3. API first (use the session scratchpad dir for the log file, not /tmp —
#    Git Bash mis-maps /tmp on Windows and the Read tool can't find it there)
cd apps/api && node --env-file=.env.test src/index.js > "<scratchpad>/api-test.log" 2>&1 &
disown

# 4. Then Vite in test mode. If 5173 (or even 5174) is still held, Vite
#    silently falls back to 5175 instead of erroring — check the log, and if
#    it picked a fallback port, kill that instance and re-wait on 5173 rather
#    than pointing Playwright at the wrong port (playwright.config.js's
#    baseURL is hardcoded to 127.0.0.1:5173, it will not follow a fallback):
cd apps/web && nohup npx vite --mode test > "<scratchpad>/vite-test.log" 2>&1 &
disown
sleep 3 && curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5173/
```

Verify both are actually up before running Playwright:
`curl -s -H "Host: testschool.localhost" http://localhost:3001/csrf-token`
should return a token, and the curl above should print `200`.

## Switch e2e → dev (restore the docker stack)

```bash
# 1. Kill the local API/Vite processes from the section above (Windows PIDs,
#    not Git Bash's — use PowerShell Stop-Process, `kill` on the bash-side
#    PID number usually targets the wrong process on Windows):
#    powershell -Command "Stop-Process -Id <pid1>,<pid2> -Force"
# 2. Same port-release wait as above, then bring the stack back with
#    docker compose — NOT `docker start` on the individual containers.
#    `docker start` works but silently skips picking up any compose-file
#    changes; `up -d` is what's documented/tested here.
until ! (netstat -ano | grep -q ':3001.*LISTENING'); do sleep 2; done
until ! (netstat -ano | grep -q ':5173.*LISTENING'); do sleep 2; done
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d web api nginx
```

`api` takes a while (its entrypoint runs `pnpm install` on every boot) —
don't read that as a hang. `nginx` depends on `web`; if `up -d web api nginx`
brings nginx up before web finishes listening, just re-run
`up -d nginx` once web shows healthy.

## Gotcha: the container's own `pnpm install` can corrupt the host's `node_modules`

`docker-compose.dev.yml` bind-mounts the whole repo — including
`node_modules` — into the `api`/`web` containers, and their entrypoints run
`pnpm install` on every boot. If you also ran `pnpm install` on the **host**
around the same time (e.g. while wiring up a new workspace dependency), the
container's Linux `pnpm install` can rewrite a package's `node_modules`
entry as a Linux-style symlink, which Windows/Git Bash then reads back as a
plain 1KB text file instead of a working symlink — `node_modules/jest`
existing but `node --experimental-vm-modules node_modules/jest/bin/jest.js`
throwing `MODULE_NOT_FOUND` is the tell. Fix by removing just that
workspace's `node_modules` and reinstalling from the **host**:

```bash
rm -rf apps/api/node_modules   # or whichever workspace broke
pnpm install
ls -la apps/api/node_modules/jest   # should show `lrwxrwxrwx ... ->`, not `-rw-`
```

## Root cause of the `web`/`nginx` port-collision flake (already fixed)

`docker compose up -d` for this stack used to reliably fail 2-3 times in a
row on `web`/`nginx`, each failure looking like a fresh bug: `port is
already allocated`, then `nginx: host not found in upstream "web:5173"`,
then `web` exiting with `EAI_AGAIN`. These weren't independent flakes — the
root cause was one real bug in `docker-compose.dev.yml`, and it's already
fixed (see below). If you hit this again anyway (e.g. a future edit
reintroduces it, or on a fresh checkout before the fix lands), diagnose and
fix it the same way.

### Duplicate `ports:` across compose files

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

### The fix (already applied)

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

## If you still see failures after all of the above

That means something is stale, not the compose file — don't re-debug the
merge logic. Force-recreate clears any container left in a
half-configured state from an earlier failed attempt (empty logs,
`Created` but never `Up`):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --force-recreate web nginx
```
