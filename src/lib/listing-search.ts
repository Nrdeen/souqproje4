import type { Breed, Category, Listing, ListingStatus, Region, SellerProfile } from '../types/marketplace';
import {
  trBreedName,
  trCategoryName,
  trCityName,
  trRegionName,
  trSexLabel,
} from './bilingual';

export const MAX_SEARCH_QUERY_LENGTH = 120;
export const MAX_CITY_FILTER_LENGTH = 60;
export const DEFAULT_LISTINGS_PAGE_LIMIT = 9;
export const MAX_LISTINGS_PAGE_LIMIT = 50;
export const DEFAULT_UNPAGINATED_LISTINGS_LIMIT = 200;

export type ListingSortOption =
  | 'newest'
  | 'oldest'
  | 'price_asc'
  | 'price_desc'
  | 'most_liked';

export type ListingAvailabilityOption =
  | 'all'
  | 'available'
  | 'accepts_offers'
  | 'negotiable'
  | 'sold';

export interface DirectoryFilters {
  q: string;
  categoryId: string;
  subCategoryId: string;
  breedId: string;
  regionId: string;
  city: string;
  minPrice: string;
  maxPrice: string;
  minQty: string;
  maxQty: string;
  sex: string;
  verifiedOnly: boolean;
  vaccinatedOnly: boolean;
  hasVideoOnly: boolean;
  negotiableOnly: boolean;
  acceptsOffersOnly: boolean;
  availability: ListingAvailabilityOption;
  sort: ListingSortOption;
}

export const DEFAULT_DIRECTORY_FILTERS: DirectoryFilters = {
  q: '',
  categoryId: 'all',
  subCategoryId: 'all',
  breedId: 'all',
  regionId: 'all',
  city: '',
  minPrice: '',
  maxPrice: '',
  minQty: '',
  maxQty: '',
  sex: 'all',
  verifiedOnly: false,
  vaccinatedOnly: false,
  hasVideoOnly: false,
  negotiableOnly: false,
  acceptsOffersOnly: false,
  availability: 'all',
  sort: 'newest',
};

export const VALID_LISTING_SORTS = new Set<ListingSortOption>([
  'newest',
  'oldest',
  'price_asc',
  'price_desc',
  'most_liked',
]);

export const VALID_LISTING_AVAILABILITY = new Set<ListingAvailabilityOption>([
  'all',
  'available',
  'accepts_offers',
  'negotiable',
  'sold',
]);

export const VALID_LISTING_STATUSES = new Set<ListingStatus>([
  'Draft',
  'Pending',
  'Published',
  'Rejected',
  'Sold',
  'Expired',
]);

/**
 * Normalizes Arabic and Latin text for tolerant, safe marketplace search without
 * mutating the original stored listing text.
 * - Strips zero-width/direction markers, Arabic diacritics (tashkeel), and tatweel
 * - Normalizes Alef variants (أ/إ/آ/ٱ -> ا), Teh Marbuta (ة -> ه), Alef Maqsura (ى -> ي)
 * - Normalizes Hamza carriers (ؤ -> و, ئ -> ي)
 * - Converts Arabic-Indic & Extended Arabic-Indic numerals to ASCII digits
 */
export function normalizeArabicSearchText(input: string): string {
  if (!input) return '';

  let out = '';
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);

    // Strip direction / zero-width chars, tatweel (0x0640), tashkeel & Quranic marks
    if (
      (code >= 0x200b && code <= 0x200f) ||
      (code >= 0x202a && code <= 0x202e) ||
      code === 0xfeff ||
      code === 0x0640 ||
      (code >= 0x064b && code <= 0x065f) ||
      code === 0x0670 ||
      (code >= 0x06d6 && code <= 0x06ed)
    ) {
      continue;
    }

    // Alef variants: أ (0x0623), إ (0x0625), آ (0x0622), ٱ (0x0671) -> ا (0x0627)
    if (code === 0x0622 || code === 0x0623 || code === 0x0625 || code === 0x0671) {
      out += '\u0627';
      continue;
    }
    // Teh Marbuta: ة (0x0629) -> ه (0x0647)
    if (code === 0x0629) {
      out += '\u0647';
      continue;
    }
    // Alef Maqsura: ى (0x0649) -> ي (0x064a)
    if (code === 0x0649) {
      out += '\u064a';
      continue;
    }
    // Waw with Hamza: ؤ (0x0624) -> و (0x0648)
    if (code === 0x0624) {
      out += '\u0648';
      continue;
    }
    // Yeh with Hamza: ئ (0x0626) -> ي (0x064a)
    if (code === 0x0626) {
      out += '\u064a';
      continue;
    }
    // Arabic-Indic digits: ٠-٩ (0x0660-0x0669)
    if (code >= 0x0660 && code <= 0x0669) {
      out += String.fromCharCode(code - 0x0660 + 48);
      continue;
    }
    // Extended Arabic-Indic digits: ۰-۹ (0x06f0-0x06f9)
    if (code >= 0x06f0 && code <= 0x06f9) {
      out += String.fromCharCode(code - 0x06f0 + 48);
      continue;
    }

    out += input[i];
  }

  return out.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function normalizeListingSort(value: unknown): ListingSortOption {
  return typeof value === 'string' && VALID_LISTING_SORTS.has(value as ListingSortOption)
    ? (value as ListingSortOption)
    : 'newest';
}

export function normalizeListingAvailability(value: unknown): ListingAvailabilityOption {
  return typeof value === 'string' &&
    VALID_LISTING_AVAILABILITY.has(value as ListingAvailabilityOption)
    ? (value as ListingAvailabilityOption)
    : 'all';
}

function cleanFilterString(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  return value.trim();
}

export function normalizeDirectoryFilters(
  partial?: Partial<DirectoryFilters> | null
): DirectoryFilters {
  const input = partial || {};
  return {
    q: cleanFilterString(input.q, '').slice(0, MAX_SEARCH_QUERY_LENGTH),
    categoryId: cleanFilterString(input.categoryId, 'all') || 'all',
    subCategoryId: cleanFilterString(input.subCategoryId, 'all') || 'all',
    breedId: cleanFilterString(input.breedId, 'all') || 'all',
    regionId: cleanFilterString(input.regionId, 'all') || 'all',
    city: cleanFilterString(input.city, '').slice(0, MAX_CITY_FILTER_LENGTH),
    minPrice: cleanFilterString(input.minPrice, ''),
    maxPrice: cleanFilterString(input.maxPrice, ''),
    minQty: cleanFilterString(input.minQty, ''),
    maxQty: cleanFilterString(input.maxQty, ''),
    sex: cleanFilterString(input.sex, 'all') || 'all',
    verifiedOnly: Boolean(input.verifiedOnly),
    vaccinatedOnly: Boolean(input.vaccinatedOnly),
    hasVideoOnly: Boolean(input.hasVideoOnly),
    negotiableOnly: Boolean(input.negotiableOnly),
    acceptsOffersOnly: Boolean(input.acceptsOffersOnly),
    availability: normalizeListingAvailability(input.availability),
    sort: normalizeListingSort(input.sort),
  };
}

export function areDirectoryFiltersEqual(
  a?: Partial<DirectoryFilters> | null,
  b?: Partial<DirectoryFilters> | null
): boolean {
  const na = normalizeDirectoryFilters(a);
  const nb = normalizeDirectoryFilters(b);
  return (
    na.q === nb.q &&
    na.categoryId === nb.categoryId &&
    na.subCategoryId === nb.subCategoryId &&
    na.breedId === nb.breedId &&
    na.regionId === nb.regionId &&
    na.city === nb.city &&
    na.minPrice === nb.minPrice &&
    na.maxPrice === nb.maxPrice &&
    na.minQty === nb.minQty &&
    na.maxQty === nb.maxQty &&
    na.sex === nb.sex &&
    na.verifiedOnly === nb.verifiedOnly &&
    na.vaccinatedOnly === nb.vaccinatedOnly &&
    na.hasVideoOnly === nb.hasVideoOnly &&
    na.negotiableOnly === nb.negotiableOnly &&
    na.acceptsOffersOnly === nb.acceptsOffersOnly &&
    na.availability === nb.availability &&
    na.sort === nb.sort
  );
}

export function countActiveDirectoryFilters(filters: DirectoryFilters): number {
  let count = 0;
  if (filters.q.trim()) count += 1;
  if (filters.categoryId !== 'all') count += 1;
  if (filters.subCategoryId !== 'all') count += 1;
  if (filters.breedId !== 'all') count += 1;
  if (filters.regionId !== 'all') count += 1;
  if (filters.city.trim()) count += 1;
  if (filters.minPrice.trim()) count += 1;
  if (filters.maxPrice.trim()) count += 1;
  if (filters.minQty.trim()) count += 1;
  if (filters.maxQty.trim()) count += 1;
  if (filters.sex !== 'all') count += 1;
  if (filters.verifiedOnly) count += 1;
  if (filters.vaccinatedOnly) count += 1;
  if (filters.hasVideoOnly) count += 1;
  if (filters.negotiableOnly) count += 1;
  if (filters.acceptsOffersOnly) count += 1;
  if (filters.availability !== 'all') count += 1;
  return count;
}

export function hasActiveDirectoryFilters(filters: DirectoryFilters): boolean {
  return countActiveDirectoryFilters(filters) > 0 || filters.sort !== 'newest';
}

function parseBoolParam(raw: string | null): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true';
}

function sanitizeNonNegativeNumberString(raw: string | null): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) return '';
  return String(Math.trunc(num));
}

function sanitizePositiveIntString(raw: string | null): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 1) return '';
  return String(Math.trunc(num));
}

export function parseDirectoryFiltersFromSearchParams(params: URLSearchParams): DirectoryFilters {
  const categoryId = params.get('category') || params.get('categoryId') || 'all';
  const subCategoryId = params.get('subCategory') || params.get('subCategoryId') || 'all';
  const breedId = params.get('breed') || params.get('breedId') || 'all';
  const regionId = params.get('region') || params.get('regionId') || 'all';
  const minQty = sanitizePositiveIntString(params.get('minQty') || params.get('minQuantity'));
  const maxQty = sanitizePositiveIntString(params.get('maxQty') || params.get('maxQuantity'));

  return normalizeDirectoryFilters({
    q: params.get('q') || '',
    categoryId,
    subCategoryId,
    breedId,
    regionId,
    city: params.get('city') || '',
    minPrice: sanitizeNonNegativeNumberString(params.get('minPrice')),
    maxPrice: sanitizeNonNegativeNumberString(params.get('maxPrice')),
    minQty,
    maxQty,
    sex: params.get('sex') || 'all',
    verifiedOnly: parseBoolParam(params.get('verified') || params.get('verifiedOnly')),
    vaccinatedOnly: parseBoolParam(params.get('vaccinated') || params.get('vaccinatedOnly')),
    hasVideoOnly: parseBoolParam(params.get('video') || params.get('hasVideo')),
    negotiableOnly: parseBoolParam(params.get('negotiable') || params.get('negotiableOnly')),
    acceptsOffersOnly: parseBoolParam(
      params.get('offers') || params.get('acceptsOffers') || params.get('acceptsOffersOnly')
    ),
    availability: normalizeListingAvailability(params.get('availability')),
    sort: normalizeListingSort(params.get('sort')),
  });
}

export function directoryFiltersToSearchParams(
  rawFilters: Partial<DirectoryFilters>
): URLSearchParams {
  const f = normalizeDirectoryFilters(rawFilters);
  const params = new URLSearchParams();
  if (f.q) params.set('q', f.q);
  if (f.categoryId !== 'all') params.set('category', f.categoryId);
  if (f.subCategoryId !== 'all') params.set('subCategory', f.subCategoryId);
  if (f.breedId !== 'all') params.set('breed', f.breedId);
  if (f.regionId !== 'all') params.set('region', f.regionId);
  if (f.city) params.set('city', f.city);
  if (f.minPrice) params.set('minPrice', f.minPrice);
  if (f.maxPrice) params.set('maxPrice', f.maxPrice);
  if (f.minQty) params.set('minQty', f.minQty);
  if (f.maxQty) params.set('maxQty', f.maxQty);
  if (f.sex !== 'all') params.set('sex', f.sex);
  if (f.verifiedOnly) params.set('verified', '1');
  if (f.vaccinatedOnly) params.set('vaccinated', '1');
  if (f.hasVideoOnly) params.set('video', '1');
  if (f.negotiableOnly) params.set('negotiable', '1');
  if (f.acceptsOffersOnly) params.set('offers', '1');
  if (f.availability !== 'all') params.set('availability', f.availability);
  if (f.sort !== 'newest') params.set('sort', f.sort);
  return params;
}

export interface SearchLookupContext {
  breeds?: Array<Pick<Breed, 'id' | 'name'>>;
  categories?: Array<Pick<Category, 'id' | 'name'>>;
  regions?: Array<Pick<Region, 'id' | 'name'>>;
  sellers?: Array<Pick<SellerProfile, 'userId' | 'displayName' | 'verificationStatus'>>;
}

export function buildListingSearchHaystack(
  listing: Pick<
    Listing,
    'title' | 'description' | 'city' | 'breedId' | 'categoryId' | 'subCategoryId' | 'regionId' | 'sellerId'
  >,
  context: SearchLookupContext = {}
): string {
  const breedName = context.breeds?.find((b) => b.id === listing.breedId)?.name || '';
  const categoryName = context.categories?.find((c) => c.id === listing.categoryId)?.name || '';
  const subCategoryName = listing.subCategoryId
    ? context.categories?.find((c) => c.id === listing.subCategoryId)?.name || ''
    : '';
  const regionName = context.regions?.find((r) => r.id === listing.regionId)?.name || '';
  const sellerName = context.sellers?.find((s) => s.userId === listing.sellerId)?.displayName || '';

  return normalizeArabicSearchText(
    [
      listing.title,
      listing.description,
      listing.city,
      breedName,
      categoryName,
      subCategoryName,
      regionName,
      sellerName,
    ]
      .filter(Boolean)
      .join(' ')
  );
}

export function listingMatchesSearchQuery(
  listing: Pick<
    Listing,
    'title' | 'description' | 'city' | 'breedId' | 'categoryId' | 'subCategoryId' | 'regionId' | 'sellerId'
  >,
  rawQuery: string,
  context: SearchLookupContext = {}
): boolean {
  const normalizedQuery = normalizeArabicSearchText(rawQuery);
  if (!normalizedQuery) return true;

  const haystack = buildListingSearchHaystack(listing, context);
  if (!haystack) return false;
  if (haystack.includes(normalizedQuery)) return true;

  const tokens = normalizedQuery.split(' ').filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => haystack.includes(token));
}

export function listingMatchesCity(listingCity: string, rawCityFilter: string): boolean {
  const normalizedFilter = normalizeArabicSearchText(rawCityFilter);
  if (!normalizedFilter) return true;
  const normalizedCity = normalizeArabicSearchText(listingCity);
  return normalizedCity.includes(normalizedFilter);
}

function safeTimestampMs(iso: string | undefined | null): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function compareStringDeterministic(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function sortListingsDeterministic<
  T extends Pick<Listing, 'id' | 'priceAmount' | 'publishedAt' | 'createdAt' | 'likesCount'>
>(items: readonly T[], sort: ListingSortOption): T[] {
  const copy = [...items];
  copy.sort((a, b) => {
    const aPub = safeTimestampMs(a.publishedAt) || safeTimestampMs(a.createdAt);
    const bPub = safeTimestampMs(b.publishedAt) || safeTimestampMs(b.createdAt);

    if (sort === 'oldest') {
      return aPub - bPub || compareStringDeterministic(a.id, b.id);
    }
    if (sort === 'price_asc') {
      return a.priceAmount - b.priceAmount || bPub - aPub || compareStringDeterministic(a.id, b.id);
    }
    if (sort === 'price_desc') {
      return b.priceAmount - a.priceAmount || bPub - aPub || compareStringDeterministic(a.id, b.id);
    }
    if (sort === 'most_liked') {
      const aLikes = a.likesCount ?? 0;
      const bLikes = b.likesCount ?? 0;
      return bLikes - aLikes || bPub - aPub || compareStringDeterministic(b.id, a.id);
    }
    // newest (default)
    return bPub - aPub || compareStringDeterministic(b.id, a.id);
  });
  return copy;
}

export interface ValidatedListingQuery {
  q: string;
  categoryId?: string;
  subCategoryId?: string;
  breedId?: string;
  regionId?: string;
  city: string;
  minPrice?: number;
  maxPrice?: number;
  minQty?: number;
  maxQty?: number;
  sex?: string;
  minAge?: number;
  maxAge?: number;
  verifiedOnly: boolean;
  vaccinatedOnly: boolean;
  hasVideoOnly: boolean;
  negotiableOnly: boolean;
  acceptsOffersOnly: boolean;
  availability: ListingAvailabilityOption;
  status?: ListingStatus;
  includeAllStatuses: boolean;
  sellerId?: string;
  sort: ListingSortOption;
  limit: number;
  offset: number;
  isExplicitlyPaginated: boolean;
}

function readSingleQueryValue(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (Array.isArray(raw)) {
    const first = raw[0];
    return typeof first === 'string' ? first : undefined;
  }
  return typeof raw === 'string' ? raw : String(raw);
}

function parseOptionalNumberParam(
  raw: string | undefined,
  opts: { integer?: boolean; min?: number; max?: number; label: string }
): { ok: true; value?: number } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, value: undefined };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: undefined };

  const num = Number(trimmed);
  if (!Number.isFinite(num)) {
    return { ok: false, error: `${opts.label} غير صالح` };
  }
  if (opts.integer && !Number.isInteger(num)) {
    return { ok: false, error: `${opts.label} يجب أن يكون رقماً صحيحاً` };
  }
  if (opts.min !== undefined && num < opts.min) {
    return { ok: false, error: `${opts.label} يجب ألا يقل عن ${opts.min}` };
  }
  if (opts.max !== undefined && num > opts.max) {
    return { ok: false, error: `${opts.label} يتجاوز الحد المسموح (${opts.max})` };
  }
  return { ok: true, value: num };
}

function parseOptionalBoolParam(
  raw: string | undefined,
  label: string
): { ok: true; value: boolean } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, value: false };
  const v = raw.trim().toLowerCase();
  if (!v) return { ok: true, value: false };
  if (v === 'true' || v === '1') return { ok: true, value: true };
  if (v === 'false' || v === '0') return { ok: true, value: false };
  return { ok: false, error: `قيمة ${label} غير صالحة` };
}

export function validateAndParseListingQuery(
  rawQuery: Record<string, unknown>
):
  | { ok: true; value: ValidatedListingQuery }
  | { ok: false; error: string; code: 'invalid_query' } {
  const qRaw = readSingleQueryValue(rawQuery.q)?.trim() ?? '';
  if (qRaw.length > MAX_SEARCH_QUERY_LENGTH) {
    return {
      ok: false,
      code: 'invalid_query',
      error: `نص البحث طويل جداً (الحد الأقصى ${MAX_SEARCH_QUERY_LENGTH} حرفاً)`,
    };
  }

  const cityRaw = readSingleQueryValue(rawQuery.city)?.trim() ?? '';
  if (cityRaw.length > MAX_CITY_FILTER_LENGTH) {
    return {
      ok: false,
      code: 'invalid_query',
      error: `اسم المدينة طويل جداً (الحد الأقصى ${MAX_CITY_FILTER_LENGTH} حرفاً)`,
    };
  }

  const minPriceRes = parseOptionalNumberParam(readSingleQueryValue(rawQuery.minPrice), {
    min: 0,
    max: 10_000_000,
    label: 'الحد الأدنى للسعر',
  });
  if (!minPriceRes.ok) return { ok: false, code: 'invalid_query', error: minPriceRes.error };

  const maxPriceRes = parseOptionalNumberParam(readSingleQueryValue(rawQuery.maxPrice), {
    min: 0,
    max: 10_000_000,
    label: 'الحد الأقصى للسعر',
  });
  if (!maxPriceRes.ok) return { ok: false, code: 'invalid_query', error: maxPriceRes.error };

  if (
    minPriceRes.value !== undefined &&
    maxPriceRes.value !== undefined &&
    minPriceRes.value > maxPriceRes.value
  ) {
    return {
      ok: false,
      code: 'invalid_query',
      error: 'الحد الأدنى للسعر لا يمكن أن يتجاوز الحد الأقصى للسعر',
    };
  }

  const minQtyRes = parseOptionalNumberParam(
    readSingleQueryValue(rawQuery.minQty) ?? readSingleQueryValue(rawQuery.minQuantity),
    { integer: true, min: 1, max: 100_000, label: 'الحد الأدنى للكمية' }
  );
  if (!minQtyRes.ok) return { ok: false, code: 'invalid_query', error: minQtyRes.error };

  const maxQtyRes = parseOptionalNumberParam(
    readSingleQueryValue(rawQuery.maxQty) ?? readSingleQueryValue(rawQuery.maxQuantity),
    { integer: true, min: 1, max: 100_000, label: 'الحد الأقصى للكمية' }
  );
  if (!maxQtyRes.ok) return { ok: false, code: 'invalid_query', error: maxQtyRes.error };

  if (
    minQtyRes.value !== undefined &&
    maxQtyRes.value !== undefined &&
    minQtyRes.value > maxQtyRes.value
  ) {
    return {
      ok: false,
      code: 'invalid_query',
      error: 'الحد الأدنى للكمية لا يمكن أن يتجاوز الحد الأقصى للكمية',
    };
  }

  const minAgeRes = parseOptionalNumberParam(readSingleQueryValue(rawQuery.minAge), {
    integer: true,
    min: 0,
    max: 240,
    label: 'الحد الأدنى للعمر',
  });
  if (!minAgeRes.ok) return { ok: false, code: 'invalid_query', error: minAgeRes.error };

  const maxAgeRes = parseOptionalNumberParam(readSingleQueryValue(rawQuery.maxAge), {
    integer: true,
    min: 0,
    max: 240,
    label: 'الحد الأقصى للعمر',
  });
  if (!maxAgeRes.ok) return { ok: false, code: 'invalid_query', error: maxAgeRes.error };

  if (
    minAgeRes.value !== undefined &&
    maxAgeRes.value !== undefined &&
    minAgeRes.value > maxAgeRes.value
  ) {
    return {
      ok: false,
      code: 'invalid_query',
      error: 'الحد الأدنى للعمر لا يمكن أن يتجاوز الحد الأقصى للعمر',
    };
  }

  const verifiedRes = parseOptionalBoolParam(
    readSingleQueryValue(rawQuery.verifiedOnly) ?? readSingleQueryValue(rawQuery.verified),
    'فلتر المربين الموثقين'
  );
  if (!verifiedRes.ok) return { ok: false, code: 'invalid_query', error: verifiedRes.error };

  const vaccinatedRes = parseOptionalBoolParam(
    readSingleQueryValue(rawQuery.vaccinatedOnly) ?? readSingleQueryValue(rawQuery.vaccinated),
    'فلتر التحصين'
  );
  if (!vaccinatedRes.ok) return { ok: false, code: 'invalid_query', error: vaccinatedRes.error };

  const hasVideoRes = parseOptionalBoolParam(
    readSingleQueryValue(rawQuery.hasVideo) ??
      readSingleQueryValue(rawQuery.withVideo) ??
      readSingleQueryValue(rawQuery.hasVideoOnly),
    'فلتر الفيديو'
  );
  if (!hasVideoRes.ok) return { ok: false, code: 'invalid_query', error: hasVideoRes.error };

  const negotiableRes = parseOptionalBoolParam(
    readSingleQueryValue(rawQuery.negotiable) ?? readSingleQueryValue(rawQuery.negotiableOnly),
    'فلتر التفاوض'
  );
  if (!negotiableRes.ok) return { ok: false, code: 'invalid_query', error: negotiableRes.error };

  const offersRes = parseOptionalBoolParam(
    readSingleQueryValue(rawQuery.acceptsOffers) ??
      readSingleQueryValue(rawQuery.acceptsOffersOnly) ??
      readSingleQueryValue(rawQuery.offers),
    'فلتر عروض السعر'
  );
  if (!offersRes.ok) return { ok: false, code: 'invalid_query', error: offersRes.error };

  const includeAllStatusesRes = parseOptionalBoolParam(
    readSingleQueryValue(rawQuery.includeAllStatuses),
    'فلتر جميع الحالات'
  );
  if (!includeAllStatusesRes.ok) {
    return { ok: false, code: 'invalid_query', error: includeAllStatusesRes.error };
  }

  const sortRaw = readSingleQueryValue(rawQuery.sort)?.trim();
  let sort: ListingSortOption = 'newest';
  if (sortRaw) {
    if (!VALID_LISTING_SORTS.has(sortRaw as ListingSortOption)) {
      return { ok: false, code: 'invalid_query', error: 'خيار الترتيب غير صالح' };
    }
    sort = sortRaw as ListingSortOption;
  }

  const availRaw = readSingleQueryValue(rawQuery.availability)?.trim();
  let availability: ListingAvailabilityOption = 'all';
  if (availRaw) {
    if (!VALID_LISTING_AVAILABILITY.has(availRaw as ListingAvailabilityOption)) {
      return { ok: false, code: 'invalid_query', error: 'خيار حالة التوفر غير صالح' };
    }
    availability = availRaw as ListingAvailabilityOption;
  }

  const statusRaw = readSingleQueryValue(rawQuery.status)?.trim();
  let status: ListingStatus | undefined;
  if (statusRaw && statusRaw !== 'all') {
    if (!VALID_LISTING_STATUSES.has(statusRaw as ListingStatus)) {
      return { ok: false, code: 'invalid_query', error: 'حالة الإعلان المطلوبة غير صالحة' };
    }
    status = statusRaw as ListingStatus;
  }

  const limitRaw = readSingleQueryValue(rawQuery.limit);
  const offsetRaw = readSingleQueryValue(rawQuery.offset);
  const pageRaw = readSingleQueryValue(rawQuery.page);
  const isExplicitlyPaginated =
    Boolean(limitRaw?.trim()) || Boolean(offsetRaw?.trim()) || Boolean(pageRaw?.trim());

  const limitRes = parseOptionalNumberParam(limitRaw, {
    integer: true,
    min: 1,
    max: 1000,
    label: 'حد النتائج (limit)',
  });
  if (!limitRes.ok) return { ok: false, code: 'invalid_query', error: limitRes.error };

  const offsetRes = parseOptionalNumberParam(offsetRaw, {
    integer: true,
    min: 0,
    max: 100_000,
    label: 'موضع البداية (offset)',
  });
  if (!offsetRes.ok) return { ok: false, code: 'invalid_query', error: offsetRes.error };

  const pageRes = parseOptionalNumberParam(pageRaw, {
    integer: true,
    min: 1,
    max: 10_000,
    label: 'رقم الصفحة (page)',
  });
  if (!pageRes.ok) return { ok: false, code: 'invalid_query', error: pageRes.error };

  const limit = isExplicitlyPaginated
    ? Math.min(MAX_LISTINGS_PAGE_LIMIT, limitRes.value ?? DEFAULT_LISTINGS_PAGE_LIMIT)
    : DEFAULT_UNPAGINATED_LISTINGS_LIMIT;

  const offset =
    offsetRes.value !== undefined
      ? offsetRes.value
      : pageRes.value !== undefined
      ? (pageRes.value - 1) * limit
      : 0;

  const categoryIdRaw = (
    readSingleQueryValue(rawQuery.categoryId) ?? readSingleQueryValue(rawQuery.category)
  )?.trim();
  const subCategoryIdRaw = (
    readSingleQueryValue(rawQuery.subCategoryId) ?? readSingleQueryValue(rawQuery.subCategory)
  )?.trim();
  const breedIdRaw = (
    readSingleQueryValue(rawQuery.breedId) ?? readSingleQueryValue(rawQuery.breed)
  )?.trim();
  const regionIdRaw = (
    readSingleQueryValue(rawQuery.regionId) ?? readSingleQueryValue(rawQuery.region)
  )?.trim();
  const sexRaw = readSingleQueryValue(rawQuery.sex)?.trim();
  const sellerIdRaw = readSingleQueryValue(rawQuery.sellerId)?.trim();

  return {
    ok: true,
    value: {
      q: qRaw,
      categoryId: categoryIdRaw && categoryIdRaw !== 'all' ? categoryIdRaw : undefined,
      subCategoryId:
        subCategoryIdRaw && subCategoryIdRaw !== 'all' ? subCategoryIdRaw : undefined,
      breedId: breedIdRaw && breedIdRaw !== 'all' ? breedIdRaw : undefined,
      regionId: regionIdRaw && regionIdRaw !== 'all' ? regionIdRaw : undefined,
      city: cityRaw,
      minPrice: minPriceRes.value,
      maxPrice: maxPriceRes.value,
      minQty: minQtyRes.value,
      maxQty: maxQtyRes.value,
      sex: sexRaw && sexRaw !== 'all' ? sexRaw : undefined,
      minAge: minAgeRes.value,
      maxAge: maxAgeRes.value,
      verifiedOnly: verifiedRes.value,
      vaccinatedOnly: vaccinatedRes.value,
      hasVideoOnly: hasVideoRes.value,
      negotiableOnly: negotiableRes.value,
      acceptsOffersOnly: offersRes.value,
      availability,
      status,
      includeAllStatuses: includeAllStatusesRes.value,
      sellerId: sellerIdRaw || undefined,
      sort,
      limit,
      offset,
      isExplicitlyPaginated,
    },
  };
}

export interface ActiveFilterChip {
  key: string;
  label: string;
  clearPatch: Partial<DirectoryFilters>;
}

export function buildActiveFilterChips(
  filters: DirectoryFilters,
  context: SearchLookupContext = {},
  lang: 'ar' | 'en' = 'ar'
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  const isEn = lang === 'en';

  if (filters.q.trim()) {
    chips.push({
      key: 'q',
      label: isEn ? `Search: ${filters.q.trim()}` : `بحث: ${filters.q.trim()}`,
      clearPatch: { q: '' },
    });
  }
  if (filters.categoryId !== 'all') {
    const rawName =
      context.categories?.find((c) => c.id === filters.categoryId)?.name || filters.categoryId;
    const name = trCategoryName(rawName, lang);
    chips.push({
      key: 'categoryId',
      label: isEn ? `Category: ${name}` : `التصنيف: ${name}`,
      clearPatch: { categoryId: 'all', subCategoryId: 'all', breedId: 'all' },
    });
  }
  if (filters.subCategoryId !== 'all') {
    const rawName =
      context.categories?.find((c) => c.id === filters.subCategoryId)?.name ||
      filters.subCategoryId;
    const name = trCategoryName(rawName, lang);
    chips.push({
      key: 'subCategoryId',
      label: isEn ? `Subcategory: ${name}` : `الفئة الفرعية: ${name}`,
      clearPatch: { subCategoryId: 'all' },
    });
  }
  if (filters.breedId !== 'all') {
    const rawName = context.breeds?.find((b) => b.id === filters.breedId)?.name || filters.breedId;
    const name = trBreedName(rawName, lang);
    chips.push({
      key: 'breedId',
      label: isEn ? `Breed: ${name}` : `السلالة: ${name}`,
      clearPatch: { breedId: 'all' },
    });
  }
  if (filters.regionId !== 'all') {
    const rawName = context.regions?.find((r) => r.id === filters.regionId)?.name || filters.regionId;
    const name = trRegionName(rawName, lang);
    chips.push({
      key: 'regionId',
      label: isEn ? `Region: ${name}` : `المنطقة: ${name}`,
      clearPatch: { regionId: 'all' },
    });
  }
  if (filters.city.trim()) {
    const cityLabel = trCityName(filters.city.trim(), lang);
    chips.push({
      key: 'city',
      label: isEn ? `City: ${cityLabel}` : `المدينة: ${filters.city.trim()}`,
      clearPatch: { city: '' },
    });
  }
  if (filters.sex !== 'all') {
    const sexLabel = trSexLabel(filters.sex, lang);
    chips.push({
      key: 'sex',
      label: isEn ? `Sex: ${sexLabel}` : `الجنس: ${filters.sex}`,
      clearPatch: { sex: 'all' },
    });
  }
  if (filters.minPrice.trim()) {
    const formatted = Number(filters.minPrice).toLocaleString('en-US');
    chips.push({
      key: 'minPrice',
      label: isEn ? `Min Price: ${formatted} SAR` : `السعر من ${formatted} ر.س`,
      clearPatch: { minPrice: '' },
    });
  }
  if (filters.maxPrice.trim()) {
    const formatted = Number(filters.maxPrice).toLocaleString('en-US');
    chips.push({
      key: 'maxPrice',
      label: isEn ? `Max Price: ${formatted} SAR` : `السعر حتى ${formatted} ر.س`,
      clearPatch: { maxPrice: '' },
    });
  }
  if (filters.minQty.trim()) {
    chips.push({
      key: 'minQty',
      label: isEn ? `Min Qty: ${filters.minQty} head` : `الكمية من ${filters.minQty} رأس`,
      clearPatch: { minQty: '' },
    });
  }
  if (filters.maxQty.trim()) {
    chips.push({
      key: 'maxQty',
      label: isEn ? `Max Qty: ${filters.maxQty} head` : `الكمية حتى ${filters.maxQty} رأس`,
      clearPatch: { maxQty: '' },
    });
  }
  if (filters.availability !== 'all') {
    const labelMap: Record<ListingAvailabilityOption, string> = isEn
      ? {
          all: '',
          available: 'Available',
          accepts_offers: 'Accepts Offers',
          negotiable: 'Negotiable',
          sold: 'Sold Listings',
        }
      : {
          all: '',
          available: 'متاح للشراء',
          accepts_offers: 'يقبل عروض السعر',
          negotiable: 'قابل للتفاوض',
          sold: 'إعلانات مباعة',
        };
    chips.push({
      key: 'availability',
      label: isEn ? `Availability: ${labelMap[filters.availability]}` : `التوفر: ${labelMap[filters.availability]}`,
      clearPatch: { availability: 'all' },
    });
  }
  if (filters.verifiedOnly) {
    chips.push({
      key: 'verifiedOnly',
      label: isEn ? 'Verified breeders only' : 'مربون موثقون فقط',
      clearPatch: { verifiedOnly: false },
    });
  }
  if (filters.vaccinatedOnly) {
    chips.push({
      key: 'vaccinatedOnly',
      label: isEn ? 'Vaccinated only' : 'محصّن بيطرياً فقط',
      clearPatch: { vaccinatedOnly: false },
    });
  }
  if (filters.hasVideoOnly) {
    chips.push({
      key: 'hasVideoOnly',
      label: isEn ? 'With video only' : 'يحتوي على فيديو فقط',
      clearPatch: { hasVideoOnly: false },
    });
  }
  if (filters.negotiableOnly) {
    chips.push({
      key: 'negotiableOnly',
      label: isEn ? 'Negotiable only' : 'قابل للتفاوض فقط',
      clearPatch: { negotiableOnly: false },
    });
  }
  if (filters.acceptsOffersOnly) {
    chips.push({
      key: 'acceptsOffersOnly',
      label: isEn ? 'Accepts price offers' : 'يقبل السوم والعروض',
      clearPatch: { acceptsOffersOnly: false },
    });
  }

  return chips;
}

export async function fetchAllPaginatedListings(
  fetcher: (
    params: Record<string, string | number | boolean | undefined>,
    options?: { signal?: AbortSignal }
  ) => Promise<
    Pick<
      import('../types/marketplace').PaginatedListingsResponse,
      'listings' | 'totalCount' | 'hasMore' | 'nextOffset'
    >
  >,
  params: Record<string, string | number | boolean | undefined> = {},
  options: { signal?: AbortSignal; pageSize?: number; maxPages?: number } = {}
): Promise<{ listings: import('../types/marketplace').Listing[]; totalCount: number }> {
  const pageLimit = Math.min(50, Math.max(1, options.pageSize ?? 50));
  const maxPages = Math.max(1, options.maxPages ?? 100);
  let offset = 0;
  let reportedTotal = 0;
  const aggregated: import('../types/marketplace').Listing[] = [];
  const seenIds = new Set<string>();

  for (let page = 0; page < maxPages; page += 1) {
    const res = await fetcher(
      { ...params, limit: pageLimit, offset },
      options.signal ? { signal: options.signal } : {}
    );
    if (page === 0 && typeof res.totalCount === 'number') {
      reportedTotal = res.totalCount;
    }
    let addedThisPage = 0;
    for (const item of res.listings) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        aggregated.push(item);
        addedThisPage += 1;
      }
    }
    if (
      !res.hasMore ||
      res.nextOffset === null ||
      res.nextOffset === undefined ||
      addedThisPage === 0
    ) {
      break;
    }
    offset = res.nextOffset;
  }

  return {
    listings: aggregated,
    totalCount: Math.max(reportedTotal, aggregated.length),
  };
}

