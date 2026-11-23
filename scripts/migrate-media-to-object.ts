/**
 * Non-destructive Media Storage Migration, Verification & Rollback Utility (Phase 6C).
 *
 * Safely migrates media objects from local disk (`uploads/`) to private S3/R2/GCS-compatible
 * object storage with SHA-256 checksum verification, dry-run planning, verification mode, and
 * non-destructive rollback to local storage.
 *
 * Usage:
 *   npx tsx scripts/migrate-media-to-object.ts --dry-run
 *   npx tsx scripts/migrate-media-to-object.ts
 *   npx tsx scripts/migrate-media-to-object.ts --verify-only
 *   npx tsx scripts/migrate-media-to-object.ts --rollback-to-local [--dry-run]
 *
 * Safety guarantees:
 * - Never deletes existing local uploaded files or remote cloud objects.
 * - Verifies byte length and end-to-end SHA-256 checksum after upload before updating metadata.
 * - Executes metadata updates atomically inside PostgreSQL transactions (or locked JSON writes).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asc, eq } from 'drizzle-orm';
import {
  resolveMediaStorageConfigFromEnv,
  resolvePostgresConfigFromEnv,
  type StorageBackend,
} from '../server/config';
import { createDb, createPgPool, verifyDatabaseStartup, type AppDatabase } from '../server/db/client';
import { mediaAssets } from '../server/db/schema';
import { loadStore, makeStorePaths } from '../server/domain/marketplace';
import { loadEnvForEntryPoint } from '../server/env';
import type { MediaAsset } from '../server/media';
import {
  buildObjectKey,
  computeSha256Hex,
  computeStreamSha256Hex,
  createMediaStorageAdapter,
  LocalMediaStorageAdapter,
  resolveAssetObjectRef,
  type MediaStorageAdapter,
  type MediaStorageProvider,
} from '../server/mediaStorage';
import { acquireStoreLock, resolveDataDir, STORE_FILE_NAME, StorePersister } from '../server/storage';

const __filename = fileURLToPath(import.meta.url);

export type MediaMigrationMode = 'migrate' | 'verify' | 'rollback';

export interface MediaMigrationItemResult {
  id: string;
  filename: string;
  action: 'planned' | 'migrated' | 'skipped' | 'verified' | 'rolled_back' | 'failed';
  fromProvider: MediaStorageProvider;
  toProvider?: MediaStorageProvider;
  objectKey?: string;
  sha256Hex?: string;
  sizeBytes?: number;
  error?: string;
}

export interface MediaMigrationReport {
  mode: MediaMigrationMode;
  backend: StorageBackend;
  dryRun: boolean;
  totalInspected: number;
  succeeded: number;
  skipped: number;
  failed: number;
  items: MediaMigrationItemResult[];
}

export interface RunMediaMigrationOptions {
  mode: MediaMigrationMode;
  backend: StorageBackend;
  dryRun?: boolean;
  limit?: number;
  force?: boolean;
  uploadsDir: string;
  keyPrefix?: string;
  targetAdapter?: MediaStorageAdapter;
  localAdapter?: LocalMediaStorageAdapter;
  db?: AppDatabase;
  dataDir?: string;
  jsonPath?: string;
}

async function readLocalAssetBytes(
  localAdapter: LocalMediaStorageAdapter,
  asset: MediaAsset
): Promise<Buffer> {
  const res = await localAdapter.getObjectStream({ provider: 'local', objectKey: asset.filename });
  if (!res) {
    throw new Error(`Local source file not found: ${asset.filename}`);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of res.stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function loadAllMediaAssets(opts: RunMediaMigrationOptions): Promise<MediaAsset[]> {
  if (opts.backend === 'postgres') {
    if (!opts.db) throw new Error('PostgreSQL db instance is required for backend=postgres');
    const rows = await opts.db.select().from(mediaAssets).orderBy(asc(mediaAssets.createdAt), asc(mediaAssets.id));
    return rows.map((row) => ({
      id: row.id,
      filename: row.filename,
      url: row.url,
      kind: row.kind as 'image' | 'video',
      mimeType: row.mimeType,
      sizeBytes: Number(row.sizeBytes),
      originalName: row.originalName,
      uploaderId: row.uploaderId,
      listingId: row.listingId ?? null,
      createdAt: row.createdAt.toISOString(),
      storageProvider: (row.storageProvider as MediaStorageProvider) || 'local',
      bucket: row.bucket ?? null,
      objectKey: row.objectKey || row.filename,
      sha256Hex: row.sha256Hex ?? null,
    }));
  }

  const dataDir = opts.dataDir || path.dirname(opts.uploadsDir);
  const basePaths = makeStorePaths(dataDir);
  const paths = opts.jsonPath
    ? { ...basePaths, storePath: path.resolve(opts.jsonPath) }
    : basePaths;
  const store = loadStore(paths);
  return [...(store.media || [])];
}

async function updateAssetStorageMetadata(
  opts: RunMediaMigrationOptions,
  updates: Array<{
    id: string;
    storageProvider: MediaStorageProvider;
    bucket: string | null;
    objectKey: string;
    sha256Hex: string;
  }>
): Promise<void> {
  if (updates.length === 0) return;

  if (opts.backend === 'postgres') {
    if (!opts.db) throw new Error('PostgreSQL db instance is required');
    await opts.db.transaction(async (tx) => {
      for (const u of updates) {
        await tx
          .update(mediaAssets)
          .set({
            storageProvider: u.storageProvider,
            bucket: u.bucket,
            objectKey: u.objectKey,
            sha256Hex: u.sha256Hex,
          })
          .where(eq(mediaAssets.id, u.id));
      }
    });
    return;
  }

  const dataDir = opts.dataDir || path.dirname(opts.uploadsDir);
  const basePaths = makeStorePaths(dataDir);
  const paths = opts.jsonPath
    ? { ...basePaths, storePath: path.resolve(opts.jsonPath) }
    : basePaths;
  const lock = acquireStoreLock(paths.dataDir, 'media-migrate');
  try {
    const store = loadStore(paths);
    const updateMap = new Map(updates.map((u) => [u.id, u]));
    store.media = (store.media || []).map((m) => {
      const u = updateMap.get(m.id);
      if (!u) return m;
      return {
        ...m,
        storageProvider: u.storageProvider,
        bucket: u.bucket,
        objectKey: u.objectKey,
        sha256Hex: u.sha256Hex,
      };
    });
    const persister = new StorePersister(paths.dataDir, paths.storePath, 200);
    persister.saveImmediate(store);
  } finally {
    lock.release();
  }
}

export async function runMediaMigration(
  opts: RunMediaMigrationOptions
): Promise<MediaMigrationReport> {
  const dryRun = Boolean(opts.dryRun);
  const localAdapter = opts.localAdapter || new LocalMediaStorageAdapter(opts.uploadsDir);
  const targetAdapter = opts.targetAdapter;

  if (opts.mode === 'migrate') {
    if (!targetAdapter || targetAdapter.provider === 'local') {
      throw new Error(
        'Forward media migration requires a cloud MEDIA_STORAGE_PROVIDER (s3, r2, or gcs).'
      );
    }
  }

  const allAssets = await loadAllMediaAssets(opts);
  const assets =
    typeof opts.limit === 'number' && opts.limit > 0 ? allAssets.slice(0, opts.limit) : allAssets;

  const items: MediaMigrationItemResult[] = [];
  const pendingMetadataUpdates: Array<{
    id: string;
    storageProvider: MediaStorageProvider;
    bucket: string | null;
    objectKey: string;
    sha256Hex: string;
  }> = [];

  for (const asset of assets) {
    const currentProvider: MediaStorageProvider = asset.storageProvider || 'local';

    if (opts.mode === 'migrate') {
      const cloud = targetAdapter!;
      if (!opts.force && currentProvider === cloud.provider) {
        items.push({
          id: asset.id,
          filename: asset.filename,
          action: 'skipped',
          fromProvider: currentProvider,
          toProvider: cloud.provider,
          objectKey: asset.objectKey || asset.filename,
          sha256Hex: asset.sha256Hex || undefined,
          sizeBytes: asset.sizeBytes,
        });
        continue;
      }

      try {
        const bytes = await readLocalAssetBytes(localAdapter, asset);
        if (bytes.length !== asset.sizeBytes) {
          throw new Error(
            `Byte size mismatch for ${asset.filename}: expected ${asset.sizeBytes}, got ${bytes.length}`
          );
        }
        const sha256Hex = computeSha256Hex(bytes);
        if (asset.sha256Hex && asset.sha256Hex.toLowerCase() !== sha256Hex) {
          throw new Error(
            `Existing SHA-256 mismatch for ${asset.id}: recorded ${asset.sha256Hex}, disk ${sha256Hex}`
          );
        }

        const targetKey = buildObjectKey(asset.filename, opts.keyPrefix);
        if (dryRun) {
          items.push({
            id: asset.id,
            filename: asset.filename,
            action: 'planned',
            fromProvider: currentProvider,
            toProvider: cloud.provider,
            objectKey: targetKey,
            sha256Hex,
            sizeBytes: bytes.length,
          });
          continue;
        }

        // Upload (idempotent check first)
        const existingHead = await cloud.headObject({
          provider: cloud.provider,
          bucket: cloud.bucket,
          objectKey: targetKey,
        });
        let needsUpload = true;
        if (
          existingHead.exists &&
          existingHead.sizeBytes === bytes.length &&
          existingHead.sha256Hex === sha256Hex
        ) {
          needsUpload = false;
        }

        if (needsUpload) {
          await cloud.putObject({
            objectKey: targetKey,
            bytes,
            mimeType: asset.mimeType,
            sha256Hex,
            metadata: {
              'media-id': asset.id,
              'uploader-id': asset.uploaderId,
            },
          });
        }

        // End-to-end download stream checksum verification
        const verifyRead = await cloud.getObjectStream({
          provider: cloud.provider,
          bucket: cloud.bucket,
          objectKey: targetKey,
        });
        if (!verifyRead) {
          throw new Error(`Uploaded object missing during checksum verification: ${targetKey}`);
        }
        const remoteDigest = await computeStreamSha256Hex(verifyRead.stream);
        if (remoteDigest.sizeBytes !== bytes.length || remoteDigest.sha256Hex !== sha256Hex) {
          throw new Error(
            `Post-upload checksum mismatch for ${asset.id}: expected ${sha256Hex} (${bytes.length}B), got ${remoteDigest.sha256Hex} (${remoteDigest.sizeBytes}B)`
          );
        }

        pendingMetadataUpdates.push({
          id: asset.id,
          storageProvider: cloud.provider,
          bucket: cloud.bucket,
          objectKey: targetKey,
          sha256Hex,
        });
        items.push({
          id: asset.id,
          filename: asset.filename,
          action: 'migrated',
          fromProvider: currentProvider,
          toProvider: cloud.provider,
          objectKey: targetKey,
          sha256Hex,
          sizeBytes: bytes.length,
        });
      } catch (err) {
        items.push({
          id: asset.id,
          filename: asset.filename,
          action: 'failed',
          fromProvider: currentProvider,
          toProvider: cloud.provider,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      continue;
    }

    if (opts.mode === 'verify') {
      try {
        const adapter: MediaStorageAdapter =
          currentProvider === 'local'
            ? localAdapter
            : targetAdapter && targetAdapter.provider === currentProvider
            ? targetAdapter
            : (() => {
                throw new Error(
                  `No adapter configured for provider "${currentProvider}" (active target: "${targetAdapter?.provider || 'local'}")`
                );
              })();

        const ref = resolveAssetObjectRef(asset);
        const head = await adapter.headObject(ref);
        if (!head.exists) {
          throw new Error(`Object missing in ${currentProvider}: ${ref.objectKey}`);
        }
        const readRes = await adapter.getObjectStream(ref);
        if (!readRes) {
          throw new Error(`Object unreadable in ${currentProvider}: ${ref.objectKey}`);
        }
        const digest = await computeStreamSha256Hex(readRes.stream);
        if (digest.sizeBytes !== asset.sizeBytes) {
          throw new Error(
            `Size mismatch for ${asset.id}: expected ${asset.sizeBytes}, actual ${digest.sizeBytes}`
          );
        }
        if (asset.sha256Hex && asset.sha256Hex.toLowerCase() !== digest.sha256Hex) {
          throw new Error(
            `SHA-256 mismatch for ${asset.id}: expected ${asset.sha256Hex}, actual ${digest.sha256Hex}`
          );
        }

        // Cross-check local copy if present when verifying cloud storage
        if (currentProvider !== 'local') {
          const localHead = await localAdapter.headObject({
            provider: 'local',
            objectKey: asset.filename,
          });
          if (localHead.exists) {
            const localRead = await localAdapter.getObjectStream({
              provider: 'local',
              objectKey: asset.filename,
            });
            if (localRead) {
              const localDigest = await computeStreamSha256Hex(localRead.stream);
              if (localDigest.sha256Hex !== digest.sha256Hex) {
                throw new Error(
                  `Local backup checksum differs from cloud object for ${asset.id}`
                );
              }
            }
          }
        }

        items.push({
          id: asset.id,
          filename: asset.filename,
          action: 'verified',
          fromProvider: currentProvider,
          objectKey: ref.objectKey,
          sha256Hex: digest.sha256Hex,
          sizeBytes: digest.sizeBytes,
        });
      } catch (err) {
        items.push({
          id: asset.id,
          filename: asset.filename,
          action: 'failed',
          fromProvider: currentProvider,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      continue;
    }

    if (opts.mode === 'rollback') {
      if (currentProvider === 'local') {
        items.push({
          id: asset.id,
          filename: asset.filename,
          action: 'skipped',
          fromProvider: 'local',
          toProvider: 'local',
          objectKey: asset.filename,
          sha256Hex: asset.sha256Hex || undefined,
          sizeBytes: asset.sizeBytes,
        });
        continue;
      }

      try {
        const localHead = await localAdapter.headObject({
          provider: 'local',
          objectKey: asset.filename,
        });

        let verifiedSha256: string;
        if (localHead.exists && localHead.sizeBytes === asset.sizeBytes) {
          const localBytes = await readLocalAssetBytes(localAdapter, asset);
          verifiedSha256 = computeSha256Hex(localBytes);
          if (asset.sha256Hex && asset.sha256Hex.toLowerCase() !== verifiedSha256) {
            throw new Error(
              `Local file SHA-256 mismatch during rollback for ${asset.id}: ${verifiedSha256} != ${asset.sha256Hex}`
            );
          }
        } else {
          if (!targetAdapter || targetAdapter.provider !== currentProvider) {
            throw new Error(
              `Local file missing and no configured "${currentProvider}" adapter to restore ${asset.filename}`
            );
          }
          const cloudRead = await targetAdapter.getObjectStream(resolveAssetObjectRef(asset));
          if (!cloudRead) {
            throw new Error(`Cloud object missing during rollback: ${asset.objectKey || asset.filename}`);
          }
          const bytes = await streamToBuffer(cloudRead.stream);
          verifiedSha256 = computeSha256Hex(bytes);
          if (bytes.length !== asset.sizeBytes) {
            throw new Error(
              `Cloud restore size mismatch for ${asset.id}: ${bytes.length} != ${asset.sizeBytes}`
            );
          }
          if (asset.sha256Hex && asset.sha256Hex.toLowerCase() !== verifiedSha256) {
            throw new Error(
              `Cloud restore checksum mismatch for ${asset.id}: ${verifiedSha256} != ${asset.sha256Hex}`
            );
          }
          if (!dryRun) {
            await localAdapter.putObject({
              objectKey: asset.filename,
              bytes,
              mimeType: asset.mimeType,
              sha256Hex: verifiedSha256,
            });
          }
        }

        if (dryRun) {
          items.push({
            id: asset.id,
            filename: asset.filename,
            action: 'planned',
            fromProvider: currentProvider,
            toProvider: 'local',
            objectKey: asset.filename,
            sha256Hex: verifiedSha256,
            sizeBytes: asset.sizeBytes,
          });
        } else {
          pendingMetadataUpdates.push({
            id: asset.id,
            storageProvider: 'local',
            bucket: null,
            objectKey: asset.filename,
            sha256Hex: verifiedSha256,
          });
          items.push({
            id: asset.id,
            filename: asset.filename,
            action: 'rolled_back',
            fromProvider: currentProvider,
            toProvider: 'local',
            objectKey: asset.filename,
            sha256Hex: verifiedSha256,
            sizeBytes: asset.sizeBytes,
          });
        }
      } catch (err) {
        items.push({
          id: asset.id,
          filename: asset.filename,
          action: 'failed',
          fromProvider: currentProvider,
          toProvider: 'local',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  if (!dryRun && pendingMetadataUpdates.length > 0) {
    await updateAssetStorageMetadata(opts, pendingMetadataUpdates);
  }

  const succeeded = items.filter(
    (i) =>
      i.action === 'planned' ||
      i.action === 'migrated' ||
      i.action === 'verified' ||
      i.action === 'rolled_back'
  ).length;
  const skipped = items.filter((i) => i.action === 'skipped').length;
  const failed = items.filter((i) => i.action === 'failed').length;

  return {
    mode: opts.mode,
    backend: opts.backend,
    dryRun,
    totalInspected: assets.length,
    succeeded,
    skipped,
    failed,
    items,
  };
}

function getArgValue(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function main() {
  loadEnvForEntryPoint();

  const dryRun = process.argv.includes('--dry-run');
  const verifyOnly = process.argv.includes('--verify-only');
  const rollback = process.argv.includes('--rollback-to-local');
  const force = process.argv.includes('--force');

  if (verifyOnly && rollback) {
    throw new Error('Cannot combine --verify-only and --rollback-to-local');
  }
  const mode: MediaMigrationMode = verifyOnly ? 'verify' : rollback ? 'rollback' : 'migrate';

  const backendRaw = (getArgValue('backend') || process.env.STORAGE_BACKEND || 'json')
    .trim()
    .toLowerCase();
  if (backendRaw !== 'json' && backendRaw !== 'postgres') {
    throw new Error(`Invalid backend "${backendRaw}". Expected "json" or "postgres".`);
  }
  const backend: StorageBackend = backendRaw;

  const limitRaw = getArgValue('limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const dataDir = resolveDataDir(getArgValue('data-dir') ?? process.env.DATA_DIR);
  const paths = makeStorePaths(dataDir);
  const jsonPathArg = getArgValue('json-path');
  const jsonPath = jsonPathArg ? path.resolve(jsonPathArg) : path.join(dataDir, STORE_FILE_NAME);

  if (backend === 'json' && !fs.existsSync(jsonPath)) {
    throw new Error(`JSON store not found at: ${jsonPath}`);
  }

  const mediaCfg = resolveMediaStorageConfigFromEnv(process.env);
  const localAdapter = new LocalMediaStorageAdapter(paths.uploadsDir);
  const targetAdapter =
    mediaCfg.provider === 'local' ? undefined : createMediaStorageAdapter(mediaCfg, paths.uploadsDir);

  let pool: ReturnType<typeof createPgPool> | null = null;
  let db: AppDatabase | undefined;
  if (backend === 'postgres') {
    const pgCfg = resolvePostgresConfigFromEnv(process.env, process.env.NODE_ENV === 'production');
    if (!pgCfg || (!pgCfg.connectionString && !(pgCfg.host && pgCfg.database && pgCfg.user))) {
      throw new Error('PostgreSQL configuration missing (set DATABASE_URL or PGHOST/PGDATABASE/PGUSER).');
    }
    pool = createPgPool(pgCfg);
    await verifyDatabaseStartup(pool);
    db = createDb(pool);
  }

  try {
    const report = await runMediaMigration({
      mode,
      backend,
      dryRun,
      limit,
      force,
      uploadsDir: paths.uploadsDir,
      keyPrefix: mediaCfg.keyPrefix,
      localAdapter,
      targetAdapter,
      db,
      dataDir,
      jsonPath,
    });

    console.log(
      `[media-migrate] mode=${report.mode} backend=${report.backend} dryRun=${report.dryRun} inspected=${report.totalInspected} succeeded=${report.succeeded} skipped=${report.skipped} failed=${report.failed}`
    );
    for (const item of report.items) {
      if (item.action === 'failed') {
        console.error(`  [FAILED] ${item.id} (${item.filename}): ${item.error}`);
      } else if (process.argv.includes('--verbose')) {
        console.log(
          `  [${item.action}] ${item.id} ${item.fromProvider}->${item.toProvider || item.fromProvider} key=${item.objectKey || ''} sha256=${item.sha256Hex || ''}`
        );
      }
    }
    if (report.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool?.end().catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((err) => {
    console.error('[media-migrate] Failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
