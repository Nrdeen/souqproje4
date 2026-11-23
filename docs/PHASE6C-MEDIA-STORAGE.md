# Phase 6C — Persistent Media Storage Architecture, Security & Rollback Runbook

## 1. Architecture Overview

SouqAlGhanam 2.0 keeps binary media files (images and videos) strictly outside PostgreSQL and stores only metadata (`storage_provider`, `bucket`, `object_key`, `filename`, `url`, `kind`, `mime_type`, `size_bytes`, `sha256_hex`, `original_name`, `uploader_id`, `listing_id`, `created_at`) in `media_assets` (or `store.json` when `STORAGE_BACKEND=json`).

Every media asset continues to be served through the application's single authorization-enforcing URL pattern:

- `/api/v1/media/:id`

This preserves all privacy and moderation rules:
- Unbound draft uploads are accessible only to the uploader and administrators (`404` for all others).
- `Draft`, `Pending`, `Rejected`, `Expired`, and `Sold` listing media remain inaccessible (`404`) to unauthorized users.
- Media belonging to suspended sellers is hidden (`404`) from non-administrator viewers.
- Magic-byte inspection (`jpg`, `png`, `webp`, `mp4`, `mov`, `webm`), file size limits (`5 MB` images, `25 MB` videos), per-user unbound quotas (`30`), CSRF/Origin protection, ownership checks on delete, and orphaned draft cleanup remain enforced consistently across local and cloud providers.

## 2. Storage Adapters (`server/mediaStorage.ts`)

1. **`LocalMediaStorageAdapter`** (`MEDIA_STORAGE_PROVIDER=local`, default):
   - Stores files inside `DATA_DIR/uploads` with strict filename & path-traversal confinement and atomic temp-file writes (`0600`).
   - Supports byte-range video streaming via `fs.createReadStream(path, { start, end })`.
2. **`S3CompatibleMediaStorageAdapter`** (`MEDIA_STORAGE_PROVIDER=s3 | r2 | gcs`):
   - Uses AWS Signature Version 4 (`AWS4-HMAC-SHA256`) over HTTPS with private-bucket defaults (no public bucket ACLs).
   - Supports AWS S3, Cloudflare R2, MinIO, and Google Cloud Storage S3-interoperability (`https://storage.googleapis.com` with HMAC keys).
   - Streams uploads and byte-range video downloads (`Range: bytes=start-end`) without buffering full video files into database storage or exposing raw bucket URLs.
3. **`RoutedMediaStorageAdapter`**:
   - Writes new uploads exclusively to the configured active provider (failing loudly if cloud credentials are missing or invalid—never falling back silently to `local`).
   - Continues serving or cleaning up legacy `storage_provider='local'` records seamlessly during phased migrations until migration completes.

## 3. Environment Configuration

| Variable | Description | Default / Notes |
| --- | --- | --- |
| `MEDIA_STORAGE_PROVIDER` | `local`, `s3`, `r2`, or `gcs` | `local` |
| `MEDIA_BUCKET` | Private object bucket name | Required when provider != `local` |
| `MEDIA_REGION` | Bucket region (`us-east-1`, `me-central-1`, `auto`, etc.) | Required for `s3`; defaults `auto` for `r2`/`gcs` |
| `MEDIA_ENDPOINT` | Custom S3-compatible endpoint (`https://...`) | Auto-derived for `s3`/`gcs` or via `MEDIA_R2_ACCOUNT_ID` for `r2` |
| `MEDIA_R2_ACCOUNT_ID` | Cloudflare R2 account ID (if `MEDIA_ENDPOINT` omitted) | Optional |
| `MEDIA_ACCESS_KEY_ID` | Private IAM / HMAC Access Key ID | Required when provider != `local` |
| `MEDIA_SECRET_ACCESS_KEY` | Private IAM / HMAC Secret Key | Required when provider != `local` |
| `MEDIA_FORCE_PATH_STYLE` | `true` or `false` | Defaults `true` for custom endpoints, `r2`, `gcs` |
| `MEDIA_KEY_PREFIX` | Optional object key prefix (e.g. `prod/uploads`) | Empty |

### Private Bucket Hardening Checklist (Production)
1. Enable **Block Public Access** on the bucket (no public read ACLs, no public bucket policies).
2. Grant least-privilege IAM / HMAC permissions restricted to `GetObject`, `PutObject`, `DeleteObject`, and `HeadObject`/`ListBucket` (only for bucket health check) on `arn:aws:s3:::<bucket>/<prefix>*`.
3. Require TLS (`https://`)—enforced automatically by `loadConfig()` when `NODE_ENV=production`.
4. Enable bucket versioning or lifecycle rules only after confirming orphan cleanup / retention policy.

## 4. Safe Media Migration Runbook (`scripts/migrate-media-to-object.ts`)

Before running any live migration:
1. Back up PostgreSQL (`pg_dump`) or copy `store.json` + `DATA_DIR/uploads`.
2. Ensure local files remain untouched during the entire cutover window.

### Step 1 — Dry Run
Inspect all candidate files, sizes, and local SHA-256 digests without modifying cloud storage or database rows:
```bash
npm run media:migrate -- --dry-run --verbose
```

### Step 2 — Live Migration
Uploads each local asset to the configured private bucket, streams the uploaded object back to verify byte length and SHA-256 checksum, and atomically updates `media_assets` metadata (`storage_provider`, `bucket`, `object_key`, `sha256_hex`). **Local source files are never deleted.**
```bash
npm run media:migrate -- --verbose
```

### Step 3 — Verification
Verify that every asset in PostgreSQL / JSON exists in its recorded storage provider and passes byte-length + SHA-256 digest checks:
```bash
npm run media:verify -- --verbose
```

## 5. Rollback Procedure

If an issue is discovered after migrating metadata to object storage:

1. Preview rollback impact without mutating files or metadata:
   ```bash
   npm run media:migrate -- --rollback-to-local --dry-run --verbose
   ```
2. Execute non-destructive rollback:
   ```bash
   npm run media:migrate -- --rollback-to-local --verbose
   ```
   - For any file still present in `DATA_DIR/uploads`, the utility verifies its byte size and SHA-256 checksum against the recorded digest before switching `storage_provider` back to `'local'`.
   - For any new upload created after cutover (not yet on local disk), the utility streams it from object storage, verifies SHA-256 checksum, writes it safely to `DATA_DIR/uploads`, and switches metadata back to `'local'`.
   - Remote cloud objects are never deleted during rollback.
3. Set `MEDIA_STORAGE_PROVIDER="local"` in the runtime environment and restart the server.
4. Re-run `npm run media:verify` to confirm all assets resolve cleanly from local storage.
