#!/usr/bin/env bash
# Project status check: git state, docker container health, and the API's
# own /health endpoint. Safe to run locally or remotely over SSH — see
# scripts/STATUS.md for how to check this from another machine.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_PROJECT="rooted"
API_HEALTH_URL="${API_HEALTH_URL:-http://localhost:3001/health}"
EXIT_CODE=0

if [ -t 1 ]; then
  BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; CYAN=$'\033[36m'; RESET=$'\033[0m'
else
  BOLD=''; RED=''; GREEN=''; YELLOW=''; CYAN=''; RESET=''
fi

section() { printf '\n%s%s%s\n' "${BOLD}${CYAN}" "== $1 ==" "$RESET"; }
ok()      { printf '  %s✔%s %s\n' "$GREEN" "$RESET" "$1"; }
warn()    { printf '  %s⚠%s %s\n' "$YELLOW" "$RESET" "$1"; }
fail()    { printf '  %s✘%s %s\n' "$RED" "$RESET" "$1"; EXIT_CODE=1; }

printf '%sRootEd project status%s — %s\n' "$BOLD" "$RESET" "$(date '+%Y-%m-%d %H:%M:%S %Z')"

# ── Git ──────────────────────────────────────────────────────────────────────
section "Git"
cd "$REPO_ROOT" || { fail "cannot cd into repo root: $REPO_ROOT"; exit 1; }

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  fail "not a git repository: $REPO_ROOT"
else
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  LAST_COMMIT="$(git log -1 --format='%h %s (%cr, %an)' 2>/dev/null)"
  DIRTY_COUNT="$(git status --porcelain | wc -l | tr -d ' ')"
  STASH_COUNT="$(git stash list | wc -l | tr -d ' ')"

  printf '  Branch:       %s\n' "$BRANCH"
  printf '  Last commit:  %s\n' "$LAST_COMMIT"

  if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    UPSTREAM="$(git rev-parse --abbrev-ref '@{u}')"
    read -r BEHIND AHEAD <<< "$(git rev-list --left-right --count '@{u}...HEAD')"
    if [ "$AHEAD" -eq 0 ] && [ "$BEHIND" -eq 0 ]; then
      ok "up to date with $UPSTREAM"
    else
      warn "$UPSTREAM: $AHEAD ahead, $BEHIND behind"
    fi
  else
    warn "no upstream tracking branch configured"
  fi

  if [ "$DIRTY_COUNT" -eq 0 ]; then
    ok "working tree clean"
  else
    warn "$DIRTY_COUNT uncommitted change(s)"
    git status --porcelain | sed 's/^/      /'
  fi

  [ "$STASH_COUNT" -gt 0 ] && warn "$STASH_COUNT stash(es)"
fi

# ── Docker containers ────────────────────────────────────────────────────────
section "Docker (project: $COMPOSE_PROJECT)"

if ! docker info >/dev/null 2>&1; then
  fail "docker daemon not reachable"
else
  CONTAINERS="$(docker ps -a \
    --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" \
    --format '{{.Names}}|{{.Label "com.docker.compose.service"}}|{{.Status}}|{{.Ports}}' 2>/dev/null)"

  if [ -z "$CONTAINERS" ]; then
    fail "no containers found for compose project '$COMPOSE_PROJECT' — is the stack up?"
  else
    {
      printf 'SERVICE|CONTAINER|STATE|PORTS\n'
      while IFS='|' read -r NAME SERVICE STATUS PORTS; do
        printf '%s|%s|%s|%s\n' "$SERVICE" "$NAME" "$STATUS" "$PORTS"
      done <<< "$CONTAINERS"
    } | column -t -s '|' | sed 's/^/  /'

    ISSUES=0
    while IFS='|' read -r NAME SERVICE STATUS _PORTS; do
      case "$STATUS" in
        *"(healthy)"*)   ;; # printed in table above
        *"(unhealthy)"*) fail "$SERVICE ($NAME) is unhealthy"; ISSUES=$((ISSUES + 1)) ;;
        "Up "*)          : ;; # running, no healthcheck defined — not an error
        "Exited (0)"*)
          if [ "$SERVICE" != "mongo-init" ]; then
            warn "$SERVICE ($NAME) exited cleanly but isn't a one-off job"
            ISSUES=$((ISSUES + 1))
          fi
          ;;
        "Exited"*|"Restarting"*|"Created"*)
          fail "$SERVICE ($NAME): $STATUS"
          ISSUES=$((ISSUES + 1))
          ;;
      esac
    done <<< "$CONTAINERS"

    [ "$ISSUES" -eq 0 ] && ok "all containers up"
  fi
fi

# ── API /health endpoint ─────────────────────────────────────────────────────
section "API health endpoint ($API_HEALTH_URL)"

if ! command -v curl >/dev/null 2>&1; then
  warn "curl not installed — skipping HTTP check"
else
  HTTP_BODY="$(curl -fsS -m 5 "$API_HEALTH_URL" 2>/dev/null)"
  CURL_EXIT=$?
  if [ $CURL_EXIT -ne 0 ]; then
    fail "unreachable (curl exit code $CURL_EXIT)"
  else
    if command -v jq >/dev/null 2>&1; then
      STATUS_FIELD="$(echo "$HTTP_BODY" | jq -r '.status // "unknown"')"
      echo "$HTTP_BODY" | jq . | sed 's/^/  /'
    else
      STATUS_FIELD="unknown"
      case "$HTTP_BODY" in *'"status":"ok"'*) STATUS_FIELD="ok" ;; *'"status":"degraded"'*) STATUS_FIELD="degraded" ;; esac
      printf '  %s\n' "$HTTP_BODY"
    fi
    case "$STATUS_FIELD" in
      ok)       ok "reports healthy" ;;
      degraded) fail "reports degraded" ;;
      *)        warn "unexpected response body" ;;
    esac
  fi
fi

printf '\n'
if [ "$EXIT_CODE" -eq 0 ]; then
  printf '%s%sOverall: OK%s\n' "$BOLD" "$GREEN" "$RESET"
else
  printf '%s%sOverall: ISSUES FOUND%s\n' "$BOLD" "$RED" "$RESET"
fi

exit "$EXIT_CODE"
