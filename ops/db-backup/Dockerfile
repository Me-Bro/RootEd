FROM mongo:7

# mongo:7 already ships mongodump/mongorestore. cron runs the daily
# schedule; awscli uploads/prunes dumps in the same Minio bucket the app
# uses (--endpoint-url works against any S3-compatible target). Minio's own
# `mc` client is archived upstream (dl.min.io returns 410 Gone) — not used.
RUN apt-get update && apt-get install -y --no-install-recommends cron awscli ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/backup.sh \
  && echo "0 2 * * * root /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1" > /etc/cron.d/db-backup \
  && chmod 0644 /etc/cron.d/db-backup \
  && touch /var/log/backup.log

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
