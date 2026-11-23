/**
 * End-to-end security tests: a real Express server + real WebSocket on an ephemeral port,
 * isolated data directory, real Argon2id hashing. Requires `npm install` (express, argon2, ws).
 */
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

interface Session {
  cookie: string;
  csrf: string;
  user: any;
  api: (method: string, url: string, body?: unknown, extra?: Partial<Opts>) => Promise<Res>;
}

function cookieFrom(res: Res): string {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] || [])[0] || '';
  return raw.split(';')[0];
}

let phoneCounter = 0;
const nextPhone = () => `05${String(70000000 + ++phoneCounter + Math.floor(Math.random() * 1000) * 100).slice(0, 8)}`;

async function register(name: string, role: 'buyer' | 'seller' = 'buyer'): Promise<Session & { phone: string }> {
  const phone = nextPhone();
  const res = await request('POST', '/api/v1/auth/register', { body: { name, phone, password: PASSWORD, role } });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return toSession(res, phone);
}

function toSession(res: Res, phone: string): Session & { phone: string } {
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

let adminSession: Promise<Session> | null = null;
function createAdmin(): Promise<Session> {
  adminSession ??= buildAdmin();
  return adminSession;
}

async function buildAdmin(): Promise<Session> {
  const store = srv.getStore();
  const phone = '0599999999';
  const user = { id: 'usr_test_admin', phone, email: 'a@test', name: 'Test Admin', role: 'admin', status: 'active', createdAt: new Date().toISOString(), phoneVerifiedAt: null };
  store.users.push(user);
  store.credentials.push({ userId: user.id, passwordHash: await hashPassword(PASSWORD), updatedAt: new Date().toISOString() });
  const res = await request('POST', '/api/v1/auth/login', { body: { phone, password: PASSWORD } });
  assert.equal(res.status, 200);
  return toSession(res, phone);
}

async function makeListing(seller: Session, title = 'نعيمي للبيع', extra: Record<string, unknown> = {}) {
  const store = srv.getStore();
  const res = await seller.api('POST', '/api/v1/listings', {
    title,
    priceAmount: 1500,
    breedId: store.breeds[0].id,
    regionId: store.regions[0].id,
    description: 'اختبار',
    ...extra,
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return res.json.listing as { id: string; status: string };
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-it-'));
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

// ------------------------------------------------------------------ unauthenticated access
test('visitors cannot reach protected operations, and x-user-id is ignored', async () => {
  const spoof = { headers: { 'x-user-id': 'usr_admin_1' } };
  const store = srv.getStore();
  const someListing = store.listings[0].id;
  const calls: Array<[string, string, unknown?]> = [
    ['POST', '/api/v1/listings', { title: 'x', priceAmount: 1, breedId: 'b', regionId: 'r' }],
    ['PATCH', `/api/v1/listings/${someListing}`, { title: 'hacked' }],
    ['POST', '/api/v1/favorites/toggle', { listingId: someListing }],
    ['POST', '/api/v1/conversations', { listingId: someListing, initialMessage: 'hi' }],
    ['POST', `/api/v1/listings/${someListing}/offers`, { offeredPrice: 10 }],
    ['POST', '/api/v1/reports', { listingId: someListing, reason: 'x' }],
    ['POST', '/api/v1/notifications/read-all'],
    ['POST', `/api/v1/admin/listings/${someListing}/approve`],
    ['POST', '/api/v1/admin/breeds', { name: 'x', categoryId: 'c' }],
    ['DELETE', '/api/v1/admin/categories/sub_x'],
  ];
  for (const [method, url, body] of calls) {
    const res = await request(method, url, { body, ...spoof });
    assert.equal(res.status, 401, `${method} ${url} -> ${res.status}`);
  }
  const boot = await request('GET', '/api/v1/bootstrap', spoof);
  assert.equal(boot.status, 200);
  assert.equal(boot.json.currentUser, null);
  assert.deepEqual(boot.json.reports, []);
  assert.deepEqual(boot.json.auditLogs, []);
});

// ------------------------------------------------------------------ authentication
test('login needs phone + password; userId / role / name in the body are ignored', async () => {
  const user = await register('مشتري اختبار');
  const byId = await request('POST', '/api/v1/auth/login', { body: { userId: 'usr_admin_1' } });
  assert.equal(byId.status, 400);
  const demo = await request('POST', '/api/v1/auth/login', { body: { userId: 'usr_admin_1', phone: '0500000001', password: PASSWORD, role: 'admin' } });
  assert.equal(demo.status, 401); // demo admin has no credentials
  assert.ok(!cookieFrom(demo));
  const wrong = await request('POST', '/api/v1/auth/login', { body: { phone: user.phone, password: 'wrong-password-1' } });
  assert.equal(wrong.status, 401);
  const unknown = await request('POST', '/api/v1/auth/login', { body: { phone: '0511111111', password: 'wrong-password-1' } });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.json.error, wrong.json.error); // no account enumeration
  const ok = await request('POST', '/api/v1/auth/login', { body: { phone: user.phone, password: PASSWORD, role: 'admin' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.user.role, 'buyer');
});

test('registration can never create an admin and stores an Argon2id hash only', async () => {
  const phone = nextPhone();
  const res = await request('POST', '/api/v1/auth/register', { body: { name: 'مهاجم', phone, password: PASSWORD, role: 'admin' } });
  assert.equal(res.status, 201);
  assert.notEqual(res.json.user.role, 'admin');
  const cred = srv.getStore().credentials.find((c) => c.userId === res.json.user.id)!;
  assert.match(cred.passwordHash, /^\$argon2id\$/);
  assert.ok(!JSON.stringify(res.json).includes(cred.passwordHash));
  const weak = await request('POST', '/api/v1/auth/register', { body: { name: 'x y', phone: nextPhone(), password: 'short' } });
  assert.equal(weak.status, 400);
  const dup = await request('POST', '/api/v1/auth/register', { body: { name: 'x y', phone, password: PASSWORD } });
  assert.equal(dup.status, 409);
});

test('session cookie is HttpOnly + SameSite; logout invalidates it server-side', async () => {
  const s = await register('جلسة');
  const setCookie = ([] as string[]).concat((await request('POST', '/api/v1/auth/login', { body: { phone: s.phone, password: PASSWORD } })).headers['set-cookie'] || []).join(';');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);

  assert.equal((await request('GET', '/api/v1/auth/me', { cookie: s.cookie })).json.user.id, s.user.id);
  const out = await s.api('POST', '/api/v1/auth/logout');
  assert.equal(out.status, 200);
  assert.match(([] as string[]).concat(out.headers['set-cookie'] || []).join(';'), /Max-Age=0/);
  // The old cookie value is dead even if an attacker kept a copy.
  assert.equal((await request('GET', '/api/v1/auth/me', { cookie: s.cookie })).json.user, null);
  assert.equal((await s.api('POST', '/api/v1/favorites/toggle', { listingId: 'x' })).status, 401);
});

test('sessions expire after the idle timeout', async () => {
  const shortDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-it2-'));
  const short = await startServer({
    serveFrontend: false,
    env: { NODE_ENV: 'test' },
    config: { port: 0, dataDir: shortDataDir, allowedOrigins: [ORIGIN], sessionIdleMs: 300, registerMaxPerHour: 10_000 },
  });
  const original = srv;
  srv = short;
  try {
    const s = await register('منتهي');
    assert.equal((await request('GET', '/api/v1/auth/me', { cookie: s.cookie })).json.user.id, s.user.id);
    await new Promise((r) => setTimeout(r, 450));
    assert.equal((await request('GET', '/api/v1/auth/me', { cookie: s.cookie })).json.user, null);
  } finally {
    srv = original;
    await short.close();
    fs.rmSync(shortDataDir, { recursive: true, force: true });
  }
});

test('login is rate limited (per phone) and the lock holds even for the right password', async () => {
  const s = await register('محاولات');
  let last: Res | null = null;
  for (let i = 0; i < 5; i++) {
    last = await request('POST', '/api/v1/auth/login', { body: { phone: s.phone, password: `wrong-password-${i}` } });
    assert.equal(last.status, 401);
  }
  last = await request('POST', '/api/v1/auth/login', { body: { phone: s.phone, password: `wrong-password-x` } });
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers['retry-after']) > 0);
  const right = await request('POST', '/api/v1/auth/login', { body: { phone: s.phone, password: PASSWORD } });
  assert.equal(right.status, 429);
});

// ------------------------------------------------------------------ CSRF / origin
test('state-changing requests need a valid CSRF token and an allowed Origin', async () => {
  const s = await register('csrf');
  const body = { listingId: srv.getStore().listings[0].id };
  assert.equal((await request('POST', '/api/v1/favorites/toggle', { cookie: s.cookie, body })).status, 403); // no token
  const bad = await request('POST', '/api/v1/favorites/toggle', { cookie: s.cookie, csrf: 'forged-token', body });
  assert.equal(bad.status, 403);
  assert.equal(bad.json.code, 'bad_csrf');
  const evil = await request('POST', '/api/v1/favorites/toggle', { cookie: s.cookie, csrf: s.csrf, body, origin: 'http://evil.test' });
  assert.equal(evil.status, 403);
  assert.equal(evil.json.code, 'bad_origin');
  assert.equal((await request('POST', '/api/v1/favorites/toggle', { cookie: s.cookie, csrf: s.csrf, body, origin: null })).status, 403);
  assert.equal((await request('POST', '/api/v1/favorites/toggle', { cookie: s.cookie, csrf: s.csrf, body })).status, 200);

  // A token minted for another session is useless.
  const other = await register('csrf2');
  assert.equal((await request('POST', '/api/v1/favorites/toggle', { cookie: s.cookie, csrf: other.csrf, body })).status, 403);
  // Login/register are also protected by the Origin check.
  assert.equal((await request('POST', '/api/v1/auth/login', { origin: 'http://evil.test', body: { phone: s.phone, password: PASSWORD } })).status, 403);
});

// ------------------------------------------------------------------ authorization
test('a seller cannot edit another seller’s listing; owner and admin can', async () => {
  const a = await register('بائع أ', 'seller');
  const b = await register('بائع ب', 'seller');
  const admin = await createAdmin();
  const listing = await makeListing(a);

  assert.equal((await b.api('PATCH', `/api/v1/listings/${listing.id}`, { title: 'hacked' })).status, 403);
  assert.equal((await b.api('PATCH', `/api/v1/listings/${listing.id}`, { status: 'Sold' })).status, 403);
  assert.equal((await a.api('PATCH', `/api/v1/listings/${listing.id}`, { title: 'عنواني الجديد' })).status, 200);
  assert.equal((await admin.api('PATCH', `/api/v1/listings/${listing.id}`, { description: 'مراجعة' })).status, 200);

  // Pending listings are invisible to everyone else (404, not a leak).
  assert.equal((await request('GET', `/api/v1/listings/${listing.id}`)).status, 404);
  assert.equal((await b.api('GET', `/api/v1/listings/${listing.id}`)).status, 404);
  assert.equal((await a.api('GET', `/api/v1/listings/${listing.id}`)).status, 200);
  const anonPending = await request('GET', '/api/v1/listings?status=Pending');
  assert.ok(!anonPending.json.listings.some((l: any) => l.id === listing.id));
});

test('a buyer or seller cannot perform admin operations; an admin can', async () => {
  const buyer = await register('مشتري');
  const seller = await register('بائع', 'seller');
  const admin = await createAdmin();
  const listing = await makeListing(seller);
  const calls: Array<[string, string, unknown?]> = [
    ['POST', `/api/v1/admin/listings/${listing.id}/approve`],
    ['POST', `/api/v1/admin/listings/${listing.id}/reject`, { reason: 'x' }],
    ['POST', '/api/v1/admin/breeds', { name: 'سلالة', categoryId: 'cat_sheep' }],
    ['POST', '/api/v1/admin/categories', { name: 'فئة' }],
    ['POST', '/api/v1/admin/listings/auto-categorize', {}],
  ];
  for (const who of [buyer, seller]) {
    for (const [m, u, b] of calls) assert.equal((await who.api(m, u, b)).status, 403, `${m} ${u}`);
  }
  assert.equal((await admin.api('POST', `/api/v1/admin/listings/${listing.id}/approve`)).status, 200);
  assert.equal((await request('GET', `/api/v1/listings/${listing.id}`)).status, 200); // now public
});

test('conversations, offers and notifications are private to their owners', async () => {
  const seller = await register('بائع خاص', 'seller');
  const buyer = await register('مشتري خاص');
  const stranger = await register('غريب', 'seller');
  const admin = await createAdmin();
  // Offers are only accepted on listings that opt in (this mirrors the UI default).
  const listing = await makeListing(seller, 'نعيمي للبيع', { isNegotiable: true, allowPriceOffers: true });
  await admin.api('POST', `/api/v1/admin/listings/${listing.id}/approve`);

  // A final-price listing must keep rejecting offers (input validation stays strict).
  const finalPrice = await makeListing(seller, 'سعر نهائي', { isNegotiable: false, allowPriceOffers: false });
  await admin.api('POST', `/api/v1/admin/listings/${finalPrice.id}/approve`);
  assert.equal((await buyer.api('POST', `/api/v1/listings/${finalPrice.id}/offers`, { offeredPrice: 1000, quantity: 1 })).status, 400);

  const conv = await buyer.api('POST', '/api/v1/conversations', { listingId: listing.id, initialMessage: 'رسالة سرية' });
  assert.equal(conv.status, 200);
  const convId = conv.json.conversation.id;
  assert.equal((await buyer.api('POST', `/api/v1/listings/${listing.id}/offers`, { offeredPrice: 1000, quantity: 1 })).status, 201);

  assert.equal((await stranger.api('POST', `/api/v1/conversations/${convId}/messages`, { body: 'تطفل' })).status, 403);
  assert.equal((await admin.api('POST', `/api/v1/conversations/${convId}/messages`, { body: 'تطفل' })).status, 403);
  assert.equal((await seller.api('POST', `/api/v1/conversations/${convId}/messages`, { body: 'أهلاً' })).status, 201);

  for (const outsider of [stranger, admin]) {
    const boot = await outsider.api('GET', '/api/v1/bootstrap');
    assert.ok(!boot.json.conversations.some((c: any) => c.id === convId), 'conversation leaked');
    assert.ok(!JSON.stringify(boot.json.notifications).includes('رسالة سرية'), 'notification leaked');
  }
  const strangerBoot = await stranger.api('GET', '/api/v1/bootstrap');
  assert.equal(strangerBoot.json.priceOffers.length, 0);
  const sellerBoot = await seller.api('GET', '/api/v1/bootstrap');
  assert.equal(sellerBoot.json.conversations.length, 1);
  assert.equal(sellerBoot.json.priceOffers.length, 1);

  // Only the listing's seller (or admin) may answer an offer.
  const offerId = sellerBoot.json.priceOffers[0].id;
  assert.equal((await stranger.api('POST', `/api/v1/offers/${offerId}/respond`, { status: 'accepted' })).status, 403);
  assert.equal((await buyer.api('POST', `/api/v1/offers/${offerId}/respond`, { status: 'accepted' })).status, 403);
  assert.equal((await seller.api('POST', `/api/v1/offers/${offerId}/respond`, { status: 'accepted' })).status, 200);

  // Marking someone else's notification as read does nothing to it.
  const buyerNotif = (await buyer.api('GET', '/api/v1/bootstrap')).json.notifications[0];
  await stranger.api('POST', `/api/v1/notifications/${buyerNotif.id}/read`);
  const after = (await buyer.api('GET', '/api/v1/bootstrap')).json.notifications.find((n: any) => n.id === buyerNotif.id);
  assert.equal(after.read, false);
});

// ------------------------------------------------------------------ data exposure
test('bootstrap does not expose users, hashes, sellerReviews, or bulk seller contact details', async () => {
  const anon = await request('GET', '/api/v1/bootstrap');
  const text = JSON.stringify(anon.json);
  assert.equal(anon.json.users, undefined);
  assert.equal(anon.json.sellerReviews, undefined);
  assert.ok(!/passwordHash|credentials|argon2/i.test(text));
  assert.ok(!text.includes('@souqalghanam.sa'));
  for (const s of anon.json.sellers) {
    assert.equal(s.phone, undefined);
    assert.equal(s.whatsapp, undefined);
    assert.equal(typeof s.contactAvailable, 'boolean');
  }
  assert.equal(anon.headers['cache-control'], 'no-store');

  const user = await register('زائر مسجل');
  const boot = await user.api('GET', '/api/v1/bootstrap');
  assert.equal(boot.json.sellerReviews, undefined);
  assert.ok(
    boot.json.sellers.every(
      (s: any) => s.phone === undefined && s.whatsapp === undefined && typeof s.contactAvailable === 'boolean'
    )
  );
  assert.equal(boot.json.users, undefined);
  assert.equal(boot.json.currentUser.id, user.user.id);
  assert.ok(!/passwordHash/.test(JSON.stringify(boot.json)));
});

// ------------------------------------------------------------------ websocket
function openSocket(opts: { cookie?: string; origin?: string | null; path?: string }) {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers['Cookie'] = opts.cookie;
  if (opts.origin !== null) headers['Origin'] = opts.origin ?? ORIGIN;
  const ws = new WebSocket(`ws://127.0.0.1:${srv.port}${opts.path ?? '/ws'}`, { headers });
  const messages: any[] = [];
  ws.on('message', (d) => messages.push(JSON.parse(String(d))));
  return { ws, messages };
}
const opened = (ws: WebSocket) => new Promise<void>((res, rej) => { ws.once('open', () => res()); ws.once('error', rej); });
const rejected = (ws: WebSocket) => new Promise<string>((res) => { ws.once('unexpected-response', (_q, r) => res(String(r.statusCode))); ws.once('open', () => res('open')); ws.once('error', () => res('error')); });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('websocket: rejects missing session and foreign origins; ignores identity claims', async () => {
  assert.equal(await rejected(openSocket({}).ws), '401');
  const s = await register('ويب سوكت');
  assert.equal(await rejected(openSocket({ cookie: s.cookie, origin: 'http://evil.test' }).ws), '403');
  assert.equal(await rejected(openSocket({ cookie: s.cookie, origin: null }).ws), '403');
  assert.equal(await rejected(openSocket({ cookie: 'sid=forged-forged-forged-forged-forged' }).ws), '401');
  // The old ?userId= trick no longer authenticates anybody.
  assert.equal(await rejected(openSocket({ path: '/ws?userId=usr_buyer_1' }).ws), '401');
});

test('websocket: events reach only their owner, identity cannot be switched, logout closes the socket', async () => {
  const victim = await register('ضحية');
  const attacker = await register('مهاجم ويب');
  const seller = await register('بائع ويب', 'seller');
  const admin = await createAdmin();
  const listing = await makeListing(seller);
  await admin.api('POST', `/api/v1/admin/listings/${listing.id}/approve`);

  const v = openSocket({ cookie: victim.cookie });
  const a = openSocket({ cookie: attacker.cookie });
  await Promise.all([opened(v.ws), opened(a.ws)]);
  // Attacker tries to take over the victim's identity by claiming it over the socket.
  a.ws.send(JSON.stringify({ type: 'auth', userId: victim.user.id }));
  await wait(100);

  await victim.api('POST', '/api/v1/conversations', { listingId: listing.id, initialMessage: 'اهتمام' });
  const sellerSocket = openSocket({ cookie: seller.cookie });
  await opened(sellerSocket.ws);
  await seller.api('POST', `/api/v1/conversations/${(await seller.api('GET', '/api/v1/bootstrap')).json.conversations[0].id}/messages`, { body: 'رد خاص بالضحية' });
  await wait(200);

  const victimGot = JSON.stringify(v.messages);
  const attackerGot = JSON.stringify(a.messages);
  assert.ok(victimGot.includes('رد خاص بالضحية'), 'victim should receive own notification');
  assert.ok(!attackerGot.includes('رد خاص بالضحية'), 'attacker must not receive victim data');
  assert.equal(a.messages[0].type, 'notifications:init');
  assert.deepEqual(a.messages[0].notifications, []);

  const closed = new Promise<number>((res) => v.ws.once('close', (code) => res(code)));
  await victim.api('POST', '/api/v1/auth/logout');
  assert.equal(await closed, 4401);
  a.ws.close();
  sellerSocket.ws.close();
});
