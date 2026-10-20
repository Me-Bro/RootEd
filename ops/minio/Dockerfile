# MinIO server built from the pinned upstream source tag. The minio/minio image
# was pulled from Docker Hub when upstream archived the community edition, and
# quay.io carries no mirror of it. Used by dev/local compose and CI; prod and
# staging run the same release from a host-tagged image (see docker-compose.yml).
#
#   docker build -t rooted-minio:2025-09-07 ops/minio
FROM golang:1.24-alpine AS build
ARG MINIO_VERSION=RELEASE.2025-09-07T16-13-09Z
RUN CGO_ENABLED=0 go install github.com/minio/minio@${MINIO_VERSION}

FROM alpine:3.22
# curl: the compose healthchecks call /minio/health/live with it.
RUN apk add --no-cache ca-certificates curl
COPY --from=build /go/bin/minio /usr/local/bin/minio
EXPOSE 9000 9001
VOLUME /data
ENTRYPOINT ["minio"]
