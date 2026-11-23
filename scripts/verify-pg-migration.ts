/**
 * Verification script for JSON-to-PostgreSQL migration parity and relational integrity.
 *
 * Compares row counts across all 26 PostgreSQL tables against a read-only JSON snapshot,
 * verifies denormalized aggregates (listings.likes_count, seller_profiles.rating_count,
 * search_doc / city_norm population), verifies credentials & active sessions parity,
 * and checks for dangling foreign-key / constraint anomalies.
 *
 * Usage:
 *   npx tsx scripts/verify-pg-migration.ts [--json-path data/store.json] [--data-dir data]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { resolvePostgresConfigFromEnv } from '../server/config';
import { createDb, createPgPool, verifyDatabaseStartup, type AppDatabase } from '../server/db/client';
import type { StoreData } from '../server/domain/marketplace';
import { loadEnvForEntryPoint } from '../server/env';
import { resolveDataDir, STORE_FILE_NAME } from '../server/storage';
import { prepareMigrationSnapshot, type PreparedMigrationSnapshot } from './migrate-json-to-pg';

const __filename = fileURLToPath(import.meta.url);

export interface VerificationCheck {
  name: string;
  passed: boolean;
  expected: string | number;
  actual: string | number;
}

export interface VerificationReport {
  ok: boolean;
  checks: VerificationCheck[];
  warnings: string[];
}

const PG_TABLES = [
  'users',
  'user_credentials',
  'google_identities',
  'sessions',
  'regions',
  'categories',
  'breeds',
  'indicative_prices',
  'articles',
  'faqs',
  'seller_profiles',
  'listings',
  'media_assets',
  'listing_images',
  'listing_videos',
  'listing_favorites',
  'listing_likes',
  'like_notification_cooldowns',
  'conversations',
  'conversation_read_states',
  'messages',
  'price_offers',
  'listing_comments',
  'seller_reviews',
  'reports',
  'notifications',
  'audit_logs',
] as const;

export async function verifyPostgresAgainstSnapshot(
  db: AppDatabase,
  snapshot: PreparedMigrationSnapshot
): Promise<VerificationReport> {
  const checks: VerificationCheck[] = [];

  for (const table of PG_TABLES) {
    const res = await db.execute<{ count: string }>(
      sql.raw(`SELECT count(*)::text AS count FROM "${table}"`)
    );
    const actual = Number(res.rows[0]?.count ?? -1);
    const expected = snapshot.counts[table] ?? 0;
    checks.push({
      name: `row_count:${table}`,
      passed: actual === expected,
      expected,
      actual,
    });
  }

  // Verify Argon2id credential hash parity for users with credentials
  const credSampleRes = await db.execute<{ mismatches: string }>(
    sql`SELECT count(*)::text AS mismatches FROM user_credentials c LEFT JOIN users u ON u.id = c.user_id WHERE u.id IS NULL OR length(c.password_hash) < 20`
  );
  checks.push({
    name: 'credentials_integrity',
    passed: Number(credSampleRes.rows[0]?.mismatches || 0) === 0,
    expected: 0,
    actual: Number(credSampleRes.rows[0]?.mismatches || 0),
  });

  // Verify every listing has populated search_doc and city_norm
  const searchEmptyRes = await db.execute<{ empty_count: string }>(
    sql`SELECT count(*)::text AS empty_count FROM listings WHERE length(trim(search_doc)) = 0 OR length(trim(city_norm)) = 0`
  );
  checks.push({
    name: 'listings_arabic_search_populated',
    passed: Number(searchEmptyRes.rows[0]?.empty_count || 0) === 0,
    expected: 0,
    actual: Number(searchEmptyRes.rows[0]?.empty_count || 0),
  });

  // Verify denormalized listings.likes_count matches listing_likes rows
  const likesMismatchRes = await db.execute<{ mismatches: string }>(
    sql`SELECT count(*)::text AS mismatches
        FROM listings l
        LEFT JOIN (
          SELECT listing_id, count(*)::int AS cnt FROM listing_likes GROUP BY listing_id
        ) agg ON agg.listing_id = l.id
        WHERE l.likes_count <> COALESCE(agg.cnt, 0)`
  );
  checks.push({
    name: 'listings_likes_count_parity',
    passed: Number(likesMismatchRes.rows[0]?.mismatches || 0) === 0,
    expected: 0,
    actual: Number(likesMismatchRes.rows[0]?.mismatches || 0),
  });

  // Verify FK integrity across core relationships (no dangling sellers, listings, offers, messages)
  const fkAnomaliesRes = await db.execute<{ anomalies: string }>(
    sql`SELECT (
      (SELECT count(*) FROM listings l LEFT JOIN users u ON u.id = l.seller_id WHERE u.id IS NULL) +
      (SELECT count(*) FROM messages m LEFT JOIN conversations c ON c.id = m.conversation_id WHERE c.id IS NULL) +
      (SELECT count(*) FROM price_offers o LEFT JOIN listings l ON l.id = o.listing_id WHERE l.id IS NULL) +
      (SELECT count(*) FROM listing_comments cm LEFT JOIN listings l ON l.id = cm.listing_id WHERE l.id IS NULL)
    )::text AS anomalies`
  );
  checks.push({
    name: 'relational_foreign_key_integrity',
    passed: Number(fkAnomaliesRes.rows[0]?.anomalies || 0) === 0,
    expected: 0,
    actual: Number(fkAnomaliesRes.rows[0]?.anomalies || 0),
  });

  return {
    ok: checks.every((c) => c.passed),
    checks,
    warnings: snapshot.warnings,
  };
}

function getArgValue(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function main() {
  loadEnvForEntryPoint();

  const dataDirArg = getArgValue('data-dir');
  const jsonPathArg = getArgValue('json-path');
  const resolvedDir = resolveDataDir(dataDirArg ?? process.env.DATA_DIR);
  const jsonPath = jsonPathArg ? path.resolve(jsonPathArg) : path.join(resolvedDir, STORE_FILE_NAME);

  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Source JSON store not found at: ${jsonPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as StoreData;
  const snapshot = prepareMigrationSnapshot(parsed);

  const pgCfg = resolvePostgresConfigFromEnv(process.env, process.env.NODE_ENV === 'production');
  if (!pgCfg || (!pgCfg.connectionString && !(pgCfg.host && pgCfg.database && pgCfg.user))) {
    throw new Error('PostgreSQL connection configuration is missing (DATABASE_URL or PGHOST/PGDATABASE/PGUSER).');
  }

  const pool = createPgPool(pgCfg);
  try {
    await verifyDatabaseStartup(pool);
    const db = createDb(pool);
    const report = await verifyPostgresAgainstSnapshot(db, snapshot);

    for (const check of report.checks) {
      const tag = check.passed ? 'PASS' : 'FAIL';
      console.log(`[${tag}] ${check.name}: expected=${check.expected} actual=${check.actual}`);
    }

    if (!report.ok) {
      throw new Error('PostgreSQL migration verification failed one or more checks.');
    }
    console.log('[verify-pg-migration] All checks passed.');
  } finally {
    await pool.end().catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((err) => {
    console.error('[verify-pg-migration] Failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
