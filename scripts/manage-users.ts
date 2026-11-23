/**
 * Operator CLI for account management. Passwords are read from a hidden prompt (or the
 * ADMIN_PASSWORD env var for automation) and are never written to the repo or the console.
 *
 *   npm run user:create-admin -- --phone 05XXXXXXXX --name "الاسم"
 *   npm run user:set-password -- --phone 05XXXXXXXX
 *
 * IMPORTANT - stop the server first.
 * The server keeps the whole store in memory and rewrites store.json on every change, so a CLI edit made
 * while it runs would be overwritten (and could in turn overwrite the server's newest data). To make that
 * impossible, the server holds an exclusive lock on the data directory (`data/.store.lock`) while it runs and
 * this command refuses to start if the lock is held:
 *
 *   1. stop the server   2. run the command   3. start the server again
 *
 * The lock is held only while the store is read, backed up and rewritten; the password prompt and hashing
 * happen before it is taken. A timestamped backup of store.json is saved in data/backups/ before every change.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { eq } from 'drizzle-orm';
import { createUserRecord } from '../server/auth/accounts';
import { normalizeSaudiMobile, validatePassword } from '../server/auth/phone';
import { hashPassword } from '../server/auth/password';
import { resolvePostgresConfigFromEnv } from '../server/config';
import { createDb, createPgPool, verifyDatabaseStartup } from '../server/db/client';
import { sessions, userCredentials, users } from '../server/db/schema';
import { loadEnvForEntryPoint } from '../server/env';
import { acquireStoreLock, resolveDataDir, STORE_FILE_NAME, StoreLockedError } from '../server/storage';

// Same .env the server reads, so DATA_DIR and STORAGE_BACKEND can never differ (real env vars still win).
loadEnvForEntryPoint();

const STORAGE_BACKEND = (process.env.STORAGE_BACKEND || 'json').trim().toLowerCase();
const DATA_DIR = resolveDataDir(process.env.DATA_DIR);
const STORE_PATH = path.join(DATA_DIR, STORE_FILE_NAME);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = (rl as any)._writeToOutput;
    (rl as any)._writeToOutput = (text: string) => {
      if (text.startsWith(question)) write.call(rl, text);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function getPassword(phone: string): Promise<string> {
  const fromEnv = process.env.ADMIN_PASSWORD;
  const password = fromEnv ?? (await askHidden('كلمة المرور (10 أحرف على الأقل): '));
  if (!fromEnv) {
    const again = await askHidden('أعد إدخال كلمة المرور: ');
    if (again !== password) throw new Error('كلمتا المرور غير متطابقتين');
  }
  const problem = validatePassword(password, phone);
  if (problem) throw new Error(problem);
  return password;
}

function readStore(): { raw: string; store: any } {
  if (!fs.existsSync(STORE_PATH)) throw new Error(`Store not found at ${STORE_PATH}. Start the server once first.`);
  const raw = fs.readFileSync(STORE_PATH, 'utf-8');
  let store: any;
  try {
    store = JSON.parse(raw);
  } catch {
    throw new Error(`${STORE_PATH} is not valid JSON; nothing was changed. Restore it from data/backups/ if needed.`);
  }
  if (!store || !Array.isArray(store.users)) throw new Error(`${STORE_PATH} has an unexpected format; nothing was changed.`);
  store.credentials ??= [];
  return { raw, store };
}

/** Safety copy of the exact bytes we are about to replace. Never overwrites an existing backup. */
function backupStore(raw: string): string {
  const backupDir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(backupDir, `store.pre-cli-${stamp}-${process.pid}.json`);
  fs.writeFileSync(file, raw, { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
  return file;
}

function writeStoreAtomically(store: unknown) {
  const tmp = `${STORE_PATH}.cli.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmp, STORE_PATH);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

type Command = 'create-admin' | 'set-password';

/** Conditions checked twice: once before asking for a password (fast feedback) and again under the lock / transaction (authoritative). */
function checkUserPreconditions(
  command: Command,
  user: { isDemo?: boolean } | undefined
) {
  if (command === 'create-admin') {
    if (user) throw new Error('الرقم مسجل مسبقاً. لتغيير كلمة المرور استخدم set-password.');
  } else {
    if (!user) throw new Error('لا يوجد حساب بهذا الرقم');
    if (user.isDemo && process.env.NODE_ENV === 'production') {
      throw new Error('الحسابات التجريبية لا تُفعَّل في الإنتاج');
    }
  }
}

async function runPostgres(command: Command, phone: string, name: string) {
  const pgCfg = resolvePostgresConfigFromEnv(process.env, process.env.NODE_ENV === 'production');
  if (!pgCfg || (!pgCfg.connectionString && !(pgCfg.host && pgCfg.database && pgCfg.user))) {
    throw new Error(
      'STORAGE_BACKEND=postgres is set, but PostgreSQL credentials are missing (DATABASE_URL or PGHOST/PGDATABASE/PGUSER). Refusing to touch store.json.'
    );
  }

  const pool = createPgPool(pgCfg);
  try {
    await verifyDatabaseStartup(pool);
    const db = createDb(pool);

    const [preUser] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
    checkUserPreconditions(command, preUser);

    const password = await getPassword(phone);
    const passwordHash = await hashPassword(password);

    await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(users).where(eq(users.phone, phone)).limit(1);
      checkUserPreconditions(command, existing);
      const now = new Date();

      if (command === 'create-admin') {
        const record = createUserRecord({ name, phone, role: 'admin' });
        await tx.insert(users).values({
          id: record.id,
          phone: record.phone,
          email: record.email ?? null,
          name: record.name,
          role: 'admin',
          status: 'active',
          isDemo: false,
          createdAt: new Date(record.createdAt),
        });
        await tx.insert(userCredentials).values({
          userId: record.id,
          passwordHash,
          updatedAt: now,
        });
        console.log(`تم إنشاء المشرف ${record.name} (${record.id}) في قاعدة بيانات PostgreSQL.`);
      } else {
        await tx
          .insert(userCredentials)
          .values({
            userId: existing.id,
            passwordHash,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: userCredentials.userId,
            set: { passwordHash, updatedAt: now },
          });
        await tx.delete(sessions).where(eq(sessions.userId, existing.id));
        console.log(`تم تعيين كلمة مرور جديدة للحساب ${existing.id} في PostgreSQL وإنهاء جلساته الحالية.`);
      }
    });
  } finally {
    await pool.end().catch(() => {});
  }
}

async function runJson(command: Command, phone: string, name: string) {
  // Phase 1 (no lock): read-only pre-check, then prompt + hash so the lock window stays short.
  const preStore = readStore().store;
  checkUserPreconditions(command, preStore.users.find((u: any) => u.phone === phone));
  const password = await getPassword(phone);
  const passwordHash = await hashPassword(password);

  // Phase 2 (exclusive lock): re-read, re-check, back up, modify, write atomically.
  const lock = acquireStoreLock(DATA_DIR, `manage-users ${command}`);
  try {
    const { raw, store } = readStore();
    const targetUser = store.users.find((u: any) => u.phone === phone);
    checkUserPreconditions(command, targetUser);
    const backupFile = backupStore(raw);
    const now = new Date().toISOString();

    if (command === 'create-admin') {
      const user = createUserRecord({ name, phone, role: 'admin' });
      store.users.push(user);
      store.credentials.push({ userId: user.id, passwordHash, updatedAt: now });
      console.log(`تم إنشاء المشرف ${user.name} (${user.id}).`);
    } else {
      const user = targetUser;
      const existing = store.credentials.find((c: any) => c.userId === user.id);
      if (existing) {
        existing.passwordHash = passwordHash;
        existing.updatedAt = now;
      } else {
        store.credentials.push({ userId: user.id, passwordHash, updatedAt: now });
      }
      // A password change ends every existing session for that account.
      store.sessions = (store.sessions || []).filter((s: any) => s.userId !== user.id);
      console.log(`تم تعيين كلمة مرور جديدة للحساب ${user.id} وإنهاء جلساته الحالية.`);
    }

    writeStoreAtomically(store);
    console.log(`نسخة احتياطية قبل التعديل: ${backupFile}`);
  } finally {
    lock.release();
  }
}

async function main() {
  const command = process.argv[2];
  if (command !== 'create-admin' && command !== 'set-password') {
    throw new Error('Usage: manage-users.ts <create-admin|set-password> --phone 05XXXXXXXX [--name "..."]');
  }
  const phone = normalizeSaudiMobile(arg('phone'));
  if (!phone) throw new Error('رقم الجوال غير صحيح، استخدم --phone 05XXXXXXXX');
  const name = arg('name') || 'إدارة المنصة';

  if (STORAGE_BACKEND === 'postgres') {
    await runPostgres(command, phone, name);
  } else if (STORAGE_BACKEND === 'json') {
    await runJson(command, phone, name);
  } else {
    throw new Error(`Invalid STORAGE_BACKEND "${STORAGE_BACKEND}". Expected "json" or "postgres".`);
  }
}

main().catch((err) => {
  if (err instanceof StoreLockedError) {
    console.error(`${err.message}\nلا يمكن تشغيل أوامر الإدارة والخادم يعمل على نفس مجلد البيانات: أوقف الخادم أولاً ثم أعد المحاولة.`);
  } else {
    console.error(err instanceof Error ? err.message : err);
  }
  process.exit(1);
});
