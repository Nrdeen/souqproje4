import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../server.ts';
import { GoogleAuthError, type GoogleIdTokenVerifier, type VerifiedGoogleClaims } from '../../server/auth/google';

const ORIGIN = 'http://souq.test';
const GOOGLE_CLIENT_ID = 'integration-test-client.apps.googleusercontent.com';

let srv: Awaited<ReturnType<typeof startServer>>;
let unconfiguredSrv: Awaited<ReturnType<typeof startServer>>;
let dataDir: string;
let unconfiguredDir: string;

const tokenRegistry = new Map<string, VerifiedGoogleClaims | Error>();

const mockVerifyGoogleIdToken: GoogleIdTokenVerifier = async ({ idToken, clientId }) => {
  assert.equal(clientId, GOOGLE_CLIENT_ID);
  if (!idToken || !idToken.trim()) {
    throw new GoogleAuthError(400, 'لم يتم استلام رمز التحقق من Google', 'missing_credential');
  }
  const entry = tokenRegistry.get(idToken);
  if (!entry) {
    throw new GoogleAuthError(401, 'رمز التحقق من Google غير صالح', 'invalid_google_token');
  }
  if (entry instanceof Error) {
    throw entry;
  }
  return entry;
};

interface Res {
  status: number;
  headers: http.IncomingHttpHeaders;
  json: any;
  raw: string;
}

function requestOn(
  port: number,
  method: string,
  url: string,
  opts: { cookie?: string; csrf?: string; origin?: string | null; body?: unknown } = {}
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

    const req = http.request({ host: '127.0.0.1', port, path: url, method, headers }, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        let json: any = null;
        try {
          json = raw ? JSON.parse(raw) : null;
        } catch {
          json = null;
        }
        resolve({ status: res.statusCode || 0, headers: res.headers, json, raw });
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

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-int-google-'));
  unconfiguredDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-int-google-unconf-'));

  srv = await startServer({
    serveFrontend: false,
    config: {
      port: 0,
      dataDir,
      allowedOrigins: [ORIGIN],
      csrfSecret: 'integration-google-secret-at-least-32-chars',
      demoAccounts: false,
      googleClientId: GOOGLE_CLIENT_ID,
      googleClientSecret: 'server-secret-never-exposed',
    },
    verifyGoogleIdToken: mockVerifyGoogleIdToken,
  });

  unconfiguredSrv = await startServer({
    serveFrontend: false,
    config: {
      port: 0,
      dataDir: unconfiguredDir,
      allowedOrigins: [ORIGIN],
      csrfSecret: 'unconfigured-google-secret-32-chars!!',
      demoAccounts: false,
    },
  });
});

after(async () => {
  await srv.close();
  await unconfiguredSrv.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(unconfiguredDir, { recursive: true, force: true });
});

test('Public config & bootstrap expose Google Client ID safely and never leak Client Secret', async () => {
  const cfg = await requestOn(srv.port, 'GET', '/api/v1/auth/google/config');
  assert.equal(cfg.status, 200);
  assert.equal(cfg.json.enabled, true);
  assert.equal(cfg.json.clientId, GOOGLE_CLIENT_ID);
  assert.equal(cfg.json.codeFlowEnabled, true);
  assert.equal('clientSecret' in cfg.json, false);
  assert.equal(JSON.stringify(cfg.json).includes('server-secret-never-exposed'), false);

  const boot = await requestOn(srv.port, 'GET', '/api/v1/bootstrap');
  assert.equal(boot.status, 200);
  assert.equal(boot.json.googleAuth.enabled, true);
  assert.equal(boot.json.googleAuth.clientId, GOOGLE_CLIENT_ID);
  assert.equal(JSON.stringify(boot.json).includes('server-secret-never-exposed'), false);

  const urlRes = await requestOn(srv.port, 'GET', '/api/v1/auth/google/url?role=seller&mode=register');
  assert.equal(urlRes.status, 200);
  assert.match(urlRes.json.url, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/);

  // Unconfigured server fails cleanly with 503
  const disabledCfg = await requestOn(unconfiguredSrv.port, 'GET', '/api/v1/auth/google/config');
  assert.equal(disabledCfg.status, 200);
  assert.equal(disabledCfg.json.enabled, false);
  assert.equal(disabledCfg.json.clientId, null);

  const disabledPost = await requestOn(unconfiguredSrv.port, 'POST', '/api/v1/auth/google', {
    body: { credential: 'tok' },
  });
  assert.equal(disabledPost.status, 503);
  assert.equal(disabledPost.json.code, 'google_not_configured');
});

test('Google Sign-Up, returning login without duplicate, profile completion, and phone-gated permissions', async () => {
  tokenRegistry.set('tok-first-seller', {
    sub: 'sub-first-seller-9001',
    email: 'nasser.muraah@example.com',
    emailVerified: true,
    name: 'ناصر الحربي',
  });

  // Origin check enforced on Google endpoint
  const badOrigin = await requestOn(srv.port, 'POST', '/api/v1/auth/google', {
    origin: 'https://evil.example',
    body: { credential: 'tok-first-seller', role: 'seller', mode: 'register' },
  });
  assert.equal(badOrigin.status, 403);
  assert.equal(badOrigin.json.code, 'bad_origin');

  // First-time sign-up -> 201 + session cookie + CSRF + needsProfileCompletion
  const signUpRes = await requestOn(srv.port, 'POST', '/api/v1/auth/google', {
    body: { credential: 'tok-first-seller', role: 'seller', mode: 'register' },
  });
  assert.equal(signUpRes.status, 201);
  assert.equal(signUpRes.json.isNewUser, true);
  assert.equal(signUpRes.json.needsProfileCompletion, true);
  assert.equal(signUpRes.json.user.phone, null);
  assert.equal(signUpRes.json.user.phoneVerified, false);
  assert.equal(signUpRes.json.user.googleLinked, true);
  assert.equal(signUpRes.json.user.hasPassword, false);
  assert.equal(signUpRes.json.user.role, 'seller');

  const cookie = cookieFrom(signUpRes);
  const csrf = signUpRes.json.csrfToken as string;
  assert.ok(cookie.includes('sid='));
  assert.ok(csrf);

  // User can browse published listings immediately without a phone number
  const browseRes = await requestOn(srv.port, 'GET', '/api/v1/listings?status=Published', { cookie });
  assert.equal(browseRes.status, 200);

  // Creating a listing before adding phone is rejected (403 phone_required)
  const store = srv.getStore();
  const blockedListing = await requestOn(srv.port, 'POST', '/api/v1/listings', {
    cookie,
    csrf,
    body: {
      title: 'حري قبل الجوال',
      priceAmount: 1500,
      breedId: store.breeds[0].id,
      categoryId: store.categories[0].id,
      regionId: store.regions[0].id,
      city: 'الرياض',
      ageMonths: 6,
      weightKg: 38,
      quantity: 1,
      sex: 'ذكر',
      description: 'وصف اختباري',
    },
  });
  assert.equal(blockedListing.status, 403);
  assert.equal(blockedListing.json.code, 'phone_required');

  // Requesting seller verification without phone also rejected cleanly
  const blockedVerif = await requestOn(srv.port, 'POST', '/api/v1/seller/verification/request', {
    cookie,
    csrf,
  });
  assert.equal(blockedVerif.status, 403);
  assert.equal(blockedVerif.json.code, 'phone_required');

  // Completing profile without CSRF fails (403 bad_csrf)
  const noCsrfComplete = await requestOn(srv.port, 'POST', '/api/v1/auth/complete-profile', {
    cookie,
    body: { phone: '0502223344' },
  });
  assert.equal(noCsrfComplete.status, 403);
  assert.equal(noCsrfComplete.json.code, 'bad_csrf');

  // Invalid phone rejected
  const badPhoneComplete = await requestOn(srv.port, 'POST', '/api/v1/auth/complete-profile', {
    cookie,
    csrf,
    body: { phone: '12345' },
  });
  assert.equal(badPhoneComplete.status, 400);
  assert.equal(badPhoneComplete.json.code, 'invalid_phone');

  // Valid Saudi phone completes profile without faking phone verification
  const completeRes = await requestOn(srv.port, 'POST', '/api/v1/auth/complete-profile', {
    cookie,
    csrf,
    body: { phone: '+966502223344', name: 'مراح ناصر الحربي' },
  });
  assert.equal(completeRes.status, 200);
  assert.equal(completeRes.json.needsProfileCompletion, false);
  assert.equal(completeRes.json.user.phone, '0502223344');
  assert.equal(completeRes.json.user.phoneVerified, false);

  // Phone-gated listing creation now succeeds
  const allowedListing = await requestOn(srv.port, 'POST', '/api/v1/listings', {
    cookie,
    csrf,
    body: {
      title: 'حري بعد إكمال البيانات',
      priceAmount: 1500,
      breedId: store.breeds[0].id,
      categoryId: store.categories[0].id,
      regionId: store.regions[0].id,
      city: 'الرياض',
      ageMonths: 6,
      weightKg: 38,
      quantity: 1,
      sex: 'ذكر',
      description: 'مواصفات كاملة بعد إضافة رقم الجوال',
    },
  });
  assert.equal(allowedListing.status, 201);

  // Logout clears session cleanly
  const logoutRes = await requestOn(srv.port, 'POST', '/api/v1/auth/logout', { cookie, csrf });
  assert.equal(logoutRes.status, 200);

  // Returning Google user reuses exact same userId (200, isNewUser=false)
  const returningRes = await requestOn(srv.port, 'POST', '/api/v1/auth/google', {
    body: { credential: 'tok-first-seller', mode: 'login' },
  });
  assert.equal(returningRes.status, 200);
  assert.equal(returningRes.json.isNewUser, false);
  assert.equal(returningRes.json.needsProfileCompletion, false);
  assert.equal(returningRes.json.user.id, signUpRes.json.user.id);
});

test('Error handling: invalid/expired tokens, missing profile claims, network failures, suspended accounts, OAuth cancellation', async () => {
  tokenRegistry.set('tok-expired', new GoogleAuthError(401, 'انتهت صلاحية جلسة التحقق من Google، يرجى المحاولة مرة أخرى', 'expired_google_token'));
  tokenRegistry.set('tok-wrong-aud', new GoogleAuthError(401, 'تعذر مطابقة تطبيق Google المصرح به لهذه المنصة', 'invalid_audience'));
  tokenRegistry.set('tok-network', new GoogleAuthError(503, 'تعذر الوصول إلى خوادم التحقق من Google حالياً، حاول مرة أخرى بعد قليل', 'google_verification_unavailable'));
  tokenRegistry.set('tok-missing', new GoogleAuthError(400, 'حساب Google لا يوفر بيانات التعريف أو البريد الإلكتروني المطلوبة', 'missing_profile_claims'));

  const resInvalid = await requestOn(srv.port, 'POST', '/api/v1/auth/google', { body: { credential: 'unknown-jwt' } });
  assert.equal(resInvalid.status, 401);
  assert.equal(resInvalid.json.code, 'invalid_google_token');

  const resExpired = await requestOn(srv.port, 'POST', '/api/v1/auth/google', { body: { credential: 'tok-expired' } });
  assert.equal(resExpired.status, 401);
  assert.equal(resExpired.json.code, 'expired_google_token');

  const resAud = await requestOn(srv.port, 'POST', '/api/v1/auth/google', { body: { credential: 'tok-wrong-aud' } });
  assert.equal(resAud.status, 401);
  assert.equal(resAud.json.code, 'invalid_audience');

  const resNet = await requestOn(srv.port, 'POST', '/api/v1/auth/google', { body: { credential: 'tok-network' } });
  assert.equal(resNet.status, 503);
  assert.equal(resNet.json.code, 'google_verification_unavailable');

  const resMissing = await requestOn(srv.port, 'POST', '/api/v1/auth/google', { body: { credential: 'tok-missing' } });
  assert.equal(resMissing.status, 400);
  assert.equal(resMissing.json.code, 'missing_profile_claims');

  // Suspended user refused
  tokenRegistry.set('tok-suspended', {
    sub: 'sub-suspended-1',
    email: 'suspended.g@example.com',
    emailVerified: true,
    name: 'حساب موقوف',
  });
  const createdSusp = await requestOn(srv.port, 'POST', '/api/v1/auth/google', {
    body: { credential: 'tok-suspended' },
  });
  assert.equal(createdSusp.status, 201);
  const storeUser = srv.getStore().users.find((u) => u.id === createdSusp.json.user.id);
  storeUser!.status = 'suspended';

  const blockedSusp = await requestOn(srv.port, 'POST', '/api/v1/auth/google', {
    body: { credential: 'tok-suspended' },
  });
  assert.equal(blockedSusp.status, 403);
  assert.equal(blockedSusp.json.code, 'account_suspended');

  // OAuth callback cancellation page handles access_denied cleanly under CSP-safe external script
  const cancelCallback = await requestOn(srv.port, 'GET', '/api/v1/auth/google/callback?error=access_denied');
  assert.equal(cancelCallback.status, 400);
  assert.equal(cancelCallback.headers['cross-origin-opener-policy'], 'same-origin-allow-popups');
  assert.match(cancelCallback.raw, /google_canceled/);
  assert.match(cancelCallback.raw, /\/api\/v1\/auth\/google\/callback\.js/);

  const callbackScript = await requestOn(srv.port, 'GET', '/api/v1/auth/google/callback.js');
  assert.equal(callbackScript.status, 200);
  assert.match(callbackScript.raw, /postMessage/);
});

test('Account-linking security: prevents auto-linking by email and requires proof of ownership; existing password login preserved', async () => {
  const password = 'strong-marketplace-password-99';
  const phone = '0507778899';
  const reg = await requestOn(srv.port, 'POST', '/api/v1/auth/register', {
    body: { name: 'سالم العنزي', phone, password, role: 'buyer' },
  });
  assert.equal(reg.status, 201);

  const existingUserId = reg.json.user.id;
  const userInStore = srv.getStore().users.find((u) => u.id === existingUserId);
  userInStore!.email = 'salem.owner@example.com';

  // Existing phone/password login continues working normally
  const phoneLogin = await requestOn(srv.port, 'POST', '/api/v1/auth/login', {
    body: { phone, password },
  });
  assert.equal(phoneLogin.status, 200);
  const dashCookie = cookieFrom(phoneLogin);
  const dashCsrf = phoneLogin.json.csrfToken as string;

  tokenRegistry.set('tok-salem-collision', {
    sub: 'sub-salem-555',
    email: 'salem.owner@example.com',
    emailVerified: true,
    name: 'Salem Google',
  });

  // Attempting Google sign-in with matching email MUST return 409 account_exists_link_required and no cookie
  const collisionRes = await requestOn(srv.port, 'POST', '/api/v1/auth/google', {
    body: { credential: 'tok-salem-collision', mode: 'login' },
  });
  assert.equal(collisionRes.status, 409);
  assert.equal(collisionRes.json.code, 'account_exists_link_required');
  assert.equal(cookieFrom(collisionRes), '');

  // Linking with wrong password fails (401)
  const wrongPwLink = await requestOn(srv.port, 'POST', '/api/v1/auth/google/link-with-password', {
    body: { phone, password: 'wrong-password-123', credential: 'tok-salem-collision' },
  });
  assert.equal(wrongPwLink.status, 401);

  // Authenticated /google/link without current password fails (401 password_proof_required)
  const missingDashPw = await requestOn(srv.port, 'POST', '/api/v1/auth/google/link', {
    cookie: dashCookie,
    csrf: dashCsrf,
    body: { credential: 'tok-salem-collision' },
  });
  assert.equal(missingDashPw.status, 401);
  assert.equal(missingDashPw.json.code, 'password_proof_required');

  // Linking with valid phone + password proof succeeds -> 200 and attaches to existing user
  const validLink = await requestOn(srv.port, 'POST', '/api/v1/auth/google/link-with-password', {
    body: { phone, password, credential: 'tok-salem-collision' },
  });
  assert.equal(validLink.status, 200);
  assert.equal(validLink.json.linked, true);
  assert.equal(validLink.json.user.id, existingUserId);
  assert.equal(validLink.json.user.googleLinked, true);
  assert.equal(validLink.json.user.hasPassword, true);
  assert.ok(cookieFrom(validLink).includes('sid='));

  // Subsequent Google login now signs straight into existingUserId
  const postLinkGoogleLogin = await requestOn(srv.port, 'POST', '/api/v1/auth/google', {
    body: { credential: 'tok-salem-collision', mode: 'login' },
  });
  assert.equal(postLinkGoogleLogin.status, 200);
  assert.equal(postLinkGoogleLogin.json.isNewUser, false);
  assert.equal(postLinkGoogleLogin.json.user.id, existingUserId);

  // Both Google AND phone/password login work cleanly side-by-side
  const postLinkPhoneLogin = await requestOn(srv.port, 'POST', '/api/v1/auth/login', {
    body: { phone, password },
  });
  assert.equal(postLinkPhoneLogin.status, 200);
  assert.equal(postLinkPhoneLogin.json.user.id, existingUserId);
});

test('Rate limiting protects /api/v1/auth/google against excessive bursts', async () => {
  const rateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-int-google-rl-'));
  const limitedSrv = await startServer({
    serveFrontend: false,
    config: {
      port: 0,
      dataDir: rateDir,
      allowedOrigins: [ORIGIN],
      csrfSecret: 'rate-limit-secret-32-chars-minimum',
      demoAccounts: false,
      googleClientId: GOOGLE_CLIENT_ID,
    },
    verifyGoogleIdToken: mockVerifyGoogleIdToken,
  });

  try {
    let got429 = false;
    for (let i = 0; i < 30; i++) {
      const r = await requestOn(limitedSrv.port, 'POST', '/api/v1/auth/google', {
        body: { credential: 'unknown-jwt' },
      });
      if (r.status === 429) {
        got429 = true;
        assert.equal(r.json.code, 'rate_limited');
        break;
      }
    }
    assert.equal(got429, true);
  } finally {
    await limitedSrv.close();
    fs.rmSync(rateDir, { recursive: true, force: true });
  }
});
