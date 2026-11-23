/**
 * Data isolation and exclusive ownership of a data directory.
 * Requires `npm install` (express, argon2, ws): real servers on ephemeral ports.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../server.ts';
import { StoreLockedError } from '../../server/storage';

const ORIGIN = 'http://souq.test';
const PASSWORD = 'correct-horse-battery';
const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'souq-iso-'));
const rm = (dir: string) => fs.rmSync(dir, { recursive: true, force: true });

function boot(dataDir: string, extra: Record<string, unknown> = {}) {
  return startServer({
    serveFrontend: false,
    env: { NODE_ENV: 'test' },
    config: { port: 0, dataDir, allowedOrigins: [ORIGIN], registerMaxPerHour: 10_000, ...extra },
  });
}

function register(port: number, phone: string, name = 'مستخدم اختبار'): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ name, phone, password: PASSWORD, role: 'buyer' });
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/api/v1/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), Origin: ORIGIN },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => resolve({ status: res.statusCode || 0, json: raw ? JSON.parse(raw) : null }));
      }
    );
    req.on('error', reject);
    req.end(payload);
  });
}

const readStoreFile = (dir: string) => fs.readFileSync(path.join(dir, 'store.json'), 'utf-8');

test('two instances in one process write only to their own data directory', async () => {
  const dirA = tmp();
  const dirB = tmp();
  const a = await boot(dirA);
  const b = await boot(dirB);
  try {
    // Interleave writes on purpose: with module-level paths the second instance used to capture both.
    assert.equal((await register(a.port, '0551110001')).status, 201);
    assert.equal((await register(b.port, '0552220002')).status, 201);
    assert.equal((await register(a.port, '0551110003')).status, 201);

    const fileA = readStoreFile(dirA);
    const fileB = readStoreFile(dirB);
    assert.ok(fileA.includes('0551110001') && fileA.includes('0551110003'));
    assert.ok(!fileA.includes('0552220002'), "instance B's user must not leak into A's store");
    assert.ok(fileB.includes('0552220002'));
    assert.ok(!fileB.includes('0551110001') && !fileB.includes('0551110003'), "instance A's users must not leak into B's store");
  } finally {
    await a.close();
    await b.close();
    rm(dirA);
    rm(dirB);
  }
});

test('a second server on a directory that is in use refuses to start; the first keeps working', async () => {
  const dir = tmp();
  const first = await boot(dir);
  try {
    await assert.rejects(boot(dir), StoreLockedError);
    assert.equal((await register(first.port, '0553330001')).status, 201);
  } finally {
    await first.close();
  }
  // After a clean shutdown the directory is free again.
  const again = await boot(dir);
  await again.close();
  rm(dir);
});

test('registering an already-registered number keeps answering 409, then throttles probing with 429', async () => {
  const dir = tmp();
  const srv = await boot(dir);
  try {
    assert.equal((await register(srv.port, '0554440001')).status, 201);
    for (let i = 0; i < 5; i++) {
      assert.equal((await register(srv.port, '0554440001')).status, 409, `attempt ${i + 1}`);
    }
    assert.equal((await register(srv.port, '0554440001')).status, 429);
  } finally {
    await srv.close();
    rm(dir);
  }
});

function runCli(dir: string, phone: string) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'scripts/manage-users.ts', 'set-password', '--phone', phone], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, NODE_ENV: 'test', DATA_DIR: dir, ADMIN_PASSWORD: PASSWORD },
    encoding: 'utf-8',
  });
}

test('manage-users refuses to run while the server owns the data directory, and works (with a backup) once it is stopped', async () => {
  const dir = tmp();
  const srv = await boot(dir);
  const phone = srv.getStore().users[0].phone as string;
  const userId = srv.getStore().users[0].id as string;
  try {
    const before = readStoreFile(dir);
    const blocked = runCli(dir, phone);
    assert.notEqual(blocked.status, 0, blocked.stdout + blocked.stderr);
    assert.match(blocked.stderr, /locked/i);
    assert.equal(readStoreFile(dir), before, 'a refused CLI run must not touch store.json');
  } finally {
    await srv.close();
  }

  const ok = runCli(dir, phone);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const store = JSON.parse(readStoreFile(dir));
  assert.ok(store.credentials.some((c: any) => c.userId === userId && /^\$argon2id\$/.test(c.passwordHash)));
  const backups = fs.readdirSync(path.join(dir, 'backups')).filter((f) => f.startsWith('store.pre-cli-'));
  assert.equal(backups.length, 1, 'exactly one pre-change backup');
  assert.ok(!fs.existsSync(path.join(dir, '.store.lock')), 'the CLI releases the lock');
  rm(dir);
});
