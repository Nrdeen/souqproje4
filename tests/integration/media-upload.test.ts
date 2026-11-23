import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../server.ts';
import { hashPassword } from '../../server/auth/password';
import { MAX_IMAGE_BYTES } from '../../server/media';

const ORIGIN = 'http://souq.test';
const PASSWORD = 'correct-horse-battery';

let srv: Awaited<ReturnType<typeof startServer>>;
let dataDir: string;

interface RawRes {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  json: any;
}

interface ReqOpts {
  cookie?: string;
  csrf?: string;
  origin?: string | null;
  headers?: Record<string, string>;
  rawBody?: Buffer;
  body?: unknown;
}

function requestRaw(method: string, url: string, opts: ReqOpts = {}): Promise<RawRes> {
  return new Promise((resolve, reject) => {
    const payload =
      opts.rawBody !== undefined
        ? opts.rawBody
        : opts.body !== undefined
        ? Buffer.from(JSON.stringify(opts.body), 'utf-8')
        : undefined;

    const headers: Record<string, string> = { ...(opts.headers || {}) };
    if (payload !== undefined) {
      if (opts.rawBody === undefined && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      headers['Content-Length'] = String(payload.length);
    }
    if (opts.cookie) headers['Cookie'] = opts.cookie;
    if (opts.csrf) headers['X-CSRF-Token'] = opts.csrf;
    if (opts.origin !== null) headers['Origin'] = opts.origin ?? ORIGIN;

    const req = http.request(
      { host: '127.0.0.1', port: srv.port, path: url, method, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          let json: any = null;
          const ct = String(res.headers['content-type'] || '');
          if (ct.includes('application/json')) {
            try {
              json = buf.length > 0 ? JSON.parse(buf.toString('utf-8')) : null;
            } catch {
              json = null;
            }
          }
          resolve({ status: res.statusCode || 0, headers: res.headers, body: buf, json });
        });
      }
    );
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

function buildMultipart(params: {
  fieldKind?: string;
  filename: string;
  contentType: string;
  bytes: Buffer;
}) {
  const boundary = `----TestBoundary${Math.random().toString(16).slice(2)}`;
  const parts: Buffer[] = [];
  if (params.fieldKind) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\n${params.fieldKind}\r\n`,
        'utf-8'
      )
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${params.filename}"\r\nContent-Type: ${params.contentType}\r\n\r\n`,
      'utf-8'
    ),
    params.bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8')
  );
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    rawBody: Buffer.concat(parts),
  };
}

function cookieFrom(res: RawRes): string {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] || [])[0] || '';
  return raw.split(';')[0];
}

let phoneSeq = 0;
function nextPhone() {
  phoneSeq += 1;
  return `058${String(1000000 + phoneSeq)}`;
}

async function registerUser(name: string, role: 'buyer' | 'seller' = 'seller') {
  const phone = nextPhone();
  const res = await requestRaw('POST', '/api/v1/auth/register', {
    body: { name, phone, password: PASSWORD, role },
  });
  assert.equal(res.status, 201);
  return {
    phone,
    cookie: cookieFrom(res),
    csrf: res.json.csrfToken as string,
    user: res.json.user,
  };
}

async function createAdminSession() {
  const store = srv.getStore();
  const phone = '0599999998';
  const user = {
    id: 'usr_media_admin',
    phone,
    email: 'media-admin@test.sa',
    name: 'Media Admin',
    role: 'admin',
    status: 'active',
    createdAt: new Date().toISOString(),
    phoneVerifiedAt: null,
  };
  store.users.push(user);
  store.credentials.push({
    userId: user.id,
    passwordHash: await hashPassword(PASSWORD),
    updatedAt: new Date().toISOString(),
  });
  const res = await requestRaw('POST', '/api/v1/auth/login', {
    body: { phone, password: PASSWORD },
  });
  assert.equal(res.status, 200);
  return {
    cookie: cookieFrom(res),
    csrf: res.json.csrfToken as string,
    user: res.json.user,
  };
}

function sampleJpeg() {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 0x11)]);
}

function samplePng() {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(64, 0x22),
  ]);
}

function sampleMp4() {
  return Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from('ftypisom', 'ascii'),
    Buffer.alloc(128, 0x33),
  ]);
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-media-test-'));
  srv = await startServer({
    serveFrontend: false,
    env: {
      PORT: '0',
      NODE_ENV: 'test',
      DATA_DIR: dataDir,
      ALLOWED_ORIGINS: ORIGIN,
      DEMO_ACCOUNTS: 'false',
    },
  });
});

after(async () => {
  await srv.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('unauthenticated upload and missing CSRF token are rejected', async () => {
  const mp = buildMultipart({
    fieldKind: 'image',
    filename: 'sheep.jpg',
    contentType: 'image/jpeg',
    bytes: sampleJpeg(),
  });
  const unauth = await requestRaw('POST', '/api/v1/media/upload', {
    headers: { 'Content-Type': mp.contentType },
    rawBody: mp.rawBody,
  });
  assert.equal(unauth.status, 401);

  const seller = await registerUser('فهد المربي');
  const noCsrf = await requestRaw('POST', '/api/v1/media/upload', {
    cookie: seller.cookie,
    headers: { 'Content-Type': mp.contentType },
    rawBody: mp.rawBody,
  });
  assert.equal(noCsrf.status, 403);
});

test('server rejects spoofed SVG/script payloads, kind mismatches, and oversized images', async () => {
  const seller = await registerUser('سالم الراعي');

  const spoofedSvg = buildMultipart({
    fieldKind: 'image',
    filename: 'avatar.jpg',
    contentType: 'image/jpeg',
    bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  });
  const svgRes = await requestRaw('POST', '/api/v1/media/upload', {
    cookie: seller.cookie,
    csrf: seller.csrf,
    headers: { 'Content-Type': spoofedSvg.contentType },
    rawBody: spoofedSvg.rawBody,
  });
  assert.equal(svgRes.status, 400);

  const mp4AsImage = buildMultipart({
    fieldKind: 'image',
    filename: 'video.mp4',
    contentType: 'image/jpeg',
    bytes: sampleMp4(),
  });
  const mismatchRes = await requestRaw('POST', '/api/v1/media/upload', {
    cookie: seller.cookie,
    csrf: seller.csrf,
    headers: { 'Content-Type': mp4AsImage.contentType },
    rawBody: mp4AsImage.rawBody,
  });
  assert.equal(mismatchRes.status, 400);

  const hugeJpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.alloc(MAX_IMAGE_BYTES + 1024, 0x55),
  ]);
  const oversizedMp = buildMultipart({
    fieldKind: 'image',
    filename: 'huge.jpg',
    contentType: 'image/jpeg',
    bytes: hugeJpeg,
  });
  const hugeRes = await requestRaw('POST', '/api/v1/media/upload', {
    cookie: seller.cookie,
    csrf: seller.csrf,
    headers: { 'Content-Type': oversizedMp.contentType },
    rawBody: oversizedMp.rawBody,
  });
  assert.equal(hugeRes.status, 413);
});

test('upload lifecycle: isolated disk storage, pending privacy, published range streaming, ownership, and deletion', async () => {
  const sellerA = await registerUser('بائع أ');
  const sellerB = await registerUser('بائع ب');
  const admin = await createAdminSession();

  // 1. Upload two images + one video as sellerA
  const up1 = buildMultipart({
    fieldKind: 'image',
    filename: 'ram-1.jpg',
    contentType: 'image/jpeg',
    bytes: sampleJpeg(),
  });
  const img1Res = await requestRaw('POST', '/api/v1/media/upload', {
    cookie: sellerA.cookie,
    csrf: sellerA.csrf,
    headers: { 'Content-Type': up1.contentType },
    rawBody: up1.rawBody,
  });
  assert.equal(img1Res.status, 201);
  const img1 = img1Res.json.media;
  assert.match(img1.id, /^med_[a-f0-9]+$/);
  assert.equal(img1.kind, 'image');
  assert.equal(img1.mimeType, 'image/jpeg');

  const up2 = buildMultipart({
    fieldKind: 'image',
    filename: 'ram-2.png',
    contentType: 'image/png',
    bytes: samplePng(),
  });
  const img2Res = await requestRaw('POST', '/api/v1/media/upload', {
    cookie: sellerA.cookie,
    csrf: sellerA.csrf,
    headers: { 'Content-Type': up2.contentType },
    rawBody: up2.rawBody,
  });
  assert.equal(img2Res.status, 201);
  const img2 = img2Res.json.media;

  const upVid = buildMultipart({
    fieldKind: 'video',
    filename: 'herd.mp4',
    contentType: 'video/mp4',
    bytes: sampleMp4(),
  });
  const vidRes = await requestRaw('POST', '/api/v1/media/upload', {
    cookie: sellerA.cookie,
    csrf: sellerA.csrf,
    headers: { 'Content-Type': upVid.contentType },
    rawBody: upVid.rawBody,
  });
  assert.equal(vidRes.status, 201);
  const vid = vidRes.json.media;
  assert.equal(vid.kind, 'video');
  assert.equal(vid.mimeType, 'video/mp4');

  // Stored inside this server instance's isolated uploads directory
  const uploadedFiles = fs.readdirSync(path.join(dataDir, 'uploads'));
  assert.equal(uploadedFiles.length >= 3, true);

  // 2. Unbound draft media is private to sellerA (404 to sellerB and anonymous)
  const anonDraft = await requestRaw('GET', img1.url);
  assert.equal(anonDraft.status, 404);
  const otherDraft = await requestRaw('GET', img1.url, { cookie: sellerB.cookie });
  assert.equal(otherDraft.status, 404);
  const selfDraft = await requestRaw('GET', img1.url, { cookie: sellerA.cookie });
  assert.equal(selfDraft.status, 200);
  assert.equal(selfDraft.headers['x-content-type-options'], 'nosniff');

  // 3. Cross-seller media hijacking is blocked (403)
  const store = srv.getStore();
  const hijackRes = await requestRaw('POST', '/api/v1/listings', {
    cookie: sellerB.cookie,
    csrf: sellerB.csrf,
    body: {
      title: 'إعلان مسروق',
      priceAmount: 1600,
      breedId: store.breeds[0].id,
      regionId: store.regions[0].id,
      images: [{ url: img1.url, mediaId: img1.id, position: 1 }],
    },
  });
  assert.equal(hijackRes.status, 403);

  // 4. SellerA creates listing with custom cover order (img2 first) + video
  const createRes = await requestRaw('POST', '/api/v1/listings', {
    cookie: sellerA.cookie,
    csrf: sellerA.csrf,
    body: {
      title: 'فحول نعيمي مع فيديو معاينة',
      description: 'تصوير حديث من المراح',
      priceAmount: 2100,
      breedId: store.breeds[0].id,
      regionId: store.regions[0].id,
      images: [
        { url: img2.url, mediaId: img2.id, position: 1 },
        { url: img1.url, mediaId: img1.id, position: 2 },
      ],
      videoMediaId: vid.id,
    },
  });
  assert.equal(createRes.status, 201);
  const listing = createRes.json.listing;
  assert.equal(listing.status, 'Pending');
  assert.equal(listing.images[0].mediaId, img2.id);
  assert.equal(listing.images[1].mediaId, img1.id);
  assert.equal(listing.video.mediaId, vid.id);

  // While Pending, media stays hidden (404) from anonymous / other users, visible (200) to sellerA and admin
  assert.equal((await requestRaw('GET', vid.url)).status, 404);
  assert.equal((await requestRaw('GET', vid.url, { cookie: sellerB.cookie })).status, 404);
  assert.equal((await requestRaw('GET', vid.url, { cookie: sellerA.cookie })).status, 200);
  assert.equal((await requestRaw('GET', vid.url, { cookie: admin.cookie })).status, 200);

  // 5. Approve listing -> media becomes publicly viewable and supports Range streaming for video
  const approveRes = await requestRaw('POST', `/api/v1/admin/listings/${listing.id}/approve`, {
    cookie: admin.cookie,
    csrf: admin.csrf,
  });
  assert.equal(approveRes.status, 200);

  const pubImgRes = await requestRaw('GET', img2.url);
  assert.equal(pubImgRes.status, 200);
  assert.equal(pubImgRes.headers['content-type'], 'image/png');

  const rangeRes = await requestRaw('GET', vid.url, {
    headers: { Range: 'bytes=0-15' },
  });
  assert.equal(rangeRes.status, 206);
  assert.equal(rangeRes.body.length, 16);

  // 6. SellerA reorders images & detaches video via PATCH
  const patchRes = await requestRaw('PATCH', `/api/v1/listings/${listing.id}`, {
    cookie: sellerA.cookie,
    csrf: sellerA.csrf,
    body: {
      images: [
        { url: img1.url, mediaId: img1.id, position: 1 },
        { url: img2.url, mediaId: img2.id, position: 2 },
      ],
      videoMediaId: null,
    },
  });
  assert.equal(patchRes.status, 200);
  assert.equal(patchRes.json.listing.images[0].mediaId, img1.id);
  assert.equal(patchRes.json.listing.video, null);

  // 7. SellerB cannot delete sellerA's media; sellerA can delete it
  const forbiddenDel = await requestRaw('DELETE', `/api/v1/media/${img2.id}`, {
    cookie: sellerB.cookie,
    csrf: sellerB.csrf,
  });
  assert.equal(forbiddenDel.status, 403);

  const okDel = await requestRaw('DELETE', `/api/v1/media/${img2.id}`, {
    cookie: sellerA.cookie,
    csrf: sellerA.csrf,
  });
  assert.equal(okDel.status, 200);
  assert.equal((await requestRaw('GET', img2.url, { cookie: sellerA.cookie })).status, 404);
});

test('uploaded images and videos persist across server restart and listing edits/deletions stay consistent', async () => {
  const seller = await registerUser('بائع الاستمرارية');
  const store = srv.getStore();
  const admin =
    store.users.find((u) => u.id === 'usr_media_admin') !== undefined
      ? (() => {
          return requestRaw('POST', '/api/v1/auth/login', {
            body: { phone: '0599999998', password: PASSWORD },
          }).then((res) => ({
            cookie: cookieFrom(res),
            csrf: res.json.csrfToken as string,
            user: res.json.user,
          }));
        })()
      : createAdminSession();
  const adminSess = await admin;

  const jpegBytes = sampleJpeg();
  const mp4Bytes = sampleMp4();

  const imgUp = buildMultipart({
    fieldKind: 'image',
    filename: 'persist.jpg',
    contentType: 'image/jpeg',
    bytes: jpegBytes,
  });
  const imgRes = await requestRaw('POST', '/api/v1/media/upload', {
    cookie: seller.cookie,
    csrf: seller.csrf,
    headers: { 'Content-Type': imgUp.contentType },
    rawBody: imgUp.rawBody,
  });
  assert.equal(imgRes.status, 201);
  const uploadedImg = imgRes.json.media;

  const vidUp = buildMultipart({
    fieldKind: 'video',
    filename: 'persist.mp4',
    contentType: 'video/mp4',
    bytes: mp4Bytes,
  });
  const vidRes = await requestRaw('POST', '/api/v1/media/upload', {
    cookie: seller.cookie,
    csrf: seller.csrf,
    headers: { 'Content-Type': vidUp.contentType },
    rawBody: vidUp.rawBody,
  });
  assert.equal(vidRes.status, 201);
  const uploadedVid = vidRes.json.media;

  const created = await requestRaw('POST', '/api/v1/listings', {
    cookie: seller.cookie,
    csrf: seller.csrf,
    body: {
      title: 'إعلان اختبار الاستمرارية',
      description: 'للتحقق من بقاء الصور والفيديو بعد إعادة التشغيل',
      priceAmount: 1900,
      breedId: store.breeds[0].id,
      regionId: store.regions[0].id,
      images: [{ url: uploadedImg.url, mediaId: uploadedImg.id, position: 1 }],
      videoMediaId: uploadedVid.id,
    },
  });
  assert.equal(created.status, 201);
  const listingId = created.json.listing.id as string;

  const approved = await requestRaw('POST', `/api/v1/admin/listings/${listingId}/approve`, {
    cookie: adminSess.cookie,
    csrf: adminSess.csrf,
  });
  assert.equal(approved.status, 200);

  // Restart server pointing at the exact same dataDir
  await srv.close();
  srv = await startServer({
    serveFrontend: false,
    env: {
      PORT: '0',
      NODE_ENV: 'test',
      DATA_DIR: dataDir,
      ALLOWED_ORIGINS: ORIGIN,
      DEMO_ACCOUNTS: 'false',
    },
  });

  // Public listing & media bytes remain accessible after restart
  const fetchedListing = await requestRaw('GET', `/api/v1/listings/${listingId}`);
  assert.equal(fetchedListing.status, 200);
  assert.equal(fetchedListing.json.listing.images[0].mediaId, uploadedImg.id);
  assert.equal(fetchedListing.json.listing.video.mediaId, uploadedVid.id);

  const fetchedImg = await requestRaw('GET', uploadedImg.url);
  assert.equal(fetchedImg.status, 200);
  assert.equal(Buffer.compare(fetchedImg.body, jpegBytes), 0);

  const fetchedVid = await requestRaw('GET', uploadedVid.url, {
    headers: { Range: 'bytes=0-31' },
  });
  assert.equal(fetchedVid.status, 206);
  assert.equal(Buffer.compare(fetchedVid.body, mp4Bytes.subarray(0, 32)), 0);

  // Seller logs back in after restart, edits listing metadata, then deletes last uploaded image -> fallback image restored
  const relogin = await requestRaw('POST', '/api/v1/auth/login', {
    body: { phone: seller.phone, password: PASSWORD },
  });
  assert.equal(relogin.status, 200);
  const newCookie = cookieFrom(relogin);
  const newCsrf = relogin.json.csrfToken as string;

  const edited = await requestRaw('PATCH', `/api/v1/listings/${listingId}`, {
    cookie: newCookie,
    csrf: newCsrf,
    body: { title: 'إعلان محدّث بعد إعادة التشغيل', priceAmount: 2050, city: 'جدة' },
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.json.listing.title, 'إعلان محدّث بعد إعادة التشغيل');
  assert.equal(edited.json.listing.city, 'جدة');
  assert.equal(edited.json.listing.status, 'Pending');

  const delLastImg = await requestRaw('DELETE', `/api/v1/media/${uploadedImg.id}`, {
    cookie: newCookie,
    csrf: newCsrf,
  });
  assert.equal(delLastImg.status, 200);

  // Pending listing is hidden from unauthenticated public viewers until re-approved
  const hiddenWhilePending = await requestRaw('GET', `/api/v1/listings/${listingId}`);
  assert.equal(hiddenWhilePending.status, 404);

  // Owner can still see the updated listing and fallback image while pending
  const ownerViewAfterDel = await requestRaw('GET', `/api/v1/listings/${listingId}`, {
    cookie: newCookie,
  });
  assert.equal(ownerViewAfterDel.status, 200);
  assert.equal(ownerViewAfterDel.json.listing.images.length, 1);
  assert.match(ownerViewAfterDel.json.listing.images[0].url, /^\/src\/assets\/images\//);

  // Admin re-logs in after restart and re-approves -> listing becomes publicly visible again
  const adminRelogin = await requestRaw('POST', '/api/v1/auth/login', {
    body: { phone: '0599999998', password: PASSWORD },
  });
  assert.equal(adminRelogin.status, 200);
  const reapproved = await requestRaw('POST', `/api/v1/admin/listings/${listingId}/approve`, {
    cookie: cookieFrom(adminRelogin),
    csrf: adminRelogin.json.csrfToken as string,
  });
  assert.equal(reapproved.status, 200);

  const afterDel = await requestRaw('GET', `/api/v1/listings/${listingId}`);
  assert.equal(afterDel.status, 200);
  assert.equal(afterDel.json.listing.images.length, 1);
  assert.match(afterDel.json.listing.images[0].url, /^\/src\/assets\/images\//);
});

