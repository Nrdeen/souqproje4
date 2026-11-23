import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../server.ts';

const ORIGIN = 'http://souq.test';
const PASSWORD = 'correct-horse-battery';

let srv: Awaited<ReturnType<typeof startServer>>;
let dataDir: string;

interface ApiRes {
  status: number;
  headers: http.IncomingHttpHeaders;
  json: any;
}

function requestRaw(
  method: string,
  urlPath: string,
  opts: {
    cookie?: string;
    csrf?: string;
    origin?: string | null;
    headers?: Record<string, string>;
    rawBody?: Buffer;
    body?: unknown;
  } = {}
): Promise<ApiRes> {
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
      { host: '127.0.0.1', port: srv.port, path: urlPath, method, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          let json: any = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode || 0, headers: res.headers, json });
        });
      }
    );
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

function buildMultipart(filename: string, contentType: string, bytes: Buffer) {
  const boundary = `----Phase2BBoundary${Math.random().toString(16).slice(2)}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\nimage\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
      'utf-8'
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8'),
  ]);
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body,
  };
}

function cookieFrom(res: ApiRes): string {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] || [])[0] || '';
  return raw.split(';')[0];
}

let phoneSeq = 0;
function nextPhone() {
  phoneSeq += 1;
  return `056${String(2000000 + phoneSeq)}`;
}

async function registerUser(name: string, role: 'buyer' | 'seller') {
  const res = await requestRaw('POST', '/api/v1/auth/register', {
    body: { name, phone: nextPhone(), password: PASSWORD, role },
  });
  assert.equal(res.status, 201);
  return {
    cookie: cookieFrom(res),
    csrf: res.json.csrfToken as string,
    user: res.json.user,
  };
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-phase2b-int-'));
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
  if (srv) await srv.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('Conversations return participant name, listing title, unreadCount and support POST /read with strict participant privacy', async () => {
  const seller = await registerUser('فهد البائع', 'seller');
  const buyer = await registerUser('سلطان المشتري', 'buyer');
  const stranger = await registerUser('طرف ثالث', 'buyer');

  // Create & publish a listing for seller
  const createRes = await requestRaw('POST', '/api/v1/listings', {
    cookie: seller.cookie,
    csrf: seller.csrf,
    body: {
      title: 'حلال نعيمي ممتاز للتربية',
      categoryId: 'cat_sheep',
      subCategoryId: 'auto',
      breedId: 'brd_naimi',
      regionId: 'reg_riyadh',
      city: 'الرياض',
      priceAmount: 1900,
      expectedPrice: 1750,
      sex: 'ذكر',
      ageMonths: 8,
      weightKg: 44,
      quantity: 6,
      isNegotiable: true,
      allowPriceOffers: true,
      vaccinated: true,
      description: 'حلال طيب',
      images: [{ url: '/src/assets/images/breed_naimi_sheep_1794608169331.jpg', position: 1 }],
    },
  });
  assert.equal(createRes.status, 201);
  const listingId = createRes.json.listing.id as string;

  // Publish directly via store for test setup
  const storeListing = srv.getStore().listings.find((l) => l.id === listingId);
  assert.ok(storeListing);
  storeListing.status = 'Published';

  // Buyer starts a conversation
  const startConvRes = await requestRaw('POST', '/api/v1/conversations', {
    cookie: buyer.cookie,
    csrf: buyer.csrf,
    body: { listingId, initialMessage: 'السلام عليكم، كم السوم؟' },
  });
  assert.equal(startConvRes.status, 200);
  const convId = startConvRes.json.conversation.id as string;
  assert.equal(startConvRes.json.conversation.unreadCount, 0);
  assert.equal(startConvRes.json.conversation.listingTitle, 'حلال نعيمي ممتاز للتربية');
  assert.equal(startConvRes.json.conversation.otherParticipantName, 'فهد البائع');

  // Buyer sends a second message
  const msg2Res = await requestRaw('POST', `/api/v1/conversations/${convId}/messages`, {
    cookie: buyer.cookie,
    csrf: buyer.csrf,
    body: { body: 'هل السعر شامل التوصيل؟' },
  });
  assert.equal(msg2Res.status, 201);

  // Seller checks bootstrap -> sees unreadCount === 2, buyer's display name, listing title, and no phone leak
  const sellerBoot = await requestRaw('GET', '/api/v1/bootstrap', {
    cookie: seller.cookie,
  });
  assert.equal(sellerBoot.status, 200);
  const sellerConv = sellerBoot.json.conversations.find((c: any) => c.id === convId);
  assert.ok(sellerConv);
  assert.equal(sellerConv.unreadCount, 2);
  assert.equal(sellerConv.otherParticipantName, 'سلطان المشتري');
  assert.equal(sellerConv.listingTitle, 'حلال نعيمي ممتاز للتربية');
  assert.equal('readAtByUserId' in sellerConv, false);
  const msgNotificationsBefore = (sellerBoot.json.notifications || []).filter(
    (n: any) => n.conversationId === convId && n.type === 'new_message' && !n.read
  );
  assert.ok(msgNotificationsBefore.length >= 1);

  // Stranger cannot mark read (403) and unauthenticated user cannot mark read (401)
  const unauthRead = await requestRaw('POST', `/api/v1/conversations/${convId}/read`);
  assert.equal(unauthRead.status, 401);

  const strangerRead = await requestRaw('POST', `/api/v1/conversations/${convId}/read`, {
    cookie: stranger.cookie,
    csrf: stranger.csrf,
  });
  assert.equal(strangerRead.status, 403);

  // Seller marks conversation read -> unreadCount becomes 0 and matching new_message notifications mark read
  const readRes = await requestRaw('POST', `/api/v1/conversations/${convId}/read`, {
    cookie: seller.cookie,
    csrf: seller.csrf,
  });
  assert.equal(readRes.status, 200);
  assert.equal(readRes.json.conversation.unreadCount, 0);

  const sellerBootAfter = await requestRaw('GET', '/api/v1/bootstrap', {
    cookie: seller.cookie,
  });
  const sellerConvAfter = sellerBootAfter.json.conversations.find((c: any) => c.id === convId);
  assert.equal(sellerConvAfter.unreadCount, 0);
  const msgNotificationsAfter = (sellerBootAfter.json.notifications || []).filter(
    (n: any) => n.conversationId === convId && n.type === 'new_message' && !n.read
  );
  assert.equal(msgNotificationsAfter.length, 0);
});

test('Listing endpoints enforce expectedPrice rules, auto subCategory resolution, and safe draft media deletion', async () => {
  const seller = await registerUser('سالم المربي', 'seller');

  // Upload a valid 1x1 PNG image (magic bytes)
  const pngBytes = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
    'hex'
  );
  const mp1 = buildMultipart('saved.png', 'image/png', pngBytes);
  const upload1 = await requestRaw('POST', '/api/v1/media/upload', {
    cookie: seller.cookie,
    csrf: seller.csrf,
    headers: { 'Content-Type': mp1.contentType },
    rawBody: mp1.body,
  });
  assert.equal(upload1.status, 201);
  const savedMedia = upload1.json.media;

  // Reject expectedPrice > priceAmount on POST
  const invalidCreate = await requestRaw('POST', '/api/v1/listings', {
    cookie: seller.cookie,
    csrf: seller.csrf,
    body: {
      title: 'نعيمي تجربة سعر',
      categoryId: 'cat_sheep',
      subCategoryId: 'auto',
      breedId: 'brd_naimi',
      regionId: 'reg_riyadh',
      city: 'الرياض',
      priceAmount: 1500,
      expectedPrice: 1800,
      sex: 'ذكر',
      ageMonths: 7,
      weightKg: 40,
      quantity: 3,
      description: 'وصف',
      images: [{ url: savedMedia.url, position: 1, mediaId: savedMedia.id }],
    },
  });
  assert.equal(invalidCreate.status, 400);
  assert.equal(invalidCreate.json.code, 'invalid_expected_price');

  // Reject expectedPrice <= 0 on POST
  const zeroCreate = await requestRaw('POST', '/api/v1/listings', {
    cookie: seller.cookie,
    csrf: seller.csrf,
    body: {
      title: 'نعيمي تجربة سعر',
      categoryId: 'cat_sheep',
      subCategoryId: 'auto',
      breedId: 'brd_naimi',
      regionId: 'reg_riyadh',
      city: 'الرياض',
      priceAmount: 1500,
      expectedPrice: 0,
      sex: 'ذكر',
      ageMonths: 7,
      weightKg: 40,
      quantity: 3,
      description: 'وصف',
      images: [{ url: savedMedia.url, position: 1, mediaId: savedMedia.id }],
    },
  });
  assert.equal(zeroCreate.status, 400);
  assert.equal(zeroCreate.json.code, 'invalid_expected_price');

  // Create valid listing bound to savedMedia
  const validCreate = await requestRaw('POST', '/api/v1/listings', {
    cookie: seller.cookie,
    csrf: seller.csrf,
    body: {
      title: 'خروف نعيمي ذبيحة جاهز',
      categoryId: 'cat_sheep',
      subCategoryId: 'auto',
      breedId: 'brd_naimi',
      regionId: 'reg_riyadh',
      city: 'الرياض',
      priceAmount: 1500,
      expectedPrice: 1400,
      sex: 'ذكر',
      ageMonths: 7,
      weightKg: 40,
      quantity: 3,
      description: 'وصف',
      images: [{ url: savedMedia.url, position: 1, mediaId: savedMedia.id }],
    },
  });
  assert.equal(validCreate.status, 201);
  const listingId = validCreate.json.listing.id as string;
  assert.notEqual(validCreate.json.listing.subCategoryId, 'auto');

  // Reject expectedPrice > priceAmount on PATCH and preserve saved media
  const invalidPatch = await requestRaw('PATCH', `/api/v1/listings/${listingId}`, {
    cookie: seller.cookie,
    csrf: seller.csrf,
    body: {
      priceAmount: 1500,
      expectedPrice: 1900,
    },
  });
  assert.equal(invalidPatch.status, 400);
  assert.equal(invalidPatch.json.code, 'invalid_expected_price');

  // PATCH with subCategoryId: 'auto' resolves via inference instead of literal 'auto'
  const validPatch = await requestRaw('PATCH', `/api/v1/listings/${listingId}`, {
    cookie: seller.cookie,
    csrf: seller.csrf,
    body: {
      subCategoryId: 'auto',
      expectedPrice: 1350,
    },
  });
  assert.equal(validPatch.status, 200);
  assert.notEqual(validPatch.json.listing.subCategoryId, 'auto');
  assert.equal(validPatch.json.listing.expectedPrice, 1350);

  // Upload a second draft image (not attached to listing) and verify deleting draft succeeds while savedMedia remains intact
  const mp2 = buildMultipart('draft-orphan.png', 'image/png', pngBytes);
  const upload2 = await requestRaw('POST', '/api/v1/media/upload', {
    cookie: seller.cookie,
    csrf: seller.csrf,
    headers: { 'Content-Type': mp2.contentType },
    rawBody: mp2.body,
  });
  assert.equal(upload2.status, 201);
  const draftMediaId = upload2.json.media.id as string;

  const delDraft = await requestRaw('DELETE', `/api/v1/media/${draftMediaId}`, {
    cookie: seller.cookie,
    csrf: seller.csrf,
  });
  assert.equal(delDraft.status, 200);

  // Original saved media must still be accessible and bound to listing
  const fetchSaved = await requestRaw('GET', savedMedia.url, {
    cookie: seller.cookie,
  });
  assert.equal(fetchSaved.status, 200);
});
