import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createSignedGoogleOAuthState,
  GoogleAuthError,
  validateVerifiedGooglePayload,
  verifySignedGoogleOAuthState,
} from '../../server/auth/google';
import { migrateAuthFields } from '../../server/auth/migrate';
import { toSelfUser } from '../../server/auth/serialize';
import { loadConfig } from '../../server/config';
import { createSeedData, makeStorePaths, RepositoryError } from '../../server/domain/marketplace';
import { JsonMarketplaceRepository } from '../../server/repositories/jsonRepository';
import { prepareMigrationSnapshot } from '../../scripts/migrate-json-to-pg';

const CLIENT_ID = 'test-client-123.apps.googleusercontent.com';

function futureExp(seconds = 300): number {
  return Math.floor(Date.now() / 1000) + seconds;
}

test('Google ID token payload validation verifies issuer, audience, expiry, nonce, and claims', () => {
  const valid = validateVerifiedGooglePayload(
    {
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      exp: futureExp(),
      sub: 'google-sub-001',
      email: 'Saud.User@Example.com',
      email_verified: true,
      name: 'سعد العتيبي',
      picture: 'https://lh3.googleusercontent.com/a/avatar',
      nonce: 'nonce-abc',
    },
    CLIENT_ID,
    'nonce-abc'
  );
  assert.equal(valid.sub, 'google-sub-001');
  assert.equal(valid.email, 'saud.user@example.com');
  assert.equal(valid.name, 'سعد العتيبي');
  assert.equal(valid.picture, 'https://lh3.googleusercontent.com/a/avatar');

  // Accepts accounts.google.com without https prefix + array audience + non-https picture stripped
  const alt = validateVerifiedGooglePayload(
    {
      iss: 'accounts.google.com',
      aud: ['other-aud', CLIENT_ID],
      exp: futureExp(),
      sub: 'google-sub-002',
      email: 'nomad@example.com',
      email_verified: true,
      given_name: 'أحمد',
      picture: 'http://insecure.example.com/pic.jpg',
    },
    CLIENT_ID
  );
  assert.equal(alt.name, 'أحمد');
  assert.equal(alt.picture, undefined);

  // Invalid issuer
  assert.throws(
    () =>
      validateVerifiedGooglePayload(
        {
          iss: 'https://evil.example.com',
          aud: CLIENT_ID,
          exp: futureExp(),
          sub: 's1',
          email: 'a@b.com',
          email_verified: true,
          name: 'Test',
        },
        CLIENT_ID
      ),
    (err: any) => err instanceof GoogleAuthError && err.code === 'invalid_issuer' && err.status === 401
  );

  // Wrong audience
  assert.throws(
    () =>
      validateVerifiedGooglePayload(
        {
          iss: 'https://accounts.google.com',
          aud: 'wrong-client.apps.googleusercontent.com',
          exp: futureExp(),
          sub: 's1',
          email: 'a@b.com',
          email_verified: true,
          name: 'Test',
        },
        CLIENT_ID
      ),
    (err: any) => err instanceof GoogleAuthError && err.code === 'invalid_audience' && err.status === 401
  );

  // Authorized party (azp) mismatch
  assert.throws(
    () =>
      validateVerifiedGooglePayload(
        {
          iss: 'https://accounts.google.com',
          aud: CLIENT_ID,
          azp: 'another-client.apps.googleusercontent.com',
          exp: futureExp(),
          sub: 's1',
          email: 'a@b.com',
          email_verified: true,
          name: 'Test',
        },
        CLIENT_ID
      ),
    (err: any) => err instanceof GoogleAuthError && err.code === 'invalid_audience' && err.status === 401
  );

  // Empty configured client_id rejected
  assert.throws(
    () =>
      validateVerifiedGooglePayload(
        {
          iss: 'https://accounts.google.com',
          aud: '',
          exp: futureExp(),
          sub: 's1',
          email: 'a@b.com',
          email_verified: true,
          name: 'Test',
        },
        '   '
      ),
    (err: any) => err instanceof GoogleAuthError && err.code === 'google_not_configured' && err.status === 503
  );

  // Expired token
  assert.throws(
    () =>
      validateVerifiedGooglePayload(
        {
          iss: 'https://accounts.google.com',
          aud: CLIENT_ID,
          exp: Math.floor(Date.now() / 1000) - 60,
          sub: 's1',
          email: 'a@b.com',
          email_verified: true,
          name: 'Test',
        },
        CLIENT_ID
      ),
    (err: any) => err instanceof GoogleAuthError && err.code === 'expired_google_token' && err.status === 401
  );

  // Nonce mismatch
  assert.throws(
    () =>
      validateVerifiedGooglePayload(
        {
          iss: 'https://accounts.google.com',
          aud: CLIENT_ID,
          exp: futureExp(),
          sub: 's1',
          email: 'a@b.com',
          email_verified: true,
          name: 'Test',
          nonce: 'nonce-wrong',
        },
        CLIENT_ID,
        'nonce-expected'
      ),
    (err: any) => err instanceof GoogleAuthError && err.code === 'invalid_nonce' && err.status === 401
  );

  // Unverified Google email rejected
  assert.throws(
    () =>
      validateVerifiedGooglePayload(
        {
          iss: 'https://accounts.google.com',
          aud: CLIENT_ID,
          exp: futureExp(),
          sub: 's1',
          email: 'a@b.com',
          email_verified: false,
          name: 'Test',
        },
        CLIENT_ID
      ),
    (err: any) => err instanceof GoogleAuthError && err.code === 'unverified_google_email' && err.status === 403
  );

  // Missing sub/email rejected
  assert.throws(
    () =>
      validateVerifiedGooglePayload(
        {
          iss: 'https://accounts.google.com',
          aud: CLIENT_ID,
          exp: futureExp(),
          sub: '',
          email: 'invalid-email',
          email_verified: true,
          name: 'Test',
        },
        CLIENT_ID
      ),
    (err: any) => err instanceof GoogleAuthError && err.code === 'missing_profile_claims' && err.status === 400
  );
});

test('Signed OAuth state protects against tampering and expiration', () => {
  const secret = 's'.repeat(40);
  const state = createSignedGoogleOAuthState({ nonce: 'n123', role: 'seller', mode: 'register' }, secret, 60_000);
  const verified = verifySignedGoogleOAuthState(state, secret);
  assert.equal(verified.nonce, 'n123');
  assert.equal(verified.role, 'seller');
  assert.equal(verified.mode, 'register');

  // Tampered signature
  const [payloadPart] = state.split('.');
  assert.throws(
    () => verifySignedGoogleOAuthState(`${payloadPart}.tampered`, secret),
    (err: any) => err instanceof GoogleAuthError && err.code === 'invalid_oauth_state'
  );

  // Expired state
  const expired = createSignedGoogleOAuthState({ nonce: 'n123', role: 'buyer', mode: 'login' }, secret, -1000);
  assert.throws(
    () => verifySignedGoogleOAuthState(expired, secret),
    (err: any) => err instanceof GoogleAuthError && err.code === 'expired_oauth_state'
  );
});

test('JsonMarketplaceRepository: Google sign-up, returning reuse, no-auto-link policy, phone completion & gating', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-google-unit-'));
  try {
    const config = loadConfig({ NODE_ENV: 'test', DATA_DIR: dataDir, GOOGLE_CLIENT_ID: CLIENT_ID });
    const repo = new JsonMarketplaceRepository(config, makeStorePaths(dataDir));

    // 1. First-time Google user
    const first = await repo.authenticateWithGoogle({
      claims: {
        sub: 'g-sub-1',
        email: 'khalid@example.com',
        emailVerified: true,
        name: 'خالد الدوسري',
      },
      role: 'seller',
      mode: 'register',
    });

    assert.equal(first.isNewUser, true);
    assert.equal(first.googleLinked, true);
    assert.equal(first.hasPassword, false);
    assert.equal(first.user.phone, null);
    assert.equal(first.user.phoneVerifiedAt, null);

    const selfFirst = toSelfUser(first.user, {
      googleLinked: first.googleLinked,
      hasPassword: first.hasPassword,
    });
    assert.equal(selfFirst?.needsPhoneCompletion, true);
    assert.equal(selfFirst?.phoneVerified, false);

    // 2. Returning Google user reuses exact account without duplicating
    const second = await repo.authenticateWithGoogle({
      claims: {
        sub: 'g-sub-1',
        email: 'khalid.updated@example.com',
        emailVerified: true,
        name: 'خالد الدوسري محدث',
      },
      role: 'buyer',
      mode: 'login',
    });
    assert.equal(second.isNewUser, false);
    assert.equal(second.user.id, first.user.id);
    assert.equal(repo.getRawJsonStore().users.filter((u) => u.id === first.user.id).length, 1);

    // 3. Phone-gated actions refuse without Saudi phone
    await assert.rejects(
      () =>
        repo.createListing(first.user, {
          title: 'حري للبيع',
          priceAmount: 1400,
          breedId: repo.getRawJsonStore().breeds[0].id,
          categoryId: repo.getRawJsonStore().categories[0].id,
          regionId: repo.getRawJsonStore().regions[0].id,
          city: 'الرياض',
        }),
      (err: any) => err instanceof RepositoryError && err.status === 403 && err.code === 'phone_required'
    );

    await assert.rejects(
      () => repo.requestSellerVerification(first.user),
      (err: any) => err instanceof RepositoryError && err.status === 403 && err.code === 'phone_required'
    );

    // 4. Complete profile adds Saudi phone without faking verification
    const completed = await repo.completeUserProfile({
      userId: first.user.id,
      phone: '0501112233',
      name: 'خالد المربي',
      role: 'seller',
    });
    assert.equal(completed.user.phone, '0501112233');
    assert.equal(completed.user.phoneVerifiedAt, null);
    const sellerProfile = repo.getRawJsonStore().sellers.find((s) => s.userId === first.user.id);
    assert.equal(sellerProfile?.phone, '0501112233');
    assert.equal(sellerProfile?.whatsapp, '966501112233');

    // Now phone-gated actions work
    const createdListing = await repo.createListing(completed.user, {
      title: 'نعيمي فاخر',
      priceAmount: 1650,
      breedId: repo.getRawJsonStore().breeds[0].id,
      categoryId: repo.getRawJsonStore().categories[0].id,
      regionId: repo.getRawJsonStore().regions[0].id,
      city: 'الرياض',
      ageMonths: 8,
      weightKg: 42,
      quantity: 2,
      sex: 'ذكر',
      description: 'مواشي بصحة ممتازة',
    });
    assert.ok(createdListing.id);

    // 5. Existing user with matching email MUST NOT auto-link on Google login
    const existingReg = await repo.registerUser({
      name: 'مستخدم تقليدي',
      phone: '0504445566',
      role: 'buyer',
      passwordHash: 'hash',
    });
    existingReg.user.email = 'existing.owner@example.com';

    await assert.rejects(
      () =>
        repo.authenticateWithGoogle({
          claims: {
            sub: 'g-sub-collision',
            email: 'Existing.Owner@example.com',
            emailVerified: true,
            name: 'Attacker Same Email',
          },
        }),
      (err: any) =>
        err instanceof RepositoryError && err.status === 409 && err.code === 'account_exists_link_required'
    );

    // Explicit link succeeds for verified owner, and rejects cross-account conflict
    const linked = await repo.linkGoogleIdentity({
      userId: existingReg.user.id,
      claims: {
        sub: 'g-sub-collision',
        email: 'existing.owner@example.com',
        emailVerified: true,
        name: 'مستخدم تقليدي',
      },
    });
    assert.equal(linked.googleLinked, true);

    await assert.rejects(
      () =>
        repo.linkGoogleIdentity({
          userId: first.user.id,
          claims: {
            sub: 'g-sub-collision',
            email: 'existing.owner@example.com',
            emailVerified: true,
            name: 'Duplicate',
          },
        }),
      (err: any) => err instanceof RepositoryError && err.status === 409 && err.code === 'google_subject_conflict'
    );

    // Duplicate phone blocked on completeUserProfile
    await assert.rejects(
      () => repo.completeUserProfile({ userId: existingReg.user.id, phone: '0501112233' }),
      (err: any) => err instanceof RepositoryError && err.status === 409 && err.code === 'phone_exists'
    );

    await repo.close();
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('Migration & schema snapshot handle legacy stores, nullable phones, and googleIdentities safely', () => {
  const legacyUser: any = { id: 'u1', phone: '0509998877', name: 'قديم', role: 'buyer' };
  const store: any = { users: [legacyUser] };
  migrateAuthFields(store);
  assert.deepEqual(store.googleIdentities, []);
  // Existing user objects must remain untouched by migrateAuthFields
  assert.equal('googleLinked' in legacyUser, false);

  const seed = createSeedData();
  seed.users.push({
    id: 'usr_g1',
    phone: null,
    email: 'g1@example.com',
    name: 'مستخدم جوجل',
    role: 'buyer',
    status: 'active',
    createdAt: new Date().toISOString(),
    phoneVerifiedAt: null,
  });
  seed.googleIdentities.push({
    id: 'gid_1',
    userId: 'usr_g1',
    provider: 'google',
    subject: 'sub_g1',
    email: 'g1@example.com',
    emailVerified: true,
    name: 'مستخدم جوجل',
    pictureUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const snapshot = prepareMigrationSnapshot(seed);
  const pgUser = snapshot.usersRows.find((u) => u.id === 'usr_g1');
  assert.ok(pgUser);
  assert.equal(pgUser.phone, null);
  assert.equal(snapshot.googleIdentityRows.length, 1);
  assert.equal(snapshot.counts.google_identities, 1);
});
