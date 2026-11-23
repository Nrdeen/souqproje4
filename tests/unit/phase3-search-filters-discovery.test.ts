import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildActiveFilterChips,
  DEFAULT_DIRECTORY_FILTERS,
  directoryFiltersToSearchParams,
  listingMatchesCity,
  listingMatchesSearchQuery,
  MAX_LISTINGS_PAGE_LIMIT,
  MAX_SEARCH_QUERY_LENGTH,
  normalizeArabicSearchText,
  parseDirectoryFiltersFromSearchParams,
  sortListingsDeterministic,
  validateAndParseListingQuery,
} from '../../src/lib/listing-search';
import { createRoute, parseUrlToRoute, routesEqual, routeToUrl } from '../../src/lib/router';

test('normalizeArabicSearchText handles diacritics, alef/teh/yeh variants, tatweel, and Arabic-Indic digits', () => {
  assert.equal(normalizeArabicSearchText('أَغْنَامْ نُعَيْمِيَّة'), 'اغنام نعيميه');
  assert.equal(normalizeArabicSearchText('إبــل عُمانـيـة'), 'ابل عمانيه');
  assert.equal(normalizeArabicSearchText('آل سُعود ٢٥٠٠'), 'ال سعود 2500');
  assert.equal(normalizeArabicSearchText('حَرّى الطّائف'), 'حري الطايف');
  assert.equal(normalizeArabicSearchText('مُؤَسَّسَة فائز'), 'موسسه فايز');
  assert.equal(normalizeArabicSearchText('   رياض   الخير  '), 'رياض الخير');
});

test('listingMatchesSearchQuery & listingMatchesCity match Arabic variations across fields without mutating source text', () => {
  const sampleListing = {
    id: 'lst_sample',
    sellerId: 'usr_s1',
    categoryId: 'cat_sheep',
    subCategoryId: 'sub_fattening',
    breedId: 'brd_naimi',
    regionId: 'reg_qassim',
    city: 'مكة المكرمة',
    title: 'أغنام نُعيمي جذعان أصيلة',
    description: 'حلال فاخر محصن بالكامل ومربى على الأعلاف الطبيعية',
  };
  const originalTitle = sampleListing.title;

  const context = {
    breeds: [{ id: 'brd_naimi', name: 'النعيمي' }],
    categories: [
      { id: 'cat_sheep', name: 'الأغنام' },
      { id: 'sub_fattening', name: 'أضاحي وذبائح' },
    ],
    regions: [{ id: 'reg_qassim', name: 'القصيم' }],
    sellers: [{ userId: 'usr_s1', displayName: 'مراح النخبة', verificationStatus: 'Verified' as const }],
  };

  assert.equal(listingMatchesSearchQuery(sampleListing, 'اغنام نعيمي', context), true);
  assert.equal(listingMatchesSearchQuery(sampleListing, 'اضاحي القصيم', context), true);
  assert.equal(listingMatchesSearchQuery(sampleListing, 'مكه المكرمه النخبه', context), true);
  assert.equal(listingMatchesSearchQuery(sampleListing, 'ماعز عارضي', context), false);
  assert.equal(listingMatchesCity(sampleListing.city, 'مكه'), true);
  assert.equal(listingMatchesCity(sampleListing.city, 'جدة'), false);

  // Original stored listing text stays completely untouched
  assert.equal(sampleListing.title, originalTitle);
});

test('URL search/filter persistence round-trips cleanly via router and ignores invalid numbers safely', () => {
  const customFilters = {
    ...DEFAULT_DIRECTORY_FILTERS,
    q: 'جذعان نعيمي',
    categoryId: 'cat_sheep',
    subCategoryId: 'sub_breed',
    breedId: 'brd_naimi',
    regionId: 'reg_riyadh',
    city: 'الرياض',
    minPrice: '1500',
    maxPrice: '25000',
    minQty: '5',
    maxQty: '30',
    sex: 'ذكر',
    verifiedOnly: true,
    vaccinatedOnly: true,
    hasVideoOnly: true,
    negotiableOnly: true,
    acceptsOffersOnly: true,
    availability: 'accepts_offers' as const,
    sort: 'oldest' as const,
  };

  const route = createRoute({ page: 'listings', listingFilters: customFilters });
  const serialized = routeToUrl(route);
  assert.ok(serialized.startsWith('/listings?'));

  const [pathname, query = ''] = serialized.split('?');
  const parsed = parseUrlToRoute(pathname, `?${query}`);
  assert.equal(routesEqual(route, parsed), true);
  assert.deepEqual(parsed.listingFilters, customFilters);

  // Default filters serialize to clean /listings without query clutter
  assert.equal(routeToUrl(createRoute({ page: 'listings' })), '/listings');

  // Garbage numeric URL params are safely sanitized on client without crashing
  const noisy = parseDirectoryFiltersFromSearchParams(
    new URLSearchParams('minPrice=abc&maxPrice=-90&minQty=0&sort=unknown&availability=bad')
  );
  assert.deepEqual(noisy, DEFAULT_DIRECTORY_FILTERS);
  assert.equal(directoryFiltersToSearchParams(noisy).toString(), '');
});

test('buildActiveFilterChips generates removable chips for active filters', () => {
  const chips = buildActiveFilterChips(
    {
      ...DEFAULT_DIRECTORY_FILTERS,
      q: 'نعيمي',
      breedId: 'brd_naimi',
      city: 'بريدة',
      minQty: '10',
      verifiedOnly: true,
      vaccinatedOnly: true,
      hasVideoOnly: true,
    },
    {
      breeds: [{ id: 'brd_naimi', name: 'النعيمي' }],
      categories: [],
      regions: [],
    }
  );

  assert.equal(chips.length, 7);
  assert.deepEqual(chips.find((c) => c.key === 'breedId')?.clearPatch, { breedId: 'all' });
  assert.deepEqual(chips.find((c) => c.key === 'verifiedOnly')?.clearPatch, {
    verifiedOnly: false,
  });
});

test('sortListingsDeterministic applies deterministic tie-breakers across all sort options', () => {
  const items = [
    {
      id: 'lst_b',
      priceAmount: 2000,
      publishedAt: '2026-02-10T10:00:00Z',
      createdAt: '2026-02-10T10:00:00Z',
      likesCount: 4,
    },
    {
      id: 'lst_a',
      priceAmount: 2000,
      publishedAt: '2026-02-10T10:00:00Z',
      createdAt: '2026-02-10T10:00:00Z',
      likesCount: 4,
    },
    {
      id: 'lst_c',
      priceAmount: 1500,
      publishedAt: '2026-02-01T10:00:00Z',
      createdAt: '2026-02-01T10:00:00Z',
      likesCount: 9,
    },
  ];

  // Tie on priceAmount & publishedAt -> deterministic by id ascending for price_asc/desc/oldest
  assert.deepEqual(
    sortListingsDeterministic(items, 'price_asc').map((i) => i.id),
    ['lst_c', 'lst_a', 'lst_b']
  );
  assert.deepEqual(
    sortListingsDeterministic(items, 'price_desc').map((i) => i.id),
    ['lst_a', 'lst_b', 'lst_c']
  );
  assert.deepEqual(
    sortListingsDeterministic(items, 'oldest').map((i) => i.id),
    ['lst_c', 'lst_a', 'lst_b']
  );
  assert.deepEqual(
    sortListingsDeterministic(items, 'newest').map((i) => i.id),
    ['lst_b', 'lst_a', 'lst_c']
  );
  assert.deepEqual(
    sortListingsDeterministic(items, 'most_liked').map((i) => i.id),
    ['lst_c', 'lst_b', 'lst_a']
  );
});

test('validateAndParseListingQuery bounds limits and rejects invalid query inputs', () => {
  const valid = validateAndParseListingQuery({
    q: 'نعيمي',
    minPrice: '1000',
    maxPrice: '15000',
    minQty: '2',
    maxQty: '20',
    verifiedOnly: '1',
    vaccinatedOnly: 'true',
    hasVideo: 'true',
    limit: '200',
    offset: '9',
    sort: 'oldest',
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.value.limit, MAX_LISTINGS_PAGE_LIMIT);
    assert.equal(valid.value.offset, 9);
    assert.equal(valid.value.verifiedOnly, true);
    assert.equal(valid.value.vaccinatedOnly, true);
    assert.equal(valid.value.hasVideoOnly, true);
    assert.equal(valid.value.sort, 'oldest');
  }

  // Oversized search query rejected
  assert.equal(
    validateAndParseListingQuery({ q: 'ا'.repeat(MAX_SEARCH_QUERY_LENGTH + 1) }).ok,
    false
  );
  // Inverted price / quantity ranges rejected
  assert.equal(validateAndParseListingQuery({ minPrice: '5000', maxPrice: '1000' }).ok, false);
  assert.equal(validateAndParseListingQuery({ minQty: '10', maxQty: '2' }).ok, false);
  // Non-numeric / negative / invalid enum params rejected
  assert.equal(validateAndParseListingQuery({ minPrice: 'abc' }).ok, false);
  assert.equal(validateAndParseListingQuery({ limit: '0' }).ok, false);
  assert.equal(validateAndParseListingQuery({ offset: '-1' }).ok, false);
  assert.equal(validateAndParseListingQuery({ sort: 'random' }).ok, false);
  assert.equal(validateAndParseListingQuery({ availability: 'bogus' }).ok, false);
  assert.equal(validateAndParseListingQuery({ verifiedOnly: 'maybe' }).ok, false);
});

test('Phase 3 UI components expose expanded prices, breed filter, active chips, Load More, and empty breed fallback', () => {
  const heroSrc = readFileSync(resolve(process.cwd(), 'src/components/HeroSearch.tsx'), 'utf8');
  assert.match(heroSrc, /value:\s*'25000'/);
  assert.match(heroSrc, /value:\s*'50000'/);
  assert.match(heroSrc, /value:\s*'100000'/);
  assert.match(heroSrc, /id="hero-breed"/);

  const dirSrc = readFileSync(resolve(process.cwd(), 'src/components/ListingsDirectory.tsx'), 'utf8');
  assert.match(dirSrc, /buildActiveFilterChips/);
  assert.match(dirSrc, /مسح جميع الفلاتر/);
  assert.match(dirSrc, /عرض المزيد/);
  assert.match(dirSrc, /AbortController/);
  assert.match(dirSrc, /value="oldest"/);
  assert.match(dirSrc, /id="flt-city"/);
  assert.match(dirSrc, /id="flt-minq"/);
  assert.match(dirSrc, /مربون موثقون فقط/);
  assert.match(dirSrc, /محصّن بيطرياً فقط/);
  assert.match(dirSrc, /يحتوي على فيديو فقط/);

  const cardSrc = readFileSync(resolve(process.cwd(), 'src/components/ListingCard.tsx'), 'utf8');
  assert.match(cardSrc, /loading="lazy"/);
  assert.match(cardSrc, /listing\.quantity/);
  assert.match(cardSrc, /onToggleFavorite/);
  assert.match(cardSrc, /onToggleLike/);

  const appSrc = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  assert.match(appSrc, /homeListings\.length === 0/);
  assert.match(appSrc, /عرض جميع السلالات/);
});
