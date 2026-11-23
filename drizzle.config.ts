import { defineConfig } from 'drizzle-kit';
import { loadEnvForEntryPoint } from './server/env';

loadEnvForEntryPoint();

const connectionString = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
const host = process.env.PGHOST || process.env.SQL_HOST;
const database = process.env.PGDATABASE || process.env.SQL_DB_NAME;
const user = process.env.PG_MIGRATION_USER || process.env.SQL_ADMIN_USER || process.env.PGUSER || process.env.SQL_USER;
const password =
  process.env.PG_MIGRATION_PASSWORD ??
  process.env.SQL_ADMIN_PASSWORD ??
  process.env.PGPASSWORD ??
  process.env.SQL_PASSWORD;
const port = process.env.PGPORT ? Number(process.env.PGPORT) : 5432;
const sslMode = (process.env.PG_SSL_MODE || '').toLowerCase();

export default defineConfig({
  schema: './server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials: connectionString
    ? {
        url: connectionString,
      }
    : {
        host: host || '127.0.0.1',
        port,
        database: database || 'souqalghanam',
        user: user || 'postgres',
        password,
        ssl: sslMode === 'require' || sslMode === 'verify-full' ? { rejectUnauthorized: sslMode === 'verify-full' } : false,
      },
  verbose: true,
  strict: true,
});
