/**
 * Phase 5C Integration Tests — Data Integrity (>50 pagination, Draft/Expired visibility),
 * Listing Moderation Lifecycle, Suspended Seller Protection, Orphaned Media Cleanup,
 * Notification Consistency, and Targeted Activity Snapshots.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../server.ts';
import { hashPassword } from '../../server/auth/password';

const ORIGIN = 'http://souq-phase5c.test';
const PASSWORD = 'phase5c-strong-password';

let srv: Awaited<ReturnType<typeof startServer>>;
let dataDir: string;

interface Res {
  status: number;
  headers: http.IncomingHttpHeaders;
  json: any;
}
interface Session {
  cookie: string;
  csrf: string;
  user: any;
}

function request(
  method: string,
  url: string,
  opts: { cookie?: string; csrf?: string; body?: unknown; origin?: string | null } = {}
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const headers: Record<string, string> = {};
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
  const pngBytes = Buffer.from(
    '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8cfc000000301010018dd8db00000000049454e44ae426082',
    'hex'
  );
  const boundary = '----SouqBoundaryPhase5C' + Date.now() + Math.random();
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
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            json: raw ? JSON.parse(raw) : null,
          });
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function cookieFrom(res: Res): string {
  const raw = res.headers['set-cookie'];
  assert.ok(raw && raw.length > 0);
  return raw[0].split(';')[0];
}

let phoneSeq = 51000000;
function nextPhone(): string {
  phoneSeq += 1;
  return `05${String(phoneSeq).slice(-8)}`;
}

async function registerUser(name: string, role: 'buyer' | 'seller' = 'seller'): Promise<Session> {
  const phone = nextPhone();
  const res = await request('POST', '/api/v1/auth/register', {
    body: { name, phone, password: PASSWORD, role },
  });
  assert.equal(res.status, 201, `register failed: ${JSON.stringify(res.json)}`);
  return { cookie: cookieFrom(res), csrf: res.json.csrfToken, user: res.json.user };
}

async function createAdminSession(): Promise<Session> {
  const phone = nextPhone();
  const store = srv.getStore();
  const adminId = `usr_admin_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
  store.users.push({
    id: adminId,
    name: 'مشرف اختبار المرحلة 5C',
    phone,
    role: 'admin',
    status: 'active',
    createdAt: new Date().toISOString(),
  });
  store.credentials.push({
    userId: adminId,
    passwordHash: await hashPassword(PASSWORD),
    updatedAt: new Date().toISOString(),
  });
  const login = await request('POST', '/api/v1/auth/login', {
    body: { phone, password: PASSWORD },
  });
  assert.equal(login.status, 200, JSON.stringify(login.json));
  return { cookie: cookieFrom(login), csrf: login.json.csrfToken, user: login.json.user };
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-phase5c-test-'));
  srv = await startServer({
    serveFrontend: false,
    env: {
      PORT: '0',
      NODE_ENV: 'test',
      DATA_DIR: dataDir,
      ALLOWED_ORIGINS: ORIGIN,
      DEMO_ACCOUNTS: 'false',
      UNBOUND_MEDIA_TTL_MS: '200',
    },
  });
});

after(async () => {
  await srv.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('Phase 5C A: Seller and admin pagination load > 50 listings including Draft/Expired while public API stays bounded', async () => {
  const seller = await registerUser('بائع القطع الكثيرة', 'seller');
  const otherSeller = await registerUser('بائع آخر', 'seller');
  const admin = await createAdminSession();
  const store = srv.getStore();

  // Seed 65 listings for `seller` across all 6 statuses + 10 for `otherSeller`
  const statuses: Array<'Published' | 'Pending' | 'Rejected' | 'Sold' | 'Draft' | 'Expired'> = [
    'Published',
    'Pending',
    'Rejected',
    'Sold',
    'Draft',
    'Expired',
  ];
  for (let i = 0; i < 65; i += 1) {
    const status = statuses[i % statuses.length];
    const ts = new Date(Date.now() - i * 60_000).toISOString();
    store.listings.push({
      id: `lst_bulk_${i}`,
      sellerId: seller.user.id,
      categoryId: 'cat_sheep',
      breedId: store.breeds[0].id,
      regionId: store.regions[0].id,
      city: 'الرياض',
      title: `إعلان تعدد الصفحات رقم ${i + 1}`,
      slug: `bulk-${i + 1}`,
      description: 'إعلان اختباري للتحقق من تعدد الصفحات بدون اقتطاع',
      priceAmount: 1500 + i * 10,
      currency: 'SAR',
      sex: 'ذكر',
      ageMonths: 8,
      weightKg: 40,
      quantity: 2,
      isNegotiable: true,
      vaccinated: true,
      status,
      publishedAt: ts,
      createdAt: ts,
      updatedAt: ts,
      images: [],
    });
  }
  for (let i = 0; i < 10; i += 1) {
    const ts = new Date(Date.now() - (i + 100) * 60_000).toISOString();
    store.listings.push({
      id: `lst_other_draft_${i}`,
      sellerId: otherSeller.user.id,
      categoryId: 'cat_sheep',
      breedId: store.breeds[0].id,
      regionId: store.regions[0].id,
      city: 'القصيم',
      title: `مسودة بائع آخر ${i}`,
      slug: `other-draft-${i}`,
      description: 'مسودة خاصة ببائع آخر',
      priceAmount: 1200,
      currency: 'SAR',
      sex: 'أنثى',
      ageMonths: 10,
      weightKg: 35,
      quantity: 1,
      isNegotiable: true,
      vaccinated: true,
      status: i % 2 === 0 ? 'Draft' : 'Expired',
      publishedAt: ts,
      createdAt: ts,
      updatedAt: ts,
      images: [],
    });
  }

  // Public API remains bounded to max 50 items per request and Published-only even with limit=500 or includeAllStatuses=true
  const publicBigLimit = await request('GET', '/api/v1/listings?limit=500&includeAllStatuses=true');
  assert.equal(publicBigLimit.status, 200);
  assert.ok(publicBigLimit.json.listings.length <= 50);
  assert.ok(
    publicBigLimit.json.listings.every((l: any) => l.status === 'Published'),
    'public caller must never see non-Published listings'
  );

  // Seller paginates own listings and recovers all 65 across all 6 statuses
  const sellerCollected: any[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const page = await request(
      'GET',
      `/api/v1/listings?sellerId=${seller.user.id}&limit=50&offset=${offset}`,
      { cookie: seller.cookie }
    );
    assert.equal(page.status, 200);
    sellerCollected.push(...page.json.listings);
    offset = page.json.hasMore ? page.json.nextOffset : null;
  }
  assert.equal(sellerCollected.length, 65);
  assert.ok(sellerCollected.some((l) => l.status === 'Draft'));
  assert.ok(sellerCollected.some((l) => l.status === 'Expired'));
  assert.ok(sellerCollected.some((l) => l.status === 'Rejected'));

  // Seller cannot query otherSeller's Draft/Expired/Pending listings
  const crossCheck = await request(
    'GET',
    `/api/v1/listings?sellerId=${otherSeller.user.id}&includeAllStatuses=true`,
    { cookie: seller.cookie }
  );
  assert.equal(crossCheck.status, 200);
  assert.ok(crossCheck.json.listings.every((l: any) => l.status === 'Published'));

  // Admin paginating includeAllStatuses=true gets all listings across all 6 statuses
  const adminCollected: any[] = [];
  let adminOffset: number | null = 0;
  while (adminOffset !== null) {
    const page = await request(
      'GET',
      `/api/v1/listings?includeAllStatuses=true&limit=50&offset=${adminOffset}`,
      { cookie: admin.cookie }
    );
    assert.equal(page.status, 200);
    adminCollected.push(...page.json.listings);
    adminOffset = page.json.hasMore ? page.json.nextOffset : null;
  }
  assert.ok(adminCollected.length >= 75);
  assert.ok(adminCollected.some((l) => l.id === 'lst_other_draft_0'));
  assert.ok(adminCollected.some((l) => l.id === 'lst_other_draft_1'));

  // Admin overview includes Draft & Expired counts accurately
  const overview = await request('GET', '/api/v1/admin/overview', { cookie: admin.cookie });
  assert.equal(overview.status, 200);
  assert.ok(overview.json.overview.listings.draft >= 1);
  assert.ok(overview.json.overview.listings.expired >= 1);
});

test('Phase 5C B: Listing moderation lifecycle (Published material re-approval, non-material preservation, Rejected resubmission)', async () => {
  const seller = await registerUser('بائع دورة المراجعة', 'seller');
  const admin = await createAdminSession();
  const store = srv.getStore();

  // 1. Seller creates a listing -> starts as Pending, hidden publicly
  const created = await request('POST', '/api/v1/listings', {
    cookie: seller.cookie,
    csrf: seller.csrf,
    body: {
      title: 'حري أصيل للمراجعة الأولية',
      description: 'وصف أولي مكتمل للمعاينة والتدقيق',
      priceAmount: 1650,
      expectedPrice: 1550,
      breedId: store.breeds[0].id,
      regionId: store.regions[0].id,
      city: 'الرياض',
      quantity: 3,
      allowPriceOffers: true,
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.listing.status, 'Pending');
  const listingId = created.json.listing.id as string;

  // Seller cannot self-publish
  const selfPub = await request('PATCH', `/api/v1/listings/${listingId}`, {
    cookie: seller.cookie,
    csrf: seller.csrf,
    body: { status: 'Published' },
  });
  assert.equal(selfPub.status, 403);

  // Admin rejects with clear reason
  const rejected = await request('POST', `/api/v1/admin/listings/${listingId}/reject`, {
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: { reason: 'يرجى توضيح العمر والوزن بشكل أدق' },
  });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.json.listing.status, 'Rejected');

  // 2. Seller corrects Rejected listing and resubmits -> status becomes Pending & clears rejectionReason
  const resubmitted = await request('PATCH', `/api/v1/listings/${listingId}`, {
    cookie: seller.cookie,
    csrf: seller.csrf,
    body: {
      title: 'حري أصيل عمر ٩ أشهر ووزن ٤٥ كجم',
      ageMonths: 9,
      weightKg: 45,
      status: 'Pending',
    },
  });
  assert.equal(resubmitted.status, 200);
  assert.equal(resubmitted.json.listing.status, 'Pending');
  assert.equal(resubmitted.json.listing.rejectionReason, undefined);

  // Admin approves resubmitted listing -> Published
  const approved = await request('POST', `/api/v1/admin/listings/${listingId}/approve`, {
    cookie: admin.cookie,
    csrf: admin.csrf,
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.json.listing.status, 'Published');

  // 3. Non-material edit on Published (toggle allowPriceOffers) keeps Published status
  const nonMaterialEdit = await request('PATCH', `/api/v1/listings/${listingId}`, {
    cookie: seller.cookie,
    csrf: seller.csrf,
    body: { allowPriceOffers: false },
  });
  assert.equal(nonMaterialEdit.status, 200);
  assert.equal(nonMaterialEdit.json.listing.status, 'Published');

  // 4. Material edit on Published listing (price/title/description/media change) forces re-approval -> Pending & hides publicly
  const materialEdit = await request('PATCH', `/api/v1/listings/${listingId}`, {
    cookie: seller.cookie,
    csrf: seller.csrf,
    body: { priceAmount: 2400, title: 'حري أصيل معدل السعر بعد النشر' },
  });
  assert.equal(materialEdit.status, 200);
  assert.equal(materialEdit.json.listing.status, 'Pending');

  const publicCheckWhilePending = await request('GET', `/api/v1/listings/${listingId}`);
  assert.equal(publicCheckWhilePending.status, 404);

  // Admin re-approves -> visible publicly again
  const reapproved = await request('POST', `/api/v1/admin/listings/${listingId}/approve`, {
    cookie: admin.cookie,
    csrf: admin.csrf,
  });
  assert.equal(reapproved.status, 200);
  assert.equal((await request('GET', `/api/v1/listings/${listingId}`)).status, 200);
});

test('Phase 5C C: Suspended seller protection hides listings/profile, blocks interactions, preserves data, and safely reinstates', async () => {
  const seller = await registerUser('مربي اختبار الإيقاف', 'seller');
  const buyer = await registerUser('مشتري اختبار الإيقاف', 'buyer');
  const admin = await createAdminSession();
  const store = srv.getStore();

  const created = await request('POST', '/api/v1/listings', {
    cookie: seller.cookie,
    csrf: seller.csrf,
    body: {
      title: 'ضأن نجدي لإختبار الإيقاف',
      description: 'وصف كامل لإعلان سيتم إيقاف صاحبه مؤقتاً',
      priceAmount: 2100,
      breedId: store.breeds[0].id,
      regionId: store.regions[0].id,
      city: 'الرياض',
      quantity: 4,
      allowPriceOffers: true,
    },
  });
  assert.equal(created.status, 201);
  const listingId = created.json.listing.id as string;

  await request('POST', `/api/v1/admin/listings/${listingId}/approve`, {
    cookie: admin.cookie,
    csrf: admin.csrf,
  });

  // Start a conversation BEFORE suspension so we test message blocking on existing thread too
  const convBefore = await request('POST', '/api/v1/conversations', {
    cookie: buyer.cookie,
    csrf: buyer.csrf,
    body: { listingId, initialMessage: 'السلام عليكم، هل الحلال موجود؟' },
  });
  assert.equal(convBefore.status, 200);
  const convId = convBefore.json.conversation.id as string;

  // Suspend the seller
  const susp = await request('POST', `/api/v1/admin/users/${seller.user.id}/suspend`, {
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: { reason: 'مخالفة إدارية مؤقتة للاختبار' },
  });
  assert.equal(susp.status, 200);

  // Public directory, detail, bootstrap sellers, and reviews hide suspended seller and listings
  const publicSearch = await request('GET', `/api/v1/listings?q=${encodeURIComponent('لإختبار الإيقاف')}`);
  assert.equal(publicSearch.status, 200);
  assert.equal(publicSearch.json.listings.some((l: any) => l.id === listingId), false);

  const publicDetail = await request('GET', `/api/v1/listings/${listingId}`);
  assert.equal(publicDetail.status, 404);

  const publicBoot = await request('GET', '/api/v1/bootstrap');
  assert.equal(publicBoot.status, 200);
  assert.equal(
    publicBoot.json.sellers.some((s: any) => s.userId === seller.user.id),
    false
  );

  const publicReviews = await request('GET', `/api/v1/sellers/${seller.user.id}/reviews`);
  assert.equal(publicReviews.status, 404);

  // Interactions blocked with 403 seller_suspended
  const contactBlocked = await request('POST', `/api/v1/listings/${listingId}/contact`, {
    cookie: buyer.cookie,
    csrf: buyer.csrf,
  });
  assert.equal(contactBlocked.status, 403);
  assert.equal(contactBlocked.json.code, 'seller_suspended');

  const offerBlocked = await request('POST', `/api/v1/listings/${listingId}/offers`, {
    cookie: buyer.cookie,
    csrf: buyer.csrf,
    body: { offeredPrice: 1900, quantity: 1, note: 'عرض' },
  });
  assert.equal(offerBlocked.status, 403);
  assert.equal(offerBlocked.json.code, 'seller_suspended');

  const msgBlocked = await request('POST', `/api/v1/conversations/${convId}/messages`, {
    cookie: buyer.cookie,
    csrf: buyer.csrf,
    body: { body: 'هل يمكنني الحجز؟' },
  });
  assert.equal(msgBlocked.status, 403);
  assert.equal(msgBlocked.json.code, 'seller_suspended');

  const commentBlocked = await request('POST', `/api/v1/listings/${listingId}/comments`, {
    cookie: buyer.cookie,
    csrf: buyer.csrf,
    body: { body: 'سؤال عن الإعلان' },
  });
  assert.equal(commentBlocked.status, 403);
  assert.equal(commentBlocked.json.code, 'seller_suspended');

  const likeBlocked = await request('PUT', `/api/v1/listings/${listingId}/like`, {
    cookie: buyer.cookie,
    csrf: buyer.csrf,
  });
  assert.equal(likeBlocked.status, 403);
  assert.equal(likeBlocked.json.code, 'seller_suspended');

  const favBlocked = await request('POST', '/api/v1/favorites/toggle', {
    cookie: buyer.cookie,
    csrf: buyer.csrf,
    body: { listingId },
  });
  assert.equal(favBlocked.status, 403);
  assert.equal(favBlocked.json.code, 'seller_suspended');

  const reviewBlocked = await request('POST', `/api/v1/sellers/${seller.user.id}/reviews`, {
    cookie: buyer.cookie,
    csrf: buyer.csrf,
    body: { rating: 5, comment: 'تجربة' },
  });
  assert.equal(reviewBlocked.status, 403);
  assert.equal(reviewBlocked.json.code, 'seller_suspended');

  // Admin retains full historical access without permanent deletion
  const adminListingView = await request('GET', `/api/v1/listings/${listingId}`, {
    cookie: admin.cookie,
  });
  assert.equal(adminListingView.status, 200);
  const adminBoot = await request('GET', '/api/v1/bootstrap', { cookie: admin.cookie });
  assert.ok(adminBoot.json.sellers.some((s: any) => s.userId === seller.user.id));

  // Safe reinstatement restores public visibility & normal interactions
  const reactivate = await request('POST', `/api/v1/admin/users/${seller.user.id}/reactivate`, {
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: { reason: 'انتهاء فترة المراجعة' },
  });
  assert.equal(reactivate.status, 200);

  assert.equal((await request('GET', `/api/v1/listings/${listingId}`)).status, 200);
  const msgAllowed = await request('POST', `/api/v1/conversations/${convId}/messages`, {
    cookie: buyer.cookie,
    csrf: buyer.csrf,
    body: { body: 'حمدلله على عودة الحساب، هل لا يزال متاحاً؟' },
  });
  assert.equal(msgAllowed.status, 201);
});

test('Phase 5C F: Orphaned unbound media cleanup removes expired drafts from store & disk and preserves active listing media', async () => {
  const seller = await registerUser('بائع تنظيف الوسائط', 'seller');
  const store = srv.getStore();

  // Upload 2 images: one will be bound to a listing, one remains unbound orphan
  const upBound = await uploadTinyPng(seller);
  assert.equal(upBound.status, 201);
  const boundMedia = upBound.json.media;

  const upOrphan = await uploadTinyPng(seller);
  assert.equal(upOrphan.status, 201);
  const orphanMedia = upOrphan.json.media;

  const boundAsset = store.media.find((m) => m.id === boundMedia.id);
  const orphanAsset = store.media.find((m) => m.id === orphanMedia.id);
  assert.ok(boundAsset && orphanAsset);
  const boundPath = path.join(dataDir, 'uploads', boundAsset.filename);
  const orphanPath = path.join(dataDir, 'uploads', orphanAsset.filename);
  assert.equal(fs.existsSync(boundPath), true);
  assert.equal(fs.existsSync(orphanPath), true);

  const created = await request('POST', '/api/v1/listings', {
    cookie: seller.cookie,
    csrf: seller.csrf,
    body: {
      title: 'إعلان مع صورة مرفوعة محمية',
      description: 'يجب ألا تُحذف صورة هذا الإعلان عند تنظيف الوسائط اليتيمة',
      priceAmount: 1950,
      breedId: store.breeds[0].id,
      regionId: store.regions[0].id,
      images: [{ url: boundMedia.url, mediaId: boundMedia.id, position: 1 }],
    },
  });
  assert.equal(created.status, 201);

  // Wait past UNBOUND_MEDIA_TTL_MS (200ms) and invoke cleanup
  await new Promise((r) => setTimeout(r, 260));
  const removedIds = await srv.cleanupOrphanedMedia();
  assert.ok(removedIds.includes(orphanMedia.id));
  assert.equal(removedIds.includes(boundMedia.id), false);

  assert.equal(fs.existsSync(orphanPath), false);
  assert.equal(fs.existsSync(boundPath), true);
  assert.equal((await request('GET', orphanMedia.url, { cookie: seller.cookie })).status, 404);
  assert.equal((await request('GET', boundMedia.url, { cookie: seller.cookie })).status, 200);
});

test('Phase 5C G & H: Replying syncs matching new_message notifications without touching unrelated ones and /api/v1/me/activity returns isolated activity', async () => {
  const seller = await registerUser('بائع الإشعارات', 'seller');
  const buyer = await registerUser('مشتري الإشعارات', 'buyer');
  const admin = await createAdminSession();
  const store = srv.getStore();

  const created = await request('POST', '/api/v1/listings', {
    cookie: seller.cookie,
    csrf: seller.csrf,
    body: {
      title: 'نعيمي إشعارات متزامنة',
      description: 'اختبار مزامنة الإشعارات عند الرد وتحديث النشاط المستهدف',
      priceAmount: 1750,
      breedId: store.breeds[0].id,
      regionId: store.regions[0].id,
    },
  });
  assert.equal(created.status, 201);
  const listingId = created.json.listing.id as string;

  await request('POST', `/api/v1/admin/listings/${listingId}/approve`, {
    cookie: admin.cookie,
    csrf: admin.csrf,
  });

  // Buyer starts conversation -> creates unread `new_message` notification for seller + another unrelated notification
  const convRes = await request('POST', '/api/v1/conversations', {
    cookie: buyer.cookie,
    csrf: buyer.csrf,
    body: { listingId, initialMessage: 'السلام عليكم، كم حدك النهائي؟' },
  });
  assert.equal(convRes.status, 200);
  const convId = convRes.json.conversation.id as string;

  // Buyer also posts a public comment so seller has an UNRELATED unread notification
  const commentRes = await request('POST', `/api/v1/listings/${listingId}/comments`, {
    cookie: buyer.cookie,
    csrf: buyer.csrf,
    body: { body: 'هل التطعيمات مكتملة؟' },
  });
  assert.equal(commentRes.status, 201);

  // Confirm seller has both unread notifications in /api/v1/me/activity
  const beforeActivity = await request('GET', '/api/v1/me/activity', { cookie: seller.cookie });
  assert.equal(beforeActivity.status, 200);
  const msgNotifBefore = beforeActivity.json.notifications.find(
    (n: any) => n.type === 'new_message' && n.conversationId === convId
  );
  const commentNotifBefore = beforeActivity.json.notifications.find(
    (n: any) => n.type === 'new_comment' && n.listingId === listingId
  );
  assert.ok(msgNotifBefore && msgNotifBefore.read === false);
  assert.ok(commentNotifBefore && commentNotifBefore.read === false);

  // Seller replies to the conversation
  const replyRes = await request('POST', `/api/v1/conversations/${convId}/messages`, {
    cookie: seller.cookie,
    csrf: seller.csrf,
    body: { body: 'وعليكم السلام، الحد ١٧٠٠ ريال للرأس' },
  });
  assert.equal(replyRes.status, 201);

  // Targeted /api/v1/me/activity shows matching new_message notification marked read, while unrelated comment notification remains unread!
  const afterActivity = await request('GET', '/api/v1/me/activity', { cookie: seller.cookie });
  assert.equal(afterActivity.status, 200);
  const msgNotifAfter = afterActivity.json.notifications.find(
    (n: any) => n.id === msgNotifBefore.id
  );
  const commentNotifAfter = afterActivity.json.notifications.find(
    (n: any) => n.id === commentNotifBefore.id
  );
  assert.equal(msgNotifAfter.read, true);
  assert.equal(commentNotifAfter.read, false);

  // Also verify /api/v1/me/activity requires authentication
  const anonActivity = await request('GET', '/api/v1/me/activity');
  assert.equal(anonActivity.status, 401);
});
