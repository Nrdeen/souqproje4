/**
 * Phase 5B Integration Tests — Critical Security, Privacy, Rate Limiting, and Input Validation Hardening.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../server.ts';
import { hashPassword } from '../../server/auth/password';

const ORIGIN = 'http://souq-phase5b.test';
const PASSWORD = 'phase5b-strong-password';

let srv: Awaited<ReturnType<typeof startServer>>;
let dataDir: string;

interface Res {
  status: number;
  headers: http.IncomingHttpHeaders;
  json: any;
}
interface Opts {
  cookie?: string;
  csrf?: string;
  origin?: string | null;
  headers?: Record<string, string>;
  body?: unknown;
}

function request(method: string, url: string, opts: Opts = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const headers: Record<string, string> = { ...(opts.headers || {}) };
    if (payload !== undefined) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(Buffer.byteLength(payload));
    }
    if (opts.cookie) headers['Cookie'] = opts.cookie;
    if (opts.csrf) headers['X-CSRF-Token'] = opts.csrf;
    if (opts.origin !== null) headers['Origin'] = opts.origin ?? ORIGIN;
    const req = http.request({ host: '127.0.0.1', port: srv.port, path: url, method, headers }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let json: any = null;
        try {
          json = raw ? JSON.parse(raw) : null;
        } catch {
          json = raw;
        }
        resolve({ status: res.statusCode || 0, headers: res.headers, json });
      });
    });
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

function uploadTinyPng(session: Session): Promise<Res> {
  // Valid 1x1 PNG binary
  const pngBytes = Buffer.from(
    '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8cfc000000301010018dd8db00000000049454e44ae426082',
    'hex'
  );
  const boundary = '----SouqBoundaryPhase5B' + Date.now();
  const partHeader = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\nimage\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="tiny.png"\r\nContent-Type: image/png\r\n\r\n`,
    'utf8'
  );
  const partFooter = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const body = Buffer.concat([partHeader, pngBytes, partFooter]);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: srv.port,
        path: '/api/v1/media/upload',
        method: 'POST',
        headers: {
          Cookie: session.cookie,
          'X-CSRF-Token': session.csrf,
          Origin: ORIGIN,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          resolve({ status: res.statusCode || 0, headers: res.headers, json: raw ? JSON.parse(raw) : null });
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

interface Session {
  cookie: string;
  csrf: string;
  user: any;
  phone: string;
  api: (method: string, url: string, body?: unknown, extra?: Partial<Opts>) => Promise<Res>;
}

function cookieFrom(res: Res): string {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] || [])[0] || '';
  return raw.split(';')[0];
}

let phoneSeq = 1000;
const nextPhone = () => `055${String(phoneSeq++).padStart(7, '0')}`;

async function register(name: string, role: 'buyer' | 'seller' = 'buyer'): Promise<Session> {
  const phone = nextPhone();
  const res = await request('POST', '/api/v1/auth/register', { body: { name, phone, password: PASSWORD, role } });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return {
    phone,
    cookie: cookieFrom(res),
    csrf: res.json.csrfToken,
    user: res.json.user,
    api: (method, url, body, extra = {}) =>
      request(method, url, { cookie: cookieFrom(res), csrf: res.json.csrfToken, body, ...extra }),
  };
}

let adminPromise: Promise<Session> | null = null;
function getAdmin(): Promise<Session> {
  adminPromise ??= (async () => {
    const store = srv.getStore();
    const phone = '0598887776';
    const user = {
      id: 'usr_phase5b_admin',
      phone,
      email: 'p5b-admin@test.sa',
      name: 'مشرف اختبار 5B',
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
    const loginRes = await request('POST', '/api/v1/auth/login', { body: { phone, password: PASSWORD } });
    assert.equal(loginRes.status, 200);
    const cookie = cookieFrom(loginRes);
    const csrf = loginRes.json.csrfToken;
    return {
      phone,
      cookie,
      csrf,
      user: loginRes.json.user,
      api: (method, url, body, extra = {}) => request(method, url, { cookie, csrf, body, ...extra }),
    };
  })();
  return adminPromise;
}

async function createAndPublishListing(seller: Session, title = 'ضأن نعيمي ممتاز للبيع', extra: Record<string, unknown> = {}) {
  const store = srv.getStore();
  const admin = await getAdmin();
  const createRes = await seller.api('POST', '/api/v1/listings', {
    title,
    priceAmount: 1600,
    quantity: 10,
    ageMonths: 8,
    weightKg: 42,
    breedId: store.breeds[0].id,
    regionId: store.regions[0].id,
    city: 'الرياض',
    description: 'حلال طيب ومحصن بالكامل وصحته ممتازة',
    allowPriceOffers: true,
    isNegotiable: true,
    ...extra,
  });
  assert.equal(createRes.status, 201, JSON.stringify(createRes.json));
  const listing = createRes.json.listing;
  const approveRes = await admin.api('POST', `/api/v1/admin/listings/${listing.id}/approve`);
  assert.equal(approveRes.status, 200, JSON.stringify(approveRes.json));
  return approveRes.json.listing;
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-p5b-'));
  srv = await startServer({
    serveFrontend: false,
    env: { NODE_ENV: 'test' },
    config: { port: 0, dataDir, allowedOrigins: [ORIGIN], registerMaxPerHour: 10_000 },
  });
});

after(async () => {
  await srv.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// 1. Bootstrap Privacy (both visitor and signed-in)
test('1. GET /api/v1/bootstrap never leaks phone, whatsapp, or sellerReviews to visitors or signed-in users', async () => {
  const visitorBoot = await request('GET', '/api/v1/bootstrap');
  assert.equal(visitorBoot.status, 200);
  assert.equal(visitorBoot.json.sellerReviews, undefined);
  assert.ok(Array.isArray(visitorBoot.json.sellers) && visitorBoot.json.sellers.length > 0);
  for (const s of visitorBoot.json.sellers) {
    assert.equal(s.phone, undefined);
    assert.equal(s.whatsapp, undefined);
    assert.equal(typeof s.contactAvailable, 'boolean');
  }

  const buyer = await register('مشتري خصوصية');
  const authedBoot = await buyer.api('GET', '/api/v1/bootstrap');
  assert.equal(authedBoot.status, 200);
  assert.equal(authedBoot.json.sellerReviews, undefined);
  for (const s of authedBoot.json.sellers) {
    assert.equal(s.phone, undefined);
    assert.equal(s.whatsapp, undefined);
    assert.equal(typeof s.contactAvailable, 'boolean');
  }
});

// 2 & 3. On-demand Contact Reveal & Suspended Seller Blocking
test('2 & 3. POST /api/v1/listings/:id/contact requires auth, published status, and blocks suspended sellers', async () => {
  const seller = await register('مربي اتصال', 'seller');
  const buyer = await register('مشتري اتصال');
  const admin = await getAdmin();
  const store = srv.getStore();

  // Create draft/pending listing (not yet published)
  const pendingRes = await seller.api('POST', '/api/v1/listings', {
    title: 'إعلان قيد المراجعة',
    priceAmount: 1400,
    quantity: 5,
    breedId: store.breeds[0].id,
    regionId: store.regions[0].id,
    city: 'الرياض',
    description: 'وصف اختبار الإعلان غير المنشور',
  });
  assert.equal(pendingRes.status, 201);
  const pendingListingId = pendingRes.json.listing.id;

  // Anonymous rejected 401
  const anonRes = await request('POST', `/api/v1/listings/${pendingListingId}/contact`, { body: {} });
  assert.equal(anonRes.status, 401);

  // Other buyer cannot see non-published listing -> 404
  const buyerPendingRes = await buyer.api('POST', `/api/v1/listings/${pendingListingId}/contact`, {});
  assert.equal(buyerPendingRes.status, 404);

  // Even seller/admin calling /contact on non-Published listing -> 403 listing_not_published
  const ownerPendingRes = await seller.api('POST', `/api/v1/listings/${pendingListingId}/contact`, {});
  assert.equal(ownerPendingRes.status, 403);
  assert.equal(ownerPendingRes.json.code, 'listing_not_published');

  // Approve -> Published -> buyer reveals contact cleanly
  const approveRes = await admin.api('POST', `/api/v1/admin/listings/${pendingListingId}/approve`);
  assert.equal(approveRes.status, 200);

  const revealRes = await buyer.api('POST', `/api/v1/listings/${pendingListingId}/contact`, {});
  assert.equal(revealRes.status, 200);
  assert.equal(revealRes.json.listingId, pendingListingId);
  assert.equal(revealRes.json.sellerId, seller.user.id);
  assert.equal(revealRes.json.phone, seller.phone);

  // Suspend seller -> contactAvailable becomes false in bootstrap AND /contact returns 403 seller_suspended
  const suspendRes = await admin.api('POST', `/api/v1/admin/users/${seller.user.id}/suspend`, {
    reason: 'مخالفة شروط التواصل في الاختبار',
  });
  assert.equal(suspendRes.status, 200);

  const bootAfterSuspend = await buyer.api('GET', '/api/v1/bootstrap');
  const suspendedSellerSummary = bootAfterSuspend.json.sellers.find((s: any) => s.userId === seller.user.id);
  assert.equal(suspendedSellerSummary.contactAvailable, false);
  assert.equal(suspendedSellerSummary.phone, undefined);

  const blockedReveal = await buyer.api('POST', `/api/v1/listings/${pendingListingId}/contact`, {});
  assert.equal(blockedReveal.status, 403);
  assert.equal(blockedReveal.json.code, 'seller_suspended');
});

// 4. Rate Limiting (HTTP 429 + Retry-After)
test('4. Write endpoints and contact reveal enforce rate limits with HTTP 429 and Retry-After', async () => {
  const seller = await register('مربي حدود', 'seller');
  const published = await createAndPublishListing(seller, 'نعيمي لاختبار معدل الطلبات');

  // Contact reveal limit is 15 per 15m
  const buyerContact = await register('مشتري حد اتصال');
  for (let i = 0; i < 15; i++) {
    const r = await buyerContact.api('POST', `/api/v1/listings/${published.id}/contact`, {});
    assert.equal(r.status, 200);
  }
  const limitedContact = await buyerContact.api('POST', `/api/v1/listings/${published.id}/contact`, {});
  assert.equal(limitedContact.status, 429);
  assert.equal(limitedContact.json.code, 'rate_limited');
  assert.ok(Number(limitedContact.headers['retry-after']) >= 1);

  // Reports limit is 10 per 15m (use 10 distinct comment targets so deduplication returns 201 on each)
  const buyerReport = await register('مشتري حد بلاغ');
  const commentIds: string[] = [];
  for (let i = 0; i < 10; i++) {
    const cRes = await seller.api('POST', `/api/v1/listings/${published.id}/comments`, {
      body: `تعليق رقم ${i + 1} لاختبار حد البلاغات`,
    });
    assert.equal(cRes.status, 201, JSON.stringify(cRes.json));
    commentIds.push(cRes.json.comment.id);
  }
  for (let i = 0; i < 10; i++) {
    const r = await buyerReport.api('POST', '/api/v1/reports', {
      listingId: published.id,
      commentId: commentIds[i],
      reason: 'سبب بلاغ تجريبي',
      details: 'تفاصيل بلاغ اختباري',
    });
    assert.equal(r.status, 201, JSON.stringify(r.json));
  }
  const limitedReport = await buyerReport.api('POST', '/api/v1/reports', {
    listingId: published.id,
    reason: 'سبب بلاغ إضافي',
  });
  assert.equal(limitedReport.status, 429);
  assert.equal(limitedReport.json.code, 'rate_limited');
  assert.ok(Number(limitedReport.headers['retry-after']) >= 1);

  // Price offers limit is 20 per 15m
  const buyerOffer = await register('مشتري حد عروض');
  for (let i = 0; i < 20; i++) {
    const r = await buyerOffer.api('POST', `/api/v1/listings/${published.id}/offers`, {
      offeredPrice: 1200 + i,
      quantity: 1,
      note: 'سوم اختباري',
    });
    assert.equal(r.status, 201);
  }
  const limitedOffer = await buyerOffer.api('POST', `/api/v1/listings/${published.id}/offers`, {
    offeredPrice: 1300,
    quantity: 1,
    note: 'سوم فائض',
  });
  assert.equal(limitedOffer.status, 429);
  assert.equal(limitedOffer.json.code, 'rate_limited');
  assert.ok(Number(limitedOffer.headers['retry-after']) >= 1);

  // Favorites toggle limit is 60 per 5m
  const buyerFav = await register('مشتري حد مفضلة');
  for (let i = 0; i < 60; i++) {
    const r = await buyerFav.api('POST', '/api/v1/favorites/toggle', { listingId: published.id });
    assert.equal(r.status, 200);
  }
  const limitedFav = await buyerFav.api('POST', '/api/v1/favorites/toggle', { listingId: published.id });
  assert.equal(limitedFav.status, 429);
  assert.equal(limitedFav.json.code, 'rate_limited');
  assert.ok(Number(limitedFav.headers['retry-after']) >= 1);
});

// 5. Strict Input Validation & 256kb JSON Limit & Media Atomicity
test('5. Strict input validation rejects malformed payloads before mutating media or store state and caps JSON body at 256kb', async () => {
  const seller = await register('مربي تحقق صارم', 'seller');
  const store = srv.getStore();

  // Upload a draft media item first
  const uploadRes = await uploadTinyPng(seller);
  assert.equal(uploadRes.status, 201, JSON.stringify(uploadRes.json));
  const mediaId = uploadRes.json.media.id;

  const baseValid = {
    title: 'طليان نعيمي طيبة',
    priceAmount: 1500,
    quantity: 5,
    ageMonths: 6,
    weightKg: 38,
    breedId: store.breeds[0].id,
    regionId: store.regions[0].id,
    city: 'الرياض',
    description: 'حلال طيب وصحي ومحصن',
    mediaIds: [mediaId],
  };

  // Non-finite, zero, negative, fractional quantity, boolean, control chars, oversized text
  const invalidPayloads: Array<[string, Record<string, unknown>]> = [
    ['priceAmount <= 0', { priceAmount: 0 }],
    ['priceAmount boolean', { priceAmount: true }],
    ['priceAmount Infinity string', { priceAmount: 'Infinity' }],
    ['fractional quantity', { quantity: 1.5 }],
    ['zero quantity', { quantity: 0 }],
    ['fractional ageMonths', { ageMonths: 6.5 }],
    ['negative weightKg', { weightKg: -5 }],
    ['title with control char', { title: 'إعلان\x01تجريبي' }],
    ['short title', { title: 'ab' }],
    ['oversized description > 2000', { description: 'أ'.repeat(2005) }],
  ];

  for (const [label, patch] of invalidPayloads) {
    const r = await seller.api('POST', '/api/v1/listings', { ...baseValid, ...patch });
    assert.equal(r.status, 400, `Expected 400 for ${label}, got ${r.status}: ${JSON.stringify(r.json)}`);
    // Draft media ownership must NOT have been mutated on validation failure!
    const storedMedia = srv.getStore().media.find((m) => m.id === mediaId);
    assert.equal(storedMedia?.listingId ?? null, null, `Media should stay unattached after failed ${label}`);
  }

  // Oversized JSON payload > 256kb must return 413
  const hugeRes = await seller.api('POST', '/api/v1/listings', {
    ...baseValid,
    description: 'أ'.repeat(300 * 1024),
  });
  assert.equal(hugeRes.status, 413);
});

// 6. Favorites Validation
test('6. Favorites reject nonexistent/hidden/unpublished listings while allowing safe removal of stale favorites', async () => {
  const seller = await register('مربي مفضلة', 'seller');
  const buyer = await register('مشتري مفضلة');
  const store = srv.getStore();

  const pendingRes = await seller.api('POST', '/api/v1/listings', {
    title: 'إعلان غير منشور للمفضلة',
    priceAmount: 1400,
    quantity: 3,
    breedId: store.breeds[0].id,
    regionId: store.regions[0].id,
    city: 'جدة',
    description: 'وصف إعلان قيد المراجعة',
  });
  const pendingId = pendingRes.json.listing.id;

  // Nonexistent listing -> 404
  const missingRes = await buyer.api('POST', '/api/v1/favorites/toggle', { listingId: 'lst_does_not_exist' });
  assert.equal(missingRes.status, 404);

  // Pending listing invisible to buyer -> 404
  const hiddenRes = await buyer.api('POST', '/api/v1/favorites/toggle', { listingId: pendingId });
  assert.equal(hiddenRes.status, 404);

  // Seller's own Pending listing -> 400 listing_not_published
  const ownPendingRes = await seller.api('POST', '/api/v1/favorites/toggle', { listingId: pendingId });
  assert.equal(ownPendingRes.status, 400);
  assert.equal(ownPendingRes.json.code, 'listing_not_published');

  // Pre-existing stale favorite ID can still be cleanly removed
  store.favorites[buyer.user.id] = [pendingId];
  const removeStaleRes = await buyer.api('POST', '/api/v1/favorites/toggle', { listingId: pendingId });
  assert.equal(removeStaleRes.status, 200);
  assert.equal(removeStaleRes.json.isFavorite, false);
  assert.deepEqual(removeStaleRes.json.favoriteIds, []);
});

// 7. Offers Validation
test('7. Offers reject non-Published listings, suspended sellers, fractional/excess quantities, and invalid prices', async () => {
  const seller = await register('مربي عروض', 'seller');
  const buyer = await register('مشتري عروض');
  const admin = await getAdmin();
  const store = srv.getStore();

  // Pending listing -> buyer gets 404
  const pendingRes = await seller.api('POST', '/api/v1/listings', {
    title: 'إعلان معلق للعروض',
    priceAmount: 1700,
    quantity: 4,
    breedId: store.breeds[0].id,
    regionId: store.regions[0].id,
    city: 'الدمام',
    description: 'حلال معلق قيد الموافقة',
    allowPriceOffers: true,
  });
  const listingId = pendingRes.json.listing.id;
  assert.equal(
    (await buyer.api('POST', `/api/v1/listings/${listingId}/offers`, { offeredPrice: 1500, quantity: 1 })).status,
    404
  );

  // Approve -> Published
  assert.equal((await admin.api('POST', `/api/v1/admin/listings/${listingId}/approve`)).status, 200);

  // Fractional, zero, excess quantity, non-finite price, boolean price -> 400
  assert.equal(
    (await buyer.api('POST', `/api/v1/listings/${listingId}/offers`, { offeredPrice: 1500, quantity: 1.5 })).status,
    400
  );
  assert.equal(
    (await buyer.api('POST', `/api/v1/listings/${listingId}/offers`, { offeredPrice: 1500, quantity: 0 })).status,
    400
  );
  assert.equal(
    (await buyer.api('POST', `/api/v1/listings/${listingId}/offers`, { offeredPrice: 1500, quantity: 5 })).status,
    400
  );
  assert.equal(
    (await buyer.api('POST', `/api/v1/listings/${listingId}/offers`, { offeredPrice: true, quantity: 1 })).status,
    400
  );
  assert.equal(
    (await buyer.api('POST', `/api/v1/listings/${listingId}/offers`, { offeredPrice: 'NaN', quantity: 1 })).status,
    400
  );

  // Disabling offers on Published listing -> 400
  assert.equal(
    (await seller.api('PATCH', `/api/v1/listings/${listingId}`, { allowPriceOffers: false })).status,
    200
  );
  const disabledOffer = await buyer.api('POST', `/api/v1/listings/${listingId}/offers`, {
    offeredPrice: 1500,
    quantity: 1,
  });
  assert.equal(disabledOffer.status, 400);

  // Re-enable offers, then suspend seller -> 403 seller_suspended
  assert.equal(
    (await seller.api('PATCH', `/api/v1/listings/${listingId}`, { allowPriceOffers: true })).status,
    200
  );
  assert.equal(
    (await admin.api('POST', `/api/v1/admin/users/${seller.user.id}/suspend`, { reason: 'اختبار' })).status,
    200
  );
  const suspendedOffer = await buyer.api('POST', `/api/v1/listings/${listingId}/offers`, {
    offeredPrice: 1500,
    quantity: 1,
  });
  assert.equal(suspendedOffer.status, 403);
  assert.equal(suspendedOffer.json.code, 'seller_suspended');

  // Reactivate seller, re-authenticate (suspension revoked prior sessions), mark Sold -> hidden from buyers (404)
  assert.equal(
    (await admin.api('POST', `/api/v1/admin/users/${seller.user.id}/reactivate`, { reason: 'انتهاء الاختبار' })).status,
    200
  );
  const reloginRes = await request('POST', '/api/v1/auth/login', {
    body: { phone: seller.phone, password: PASSWORD },
  });
  assert.equal(reloginRes.status, 200);
  const sellerReauthed = {
    cookie: cookieFrom(reloginRes),
    csrf: reloginRes.json.csrfToken,
  };
  assert.equal(
    (
      await request('PATCH', `/api/v1/listings/${listingId}`, {
        cookie: sellerReauthed.cookie,
        csrf: sellerReauthed.csrf,
        body: { status: 'Sold' },
      })
    ).status,
    200
  );
  const soldOffer = await buyer.api('POST', `/api/v1/listings/${listingId}/offers`, {
    offeredPrice: 1500,
    quantity: 1,
  });
  assert.equal(soldOffer.status, 404);
});

// 8. Seller Reviews Interaction Gate & Pagination
test('8. Seller reviews require recorded message/offer interaction, validate integer rating 1..5, and paginate cleanly', async () => {
  const seller = await register('مربي تقييمات', 'seller');
  const published = await createAndPublishListing(seller, 'حري صافي لتقييم المربي');

  const strangerBuyer = await register('مشتري بلا تفاعل');
  // Unauthenticated eligibility
  const anonRev = await request('GET', `/api/v1/sellers/${seller.user.id}/reviews?limit=2&offset=0`);
  assert.equal(anonRev.status, 200);
  assert.equal(anonRev.json.canReview, false);
  assert.equal(anonRev.json.reviewEligibilityReason, 'unauthenticated');

  // Self review blocked
  const selfRev = await seller.api('GET', `/api/v1/sellers/${seller.user.id}/reviews`);
  assert.equal(selfRev.json.canReview, false);
  assert.equal(selfRev.json.reviewEligibilityReason, 'self_review');

  // Stranger without message/offer blocked -> 403 review_requires_interaction
  const strangerEligibility = await strangerBuyer.api('GET', `/api/v1/sellers/${seller.user.id}/reviews`);
  assert.equal(strangerEligibility.json.canReview, false);
  assert.equal(strangerEligibility.json.reviewEligibilityReason, 'no_interaction');

  const blockedPost = await strangerBuyer.api('POST', `/api/v1/sellers/${seller.user.id}/reviews`, {
    rating: 5,
    comment: 'محاولة تقييم بدون تواصل',
  });
  assert.equal(blockedPost.status, 403);
  assert.equal(blockedPost.json.code, 'review_requires_interaction');

  // Create 3 buyers who interact (2 via conversation+message, 1 via price offer)
  const buyers: Session[] = [];
  for (let i = 0; i < 3; i++) {
    const b = await register(`مشتري مقيّم ${i + 1}`);
    if (i < 2) {
      const convRes = await b.api('POST', '/api/v1/conversations', {
        listingId: published.id,
        initialMessage: `استفسار رقم ${i + 1}`,
      });
      assert.equal(convRes.status, 200);
    } else {
      const offRes = await b.api('POST', `/api/v1/listings/${published.id}/offers`, {
        offeredPrice: 1450,
        quantity: 2,
        note: 'سوم جاد',
      });
      assert.equal(offRes.status, 201);
    }
    buyers.push(b);
  }

  // Invalid integer ratings (4.5, 6, 0) -> 400
  assert.equal(
    (await buyers[0].api('POST', `/api/v1/sellers/${seller.user.id}/reviews`, { rating: 4.5, comment: 'تقييم' })).status,
    400
  );
  assert.equal(
    (await buyers[0].api('POST', `/api/v1/sellers/${seller.user.id}/reviews`, { rating: 6, comment: 'تقييم' })).status,
    400
  );
  assert.equal(
    (await buyers[0].api('POST', `/api/v1/sellers/${seller.user.id}/reviews`, { rating: 0, comment: 'تقييم' })).status,
    400
  );

  // Submit 3 valid reviews (ratings 5, 4, 5)
  const ratings = [5, 4, 5];
  for (let i = 0; i < 3; i++) {
    const postRes = await buyers[i].api('POST', `/api/v1/sellers/${seller.user.id}/reviews`, {
      rating: ratings[i],
      comment: `تجربة ممتازة رقم ${i + 1}`,
    });
    assert.equal(postRes.status, 201, JSON.stringify(postRes.json));
    // Returned seller must never leak phone or whatsapp
    assert.equal(postRes.json.seller.phone, undefined);
    assert.equal(postRes.json.seller.whatsapp, undefined);
    assert.equal(typeof postRes.json.seller.contactAvailable, 'boolean');
  }

  // Verify pagination: limit=2&offset=0, then offset=2
  const page1 = await buyers[0].api('GET', `/api/v1/sellers/${seller.user.id}/reviews?limit=2&offset=0`);
  assert.equal(page1.status, 200);
  assert.equal(page1.json.totalCount, 3);
  assert.equal(page1.json.reviews.length, 2);
  assert.equal(page1.json.hasMore, true);
  assert.equal(page1.json.nextOffset, 2);
  assert.equal(page1.json.ratingBreakdown[5], 2);
  assert.equal(page1.json.ratingBreakdown[4], 1);
  assert.equal(page1.json.averageRating, 4.7);
  assert.equal(page1.json.canReview, true);
  assert.equal(page1.json.myReview.reviewerId, buyers[0].user.id);

  const page2 = await buyers[0].api('GET', `/api/v1/sellers/${seller.user.id}/reviews?limit=2&offset=2`);
  assert.equal(page2.status, 200);
  assert.equal(page2.json.reviews.length, 1);
  assert.equal(page2.json.hasMore, false);
  assert.equal(page2.json.nextOffset, null);
});

// 9. Admin Category Hierarchy Validation
test('9. Admin category creation & update enforce strict 2-level hierarchy', async () => {
  const admin = await getAdmin();
  const store = srv.getStore();
  const rootCat = store.categories.find((c) => !c.parentId)!;
  const subCat = store.categories.find((c) => c.parentId !== null)!;
  assert.ok(rootCat && subCat);

  // Invalid parentId -> 400
  const invalidParent = await admin.api('POST', '/api/v1/admin/categories', {
    name: 'تصنيف خاطئ',
    parentId: 'cat_nonexistent',
    description: 'وصف',
    keywords: 'نعيمي',
  });
  assert.equal(invalidParent.status, 400);

  // Sub-category as parent -> 400 (prevents 3-level nesting)
  const nestedSub = await admin.api('POST', '/api/v1/admin/categories', {
    name: 'تصنيف ثالثي',
    parentId: subCat.id,
    description: 'وصف',
    keywords: 'حري',
  });
  assert.equal(nestedSub.status, 400);

  // Valid sub-category under root -> 201
  const createdSub = await admin.api('POST', '/api/v1/admin/categories', {
    name: 'ضحايا فاخرة',
    parentId: rootCat.id,
    description: 'تصنيف فرعي مختبر',
    keywords: 'ضحية, عيد',
  });
  assert.equal(createdSub.status, 201);
  const newSubId = createdSub.json.category.id;

  // Self-parenting on PATCH -> 400
  const selfParent = await admin.api('PATCH', `/api/v1/admin/categories/${newSubId}`, {
    name: 'ضحايا فاخرة',
    parentId: newSubId,
  });
  assert.equal(selfParent.status, 400);

  // Root category cannot be detached/re-parented
  const editRoot = await admin.api('PATCH', `/api/v1/admin/categories/${rootCat.id}`, {
    name: rootCat.name,
    parentId: subCat.id,
  });
  assert.equal(editRoot.status, 400);

  // Clean up test subcategory
  const delRes = await admin.api('DELETE', `/api/v1/admin/categories/${newSubId}`);
  assert.equal(delRes.status, 200);
});

// 10. End-to-End Legitimate Buyer-Seller Flow
test('10. End-to-end legitimate marketplace workflow succeeds cleanly under Phase 5B hardening', async () => {
  const seller = await register('مربي مسار كامل', 'seller');
  const buyer = await register('مشتري مسار كامل', 'buyer');
  const listing = await createAndPublishListing(seller, 'سواكني مراح أصيل للبيع');

  // 1) Favorite
  const fav = await buyer.api('POST', '/api/v1/favorites/toggle', { listingId: listing.id });
  assert.equal(fav.status, 200);
  assert.equal(fav.json.isFavorite, true);

  // 2) Reveal contact
  const contact = await buyer.api('POST', `/api/v1/listings/${listing.id}/contact`, {});
  assert.equal(contact.status, 200);
  assert.equal(contact.json.phone, seller.phone);

  // 3) Start conversation + reply
  const conv = await buyer.api('POST', '/api/v1/conversations', {
    listingId: listing.id,
    initialMessage: 'السلام عليكم، هل السعر شامل التوصيل؟',
  });
  assert.equal(conv.status, 200);
  const reply = await seller.api('POST', `/api/v1/conversations/${conv.json.conversation.id}/messages`, {
    body: 'وعليكم السلام، نعم متاح التوصيل داخل المنطقة',
  });
  assert.equal(reply.status, 201);

  // 4) Submit price offer & accept
  const offer = await buyer.api('POST', `/api/v1/listings/${listing.id}/offers`, {
    offeredPrice: 1500,
    quantity: 3,
    note: 'جاهز للاستلام اليوم',
  });
  assert.equal(offer.status, 201);
  const accepted = await seller.api('POST', `/api/v1/offers/${offer.json.offer.id}/respond`, {
    status: 'accepted',
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.json.offer.status, 'accepted');

  // 5) Review seller & read paginated reviews
  const rev = await buyer.api('POST', `/api/v1/sellers/${seller.user.id}/reviews`, {
    rating: 5,
    comment: 'تعامل راقٍ وحلال نظيف جداً',
  });
  assert.equal(rev.status, 201);

  const revsPage = await buyer.api('GET', `/api/v1/sellers/${seller.user.id}/reviews?limit=10&offset=0`);
  assert.equal(revsPage.status, 200);
  assert.equal(revsPage.json.totalCount, 1);
  assert.equal(revsPage.json.reviews[0].comment, 'تعامل راقٍ وحلال نظيف جداً');
});
