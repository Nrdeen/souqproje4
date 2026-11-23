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
  `05${String(81000000 + ++phoneSeq + Math.floor(Math.random() * 100) * 1000).slice(0, 8)}`;

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

async function register(name: string, role: 'buyer' | 'seller' = 'buyer'): Promise<Session> {
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

async function makeListing(seller: Session, title: string) {
  const store = srv.getStore();
  const res = await seller.api('POST', '/api/v1/listings', {
    title,
    priceAmount: 1900,
    breedId: store.breeds[0].id,
    regionId: store.regions[0].id,
    description: 'نعيمي بلدي مفحوص بيطرياً في حالة ممتازة',
  });
  assert.equal(res.status, 201, res.rawText);
  return res.json.listing as { id: string; status: string };
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
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-admin-it-'));
  srv = await startServer({
    serveFrontend: false,
    env: { NODE_ENV: 'test' },
    config: { port: 0, dataDir, allowedOrigins: [ORIGIN], registerMaxPerHour: 10_000 },
  });
  admin = await createAdminAccount('مشرف رئيسي');
});

after(async () => {
  await srv.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('strict role-based authorization on all admin endpoints and zero credential leakage', async () => {
  const buyer = await register('مشتري اختبار', 'buyer');
  const seller = await register('مربي اختبار', 'seller');
  const pendingListing = await makeListing(seller, 'حري للعرض');

  const endpoints: Array<[string, string, unknown?]> = [
    ['GET', '/api/v1/admin/overview'],
    ['GET', '/api/v1/admin/users'],
    ['POST', `/api/v1/admin/users/${buyer.user.id}/suspend`, { reason: 'اختبار' }],
    ['POST', `/api/v1/admin/users/${buyer.user.id}/reactivate`, { reason: 'اختبار' }],
    ['GET', '/api/v1/admin/sellers'],
    ['POST', `/api/v1/admin/sellers/${seller.user.id}/verification`, { status: 'Verified' }],
    ['GET', '/api/v1/admin/reports'],
    ['POST', '/api/v1/admin/reports/rep_none/resolve', { status: 'resolved' }],
    ['GET', '/api/v1/admin/audit-logs'],
    ['POST', `/api/v1/admin/listings/${pendingListing.id}/approve`],
    ['POST', `/api/v1/admin/listings/${pendingListing.id}/reject`, { reason: 'سبب' }],
  ];

  for (const [method, url, body] of endpoints) {
    const anonRes = await request(method, url, { body });
    assert.equal(anonRes.status, 401, `anon ${method} ${url}`);
    for (const nonAdmin of [buyer, seller]) {
      const res = await nonAdmin.api(method, url, body);
      assert.equal(res.status, 403, `${nonAdmin.user.role} ${method} ${url}`);
    }
  }

  // Authorized admin reads overview, users, and sellers with zero sensitive leaks.
  const overviewRes = await admin.api('GET', '/api/v1/admin/overview');
  assert.equal(overviewRes.status, 200);
  assert.ok(overviewRes.json.overview.users.total >= 3);

  const usersRes = await admin.api('GET', '/api/v1/admin/users');
  assert.equal(usersRes.status, 200);
  const usersJson = usersRes.rawText;
  assert.ok(!/passwordHash|\$argon2id\$|tokenHash|credentials|internalNote/i.test(usersJson));

  const sellersRes = await admin.api('GET', '/api/v1/admin/sellers');
  assert.equal(sellersRes.status, 200);
  assert.ok(!/passwordHash|\$argon2id\$|tokenHash|credentials/i.test(sellersRes.rawText));
});

test('admin safety guards prevent self-suspension and support multi-admin suspension & reactivation', async () => {
  const selfRes = await admin.api('POST', `/api/v1/admin/users/${admin.user.id}/suspend`, {
    reason: 'تجربة إيقاف النفس',
  });
  assert.equal(selfRes.status, 400);
  assert.equal(selfRes.json.code, 'cannot_suspend_self');

  const secondAdmin = await createAdminAccount('مشرف مساعد');
  const suspendSecond = await admin.api('POST', `/api/v1/admin/users/${secondAdmin.user.id}/suspend`, {
    reason: 'انتهاء صلاحية المناوبة',
  });
  assert.equal(suspendSecond.status, 200, suspendSecond.rawText);
  assert.equal(suspendSecond.json.user.status, 'suspended');

  // Suspended admin cannot log in or use existing cookie.
  const suspendedLogin = await request('POST', '/api/v1/auth/login', {
    body: { phone: secondAdmin.phone, password: PASSWORD },
  });
  assert.equal(suspendedLogin.status, 403);
  assert.equal((await secondAdmin.api('GET', '/api/v1/admin/overview')).status, 401);

  // Reactivate second admin.
  const reactivateSecond = await admin.api(
    'POST',
    `/api/v1/admin/users/${secondAdmin.user.id}/reactivate`,
    { reason: 'عودة للعمل' }
  );
  assert.equal(reactivateSecond.status, 200);
  assert.equal(reactivateSecond.json.user.status, 'active');

  const restoredLogin = await request('POST', '/api/v1/auth/login', {
    body: { phone: secondAdmin.phone, password: PASSWORD },
  });
  assert.equal(restoredLogin.status, 200);
});

test('suspending an active user immediately revokes HTTP sessions and WebSocket connections, blocks login, and reactivation restores access', async () => {
  const user = await register('مستخدم تحت المراجعة', 'buyer');
  const sock = openSocket(user.cookie);
  await waitOpened(sock.ws);

  const wsClosed = new Promise<number>((resolve) => sock.ws.once('close', (code) => resolve(code)));

  // Requires valid reason >= 3 chars
  const missingReason = await admin.api('POST', `/api/v1/admin/users/${user.user.id}/suspend`, {
    reason: 'أ',
  });
  assert.equal(missingReason.status, 400);

  const suspendRes = await admin.api('POST', `/api/v1/admin/users/${user.user.id}/suspend`, {
    reason: 'مخالفة شروط النشر والتواصل',
  });
  assert.equal(suspendRes.status, 200, suspendRes.rawText);
  assert.equal(suspendRes.json.user.status, 'suspended');
  assert.equal(suspendRes.json.user.suspensionReason, 'مخالفة شروط النشر والتواصل');

  // Live WS closes with 4401 and existing HTTP session is immediately dead.
  assert.equal(await wsClosed, 4401);
  assert.equal((await request('GET', '/api/v1/auth/me', { cookie: user.cookie })).json.user, null);
  assert.equal((await user.api('POST', '/api/v1/favorites/toggle', { listingId: 'lst_101' })).status, 401);

  // New login blocked while suspended.
  const blockedLogin = await request('POST', '/api/v1/auth/login', {
    body: { phone: user.phone, password: PASSWORD },
  });
  assert.equal(blockedLogin.status, 403);

  // Filter admin users by status=suspended
  const suspendedFilter = await admin.api('GET', `/api/v1/admin/users?status=suspended&q=${encodeURIComponent(user.phone)}`);
  assert.equal(suspendedFilter.status, 200);
  assert.equal(suspendedFilter.json.users.length, 1);
  assert.equal(suspendedFilter.json.users[0].id, user.user.id);

  // Reactivate and verify login works again.
  const reactivateRes = await admin.api('POST', `/api/v1/admin/users/${user.user.id}/reactivate`, {
    reason: 'تم التعهد بالالتزام بالأنظمة',
  });
  assert.equal(reactivateRes.status, 200);
  assert.equal(reactivateRes.json.user.status, 'active');

  const restoredLogin = await request('POST', '/api/v1/auth/login', {
    body: { phone: user.phone, password: PASSWORD },
  });
  assert.equal(restoredLogin.status, 200);
  const restored = toSession(restoredLogin, user.phone);
  assert.equal(
    (await restored.api('POST', '/api/v1/favorites/toggle', { listingId: 'lst_101' })).status,
    200
  );
});

test('seller verification workflow updates status consistently across bootstrap, notifications, and comments', async () => {
  const seller = await register('مربي التوثيق', 'seller');
  const listing = await makeListing(seller, 'نجدي فاخر للتوثيق');
  await admin.api('POST', `/api/v1/admin/listings/${listing.id}/approve`);

  // Seller starts in Pending status.
  const initialState = await seller.api('GET', '/api/v1/seller/verification');
  assert.equal(initialState.status, 200);
  assert.equal(initialState.json.seller.verificationStatus, 'Pending');
  assert.equal(initialState.json.seller.verifiedAt, null);

  // Admin rejects verification (note required).
  const missingRejectReason = await admin.api(
    'POST',
    `/api/v1/admin/sellers/${seller.user.id}/verification`,
    { status: 'Rejected', reason: '' }
  );
  assert.equal(missingRejectReason.status, 400);

  const rejectRes = await admin.api(
    'POST',
    `/api/v1/admin/sellers/${seller.user.id}/verification`,
    { status: 'Rejected', reason: 'يرجى استكمال موقع المراح والخبرة' }
  );
  assert.equal(rejectRes.status, 200, rejectRes.rawText);
  assert.equal(rejectRes.json.seller.verificationStatus, 'Rejected');
  assert.equal(rejectRes.json.seller.verifiedAt, null);

  // Seller receives rejection notification and resubmits.
  let boot = await seller.api('GET', '/api/v1/bootstrap');
  assert.ok(
    boot.json.notifications.some(
      (n: any) =>
        n.type === 'seller_verification_rejected' &&
        n.body.includes('يرجى استكمال موقع المراح والخبرة')
    )
  );

  const resubmit = await seller.api('POST', '/api/v1/seller/verification/request');
  assert.equal(resubmit.status, 200);
  assert.equal(resubmit.json.seller.verificationStatus, 'Pending');

  // Admin approves verification.
  const verifyRes = await admin.api(
    'POST',
    `/api/v1/admin/sellers/${seller.user.id}/verification`,
    { status: 'Verified', reason: 'مراح موثوق ومستوفي الشروط' }
  );
  assert.equal(verifyRes.status, 200, verifyRes.rawText);
  assert.equal(verifyRes.json.seller.verificationStatus, 'Verified');
  assert.ok(verifyRes.json.seller.verifiedAt);

  // Consistent across bootstrap & listing comments.
  boot = await seller.api('GET', '/api/v1/bootstrap');
  assert.ok(
    boot.json.notifications.some((n: any) => n.type === 'seller_verified')
  );
  const publicProfile = boot.json.sellers.find((s: any) => s.userId === seller.user.id);
  assert.equal(publicProfile.verificationStatus, 'Verified');
  assert.ok(publicProfile.verifiedAt);

  const cmt = await seller.api('POST', `/api/v1/listings/${listing.id}/comments`, {
    body: 'نرحب بالمعاينة المباشرة في المراح',
  });
  assert.equal(cmt.status, 201, cmt.rawText);
  assert.equal(cmt.json.comment.isVerifiedSeller, true);
});

test('listing moderation, unified listing + comment reports, audit logs, and persistence across server restart', async () => {
  const seller = await register('مربي الإشراف', 'seller');
  const buyer = await register('مبلغ الإشراف', 'buyer');
  const badCommenter = await register('صاحب تعليق مخالف', 'buyer');

  const approvedListing = await makeListing(seller, 'سواكني بلدي ممتاز');
  const rejectedListing = await makeListing(seller, 'عرض بدون مواصفات واضحة');

  // Reject requires reason >= 3 chars.
  assert.equal(
    (await admin.api('POST', `/api/v1/admin/listings/${rejectedListing.id}/reject`, { reason: 'لا' })).status,
    400
  );
  const rejectRes = await admin.api(
    'POST',
    `/api/v1/admin/listings/${rejectedListing.id}/reject`,
    { reason: 'الصور غير واضحة والسعر غير مطابق' }
  );
  assert.equal(rejectRes.status, 200);
  assert.equal(rejectRes.json.listing.status, 'Rejected');

  const approveRes = await admin.api(
    'POST',
    `/api/v1/admin/listings/${approvedListing.id}/approve`
  );
  assert.equal(approveRes.status, 200);
  assert.equal(approveRes.json.listing.status, 'Published');

  // Seller received notifications for both moderation decisions.
  const sellerBoot = await seller.api('GET', '/api/v1/bootstrap');
  assert.ok(sellerBoot.json.notifications.some((n: any) => n.type === 'listing_approved' && n.listingId === approvedListing.id));
  assert.ok(sellerBoot.json.notifications.some((n: any) => n.type === 'listing_rejected' && n.listingId === rejectedListing.id));

  // Comment posted by badCommenter; buyer reports both the listing and the comment.
  const commentRes = await badCommenter.api('POST', `/api/v1/listings/${approvedListing.id}/comments`, {
    body: 'تعليق يحتوي على عبارة غير لائقة للتجربة',
  });
  assert.equal(commentRes.status, 201);
  const commentId = commentRes.json.comment.id as string;

  // Cannot report own comment.
  assert.equal(
    (
      await badCommenter.api('POST', '/api/v1/reports', {
        listingId: approvedListing.id,
        commentId,
        reason: 'اختبار',
      })
    ).status,
    400
  );

  const reportListingRes = await buyer.api('POST', '/api/v1/reports', {
    listingId: approvedListing.id,
    reason: 'اختلاف المواصفات',
    details: 'التأكد من الوزن المذكور',
  });
  assert.equal(reportListingRes.status, 201);
  const listingReportId = reportListingRes.json.report.id as string;

  const reportCommentRes = await buyer.api('POST', '/api/v1/reports', {
    listingId: approvedListing.id,
    commentId,
    reason: 'إساءة في التعليق',
    details: 'تجاوز في الحوار العام',
  });
  assert.equal(reportCommentRes.status, 201);
  const commentReportId = reportCommentRes.json.report.id as string;

  // Duplicate open report returns 409.
  assert.equal(
    (
      await buyer.api('POST', '/api/v1/reports', {
        listingId: approvedListing.id,
        commentId,
        reason: 'مكرر',
      })
    ).status,
    409
  );

  // Admin queries unified reports endpoint.
  const allReportsRes = await admin.api('GET', '/api/v1/admin/reports?status=open');
  assert.equal(allReportsRes.status, 200);
  const commentRepItem = allReportsRes.json.reports.find((r: any) => r.id === commentReportId);
  const listingRepItem = allReportsRes.json.reports.find((r: any) => r.id === listingReportId);
  assert.equal(commentRepItem.targetType, 'comment');
  assert.match(commentRepItem.commentBody, /عبارة غير لائقة/);
  assert.equal(listingRepItem.targetType, 'listing');
  assert.equal(listingRepItem.listingTitle, 'سواكني بلدي ممتاز');

  // Admin deletes reported comment -> auto-resolves comment report & records audit log.
  const delComment = await admin.api('DELETE', `/api/v1/comments/${commentId}`, {
    reason: 'مخالفة آداب السوق',
  });
  assert.equal(delComment.status, 200);

  const resolveListingRep = await admin.api(
    'POST',
    `/api/v1/admin/reports/${listingReportId}/resolve`,
    { status: 'resolved', note: 'تمت مراجعة الإعلان وتنبيه المربي' }
  );
  assert.equal(resolveListingRep.status, 200);
  assert.equal(resolveListingRep.json.report.status, 'resolved');

  // Suspend badCommenter before restart to test persistence across restart.
  const suspendCommenter = await admin.api('POST', `/api/v1/admin/users/${badCommenter.user.id}/suspend`, {
    reason: 'تكرار التعليقات المسيئة',
  });
  assert.equal(suspendCommenter.status, 200);

  // Verify audit logs contain actions across user, seller, listing, comment, report.
  const auditRes = await admin.api('GET', '/api/v1/admin/audit-logs?limit=50');
  assert.equal(auditRes.status, 200);
  const targetTypes = new Set(auditRes.json.auditLogs.map((l: any) => l.targetType));
  assert.ok(targetTypes.has('user'));
  assert.ok(targetTypes.has('listing'));
  assert.ok(targetTypes.has('comment'));
  assert.ok(targetTypes.has('report'));

  // Restart server pointing to same isolated dataDir.
  await wait(30);
  await srv.close();
  srv = await startServer({
    serveFrontend: false,
    env: { NODE_ENV: 'test' },
    config: { port: 0, dataDir, allowedOrigins: [ORIGIN], registerMaxPerHour: 10_000 },
  });

  // Suspended user still blocked after restart.
  const postRestartSuspendedLogin = await request('POST', '/api/v1/auth/login', {
    body: { phone: badCommenter.phone, password: PASSWORD },
  });
  assert.equal(postRestartSuspendedLogin.status, 403);

  // Admin logs in fresh after restart and verifies reports, comments, and audit logs persisted.
  const freshAdminLogin = await request('POST', '/api/v1/auth/login', {
    body: { phone: admin.phone, password: PASSWORD },
  });
  assert.equal(freshAdminLogin.status, 200);
  const freshAdmin = toSession(freshAdminLogin, admin.phone);

  const persistedReports = await freshAdmin.api('GET', '/api/v1/admin/reports');
  const persistedCommentReport = persistedReports.json.reports.find((r: any) => r.id === commentReportId);
  const persistedListingReport = persistedReports.json.reports.find((r: any) => r.id === listingReportId);
  assert.equal(persistedCommentReport.status, 'resolved');
  assert.equal(persistedListingReport.status, 'resolved');
  assert.equal(persistedListingReport.resolutionNote, 'تمت مراجعة الإعلان وتنبيه المربي');

  const persistedAudit = await freshAdmin.api('GET', '/api/v1/admin/audit-logs?limit=50');
  assert.ok(persistedAudit.json.auditLogs.some((l: any) => l.targetId === commentId && l.targetType === 'comment'));
  assert.ok(persistedAudit.json.auditLogs.some((l: any) => l.targetId === badCommenter.user.id && l.targetType === 'user'));
});
