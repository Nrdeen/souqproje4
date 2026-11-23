import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatRelativeArabicTime } from '../../src/lib/format';
import {
  partitionSellersByVerification,
  resolveRequestedListing,
  resolveRequestedSeller,
} from '../../src/lib/marketplace-helpers';
import { getFocusTrapTargetIndex } from '../../src/lib/modal-focus';
import type { Listing, SellerProfile } from '../../src/types/marketplace';

function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: 'lst_1',
    sellerId: 'usr_seller_1',
    categoryId: 'cat_sheep',
    breedId: 'brd_naimi',
    regionId: 'reg_riyadh',
    city: 'الرياض',
    title: 'نعيمي فاخر',
    slug: 'naimi-1',
    description: 'وصف الإعلان',
    priceAmount: 1800,
    currency: 'SAR',
    sex: 'ذكر',
    ageMonths: 8,
    weightKg: 42,
    quantity: 5,
    isNegotiable: true,
    vaccinated: true,
    status: 'Published',
    publishedAt: '2026-01-01T10:00:00Z',
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-01-01T10:00:00Z',
    images: [],
    ...overrides,
  };
}

function makeSeller(overrides: Partial<SellerProfile> = {}): SellerProfile {
  return {
    userId: 'usr_seller_1',
    displayName: 'مراح النخبة',
    bio: 'مراح متخصص في تربية النعيمي',
    regionId: 'reg_riyadh',
    city: 'الرياض',
    verificationStatus: 'Verified',
    verifiedAt: '2026-01-01T00:00:00Z',
    yearsExperience: 10,
    specialty: 'النعيمي',
    rating: 4.8,
    ratingCount: 12,
    totalSales: 35,
    ...overrides,
  };
}

test('resolveRequestedListing resolves exact listing without falling back to publishedListings[0]', () => {
  const pub1 = makeListing({ id: 'lst_pub_1', status: 'Published' });
  const pub2 = makeListing({ id: 'lst_pub_2', status: 'Published' });
  const pendingOwn = makeListing({ id: 'lst_pending_own', status: 'Pending' });

  // Finds published listing
  assert.equal(
    resolveRequestedListing({
      listingId: 'lst_pub_2',
      allListings: [pub1, pub2],
      publishedListings: [pub1, pub2],
    })?.id,
    'lst_pub_2'
  );

  // Finds owner's pending listing present in allListings
  assert.equal(
    resolveRequestedListing({
      listingId: 'lst_pending_own',
      allListings: [pendingOwn, pub1],
      publishedListings: [pub1],
    })?.id,
    'lst_pending_own'
  );

  // Unknown or inaccessible listing ID MUST return null (never pub1)
  assert.equal(
    resolveRequestedListing({
      listingId: 'lst_does_not_exist',
      allListings: [pub1, pub2],
      publishedListings: [pub1, pub2],
    }),
    null
  );

  // Null / whitespace listing ID returns null
  assert.equal(
    resolveRequestedListing({
      listingId: null,
      allListings: [pub1],
      publishedListings: [pub1],
    }),
    null
  );
  assert.equal(
    resolveRequestedListing({
      listingId: '   ',
      allListings: [pub1],
      publishedListings: [pub1],
    }),
    null
  );
});

test('resolveRequestedSeller returns seller when found and null when missing', () => {
  const seller1 = makeSeller({ userId: 'usr_s1' });
  const seller2 = makeSeller({ userId: 'usr_s2', verificationStatus: 'Pending' });

  assert.equal(
    resolveRequestedSeller({ sellerId: 'usr_s2', sellers: [seller1, seller2] })?.userId,
    'usr_s2'
  );
  assert.equal(
    resolveRequestedSeller({ sellerId: 'usr_missing', sellers: [seller1, seller2] }),
    null
  );
  assert.equal(
    resolveRequestedSeller({ sellerId: null, sellers: [seller1, seller2] }),
    null
  );
});

test('partitionSellersByVerification includes strictly verificationStatus === "Verified" in verifiedSellers', () => {
  const verified = makeSeller({ userId: 'usr_v', verificationStatus: 'Verified' });
  const pending = makeSeller({
    userId: 'usr_p',
    verificationStatus: 'Pending',
    verifiedAt: null,
  });
  const rejected = makeSeller({
    userId: 'usr_r',
    verificationStatus: 'Rejected',
    verifiedAt: null,
  });
  const missingStatus = makeSeller({
    userId: 'usr_u',
    verificationStatus: undefined,
    verifiedAt: '2025-05-01T00:00:00Z',
  });

  const result = partitionSellersByVerification([verified, pending, rejected, missingStatus]);
  assert.deepEqual(
    result.verifiedSellers.map((s) => s.userId),
    ['usr_v']
  );
  assert.deepEqual(
    result.otherSellers.map((s) => s.userId),
    ['usr_p', 'usr_r', 'usr_u']
  );
});

test('formatRelativeArabicTime uses actual current time without hardcoded 2026 reference anchor', () => {
  // Using a 2024 reference timestamp verifies there is no hardcoded 2026-11-13 minimum anchor.
  const now2024 = new Date('2024-06-15T12:00:00Z').getTime();
  assert.equal(formatRelativeArabicTime('2024-06-15T11:45:00Z', now2024), 'قبل قليل');
  assert.equal(formatRelativeArabicTime('2024-06-15T10:00:00Z', now2024), 'منذ ساعتين');
  assert.equal(formatRelativeArabicTime('2024-06-14T12:00:00Z', now2024), 'أمس');
  assert.equal(formatRelativeArabicTime('2024-06-12T12:00:00Z', now2024), 'منذ 3 أيام');

  // Default Date.now() call for an instant right now returns 'قبل قليل'
  assert.equal(formatRelativeArabicTime(new Date().toISOString()), 'قبل قليل');

  // Invalid date string is handled gracefully
  assert.equal(formatRelativeArabicTime('not-a-date'), 'الآن');
});

test('getFocusTrapTargetIndex wraps Tab and Shift+Tab within modal focusable elements', () => {
  // Forward Tab on last element wraps to first (0)
  assert.equal(
    getFocusTrapTargetIndex({ totalFocusable: 4, activeIndex: 3, shiftKey: false }),
    0
  );
  // Forward Tab when focus escaped outside dialog (-1) resets to first (0)
  assert.equal(
    getFocusTrapTargetIndex({ totalFocusable: 4, activeIndex: -1, shiftKey: false }),
    0
  );
  // Forward Tab on middle element proceeds normally
  assert.equal(
    getFocusTrapTargetIndex({ totalFocusable: 4, activeIndex: 1, shiftKey: false }),
    null
  );
  // Shift+Tab on first element wraps to last (total - 1)
  assert.equal(
    getFocusTrapTargetIndex({ totalFocusable: 4, activeIndex: 0, shiftKey: true }),
    3
  );
  // Shift+Tab when focus escaped (-1) wraps to last
  assert.equal(
    getFocusTrapTargetIndex({ totalFocusable: 4, activeIndex: -1, shiftKey: true }),
    3
  );
  // Shift+Tab on middle element proceeds normally
  assert.equal(
    getFocusTrapTargetIndex({ totalFocusable: 4, activeIndex: 2, shiftKey: true }),
    null
  );
  // No focusable children returns null
  assert.equal(
    getFocusTrapTargetIndex({ totalFocusable: 0, activeIndex: -1, shiftKey: false }),
    null
  );
});

test('BreedersAndGuidesView omits articles guides and DashboardView uses mobile-safe overflow for My Listings', () => {
  const breedersSrc = readFileSync(
    resolve(process.cwd(), 'src/components/BreedersAndGuidesView.tsx'),
    'utf8'
  );
  assert.doesNotMatch(breedersSrc, /مقالات وإرشادات للمربين والمشترين/);
  assert.doesNotMatch(breedersSrc, /selectedArticle/);
  assert.doesNotMatch(breedersSrc, /article-modal-title/);

  const dashboardSrc = readFileSync(
    resolve(process.cwd(), 'src/components/DashboardView.tsx'),
    'utf8'
  );
  assert.match(dashboardSrc, /md:hidden space-y-3/);
  assert.match(dashboardSrc, /hidden md:block[\s\S]*overflow-x-auto/);
});
