import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildListingShareUrl,
  buildNotificationTargetRoute,
  createRoute,
  isDashboardTab,
  parseUrlToRoute,
  routesEqual,
  routeToUrl,
} from '../../src/lib/router';
import {
  normalizeSaudiMobileClient,
  validatePasswordClient,
} from '../../src/lib/auth-validation';
import { normalizeSaudiMobile, validatePassword } from '../../server/auth/phone';
import {
  buildSellerContactLinks,
  getRoleAwareFooterAccountLinks,
  getRoleAwareNavItems,
} from '../../src/lib/marketplace-helpers';
import type { AppNotification } from '../../src/types/marketplace';

test('parseUrlToRoute and routeToUrl support direct URLs and preserve legacy query links', () => {
  assert.deepEqual(parseUrlToRoute('/'), createRoute({ page: 'home' }));
  assert.deepEqual(parseUrlToRoute('/listings'), createRoute({ page: 'listings' }));
  assert.deepEqual(
    parseUrlToRoute('/listings/lst_101'),
    createRoute({ page: 'detail', listingId: 'lst_101' })
  );
  assert.deepEqual(
    parseUrlToRoute('/listings/lst_101', '?comment=cmt_55'),
    createRoute({ page: 'detail', listingId: 'lst_101', commentId: 'cmt_55' })
  );
  assert.deepEqual(
    parseUrlToRoute('/listings/lst_101/edit'),
    createRoute({ page: 'add', editingListingId: 'lst_101' })
  );
  assert.deepEqual(parseUrlToRoute('/add'), createRoute({ page: 'add' }));
  assert.deepEqual(
    parseUrlToRoute('/sellers/usr_seller_1'),
    createRoute({ page: 'seller', sellerId: 'usr_seller_1' })
  );
  assert.deepEqual(parseUrlToRoute('/breeds'), createRoute({ page: 'breeds' }));
  assert.deepEqual(parseUrlToRoute('/breeders'), createRoute({ page: 'breeders' }));
  assert.deepEqual(
    parseUrlToRoute('/login'),
    createRoute({ page: 'login', authMode: 'login' })
  );
  assert.deepEqual(
    parseUrlToRoute('/register'),
    createRoute({ page: 'login', authMode: 'register' })
  );
  assert.deepEqual(
    parseUrlToRoute('/dashboard/messages', '?conversation=conv_9'),
    createRoute({ page: 'dashboard', dashboardTab: 'messages', conversationId: 'conv_9' })
  );
  assert.deepEqual(
    parseUrlToRoute('/dashboard', '?tab=favorites'),
    createRoute({ page: 'dashboard', dashboardTab: 'favorites' })
  );

  // Legacy URLs preserved
  assert.deepEqual(
    parseUrlToRoute('/', '?listing=lst_legacy'),
    createRoute({ page: 'detail', listingId: 'lst_legacy' })
  );
  assert.deepEqual(
    parseUrlToRoute('/listings', '?listing=lst_legacy&comment=cmt_9'),
    createRoute({ page: 'detail', listingId: 'lst_legacy', commentId: 'cmt_9' })
  );
  assert.deepEqual(
    parseUrlToRoute('/', '?seller=usr_seller_2'),
    createRoute({ page: 'seller', sellerId: 'usr_seller_2' })
  );

  // Round-trip serialization
  const sampleRoutes = [
    createRoute({ page: 'home' }),
    createRoute({ page: 'listings' }),
    createRoute({ page: 'detail', listingId: 'lst_101', commentId: 'cmt_1' }),
    createRoute({ page: 'seller', sellerId: 'usr_s1' }),
    createRoute({ page: 'add' }),
    createRoute({ page: 'add', editingListingId: 'lst_101' }),
    createRoute({ page: 'breeds' }),
    createRoute({ page: 'breeders' }),
    createRoute({ page: 'login', authMode: 'login' }),
    createRoute({ page: 'login', authMode: 'register' }),
    createRoute({ page: 'dashboard', dashboardTab: 'messages', conversationId: 'conv_4' }),
    createRoute({ page: 'dashboard', dashboardTab: 'admin' }),
  ];

  for (const r of sampleRoutes) {
    const serialized = routeToUrl(r);
    const [p, q = ''] = serialized.split('?');
    const reparsed = parseUrlToRoute(p, q ? `?${q}` : '');
    assert.equal(routesEqual(r, reparsed), true, `Round-trip failed for ${serialized}`);
  }

  assert.equal(isDashboardTab('my-listings'), true);
  assert.equal(isDashboardTab('admin'), true);
  assert.equal(isDashboardTab('unknown-tab'), false);
  assert.equal(buildListingShareUrl('lst_abc'), '/?listing=lst_abc');
  assert.equal(
    buildListingShareUrl('lst_abc', 'https://souq.example'),
    'https://souq.example/?listing=lst_abc'
  );
});

test('buildNotificationTargetRoute routes notifications to exact listing, comment, or dashboard tab', () => {
  const base: AppNotification = {
    id: 'ntf_1',
    userId: 'usr_1',
    type: 'new_message',
    title: 'رسالة',
    body: 'نص',
    createdAt: '2026-01-01T00:00:00Z',
    read: false,
  };

  assert.deepEqual(
    buildNotificationTargetRoute({
      ...base,
      type: 'new_message',
      conversationId: 'conv_22',
      listingId: 'lst_9',
    }),
    createRoute({ page: 'dashboard', dashboardTab: 'messages', conversationId: 'conv_22' })
  );

  assert.deepEqual(
    buildNotificationTargetRoute({
      ...base,
      type: 'new_comment',
      listingId: 'lst_9',
      commentId: 'cmt_77',
    }),
    createRoute({ page: 'detail', listingId: 'lst_9', commentId: 'cmt_77' })
  );

  assert.deepEqual(
    buildNotificationTargetRoute({
      ...base,
      type: 'comment_reply',
      listingId: 'lst_9',
      commentId: 'cmt_88',
    }),
    createRoute({ page: 'detail', listingId: 'lst_9', commentId: 'cmt_88' })
  );

  assert.deepEqual(
    buildNotificationTargetRoute({
      ...base,
      type: 'offer_accepted',
      listingId: 'lst_9',
    }),
    createRoute({ page: 'detail', listingId: 'lst_9' })
  );

  assert.deepEqual(
    buildNotificationTargetRoute({
      ...base,
      type: 'seller_verified',
    }),
    createRoute({ page: 'dashboard', dashboardTab: 'my-listings' })
  );

  assert.deepEqual(
    buildNotificationTargetRoute({
      ...base,
      type: 'listing_rejected',
      listingId: 'lst_9',
    }),
    createRoute({ page: 'dashboard', dashboardTab: 'my-listings' })
  );
});

test('client phone and password validation matches server rules exactly', () => {
  const phoneSamples = [
    '0501234567',
    '501234567',
    '+966501234567',
    '00966 50-123-4567',
    '٠٥٠١٢٣٤٥٦٧',
    '+966 ٥٥ ٩٨٧ ٦٥٤٣',
    '۰۵۰۱۲۳۴۵۶۷',
    '0401234567',
    '05012345',
    'abc',
    '',
  ];

  for (const sample of phoneSamples) {
    assert.equal(
      normalizeSaudiMobileClient(sample),
      normalizeSaudiMobile(sample),
      `Mismatch for phone sample: ${sample}`
    );
  }

  const normalized = '0501234567';
  const passwordSamples = [
    '',
    'short123',
    'aaaaaaaaaa',
    'password123',
    '0501234567',
    '٠٥٠١٢٣٤٥٦٧',
    'StrongSaudiMarket#2026',
  ];

  for (const pw of passwordSamples) {
    assert.equal(
      validatePasswordClient(pw, normalized),
      validatePassword(pw, normalized),
      `Mismatch for password sample: ${pw}`
    );
  }
});

test('buildSellerContactLinks enforces authentication and non-owner privacy gating', () => {
  const seller = { phone: '0501234567', whatsapp: '0501234567' };

  // Visitors never get contact links
  assert.deepEqual(
    buildSellerContactLinks({
      isSignedIn: false,
      isOwner: false,
      seller,
      listingTitle: 'نعيمي',
    }),
    { phoneDisplay: null, telHref: null, whatsappHref: null }
  );

  // Owners never see buyer contact links on their own listing
  assert.deepEqual(
    buildSellerContactLinks({
      isSignedIn: true,
      isOwner: true,
      seller,
      listingTitle: 'نعيمي',
    }),
    { phoneDisplay: null, telHref: null, whatsappHref: null }
  );

  // Authenticated non-owner receives tel and wa.me links
  const active = buildSellerContactLinks({
    isSignedIn: true,
    isOwner: false,
    seller,
    listingTitle: 'جذعان نعيمي',
  });
  assert.equal(active.phoneDisplay, '0501234567');
  assert.equal(active.telHref, 'tel:0501234567');
  assert.ok(active.whatsappHref?.startsWith('https://wa.me/966501234567?text='));

  // Missing seller contact info handled safely
  assert.deepEqual(
    buildSellerContactLinks({
      isSignedIn: true,
      isOwner: false,
      seller: { phone: '', whatsapp: '' },
      listingTitle: 'نعيمي',
    }),
    { phoneDisplay: null, telHref: null, whatsappHref: null }
  );
});

test('getRoleAwareNavItems and getRoleAwareFooterAccountLinks adapt cleanly by role', () => {
  const visitorNav = getRoleAwareNavItems(null);
  assert.equal(visitorNav.some((i) => i.page === 'dashboard'), false);

  const sellerNav = getRoleAwareNavItems('seller');
  assert.equal(sellerNav.some((i) => i.page === 'dashboard' && i.dashboardTab !== 'admin'), true);
  assert.equal(sellerNav.some((i) => i.dashboardTab === 'admin'), false);

  const adminNav = getRoleAwareNavItems('admin');
  assert.equal(adminNav.some((i) => i.dashboardTab === 'admin'), true);

  const visitorFooter = getRoleAwareFooterAccountLinks(null);
  assert.deepEqual(
    visitorFooter.map((l) => l.key),
    ['login', 'register']
  );

  const buyerFooter = getRoleAwareFooterAccountLinks('buyer');
  assert.equal(buyerFooter.some((l) => l.dashboardTab === 'admin'), false);
  assert.equal(buyerFooter.some((l) => l.dashboardTab === 'favorites'), true);

  const sellerFooter = getRoleAwareFooterAccountLinks('seller');
  assert.equal(sellerFooter.some((l) => l.dashboardTab === 'admin'), false);
  assert.equal(sellerFooter.some((l) => l.dashboardTab === 'my-listings'), true);

  const adminFooter = getRoleAwareFooterAccountLinks('admin');
  assert.equal(adminFooter.some((l) => l.dashboardTab === 'admin'), true);
});

test('Phase 2A UI components enforce routing, header/footer role awareness, auth UX, and owner/visitor rules', () => {
  const headerSrc = readFileSync(resolve(process.cwd(), 'src/components/Header.tsx'), 'utf8');
  assert.match(headerSrc, /\{currentUser \? \(/);
  assert.match(headerSrc, /currentUser\.name/);
  assert.match(headerSrc, /getRoleAwareNavItems/);
  assert.match(headerSrc, /event\.key === 'Escape'/);
  assert.match(headerSrc, /mousedown/);
  assert.match(headerSrc, /id="mobile-nav-drawer"/);
  assert.match(headerSrc, /souq-mobile-panel/);
  assert.match(headerSrc, /fixed inset-x-3/);
  assert.match(headerSrc, /max-w-\[calc\(100vw-1\.5rem\)\]/);

  const footerSrc = readFileSync(resolve(process.cwd(), 'src/components/Footer.tsx'), 'utf8');
  assert.match(footerSrc, /getRoleAwareFooterAccountLinks/);

  const authSrc = readFileSync(resolve(process.cwd(), 'src/components/AuthView.tsx'), 'utf8');
  assert.match(authSrc, /htmlFor="auth-name"/);
  assert.match(authSrc, /htmlFor="auth-phone"/);
  assert.match(authSrc, /htmlFor="auth-password"/);
  assert.match(authSrc, /aria-pressed=\{showPassword\}/);
  assert.match(authSrc, /htmlFor="role-buyer"/);
  assert.match(authSrc, /htmlFor="role-seller"/);
  assert.match(authSrc, /aria-describedby="auth-phone-hint"/);

  const detailSrc = readFileSync(
    resolve(process.cwd(), 'src/components/ListingDetailView.tsx'),
    'utf8'
  );
  assert.match(detailSrc, /\{isOwner && \(/);
  assert.match(detailSrc, /onEditListing/);
  assert.match(detailSrc, /onMarkSold/);
  assert.match(detailSrc, /\{!isOwner && \(/);
  assert.match(detailSrc, /\{allowsOffers && !isOwner && \(/);
  assert.match(detailSrc, /\{currentUser && !isOwner && \(/);
  assert.match(detailSrc, /\{!currentUser && \(/);
  assert.match(detailSrc, /VerifiedSellerBadge/);
  assert.match(detailSrc, /listing\.quantity/);

  const cardSrc = readFileSync(resolve(process.cwd(), 'src/components/ListingCard.tsx'), 'utf8');
  assert.match(cardSrc, /listing\.quantity/);
  assert.match(cardSrc, /VerifiedSellerBadge/);
  assert.match(cardSrc, /onSelectSeller/);

  const appSrc = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  assert.match(appSrc, /window\.addEventListener\('popstate'/);
  assert.match(appSrc, /window\.history\.pushState/);
  assert.match(appSrc, /window\.history\.replaceState/);
  assert.match(appSrc, /buildNotificationTargetRoute/);
});
