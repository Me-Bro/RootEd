#!/bin/sh
set -eu

# cron.d jobs run with almost no environment — snapshot the vars backup.sh
# needs before starting cron, or $MONGODB_URI is empty inside the job.
# `|| true`: grep exits 1 when none of these vars happen to be set, and
# `set -e` would otherwise kill the entrypoint before it ever reaches cron
# or a passed-through command.
printenv | grep -E '^(MONGODB_URI=|RETENTION_DAYS=|S3_)' > /etc/environment || true

# A command (e.g. `docker compose run --rm backup restore.sh <file>`) means
# this is a one-off operator invocation, not the long-running cron daemon —
# run it and exit instead of always falling into cron.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

exec cron -f
