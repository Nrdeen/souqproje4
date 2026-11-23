import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, resolveMediaStorageConfigFromEnv } from '../../server/config';
import {
  buildObjectKey,
  buildS3ObjectUrl,
  computeSha256Hex,
  LocalMediaStorageAdapter,
  parseHttpByteRange,
  RoutedMediaStorageAdapter,
  signAwsSigV4Headers,
  type MediaStorageAdapter,
} from '../../server/mediaStorage';

test('parseHttpByteRange handles full, bounded, open, clamped, suffix, and invalid ranges', () => {
  assert.deepEqual(parseHttpByteRange(undefined, 100), { ok: true, isPartial: false });
  assert.deepEqual(parseHttpByteRange('', 100), { ok: true, isPartial: false });
  assert.deepEqual(parseHttpByteRange('bytes=0-15', 100), {
    ok: true,
    isPartial: true,
    start: 0,
    end: 15,
  });
  assert.deepEqual(parseHttpByteRange('bytes=80-', 100), {
    ok: true,
    isPartial: true,
    start: 80,
    end: 99,
  });
  assert.deepEqual(parseHttpByteRange('bytes=50-9999', 100), {
    ok: true,
    isPartial: true,
    start: 50,
    end: 99,
  });
  assert.deepEqual(parseHttpByteRange('bytes=-20', 100), {
    ok: true,
    isPartial: true,
    start: 80,
    end: 99,
  });
  assert.deepEqual(parseHttpByteRange('bytes=-500', 100), {
    ok: true,
    isPartial: true,
    start: 0,
    end: 99,
  });

  // Multi-range gracefully serves full entity
  assert.deepEqual(parseHttpByteRange('bytes=0-5,10-15', 100), { ok: true, isPartial: false });

  // Invalid / unsatisfiable -> 416
  assert.deepEqual(parseHttpByteRange('bytes=100-120', 100), {
    ok: false,
    status: 416,
    totalBytes: 100,
  });
  assert.deepEqual(parseHttpByteRange('bytes=40-10', 100), {
    ok: false,
    status: 416,
    totalBytes: 100,
  });
  assert.deepEqual(parseHttpByteRange('bytes=-0', 100), {
    ok: false,
    status: 416,
    totalBytes: 100,
  });
  assert.deepEqual(parseHttpByteRange('items=0-5', 100), {
    ok: false,
    status: 416,
    totalBytes: 100,
  });
  assert.deepEqual(parseHttpByteRange('bytes=0-0', 0), {
    ok: false,
    status: 416,
    totalBytes: 0,
  });
});

test('Phase 6C config defaults to local storage and refuses silent fallback on misconfigured cloud providers', () => {
  const def = loadConfig({});
  assert.equal(def.mediaStorage.provider, 'local');
  assert.equal(def.mediaStorage.bucket, null);

  assert.throws(
    () => resolveMediaStorageConfigFromEnv({ MEDIA_STORAGE_PROVIDER: 'ftp' }),
    /Invalid MEDIA_STORAGE_PROVIDER/
  );

  assert.throws(
    () =>
      resolveMediaStorageConfigFromEnv({
        MEDIA_STORAGE_PROVIDER: 's3',
        MEDIA_BUCKET: 'souq-private',
      }),
    /Refusing to fall back to local storage/
  );

  assert.throws(
    () =>
      resolveMediaStorageConfigFromEnv({
        MEDIA_STORAGE_PROVIDER: 's3',
        MEDIA_BUCKET: 'souq-private',
        MEDIA_ACCESS_KEY_ID: 'key',
        MEDIA_SECRET_ACCESS_KEY: 'secret',
      }),
    /requires MEDIA_REGION/
  );

  assert.throws(
    () =>
      resolveMediaStorageConfigFromEnv({
        NODE_ENV: 'production',
        MEDIA_STORAGE_PROVIDER: 's3',
        MEDIA_BUCKET: 'souq-private',
        MEDIA_REGION: 'me-central-1',
        MEDIA_ENDPOINT: 'http://insecure.internal:9000',
        MEDIA_ACCESS_KEY_ID: 'key',
        MEDIA_SECRET_ACCESS_KEY: 'secret',
      }),
    /requires an HTTPS MEDIA_ENDPOINT/
  );

  const r2Cfg = resolveMediaStorageConfigFromEnv({
    MEDIA_STORAGE_PROVIDER: 'r2',
    MEDIA_BUCKET: 'souq-r2-private',
    MEDIA_R2_ACCOUNT_ID: 'acct123',
    MEDIA_ACCESS_KEY_ID: 'r2key',
    MEDIA_SECRET_ACCESS_KEY: 'r2secret',
    MEDIA_KEY_PREFIX: '/prod/uploads/',
  });
  assert.equal(r2Cfg.provider, 'r2');
  assert.equal(r2Cfg.region, 'auto');
  assert.equal(r2Cfg.endpoint, 'https://acct123.r2.cloudflarestorage.com');
  assert.equal(r2Cfg.keyPrefix, 'prod/uploads');

  const gcsCfg = resolveMediaStorageConfigFromEnv({
    MEDIA_STORAGE_PROVIDER: 'gcs',
    MEDIA_BUCKET: 'souq-gcs-private',
    MEDIA_ACCESS_KEY_ID: 'gcskey',
    MEDIA_SECRET_ACCESS_KEY: 'gcssecret',
  });
  assert.equal(gcsCfg.provider, 'gcs');
  assert.equal(gcsCfg.endpoint, 'https://storage.googleapis.com');
  assert.equal(gcsCfg.forcePathStyle, true);
});

test('LocalMediaStorageAdapter supports put/head/range-stream/delete and blocks traversal', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-local-adapter-'));
  try {
    const adapter = new LocalMediaStorageAdapter(tmpDir);
    assert.equal(await adapter.healthCheck(), true);

    const payload = Buffer.from('0123456789abcdef0123456789abcdef', 'utf-8');
    const filename = 'med_0123456789abcdef.jpg';
    const putRes = await adapter.putObject({
      objectKey: filename,
      bytes: payload,
      mimeType: 'image/jpeg',
    });
    assert.equal(putRes.provider, 'local');
    assert.equal(putRes.sizeBytes, payload.length);
    assert.equal(putRes.sha256Hex, computeSha256Hex(payload));

    const head = await adapter.headObject({ objectKey: filename });
    assert.equal(head.exists, true);
    assert.equal(head.sizeBytes, payload.length);

    const partial = await adapter.getObjectStream({ objectKey: filename }, { start: 10, end: 19 });
    assert.ok(partial);
    assert.equal(partial.isPartial, true);
    assert.equal(partial.contentLength, 10);
    const chunks: Buffer[] = [];
    for await (const c of partial.stream) {
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    }
    assert.equal(Buffer.concat(chunks).toString('utf-8'), 'abcdef0123');

    await assert.rejects(
      () =>
        adapter.putObject({
          objectKey: '../escape.jpg',
          bytes: payload,
          mimeType: 'image/jpeg',
        }),
      /Invalid media/
    );
    await assert.rejects(
      () =>
        adapter.putObject({
          objectKey: 'med_1234.svg',
          bytes: payload,
          mimeType: 'image/svg+xml',
        }),
      /Invalid media/
    );

    await adapter.deleteObject({ objectKey: filename });
    const headAfter = await adapter.headObject({ objectKey: filename });
    assert.equal(headAfter.exists, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('AWS SigV4 signer and S3 URL builder generate valid canonical signatures and object keys', () => {
  const key = buildObjectKey('med_abcdef012345.mp4', '/souq/media/');
  assert.equal(key, 'souq/media/med_abcdef012345.mp4');

  const pathStyleUrl = buildS3ObjectUrl({
    endpoint: 'https://s3.me-central-1.amazonaws.com',
    bucket: 'souq-private-bucket',
    objectKey: key,
    forcePathStyle: true,
  });
  assert.equal(
    pathStyleUrl.toString(),
    'https://s3.me-central-1.amazonaws.com/souq-private-bucket/souq/media/med_abcdef012345.mp4'
  );

  const vhostUrl = buildS3ObjectUrl({
    endpoint: 'https://s3.me-central-1.amazonaws.com',
    bucket: 'souq-private-bucket',
    objectKey: key,
    forcePathStyle: false,
  });
  assert.equal(
    vhostUrl.toString(),
    'https://souq-private-bucket.s3.me-central-1.amazonaws.com/souq/media/med_abcdef012345.mp4'
  );

  const fixedDate = new Date('2026-11-17T12:00:00.000Z');
  const h1 = signAwsSigV4Headers({
    method: 'GET',
    url: pathStyleUrl,
    region: 'me-central-1',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    payloadHash: computeSha256Hex(Buffer.alloc(0)),
    extraHeaders: { range: 'bytes=0-15' },
    now: fixedDate,
  });
  const h2 = signAwsSigV4Headers({
    method: 'GET',
    url: pathStyleUrl,
    region: 'me-central-1',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    payloadHash: computeSha256Hex(Buffer.alloc(0)),
    extraHeaders: { range: 'bytes=0-15' },
    now: fixedDate,
  });

  assert.equal(h1.authorization, h2.authorization);
  assert.match(
    h1.authorization,
    /^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/20261117\/me-central-1\/s3\/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=[a-f0-9]{64}$/
  );
});

test('RoutedMediaStorageAdapter writes to primary cloud adapter while supporting local reads during migration', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-routed-adapter-'));
  try {
    const local = new LocalMediaStorageAdapter(tmpDir);
    const localBytes = Buffer.from('local-legacy-bytes', 'utf-8');
    await local.putObject({
      objectKey: 'med_aaaa1111.jpg',
      bytes: localBytes,
      mimeType: 'image/jpeg',
    });

    const cloudWrites: string[] = [];
    const fakeCloud: MediaStorageAdapter = {
      provider: 's3',
      bucket: 'souq-bucket',
      async putObject(input) {
        cloudWrites.push(input.objectKey);
        return {
          provider: 's3',
          bucket: 'souq-bucket',
          objectKey: input.objectKey,
          sizeBytes: input.bytes.length,
          sha256Hex: computeSha256Hex(input.bytes),
        };
      },
      async headObject() {
        return { exists: true, sizeBytes: 5 };
      },
      async getObjectStream() {
        return null;
      },
      async deleteObject() {},
      async healthCheck() {
        return true;
      },
    };

    const routed = new RoutedMediaStorageAdapter(fakeCloud, local);
    const put = await routed.putObject({
      objectKey: 'med_bbbb2222.jpg',
      bytes: Buffer.from('new-cloud-bytes'),
      mimeType: 'image/jpeg',
    });
    assert.equal(put.provider, 's3');
    assert.deepEqual(cloudWrites, ['med_bbbb2222.jpg']);

    const legacyHead = await routed.headObject({
      provider: 'local',
      objectKey: 'med_aaaa1111.jpg',
    });
    assert.equal(legacyHead.exists, true);
    assert.equal(legacyHead.sizeBytes, localBytes.length);

    assert.throws(
      () => routed.headObject({ provider: 'r2', objectKey: 'med_cccc3333.jpg' }),
      /Media asset belongs to provider "r2"/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
