import crypto from 'node:crypto';
import {
  sanitizeKeyPrefix,
  type MediaStorageConfig,
  type MediaStorageProvider,
} from './mediaStorage';

export type StorageBackend = 'json' | 'postgres';

export interface PostgresConfig {
  connectionString?: string;
  host?: string;
  port: number;
  database?: string;
  user?: string;
  password?: string;
  sslMode: 'disable' | 'require' | 'verify-full';
  poolMax: number;
  connectionTimeoutMs: number;
}

export interface AppConfig {
  isProd: boolean;
  port: number;
  storageBackend: StorageBackend;
  postgres?: PostgresConfig;
  mediaStorage: MediaStorageConfig;
  dataDir: string;
  /** Origins (scheme://host[:port]) allowed to call mutating APIs and open WebSockets. */
  allowedOrigins: string[];
  /** HMAC secret used to derive CSRF tokens. Required in production. */
  csrfSecret: string;
  cookieName: string;
  cookieSecure: boolean;
  sessionIdleMs: number;
  sessionAbsoluteMs: number;
  maxSessionsPerUser: number;
  /** Registrations allowed per client IP per hour. */
  registerMaxPerHour: number;
  /** Number of reverse-proxy hops to trust for req.ip (0 = none). */
  trustProxy: number;
  /** Dev-only: create demo credentials with random one-time passwords. Ignored in production. */
  demoAccounts: boolean;
  /** Time-to-live (ms) before unbound draft media uploads are cleaned up automatically. */
  unboundMediaTtlMs: number;
  /** Max active audit logs retained in store.json before oldest entries are safely archived to NDJSON (0 = unlimited). */
  auditLogMaxActive: number;
  /** Max read notifications retained per user in store.json (unread notifications are never trimmed; 0 = unlimited). */
  maxReadNotificationsPerUser: number;
  /** Public Google OAuth 2.0 Web Client ID (safe to expose to the frontend for Google Identity Services). */
  googleClientId?: string;
  /** Server-only Google OAuth Client Secret for authorization code exchange fallback. Never expose to clients. */
  googleClientSecret?: string;
  /** Optional explicit OAuth redirect URI override. */
  googleRedirectUri?: string;
  /** Public Facebook App ID (safe to check for enabling social auth). */
  facebookAppId?: string;
  /** Server-only Facebook App Secret for authorization code exchange and appsecret_proof. Never expose to clients. */
  facebookAppSecret?: string;
  /** Optional explicit Facebook OAuth redirect URI override. */
  facebookRedirectUri?: string;
}

const DAY = 24 * 60 * 60 * 1000;

function toOrigin(value: string): string | null {
  try {
    const u = new URL(value.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.origin;
  } catch {
    return null;
  }
}

function intEnv(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`Invalid numeric environment value: ${value}`);
  }
  return n;
}

function resolveStorageBackend(raw: string | undefined): StorageBackend {
  const normalized = (raw || 'json').trim().toLowerCase();
  if (normalized === 'json' || normalized === 'postgres') {
    return normalized;
  }
  throw new Error(`Invalid STORAGE_BACKEND "${raw}". Expected "json" or "postgres".`);
}

function resolveMediaStorageProvider(raw: string | undefined): MediaStorageProvider {
  const normalized = (raw || 'local').trim().toLowerCase();
  if (
    normalized === 'local' ||
    normalized === 's3' ||
    normalized === 'r2' ||
    normalized === 'gcs'
  ) {
    return normalized;
  }
  throw new Error(
    `Invalid MEDIA_STORAGE_PROVIDER "${raw}". Expected "local", "s3", "r2", or "gcs".`
  );
}

export function resolveMediaStorageConfigFromEnv(
  env: Record<string, string | undefined>
): MediaStorageConfig {
  const provider = resolveMediaStorageProvider(env.MEDIA_STORAGE_PROVIDER);
  const keyPrefix = sanitizeKeyPrefix(env.MEDIA_KEY_PREFIX);

  if (provider === 'local') {
    return {
      provider: 'local',
      bucket: null,
      region: 'local',
      forcePathStyle: true,
      keyPrefix,
    };
  }

  const bucket = env.MEDIA_BUCKET?.trim() || '';
  const accessKeyId = (env.MEDIA_ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (env.MEDIA_SECRET_ACCESS_KEY || env.AWS_SECRET_ACCESS_KEY || '').trim();

  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      `MEDIA_STORAGE_PROVIDER=${provider} is enabled, but private bucket credentials are incomplete (require MEDIA_BUCKET, MEDIA_ACCESS_KEY_ID, and MEDIA_SECRET_ACCESS_KEY). Refusing to fall back to local storage.`
    );
  }

  const region =
    (env.MEDIA_REGION || env.AWS_REGION || '').trim() ||
    (provider === 'r2' || provider === 'gcs' ? 'auto' : '');
  if (!region) {
    throw new Error(
      `MEDIA_STORAGE_PROVIDER=${provider} requires MEDIA_REGION or AWS_REGION. Refusing to fall back to local storage.`
    );
  }

  let endpoint = env.MEDIA_ENDPOINT?.trim() || '';
  if (!endpoint) {
    if (provider === 's3') {
      endpoint = `https://s3.${region}.amazonaws.com`;
    } else if (provider === 'gcs') {
      endpoint = 'https://storage.googleapis.com';
    } else if (provider === 'r2') {
      const accountId = env.MEDIA_R2_ACCOUNT_ID?.trim() || '';
      if (accountId) {
        endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
      }
    }
  }

  if (!endpoint) {
    throw new Error(
      `MEDIA_STORAGE_PROVIDER=${provider} requires MEDIA_ENDPOINT (or MEDIA_R2_ACCOUNT_ID for r2). Refusing to fall back to local storage.`
    );
  }

  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    throw new Error(`Invalid MEDIA_ENDPOINT URL: ${endpoint}`);
  }
  if (parsedEndpoint.protocol !== 'https:' && parsedEndpoint.protocol !== 'http:') {
    throw new Error(`Invalid MEDIA_ENDPOINT protocol: ${parsedEndpoint.protocol}`);
  }
  if (env.NODE_ENV === 'production' && parsedEndpoint.protocol !== 'https:') {
    throw new Error('Production cloud media storage requires an HTTPS MEDIA_ENDPOINT.');
  }

  const rawForcePathStyle = env.MEDIA_FORCE_PATH_STYLE?.trim().toLowerCase();
  const forcePathStyle =
    rawForcePathStyle === 'true'
      ? true
      : rawForcePathStyle === 'false'
      ? false
      : Boolean(env.MEDIA_ENDPOINT?.trim() || provider === 'gcs' || provider === 'r2');

  return {
    provider,
    bucket,
    region,
    endpoint: endpoint.replace(/\/+$/, ''),
    accessKeyId,
    secretAccessKey,
    forcePathStyle,
    keyPrefix,
  };
}

function resolveSslMode(raw: string | undefined, isProd: boolean): 'disable' | 'require' | 'verify-full' {
  if (!raw || !raw.trim()) {
    return isProd ? 'require' : 'disable';
  }
  const v = raw.trim().toLowerCase();
  if (v === 'disable' || v === 'require' || v === 'verify-full') {
    return v;
  }
  throw new Error(`Invalid PG_SSL_MODE "${raw}". Expected "disable", "require", or "verify-full".`);
}

export function resolvePostgresConfigFromEnv(
  env: Record<string, string | undefined>,
  isProd: boolean
): PostgresConfig | undefined {
  const connectionString = env.DATABASE_URL?.trim() || undefined;
  const host = (env.PGHOST || env.SQL_HOST)?.trim() || undefined;
  const database = (env.PGDATABASE || env.SQL_DB_NAME)?.trim() || undefined;
  const user = (env.PGUSER || env.SQL_USER)?.trim() || undefined;
  const password = env.PGPASSWORD ?? env.SQL_PASSWORD;
  const port = intEnv(env.PGPORT, 5432, 1, 65535);
  const sslMode = resolveSslMode(env.PG_SSL_MODE, isProd);
  const poolMax = intEnv(env.PG_POOL_MAX, 10, 1, 100);
  const connectionTimeoutMs = intEnv(env.PG_CONNECT_TIMEOUT_MS, 10_000, 500, 60_000);

  if (!connectionString && !host && !database && !user) {
    return undefined;
  }

  return {
    connectionString,
    host,
    port,
    database,
    user,
    password,
    sslMode,
    poolMax,
    connectionTimeoutMs,
  };
}

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
  overrides: Partial<AppConfig> = {}
): AppConfig {
  const isProd = env.NODE_ENV === 'production';
  const rawPort =
    env.APP_PORT?.trim() ||
    (env.NGINX_PORT && env.PORT === env.NGINX_PORT
      ? env.DEFAULT_APP_PORT?.trim() || '3000'
      : env.PORT);
  const port = intEnv(rawPort, 3000, 0, 65535);
  const storageBackend = overrides.storageBackend ?? resolveStorageBackend(env.STORAGE_BACKEND);
  const postgres = overrides.postgres ?? resolvePostgresConfigFromEnv(env, isProd);
  const mediaStorage = overrides.mediaStorage ?? resolveMediaStorageConfigFromEnv(env);

  if (storageBackend === 'postgres') {
    const hasUri = Boolean(postgres?.connectionString);
    const hasDiscrete = Boolean(postgres?.host && postgres?.database && postgres?.user);
    if (!hasUri && !hasDiscrete) {
      throw new Error(
        'STORAGE_BACKEND=postgres is enabled, but PostgreSQL credentials are not configured (set DATABASE_URL or PGHOST/PGDATABASE/PGUSER or SQL_HOST/SQL_DB_NAME/SQL_USER). Refusing to fall back to JSON.'
      );
    }
  }

  const origins = new Set<string>();
  for (const raw of (env.ALLOWED_ORIGINS || '').split(',')) {
    if (!raw.trim()) continue;
    const o = toOrigin(raw);
    if (!o) throw new Error(`ALLOWED_ORIGINS contains an invalid origin: ${raw}`);
    origins.add(o);
  }
  if (env.APP_URL) {
    const o = toOrigin(env.APP_URL);
    if (o) origins.add(o);
  }
  if (!isProd) {
    origins.add(`http://localhost:${port}`);
    origins.add(`http://127.0.0.1:${port}`);
    if (env.NGINX_PORT) {
      origins.add(`http://localhost:${env.NGINX_PORT}`);
      origins.add(`http://127.0.0.1:${env.NGINX_PORT}`);
    }
  }
  if (isProd && origins.size === 0) {
    throw new Error('Production requires ALLOWED_ORIGINS or APP_URL (e.g. https://souq.example.com).');
  }

  let csrfSecret = env.SESSION_SECRET || '';
  if (isProd) {
    if (csrfSecret.length < 32) {
      throw new Error('Production requires SESSION_SECRET with at least 32 characters.');
    }
  } else if (!csrfSecret) {
    csrfSecret = crypto.randomBytes(32).toString('hex');
  }

  const config: AppConfig = {
    isProd,
    port,
    storageBackend,
    postgres,
    mediaStorage,
    dataDir: env.DATA_DIR || '',
    allowedOrigins: [...origins],
    csrfSecret,
    cookieName: isProd ? '__Host-sid' : 'sid',
    cookieSecure: isProd,
    sessionIdleMs: intEnv(env.SESSION_IDLE_DAYS, 7, 1, 90) * DAY,
    sessionAbsoluteMs: intEnv(env.SESSION_MAX_DAYS, 30, 1, 365) * DAY,
    maxSessionsPerUser: 10,
    registerMaxPerHour: 10,
    trustProxy: intEnv(env.TRUST_PROXY, 0, 0, 10),
    // Never available in production, whatever the environment says.
    demoAccounts: !isProd && env.DEMO_ACCOUNTS === 'true',
    unboundMediaTtlMs: intEnv(env.UNBOUND_MEDIA_TTL_MS, DAY, 100, 365 * DAY),
    auditLogMaxActive: intEnv(env.AUDIT_LOG_MAX_ACTIVE, 5000, 0, 100_000),
    maxReadNotificationsPerUser: intEnv(env.MAX_READ_NOTIFICATIONS_PER_USER, 200, 0, 10_000),
    googleClientId: env.GOOGLE_CLIENT_ID?.trim() || undefined,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET?.trim() || undefined,
    googleRedirectUri: env.GOOGLE_REDIRECT_URI?.trim() || undefined,
    facebookAppId: env.FACEBOOK_APP_ID?.trim() || undefined,
    facebookAppSecret: env.FACEBOOK_APP_SECRET?.trim() || undefined,
    facebookRedirectUri: env.FACEBOOK_REDIRECT_URI?.trim() || undefined,
    ...overrides,
  };
  return config;
}
