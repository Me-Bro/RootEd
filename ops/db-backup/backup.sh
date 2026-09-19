#!/bin/sh
set -eu

# cron doesn't inherit the container env — entrypoint.sh wrote it here.
. /etc/environment 2>/dev/null || true

export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}"

TS=$(date +%Y%m%d-%H%M%S)
ARCHIVE="/tmp/rooted-${TS}.archive.gz"
# Cleans up on any exit (success, failed dump, failed upload) so a dead
# Minio doesn't leave partial archives filling the container's disk.
trap 'rm -f "$ARCHIVE"' EXIT

mongodump --uri="$MONGODB_URI" --archive="$ARCHIVE" --gzip

PREFIX="s3://${S3_BUCKET}/backups/mongo"
aws --endpoint-url "$S3_ENDPOINT" s3 cp "$ARCHIVE" "${PREFIX}/${TS}.archive.gz"

RETENTION_DAYS="${RETENTION_DAYS:-7}"
CUTOFF=$(date -d "-${RETENTION_DAYS} days" +%Y%m%d)
aws --endpoint-url "$S3_ENDPOINT" s3 ls "${PREFIX}/" | awk '{print $NF}' | while read -r name; do
  fdate="${name%%-*}"
  case "$fdate" in ''|*[!0-9]*) continue ;; esac
  if [ "$fdate" -lt "$CUTOFF" ]; then
    aws --endpoint-url "$S3_ENDPOINT" s3 rm "${PREFIX}/${name}"
  fi
done
