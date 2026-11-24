import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type http from 'node:http';
import express from 'express';
import {
  buildFacebookOAuthUrl,
  computeFacebookAppSecretProof,
  createSignedFacebookLinkToken,
  createSignedFacebookOAuthState,
  exchangeFacebookCodeForClaims,
  FacebookAuthError,
  normalizeFacebookGraphProfile,
  verifySignedFacebookLinkToken,
  verifySignedFacebookOAuthState,
} from '../../server/auth/facebook';
import { hashPassword } from '../../server/auth/password';
import { createAuthRouter } from '../../server/auth/routes';
import { toSelfUser } from '../../server/auth/serialize';
import { loadConfig } from '../../server/config';
import { createSeedData, makeStorePaths, RepositoryError } from '../../server/domain/marketplace';
import { JsonMarketplaceRepository } from '../../server/repositories/jsonRepository';
import { prepareMigrationSnapshot } from '../../scripts/migrate-json-to-pg';

const FB_APP_ID = '123456789012345';
const FB_APP_SECRET = 'fb_test_secret_value_0123456789abcdef';

test('Facebook OAuth helpers sign/verify state & link tokens, build URLs, and normalize profiles safely', async () => {
  const secret = 'k'.repeat(48);

  // State signing & verification
  const state = createSignedFacebookOAuthState(
    { nonce: 'nonce-fb-1', role: 'seller', mode: 'register', intent: 'auth' },
    secret,
    60_000
  );
  const decodedState = verifySignedFacebookOAuthState(state, secret);
  assert.equal(decodedState.nonce, 'nonce-fb-1');
  assert.equal(decodedState.role, 'seller');
  assert.equal(decodedState.mode, 'register');
  assert.equal(decodedState.intent, 'auth');

  // Tampered state rejected
  const [statePayload] = state.split('.');
  assert.throws(
    () => verifySignedFacebookOAuthState(`${statePayload}.bad-sig`, secret),
    (err: any) => err instanceof FacebookAuthError && err.code === 'invalid_oauth_state'
  );

  // Expired state rejected
  const expiredState = createSignedFacebookOAuthState(
    { nonce: 'n2', role: 'buyer', mode: 'login', intent: 'auth' },
    secret,
    -500
  );
  assert.throws(
    () => verifySignedFacebookOAuthState(expiredState, secret),
    (err: any) => err instanceof FacebookAuthError && err.code === 'expired_oauth_state'
  );

  // Link token signing & verification
  const linkToken = createSignedFacebookLinkToken(
    {
      sub: 'fb-user-99',
      email: 'Nasser@Example.com',
      emailVerified: true,
      name: 'ناصر الحربي',
      picture: 'https://graph.facebook.com/fb-user-99/picture',
    },
    secret,
    60_000
  );
  const claims = verifySignedFacebookLinkToken(linkToken, secret);
  assert.equal(claims.sub, 'fb-user-99');
  assert.equal(claims.email, 'nasser@example.com');
  assert.equal(claims.name, 'ناصر الحربي');

  // Tampered link token rejected
  assert.throws(
    () => verifySignedFacebookLinkToken(`${linkToken}x`, secret),
    (err: any) => err instanceof FacebookAuthError && err.code === 'invalid_link_token'
  );

  // OAuth URL builder
  const authUrl = new URL(
    buildFacebookOAuthUrl({
      appId: FB_APP_ID,
      redirectUri: 'https://example.com/api/v1/auth/facebook/callback',
      state,
    })
  );
  assert.equal(authUrl.origin, 'https://www.facebook.com');
  assert.equal(authUrl.searchParams.get('client_id'), FB_APP_ID);
  assert.equal(authUrl.searchParams.get('scope'), 'email,public_profile');
  assert.equal(authUrl.searchParams.get('response_type'), 'code');

  // Profile normalization strips insecure picture URLs & falls back safely
  const normalized = normalizeFacebookGraphProfile({
    id: 'fb-100',
    email: 'Fahad@Example.COM',
    name: 'فهد الشمري',
    picture: { data: { url: 'http://insecure.fbcdn.net/pic.jpg' } },
  });
  assert.equal(normalized.sub, 'fb-100');
  assert.equal(normalized.email, 'fahad@example.com');
  assert.equal(normalized.emailVerified, true);
  assert.equal(normalized.picture, undefined);

  assert.throws(
    () => normalizeFacebookGraphProfile({ name: 'No Id' }),
    (err: any) => err instanceof FacebookAuthError && err.code === 'missing_profile_claims'
  );

  // Code exchange verifies debug_token + appsecret_proof
  const expectedProof = computeFacebookAppSecretProof('fb-access-tok', FB_APP_SECRET);
  let sawProof = '';
  const exchanged = await exchangeFacebookCodeForClaims({
    code: 'auth-code-123',
    appId: FB_APP_ID,
    appSecret: FB_APP_SECRET,
    redirectUri: 'https://example.com/api/v1/auth/facebook/callback',
    fetchImpl: (async (input: RequestInfo | URL) => {
      const target = String(input);
      if (target.includes('/oauth/access_token')) {
        return new Response(JSON.stringify({ access_token: 'fb-access-tok' }), { status: 200 });
      }
      if (target.includes('/debug_token')) {
        return new Response(
          JSON.stringify({ data: { is_valid: true, app_id: FB_APP_ID } }),
          { status: 200 }
        );
      }
      if (target.includes('/me')) {
        sawProof = new URL(target).searchParams.get('appsecret_proof') || '';
        return new Response(
          JSON.stringify({
            id: 'fb-graph-77',
            name: 'سلمان القحطاني',
            email: 'salman@example.com',
            picture: { data: { url: 'https://platform-lookaside.fbsbx.com/pic.jpg' } },
          }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch,
  });
  assert.equal(sawProof, expectedProof);
  assert.equal(exchanged.sub, 'fb-graph-77');
  assert.equal(exchanged.email, 'salman@example.com');
  assert.equal(exchanged.picture, 'https://platform-lookaside.fbsbx.com/pic.jpg');

  // Wrong app_id in debug_token must fail
  await assert.rejects(
    () =>
      exchangeFacebookCodeForClaims({
        code: 'auth-code-123',
        appId: FB_APP_ID,
        appSecret: FB_APP_SECRET,
        redirectUri: 'https://example.com/api/v1/auth/facebook/callback',
        fetchImpl: (async (input: RequestInfo | URL) => {
          const target = String(input);
          if (target.includes('/oauth/access_token')) {
            return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
          }
          return new Response(
            JSON.stringify({ data: { is_valid: true, app_id: 'different-app' } }),
            { status: 200 }
          );
        }) as typeof fetch,
      }),
    (err: any) => err instanceof FacebookAuthError && err.code === 'invalid_facebook_audience'
  );
});

test('JsonMarketplaceRepository supports email registration/lookup, Facebook auth, dual social linking & migration snapshot', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-fb-unit-'));
  try {
    const config = loadConfig({
      NODE_ENV: 'test',
      DATA_DIR: dataDir,
      FACEBOOK_APP_ID: FB_APP_ID,
      FACEBOOK_APP_SECRET: FB_APP_SECRET,
    });
    const repo = new JsonMarketplaceRepository(config, makeStorePaths(dataDir));

    // 1. Register user with optional email & duplicate check
    const passwordHash = await hashPassword('StrongPass!2026');
    const reg = await repo.registerUser({
      name: 'راشد العجمي',
      phone: '0507778899',
      email: 'Rashed@Example.com',
      role: 'buyer',
      passwordHash,
    });
    assert.equal(reg.user.email, 'rashed@example.com');
    const foundByEmail = await repo.findUserByEmail('RASHED@example.com');
    assert.equal(foundByEmail?.id, reg.user.id);

    await assert.rejects(
      () =>
        repo.registerUser({
          name: 'شخص آخر',
          phone: '0507778800',
          email: 'rashed@example.com',
          role: 'buyer',
          passwordHash,
        }),
      (err: any) => err instanceof RepositoryError && err.status === 409 && err.code === 'email_exists'
    );

    // 2. First-time Facebook sign-up without phone marks needsPhoneCompletion
    const fbFirst = await repo.authenticateWithFacebook({
      claims: {
        sub: 'fb-sub-new-1',
        email: 'fb.breeder@example.com',
        emailVerified: true,
        name: 'سعد المطيري',
      },
      role: 'seller',
      mode: 'register',
    });
    assert.equal(fbFirst.isNewUser, true);
    assert.equal(fbFirst.facebookLinked, true);
    assert.equal(fbFirst.googleLinked, false);

    const selfFb = toSelfUser(fbFirst.user, {
      googleLinked: fbFirst.googleLinked,
      facebookLinked: fbFirst.facebookLinked,
      hasPassword: fbFirst.hasPassword,
    });
    assert.equal(selfFb?.facebookLinked, true);
    assert.equal(selfFb?.googleLinked, false);
    assert.equal(selfFb?.needsPhoneCompletion, true);

    // 3. Returning Facebook login reuses account without duplicating user
    const fbSecond = await repo.authenticateWithFacebook({
      claims: {
        sub: 'fb-sub-new-1',
        email: 'fb.breeder@example.com',
        emailVerified: true,
        name: 'سعد المطيري',
      },
      role: 'buyer',
      mode: 'login',
    });
    assert.equal(fbSecond.isNewUser, false);
    assert.equal(fbSecond.user.id, fbFirst.user.id);

    // 4. Email collision MUST NOT auto-link on Facebook sign-in
    await assert.rejects(
      () =>
        repo.authenticateWithFacebook({
          claims: {
            sub: 'fb-sub-collision',
            email: 'rashed@example.com',
            emailVerified: true,
            name: 'Attacker',
          },
        }),
      (err: any) =>
        err instanceof RepositoryError &&
        err.status === 409 &&
        err.code === 'account_exists_link_required'
    );

    // 5. Explicit linking of BOTH Google and Facebook on the same user
    await repo.linkGoogleIdentity({
      userId: reg.user.id,
      claims: {
        sub: 'g-sub-rashed',
        email: 'rashed@example.com',
        emailVerified: true,
        name: 'راشد العجمي',
      },
    });
    const bothLinked = await repo.linkFacebookIdentity({
      userId: reg.user.id,
      claims: {
        sub: 'fb-sub-collision',
        email: 'rashed@example.com',
        emailVerified: true,
        name: 'راشد العجمي',
      },
    });
    assert.equal(bothLinked.googleLinked, true);
    assert.equal(bothLinked.facebookLinked, true);

    // 6. Cross-account Facebook subject conflict rejected
    await assert.rejects(
      () =>
        repo.linkFacebookIdentity({
          userId: fbFirst.user.id,
          claims: {
            sub: 'fb-sub-collision',
            email: 'rashed@example.com',
            emailVerified: true,
            name: 'Conflict',
          },
        }),
      (err: any) =>
        err instanceof RepositoryError &&
        err.status === 409 &&
        err.code === 'facebook_subject_conflict'
    );

    // 7. Migration snapshot keeps both 'google' and 'facebook' identities for the same user
    const snapshot = prepareMigrationSnapshot(repo.getRawJsonStore());
    const rashedIdentities = snapshot.googleIdentityRows.filter((row) => row.userId === reg.user.id);
    assert.equal(rashedIdentities.length, 2);
    assert.deepEqual(
      rashedIdentities.map((r) => r.provider).sort(),
      ['facebook', 'google']
    );

    await repo.close();
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('Auth HTTP routes support email login/registration, Facebook OAuth callback, and proof-of-ownership linking', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-fb-http-'));
  let server: http.Server | null = null;
  try {
    const config = loadConfig({
      NODE_ENV: 'test',
      DATA_DIR: dataDir,
      FACEBOOK_APP_ID: FB_APP_ID,
      FACEBOOK_APP_SECRET: FB_APP_SECRET,
      APP_URL: 'http://127.0.0.1:3000',
    });
    const repo = new JsonMarketplaceRepository(config, makeStorePaths(dataDir));

    let mockedClaims = {
      sub: 'fb-http-new-1',
      email: 'http.fb@example.com',
      emailVerified: true,
      name: 'مربي جديد',
    };

    const app = express();
    app.use(express.json());
    app.use(
      '/api/v1/auth',
      createAuthRouter({
        config,
        repo,
        exchangeFacebookCode: async () => mockedClaims,
      })
    );

    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1/auth`;

    // 1. Facebook config endpoint exposes only public appId (never appSecret)
    const cfgRes = await fetch(`${baseUrl}/facebook/config`);
    assert.equal(cfgRes.status, 200);
    const cfgBody = await cfgRes.json();
    assert.deepEqual(cfgBody, { enabled: true, appId: FB_APP_ID });

    // 2. Register user via email + phone, then sign in using email + password
    const regRes = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'تركي البقمي',
        phone: '0502223344',
        email: 'Turki@Example.com',
        password: 'ValidPassword!99',
        role: 'seller',
      }),
    });
    assert.equal(regRes.status, 201);
    const regData = await regRes.json();
    assert.equal(regData.user.email, 'turki@example.com');

    const loginEmailRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'turki@example.com',
        password: 'ValidPassword!99',
      }),
    });
    assert.equal(loginEmailRes.status, 200);
    const loginEmailData = await loginEmailRes.json();
    assert.equal(loginEmailData.user.id, regData.user.id);

    const wrongEmailPwRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'turki@example.com',
        password: 'WrongPassword!11',
      }),
    });
    assert.equal(wrongEmailPwRes.status, 401);

    // 3. Facebook OAuth URL + Callback for brand-new user
    const urlRes = await fetch(`${baseUrl}/facebook/url?role=seller&mode=register`);
    assert.equal(urlRes.status, 200);
    const { url: fbUrl } = await urlRes.json();
    const signedState = new URL(fbUrl).searchParams.get('state') || '';
    assert.ok(signedState);

    const cbNewRes = await fetch(
      `${baseUrl}/facebook/callback?code=fb-code-1&state=${encodeURIComponent(signedState)}`
    );
    assert.equal(cbNewRes.status, 200);
    const cbNewCookie = cbNewRes.headers.get('set-cookie') || '';
    assert.match(cbNewCookie, new RegExp(`${config.cookieName}=`));
    const cbNewHtml = await cbNewRes.text();
    assert.match(cbNewHtml, /souq-facebook-auth/);
    assert.match(cbNewHtml, /&quot;ok&quot;:true/);

    // 4. Facebook OAuth Callback colliding with existing user's email -> 409 + signed linkToken -> link-with-password via email
    mockedClaims = {
      sub: 'fb-http-turki-collision',
      email: 'turki@example.com',
      emailVerified: true,
      name: 'تركي البقمي',
    };
    const cbCollisionRes = await fetch(
      `${baseUrl}/facebook/callback?code=fb-code-2&state=${encodeURIComponent(signedState)}`
    );
    assert.equal(cbCollisionRes.status, 409);
    const cbCollisionHtml = await cbCollisionRes.text();
    const attrMatch = cbCollisionHtml.match(/data-payload="([^"]+)"/);
    assert.ok(attrMatch);
    const decodedAttr = attrMatch[1]
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
    const collisionPayload = JSON.parse(decodedAttr);
    assert.equal(collisionPayload.code, 'account_exists_link_required');
    assert.ok(collisionPayload.linkToken);

    const linkRes = await fetch(`${baseUrl}/facebook/link-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'turki@example.com',
        password: 'ValidPassword!99',
        linkToken: collisionPayload.linkToken,
      }),
    });
    assert.equal(linkRes.status, 200);
    const linkData = await linkRes.json();
    assert.equal(linkData.linked, true);
    assert.equal(linkData.user.facebookLinked, true);
    assert.equal(linkData.user.id, regData.user.id);

    // Sanity check unused seed data helper didn't break
    assert.ok(createSeedData().categories.length > 0);
    await repo.close();
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
