import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { executeMigration, prepareMigrationSnapshot } from '../../scripts/migrate-json-to-pg';
import { runMediaMigration } from '../../scripts/migrate-media-to-object';
import { startServer } from '../../server';
import { hashPassword } from '../../server/auth/password';
import { createDb, createPgPool } from '../../server/db/client';
import { mediaAssets } from '../../server/db/schema';
import { createSeedData, hydrateStore } from '../../server/domain/marketplace';
import {
  computeSha256Hex,
  parseHttpByteRange,
  S3CompatibleMediaStorageAdapter,
} from '../../server/mediaStorage';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

const ORIGIN = 'http://souq.test';
const PASSWORD = 'correct-horse-battery';
const BUCKET = 'souq-private-media';
const ACCESS_KEY = 'AKIATESTPRIVATEKEY1';
const SECRET_KEY = 'secret-test-key-for-sigv4-signing';

interface StoredObject {
  bytes: Buffer;
  contentType: string;
  etag: string;
  sha256Hex: string;
  metadata: Record<string, string>;
}

/**
 * In-process Private S3-Compatible HTTP Object Server for end-to-end wire testing:
 * - Enforces AWS4-HMAC-SHA256 Authorization header (no anonymous/public bucket reads)
 * - Rejects any public ACL headers (`x-amz-acl`)
 * - Supports bucket HEAD, object PUT, HEAD, GET (full + Range 206), and DELETE
 */
async function startPrivateS3MockServer() {
  const objects = new Map<string, StoredObject>();
  let rejectPublicAclViolations = 0;

  const server = http.createServer(async (req, res) => {
    const auth = String(req.headers.authorization || '');
    if (!auth.startsWith(`AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/`)) {
      res.writeHead(403, { 'content-type': 'application/xml' });
      res.end('<Error><Code>AccessDenied</Code></Error>');
      return;
    }

    if (req.headers['x-amz-acl']) {
      rejectPublicAclViolations += 1;
      res.writeHead(403, { 'content-type': 'application/xml' });
      res.end('<Error><Code>PublicAclForbidden</Code></Error>');
      return;
    }

    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const cleanPath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const slashIdx = cleanPath.indexOf('/');
    const bucket = slashIdx === -1 ? cleanPath : cleanPath.slice(0, slashIdx);
    const key = slashIdx === -1 ? '' : cleanPath.slice(slashIdx + 1);

    if (bucket !== BUCKET) {
      res.writeHead(404);
      res.end();
      return;
    }

    // Bucket health check
    if (!key) {
      if (req.method === 'HEAD' || req.method === 'GET') {
        res.writeHead(200);
        res.end();
        return;
      }
      res.writeHead(405);
      res.end();
      return;
    }

    if (req.method === 'PUT') {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      req.on('end', () => {
        const bytes = Buffer.concat(chunks);
        const sha256Hex = computeSha256Hex(bytes);
        const etag = `"${sha256Hex}"`;
        const metadata: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers)) {
          if (k.startsWith('x-amz-meta-') && typeof v === 'string') {
            metadata[k] = v;
          }
        }
        objects.set(key, {
          bytes,
          contentType: String(req.headers['content-type'] || 'application/octet-stream'),
          etag,
          sha256Hex,
          metadata,
        });
        res.writeHead(200, { etag });
        res.end();
      });
      return;
    }

    const obj = objects.get(key);
    if (!obj) {
      res.writeHead(404);
      res.end();
      return;
    }

    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'content-length': String(obj.bytes.length),
        'content-type': obj.contentType,
        etag: obj.etag,
        ...obj.metadata,
      });
      res.end();
      return;
    }

    if (req.method === 'GET') {
      const range = parseHttpByteRange(req.headers.range, obj.bytes.length);
      if (!range.ok) {
        res.writeHead(416, { 'content-range': `bytes */${obj.bytes.length}` });
        res.end();
        return;
      }
      if (range.isPartial) {
        const slice = obj.bytes.subarray(range.start, range.end + 1);
        res.writeHead(206, {
          'content-length': String(slice.length),
          'content-type': obj.contentType,
          'content-range': `bytes ${range.start}-${range.end}/${obj.bytes.length}`,
          'accept-ranges': 'bytes',
          etag: obj.etag,
        });
        res.end(slice);
        return;
      }
      res.writeHead(200, {
        'content-length': String(obj.bytes.length),
        'content-type': obj.contentType,
        'accept-ranges': 'bytes',
        etag: obj.etag,
      });
      res.end(obj.bytes);
      return;
    }

    if (req.method === 'DELETE') {
      objects.delete(key);
      res.writeHead(204);
      res.end();
      return;
    }

    res.writeHead(405);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  return {
    endpoint: `http://127.0.0.1:${port}`,
    objects,
    getPublicAclViolations: () => rejectPublicAclViolations,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function requestRaw(
  port: number,
  method: string,
  urlPath: string,
  opts: {
    cookie?: string;
    csrf?: string;
    headers?: Record<string, string>;
    rawBody?: Buffer;
    body?: unknown;
  } = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer; json: any }> {
  return new Promise((resolve, reject) => {
    const payload =
      opts.rawBody !== undefined
        ? opts.rawBody
        : opts.body !== undefined
        ? Buffer.from(JSON.stringify(opts.body), 'utf-8')
        : undefined;

    const headers: Record<string, string> = { Origin: ORIGIN, ...(opts.headers || {}) };
    if (payload !== undefined) {
      if (opts.rawBody === undefined && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      headers['Content-Length'] = String(payload.length);
    }
    if (opts.cookie) headers['Cookie'] = opts.cookie;
    if (opts.csrf) headers['X-CSRF-Token'] = opts.csrf;

    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        let json: any = null;
        if (String(res.headers['content-type'] || '').includes('application/json')) {
          try {
            json = body.length > 0 ? JSON.parse(body.toString('utf-8')) : null;
          } catch {
            json = null;
          }
        }
        resolve({ status: res.statusCode || 0, headers: res.headers, body, json });
      });
    });
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

function cookieFrom(headers: http.IncomingHttpHeaders): string {
  const raw = ([] as string[]).concat(headers['set-cookie'] || [])[0] || '';
  return raw.split(';')[0];
}

function buildMultipart(kind: 'image' | 'video', filename: string, contentType: string, bytes: Buffer) {
  const boundary = `----S3TestBoundary${Math.random().toString(16).slice(2)}`;
  const rawBody = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\n${kind}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
      'utf-8'
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8'),
  ]);
  return { contentType: `multipart/form-data; boundary=${boundary}`, rawBody };
}

function sampleJpeg(seedByte = 0x11, size = 128) {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size, seedByte)]);
}

function sampleMp4(size = 512) {
  const header = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from('ftypisom', 'ascii')]);
  const payload = Buffer.alloc(size);
  for (let i = 0; i < size; i += 1) {
    payload[i] = i % 251;
  }
  return Buffer.concat([header, payload]);
}

let s3Mock: Awaited<ReturnType<typeof startPrivateS3MockServer>>;
let dataDir: string;

before(async () => {
  s3Mock = await startPrivateS3MockServer();
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-s3-media-int-'));
});

after(async () => {
  await s3Mock.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('Phase 6C end-to-end: private S3 bucket uploads, auth isolation (draft/pending/rejected/expired/suspended), HTTP Range streaming, cleanup, and restart persistence', async () => {
  const env = {
    PORT: '0',
    NODE_ENV: 'test',
    DATA_DIR: dataDir,
    ALLOWED_ORIGINS: ORIGIN,
    DEMO_ACCOUNTS: 'false',
    STORAGE_BACKEND: 'json',
    MEDIA_STORAGE_PROVIDER: 's3',
    MEDIA_BUCKET: BUCKET,
    MEDIA_REGION: 'me-central-1',
    MEDIA_ENDPOINT: s3Mock.endpoint,
    MEDIA_ACCESS_KEY_ID: ACCESS_KEY,
    MEDIA_SECRET_ACCESS_KEY: SECRET_KEY,
    MEDIA_FORCE_PATH_STYLE: 'true',
    MEDIA_KEY_PREFIX: 'staging/media',
  };

  let srv = await startServer({ serveFrontend: false, env });
  try {
    assert.equal(srv.mediaProvider, 's3');

    const health = await requestRaw(srv.port, 'GET', '/api/v1/health');
    assert.equal(health.status, 200);
    assert.deepEqual(health.json, { ok: true, backend: 'json' });

    // Create sellerA, sellerB, admin
    const regA = await requestRaw(srv.port, 'POST', '/api/v1/auth/register', {
      body: { name: 'بائع السحابة أ', phone: '0582000001', password: PASSWORD, role: 'seller' },
    });
    assert.equal(regA.status, 201);
    const sellerA = {
      cookie: cookieFrom(regA.headers),
      csrf: regA.json.csrfToken as string,
      user: regA.json.user,
    };

    const regB = await requestRaw(srv.port, 'POST', '/api/v1/auth/register', {
      body: { name: 'بائع السحابة ب', phone: '0582000002', password: PASSWORD, role: 'seller' },
    });
    assert.equal(regB.status, 201);
    const sellerB = {
      cookie: cookieFrom(regB.headers),
      csrf: regB.json.csrfToken as string,
      user: regB.json.user,
    };

    const store = srv.getStore();
    store.users.push({
      id: 'usr_s3_admin',
      phone: '0598888881',
      email: 's3-admin@test.sa',
      name: 'S3 Admin',
      role: 'admin',
      status: 'active',
      createdAt: new Date().toISOString(),
      phoneVerifiedAt: null,
    });
    store.credentials.push({
      userId: 'usr_s3_admin',
      passwordHash: await hashPassword(PASSWORD),
      updatedAt: new Date().toISOString(),
    });
    const adminLogin = await requestRaw(srv.port, 'POST', '/api/v1/auth/login', {
      body: { phone: '0598888881', password: PASSWORD },
    });
    assert.equal(adminLogin.status, 200);
    const admin = {
      cookie: cookieFrom(adminLogin.headers),
      csrf: adminLogin.json.csrfToken as string,
    };

    // 1. Upload image + video via /api/v1/media/upload -> stored in private S3 bucket ONLY
    const jpgBytes = sampleJpeg(0x2a, 140);
    const mp4Bytes = sampleMp4(600);
    const mpImg = buildMultipart('image', 'cloud-sheep.jpg', 'image/jpeg', jpgBytes);
    const mpVid = buildMultipart('video', 'cloud-herd.mp4', 'video/mp4', mp4Bytes);

    const imgRes = await requestRaw(srv.port, 'POST', '/api/v1/media/upload', {
      cookie: sellerA.cookie,
      csrf: sellerA.csrf,
      headers: { 'Content-Type': mpImg.contentType },
      rawBody: mpImg.rawBody,
    });
    assert.equal(imgRes.status, 201);
    const uploadedImg = imgRes.json.media;
    assert.match(uploadedImg.url, /^\/api\/v1\/media\/med_/);

    const vidRes = await requestRaw(srv.port, 'POST', '/api/v1/media/upload', {
      cookie: sellerA.cookie,
      csrf: sellerA.csrf,
      headers: { 'Content-Type': mpVid.contentType },
      rawBody: mpVid.rawBody,
    });
    assert.equal(vidRes.status, 201);
    const uploadedVid = vidRes.json.media;

    // Verify local disk uploads dir does NOT hold the S3 objects
    const uploadsPath = path.join(dataDir, 'uploads');
    const diskFiles = fs.existsSync(uploadsPath) ? fs.readdirSync(uploadsPath) : [];
    assert.equal(diskFiles.length, 0);

    // Verify objects exist in S3 under key prefix with SHA-256 and private ACL
    const imgMeta = store.media.find((m) => m.id === uploadedImg.id)!;
    assert.equal(imgMeta.storageProvider, 's3');
    assert.equal(imgMeta.bucket, BUCKET);
    assert.equal(imgMeta.objectKey, `staging/media/${imgMeta.filename}`);
    assert.equal(imgMeta.sha256Hex, computeSha256Hex(jpgBytes));
    assert.equal(s3Mock.objects.has(imgMeta.objectKey!), true);
    assert.equal(s3Mock.getPublicAclViolations(), 0);

    // Direct anonymous access to S3 bucket rejects with 403
    const directS3Anon = await fetch(`${s3Mock.endpoint}/${BUCKET}/${imgMeta.objectKey}`);
    assert.equal(directS3Anon.status, 403);

    // 2. Unbound draft privacy: 404 for anonymous and sellerB, 200 for sellerA & admin
    assert.equal((await requestRaw(srv.port, 'GET', uploadedImg.url)).status, 404);
    assert.equal(
      (await requestRaw(srv.port, 'GET', uploadedImg.url, { cookie: sellerB.cookie })).status,
      404
    );
    assert.equal(
      (await requestRaw(srv.port, 'GET', uploadedImg.url, { cookie: sellerA.cookie })).status,
      200
    );
    assert.equal(
      (await requestRaw(srv.port, 'GET', uploadedImg.url, { cookie: admin.cookie })).status,
      200
    );

    // 3. Create Draft listing -> stays private; move to Pending -> stays private
    const createDraft = await requestRaw(srv.port, 'POST', '/api/v1/listings', {
      cookie: sellerA.cookie,
      csrf: sellerA.csrf,
      body: {
        title: 'حلال نعيمي مرفوع على التخزين السحابي',
        description: 'تجربة التخزين الخاص الآمن',
        priceAmount: 1850,
        breedId: store.breeds[0].id,
        regionId: store.regions[0].id,
        status: 'Draft',
        images: [{ url: uploadedImg.url, mediaId: uploadedImg.id, position: 1 }],
        videoMediaId: uploadedVid.id,
      },
    });
    assert.equal(createDraft.status, 201);
    const listingId = createDraft.json.listing.id as string;
    assert.equal(createDraft.json.listing.status, 'Draft');

    assert.equal((await requestRaw(srv.port, 'GET', uploadedVid.url)).status, 404);
    assert.equal(
      (await requestRaw(srv.port, 'GET', uploadedVid.url, { cookie: sellerB.cookie })).status,
      404
    );

    // Move to Pending -> still hidden from non-owner/non-admin
    await requestRaw(srv.port, 'PATCH', `/api/v1/listings/${listingId}`, {
      cookie: sellerA.cookie,
      csrf: sellerA.csrf,
      body: { status: 'Pending' },
    });
    assert.equal((await requestRaw(srv.port, 'GET', uploadedVid.url)).status, 404);

    // 4. Approve listing -> public download, HEAD, HTTP Range 206 streaming, and 416 handling
    const approve = await requestRaw(srv.port, 'POST', `/api/v1/admin/listings/${listingId}/approve`, {
      cookie: admin.cookie,
      csrf: admin.csrf,
    });
    assert.equal(approve.status, 200);

    const headVid = await requestRaw(srv.port, 'HEAD', uploadedVid.url);
    assert.equal(headVid.status, 200);
    assert.equal(headVid.headers['accept-ranges'], 'bytes');
    assert.equal(headVid.headers['content-length'], String(mp4Bytes.length));
    assert.equal(headVid.headers['etag'], `"${computeSha256Hex(mp4Bytes)}"`);
    assert.equal(headVid.body.length, 0);

    const range1 = await requestRaw(srv.port, 'GET', uploadedVid.url, {
      headers: { Range: 'bytes=0-63' },
    });
    assert.equal(range1.status, 206);
    assert.equal(range1.headers['content-range'], `bytes 0-63/${mp4Bytes.length}`);
    assert.equal(Buffer.compare(range1.body, mp4Bytes.subarray(0, 64)), 0);

    const range2 = await requestRaw(srv.port, 'GET', uploadedVid.url, {
      headers: { Range: 'bytes=120-219' },
    });
    assert.equal(range2.status, 206);
    assert.equal(range2.headers['content-range'], `bytes 120-219/${mp4Bytes.length}`);
    assert.equal(Buffer.compare(range2.body, mp4Bytes.subarray(120, 220)), 0);

    const suffixRange = await requestRaw(srv.port, 'GET', uploadedVid.url, {
      headers: { Range: 'bytes=-32' },
    });
    assert.equal(suffixRange.status, 206);
    assert.equal(Buffer.compare(suffixRange.body, mp4Bytes.subarray(mp4Bytes.length - 32)), 0);

    const badRange = await requestRaw(srv.port, 'GET', uploadedVid.url, {
      headers: { Range: `bytes=${mp4Bytes.length + 50}-` },
    });
    assert.equal(badRange.status, 416);
    assert.equal(badRange.headers['content-range'], `bytes */${mp4Bytes.length}`);

    // 5. Rejected, Expired, and Suspended seller listings hide media from public/other users
    await requestRaw(srv.port, 'POST', `/api/v1/admin/listings/${listingId}/reject`, {
      cookie: admin.cookie,
      csrf: admin.csrf,
      body: { reason: 'مخالفة مؤقتة للفحص' },
    });
    assert.equal((await requestRaw(srv.port, 'GET', uploadedImg.url)).status, 404);
    assert.equal(
      (await requestRaw(srv.port, 'GET', uploadedImg.url, { cookie: sellerA.cookie })).status,
      200
    );

    // Re-approve then expire via admin patch -> hidden from public
    await requestRaw(srv.port, 'POST', `/api/v1/admin/listings/${listingId}/approve`, {
      cookie: admin.cookie,
      csrf: admin.csrf,
    });
    assert.equal((await requestRaw(srv.port, 'GET', uploadedImg.url)).status, 200);

    await requestRaw(srv.port, 'PATCH', `/api/v1/listings/${listingId}`, {
      cookie: admin.cookie,
      csrf: admin.csrf,
      body: { status: 'Expired' },
    });
    assert.equal((await requestRaw(srv.port, 'GET', uploadedImg.url)).status, 404);

    // Re-approve then suspend seller -> media hidden from public and other sellers, visible to admin
    await requestRaw(srv.port, 'POST', `/api/v1/admin/listings/${listingId}/approve`, {
      cookie: admin.cookie,
      csrf: admin.csrf,
    });
    await requestRaw(srv.port, 'POST', `/api/v1/admin/users/${sellerA.user.id}/suspend`, {
      cookie: admin.cookie,
      csrf: admin.csrf,
      body: { reason: 'اختبار تعليق الحساب' },
    });
    assert.equal((await requestRaw(srv.port, 'GET', uploadedImg.url)).status, 404);
    assert.equal(
      (await requestRaw(srv.port, 'GET', uploadedImg.url, { cookie: sellerB.cookie })).status,
      404
    );
    assert.equal(
      (await requestRaw(srv.port, 'GET', uploadedImg.url, { cookie: admin.cookie })).status,
      200
    );

    // Reactivate seller for restart persistence & cleanup checks
    await requestRaw(srv.port, 'POST', `/api/v1/admin/users/${sellerA.user.id}/reactivate`, {
      cookie: admin.cookie,
      csrf: admin.csrf,
      body: { reason: 'إعادة تفعيل بعد الفحص' },
    });

    // Upload an unbound draft image as sellerB and backdate it -> orphan cleanup deletes from metadata & S3
    const orphanMp = buildMultipart('image', 'orphan.jpg', 'image/jpeg', sampleJpeg(0x99, 64));
    const orphanRes = await requestRaw(srv.port, 'POST', '/api/v1/media/upload', {
      cookie: sellerB.cookie,
      csrf: sellerB.csrf,
      headers: { 'Content-Type': orphanMp.contentType },
      rawBody: orphanMp.rawBody,
    });
    assert.equal(orphanRes.status, 201);
    const orphanId = orphanRes.json.media.id as string;
    const orphanMeta = store.media.find((m) => m.id === orphanId)!;
    const orphanKey = orphanMeta.objectKey!;
    assert.equal(s3Mock.objects.has(orphanKey), true);
    orphanMeta.createdAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const cleanedIds = await srv.cleanupOrphanedMedia();
    assert.deepEqual(cleanedIds, [orphanId]);
    assert.equal(s3Mock.objects.has(orphanKey), false);
    assert.equal(s3Mock.objects.has(imgMeta.objectKey!), true);

    // 6. Restart persistence: close server & boot a new server against same dataDir + S3 bucket
    await srv.close();
    srv = await startServer({ serveFrontend: false, env });

    const imgAfterRestart = await requestRaw(srv.port, 'GET', uploadedImg.url);
    assert.equal(imgAfterRestart.status, 200);
    assert.equal(Buffer.compare(imgAfterRestart.body, jpgBytes), 0);

    const vidRangeAfterRestart = await requestRaw(srv.port, 'GET', uploadedVid.url, {
      headers: { Range: 'bytes=10-49' },
    });
    assert.equal(vidRangeAfterRestart.status, 206);
    assert.equal(Buffer.compare(vidRangeAfterRestart.body, mp4Bytes.subarray(10, 50)), 0);
  } finally {
    await srv.close();
  }
});

test('Phase 6C media migration utility supports --dry-run, checksum-verified S3 migration (without deleting local files), verification, mixed reads, and safe rollback', async () => {
  const migDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-media-migrate-int-'));
  const localEnv = {
    PORT: '0',
    NODE_ENV: 'test',
    DATA_DIR: migDataDir,
    ALLOWED_ORIGINS: ORIGIN,
    DEMO_ACCOUNTS: 'false',
    STORAGE_BACKEND: 'json',
    MEDIA_STORAGE_PROVIDER: 'local',
  };

  let srv = await startServer({ serveFrontend: false, env: localEnv });
  try {
    // Upload two local assets and publish a listing
    const reg = await requestRaw(srv.port, 'POST', '/api/v1/auth/register', {
      body: { name: 'مهاجر الوسائط', phone: '0583000001', password: PASSWORD, role: 'seller' },
    });
    assert.equal(reg.status, 201);
    const cookie = cookieFrom(reg.headers);
    const csrf = reg.json.csrfToken as string;

    const imgBytes = sampleJpeg(0x4b, 180);
    const vidBytes = sampleMp4(320);

    const upImg = buildMultipart('image', 'mig.jpg', 'image/jpeg', imgBytes);
    const resImg = await requestRaw(srv.port, 'POST', '/api/v1/media/upload', {
      cookie,
      csrf,
      headers: { 'Content-Type': upImg.contentType },
      rawBody: upImg.rawBody,
    });
    assert.equal(resImg.status, 201);
    const localImgId = resImg.json.media.id as string;

    const upVid = buildMultipart('video', 'mig.mp4', 'video/mp4', vidBytes);
    const resVid = await requestRaw(srv.port, 'POST', '/api/v1/media/upload', {
      cookie,
      csrf,
      headers: { 'Content-Type': upVid.contentType },
      rawBody: upVid.rawBody,
    });
    assert.equal(resVid.status, 201);
    const localVidId = resVid.json.media.id as string;

    const store = srv.getStore();
    store.users.push({
      id: 'usr_mig_admin',
      phone: '0597777771',
      email: 'mig-admin@test.sa',
      name: 'Migration Admin',
      role: 'admin',
      status: 'active',
      createdAt: new Date().toISOString(),
      phoneVerifiedAt: null,
    });
    store.credentials.push({
      userId: 'usr_mig_admin',
      passwordHash: await hashPassword(PASSWORD),
      updatedAt: new Date().toISOString(),
    });
    const adminLogin = await requestRaw(srv.port, 'POST', '/api/v1/auth/login', {
      body: { phone: '0597777771', password: PASSWORD },
    });
    assert.equal(adminLogin.status, 200);
    const adminCookie = cookieFrom(adminLogin.headers);
    const adminCsrf = adminLogin.json.csrfToken as string;

    const created = await requestRaw(srv.port, 'POST', '/api/v1/listings', {
      cookie,
      csrf,
      body: {
        title: 'أضاحي نعيمي لترحيل الوسائط',
        priceAmount: 1700,
        breedId: store.breeds[0].id,
        regionId: store.regions[0].id,
        images: [{ url: `/api/v1/media/${localImgId}`, mediaId: localImgId, position: 1 }],
        videoMediaId: localVidId,
      },
    });
    assert.equal(created.status, 201);
    await requestRaw(srv.port, 'POST', `/api/v1/admin/listings/${created.json.listing.id}/approve`, {
      cookie: adminCookie,
      csrf: adminCsrf,
    });
    await srv.close();

    const s3Adapter = new S3CompatibleMediaStorageAdapter({
      provider: 's3',
      bucket: BUCKET,
      region: 'me-central-1',
      endpoint: s3Mock.endpoint,
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
      forcePathStyle: true,
    });

    const uploadsDir = path.join(migDataDir, 'uploads');

    // 1. Dry-run migration plans all items without modifying S3 or JSON store
    const dryReport = await runMediaMigration({
      mode: 'migrate',
      backend: 'json',
      dryRun: true,
      uploadsDir,
      keyPrefix: 'migrated/v1',
      targetAdapter: s3Adapter,
      dataDir: migDataDir,
    });
    assert.equal(dryReport.totalInspected, 2);
    assert.equal(dryReport.succeeded, 2);
    assert.equal(dryReport.failed, 0);
    assert.ok(dryReport.items.every((i) => i.action === 'planned'));
    assert.equal(s3Mock.objects.has(`migrated/v1/${localImgId}.jpg`), false);

    // 2. Live migration uploads to S3, verifies SHA-256, updates metadata, keeps local files intact
    const liveReport = await runMediaMigration({
      mode: 'migrate',
      backend: 'json',
      dryRun: false,
      uploadsDir,
      keyPrefix: 'migrated/v1',
      targetAdapter: s3Adapter,
      dataDir: migDataDir,
    });
    assert.equal(liveReport.totalInspected, 2);
    assert.equal(liveReport.succeeded, 2);
    assert.equal(liveReport.failed, 0);
    assert.ok(liveReport.items.every((i) => i.action === 'migrated'));
    assert.equal(s3Mock.objects.has(`migrated/v1/${localImgId}.jpg`), true);
    assert.equal(s3Mock.objects.has(`migrated/v1/${localVidId}.mp4`), true);
    // Original local files were NEVER deleted!
    assert.equal(fs.existsSync(path.join(uploadsDir, `${localImgId}.jpg`)), true);
    assert.equal(fs.existsSync(path.join(uploadsDir, `${localVidId}.mp4`)), true);

    // 3. Verify mode confirms checksum + size integrity on cloud objects + local copies
    const verifyReport = await runMediaMigration({
      mode: 'verify',
      backend: 'json',
      uploadsDir,
      targetAdapter: s3Adapter,
      dataDir: migDataDir,
    });
    assert.equal(verifyReport.succeeded, 2);
    assert.equal(verifyReport.failed, 0);

    // 4. Boot server in S3 mode -> upload one NEW S3-only asset (no local copy), verify serving
    const s3Env = {
      ...localEnv,
      MEDIA_STORAGE_PROVIDER: 's3',
      MEDIA_BUCKET: BUCKET,
      MEDIA_REGION: 'me-central-1',
      MEDIA_ENDPOINT: s3Mock.endpoint,
      MEDIA_ACCESS_KEY_ID: ACCESS_KEY,
      MEDIA_SECRET_ACCESS_KEY: SECRET_KEY,
      MEDIA_FORCE_PATH_STYLE: 'true',
      MEDIA_KEY_PREFIX: 'migrated/v1',
    };
    srv = await startServer({ serveFrontend: false, env: s3Env });
    const reImg = await requestRaw(srv.port, 'GET', `/api/v1/media/${localImgId}`);
    assert.equal(reImg.status, 200);
    assert.equal(Buffer.compare(reImg.body, imgBytes), 0);

    const newS3Bytes = sampleJpeg(0x7c, 96);
    const loginSeller = await requestRaw(srv.port, 'POST', '/api/v1/auth/login', {
      body: { phone: '0583000001', password: PASSWORD },
    });
    const newUp = buildMultipart('image', 's3-only.jpg', 'image/jpeg', newS3Bytes);
    const newUpRes = await requestRaw(srv.port, 'POST', '/api/v1/media/upload', {
      cookie: cookieFrom(loginSeller.headers),
      csrf: loginSeller.json.csrfToken,
      headers: { 'Content-Type': newUp.contentType },
      rawBody: newUp.rawBody,
    });
    assert.equal(newUpRes.status, 201);
    const s3OnlyId = newUpRes.json.media.id as string;
    assert.equal(fs.existsSync(path.join(uploadsDir, `${s3OnlyId}.jpg`)), false);
    await srv.close();

    // 5. Safe rollback restores missing s3-only file to local disk, updates metadata, keeps S3 objects
    const rollbackReport = await runMediaMigration({
      mode: 'rollback',
      backend: 'json',
      dryRun: false,
      uploadsDir,
      targetAdapter: s3Adapter,
      dataDir: migDataDir,
    });
    assert.equal(rollbackReport.totalInspected, 3);
    assert.equal(rollbackReport.succeeded, 3);
    assert.equal(rollbackReport.failed, 0);
    assert.equal(fs.existsSync(path.join(uploadsDir, `${s3OnlyId}.jpg`)), true);
    assert.equal(s3Mock.objects.has(`migrated/v1/${s3OnlyId}.jpg`), true);

    // Boot server back in local mode -> all media work cleanly
    srv = await startServer({ serveFrontend: false, env: localEnv });
    const verifyLocalAfterRollback = await runMediaMigration({
      mode: 'verify',
      backend: 'json',
      uploadsDir,
      dataDir: migDataDir,
    });
    assert.equal(verifyLocalAfterRollback.succeeded, 3);
    assert.equal(verifyLocalAfterRollback.failed, 0);

    const servedImg = await requestRaw(srv.port, 'GET', `/api/v1/media/${localImgId}`);
    assert.equal(servedImg.status, 200);
    assert.equal(Buffer.compare(servedImg.body, imgBytes), 0);
  } finally {
    await srv.close();
    fs.rmSync(migDataDir, { recursive: true, force: true });
  }
});

test(
  'Phase 6C Live PostgreSQL + private S3 bucket: metadata persistence, authorization, Range video streaming, orphan cleanup, and PG media migration/rollback',
  {
    skip: !TEST_DATABASE_URL
      ? 'Live PostgreSQL server not configured (set TEST_DATABASE_URL or DATABASE_URL)'
      : false,
  },
  async () => {
    const pgDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-pg-media-6c-'));
    const pool = createPgPool({
      connectionString: TEST_DATABASE_URL,
      port: 5432,
      sslMode: 'disable',
      poolMax: 5,
      connectionTimeoutMs: 5000,
    });

    try {
      const db = createDb(pool);
      await migrate(db, { migrationsFolder: path.resolve(process.cwd(), 'drizzle') });

      const seed = hydrateStore(createSeedData());
      const adminUser = seed.users.find((u) => u.id === 'usr_admin_1')!;
      const sellerUser = seed.users.find((u) => u.id === 'usr_seller_1')!;
      const adminHash = await hashPassword(PASSWORD);
      const sellerHash = await hashPassword(PASSWORD);
      seed.credentials = [
        { userId: adminUser.id, passwordHash: adminHash, updatedAt: new Date().toISOString() },
        { userId: sellerUser.id, passwordHash: sellerHash, updatedAt: new Date().toISOString() },
      ];
      const snapshot = prepareMigrationSnapshot(seed);
      await executeMigration(db, snapshot, { dryRun: false, truncate: true });

      const basePgEnv = {
        PORT: '0',
        NODE_ENV: 'test',
        DATA_DIR: pgDataDir,
        ALLOWED_ORIGINS: ORIGIN,
        DEMO_ACCOUNTS: 'false',
        STORAGE_BACKEND: 'postgres',
        DATABASE_URL: TEST_DATABASE_URL,
        PG_SSL_MODE: 'disable',
      };

      // Step 1: Boot with local media + postgres and upload an image
      let srv = await startServer({
        serveFrontend: false,
        env: { ...basePgEnv, MEDIA_STORAGE_PROVIDER: 'local' },
      });
      let localImgId: string;
      const localBytes = sampleJpeg(0x61, 140);
      try {
        const loginSeller = await requestRaw(srv.port, 'POST', '/api/v1/auth/login', {
          body: { phone: sellerUser.phone, password: PASSWORD },
        });
        assert.equal(loginSeller.status, 200);
        const sCookie = cookieFrom(loginSeller.headers);
        const sCsrf = loginSeller.json.csrfToken as string;

        const up = buildMultipart('image', 'pg-local.jpg', 'image/jpeg', localBytes);
        const upRes = await requestRaw(srv.port, 'POST', '/api/v1/media/upload', {
          cookie: sCookie,
          csrf: sCsrf,
          headers: { 'Content-Type': up.contentType },
          rawBody: up.rawBody,
        });
        assert.equal(upRes.status, 201);
        localImgId = upRes.json.media.id;
      } finally {
        await srv.close();
      }

      // Step 2: Dry-run & Live PG media migration to private S3 bucket
      const s3Adapter = new S3CompatibleMediaStorageAdapter({
        provider: 's3',
        bucket: BUCKET,
        region: 'me-central-1',
        endpoint: s3Mock.endpoint,
        accessKeyId: ACCESS_KEY,
        secretAccessKey: SECRET_KEY,
        forcePathStyle: true,
      });
      const uploadsDir = path.join(pgDataDir, 'uploads');

      const pgDry = await runMediaMigration({
        mode: 'migrate',
        backend: 'postgres',
        dryRun: true,
        uploadsDir,
        keyPrefix: 'pg-prod',
        targetAdapter: s3Adapter,
        db,
      });
      assert.equal(pgDry.succeeded, 1);
      assert.equal(pgDry.failed, 0);

      const pgMig = await runMediaMigration({
        mode: 'migrate',
        backend: 'postgres',
        dryRun: false,
        uploadsDir,
        keyPrefix: 'pg-prod',
        targetAdapter: s3Adapter,
        db,
      });
      assert.equal(pgMig.succeeded, 1);
      assert.equal(pgMig.failed, 0);
      assert.equal(fs.existsSync(path.join(uploadsDir, `${localImgId}.jpg`)), true);

      const [migratedRow] = await db
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.id, localImgId));
      assert.equal(migratedRow.storageProvider, 's3');
      assert.equal(migratedRow.bucket, BUCKET);
      assert.equal(migratedRow.objectKey, `pg-prod/${migratedRow.filename}`);
      assert.equal(migratedRow.sha256Hex, computeSha256Hex(localBytes));

      // Step 3: Boot PG server in S3 mode -> upload video, publish, verify Range streaming & orphan cleanup
      const pgS3Env = {
        ...basePgEnv,
        MEDIA_STORAGE_PROVIDER: 's3',
        MEDIA_BUCKET: BUCKET,
        MEDIA_REGION: 'me-central-1',
        MEDIA_ENDPOINT: s3Mock.endpoint,
        MEDIA_ACCESS_KEY_ID: ACCESS_KEY,
        MEDIA_SECRET_ACCESS_KEY: SECRET_KEY,
        MEDIA_FORCE_PATH_STYLE: 'true',
        MEDIA_KEY_PREFIX: 'pg-prod',
      };
      srv = await startServer({ serveFrontend: false, env: pgS3Env });
      let s3VidId = '';
      const vidBytes = sampleMp4(420);
      try {
        const [sLogin, aLogin] = await Promise.all([
          requestRaw(srv.port, 'POST', '/api/v1/auth/login', {
            body: { phone: sellerUser.phone, password: PASSWORD },
          }),
          requestRaw(srv.port, 'POST', '/api/v1/auth/login', {
            body: { phone: adminUser.phone, password: PASSWORD },
          }),
        ]);
        const sCookie = cookieFrom(sLogin.headers);
        const sCsrf = sLogin.json.csrfToken as string;
        const aCookie = cookieFrom(aLogin.headers);
        const aCsrf = aLogin.json.csrfToken as string;

        const upVid = buildMultipart('video', 'pg-s3.mp4', 'video/mp4', vidBytes);
        const vidRes = await requestRaw(srv.port, 'POST', '/api/v1/media/upload', {
          cookie: sCookie,
          csrf: sCsrf,
          headers: { 'Content-Type': upVid.contentType },
          rawBody: upVid.rawBody,
        });
        assert.equal(vidRes.status, 201);
        s3VidId = vidRes.json.media.id;

        // Upload an expired orphan and verify PG + S3 cleanup removes both row & bucket object
        const upOrph = buildMultipart('image', 'pg-orphan.jpg', 'image/jpeg', sampleJpeg(0x71, 64));
        const orphRes = await requestRaw(srv.port, 'POST', '/api/v1/media/upload', {
          cookie: sCookie,
          csrf: sCsrf,
          headers: { 'Content-Type': upOrph.contentType },
          rawBody: upOrph.rawBody,
        });
        assert.equal(orphRes.status, 201);
        const orphanId = orphRes.json.media.id as string;
        const [orphRow] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, orphanId));
        assert.equal(s3Mock.objects.has(orphRow.objectKey), true);
        await db.execute(
          sql`UPDATE media_assets SET created_at = NOW() - INTERVAL '48 hours' WHERE id = ${orphanId}`
        );
        const cleaned = await srv.cleanupOrphanedMedia();
        assert.ok(cleaned.includes(orphanId));
        assert.equal(s3Mock.objects.has(orphRow.objectKey), false);

        // Bind both migrated image and S3 video to a listing -> Pending (private) -> Approve (public Range)
        const createRes = await requestRaw(srv.port, 'POST', '/api/v1/listings', {
          cookie: sCookie,
          csrf: sCsrf,
          body: {
            title: 'إعلان بوسائط PostgreSQL و S3',
            priceAmount: 2200,
            breedId: 'brd_naimi',
            regionId: 'reg_riyadh',
            images: [{ mediaId: localImgId, position: 1 }],
            videoMediaId: s3VidId,
          },
        });
        assert.equal(createRes.status, 201);
        const lid = createRes.json.listing.id as string;
        assert.equal((await requestRaw(srv.port, 'GET', `/api/v1/media/${s3VidId}`)).status, 404);

        const appRes = await requestRaw(srv.port, 'POST', `/api/v1/admin/listings/${lid}/approve`, {
          cookie: aCookie,
          csrf: aCsrf,
        });
        assert.equal(appRes.status, 200);

        const vidRange = await requestRaw(srv.port, 'GET', `/api/v1/media/${s3VidId}`, {
          headers: { Range: 'bytes=32-95' },
        });
        assert.equal(vidRange.status, 206);
        assert.equal(Buffer.compare(vidRange.body, vidBytes.subarray(32, 96)), 0);
      } finally {
        await srv.close();
      }

      // Step 4: Rollback PG media assets back to local and verify
      const pgVerifyBefore = await runMediaMigration({
        mode: 'verify',
        backend: 'postgres',
        uploadsDir,
        targetAdapter: s3Adapter,
        db,
      });
      assert.equal(pgVerifyBefore.succeeded, 2);
      assert.equal(pgVerifyBefore.failed, 0);

      const pgRollback = await runMediaMigration({
        mode: 'rollback',
        backend: 'postgres',
        dryRun: false,
        uploadsDir,
        targetAdapter: s3Adapter,
        db,
      });
      assert.equal(pgRollback.succeeded, 2);
      assert.equal(pgRollback.failed, 0);
      assert.equal(fs.existsSync(path.join(uploadsDir, `${s3VidId}.mp4`)), true);

      const pgVerifyAfter = await runMediaMigration({
        mode: 'verify',
        backend: 'postgres',
        uploadsDir,
        db,
      });
      assert.equal(pgVerifyAfter.succeeded, 2);
      assert.equal(pgVerifyAfter.failed, 0);
    } finally {
      await pool.end().catch(() => {});
      fs.rmSync(pgDataDir, { recursive: true, force: true });
    }
  }
);

