/** .env loading rules. Requires `npm install` (dotenv). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadEnvFile } from '../../server/env';

function envFile(content: string): { dir: string; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-env-'));
  const file = path.join(dir, '.env');
  fs.writeFileSync(file, content, { mode: 0o600 });
  return { dir, file };
}

test('loads variables from the file into the target object only', () => {
  const { dir, file } = envFile('SESSION_SECRET="abc"\nDATA_DIR=/tmp/x\n');
  const target: Record<string, string | undefined> = {};
  const res = loadEnvFile(target, file);
  assert.equal(res.loaded, true);
  assert.equal(target.SESSION_SECRET, 'abc');
  assert.equal(target.DATA_DIR, '/tmp/x');
  assert.deepEqual(res.keys.sort(), ['DATA_DIR', 'SESSION_SECRET']);
  assert.equal(process.env.SESSION_SECRET === 'abc', false, 'process.env is not touched when another target is given');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('real environment variables are never overridden by the file', () => {
  const { dir, file } = envFile('SESSION_SECRET=from-file\nTRUST_PROXY=2\n');
  const target: Record<string, string | undefined> = { SESSION_SECRET: 'from-platform' };
  loadEnvFile(target, file);
  assert.equal(target.SESSION_SECRET, 'from-platform');
  assert.equal(target.TRUST_PROXY, '2');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a missing .env is fine', () => {
  const res = loadEnvFile({}, path.join(os.tmpdir(), 'souq-does-not-exist', '.env'));
  assert.equal(res.loaded, false);
  assert.deepEqual(res.warnings, []);
});

test('warns (without printing values) when the file is readable by other users', { skip: process.platform === 'win32' }, () => {
  const { dir, file } = envFile('SESSION_SECRET=very-secret-value\n');
  fs.chmodSync(file, 0o644);
  const res = loadEnvFile({}, file);
  assert.ok(res.warnings.some((w) => /chmod 600/.test(w)));
  assert.ok(!JSON.stringify(res).includes('very-secret-value'));
  fs.rmSync(dir, { recursive: true, force: true });
});
