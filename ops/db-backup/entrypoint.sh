#!/bin/sh
set -eu

# cron.d jobs run with almost no environment — snapshot the vars backup.sh
# needs before starting cron, or $MONGODB_URI is empty inside the job.
printenv | grep -E '^(MONGODB_URI=|RETENTION_DAYS=|S3_)' > /etc/environment

exec cron -f
