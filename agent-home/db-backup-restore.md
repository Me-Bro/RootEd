---
name: db-backup-restore
description: Daily MongoDB backup and manual restore for the prod/staging deployment — cron mechanics, Minio bucket layout, retention, and the restore command. Trigger on "backup the database", "restore a backup", "db backup cron", or "restore.sh".
---

# DB backup & restore

Daily automated MongoDB backup + manual-only restore, for **prod/staging
only** (not local/dev/test — see "Not covered" below). Runs as a separate
`backup` container defined in `docker-compose.yml`, not application code.

## How the daily backup works

`ops/db-backup/` builds a `mongo:7`-based image (ships `mongodump`/
`mongorestore` natively) with `cron` and the AWS CLI installed. The
container's only job is to run `cron -f` in the foreground
(`entrypoint.sh`), with a baked-in daily job:

```
0 2 * * * root /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1
```

Each run (`ops/db-backup/backup.sh`):
1. `mongodump --uri="$MONGODB_URI" --archive --gzip` — the same scoped
   Mongo credential `api` already uses for that environment
   (`rooted_prod_app`→`rooted`, `rooted_uat_app`→`rooted_uat`). The URI's
   own database-name path segment already scopes the dump to just that DB —
   confirmed empirically, no `--excludeDB` needed.
2. Uploads the gzip archive to the **existing** Minio bucket the app
   already uses, under a new prefix:
   `s3://<bucket>/backups/mongo/<YYYYMMDD-HHMMSS>.archive.gz`.
3. Prunes objects under that prefix older than `RETENTION_DAYS` (default
   `7`) by comparing the date prefix in each object's filename.

Uploads/listing/pruning go through the **AWS CLI** (`aws --endpoint-url
$S3_ENDPOINT s3 ...`), not Minio's own `mc` client — `mc` is archived
upstream (`dl.min.io` returns `410 Gone`, "no longer maintained"). AWS CLI
works against any S3-compatible endpoint via `--endpoint-url` and is
actively maintained.

**Cron env gotcha**: `cron.d` jobs don't inherit the container's
environment. `entrypoint.sh` snapshots the vars `backup.sh` needs to
`/etc/environment` before starting cron — if you ever touch that snapshot
regex, verify it by running the container via its real entrypoint (not by
calling `backup.sh` directly with a full shell env), since a narrow regex
can silently drop vars without erroring.

## Bucket layout

```
s3://<S3_BUCKET>/backups/mongo/<YYYYMMDD-HHMMSS>.archive.gz
```

Same bucket the app already writes to (`S3_BUCKET` from `apps/api/.env`),
new prefix only — no new bucket, no new Minio credential.

## Retention

Rolling `RETENTION_DAYS` (default `7`, set in `docker-compose.yml`'s
`backup` service). Pruning happens as the last step of every `backup.sh`
run — there's no separate cleanup job.

## Restore — manual only, never automated

```bash
docker compose run --rm backup restore.sh <YYYYMMDD-HHMMSS>.archive.gz

# Optional: restrict to one namespace (useful if the archive ever contains
# more than one environment's data, e.g. a full-instance dump):
docker compose run --rm -e NS_INCLUDE='rooted.*' backup restore.sh <archive>
```

`restore.sh` is **never** wired to cron, an API route, or the UI — it only
runs when an operator explicitly invokes it. Before touching data, it:
1. Prints the target Mongo URI with credentials masked
   (`mongodb://***@host:port/...`).
2. Warns that `mongorestore --drop` is about to empty every collection in
   the archive before restoring it.
3. Sleeps 10 seconds — `Ctrl+C` aborts.

There is no dry-run mode — `mongorestore` doesn't have a real one.
`NS_INCLUDE` scoping is the only preview-adjacent safety lever.

## Not covered

- **`docker-compose.local.yml`/`docker-compose.dev.yml`/`.test.yml`** — these
  run their own project-local, unauthenticated `mongo` service with no
  `shared` network at all. The `backup` service's dual-network membership
  (`rooted` + external `shared`) only applies to the prod/staging topology.
  Backing up local/dev data was explicitly out of scope for this facility.
- **Minio file-bucket contents** (uploaded documents/photos) — Mongo only.
  Uploaded files are not covered by this facility.
- Monitoring/alerting on a failed or missed run — check
  `docker logs <backup container>` / `/var/log/backup.log` inside it
  manually if a backup is suspected to have failed.

## Deploying this

This repo's compose files only describe the service — bringing it up on
the actual host is a separate, manual step:

```bash
# On the prod host, inside the RootEd_prod checkout:
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml build backup
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d backup

# On the staging host, inside the RootEd_uat checkout:
docker compose -f docker-compose.yml -f docker-compose.tunnel.uat.yml build backup
docker compose -f docker-compose.yml -f docker-compose.tunnel.uat.yml up -d backup
```

Per [[prod-staging-mongo-migration]]'s existing convention, compose-file
changes in this repo are **mirrored by hand** into the `RootEd_uat`
checkout, not synced automatically — do the same for this ticket's
`docker-compose.yml`/`ops/db-backup/` changes if they haven't already
propagated there.

`deploy.resources.limits` (0.5 CPU / 512M) on the `backup` service is
enforced directly by the Docker engine even outside Swarm mode — confirmed
via `docker inspect` showing the container's `HostConfig.Memory`/
`NanoCpus` set accordingly. No Swarm-only fallback syntax needed.
