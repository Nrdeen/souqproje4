import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../server.ts';
import { hashPassword } from '../../server/auth/password';
import { MAX_LISTINGS_PAGE_LIMIT, MAX_SEARCH_QUERY_LENGTH } from '../../src/lib/listing-search';

const ORIGIN = 'http://souq.test';
const PASSWORD = 'correct-horse-battery';

let srv: Awaited<ReturnType<typeof startServer>>;
let dataDir: string;

interface ApiRes {
  status: number;
  headers: http.IncomingHttpHeaders;
  json: any;
}

function requestJson(
  method: string,
  urlPath: string,
  opts: {
    cookie?: string;
    csrf?: string;
    origin?: string | null;
    body?: unknown;
  } = {}
): Promise<ApiRes> {
  return new Promise((resolve, reject) => {
    const payload =
      opts.body !== undefined ? Buffer.from(JSON.stringify(opts.body), 'utf-8') : undefined;
    const headers: Record<string, string> = {};
    if (payload !== undefined) {
      headers['Content-Type'] = 'application/json';
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

function cookieFrom(res: ApiRes): string {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] || [])[0] || '';
  return raw.split(';')[0];
}

let phoneSeq = 0;
function nextPhone() {
  phoneSeq += 1;
  return `058${String(2000000 + phoneSeq)}`;
}

async function registerSeller(name: string) {
  const phone = nextPhone();
  const res = await requestJson('POST', '/api/v1/auth/register', {
    body: { name, phone, password: PASSWORD, role: 'seller' },
  });
  assert.equal(res.status, 201);
  return {
    phone,
    cookie: cookieFrom(res),
    csrf: res.json.csrfToken as string,
    user: res.json.user,
    api: (method: string, urlPath: string, body?: unknown) =>
      requestJson(method, urlPath, {
        cookie: cookieFrom(res),
        csrf: res.json.csrfToken as string,
        body,
      }),
  };
}

async function createAdmin() {
  const store = srv.getStore();
  const phone = '0597777777';
  if (!store.users.some((u) => u.id === 'usr_phase3_admin')) {
    store.users.push({
      id: 'usr_phase3_admin',
      phone,
      email: 'phase3admin@souqalghanam.sa',
      name: 'مشرف المرحلة الثالثة',
      role: 'admin',
      status: 'active',
      createdAt: '2026-01-01T00:00:00Z',
      phoneVerifiedAt: null,
    });
    store.credentials.push({
      userId: 'usr_phase3_admin',
      passwordHash: await hashPassword(PASSWORD),
      updatedAt: new Date().toISOString(),
    });
  }
  const res = await requestJson('POST', '/api/v1/auth/login', {
    body: { phone, password: PASSWORD },
  });
  assert.equal(res.status, 200);
  const cookie = cookieFrom(res);
  const csrf = res.json.csrfToken as string;
  return {
    cookie,
    csrf,
    api: (method: string, urlPath: string, body?: unknown) =>
      requestJson(method, urlPath, { cookie, csrf, body }),
  };
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-phase3-test-'));
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

test('GET /api/v1/listings combines all Phase 3 filters, Arabic normalization, and strict authorization', async () => {
  const verifiedSeller = await registerSeller('مربي موثق اختبار');
  const unverifiedSeller = await registerSeller('مربي غير موثق اختبار');
  const admin = await createAdmin();

  // Strictly mark verifiedSeller as Verified, unverifiedSeller stays Pending
  await verifiedSeller.api('POST', '/api/v1/seller/verification/request');
  const verifyRes = await admin.api(
    'POST',
    `/api/v1/admin/sellers/${verifiedSeller.user.id}/verification`,
    {
      status: 'Verified',
      note: 'تم التحقق',
    }
  );
  assert.equal(verifyRes.status, 200);

  const store = srv.getStore();
  const nowBase = Date.parse('2026-06-01T10:00:00Z');

  // Seed controlled Phase 3 test listings covering combined attributes & privacy
  store.listings.push(
    {
      id: 'lst_p3_match',
      sellerId: verifiedSeller.user.id,
      categoryId: 'cat_sheep',
      subCategoryId: 'sub_slaughter',
      breedId: 'brd_naimi',
      regionId: 'reg_riyadh',
      city: 'حفر الباطن',
      title: 'أغنام نُعيميّة جذعان مميزة',
      slug: 'lst-p3-match',
      description: 'مراح حفر الباطن السعر ٤٥٠٠٠ للقطيع الفاخر',
      priceAmount: 22000,
      currency: 'SAR',
      sex: 'قطيع مختلط',
      ageMonths: 9,
      weightKg: 48,
      quantity: 12,
      isNegotiable: true,
      allowPriceOffers: true,
      vaccinated: true,
      status: 'Published',
      publishedAt: new Date(nowBase + 4000).toISOString(),
      createdAt: new Date(nowBase + 4000).toISOString(),
      updatedAt: new Date(nowBase + 4000).toISOString(),
      images: [],
      video: {
        id: 'vid_p3',
        url: '/uploads/test-vid.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 1024,
        mediaId: 'med_p3',
      },
    },
    {
      id: 'lst_p3_no_video',
      sellerId: verifiedSeller.user.id,
      categoryId: 'cat_sheep',
      subCategoryId: 'sub_slaughter',
      breedId: 'brd_naimi',
      regionId: 'reg_riyadh',
      city: 'حفر الباطن',
      title: 'جذعان نعيمي بدون فيديو',
      slug: 'lst-p3-no-video',
      description: 'حلال طيب محصن',
      priceAmount: 22000,
      currency: 'SAR',
      sex: 'ذكر',
      ageMonths: 8,
      weightKg: 45,
      quantity: 10,
      isNegotiable: false,
      allowPriceOffers: false,
      vaccinated: true,
      status: 'Published',
      publishedAt: new Date(nowBase + 3000).toISOString(),
      createdAt: new Date(nowBase + 3000).toISOString(),
      updatedAt: new Date(nowBase + 3000).toISOString(),
      images: [],
      video: null,
    },
    {
      id: 'lst_p3_unverified',
      sellerId: unverifiedSeller.user.id,
      categoryId: 'cat_sheep',
      subCategoryId: 'sub_slaughter',
      breedId: 'brd_naimi',
      regionId: 'reg_riyadh',
      city: 'حفر الباطن',
      title: 'نعيمي بائع غير موثق',
      slug: 'lst-p3-unverified',
      description: 'عرض نعيمي من بائع غير موثق',
      priceAmount: 18000,
      currency: 'SAR',
      sex: 'قطيع مختلط',
      ageMonths: 10,
      weightKg: 46,
      quantity: 15,
      isNegotiable: true,
      allowPriceOffers: true,
      vaccinated: false,
      status: 'Published',
      publishedAt: new Date(nowBase + 2000).toISOString(),
      createdAt: new Date(nowBase + 2000).toISOString(),
      updatedAt: new Date(nowBase + 2000).toISOString(),
      images: [],
      video: null,
    },
    {
      id: 'lst_p3_private_pending',
      sellerId: verifiedSeller.user.id,
      categoryId: 'cat_sheep',
      subCategoryId: 'sub_slaughter',
      breedId: 'brd_naimi',
      regionId: 'reg_riyadh',
      city: 'حفر الباطن',
      title: 'إعلان معلق سري اختبار المرحلة الثالثة',
      slug: 'lst-p3-pending',
      description: 'معلق لا يجب أن يظهر في البحث العام',
      priceAmount: 22000,
      currency: 'SAR',
      sex: 'قطيع مختلط',
      ageMonths: 9,
      weightKg: 48,
      quantity: 12,
      isNegotiable: true,
      allowPriceOffers: true,
      vaccinated: true,
      status: 'Pending',
      publishedAt: new Date(nowBase + 5000).toISOString(),
      createdAt: new Date(nowBase + 5000).toISOString(),
      updatedAt: new Date(nowBase + 5000).toISOString(),
      images: [],
      video: null,
    },
    {
      id: 'lst_p3_private_sold',
      sellerId: unverifiedSeller.user.id,
      categoryId: 'cat_sheep',
      subCategoryId: 'sub_slaughter',
      breedId: 'brd_naimi',
      regionId: 'reg_riyadh',
      city: 'الرياض',
      title: 'إعلان مباع خاص ببائع آخر',
      slug: 'lst-p3-sold',
      description: 'تم البيع',
      priceAmount: 5000,
      currency: 'SAR',
      sex: 'ذكر',
      ageMonths: 7,
      weightKg: 40,
      quantity: 5,
      isNegotiable: false,
      allowPriceOffers: false,
      vaccinated: true,
      status: 'Sold',
      publishedAt: new Date(nowBase + 1000).toISOString(),
      createdAt: new Date(nowBase + 1000).toISOString(),
      updatedAt: new Date(nowBase + 1000).toISOString(),
      images: [],
      video: null,
    }
  );

  // Combined AND filter + Arabic normalized search (no diacritics, ة -> ه, أ -> ا, multi-word across title & city)
  const qs = new URLSearchParams({
    q: 'اغنام نعيميه الباطن 45000',
    categoryId: 'cat_sheep',
    subCategoryId: 'sub_slaughter',
    breedId: 'brd_naimi',
    regionId: 'reg_riyadh',
    city: 'حفر الباطن',
    minPrice: '15000',
    maxPrice: '30000',
    minQty: '10',
    maxQty: '20',
    verifiedOnly: '1',
    vaccinatedOnly: '1',
    hasVideo: '1',
    availability: 'accepts_offers',
  });
  const combinedRes = await requestJson('GET', `/api/v1/listings?${qs.toString()}`);
  assert.equal(combinedRes.status, 200);
  assert.deepEqual(
    combinedRes.json.listings.map((l: any) => l.id),
    ['lst_p3_match']
  );
  // Original listing title text preserved intact (diacritics + teh marbuta kept)
  assert.equal(combinedRes.json.listings[0].title, 'أغنام نُعيميّة جذعان مميزة');

  // Pending listing never leaks in general search or status=Pending for visitors or other users
  const leakCheckAnon = await requestJson(
    'GET',
    `/api/v1/listings?q=${encodeURIComponent('سري اختبار المرحلة الثالثة')}`
  );
  assert.equal(leakCheckAnon.status, 200);
  assert.equal(leakCheckAnon.json.listings.length, 0);

  const leakStatusAnon = await requestJson('GET', '/api/v1/listings?status=Pending');
  assert.equal(leakStatusAnon.status, 200);
  assert.ok(!leakStatusAnon.json.listings.some((l: any) => l.id === 'lst_p3_private_pending'));

  // Sold listing privacy: anonymous sees 0; verifiedSeller only sees none of unverifiedSeller's sold items; unverifiedSeller sees own sold listing
  const soldAnon = await requestJson('GET', '/api/v1/listings?availability=sold');
  assert.equal(soldAnon.status, 200);
  assert.equal(soldAnon.json.listings.length, 0);

  const soldOther = await verifiedSeller.api('GET', '/api/v1/listings?availability=sold');
  assert.equal(soldOther.status, 200);
  assert.ok(!soldOther.json.listings.some((l: any) => l.id === 'lst_p3_private_sold'));

  const soldOwn = await unverifiedSeller.api('GET', '/api/v1/listings?availability=sold');
  assert.equal(soldOwn.status, 200);
  assert.ok(soldOwn.json.listings.some((l: any) => l.id === 'lst_p3_private_sold'));
});

test('GET /api/v1/listings pagination, deterministic sorting, invalid query errors, and legacy compatibility', async () => {
  // Pagination across pages with deterministic ordering & zero overlaps
  const page1 = await requestJson('GET', '/api/v1/listings?limit=3&offset=0&sort=price_asc');
  const page2 = await requestJson('GET', '/api/v1/listings?limit=3&offset=3&sort=price_asc');
  assert.equal(page1.status, 200);
  assert.equal(page2.status, 200);
  assert.equal(page1.json.limit, 3);
  assert.equal(page1.json.offset, 0);
  assert.equal(page1.json.listings.length, 3);
  assert.equal(page1.json.hasMore, true);
  assert.equal(page1.json.nextOffset, 3);
  assert.ok(page1.json.totalCount >= 6);

  const ids1 = new Set(page1.json.listings.map((l: any) => l.id));
  for (const l of page2.json.listings) {
    assert.equal(ids1.has(l.id), false, 'page2 must not duplicate items from page1');
  }

  // Price ascending sort order holds across page boundary
  const combinedPrices = [...page1.json.listings, ...page2.json.listings].map(
    (l: any) => l.priceAmount
  );
  for (let i = 1; i < combinedPrices.length; i += 1) {
    assert.ok(combinedPrices[i] >= combinedPrices[i - 1]);
  }

  // Oldest sort places earliest published listing first
  const oldestRes = await requestJson('GET', '/api/v1/listings?sort=oldest&limit=5');
  assert.equal(oldestRes.status, 200);
  const oldestTimes = oldestRes.json.listings.map((l: any) => Date.parse(l.publishedAt));
  for (let i = 1; i < oldestTimes.length; i += 1) {
    assert.ok(oldestTimes[i] >= oldestTimes[i - 1]);
  }

  // Explicit huge limit is clamped safely to MAX_LISTINGS_PAGE_LIMIT (50)
  const boundedRes = await requestJson('GET', '/api/v1/listings?limit=500');
  assert.equal(boundedRes.status, 200);
  assert.equal(boundedRes.json.limit, MAX_LISTINGS_PAGE_LIMIT);

  // Invalid query parameters return 400 invalid_query cleanly
  const badQueries = [
    `/api/v1/listings?q=${encodeURIComponent('س'.repeat(MAX_SEARCH_QUERY_LENGTH + 1))}`,
    '/api/v1/listings?minPrice=-10',
    '/api/v1/listings?minPrice=5000&maxPrice=1000',
    '/api/v1/listings?minQty=0',
    '/api/v1/listings?minQty=10&maxQty=2',
    '/api/v1/listings?limit=0',
    '/api/v1/listings?limit=abc',
    '/api/v1/listings?offset=-5',
    '/api/v1/listings?sort=unsupported_sort',
    '/api/v1/listings?availability=unknown_avail',
    '/api/v1/listings?verifiedOnly=notabool',
  ];
  for (const url of badQueries) {
    const res = await requestJson('GET', url);
    assert.equal(res.status, 400, `Expected 400 for ${url}`);
    assert.equal(res.json.code, 'invalid_query');
  }

  // Backward compatibility: legacy callers without pagination still receive { listings: Listing[] }
  const legacyRes = await requestJson('GET', '/api/v1/listings?status=Published&negotiable=true');
  assert.equal(legacyRes.status, 200);
  assert.ok(Array.isArray(legacyRes.json.listings));
  assert.ok(legacyRes.json.listings.every((l: any) => l.status === 'Published' && l.isNegotiable));
});
