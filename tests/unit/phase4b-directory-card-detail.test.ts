import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('Phase 4B ListingsDirectory, ListingCard, ListingDetailView, and ListingCommentsSection preserve contracts and deliver redesigned layout', () => {
  const dirSrc = readFileSync(
    resolve(process.cwd(), 'src/components/ListingsDirectory.tsx'),
    'utf8'
  );
  // Commercial sidebar + mobile collapsible panel + all Phase 3 controls preserved
  assert.match(dirSrc, /lg:sticky lg:top-20/);
  assert.match(dirSrc, /id="directory-advanced-filters"/);
  assert.match(dirSrc, /aria-expanded=\{mobileFiltersOpen\}/);
  assert.match(dirSrc, /buildActiveFilterChips/);
  assert.match(dirSrc, /عرض المزيد/);
  assert.match(dirSrc, /مسح جميع الفلاتر/);
  assert.match(dirSrc, /AbortController/);
  assert.match(dirSrc, /id="flt-q"/);
  assert.match(dirSrc, /id="flt-cat"/);
  assert.match(dirSrc, /id="flt-subcat"/);
  assert.match(dirSrc, /id="flt-breed"/);
  assert.match(dirSrc, /id="flt-region"/);
  assert.match(dirSrc, /id="flt-city"/);
  assert.match(dirSrc, /id="flt-sex"/);
  assert.match(dirSrc, /id="flt-availability"/);
  assert.match(dirSrc, /id="flt-minp"/);
  assert.match(dirSrc, /id="flt-maxp"/);
  assert.match(dirSrc, /id="flt-minq"/);
  assert.match(dirSrc, /id="flt-maxq"/);
  assert.match(dirSrc, /id="dir-sort"/);

  const cardSrc = readFileSync(
    resolve(process.cwd(), 'src/components/ListingCard.tsx'),
    'utf8'
  );
  // Uniform 4:3 image, unit vs total herd value, verified badge, separate favorite & like actions
  assert.match(cardSrc, /aspect-\[4\/3\]/);
  assert.match(cardSrc, /loading="lazy"/);
  assert.match(cardSrc, /\/ للرأس/);
  assert.match(cardSrc, /إجمالي قيمة القطيع/);
  assert.match(cardSrc, /VerifiedSellerBadge/);
  assert.match(cardSrc, /onSelectSeller/);
  assert.match(cardSrc, /onToggleFavorite/);
  assert.match(cardSrc, /onToggleLike/);
  assert.match(cardSrc, /listing\.quantity/);

  const detailSrc = readFileSync(
    resolve(process.cwd(), 'src/components/ListingDetailView.tsx'),
    'utf8'
  );
  const lightboxSrc = readFileSync(
    resolve(process.cwd(), 'src/components/ImageLightbox.tsx'),
    'utf8'
  );
  // Gallery & lightbox keyboard navigation, specs, permitted contact gating, related listings, mobile sticky bar
  assert.match(detailSrc, /<ImageLightbox/);
  assert.match(lightboxSrc, /key === 'Escape'/);
  assert.match(lightboxSrc, /key === 'ArrowLeft'/);
  assert.match(lightboxSrc, /key === 'ArrowRight'/);
  assert.match(detailSrc, /المواصفات التفصيلية للعرض/);
  assert.match(detailSrc, /إجمالي قيمة القطيع/);
  assert.match(detailSrc, /relatedListings/);
  assert.match(detailSrc, /عروض مشابهة قد تهمك/);
  assert.match(detailSrc, /aria-label="إجراءات التواصل السريعة"/);
  assert.match(detailSrc, /\{isOwner && \(/);
  assert.match(detailSrc, /\{!isOwner && \(/);
  assert.match(detailSrc, /\{allowsOffers && !isOwner && \(/);
  assert.match(detailSrc, /\{currentUser && !isOwner && \(/);
  assert.match(detailSrc, /\{!currentUser && \(/);
  assert.match(detailSrc, /VerifiedSellerBadge/);
  assert.match(detailSrc, /<ListingCommentsSection/);

  const commentsSrc = readFileSync(
    resolve(process.cwd(), 'src/components/ListingCommentsSection.tsx'),
    'utf8'
  );
  assert.match(commentsSrc, /id="listing-comments-section"/);
  assert.match(commentsSrc, /api\.getListingComments/);
  assert.match(commentsSrc, /api\.postListingComment/);
  assert.match(commentsSrc, /عرض المزيد من الأسئلة/);
});

test('ListingCard resolves data-driven status badges (مباع / مميز / جديد)', async () => {
  const { resolveListingStatusBadge } = await import('../../src/lib/marketplace-helpers.ts');
  const nowMs = Date.parse('2026-11-21T12:00:00.000Z');

  assert.deepEqual(
    resolveListingStatusBadge(
      { status: 'Sold', isFeatured: true, publishedAt: '2026-11-20T10:00:00.000Z', createdAt: '2026-11-20T10:00:00.000Z' },
      { lang: 'ar', nowMs }
    ),
    { kind: 'sold', label: 'مباع' }
  );

  assert.deepEqual(
    resolveListingStatusBadge(
      { status: 'Published', isFeatured: true, publishedAt: '2026-11-13T10:00:00.000Z', createdAt: '2026-11-13T10:00:00.000Z' },
      { lang: 'ar', nowMs }
    ),
    { kind: 'featured', label: 'مميز' }
  );

  assert.deepEqual(
    resolveListingStatusBadge(
      { status: 'Published', isFeatured: false, publishedAt: '2026-11-12T22:00:00.000Z', createdAt: '2026-11-12T22:00:00.000Z' },
      { lang: 'ar', nowMs }
    ),
    { kind: 'new', label: 'جديد' }
  );

  assert.deepEqual(
    resolveListingStatusBadge(
      { status: 'Published', isFeatured: false, publishedAt: '2026-10-01T10:00:00.000Z', createdAt: '2026-10-01T10:00:00.000Z' },
      { lang: 'ar', nowMs }
    ),
    null
  );

  assert.deepEqual(
    resolveListingStatusBadge(
      { status: 'Pending', isFeatured: false, publishedAt: '2026-11-20T10:00:00.000Z', createdAt: '2026-11-20T10:00:00.000Z' },
      { lang: 'en', nowMs }
    ),
    { kind: 'pending', label: 'Pending' }
  );

  const cardSrc = readFileSync(
    resolve(process.cwd(), 'src/components/ListingCard.tsx'),
    'utf8'
  );
  assert.match(cardSrc, /resolveListingStatusBadge/);
  assert.match(cardSrc, /data-status-badge=\{statusBadge\.kind\}/);
});

