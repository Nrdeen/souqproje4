import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../server.ts';
import { hashPassword } from '../../server/auth/password';
import { AUDIT_ARCHIVE_FILE_NAME } from '../../server/storage';

const ORIGIN = 'http://souq.test';
const PASSWORD = 'correct-horse-battery';

interface Res {
  status: number;
  headers: http.IncomingHttpHeaders;
  json: any;
  rawBuffer: Buffer;
  rawText: string;
}

interface Opts {
  cookie?: string;
  csrf?: string;
  origin?: string | null;
  headers?: Record<string, string>;
  body?: unknown;
}

function requestOnPort(port: number, method: string, url: string, opts: Opts = {}): Promise<Res> {
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

    const req = http.request({ host: '127.0.0.1', port, path: url, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => {
        const rawBuffer = Buffer.concat(chunks);
        const rawText = rawBuffer.toString('utf8');
        let json: any = null;
        try {
          json = rawText ? JSON.parse(rawText) : null;
        } catch {
          json = rawText;
        }
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          json,
          rawBuffer,
          rawText,
        });
      });
    });
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

function cookieFrom(res: Res): string {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] || [])[0] || '';
  return raw.split(';')[0];
}

let seq = 0;
const nextPhone = () => `05${String(71000000 + ++seq).slice(0, 8)}`;

async function createAdminInStore(srv: Awaited<ReturnType<typeof startServer>>, label: string) {
  const store = srv.getStore();
  const phone = nextPhone();
  const id = `usr_admin5d_${Date.now()}_${++seq}`;
  store.users.push({
    id,
    phone,
    email: `${id}@souq.test`,
    name: label,
    role: 'admin',
    status: 'active',
    createdAt: new Date().toISOString(),
    phoneVerifiedAt: null,
  });
  store.credentials.push({
    userId: id,
    passwordHash: await hashPassword(PASSWORD),
    updatedAt: new Date().toISOString(),
  });
  const login = await requestOnPort(srv.port, 'POST', '/api/v1/auth/login', {
    body: { phone, password: PASSWORD },
  });
  assert.equal(login.status, 200, login.rawText);
  const cookie = cookieFrom(login);
  const csrf = login.json.csrfToken as string;
  return {
    id,
    phone,
    cookie,
    csrf,
    api: (method: string, url: string, body?: unknown) =>
      requestOnPort(srv.port, method, url, { cookie, csrf, body }),
  };
}

test('Session touch and notification read receipts flush cleanly across server restart without losing updates', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-5d-persist-'));
  let srv: Awaited<ReturnType<typeof startServer>> | null = null;
  try {
    srv = await startServer({
      serveFrontend: false,
      config: { dataDir, port: 0, isProd: false, allowedOrigins: [ORIGIN] },
    });

    const phone = nextPhone();
    const reg = await requestOnPort(srv.port, 'POST', '/api/v1/auth/register', {
      body: { name: 'مستخدم الثبات', phone, password: PASSWORD, role: 'buyer' },
    });
    assert.equal(reg.status, 201, reg.rawText);
    const cookie = cookieFrom(reg);
    const csrf = reg.json.csrfToken as string;
    const userId = reg.json.user.id as string;

    // Seed an unread notification and mark it read via coalesced touch save
    const store = srv.getStore();
    store.notifications.unshift({
      id: 'ntf_persist_test',
      userId,
      type: 'message',
      title: 'تنبيه اختبار',
      body: 'محتوى التنبيه',
      createdAt: new Date().toISOString(),
      read: false,
    });

    const markRead = await requestOnPort(
      srv.port,
      'POST',
      '/api/v1/notifications/ntf_persist_test/read',
      { cookie, csrf }
    );
    assert.equal(markRead.status, 200);

    // Wait briefly so session touch (lastSeenAt) updates on /auth/me
    await new Promise((r) => setTimeout(r, 20));
    const me = await requestOnPort(srv.port, 'GET', '/api/v1/auth/me', { cookie });
    assert.equal(me.status, 200);

    // Immediately close BEFORE the 200ms coalesce timer fires -> flushSync must persist both!
    await srv.close();
    srv = null;

    // Reopen server on the same dataDir and verify persistence
    srv = await startServer({
      serveFrontend: false,
      config: { dataDir, port: 0, isProd: false, allowedOrigins: [ORIGIN] },
    });
    const reopenedStore = srv.getStore();
    const persistedNotif = reopenedStore.notifications.find((n: any) => n.id === 'ntf_persist_test');
    assert.equal(persistedNotif?.read, true);

    const meAfter = await requestOnPort(srv.port, 'GET', '/api/v1/auth/me', { cookie });
    assert.equal(meAfter.status, 200);
    assert.equal(meAfter.json.user.id, userId);
  } finally {
    if (srv) await srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('Audit retention archives excess logs non-destructively to NDJSON and retains unread notifications', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-5d-retention-'));
  let srv: Awaited<ReturnType<typeof startServer>> | null = null;
  try {
    srv = await startServer({
      serveFrontend: false,
      config: {
        dataDir,
        port: 0,
        isProd: false,
        allowedOrigins: [ORIGIN],
        auditLogMaxActive: 5,
        maxReadNotificationsPerUser: 2,
      },
    });

    const admin = await createAdminInStore(srv, 'مشرف الأرشفة');
    const store = srv.getStore();
    const targetUserId = store.users.find((u: any) => u.role !== 'admin')?.id;
    assert.ok(targetUserId);

    // Generate 8 distinct audit events by creating breeds via admin API
    for (let i = 1; i <= 8; i++) {
      const res = await admin.api('POST', '/api/v1/admin/breeds', {
        name: `سلالة أرشفة ${i}`,
        categoryId: 'cat_sheep',
        origin: 'الرياض',
        summary: 'اختبار أرشفة التدقيق',
        avgWeightKg: '45 كجم',
        priceRangeSar: '1500 ر.س',
      });
      assert.equal(res.status, 201, res.rawText);
    }

    assert.equal(store.auditLogs.length, 5);
    const archivePath = path.join(dataDir, AUDIT_ARCHIVE_FILE_NAME);
    assert.equal(fs.existsSync(archivePath), true, 'Expected audit-archive.ndjson to be created');

    const archivedEntries = fs
      .readFileSync(archivePath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.ok(
      archivedEntries.length >= 3,
      `Expected at least 3 archived audit records, got ${archivedEntries.length}`
    );

    const activeIds = new Set(store.auditLogs.map((a: any) => a.id));
    for (const archived of archivedEntries) {
      assert.ok(!activeIds.has(archived.id), 'Archived entry should not remain duplicated in active list');
    }

    // Verify read notifications retention keeps all unread notifications intact
    store.notifications = [
      {
        id: 'ntf_unread_1',
        userId: targetUserId,
        type: 'message',
        title: 'غير مقروء 1',
        body: 'تنبيه 1',
        createdAt: '2026-06-01T10:00:00Z',
        read: false,
      },
      {
        id: 'ntf_unread_2',
        userId: targetUserId,
        type: 'message',
        title: 'غير مقروء 2',
        body: 'تنبيه 2',
        createdAt: '2026-06-01T10:01:00Z',
        read: false,
      },
      {
        id: 'ntf_read_1',
        userId: targetUserId,
        type: 'message',
        title: 'مقروء 1',
        body: 'قديم 1',
        createdAt: '2026-05-01T10:00:00Z',
        read: true,
      },
      {
        id: 'ntf_read_2',
        userId: targetUserId,
        type: 'message',
        title: 'مقروء 2',
        body: 'قديم 2',
        createdAt: '2026-05-02T10:00:00Z',
        read: true,
      },
      {
        id: 'ntf_read_3',
        userId: targetUserId,
        type: 'message',
        title: 'مقروء 3',
        body: 'قديم 3',
        createdAt: '2026-05-03T10:00:00Z',
        read: true,
      },
      {
        id: 'ntf_read_4',
        userId: targetUserId,
        type: 'message',
        title: 'مقروء 4',
        body: 'قديم 4',
        createdAt: '2026-05-04T10:00:00Z',
        read: true,
      },
    ];

    // Trigger another notification to targetUserId by updating an offer/listing or reading bootstrap?
    // Creating a new comment on a listing owned by targetUserId triggers pushNotification, or admin approve!
    const listing = store.listings.find((l: any) => l.sellerId === targetUserId);
    if (listing) {
      const approveRes = await admin.api('POST', `/api/v1/admin/listings/${listing.id}/approve`, {});
      assert.equal(approveRes.status, 200);
      const userNotifs = store.notifications.filter((n: any) => n.userId === targetUserId);
      const unread = userNotifs.filter((n: any) => !n.read);
      const read = userNotifs.filter((n: any) => n.read);
      assert.ok(unread.length >= 3, 'All unread notifications must be preserved');
      assert.ok(read.length <= 2, `Expected read notifications trimmed to <= 2, got ${read.length}`);
    }
  } finally {
    if (srv) await srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('Admin endpoints enforce server-side pagination, search across pages, and strict admin auth', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-5d-admin-page-'));
  let srv: Awaited<ReturnType<typeof startServer>> | null = null;
  try {
    srv = await startServer({
      serveFrontend: false,
      config: { dataDir, port: 0, isProd: false, allowedOrigins: [ORIGIN] },
    });

    const admin = await createAdminInStore(srv, 'مشرف التصفح');

    // Create a non-admin buyer to confirm strict 403 enforcement
    const buyerPhone = nextPhone();
    const buyerReg = await requestOnPort(srv.port, 'POST', '/api/v1/auth/register', {
      body: { name: 'مشتري عادي', phone: buyerPhone, password: PASSWORD, role: 'buyer' },
    });
    assert.equal(buyerReg.status, 201);
    const buyerCookie = cookieFrom(buyerReg);

    for (const endpoint of [
      '/api/v1/admin/users',
      '/api/v1/admin/sellers',
      '/api/v1/admin/reports',
      '/api/v1/admin/comments',
      '/api/v1/admin/audit-logs',
    ]) {
      const unauth = await requestOnPort(srv.port, 'GET', endpoint);
      assert.equal(unauth.status, 401, `${endpoint} should require auth`);
      const nonAdmin = await requestOnPort(srv.port, 'GET', endpoint, { cookie: buyerCookie });
      assert.equal(nonAdmin.status, 403, `${endpoint} should reject non-admin`);
    }

    // Seed 32 items across users, sellers, reports, comments, and auditLogs
    const store = srv.getStore();
    const baseListingId = store.listings[0].id;
    const baseTime = Date.parse('2026-06-01T00:00:00.000Z');

    for (let i = 1; i <= 32; i++) {
      const iso = new Date(baseTime + i * 60_000).toISOString();
      const uid = `usr_scale_${i}`;
      store.users.push({
        id: uid,
        phone: `059990${String(i).padStart(4, '0')}`,
        email: `${uid}@souq.test`,
        name: i === 29 ? 'مربي البحث الخاص' : `مستخدم توسع ${i}`,
        role: 'seller',
        status: 'active',
        createdAt: iso,
        phoneVerifiedAt: null,
      });
      store.sellers.push({
        userId: uid,
        displayName: i === 29 ? 'مراح البحث المخصص' : `مراح ${i}`,
        bio: 'مراح',
        regionId: 'reg_riyadh',
        city: 'الرياض',
        verificationStatus: 'Pending',
        verifiedAt: null,
        verificationNote: null,
        verificationRequestedAt: iso,
        verificationReviewedAt: null,
        yearsExperience: 5,
        specialty: 'نعيمي',
        rating: 0,
        ratingCount: 0,
        totalSales: 0,
      });
      store.reports.push({
        id: `rep_scale_${i}`,
        targetType: 'listing',
        reporterId: uid,
        listingId: baseListingId,
        commentId: null,
        reason: i === 29 ? 'بلاغ بحث خاص' : `سبب ${i}`,
        details: 'تفاصيل',
        status: 'open',
        createdAt: iso,
        resolvedAt: null,
        resolutionNote: null,
      });
      store.comments.push({
        id: `cmt_scale_${i}`,
        listingId: baseListingId,
        authorId: uid,
        authorName: i === 29 ? 'مربي البحث الخاص' : `مستخدم توسع ${i}`,
        parentId: null,
        body: i === 29 ? 'تعليق بحث نادر جداً' : `تعليق ${i}`,
        isEdited: false,
        createdAt: iso,
        updatedAt: iso,
      });
      store.auditLogs.push({
        id: `aud_scale_${i}`,
        actorId: admin.id,
        actorName: admin.phone,
        action: i === 29 ? 'إجراء تدقيق خاص' : `إجراء ${i}`,
        targetType: 'listing',
        targetId: baseListingId,
        note: `ملاحظة ${i}`,
        createdAt: iso,
      });
    }

    // Check pagination on users
    const uPage1 = await admin.api('GET', '/api/v1/admin/users?limit=10&offset=0');
    assert.equal(uPage1.status, 200);
    assert.equal(uPage1.json.users.length, 10);
    assert.equal(uPage1.json.hasMore, true);
    assert.equal(uPage1.json.nextOffset, 10);
    assert.ok(uPage1.json.totalCount >= 32);

    const uPage2 = await admin.api('GET', '/api/v1/admin/users?limit=10&offset=10');
    assert.equal(uPage2.status, 200);
    assert.equal(uPage2.json.users.length, 10);
    const p1Ids = new Set(uPage1.json.users.map((u: any) => u.id));
    for (const u of uPage2.json.users) {
      assert.ok(!p1Ids.has(u.id), 'Page 2 users must not overlap Page 1');
    }

    // Search finds record beyond page 1
    const uSearch = await admin.api(
      'GET',
      `/api/v1/admin/users?q=${encodeURIComponent('مربي البحث الخاص')}`
    );
    assert.equal(uSearch.status, 200);
    assert.equal(uSearch.json.users.length, 1);
    assert.equal(uSearch.json.users[0].id, 'usr_scale_29');

    // Sellers pagination
    const sPage1 = await admin.api('GET', '/api/v1/admin/sellers?status=Pending&limit=10&offset=0');
    assert.equal(sPage1.status, 200);
    assert.equal(sPage1.json.sellers.length, 10);
    assert.equal(sPage1.json.hasMore, true);
    assert.equal(sPage1.json.nextOffset, 10);

    // Reports pagination
    const rPage1 = await admin.api('GET', '/api/v1/admin/reports?status=open&limit=10&offset=0');
    assert.equal(rPage1.status, 200);
    assert.equal(rPage1.json.reports.length, 10);
    assert.equal(rPage1.json.hasMore, true);

    // Comments pagination & server-side q search
    const cPage1 = await admin.api('GET', '/api/v1/admin/comments?limit=10&offset=0');
    assert.equal(cPage1.status, 200);
    assert.equal(cPage1.json.comments.length, 10);
    assert.equal(cPage1.json.hasMore, true);
    const cSearch = await admin.api(
      'GET',
      `/api/v1/admin/comments?q=${encodeURIComponent('نادر جداً')}`
    );
    assert.equal(cSearch.status, 200);
    assert.equal(cSearch.json.comments.length, 1);
    assert.equal(cSearch.json.comments[0].id, 'cmt_scale_29');

    // Audit logs pagination & q search
    const aPage1 = await admin.api('GET', '/api/v1/admin/audit-logs?limit=15&offset=0');
    assert.equal(aPage1.status, 200);
    assert.equal(aPage1.json.auditLogs.length, 15);
    assert.equal(aPage1.json.hasMore, true);
    assert.equal(aPage1.json.nextOffset, 15);
  } finally {
    if (srv) await srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('Marketplace static endpoint serves optimized JPG and WebP images reliably', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-5d-assets-'));
  let srv: Awaited<ReturnType<typeof startServer>> | null = null;
  try {
    srv = await startServer({
      serveFrontend: false,
      config: { dataDir, port: 0, isProd: false, allowedOrigins: [ORIGIN] },
    });

    const jpgRes = await requestOnPort(
      srv.port,
      'GET',
      '/src/assets/images/hero_saudi_livestock_1794608168927.jpg'
    );
    assert.equal(jpgRes.status, 200);
    assert.match(String(jpgRes.headers['content-type'] || ''), /image\/jpeg/i);
    assert.ok(jpgRes.rawBuffer.length > 10_000);

    const webpRes = await requestOnPort(
      srv.port,
      'GET',
      '/src/assets/images/hero_saudi_livestock_1794608168927.webp'
    );
    assert.equal(webpRes.status, 200);
    assert.match(String(webpRes.headers['content-type'] || ''), /image\/webp/i);
    assert.ok(webpRes.rawBuffer.length > 10_000);
    assert.ok(webpRes.rawBuffer.length < jpgRes.rawBuffer.length);
  } finally {
    if (srv) await srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
