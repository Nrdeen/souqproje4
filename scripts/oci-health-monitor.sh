#!/usr/bin/env bash
set -euo pipefail

# SouqAlGhanam 2.0 — Oracle Always Free Health & Disk Monitoring Script
# Suitable for cron every 5 minutes or systemd timer on the OCI VM.

APP_BASE_URL="${APP_BASE_URL:-http://127.0.0.1:3000}"
DISK_WARN_PCT="${DISK_WARN_PCT:-85}"
MEM_WARN_PCT="${MEM_WARN_PCT:-90}"

check_http() {
  local endpoint="$1"
  local body
  local code
  body="$(curl -sS --max-time 5 -w '\n%{http_code}' "${APP_BASE_URL}${endpoint}" || true)"
  code="$(printf '%s\n' "$body" | tail -n1)"
  if [ "$code" != "200" ]; then
    echo "[ALERT] Probe ${endpoint} returned HTTP ${code:-unreachable}" >&2
    return 1
  fi
  echo "[OK] ${endpoint} -> HTTP 200"
}

check_http "/api/v1/live"
check_http "/api/v1/ready"

DISK_USED="$(df -P / | awk 'NR==2 { gsub(/%/, "", $5); print $5 }')"
if [ "${DISK_USED:-0}" -ge "$DISK_WARN_PCT" ]; then
  echo "[ALERT] Root disk usage is ${DISK_USED}% (>= ${DISK_WARN_PCT}%)" >&2
  exit 2
fi
echo "[OK] Root disk usage: ${DISK_USED}%"

if command -v free >/dev/null 2>&1; then
  MEM_USED="$(free | awk '/Mem:/ { printf("%.0f", ($3/$2)*100) }')"
  if [ "${MEM_USED:-0}" -ge "$MEM_WARN_PCT" ]; then
    echo "[WARN] Memory usage is ${MEM_USED}% (>= ${MEM_WARN_PCT}%)" >&2
  else
    echo "[OK] Memory usage: ${MEM_USED}%"
  fi
fi
