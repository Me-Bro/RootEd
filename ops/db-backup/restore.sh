#!/bin/sh
set -eu

FILE="${1:?Usage: restore.sh <backup-filename e.g. 20260919-020000.archive.gz>}"

# cron doesn't inherit the container env — entrypoint.sh wrote it here.
. /etc/environment 2>/dev/null || true

export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}"

LOCAL="/tmp/${FILE}"
trap 'rm -f "$LOCAL"' EXIT
aws --endpoint-url "$S3_ENDPOINT" s3 cp "s3://${S3_BUCKET}/backups/mongo/${FILE}" "$LOCAL"

# Never echo the raw connection string — mask credentials before printing.
SAFE_URI=$(printf '%s' "$MONGODB_URI" | sed 's#://[^@]*@#://***@#')
echo "About to restore ${FILE} into ${SAFE_URI}"
echo "This runs mongorestore --drop — matching collections are EMPTIED first."
echo "Ctrl+C now to abort. Proceeding in 10s..."
sleep 10

if [ -n "${NS_INCLUDE:-}" ]; then
  mongorestore --uri="$MONGODB_URI" --archive="$LOCAL" --gzip --drop --nsInclude="$NS_INCLUDE"
else
  mongorestore --uri="$MONGODB_URI" --archive="$LOCAL" --gzip --drop
fi
