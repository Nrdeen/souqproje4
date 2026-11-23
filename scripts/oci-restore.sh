#!/usr/bin/env bash
set -euo pipefail

# SouqAlGhanam 2.0 — Oracle Always Free Restore Script
# Usage: ./scripts/oci-restore.sh /opt/souqalghanam/backups/pg_souqalghanam_YYYYMMDDTHHMMSSZ.dump

DUMP_FILE="${1:-}"
ENV_FILE="${ENV_FILE:-.env.oci}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

if [ -z "$DUMP_FILE" ] || [ ! -f "$DUMP_FILE" ]; then
  echo "Usage: $0 <path-to-pg-dump-file>" >&2
  exit 1
fi

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

POSTGRES_DB="${POSTGRES_DB:-souqalghanam}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"

echo "[restore] Ensuring pg_trgm extension exists..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

echo "[restore] Restoring ${DUMP_FILE} into '${POSTGRES_DB}'..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges --single-transaction \
  < "$DUMP_FILE"

echo "[restore] Restore complete. Run 'docker compose exec app npm run db:verify-pg' if verifying a JSON->PG snapshot."
