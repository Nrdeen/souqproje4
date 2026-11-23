/**
 * Phase 5C Unit Tests — Material Change Detection, Multi-Page Listing Aggregation,
 * Full-Status Analytics, Orphaned Draft Media Cleanup, and Component State Isolation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  hasMaterialListingChanges,
  type ListingContentSnapshot,
} from '../../src/lib/listing-validation';
import { fetchAllPaginatedListings } from '../../src/lib/listing-search';
import {
  computeAnalyticsSummary,
  scopeAnalyticsDataset,
} from '../../src/lib/analytics';
import {
  cleanupOrphanedDraftMedia,
  collectReferencedMediaIds,
  type MediaAsset,
} from '../../server/media';
import type { Listing } from '../../src/types/marketplace';

function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: 'lst_1',
    sellerId: 'usr_seller_1',
    categoryId: 'cat_sheep',
    subCategoryId: 'sub_breeding',
    breedId: 'brd_naimi',
    regionId: 'reg_riyadh',
    city: 'الرياض',
    title: 'نعيمي فاخر للتربية',
    slug: 'naimi-1',
    description: 'حلال نظيف ومحصن بالكامل',
    priceAmount: 1800,
    expectedPrice: 1700,
    currency: 'SAR',
    sex: 'ذكر',
    ageMonths: 8,
    weightKg: 42,
    quantity: 5,
    isNegotiable: true,
    allowPriceOffers: true,
    vaccinated: true,
    status: 'Published',
    publishedAt: '2026-03-01T10:00:00Z',
    createdAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-03-01T10:00:00Z',
    images: [
      { id: 'img_1', url: '/api/v1/media/med_1', mediaId: 'med_1', position: 1 },
    ],
    video: null,
    ...overrides,
  };
}

test('hasMaterialListingChanges distinguishes material edits from non-material settings', () => {
  const base = makeListing();
  const baseSnapshot: ListingContentSnapshot = {
    title: base.title,
    description: base.description,
    priceAmount: base.priceAmount,
    expectedPrice: base.expectedPrice,
    categoryId: base.categoryId,
    subCategoryId: base.subCategoryId,
    breedId: base.breedId,
    regionId: base.regionId,
    city: base.city,
    sex: base.sex,
    ageMonths: base.ageMonths,
    weightKg: base.weightKg,
    quantity: base.quantity,
    vaccinated: base.vaccinated,
    images: base.images,
    video: base.video,
  };

  // Identical content -> non-material
  assert.equal(hasMaterialListingChanges(base, { ...baseSnapshot }), false);

  // Non-material toggles on Listing object (allowPriceOffers / isNegotiable / Sold status) do not change snapshot
  const nonMaterialUpdated = makeListing({
    allowPriceOffers: false,
    isNegotiable: false,
    status: 'Sold',
  });
  assert.equal(hasMaterialListingChanges(base, nonMaterialUpdated), false);

  // Material edits: title, description, price, quantity, city, images order/addition, video
  assert.equal(hasMaterialListingChanges(base, { ...baseSnapshot, title: 'عنوان معدل' }), true);
  assert.equal(hasMaterialListingChanges(base, { ...baseSnapshot, description: 'وصف مختلف' }), true);
  assert.equal(hasMaterialListingChanges(base, { ...baseSnapshot, priceAmount: 1950 }), true);
  assert.equal(hasMaterialListingChanges(base, { ...baseSnapshot, expectedPrice: 1600 }), true);
  assert.equal(hasMaterialListingChanges(base, { ...baseSnapshot, quantity: 6 }), true);
  assert.equal(hasMaterialListingChanges(base, { ...baseSnapshot, city: 'جدة' }), true);
  assert.equal(hasMaterialListingChanges(base, { ...baseSnapshot, vaccinated: false }), true);
  assert.equal(
    hasMaterialListingChanges(base, {
      ...baseSnapshot,
      images: [
        { url: '/api/v1/media/med_1', mediaId: 'med_1' },
        { url: '/api/v1/media/med_2', mediaId: 'med_2' },
      ],
    }),
    true
  );
  assert.equal(
    hasMaterialListingChanges(base, {
      ...baseSnapshot,
      video: {
        mediaId: 'med_vid_1',
        url: '/api/v1/media/med_vid_1',
      },
    }),
    true
  );
});

test('fetchAllPaginatedListings aggregates > 50 and > 200 listings without silent truncation', async () => {
  const dataset: Listing[] = Array.from({ length: 137 }, (_, i) =>
    makeListing({
      id: `lst_${String(i + 1).padStart(3, '0')}`,
      title: `إعلان رقم ${i + 1}`,
    })
  );

  let callCount = 0;
  const mockFetcher = async (params: Record<string, string | number | boolean | undefined>) => {
    callCount += 1;
    const limit = Math.min(50, Number(params.limit || 50));
    const offset = Number(params.offset || 0);
    const slice = dataset.slice(offset, offset + limit);
    const nextOffset = offset + slice.length < dataset.length ? offset + slice.length : null;
    return {
      listings: slice,
      totalCount: dataset.length,
      limit,
      offset,
      hasMore: nextOffset !== null,
      nextOffset,
    };
  };

  const result = await fetchAllPaginatedListings(mockFetcher, { includeAllStatuses: true });
  assert.equal(callCount, 3); // 50 + 50 + 37
  assert.equal(result.totalCount, 137);
  assert.equal(result.listings.length, 137);
  assert.equal(new Set(result.listings.map((l) => l.id)).size, 137);
});

test('analytics scoping and summary cover > 50 listings and Draft/Expired/Rejected statuses accurately', () => {
  const listings: Listing[] = [
    ...Array.from({ length: 30 }, (_, i) =>
      makeListing({ id: `p_${i}`, sellerId: 'usr_a', status: 'Published', quantity: 2, likesCount: 1 })
    ),
    ...Array.from({ length: 15 }, (_, i) =>
      makeListing({ id: `pend_${i}`, sellerId: 'usr_a', status: 'Pending', quantity: 1 })
    ),
    ...Array.from({ length: 10 }, (_, i) =>
      makeListing({ id: `rej_${i}`, sellerId: 'usr_a', status: 'Rejected', quantity: 1 })
    ),
    ...Array.from({ length: 8 }, (_, i) =>
      makeListing({ id: `dr_${i}`, sellerId: 'usr_a', status: 'Draft', quantity: 3 })
    ),
    ...Array.from({ length: 5 }, (_, i) =>
      makeListing({ id: `exp_${i}`, sellerId: 'usr_a', status: 'Expired', quantity: 2 })
    ),
    makeListing({ id: 'other_seller', sellerId: 'usr_b', status: 'Published', quantity: 10 }),
  ];

  const sellerScoped = scopeAnalyticsDataset({
    userId: 'usr_a',
    isAdmin: false,
    allListings: listings,
    priceOffers: [],
    conversations: [],
  });
  assert.equal(sellerScoped.listings.length, 68);

  const sellerSummary = computeAnalyticsSummary({
    listings: sellerScoped.listings,
    offers: sellerScoped.offers,
    conversations: sellerScoped.conversations,
  });
  assert.equal(sellerSummary.totalListings, 68);
  assert.equal(sellerSummary.publishedCount, 30);
  assert.equal(sellerSummary.pendingCount, 15);
  assert.equal(sellerSummary.rejectedCount, 10);
  assert.equal(sellerSummary.draftCount, 8);
  assert.equal(sellerSummary.expiredCount, 5);
  assert.equal(sellerSummary.soldCount, 0);
  assert.equal(sellerSummary.totalHeads, 30 * 2 + 15 + 10 + 8 * 3 + 5 * 2);

  const adminScoped = scopeAnalyticsDataset({
    userId: 'usr_admin',
    isAdmin: true,
    allListings: listings,
    priceOffers: [],
    conversations: [],
  });
  assert.equal(adminScoped.listings.length, 69);
});

test('cleanupOrphanedDraftMedia deletes expired unbound files while protecting bound and in-flight media', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-media-cleanup-'));
  try {
    const createFile = (name: string) => {
      fs.writeFileSync(path.join(tempDir, name), Buffer.from('sample-bytes'));
    };
    const makeMedia = (
      id: string,
      filename: string,
      listingId: string | null,
      createdAt: string
    ): MediaAsset => {
      createFile(filename);
      return {
        id,
        uploaderId: 'usr_seller_1',
        listingId,
        kind: 'image',
        mimeType: 'image/png',
        sizeBytes: 12,
        originalName: filename,
        filename,
        url: `/api/v1/media/${id}`,
        createdAt,
      };
    };

    const nowMs = Date.parse('2026-06-02T12:00:00.000Z');
    const oldIso = '2026-06-01T00:00:00.000Z'; // 36h old
    const freshIso = '2026-06-02T11:30:00.000Z'; // 30m old

    const listings: Listing[] = [
      makeListing({
        id: 'lst_active',
        images: [{ id: 'img_1', url: '/api/v1/media/med_bound', mediaId: 'med_bound', position: 1 }],
        video: {
          id: 'vid_1',
          mediaId: 'med_referenced_unlinked',
          url: '/api/v1/media/med_referenced_unlinked',
          mimeType: 'video/mp4',
          sizeBytes: 12,
        },
      }),
    ];

    const mediaStore: MediaAsset[] = [
      makeMedia('med_000101', 'med_000101.png', null, oldIso),
      makeMedia('med_000102', 'med_000102.png', 'lst_nonexistent', oldIso),
      makeMedia('med_000103', 'med_000103.png', null, freshIso),
      makeMedia('med_bound', 'med_000104.png', 'lst_active', oldIso),
      makeMedia('med_referenced_unlinked', 'med_000105.mp4', null, oldIso),
      makeMedia('med_inflight', 'med_000106.png', null, oldIso),
    ];

    const refs = collectReferencedMediaIds(listings);
    assert.equal(refs.has('med_bound'), true);
    assert.equal(refs.has('med_referenced_unlinked'), true);

    const res = cleanupOrphanedDraftMedia({
      uploadsDir: tempDir,
      mediaStore,
      listings,
      ttlMs: 24 * 60 * 60 * 1000,
      nowMs,
      protectedMediaIds: new Set(['med_inflight']),
    });

    assert.equal(res.removedIds.length, 2);
    assert.ok(res.removedIds.includes('med_000101'));
    assert.ok(res.removedIds.includes('med_000102'));

    // Disk verification
    assert.equal(fs.existsSync(path.join(tempDir, 'med_000101.png')), false);
    assert.equal(fs.existsSync(path.join(tempDir, 'med_000102.png')), false);
    assert.equal(fs.existsSync(path.join(tempDir, 'med_000103.png')), true);
    assert.equal(fs.existsSync(path.join(tempDir, 'med_000104.png')), true);
    assert.equal(fs.existsSync(path.join(tempDir, 'med_000105.mp4')), true);
    assert.equal(fs.existsSync(path.join(tempDir, 'med_000106.png')), true);

    assert.equal(res.mediaStore.length, 4);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Phase 5C UI components enforce state isolation, resubmission controls, and targeted refreshes', () => {
  const detailSrc = readFileSync(resolve(process.cwd(), 'src/components/ListingDetailView.tsx'), 'utf8');
  assert.match(detailSrc, /activeListingIdRef/);
  assert.match(detailSrc, /setMessageText\(/);
  assert.match(detailSrc, /setShowOfferModal\(false\)/);
  assert.match(detailSrc, /setShowReportModal\(false\)/);

  const commentsSrc = readFileSync(
    resolve(process.cwd(), 'src/components/ListingCommentsSection.tsx'),
    'utf8'
  );
  assert.match(commentsSrc, /activeListingIdRef/);
  assert.match(commentsSrc, /fetchSeqRef/);
  assert.match(commentsSrc, /setQuestionBody\(''\)/);
  assert.match(commentsSrc, /setReplyBody\(''\)/);

  const addSrc = readFileSync(resolve(process.cwd(), 'src/components/AddListingView.tsx'), 'utf8');
  assert.match(addSrc, /activeFormKeyRef/);
  assert.match(addSrc, /submittingRef/);
  assert.match(addSrc, /حفظ وإعادة الإرسال للمراجعة/);
  assert.match(addSrc, /حفظ كمسودة/);

  const appSrc = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  assert.match(appSrc, /getAllListingsPaginated\(\{\s*includeAllStatuses:\s*true\s*\}\)/);
  assert.match(appSrc, /getAllListingsPaginated\(\{\s*sellerId:\s*boot\.currentUser\.id\s*\}\)/);
  assert.match(appSrc, /refreshActivityData/);
  // Targeted refreshes in message/offer/notification handlers should not call loadAllData()
  const handleSendMatch = appSrc.match(/const handleSendMessage[\s\S]*?\};/);
  assert.ok(handleSendMatch);
  assert.match(handleSendMatch[0], /refreshActivityData/);
  assert.doesNotMatch(handleSendMatch[0], /loadAllData/);
});
