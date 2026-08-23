#!/usr/bin/env bash
# Rebuild and redeploy the prod stack in "tunnel mode" — behind the Cloudflare
# Tunnel, plain-HTTP nginx (TLS terminates at the Cloudflare edge). This is
# how the live ruralrootcloud.com deployment runs; see docker-compose.tunnel.yml's
# header comment for the tunnel UUID and DNS-onboarding gotcha.
#
# Deploys whatever is currently checked out — this script does not touch git.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLOUDFLARED_SERVICE="${CLOUDFLARED_SERVICE:-cloudflared}"

if [ -t 1 ]; then
  BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; CYAN=$'\033[36m'; RESET=$'\033[0m'
else
  BOLD=''; RED=''; GREEN=''; YELLOW=''; CYAN=''; RESET=''
fi

section() { printf '\n%s%s%s\n' "${BOLD}${CYAN}" "== $1 ==" "$RESET"; }
ok()      { printf '  %s✔%s %s\n' "$GREEN" "$RESET" "$1"; }
warn()    { printf '  %s⚠%s %s\n' "$YELLOW" "$RESET" "$1"; }
fail()    { printf '  %s✘%s %s\n' "$RED" "$RESET" "$1"; }
die()     { fail "$1"; exit 1; }

cd "$REPO_ROOT" || die "cannot cd into repo root: $REPO_ROOT"

printf '%sRootEd tunnel-mode deploy%s — %s\n' "$BOLD" "$RESET" "$(date '+%Y-%m-%d %H:%M:%S %Z')"

# ── Pre-flight ───────────────────────────────────────────────────────────────
section "Pre-flight"

docker info >/dev/null 2>&1 || die "docker daemon not reachable"
ok "docker daemon reachable"

[ -f "$REPO_ROOT/apps/api/.env" ] || die "apps/api/.env missing — required by docker-compose.yml's env_file"
ok "apps/api/.env present"

[ -f "$REPO_ROOT/nginx/nginx.tunnel.conf" ] || die "nginx/nginx.tunnel.conf missing"
ok "nginx/nginx.tunnel.conf present"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  DIRTY_COUNT="$(git status --porcelain | wc -l | tr -d ' ')"
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  printf '  Branch: %s\n' "$BRANCH"
  if [ "$DIRTY_COUNT" -gt 0 ]; then
    warn "$DIRTY_COUNT uncommitted change(s) — the build uses the working tree as-is"
  else
    ok "working tree clean"
  fi
fi

if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet "$CLOUDFLARED_SERVICE"; then
    ok "$CLOUDFLARED_SERVICE service active"
  else
    warn "$CLOUDFLARED_SERVICE service is not active — containers may come up healthy but be unreachable from the internet"
  fi
else
  warn "systemctl not available — skipping cloudflared service check"
fi

# ── Deploy ───────────────────────────────────────────────────────────────────
section "Deploy"

docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build
COMPOSE_EXIT=$?
[ $COMPOSE_EXIT -eq 0 ] || die "docker compose up failed (exit $COMPOSE_EXIT)"
ok "docker compose up -d --build completed"

# ── Post-deploy status ───────────────────────────────────────────────────────
if [ -x "$SCRIPT_DIR/status.sh" ]; then
  section "Post-deploy status"
  "$SCRIPT_DIR/status.sh"
  exit $?
fi

exit 0
