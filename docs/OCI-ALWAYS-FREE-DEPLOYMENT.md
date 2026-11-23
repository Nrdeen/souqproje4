# Oracle Cloud Always Free (ARM64 Ampere A1) Deployment Runbook — SouqAlGhanam 2.0

This guide describes how to deploy the single unified **SouqAlGhanam 2.0 (سوق الغنم 2.0)** stack onto an **Oracle Cloud Infrastructure (OCI) Always Free** VM (`VM.Standard.A1.Flex`, Ubuntu 24.04 ARM64).

---

## 1. Architecture Overview

The `docker-compose.yml` stack runs three multi-arch (`linux/arm64`) containers on an isolated Docker bridge (`souq_internal`):

1. **`postgres` (`postgres:16-alpine`)**:
   - Enables `pg_trgm` automatically via `deploy/postgres/init/01-init-extensions.sh` for fast Arabic trigram search.
   - Creates the least-privilege `souq_app` runtime role.
   - Never exposes port `5432` to the public internet.
2. **`app` (Node 22 + Express + WebSocket + Vite SPA + AI Assistant)**:
   - Built with the multi-stage ARM64-compatible `Dockerfile` (`python3 make g++` for native `argon2`, `npm prune --omit=dev` for minimal runtime footprint, non-root `node` user).
   - Serves the SPA, REST API, WebSocket `/ws`, media streaming `/api/v1/media/*`, and server-side Gemini AI Assistant `/api/v1/ai/*`.
3. **`nginx` (`nginx:1.27-alpine`)**:
   - Terminates TLS 1.2/1.3 via Let's Encrypt, handles `/ws` WebSocket upgrades, disables buffering on `/api/v1/media/` byte-range video streams, and permits up to `30m` upload payloads.

---

## 2. OCI Firewall & Host Preparation

1. **OCI VCN Security List / NSG**:
   - Allow ingress TCP `80` and `443` from `0.0.0.0/0` (for HTTP redirect/ACME and HTTPS).
   - Restrict SSH `22` to your admin IP only.
   - Never open `3000` or `5432` publicly.
2. **Ubuntu Host `iptables` (OCI images ship with restrictive default `iptables` rules)**:
   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```
3. **Optional 2 GB Swap (recommended if running on a 1–6 GB A1 allocation)**:
   ```bash
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
   sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```

---

## 3. Environment & TLS Setup

1. Copy `.env.oci.example` to `.env.oci` and lock permissions:
   ```bash
   cp .env.oci.example .env.oci
   chmod 600 .env.oci
   ```
2. Replace every `REPLACE_WITH_*` secret (`SESSION_SECRET`, `POSTGRES_PASSWORD`, `SOUQ_APP_DB_PASSWORD`, `GEMINI_API_KEY`, and your domain in `APP_URL`, `ALLOWED_ORIGINS`, and `deploy/nginx.oci.conf`).
3. Obtain TLS certificates with Certbot on the host (e.g. `certbot certonly --standalone -d souq.example.sa -d www.souq.example.sa`) before launching `nginx`.

---

## 4. First Boot, Schema Migration, Catalog Seed & Admin Bootstrap

```bash
# 1. Start PostgreSQL 16 and wait until healthy
docker compose --env-file .env.oci up -d postgres

# 2. Build and start app (keep nginx down until DB migration succeeds if desired)
docker compose --env-file .env.oci up -d --build app

# 3. Apply Drizzle schema & Arabic pg_trgm indexes (uses elevated MIGRATION_DATABASE_URL)
docker compose --env-file .env.oci exec app sh -c 'DATABASE_URL="$MIGRATION_DATABASE_URL" npx drizzle-kit migrate'

# 4. Seed canonical Saudi breeds, categories, regions, indicative prices, articles & FAQs (idempotent)
docker compose --env-file .env.oci exec app npm run db:seed-catalog

# 5. Create your initial non-demo administrator account
docker compose --env-file .env.oci exec -it app npm run user:create-admin

# 6. Start Nginx TLS reverse proxy
docker compose --env-file .env.oci up -d nginx
```

---

## 5. Backups, Restore & Health Monitoring

Make the operational scripts executable on the OCI host:

```bash
chmod +x scripts/oci-backup.sh scripts/oci-restore.sh scripts/oci-health-monitor.sh
```

Recommended cron entries (`crontab -e`):

```cron
# Daily encrypted-permission PostgreSQL + uploads backup at 03:15 UTC
15 3 * * * cd /opt/souqalghanam && ./scripts/oci-backup.sh >> /var/log/souq-backup.log 2>&1

# Health and disk check every 5 minutes
*/5 * * * * cd /opt/souqalghanam && ./scripts/oci-health-monitor.sh >> /var/log/souq-health.log 2>&1
```

To test disaster recovery against a dump file:

```bash
./scripts/oci-restore.sh /opt/souqalghanam/backups/pg_souqalghanam_YYYYMMDDTHHMMSSZ.dump
```
