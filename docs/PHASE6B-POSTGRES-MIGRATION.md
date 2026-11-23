# Phase 6B — PostgreSQL Migration & Rollback Runbook

## 1. Safety Principles
- The source JSON file (`data/store.json` or `$DATA_DIR/store.json`) is read **read-only** during migration and is **never** modified or deleted.
- Explicit backend selection is enforced via `STORAGE_BACKEND=json` or `STORAGE_BACKEND=postgres`.
- When `STORAGE_BACKEND=postgres` is selected, startup verification checks PostgreSQL connectivity and schema readiness (`public.listings`) and **fails loudly** on error instead of falling back to JSON.

## 2. Preflight & Schema Setup
1. Stop any running application server so active writes pause and exclusive directory locks are released:
   - Keep an untouched timestamped backup copy of `data/store.json` before migrating:
     ```bash
     cp data/store.json "data/backups/store.pre-pg-$(date -u +%Y%m%dT%H%M%SZ).json"
     ```
2. Validate the JSON store snapshot without touching any database:
   ```bash
   npx tsx scripts/migrate-json-to-pg.ts --preflight-only
   ```
3. Configure PostgreSQL environment variables (`DATABASE_URL` or `PGHOST`/`PGPORT`/`PGDATABASE`/`PGUSER`/`PGPASSWORD`, plus `PG_SSL_MODE=require` in production).
4. Apply Drizzle schema and Arabic trigram extensions/indexes:
   ```bash
   npx drizzle-kit migrate
   ```
   This applies:
   - `drizzle/0000_boring_karma.sql` (26 relational tables, foreign keys, CHECK constraints, partial unique indexes)
   - `drizzle/0001_arabic_search_trgm.sql` (`pg_trgm` extension + GIN trigram indexes on `listings.search_doc` and `listings.city_norm`)

## 3. Dry-Run & Live Migration
1. Execute a transactional dry-run against PostgreSQL (runs every insert and FK/CHECK constraint inside a transaction, then rolls back cleanly with zero committed rows):
   ```bash
   npx tsx scripts/migrate-json-to-pg.ts --dry-run
   ```
2. Execute the live migration:
   ```bash
   npx tsx scripts/migrate-json-to-pg.ts
   ```
   (If re-migrating into a staging database that already contains test rows, pass `--truncate` explicitly; otherwise the script refuses to overwrite non-empty tables.)
3. Verify row counts, Argon2id credentials, Arabic `search_doc` / `city_norm` population, `likes_count` aggregates, and foreign keys:
   ```bash
   npx tsx scripts/verify-pg-migration.ts
   ```

## 4. Cutover to PostgreSQL
1. Set environment variables:
   ```env
   STORAGE_BACKEND=postgres
   DATABASE_URL=postgresql://...
   ```
2. Start the server (`npm start` or `npm run dev`) and confirm health:
   ```bash
   curl -s http://localhost:3000/api/v1/health
   # Expected: {"ok":true,"backend":"postgres"}
   ```
3. Retain `data/store.json` intact in cold backup storage until post-cutover verification is signed off.

## 5. Rollback Procedure
If any issue occurs during or shortly after cutover:
1. Stop the Node.js server.
2. Switch configuration back to JSON:
   ```env
   STORAGE_BACKEND=json
   ```
3. Verify `data/store.json` integrity (or restore from the pre-migration backup in `data/backups/store.pre-pg-*.json` if JSON had not been written since cutover).
4. Start the server and verify `/api/v1/health` returns `{"ok":true,"backend":"json"}`.
5. Note: Any new records written exclusively to PostgreSQL while `STORAGE_BACKEND=postgres` was live can be exported from PostgreSQL before switching back to JSON if needed.
