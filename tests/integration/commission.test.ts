import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { startServer } from '../../server.ts';
import { hashPassword } from '../../server/auth/password';

const ORIGIN = 'http://souq.test';
const PASSWORD = 'correct-horse-battery';

let srv: Awaited<ReturnType<typeof startServer>>;
let dataDir: string;

interface Res {
  status: number;
  headers: http.IncomingHttpHeaders;
  json: any;
  rawText: string;
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
      let rawText = '';
      res.on('data', (chunk) => (rawText += chunk));
      res.on('end', () => {
        let json: any = null;
        try {
          json = rawText ? JSON.parse(rawText) : null;
        } catch {
          json = rawText;
        }
        resolve({ status: res.statusCode || 0, headers: res.headers, json, rawText });
      });
    });
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

interface Session {
  phone: string;
  cookie: string;
  csrf: string;
  user: any;
  api: (method: string, url: string, body?: unknown, extra?: Partial<Opts>) => Promise<Res>;
}

function cookieFrom(res: Res): string {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] || [])[0] || '';
  return raw.split(';')[0];
}

let phoneSeq = 0;
const nextPhone = () =>
  `05${String(71000000 + ++phoneSeq + Math.floor(Math.random() * 100) * 1000).slice(0, 8)}`;

function toSession(res: Res, phone: string): Session {
  const cookie = cookieFrom(res);
  const csrf = res.json.csrfToken as string;
  return {
    phone,
    cookie,
    csrf,
    user: res.json.user,
    api: (method, url, body, extra = {}) => request(method, url, { cookie, csrf, body, ...extra }),
  };
}

async function register(name: string, role: 'buyer' | 'seller' = 'seller'): Promise<Session> {
  const phone = nextPhone();
  const res = await request('POST', '/api/v1/auth/register', {
    body: { name, phone, password: PASSWORD, role },
  });
  assert.equal(res.status, 201, res.rawText);
  return toSession(res, phone);
}

async function createAdminAccount(label: string): Promise<Session> {
  const store = srv.getStore();
  const phone = nextPhone();
  const id = `usr_admin_${Date.now()}_${++phoneSeq}`;
  const user = {
    id,
    phone,
    email: `${id}@souq.test`,
    name: label,
    role: 'admin' as const,
    status: 'active' as const,
    createdAt: new Date().toISOString(),
    phoneVerifiedAt: null,
  };
  store.users.push(user);
  store.credentials.push({
    userId: user.id,
    passwordHash: await hashPassword(PASSWORD),
    updatedAt: new Date().toISOString(),
  });
  const login = await request('POST', '/api/v1/auth/login', {
    body: { phone, password: PASSWORD },
  });
  assert.equal(login.status, 200, login.rawText);
  return toSession(login, phone);
}

function openSocket(cookie: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`, {
    headers: { Cookie: cookie, Origin: ORIGIN },
  });
  const messages: any[] = [];
  ws.on('message', (data) => messages.push(JSON.parse(String(data))));
  return { ws, messages };
}

const waitOpened = (ws: WebSocket) =>
  new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let admin: Session;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-int-commission-'));
  srv = await startServer({
    serveFrontend: false,
    config: {
      port: 0,
      dataDir,
      allowedOrigins: [ORIGIN],
      csrfSecret: 'integration-commission-secret-32chars',
      demoAccounts: false,
    },
  });
  admin = await createAdminAccount('مشرف العمولات');
});

after(async () => {
  await srv.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('Trust pledge validation, mark-sold promo exemption vs 1% commission, bank IBAN settings, and featured listing review', async () => {
  const store = srv.getStore();
  const seller = await register('مربي العمولات', 'seller');
  const adminWs = openSocket(admin.cookie);
  const sellerWs = openSocket(seller.cookie);
  await Promise.all([waitOpened(adminWs.ws), waitOpened(sellerWs.ws)]);

  try {
    // 1. Explicit rejection when commissionPledgeAccepted === false
    const badListingRes = await seller.api('POST', '/api/v1/listings', {
      title: 'نعيمي بدون إقرار',
      priceAmount: 1500,
      breedId: store.breeds[0].id,
      regionId: store.regions[0].id,
      description: 'اختبار رفض الإعلان بدون إقرار الأمانة',
      commissionPledgeAccepted: false,
    });
    assert.equal(badListingRes.status, 400);

    // 2. Create listing WITH trust pledge + optional featured request
    const createRes = await seller.api('POST', '/api/v1/listings', {
      title: 'خروف نعيمي فاخر للتمييز والبيع',
      priceAmount: 1500,
      breedId: store.breeds[0].id,
      regionId: store.regions[0].id,
      description: 'نعيمي فاخر مع إقرار الأمانة وطلب تمييز أسبوعي',
      commissionPledgeAccepted: true,
      featuredRequested: true,
    });
    assert.equal(createRes.status, 201, createRes.rawText);
    const listingA = createRes.json.listing;
    assert.equal(listingA.commissionPledgeAccepted, true);
    assert.equal(listingA.featuredRequested, true);
    assert.equal(listingA.isFeatured, false);

    // 3. Approve listing A so seller can manage & sell it
    const approveARes = await admin.api('POST', `/api/v1/admin/listings/${listingA.id}/approve`, {});
    assert.equal(approveARes.status, 200);

    // 4. First platform sale is exempt under launch promo (0 SAR)
    const firstSoldRes = await seller.api('POST', `/api/v1/listings/${listingA.id}/mark-sold`, {
      soldViaPlatform: true,
      saleAmountSar: 1500,
    });
    assert.equal(firstSoldRes.status, 200, firstSoldRes.rawText);
    assert.equal(firstSoldRes.json.listing.status, 'Sold');
    assert.equal(firstSoldRes.json.commissionRecord.isExempt, true);
    assert.equal(firstSoldRes.json.commissionRecord.commissionAmountSar, 0);
    assert.equal(firstSoldRes.json.commissionRecord.status, 'exempt');

    // 5. Admin rejects invalid IBAN, then saves valid Saudi IBAN and turns off promo to verify 1% charge
    const badIbanRes = await admin.api('PATCH', '/api/v1/admin/commission-settings', {
      iban: 'INVALID123',
    });
    assert.equal(badIbanRes.status, 400);

    const updateSettingsRes = await admin.api('PATCH', '/api/v1/admin/commission-settings', {
      commissionRatePercent: 1,
      promoEnabled: false,
      featuredWeeklyPriceSar: 40,
      bankName: 'مصرف الراجحي',
      accountHolderName: 'مؤسسة سوق الغنم',
      iban: 'sa12 3456 7890 1234 5678 9012',
    });
    assert.equal(updateSettingsRes.status, 200, updateSettingsRes.rawText);
    assert.equal(updateSettingsRes.json.settings.iban, 'SA1234567890123456789012');
    assert.equal(updateSettingsRes.json.settings.promoEnabled, false);
    assert.equal(updateSettingsRes.json.settings.featuredWeeklyPriceSar, 40);

    // 6. Create second listing & mark sold via platform for 30,000 SAR -> 300 SAR (1%) due + WS notification
    const createBRes = await seller.api('POST', '/api/v1/listings', {
      title: 'قطيع نجدية جملة 30 ألف',
      priceAmount: 30000,
      breedId: store.breeds[0].id,
      regionId: store.regions[0].id,
      description: 'بيع جملة نجدية مفحوصة وسليمة',
      commissionPledgeAccepted: true,
    });
    assert.equal(createBRes.status, 201);
    const listingB = createBRes.json.listing;
    await admin.api('POST', `/api/v1/admin/listings/${listingB.id}/approve`, {});

    const soldBRes = await seller.api('POST', `/api/v1/listings/${listingB.id}/mark-sold`, {
      soldViaPlatform: true,
      saleAmountSar: 30000,
    });
    assert.equal(soldBRes.status, 200, soldBRes.rawText);
    assert.equal(soldBRes.json.commissionRecord.commissionAmountSar, 300);
    assert.equal(soldBRes.json.commissionRecord.status, 'pending_payment');

    await wait(80);
    assert.ok(
      adminWs.messages.some(
        (m) => m.type === 'notification:new' && m.notification?.type === 'commission_due'
      ),
      'Admin should receive commission_due WebSocket notification'
    );

    // 7. Seller submits bank transfer confirmation -> moves to pending_review
    const submitPayRes = await seller.api('POST', '/api/v1/commissions/submit', {
      recordId: soldBRes.json.commissionRecord.id,
      transferReference: 'TR-998877',
      payerName: 'خالد المربي',
      transferNote: 'حوالة فورية من الراجحي',
    });
    assert.equal(submitPayRes.status, 201, submitPayRes.rawText);
    assert.equal(submitPayRes.json.commissionRecord.status, 'pending_review');
    assert.equal(submitPayRes.json.commissionRecord.transferReference, 'TR-998877');

    // 8. Admin lists commissions, approves the 1% transfer AND approves the earlier featured listing request
    const adminListRes = await admin.api('GET', '/api/v1/admin/commissions');
    assert.equal(adminListRes.status, 200);
    const featuredRec = adminListRes.json.records.find(
      (r: any) => r.kind === 'featured_listing' && r.listingId === listingA.id
    );
    assert.ok(featuredRec, 'Expected featured_listing commission record to exist');
    assert.equal(featuredRec.commissionAmountSar, 35); // created before featuredWeeklyPriceSar was changed to 40

    const approveCommRes = await admin.api(
      'POST',
      `/api/v1/admin/commissions/${soldBRes.json.commissionRecord.id}/review`,
      { status: 'approved', note: 'تم مطابقة الحوالة' }
    );
    assert.equal(approveCommRes.status, 200);
    assert.equal(approveCommRes.json.commissionRecord.status, 'approved');

    const approveFeaturedRes = await admin.api(
      'POST',
      `/api/v1/admin/commissions/${featuredRec.id}/review`,
      { status: 'approved' }
    );
    assert.equal(approveFeaturedRes.status, 200, approveFeaturedRes.rawText);
    assert.equal(approveFeaturedRes.json.commissionRecord.status, 'approved');
    assert.equal(approveFeaturedRes.json.listing.isFeatured, true);

    await wait(80);
    assert.ok(
      sellerWs.messages.some(
        (m) => m.type === 'notification:new' && m.notification?.type === 'commission_approved'
      ),
      'Seller should receive commission_approved notification'
    );
    assert.ok(
      sellerWs.messages.some(
        (m) => m.type === 'notification:new' && m.notification?.type === 'featured_approved'
      ),
      'Seller should receive featured_approved notification'
    );

    // 9. Third listing marked sold outside platform -> not_applicable & 0 SAR
    const createCRes = await seller.api('POST', '/api/v1/listings', {
      title: 'حري خارج المنصة',
      priceAmount: 2000,
      breedId: store.breeds[0].id,
      regionId: store.regions[0].id,
      description: 'حري ممتاز للتجربة خارج المنصة',
      commissionPledgeAccepted: true,
    });
    assert.equal(createCRes.status, 201);
    const listingC = createCRes.json.listing;
    await admin.api('POST', `/api/v1/admin/listings/${listingC.id}/approve`, {});
    const soldOutsideRes = await seller.api('POST', `/api/v1/listings/${listingC.id}/mark-sold`, {
      soldViaPlatform: false,
    });
    assert.equal(soldOutsideRes.status, 200, soldOutsideRes.rawText);
    assert.equal(soldOutsideRes.json.commissionRecord.status, 'not_applicable');
    assert.equal(soldOutsideRes.json.commissionRecord.commissionAmountSar, 0);
  } finally {
    adminWs.ws.close();
    sellerWs.ws.close();
  }
});
