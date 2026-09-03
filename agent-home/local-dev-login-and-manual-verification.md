---
name: local-dev-login-and-manual-verification
description: How to actually open this app in a browser against the running local dev stack and log in as a role that can see something — which URL, which account, and the #1 trap (super_admin logging in on a tenant subdomain looks like a successful login but renders almost no UI). Trigger on "show me the UI", "run it and show me", "give me login credentials", "give me correct cred", "I have no sidebar", "no data showing", "which account should I use to test", or any request to manually verify a UI change in a real browser.
---

# Logging into the local dev stack and actually seeing something

This exists because a prior session gave a login that "worked" (page loaded,
no error) but showed **no sidebar and no data** — the user had to explicitly
ask for "correct cred" before the actual root cause (wrong role, not a broken
app) got diagnosed. Read this before answering any "run it and show me" /
"give me credentials" request instead of guessing.

## 1. The URL — get the subdomain right first

CLAUDE.md's own examples use `testschool.<domain>`. **The actual seeded
tenant subdomain in this repo is `testschool-rooted`**, not `testschool` (see
`feat(tenant): support subdomain-less tenants and a general-portal host
label (#42)` — subdomains got a suffix). Confirm the real value instead of
assuming:

```bash
docker exec rooted-mongo-1 mongosh --quiet rooted --eval \
  'db.tenants.find({}, {name:1, subdomain:1}).forEach(t=>printjson(t))'
```

Then the browser URL depends on which compose mode is running (check with
`docker inspect rooted-api-1 --format '{{index .Config.Labels
"com.docker.compose.project.config_files"}}'` — see `restore-dev-stack.md`):

| Mode | `APP_DOMAIN` | URL |
|---|---|---|
| dev / tunnel (`docker-compose.dev.yml` or `.tunnel.yml`) | `localtest.me` | `http://testschool-rooted.localtest.me` (port 80, via nginx) |
| local (`docker-compose.local.yml`, no nginx) | n/a | `http://localhost:5173` won't resolve a tenant by Host header — hit the API directly or use dev/tunnel mode instead |

`*.localtest.me` is public wildcard DNS to `127.0.0.1` — no `/etc/hosts` edit
needed, but confirm `getent hosts testschool-rooted.localtest.me` actually
resolves before assuming DNS is the problem.

## 2. The credentials — and why "no sidebar, no data" isn't a bug

All seeded users share password **`TestPass123!`**. The trap: **`admin@test.local`
is `super_admin`**, and logging in with it directly on the tenant subdomain
*succeeds* — but a bare super_admin gets **zero permissions on tenant
routes** until they explicitly impersonate that tenant
(`apps/api/src/middleware/requirePermission.js`, `effectivePermissionsFor`).
`AppShell`'s nav filters every item on `permissions.includes(...)`, so an
empty permissions array renders almost nothing. Verified against the running
dev stack:

| Account | Role | Nav links after login | What you actually see |
|---|---|---|---|
| `admin@test.local` | `super_admin` | **7** (Dashboard, Tenants, Audit Log, Request Logs, Feature Flags only) | Cross-tenant admin dashboard ("Total Tenants: 2") — **not this school**, no Academic/Staff/Fee sidebar at all |
| `tadmin@testschool.local` | `tenant_admin` | **24** (full Academic/Staff/Fee/Expense/Inventory sections) | The real app, full access |
| `principal@testschool.local` | principal (via role template) | **24**, same as tenant_admin | Same full access, **plus this is the account that renders the Smart/Principal Dashboard** (`dashboard.principal.*`) instead of the plain 4-card fallback |
| `teacher@testschool.local`, `viewer@testschool.local` | limited templates | fewer than 24, by design | A trimmed sidebar is correct here, not a bug — don't mistake this for the super_admin trap |

**Default answer when asked for "correct creds" to just look at the app:**
`tadmin@testschool.local` / `TestPass123!` on the tenant subdomain. Use
`principal@testschool.local` specifically when verifying anything under
`dashboard.principal.*` / the Principal Dashboard.

If the task genuinely requires super_admin (e.g. testing cross-tenant admin
screens), log in at the bare `APP_DOMAIN` host (or `PORTAL_SUBDOMAIN`) first,
go to **Tenants → pick the tenant → Impersonate** button
(`apps/web/src/pages/admin/TenantDetailPage.jsx`, calls `POST
/admin/tenants/:id/impersonate`), which redirects to the tenant subdomain
with an impersonation token — *that's* when a super_admin gets real tenant
permissions, not from logging in on the subdomain directly.

## 3. Quick symptom → cause table

| Symptom | Likely cause |
|---|---|
| No sidebar sections, dashboard shows tenant counts not school data | Logged in as `super_admin` without impersonating — see §2 |
| Sidebar has *some* items but fewer than a tenant_admin | Expected — that role's permission template is narrower, not a bug |
| "Tenant not found" / 404 on load | Wrong subdomain (see §1), or hit a host that doesn't end in `.${APP_DOMAIN}` |
| "invalid csrf token" on every mutating request | Stale/absolute `VITE_API_URL` in `apps/web/.env` — see CLAUDE.md's dev-mode section, not a login issue |
| Page loads but every list/query is empty even for `tadmin` | Check you're pointed at the DB you think you are — dev (`rooted`) vs test (`rooted_test`) have separate, differently-shaped seed data; confirm with the tenant query in §1 against the right container |

## 4. Verifying a claim before making it

If you're about to tell the user "log in as X, you'll see Y" — don't guess
from reading route/permission code alone. Actually do it: a headless
Playwright login (`page.goto(url)`, fill email/password, submit, count nav
links / read body text) against the real running stack takes seconds and
turns a guess into a checked fact. That's how the table in §2 was produced.
