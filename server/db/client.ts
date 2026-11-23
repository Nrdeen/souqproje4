import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import type { PostgresConfig } from '../config';
import * as schema from './schema';

export type AppDatabase = NodePgDatabase<typeof schema>;

function buildPoolConfig(cfg: PostgresConfig): PoolConfig {
  const ssl =
    cfg.sslMode === 'disable'
      ? false
      : { rejectUnauthorized: cfg.sslMode === 'verify-full' };

  if (cfg.connectionString) {
    return {
      connectionString: cfg.connectionString,
      max: cfg.poolMax,
      connectionTimeoutMillis: cfg.connectionTimeoutMs,
      idleTimeoutMillis: 30_000,
      ssl,
    };
  }

  return {
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    max: cfg.poolMax,
    connectionTimeoutMillis: cfg.connectionTimeoutMs,
    idleTimeoutMillis: 30_000,
    ssl,
  };
}

export function createPgPool(cfg: PostgresConfig): Pool {
  const pool = new Pool(buildPoolConfig(cfg));
  pool.on('error', (err) => {
    console.error('[postgres] Unexpected idle pool client error:', err.message);
  });
  return pool;
}

export function createDb(pool: Pool): AppDatabase {
  return drizzle(pool, { schema });
}

export async function checkDatabaseHealth(pool: Pool): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function verifyDatabaseStartup(pool: Pool): Promise<void> {
  try {
    await pool.query('SELECT 1');
    const res = await pool.query<{ exists: string | null }>(
      "SELECT to_regclass('public.listings')::text AS exists"
    );
    if (!res.rows[0]?.exists) {
      throw new Error(
        'PostgreSQL database connected, but schema tables are missing. Run database migrations before starting the server.'
      );
    }
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`PostgreSQL startup verification failed (refusing JSON fallback): ${message}`);
  }
}

export async function applyMigrationsSql(db: AppDatabase, sqlStatements: string[]): Promise<void> {
  for (const statement of sqlStatements) {
    const trimmed = statement.trim();
    if (!trimmed) continue;
    await db.execute(sql.raw(trimmed));
  }
}
