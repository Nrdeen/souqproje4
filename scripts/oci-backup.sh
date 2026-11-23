#!/usr/bin/env bash
set -euo pipefail

# SouqAlGhanam 2.0 — Oracle Always Free Backup Script
# Backs up PostgreSQL 16 (custom dump) and local media uploads volume, then prunes expired backups.

BACKUP_DIR="${BACKUP_DIR:-/opt/souqalghanam/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
ENV_FILE="${ENV_FILE:-.env.oci}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

POSTGRES_DB="${POSTGRES_DB:-souqalghanam}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
PG_OUT="${BACKUP_DIR}/pg_${POSTGRES_DB}_${STAMP}.dump"
MEDIA_OUT="${BACKUP_DIR}/media_uploads_${STAMP}.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "[backup] Dumping PostgreSQL database '${POSTGRES_DB}'..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges \
  > "$PG_OUT"

if [ ! -s "$PG_OUT" ]; then
  echo "[backup] ERROR: PostgreSQL dump is empty: $PG_OUT" >&2
  rm -f "$PG_OUT"
  exit 1
fi

echo "[backup] Archiving /app/data/uploads from app container..."
if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T app \
  sh -c 'test -d /app/data/uploads' >/dev/null 2>&1; then
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T app \
    tar -C /app/data -czf - uploads > "$MEDIA_OUT"
else
  echo "[backup] Skipping media tar (no /app/data/uploads directory)."
fi

echo "[backup] Pruning backups older than ${RETENTION_DAYS} days in ${BACKUP_DIR}..."
find "$BACKUP_DIR" -type f \( -name 'pg_*.dump' -o -name 'media_uploads_*.tar.gz' \) -mtime +"$RETENTION_DAYS" -delete

chmod 600 "$PG_OUT" || true
[ -f "$MEDIA_OUT" ] && chmod 600 "$MEDIA_OUT" || true
echo "[backup] Complete: $PG_OUT"
