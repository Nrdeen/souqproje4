import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { startServer } from '../../server.ts';
import { hashPassword } from '../../server/auth/password';
import { MAX_COMMENT_LENGTH } from '../../server/comments';

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
    const payload = opts.body !== undefined ? Buffer.from(JSON.stringify(opts.body), 'utf-8') : undefined;
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
  return `057${String(1000000 + phoneSeq)}`;
}

async function registerAccount(name: string, role: 'buyer' | 'seller' = 'buyer') {
  const phone = nextPhone();
  const res = await requestJson('POST', '/api/v1/auth/register', {
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

async function ensureAdminAccount() {
  const store = srv.getStore();
  const phone = '0598888888';
  if (!store.users.some((u) => u.id === 'usr_comments_admin')) {
    const user = {
      id: 'usr_comments_admin',
      phone,
      email: 'comments-admin@test.sa',
      name: 'مشرف التعليقات',
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
  }
  const res = await requestJson('POST', '/api/v1/auth/login', {
    body: { phone, password: PASSWORD },
  });
  assert.equal(res.status, 200);
  return {
    phone,
    cookie: cookieFrom(res),
    csrf: res.json.csrfToken as string,
    user: res.json.user,
  };
}

function connectWs(cookie: string): Promise<{ ws: WebSocket; messages: any[]; waitFor: (pred: (m: any) => boolean) => Promise<any> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`, {
      headers: { Origin: ORIGIN, Cookie: cookie },
    });
    const messages: any[] = [];
    const listeners: Array<(m: any) => void> = [];

    ws.on('message', (data) => {
      const parsed = JSON.parse(String(data));
      messages.push(parsed);
      for (const fn of [...listeners]) fn(parsed);
    });
    ws.once('open', () => {
      resolve({
        ws,
        messages,
        waitFor: (pred) =>
          new Promise((resWait, rejWait) => {
            const existing = messages.find(pred);
            if (existing) return resWait(existing);
            const timer = setTimeout(() => rejWait(new Error('Timed out waiting for WS message')), 3000);
            const handler = (m: any) => {
              if (pred(m)) {
                clearTimeout(timer);
                const idx = listeners.indexOf(handler);
                if (idx !== -1) listeners.splice(idx, 1);
                resWait(m);
              }
            };
            listeners.push(handler);
          }),
      });
    });
    ws.once('error', reject);
  });
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-comments-test-'));
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

test('unpublished listing hides comments (404 to non-owners, disabled to owner/admin) and unlocks once published', async () => {
  const seller = await registerAccount('مربي النجدية', 'seller');
  const buyer = await registerAccount('مشتري مهتم', 'buyer');
  const admin = await ensureAdminAccount();
  const store = srv.getStore();

  const created = await requestJson('POST', '/api/v1/listings', {
    cookie: seller.cookie,
    csrf: seller.csrf,
    body: {
      title: 'نعيمي قيد المراجعة للتعليقات',
      description: 'اختبار خصوصية التعليقات قبل الاعتماد',
      priceAmount: 1750,
      breedId: store.breeds[0].id,
      regionId: store.regions[0].id,
    },
  });
  assert.equal(created.status, 201);
  const listingId = created.json.listing.id as string;
  assert.equal(created.json.listing.status, 'Pending');

  // Stranger / anonymous cannot view or post on Pending listing (404)
  assert.equal((await requestJson('GET', `/api/v1/listings/${listingId}/comments`)).status, 404);
  assert.equal(
    (await requestJson('GET', `/api/v1/listings/${listingId}/comments`, { cookie: buyer.cookie })).status,
    404
  );
  assert.equal(
    (
      await requestJson('POST', `/api/v1/listings/${listingId}/comments`, {
        cookie: buyer.cookie,
        csrf: buyer.csrf,
        body: { body: 'سؤال غير مصرح' },
      })
    ).status,
    404
  );

  // Even seller cannot post public comments while Pending (403) and GET shows commentsEnabled: false
  const ownerPendingGet = await requestJson('GET', `/api/v1/listings/${listingId}/comments`, {
    cookie: seller.cookie,
  });
  assert.equal(ownerPendingGet.status, 200);
  assert.equal(ownerPendingGet.json.commentsEnabled, false);
  assert.deepEqual(ownerPendingGet.json.threads, []);

  const ownerPendingPost = await requestJson('POST', `/api/v1/listings/${listingId}/comments`, {
    cookie: seller.cookie,
    csrf: seller.csrf,
    body: { body: 'تعليق قبل النشر' },
  });
  assert.equal(ownerPendingPost.status, 403);

  // Admin approves -> listing becomes Published -> comments work
  const approved = await requestJson('POST', `/api/v1/admin/listings/${listingId}/approve`, {
    cookie: admin.cookie,
    csrf: admin.csrf,
  });
  assert.equal(approved.status, 200);

  const publicGet = await requestJson('GET', `/api/v1/listings/${listingId}/comments`);
  assert.equal(publicGet.status, 200);
  assert.equal(publicGet.json.commentsEnabled, true);
});

test('questions, seller replies, authorization, WebSocket notifications, editing, moderation, and restart persistence', async () => {
  const seller = await registerAccount('فهد الدوسري', 'seller');
  const buyer = await registerAccount('ناصر العتيبي', 'buyer');
  const otherUser = await registerAccount('طلال الشهري', 'buyer');
  const admin = await ensureAdminAccount();
  const store = srv.getStore();

  const createListing = await requestJson('POST', '/api/v1/listings', {
    cookie: seller.cookie,
    csrf: seller.csrf,
    body: {
      title: 'طليان نعيمية جاهزة للاستفسارات',
      description: 'للبيع بالمراح بالرياض',
      priceAmount: 1950,
      breedId: store.breeds[0].id,
      regionId: store.regions[0].id,
    },
  });
  assert.equal(createListing.status, 201);
  const listingId = createListing.json.listing.id as string;

  await requestJson('POST', `/api/v1/admin/listings/${listingId}/approve`, {
    cookie: admin.cookie,
    csrf: admin.csrf,
  });

  // Connect WebSockets for seller and buyer to verify real-time notifications
  const sellerWs = await connectWs(seller.cookie);
  const buyerWs = await connectWs(buyer.cookie);

  try {
    // Unauthenticated POST & missing CSRF blocked
    assert.equal(
      (await requestJson('POST', `/api/v1/listings/${listingId}/comments`, { body: { body: 'مرحبا' } })).status,
      401
    );
    assert.equal(
      (
        await requestJson('POST', `/api/v1/listings/${listingId}/comments`, {
          cookie: buyer.cookie,
          body: { body: 'مرحبا' },
        })
      ).status,
      403
    );

    // Buyer posts a public question -> seller receives WS notification + comments-updated event
    const askRes = await requestJson('POST', `/api/v1/listings/${listingId}/comments`, {
      cookie: buyer.cookie,
      csrf: buyer.csrf,
      body: { body: 'هل السعر شامل التوصيل إلى الخرج؟' },
    });
    assert.equal(askRes.status, 201);
    const questionId = askRes.json.comment.id as string;
    assert.equal(askRes.json.comment.isSeller, false);
    assert.equal(askRes.json.comment.authorName, 'ناصر العتيبي');

    const sellerNotifMsg = await sellerWs.waitFor(
      (m) => m.type === 'notification:new' && m.notification?.type === 'new_comment'
    );
    assert.equal(sellerNotifMsg.notification.listingId, listingId);
    assert.equal(sellerNotifMsg.notification.commentId, questionId);

    // Non-owner cannot reply directly to a question (403)
    const nonOwnerReply = await requestJson('POST', `/api/v1/listings/${listingId}/comments`, {
      cookie: otherUser.cookie,
      csrf: otherUser.csrf,
      body: { body: 'أرد نيابة عنه', parentId: questionId },
    });
    assert.equal(nonOwnerReply.status, 403);

    // Listing owner replies to buyer's question -> buyer receives WS notification
    const replyRes = await requestJson('POST', `/api/v1/listings/${listingId}/comments`, {
      cookie: seller.cookie,
      csrf: seller.csrf,
      body: { body: 'نعم التوصيل متاح للخرج بالاتفاق.', parentId: questionId },
    });
    assert.equal(replyRes.status, 201);
    const replyId = replyRes.json.comment.id as string;
    assert.equal(replyRes.json.comment.isSeller, true);

    // Replying to a reply is rejected (400)
    const nestedReply = await requestJson('POST', `/api/v1/listings/${listingId}/comments`, {
      cookie: seller.cookie,
      csrf: seller.csrf,
      body: { body: 'رد على الرد', parentId: replyId },
    });
    assert.equal(nestedReply.status, 400);

    const buyerNotifMsg = await buyerWs.waitFor(
      (m) => m.type === 'notification:new' && m.notification?.type === 'comment_reply'
    );
    assert.equal(buyerNotifMsg.notification.listingId, listingId);
    assert.equal(buyerNotifMsg.notification.commentId, replyId);

    // Editing own comment works; editing someone else's fails with 403
    const forbiddenEdit = await requestJson('PATCH', `/api/v1/comments/${questionId}`, {
      cookie: otherUser.cookie,
      csrf: otherUser.csrf,
      body: { body: 'تعديل غير مصرح' },
    });
    assert.equal(forbiddenEdit.status, 403);

    const okEdit = await requestJson('PATCH', `/api/v1/comments/${questionId}`, {
      cookie: buyer.cookie,
      csrf: buyer.csrf,
      body: { body: 'هل السعر شامل التوصيل إلى الخرج والدفع عند الاستلام؟' },
    });
    assert.equal(okEdit.status, 200);
    assert.equal(okEdit.json.comment.isEdited, true);

    // Another buyer posts an inappropriate comment; non-admin cannot delete it, admin moderates it
    const badComment = await requestJson('POST', `/api/v1/listings/${listingId}/comments`, {
      cookie: otherUser.cookie,
      csrf: otherUser.csrf,
      body: { body: 'تعليق دعائي مخالف لقواعد السوق' },
    });
    assert.equal(badComment.status, 201);
    const badId = badComment.json.comment.id as string;

    // Non-admin blocked from /api/v1/admin/comments (403)
    assert.equal(
      (await requestJson('GET', '/api/v1/admin/comments', { cookie: buyer.cookie })).status,
      403
    );
    assert.equal(
      (await requestJson('GET', '/api/v1/admin/comments', { cookie: admin.cookie })).status,
      200
    );

    // Stranger cannot delete someone else's comment
    assert.equal(
      (
        await requestJson('DELETE', `/api/v1/comments/${badId}`, {
          cookie: buyer.cookie,
          csrf: buyer.csrf,
        })
      ).status,
      403
    );

    // Admin removes inappropriate comment with audit trail
    const adminRemove = await requestJson('DELETE', `/api/v1/comments/${badId}`, {
      cookie: admin.cookie,
      csrf: admin.csrf,
      body: { reason: 'محتوى دعائي مخالف' },
    });
    assert.equal(adminRemove.status, 200);

    const adminBoot = await requestJson('GET', '/api/v1/bootstrap', { cookie: admin.cookie });
    assert.ok(
      adminBoot.json.auditLogs.some(
        (log: any) => log.targetType === 'comment' && log.targetId === badId && log.note === 'محتوى دعائي مخالف'
      )
    );
  } finally {
    sellerWs.ws.close();
    buyerWs.ws.close();
  }

  // Restart server against same dataDir and verify comments, edits, and notifications persist
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

  const persisted = await requestJson('GET', `/api/v1/listings/${listingId}/comments`);
  assert.equal(persisted.status, 200);
  assert.equal(persisted.json.totalThreads, 1);
  assert.equal(persisted.json.totalCount, 2);
  assert.equal(persisted.json.threads[0].isEdited, true);
  assert.equal(
    persisted.json.threads[0].body,
    'هل السعر شامل التوصيل إلى الخرج والدفع عند الاستلام؟'
  );
  assert.equal(persisted.json.threads[0].replies.length, 1);
  assert.equal(persisted.json.threads[0].replies[0].isSeller, true);

  // Notifications persisted across restart for seller and buyer
  const sellerRelogin = await requestJson('POST', '/api/v1/auth/login', {
    body: { phone: seller.phone, password: PASSWORD },
  });
  const sellerBoot = await requestJson('GET', '/api/v1/bootstrap', {
    cookie: cookieFrom(sellerRelogin),
  });
  assert.ok(
    sellerBoot.json.notifications.some(
      (n: any) => n.type === 'new_comment' && n.listingId === listingId
    )
  );

  // Author can delete their own question (which also removes its reply cleanly)
  const buyerRelogin = await requestJson('POST', '/api/v1/auth/login', {
    body: { phone: buyer.phone, password: PASSWORD },
  });
  const delOwn = await requestJson(
    'DELETE',
    `/api/v1/comments/${persisted.json.threads[0].id}`,
    {
      cookie: cookieFrom(buyerRelogin),
      csrf: buyerRelogin.json.csrfToken,
    }
  );
  assert.equal(delOwn.status, 200);
  assert.equal(delOwn.json.deletedIds.length, 2);

  const afterDel = await requestJson('GET', `/api/v1/listings/${listingId}/comments`);
  assert.equal(afterDel.json.totalThreads, 0);
  assert.equal(afterDel.json.totalCount, 0);
});

test('comment pagination, input validation, duplicate guard, and rate limiting prevent spam', async () => {
  const seller = await registerAccount('بائع التصفح', 'seller');
  const commenter = await registerAccount('مستخدم نشط', 'buyer');
  const spammer = await registerAccount('مستخدم سبام', 'buyer');
  const admin = await ensureAdminAccount();
  const store = srv.getStore();

  const createListing = await requestJson('POST', '/api/v1/listings', {
    cookie: seller.cookie,
    csrf: seller.csrf,
    body: {
      title: 'حري بلدي للتحقق من الصفحات ومكافحة السبام',
      description: 'عرض متكامل',
      priceAmount: 1650,
      breedId: store.breeds[0].id,
      regionId: store.regions[0].id,
    },
  });
  const listingId = createListing.json.listing.id as string;
  await requestJson('POST', `/api/v1/admin/listings/${listingId}/approve`, {
    cookie: admin.cookie,
    csrf: admin.csrf,
  });

  // Validation checks
  assert.equal(
    (
      await requestJson('POST', `/api/v1/listings/${listingId}/comments`, {
        cookie: commenter.cookie,
        csrf: commenter.csrf,
        body: { body: ' ' },
      })
    ).status,
    400
  );
  assert.equal(
    (
      await requestJson('POST', `/api/v1/listings/${listingId}/comments`, {
        cookie: commenter.cookie,
        csrf: commenter.csrf,
        body: { body: 'س'.repeat(MAX_COMMENT_LENGTH + 5) },
      })
    ).status,
    400
  );

  // Create 7 questions for pagination
  for (let i = 1; i <= 7; i += 1) {
    const res = await requestJson('POST', `/api/v1/listings/${listingId}/comments`, {
      cookie: commenter.cookie,
      csrf: commenter.csrf,
      body: { body: `سؤال اختبار التصفح رقم ${i}` },
    });
    assert.equal(res.status, 201);
  }

  // Duplicate comment immediately rejected (400)
  const dup = await requestJson('POST', `/api/v1/listings/${listingId}/comments`, {
    cookie: commenter.cookie,
    csrf: commenter.csrf,
    body: { body: 'سؤال اختبار التصفح رقم 7' },
  });
  assert.equal(dup.status, 400);

  const page1 = await requestJson('GET', `/api/v1/listings/${listingId}/comments?limit=3&offset=0`);
  assert.equal(page1.status, 200);
  assert.equal(page1.json.threads.length, 3);
  assert.equal(page1.json.totalThreads, 7);
  assert.equal(page1.json.hasMore, true);
  assert.equal(page1.json.nextOffset, 3);

  const page2 = await requestJson('GET', `/api/v1/listings/${listingId}/comments?limit=3&offset=3`);
  assert.equal(page2.json.threads.length, 3);
  assert.equal(page2.json.hasMore, true);
  assert.equal(page2.json.nextOffset, 6);

  const page3 = await requestJson('GET', `/api/v1/listings/${listingId}/comments?limit=3&offset=6`);
  assert.equal(page3.json.threads.length, 1);
  assert.equal(page3.json.hasMore, false);
  assert.equal(page3.json.nextOffset, null);

  // Rate limiting triggers 429 after 15 attempts from one user
  for (let i = 1; i <= 15; i += 1) {
    const ok = await requestJson('POST', `/api/v1/listings/${listingId}/comments`, {
      cookie: spammer.cookie,
      csrf: spammer.csrf,
      body: { body: `تعليق متتابع رقم ${i}` },
    });
    assert.equal(ok.status, 201);
  }
  const blocked = await requestJson('POST', `/api/v1/listings/${listingId}/comments`, {
    cookie: spammer.cookie,
    csrf: spammer.csrf,
    body: { body: 'تعليق يتجاوز الحد المسموح' },
  });
  assert.equal(blocked.status, 429);
  assert.ok(blocked.headers['retry-after']);
});
