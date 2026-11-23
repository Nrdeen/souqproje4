# Phase 6D — Production Readiness, Infrastructure Architecture & Operations Runbook

## 1. Production Infrastructure Architecture (Saudi Arabia / MENA Target)

SouqAlGhanam 2.0 operates as a cohesive full-stack TypeScript application:
- **Express + WebSocket Runtime (`server.ts`)**: Serves the compiled React Vite SPA (`dist/`), REST API (`/api/v1/*`), real-time WebSocket notifications (`/ws`), and authorization-gated media proxy/range streaming (`/api/v1/media/:id`).
- **PostgreSQL 15+ (`pg_trgm`)**: Primary persistence for all 26 tables, Drizzle ORM queries, transactions, sessions, notifications, and normalized Arabic trigram search.
- **Private Cloud Object Storage (`S3` / `R2` / `GCS`)**: Binary image & video storage completely externalized from PostgreSQL and container ephemeral disks.

### Recommended Architecture for Saudi Market Launch

| Layer | Recommended Option | Rationale |
| --- | --- | --- |
| **DNS, TLS, WAF & DDoS** | **Cloudflare Pro** (with Riyadh PoP edge) | Lowest TTFB inside KSA, free TLS, rate limiting at edge, WebSocket pass-through, DDoS shield. |
| **Backend & SPA Compute** | **Option A (Launch): Managed Container Service / VPS in `me-central-1` (Riyadh) or Bahrain** (e.g., AWS ECS Fargate / App Runner in `me-central-1`, or Hetzner/DO/Oracle Riyadh-adjacent VPS + Docker) | Keeps Express + stateful in-memory/WS hub unified (`1–2` instances initially; WebSocket `/ws` sticky sessions via ALB or single container). Note: Horizontal multi-instance scaling later requires moving `RateLimiter` and `realtime.ts` pub/sub to Redis. |
| **Managed PostgreSQL** | **AWS RDS PostgreSQL 15+ (`me-central-1` Riyadh)** or **Supabase / Neon / Cloud SQL** (EU/MENA nearest region) | Automated daily snapshots + Point-in-Time Recovery (PITR), SSL `verify-full`, `pg_trgm` extension supported natively. |
| **Private Media Storage** | **Cloudflare R2** (with `MEDIA_STORAGE_PROVIDER=r2`) or **AWS S3 (`me-central-1` Riyadh)** | R2 offers zero egress fees for image/video streaming through `/api/v1/media/:id`; S3 Riyadh provides local KSA data residency. Private buckets only (Block Public Access ON). |
| **Monitoring & Alerts** | **UptimeRobot / Better Stack** polling `/api/v1/ready` + **Structured Stdout Logs** (CloudWatch / Grafana Loki) + **Sentry** (optional later) | Immediate alert on 5xx spikes, DB connection failure, or `/api/v1/ready` returning HTTP 503. |

### Comparison of Deployment Topologies

| Topology | Est. Monthly Cost (USD) | Operational Complexity | Reliability & Scaling | Best For |
| --- | --- | --- | --- | --- |
| **1. Single Managed VPS + Docker + Nginx + Managed PG + Cloudflare R2** (e.g. 2 vCPU / 4 GB VPS + Managed PG 15 Basic + R2) | **~$35 – $65 / mo** | Medium (OS/Docker updates, certbot/Cloudflare Origin CA) | Single node (~500–1,500 concurrent active users), easy backup/restore | Bootstrapped KSA MVP launch with predictable low cost |
| **2. Managed PaaS (Railway / Render / Fly.io + Managed PG + R2)** | **~$45 – $95 / mo** | Low (git/container auto-deploy, zero OS maintenance) | High convenience, automatic HTTPS + WS, instant rollbacks (higher latency to KSA unless EU/MENA PoP chosen) | Fast team iteration with minimal DevOps overhead |
| **3. Cloud Native KSA-Resident (AWS `me-central-1` Riyadh: ECS Fargate / ALB + RDS PostgreSQL Multi-AZ / Single-AZ + Private S3)** | **~$120 – $260 / mo** (Single-AZ RDS) / **~$300+** (Multi-AZ) | High (VPC, IAM, RDS subnets, ALB sticky WebSockets) | Highest KSA residency compliance, sub-25ms Riyadh RTT, automated Multi-AZ failover | Regulated / high-traffic growth phase |

*Cost assumptions: 10–30k monthly visits, ~25–100 GB media storage, ~100–300 GB monthly media egress (S3 charges ~$0.09/GB egress; R2 charges $0 egress).*

---

## 2. Production Security & Reliability Controls Implemented

1. **HTTP Headers & Strict Production CSP (`server/auth/middleware.ts`, `public/theme-init.js`)**:
   - Externalized theme initialization script into `/public/theme-init.js` so `index.html` contains zero inline scripts.
   - In production (`NODE_ENV=production`), Express sends `Content-Security-Policy` with `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, plus `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Cross-Origin-Opener-Policy: same-origin`, and `Permissions-Policy`.
2. **Reverse-Proxy Keep-Alive & Graceful Shutdown (`server.ts`)**:
   - Sets `keepAliveTimeout = 65_000ms` and `headersTimeout = 66_000ms` (exceeding standard 60s ALB/Nginx idle windows to prevent intermittent HTTP 502 errors).
   - Tracks `shuttingDown` so `/api/v1/health`, `/api/v1/live`, and `/api/v1/ready` immediately return `503` on `SIGTERM`/`SIGINT`, allowing load balancers to stop routing new requests while `httpServer.close()` drains active requests for up to 10 seconds before closing remaining sockets and releasing the DB pool.
   - Emits a startup security warning if `NODE_ENV=production` is launched with `TRUST_PROXY=0`.
3. **Probe Endpoints Decoupled from Session Auth (`server.ts`)**:
   - `GET /api/v1/live`: Process liveness (`{ ok: true, status: "live", uptimeSec }`) without DB I/O.
   - `GET /api/v1/health`: Lightweight backend & media check (`{ ok: true, backend }`).
   - `GET /api/v1/ready`: Detailed readiness probe checking PostgreSQL (`SELECT 1`) and media storage health (`{ ok, status, backend, mediaProvider, checks, uptimeSec }`).
   - All three run before `attachAuth` so health probes never hit the `sessions` table.
4. **PostgreSQL Scaling Fixes (`server/repositories/postgresRepository.ts`)**:
   - `getAdminOverview()`: Replaced 4 full-table scans (`users`, `seller_profiles`, `listings`, `reports`) with parallel SQL `COUNT(*) FILTER (WHERE ...)` aggregate queries.
   - `listAdminAuditLogs()`: Pushed `targetType`, escaped `ILIKE` substring search, `COUNT(*)`, `LIMIT`, and `OFFSET` into PostgreSQL.
   - `listAdminReports()`: Pushed `status`/`targetType` filters and SQL pagination (`COUNT(*)`, `LIMIT`, `OFFSET`) into PostgreSQL before hydrating report metadata.
5. **Frontend Resilience (`src/components/ErrorBoundary.tsx`, `src/main.tsx`)**:
   - Wrapped the React root inside an Arabic RTL `ErrorBoundary` recovery view so unexpected runtime render exceptions never leave a blank page.

---

## 3. Backup, Restore & Disaster Recovery Procedures

### A. PostgreSQL Backups & Point-in-Time Recovery (PITR)

1. **Managed Automated Snapshots**:
   - Enable automated daily backups with **>= 14–30 days retention** and continuous WAL **Point-in-Time Recovery (PITR)**.
2. **Logical Encrypted Export (Before Every Schema/Code Release)**:
   ```bash
   # Requires PGSSLMODE=verify-full (or require) in environment
   pg_dump "$MIGRATION_DATABASE_URL" \
     --format=custom \
     --no-owner \
     --no-privileges \
     --file="souq_pre_release_$(date -u +%Y%m%dT%H%M%SZ).dump"
   ```
3. **Database Restore Verification Procedure (Staging Test)**:
   ```bash
   # 1. Create clean staging database with pg_trgm extension enabled
   createdb souq_restore_verify
   psql "$RESTORE_DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

   # 2. Restore logical dump
   pg_restore \
     --dbname="$RESTORE_DATABASE_URL" \
     --no-owner \
     --no-privileges \
     --single-transaction \
     souq_pre_release_YYYYMMDDTHHMMSSZ.dump

   # 3. Verify record integrity & search indexes
   DATABASE_URL="$RESTORE_DATABASE_URL" STORAGE_BACKEND="postgres" npm run db:verify-pg
   ```

### B. Media Object Storage Backups & Checksum Integrity

1. **Enable Bucket Versioning** on the private R2/S3 bucket so accidental overwrites or deletes can be recovered.
2. **Enable Lifecycle Rules** only for noncurrent object versions (e.g., expire noncurrent versions after 30 days) — **do not** auto-expire active uploaded media objects.
3. **Cross-Region Replication / Cold Archive** (recommended for S3): replicate `prod/uploads/*` to a secondary region or periodic `rclone` encrypted sync.
4. **Checksum Audit Command**:
   ```bash
   # Verifies every row in media_assets exists in cloud storage and matches byte size & SHA-256
   npm run media:verify -- --verbose
   ```
5. **Emergency Rollback of Media Storage**:
   Follow `docs/PHASE6C-MEDIA-STORAGE.md` Section 5 (`npm run media:migrate -- --rollback-to-local --dry-run` followed by live rollback if needed).

---

## 4. Pre-Deployment Safety Verification & Release Sequence

### Verified Deployment Safety Parameters

| Parameter | Required Configuration | Verification / Rationale |
| --- | --- | --- |
| **PostgreSQL TLS CA (`PG_SSL_MODE=verify-full`)** | Set `NODE_EXTRA_CA_CERTS=/path/to/provider-ca.pem` if managed PG uses a provider CA (e.g., AWS RDS, DigitalOcean Managed DB). | `server/db/client.ts` and `drizzle.config.ts` enforce `rejectUnauthorized: true` in `verify-full`. |
| **Reverse-Proxy Hops (`TRUST_PROXY`)** | `1` behind a single Nginx / ALB / PaaS proxy; `2` behind Cloudflare Proxy + Origin Nginx. | Prevents Express rate limiters (`RateLimiter`) from sharing one proxy IP across all marketplace users. |
| **Minimum Container Memory** | **>= 2 GB RAM** (4 GB recommended on VPS). | Video uploads up to `25 MB` buffer briefly in Node memory prior to S3/R2 upload; < 1 GB risks OOM under concurrent uploads. |
| **Container Liveness vs. Readiness** | Container `HEALTHCHECK` -> `/api/v1/live`; Load balancer / Uptime monitor -> `/api/v1/ready`. | Prevents transient R2/S3 blips from restarting healthy API containers while catching DB/storage degradation in external alerts. |
| **Non-Demo Admin Bootstrap** | Run `npm run user:create-admin` after migrations (`DEMO_ACCOUNTS` is hard-disabled in production). | Guarantees at least one active administrator without enabling dev demo credentials. |

### Exact Fresh-Database Release Sequence

1. Provision Managed PostgreSQL 15+ and enable `pg_trgm` (`CREATE EXTENSION IF NOT EXISTS pg_trgm;` via elevated role).
2. Provision Private S3/R2/GCS bucket with **Block Public Access** enabled, bucket versioning enabled, and least-privilege credentials.
3. Configure production secrets from `.env.production.example` (never reuse dev secrets; verify `TRUST_PROXY`, `ALLOWED_ORIGINS`, `APP_URL`, `SESSION_SECRET`, `PG_SSL_MODE=verify-full`, and `NODE_EXTRA_CA_CERTS` if needed).
4. Apply Drizzle schema migrations using `MIGRATION_DATABASE_URL`:
   ```bash
   npx drizzle-kit migrate
   ```
   Confirm `0000_boring_karma.sql` and `0001_arabic_search_trgm.sql` applied cleanly.
5. Seed canonical marketplace reference catalog (`regions`, `categories`, `breeds`, `indicative_prices`, `articles`, `faqs`) safely and idempotently — **creates zero demo users, zero demo listings, and never overwrites existing records**:
   ```bash
   # Optional offline & transactional dry-run checks:
   npm run db:seed-catalog -- --preflight-only
   npm run db:seed-catalog -- --dry-run

   # Live idempotent execution (safe to re-run):
   npm run db:seed-catalog
   ```
   *(If migrating an existing `data/store.json` dataset instead of starting fresh, run `npm run db:migrate:json-to-pg` first, then `npm run db:verify-pg`.)*
6. Create the initial non-demo administrator account:
   ```bash
   npm run user:create-admin
   ```
7. Build & start container/service (`npm run build && npm start` or `docker build` / `docker run`), then verify:
   - `GET /api/v1/live` -> `200 { ok: true, status: "live" }`
   - `GET /api/v1/ready` -> `200 { ok: true, backend: "postgres", mediaProvider: "r2" | "s3" }`
   - HTTPS WebSocket `/ws` upgrade succeeds after login.
   - Test image + MP4 byte-range upload/playback and unauthorized private media `404` check on staging before switching production DNS.
