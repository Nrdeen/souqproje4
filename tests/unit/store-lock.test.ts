/**
 * The data-directory lock is what stops the manage-users CLI and a second server from overwriting each other.
 * Uses only Node built-ins, so it runs without installing the app's dependencies.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acquireStoreLock, resolveDataDir, StoreLockedError, STORE_LOCK_FILE_NAME } from '../../server/storage';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'souq-lock-'));
}

function writeLock(dir: string, holder: Record<string, unknown>) {
  fs.writeFileSync(
    path.join(dir, STORE_LOCK_FILE_NAME),
    JSON.stringify({ owner: 'test', nonce: 'other', startedAt: new Date().toISOString(), ...holder })
  );
}

test('a data directory can be locked once; releasing frees it again', () => {
  const dir = tmpDir();
  const first = acquireStoreLock(dir, 'server');
  assert.ok(fs.existsSync(first.lockPath));
  assert.throws(() => acquireStoreLock(dir, 'second server'), StoreLockedError);
  first.release();
  assert.ok(!fs.existsSync(first.lockPath), 'release removes the lock file');
  const again = acquireStoreLock(dir, 'server');
  again.release();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('different directories are independent (two server instances in one process)', () => {
  const a = tmpDir();
  const b = tmpDir();
  const lockA = acquireStoreLock(a, 'server A');
  const lockB = acquireStoreLock(b, 'server B');
  lockA.release();
  lockB.release();
  fs.rmSync(a, { recursive: true, force: true });
  fs.rmSync(b, { recursive: true, force: true });
});

test('a lock held by a live process on this machine is respected', async () => {
  const dir = tmpDir();
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
  try {
    assert.ok(child.pid);
    writeLock(dir, { pid: child.pid, host: os.hostname() });
    assert.throws(() => acquireStoreLock(dir, 'cli'), (err: unknown) => err instanceof StoreLockedError && /locked by/.test(err.message));
  } finally {
    child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a stale lock (crashed process) is reclaimed automatically', () => {
  const dir = tmpDir();
  // A process that has already exited gives us a pid that is certainly not running.
  const done = spawnSync(process.execPath, ['-e', '0']);
  assert.ok(done.pid);
  writeLock(dir, { pid: done.pid, host: os.hostname() });
  const lock = acquireStoreLock(dir, 'server');
  lock.release();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a lock left by another host (e.g. previous container on a persistent volume) does not block startup', () => {
  const dir = tmpDir();
  writeLock(dir, { pid: process.pid, host: 'some-other-host' });
  const lock = acquireStoreLock(dir, 'server');
  lock.release();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('release never deletes a lock that now belongs to someone else', () => {
  const dir = tmpDir();
  const mine = acquireStoreLock(dir, 'server');
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
  try {
    writeLock(dir, { pid: child.pid, host: os.hostname(), nonce: 'someone-else' });
    mine.release();
    assert.ok(fs.existsSync(mine.lockPath), "the other owner's lock must survive our release");
  } finally {
    child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveDataDir: explicit value wins, default is <project>/data', () => {
  assert.equal(resolveDataDir('/tmp/souq-explicit'), path.resolve('/tmp/souq-explicit'));
  assert.equal(path.basename(resolveDataDir()), 'data');
  assert.equal(resolveDataDir(''), resolveDataDir());
});
