import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  canAccessConversation,
  canEditListing,
  canRespondToOffer,
  canViewListing,
  visibleConversations,
  visibleOffers,
  type Actor,
} from '../../server/auth/policy';
import { toPublicSeller, toSelfUser } from '../../server/auth/serialize';
import { DEMO_USER_IDS, migrateAuthFields } from '../../server/auth/migrate';
import { authenticateUpgrade } from '../../server/wsAuth';

const buyer: Actor = { id: 'b1', role: 'buyer' };
const sellerA: Actor = { id: 'sA', role: 'seller' };
const sellerB: Actor = { id: 'sB', role: 'seller' };
const admin: Actor = { id: 'adm', role: 'admin' };

test('listings: only the owner or an admin may edit', () => {
  const listing = { sellerId: 'sA', status: 'Published' };
  assert.equal(canEditListing(sellerA, listing), true);
  assert.equal(canEditListing(sellerB, listing), false);
  assert.equal(canEditListing(buyer, listing), false);
  assert.equal(canEditListing(admin, listing), true);
  assert.equal(canEditListing(null, listing), false);
});

test('listings: unpublished ones are visible only to owner and admin', () => {
  for (const status of ['Pending', 'Rejected', 'Draft']) {
    const l = { sellerId: 'sA', status };
    assert.equal(canViewListing(null, l), false, status);
    assert.equal(canViewListing(buyer, l), false, status);
    assert.equal(canViewListing(sellerB, l), false, status);
    assert.equal(canViewListing(sellerA, l), true, status);
    assert.equal(canViewListing(admin, l), true, status);
  }
  assert.equal(canViewListing(null, { sellerId: 'sA', status: 'Published' }), true);
});

test('conversations: only the two participants (not even admins) can access them', () => {
  const conv = { buyerId: 'b1', sellerId: 'sA' };
  assert.equal(canAccessConversation(buyer, conv), true);
  assert.equal(canAccessConversation(sellerA, conv), true);
  assert.equal(canAccessConversation(sellerB, conv), false);
  assert.equal(canAccessConversation(admin, conv), false);
  assert.equal(canAccessConversation(null, conv), false);
  const all = [conv, { buyerId: 'x', sellerId: 'y' }];
  assert.equal(visibleConversations(buyer, all).length, 1);
  assert.equal(visibleConversations(sellerB, all).length, 0);
  assert.equal(visibleConversations(null, all).length, 0);
});

test('offers: visible to the two parties (and admins), answerable by the seller or an admin only', () => {
  const offers = [
    { id: 1, buyerId: 'b1', sellerId: 'sA' },
    { id: 2, buyerId: 'b2', sellerId: 'sB' },
  ];
  assert.deepEqual(visibleOffers(buyer, offers).map((o) => o.id), [1]);
  assert.deepEqual(visibleOffers(sellerB, offers).map((o) => o.id), [2]);
  assert.deepEqual(visibleOffers(admin, offers).map((o) => o.id), [1, 2]);
  assert.deepEqual(visibleOffers(null, offers), []);
  assert.equal(canRespondToOffer(sellerA, offers[0]), true);
  assert.equal(canRespondToOffer(buyer, offers[0]), false);
  assert.equal(canRespondToOffer(sellerB, offers[0]), false);
});

test('serializers never leak credentials or bulk seller contact details', () => {
  const dirtyUser = { id: 'u', phone: '0500000002', email: 'e', name: 'n', role: 'buyer', status: 'active', createdAt: 'c', passwordHash: 'SECRET', credentials: 'SECRET' };
  const self = toSelfUser(dirtyUser) as Record<string, unknown>;
  assert.ok(!('passwordHash' in self) && !('credentials' in self));
  assert.equal(toSelfUser(null), null);

  const seller = { userId: 'sA', displayName: 'd', bio: 'b', regionId: 'r', city: 'c', phone: '0504829104', whatsapp: '966504829104', verifiedAt: null, yearsExperience: 1, specialty: 's', rating: 5, ratingCount: 1, totalSales: 2, internalNote: 'x' };
  const unavailable = toPublicSeller(seller, false) as Record<string, unknown>;
  assert.ok(!('phone' in unavailable) && !('whatsapp' in unavailable) && !('internalNote' in unavailable));
  assert.equal(unavailable.contactAvailable, false);
  const available = toPublicSeller(seller, true) as Record<string, unknown>;
  assert.ok(!('phone' in available) && !('whatsapp' in available) && !('internalNote' in available));
  assert.equal(available.contactAvailable, true);
});

test('migration is additive and idempotent, flags demo users, never touches other data', () => {
  const data: any = {
    users: [
      { id: 'usr_buyer_1', phone: '0561940281', role: 'buyer' },
      { id: 'usr_real_1', phone: '0551111111', role: 'seller' },
    ],
    listings: [{ id: 'l1' }],
  };
  const before = JSON.parse(JSON.stringify(data));
  assert.equal(migrateAuthFields(data), true);
  assert.deepEqual(data.credentials, []);
  assert.deepEqual(data.sessions, []);
  assert.equal(data.users[0].isDemo, true);
  assert.equal(data.users[1].isDemo, undefined);
  assert.deepEqual(data.listings, before.listings);
  assert.equal(data.users.length, before.users.length);
  assert.equal(migrateAuthFields(data), false); // second run changes nothing
  assert.equal(DEMO_USER_IDS.has('usr_admin_1'), true);
});

test('migration on a copy of a pre-auth store keeps every existing record', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-auth-migration-'));
  try {
    const legacyStorePath = path.join(tmpDir, 'store.json');
    const legacyFixture = {
      users: [
        {
          id: 'usr_seller_1',
          phone: '0504829104',
          email: 'fahad@alqahtani-farm.sa',
          name: 'فهد القحطاني',
          role: 'seller',
          status: 'active',
          createdAt: '2026-10-14T12:00:00.000Z',
        },
        {
          id: 'usr_legacy_9',
          phone: '0551234567',
          email: 'legacy@farm.sa',
          name: 'مربي سابق',
          role: 'seller',
          status: 'active',
          createdAt: '2026-10-15T12:00:00.000Z',
        },
      ],
      sellers: [{ userId: 'usr_seller_1', displayName: 'مراح القحطاني', city: 'الرياض' }],
      categories: [{ id: 'cat_sheep', name: 'الأغنام', slug: 'sheep', parentId: null }],
      breeds: [{ id: 'brd_naimi', categoryId: 'cat_sheep', name: 'نعيمي' }],
      regions: [{ id: 'reg_riyadh', name: 'الرياض', parentId: null }],
      listings: [
        {
          id: 'lst_101',
          sellerId: 'usr_seller_1',
          title: 'نعيمي بلدي',
          priceAmount: 1850,
          status: 'Published',
        },
      ],
      favorites: { usr_seller_1: ['lst_101'] },
      conversations: [],
      priceOffers: [],
      notifications: [],
      sellerReviews: [],
      reports: [],
      indicativePrices: [],
      articles: [],
      faqs: [],
      auditLogs: [],
    };
    fs.writeFileSync(legacyStorePath, JSON.stringify(legacyFixture, null, 2), 'utf-8');

    const original = JSON.parse(fs.readFileSync(legacyStorePath, 'utf-8'));
    const copy = JSON.parse(JSON.stringify(original));
    assert.equal(migrateAuthFields(copy), true);
    for (const key of Object.keys(original)) {
      if (key === 'users') continue;
      assert.deepEqual(copy[key], original[key], key);
    }
    assert.equal(copy.users.length, original.users.length);
    original.users.forEach((u: any, i: number) => {
      const { isDemo, phoneVerifiedAt, ...rest } = copy.users[i];
      assert.deepEqual(rest, u);
      assert.equal(phoneVerifiedAt, null);
      assert.equal(isDemo, DEMO_USER_IDS.has(u.id) ? true : undefined);
    });
    assert.equal(copy.credentials.length, 0, 'no credentials are invented for existing accounts');
    assert.deepEqual(copy.sessions, []);
    assert.equal(migrateAuthFields(copy), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------- websocket handshake rules
test('websocket handshake: needs an allowed Origin AND a live session cookie; identity comes from the session', () => {
  const config = { allowedOrigins: ['https://souq.example.com'], cookieName: 'sid' };
  const session = { id: 'sess', userId: 'u1' };
  const sessions = { validate: (tok?: string) => (tok === 'good-token-good-token-good' ? (session as any) : null) };
  const users: Record<string, { id: string; status: string }> = { u1: { id: 'u1', status: 'active' }, u2: { id: 'u2', status: 'suspended' } };
  const deps = { config, sessions, findUser: (id: string) => users[id] };
  const cookie = 'sid=good-token-good-token-good';

  assert.deepEqual(authenticateUpgrade({ origin: 'https://souq.example.com', cookie }, deps), { ok: true, userId: 'u1', sessionId: 'sess' });
  assert.deepEqual(authenticateUpgrade({ origin: 'https://evil.example', cookie }, deps), { ok: false, status: 403 });
  assert.deepEqual(authenticateUpgrade({ cookie }, deps), { ok: false, status: 403 });
  assert.deepEqual(authenticateUpgrade({ origin: 'https://souq.example.com' }, deps), { ok: false, status: 401 });
  assert.deepEqual(authenticateUpgrade({ origin: 'https://souq.example.com', cookie: 'sid=forged-forged-forged-forged' }, deps), { ok: false, status: 401 });
  session.userId = 'u2';
  assert.deepEqual(authenticateUpgrade({ origin: 'https://souq.example.com', cookie }, deps), { ok: false, status: 401 });
});
