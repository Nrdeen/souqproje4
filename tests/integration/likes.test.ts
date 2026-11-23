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
  return `058${String(2000000 + phoneSeq)}`;
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
  const phone = '0597777777';
  if (!store.users.some((u) => u.id === 'usr_likes_admin')) {
    const user = {
      id: 'usr_likes_admin',
      phone,
      email: 'likes-admin@test.sa',
      name: 'مشرف الإعجابات',
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

function connectWs(cookie: string): Promise<{
  ws: WebSocket;
  messages: any[];
  waitFor: (pred: (m: any) => boolean) => Promise<any>;
}> {
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
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-likes-test-'));
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

test('unpublished listings reject unauthorized likes with 404 and owner/admin with 403 until published', async () => {
  const seller = await registerAccount('بائع الإعلان المعلق', 'seller');
  const buyer = await registerAccount('مشتري يختبر الخصوصية', 'buyer');
  const admin = await ensureAdminAccount();
  const store = srv.getStore();

  const created = await requestJson('POST', '/api/v1/listings', {
    cookie: seller.cookie,
    csrf: seller.csrf,
    body: {
      title: 'حري قيد المراجعة للإعجابات',
      description: 'اختبار خصوصية الإعجابات',
      priceAmount: 1550,
      breedId: store.breeds[0].id,
      regionId: store.regions[0].id,
    },
  });
  assert.equal(created.status, 201);
  const listingId = created.json.listing.id as string;
  assert.equal(created.json.listing.status, 'Pending');

  // Non-owners & anonymous get 404 (privacy preserved)
  assert.equal((await requestJson('GET', `/api/v1/listings/${listingId}/likes`)).status, 404);
  assert.equal(
    (await requestJson('GET', `/api/v1/listings/${listingId}/likes`, { cookie: buyer.cookie })).status,
    404
  );
  assert.equal(
    (
      await requestJson('PUT', `/api/v1/listings/${listingId}/like`, {
        cookie: buyer.cookie,
        csrf: buyer.csrf,
      })
    ).status,
    404
  );

  // Owner sees likes disabled and gets 403 when attempting to like unpublished listing
  const ownerGet = await requestJson('GET', `/api/v1/listings/${listingId}/likes`, {
    cookie: seller.cookie,
  });
  assert.equal(ownerGet.status, 200);
  assert.equal(ownerGet.json.likesEnabled, false);
  assert.equal(ownerGet.json.likesCount, 0);

  assert.equal(
    (
      await requestJson('PUT', `/api/v1/listings/${listingId}/like`, {
        cookie: seller.cookie,
        csrf: seller.csrf,
      })
    ).status,
    403
  );

  // Admin approves listing -> buyer can now like it
  const approve = await requestJson('POST', `/api/v1/admin/listings/${listingId}/approve`, {
    cookie: admin.cookie,
    csrf: admin.csrf,
  });
  assert.equal(approve.status, 200);

  const buyerLike = await requestJson('PUT', `/api/v1/listings/${listingId}/like`, {
    cookie: buyer.cookie,
    csrf: buyer.csrf,
  });
  assert.equal(buyerLike.status, 200);
  assert.equal(buyerLike.json.isLiked, true);
  assert.equal(buyerLike.json.likesCount, 1);
});

test('likes separation from favorites, WS notifications, anti-spam cooldown, and restart persistence', async () => {
  const seller = await registerAccount('مراح القحطاني للاختبار', 'seller');
  const buyer = await registerAccount('عبدالله السبيعي', 'buyer');
  const admin = await ensureAdminAccount();
  const store = srv.getStore();

  const created = await requestJson('POST', '/api/v1/listings', {
    cookie: seller.cookie,
    csrf: seller.csrf,
    body: {
      title: 'نعيمي بلدي مميز لاختبار الإعجابات',
      description: 'مواصفات كاملة ومحصن',
      priceAmount: 1900,
      breedId: store.breeds[0].id,
      regionId: store.regions[0].id,
    },
  });
  const listingId = created.json.listing.id as string;
  await requestJson('POST', `/api/v1/admin/listings/${listingId}/approve`, {
    cookie: admin.cookie,
    csrf: admin.csrf,
  });

  // Unauthenticated & CSRF checks & invalid action validation
  assert.equal(
    (await requestJson('PUT', `/api/v1/listings/${listingId}/like`)).status,
    401
  );
  assert.equal(
    (await requestJson('PUT', `/api/v1/listings/${listingId}/like`, { cookie: buyer.cookie })).status,
    403
  );
  assert.equal(
    (
      await requestJson('POST', `/api/v1/listings/${listingId}/like`, {
        cookie: buyer.cookie,
        csrf: buyer.csrf,
        body: { action: 'bad_action' },
      })
    ).status,
    400
  );

  const sellerWs = await connectWs(seller.cookie);
  const buyerWs = await connectWs(buyer.cookie);

  try {
    // Buyer likes listing -> seller gets WS notification + broadcast likesCount
    const likeRes = await requestJson('PUT', `/api/v1/listings/${listingId}/like`, {
      cookie: buyer.cookie,
      csrf: buyer.csrf,
    });
    assert.equal(likeRes.status, 200);
    assert.equal(likeRes.json.isLiked, true);
    assert.equal(likeRes.json.likesCount, 1);
    assert.ok(likeRes.json.likedListingIds.includes(listingId));

    const notif = await sellerWs.waitFor(
      (m) =>
        m.type === 'notification:new' &&
        m.notification?.type === 'listing_liked' &&
        m.notification?.listingId === listingId
    );
    assert.ok(notif.notification.title.includes('عبدالله السبيعي'));

    const broadcastLike = await buyerWs.waitFor(
      (m) =>
        m.type === 'listing:likes-updated' &&
        m.listingId === listingId &&
        m.likesCount === 1
    );
    assert.equal(broadcastLike.likesCount, 1);

    // Favorites remain completely separate from Likes
    const buyerBootAfterLike = await requestJson('GET', '/api/v1/bootstrap', {
      cookie: buyer.cookie,
    });
    assert.ok(buyerBootAfterLike.json.likedListingIds.includes(listingId));
    assert.equal(buyerBootAfterLike.json.favoriteIds.includes(listingId), false);

    // Toggle favorite on -> likes unchanged; unlike -> favorite unchanged
    const favRes = await requestJson('POST', '/api/v1/favorites/toggle', {
      cookie: buyer.cookie,
      csrf: buyer.csrf,
      body: { listingId },
    });
    assert.equal(favRes.status, 200);
    assert.equal(favRes.json.isFavorite, true);

    const unlikeRes = await requestJson('DELETE', `/api/v1/listings/${listingId}/like`, {
      cookie: buyer.cookie,
      csrf: buyer.csrf,
    });
    assert.equal(unlikeRes.status, 200);
    assert.equal(unlikeRes.json.isLiked, false);
    assert.equal(unlikeRes.json.likesCount, 0);

    const bootAfterUnlike = await requestJson('GET', '/api/v1/bootstrap', {
      cookie: buyer.cookie,
    });
    assert.equal(bootAfterUnlike.json.likedListingIds.includes(listingId), false);
    assert.equal(bootAfterUnlike.json.favoriteIds.includes(listingId), true);

    // Re-like immediately -> anti-spam suppresses second notification!
    const relikeRes = await requestJson('PUT', `/api/v1/listings/${listingId}/like`, {
      cookie: buyer.cookie,
      csrf: buyer.csrf,
    });
    assert.equal(relikeRes.status, 200);
    assert.equal(relikeRes.json.likesCount, 1);

    // Seller liking own listing sends zero notification
    const selfLikeRes = await requestJson('PUT', `/api/v1/listings/${listingId}/like`, {
      cookie: seller.cookie,
      csrf: seller.csrf,
    });
    assert.equal(selfLikeRes.status, 200);
    assert.equal(selfLikeRes.json.likesCount, 2);

    const sellerBoot = await requestJson('GET', '/api/v1/bootstrap', {
      cookie: seller.cookie,
    });
    const likeNotifs = sellerBoot.json.notifications.filter(
      (n: any) => n.type === 'listing_liked' && n.listingId === listingId
    );
    assert.equal(likeNotifs.length, 1);

    // Listings endpoint includes likesCount & supports sorting by most_liked
    const listingsRes = await requestJson('GET', '/api/v1/listings?sort=most_liked');
    assert.equal(listingsRes.status, 200);
    const fetched = listingsRes.json.listings.find((l: any) => l.id === listingId);
    assert.equal(fetched.likesCount, 2);
  } finally {
    sellerWs.ws.close();
    buyerWs.ws.close();
  }

  // Restart server against same isolated dataDir -> likes & cooldown persist
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

  const persistedDetail = await requestJson('GET', `/api/v1/listings/${listingId}`);
  assert.equal(persistedDetail.status, 200);
  assert.equal(persistedDetail.json.listing.likesCount, 2);

  const buyerRelogin = await requestJson('POST', '/api/v1/auth/login', {
    body: { phone: buyer.phone, password: PASSWORD },
  });
  const buyerCookie = cookieFrom(buyerRelogin);
  const buyerCsrf = buyerRelogin.json.csrfToken as string;

  const persistedBoot = await requestJson('GET', '/api/v1/bootstrap', { cookie: buyerCookie });
  assert.ok(persistedBoot.json.likedListingIds.includes(listingId));

  // Cooldown survived restart: unlike then re-like still does not emit duplicate notification
  await requestJson('DELETE', `/api/v1/listings/${listingId}/like`, {
    cookie: buyerCookie,
    csrf: buyerCsrf,
  });
  await requestJson('PUT', `/api/v1/listings/${listingId}/like`, {
    cookie: buyerCookie,
    csrf: buyerCsrf,
  });

  const sellerRelogin = await requestJson('POST', '/api/v1/auth/login', {
    body: { phone: seller.phone, password: PASSWORD },
  });
  const sellerBootAfterRestart = await requestJson('GET', '/api/v1/bootstrap', {
    cookie: cookieFrom(sellerRelogin),
  });
  const persistedNotifs = sellerBootAfterRestart.json.notifications.filter(
    (n: any) => n.type === 'listing_liked' && n.listingId === listingId
  );
  assert.equal(persistedNotifs.length, 1);
});

test('concurrent like requests prevent duplicates, handle multi-user concurrency, and enforce rate limits', async () => {
  const seller = await registerAccount('مربي اختبار التزامن', 'seller');
  const admin = await ensureAdminAccount();
  const store = srv.getStore();

  const created = await requestJson('POST', '/api/v1/listings', {
    cookie: seller.cookie,
    csrf: seller.csrf,
    body: {
      title: 'نجدي لاختبار التزامن والحد الأقصى',
      description: 'عرض للاختبار المتزامن',
      priceAmount: 2100,
      breedId: store.breeds[0].id,
      regionId: store.regions[0].id,
    },
  });
  const listingId = created.json.listing.id as string;
  await requestJson('POST', `/api/v1/admin/listings/${listingId}/approve`, {
    cookie: admin.cookie,
    csrf: admin.csrf,
  });

  // 10 parallel idempotent PUT /like calls from the SAME user -> count must equal 1
  const singleUser = await registerAccount('مستخدم متكرر متزامن', 'buyer');
  const sameUserConcurrent = await Promise.all(
    Array.from({ length: 10 }, () =>
      requestJson('PUT', `/api/v1/listings/${listingId}/like`, {
        cookie: singleUser.cookie,
        csrf: singleUser.csrf,
      })
    )
  );
  for (const r of sameUserConcurrent) {
    assert.equal(r.status, 200);
    assert.equal(r.json.likesCount, 1);
    assert.equal(r.json.isLiked, true);
  }

  // 5 distinct users concurrently like the same listing -> total likesCount must equal 1 + 5 = 6
  const fiveUsers = await Promise.all(
    Array.from({ length: 5 }, (_, idx) => registerAccount(`مستخدم متزامن ${idx + 1}`, 'buyer'))
  );
  const multiUserResults = await Promise.all(
    fiveUsers.map((u) =>
      requestJson('PUT', `/api/v1/listings/${listingId}/like`, {
        cookie: u.cookie,
        csrf: u.csrf,
      })
    )
  );
  for (const r of multiUserResults) {
    assert.equal(r.status, 200);
    assert.equal(r.json.isLiked, true);
  }

  const finalCheck = await requestJson('GET', `/api/v1/listings/${listingId}/likes`);
  assert.equal(finalCheck.status, 200);
  assert.equal(finalCheck.json.likesCount, 6);

  // Rate limiting triggers 429 + Retry-After after 30 toggles by one user
  const limiterUser = await registerAccount('مستخدم اختبار المعدل', 'buyer');
  for (let i = 0; i < 30; i += 1) {
    const res = await requestJson('POST', `/api/v1/listings/${listingId}/like`, {
      cookie: limiterUser.cookie,
      csrf: limiterUser.csrf,
    });
    assert.equal(res.status, 200);
  }
  const blocked = await requestJson('POST', `/api/v1/listings/${listingId}/like`, {
    cookie: limiterUser.cookie,
    csrf: limiterUser.csrf,
  });
  assert.equal(blocked.status, 429);
  assert.ok(blocked.headers['retry-after']);
});
