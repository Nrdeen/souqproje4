import { validateAndParseListingQuery } from '../../src/lib/listing-search';
import type { MarketplaceRepository } from '../repositories/types';
import {
  normalizeSaudiQuery,
  resolveConversationalQuery,
} from './saudiQueryNormalizer';
import type {
  AiBreedPriceGuide,
  AiChatHistoryItem,
  AiListingCard,
  AiMarketplaceContext,
  NormalizedSaudiQuery,
} from './types';

export class AiToolExecutionError extends Error {
  constructor(
    message: string,
    public readonly toolName: string,
    public readonly causeError?: unknown
  ) {
    super(message);
    this.name = 'AiToolExecutionError';
  }
}

function toSafeCard(
  listing: any,
  regionsMap: Map<string, string>,
  breedsMap: Map<string, string>,
  categoriesMap: Map<string, string>,
  sellersMap: Map<string, { displayName: string; verified: boolean }>
): AiListingCard {
  const seller = sellersMap.get(listing.sellerId);
  const firstImg =
    Array.isArray(listing.images) && listing.images.length > 0 ? listing.images[0]?.url : null;

  return {
    id: String(listing.id),
    title: String(listing.title),
    priceAmount: Number(listing.priceAmount) || 0,
    currency: 'SAR',
    city: String(listing.city || ''),
    regionName: regionsMap.get(listing.regionId) || '',
    breedName: breedsMap.get(listing.breedId) || '',
    categoryName: categoriesMap.get(listing.categoryId) || '',
    ageMonths: Number(listing.ageMonths) || 0,
    weightKg: Number(listing.weightKg) || 0,
    quantity: Number(listing.quantity) || 1,
    vaccinated: Boolean(listing.vaccinated),
    isNegotiable: Boolean(listing.isNegotiable),
    allowPriceOffers: Boolean(listing.allowPriceOffers ?? listing.isNegotiable),
    imageUrl: typeof firstImg === 'string' && firstImg ? firstImg : null,
    sellerDisplayName: seller?.displayName || 'مربي مسجل',
    sellerVerified: Boolean(seller?.verified),
    likesCount: Number(listing.likesCount) || 0,
  };
}

function buildQueryParams(
  nq: NormalizedSaudiQuery,
  includeCity: boolean,
  includeKeywords: boolean
): Record<string, string> {
  const params: Record<string, string> = {
    status: 'Published',
    limit: '5',
    offset: '0',
    sort: nq.sort || 'newest',
  };
  if (nq.breedId) params.breedId = nq.breedId;
  if (nq.categoryId) params.categoryId = nq.categoryId;
  if (nq.subCategoryId) params.subCategoryId = nq.subCategoryId;
  if (nq.regionId) params.regionId = nq.regionId;
  if (includeCity && nq.city) params.city = nq.city;
  if (nq.minPrice !== undefined) params.minPrice = String(nq.minPrice);
  if (nq.maxPrice !== undefined) params.maxPrice = String(nq.maxPrice);
  if (nq.sex) params.sex = nq.sex;
  if (nq.vaccinatedOnly) params.vaccinatedOnly = 'true';
  if (nq.negotiableOnly) params.negotiableOnly = 'true';
  if (nq.acceptsOffersOnly) params.acceptsOffersOnly = 'true';
  if (includeKeywords && nq.searchKeywords) params.q = nq.searchKeywords;
  return params;
}

const VALID_SEX_VALUES = new Set(['ذكر', 'أنثى', 'قطيع مختلط']);

export async function gatherMarketplaceContext(
  repo: MarketplaceRepository,
  userMessage: string,
  history: AiChatHistoryItem[] = []
): Promise<AiMarketplaceContext> {
  const resolution = resolveConversationalQuery(userMessage, history);
  const { intent, mergedQuery: nq, turnQuery, clarificationStage, isFilterModification } =
    resolution;

  // Casual greetings and small talk never trigger expensive marketplace queries
  if (intent === 'greeting' || intent === 'casual_chat') {
    return {
      intent,
      normalizedQuery: nq,
      turnQuery,
      clarificationStage: 'none',
      isFilterModification: false,
      listings: [],
      totalMatchingListings: 0,
      breedGuides: [],
      helpTopics: [],
    };
  }

  let bootstrap: Awaited<ReturnType<MarketplaceRepository['getBootstrap']>>;
  try {
    // Read-only public bootstrap (viewer = null) guarantees zero private data exposure
    bootstrap = await repo.getBootstrap(null, null);
  } catch (err) {
    throw new AiToolExecutionError(
      'تعذر جلب بيانات السوق حالياً، حاول مرة أخرى بعد قليل.',
      'getBootstrap',
      err
    );
  }

  const regionsMap = new Map<string, string>();
  for (const r of bootstrap.regions || []) {
    regionsMap.set(r.id, r.name);
  }

  const breedsMap = new Map<string, string>();
  for (const b of bootstrap.breeds || []) {
    breedsMap.set(b.id, b.name);
  }

  const categoriesMap = new Map<string, string>();
  for (const c of bootstrap.categories || []) {
    categoriesMap.set(c.id, c.name);
  }

  const sellersMap = new Map<string, { displayName: string; verified: boolean }>();
  for (const s of bootstrap.sellers || []) {
    sellersMap.set(s.userId, {
      displayName: s.displayName || 'مربي مسجل',
      verified: s.verificationStatus === 'Verified',
    });
  }

  const indicativeByBreed = new Map<string, any[]>();
  for (const item of bootstrap.indicativePrices || []) {
    const arr = indicativeByBreed.get(item.breedId) || [];
    arr.push(item);
    indicativeByBreed.set(item.breedId, arr);
  }

  const allGuides: AiBreedPriceGuide[] = (bootstrap.breeds || []).map((b: any) => ({
    breedId: String(b.id),
    breedName: String(b.name),
    origin: String(b.origin || ''),
    avgWeightKg: String(b.avgWeightKg || ''),
    priceRangeSar: String(b.priceRangeSar || ''),
    summary: String(b.summary || ''),
    indicativeEntries: (indicativeByBreed.get(b.id) || []).map((ip) => ({
      ageLabel: String(ip.ageLabel || ''),
      minPriceSar: Number(ip.minPriceSar) || 0,
      maxPriceSar: Number(ip.maxPriceSar) || 0,
      marketNote: String(ip.marketNote || ''),
    })),
  }));

  const isComparisonPrompt = /(?:(?:ال)?فرق\s+بين|قارن|مقارن|ايهما\s+افضل)/u.test(nq.normalizedText);
  const relevantGuides =
    nq.breedId && !isComparisonPrompt
      ? allGuides.filter((g) => g.breedId === nq.breedId)
      : allGuides;

  let listings: AiListingCard[] = [];
  let totalMatchingListings = 0;

  if (intent === 'marketplace_search' && clarificationStage === 'execute_search') {
    const runSearch = async (params: Record<string, string>) => {
      const parsed = validateAndParseListingQuery(params);
      if (!parsed.ok) return { listings: [], totalCount: 0 };
      try {
        // Always pass viewer = null so only Published listings from active sellers are queried
        return await repo.queryListings(parsed.value, null);
      } catch (err) {
        throw new AiToolExecutionError(
          'تعذر البحث في الإعلانات حالياً بسبب خلل مؤقت في جلب البيانات، حاول مرة أخرى بعد قليل.',
          'queryListings',
          err
        );
      }
    };

    let result = await runSearch(buildQueryParams(nq, true, true));

    // If strict keyword+city returned 0, relax keyword first, then city (keeping breed/region/price/sex)
    if (result.totalCount === 0 && nq.searchKeywords) {
      result = await runSearch(buildQueryParams(nq, true, false));
    }
    if (result.totalCount === 0 && nq.city) {
      result = await runSearch(buildQueryParams(nq, false, false));
    }

    totalMatchingListings = result.totalCount;
    listings = (result.listings || [])
      .filter((l: any) => l && l.status === 'Published')
      .slice(0, 4)
      .map((l: any) => toSafeCard(l, regionsMap, breedsMap, categoriesMap, sellersMap));
  }

  const helpTopics =
    intent === 'marketplace_help'
      ? [
          'إضافة إعلان جديد أو تعديله من زر "أضف إعلانك" أو "لوحة حسابي" مع إمكانية الحفظ كمسودة أو الإرسال للمراجعة',
          'التفاوض وتقديم السوم عبر زر "تقديم عرض سعر للمربي" أو المراسلة المباشرة داخل صفحة الإعلان',
          'إظهار رقم البائع متاح للمستخدمين المسجلين لحماية خصوصية المربين',
          'التعامل المالي يتم مباشرة عند المعاينة والاتفاق ولا توجد مدفوعات إلكترونية داخل المنصة',
          'توثيق المربي يتم عبر طلب التوثيق ومراجعة المشرفين من لوحة الإدارة',
        ]
      : [];

  return {
    intent,
    normalizedQuery: nq,
    turnQuery,
    clarificationStage,
    isFilterModification,
    listings,
    totalMatchingListings,
    breedGuides: relevantGuides,
    helpTopics,
  };
}

export interface ToolSearchArgs {
  query?: string;
  breed?: string;
  region?: string;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  sex?: string;
  vaccinatedOnly?: boolean;
  negotiableOnly?: boolean;
  sort?: string;
  limit?: number;
}

const VALID_SORTS = new Set(['newest', 'oldest', 'price_asc', 'price_desc', 'most_liked']);

/**
 * Read-only Gemini function-calling executor for searching ONLY Published marketplace listings.
 * Always queries with viewer = null so drafts, pending/rejected listings, and private fields are excluded.
 */
export async function executeSearchPublishedListingsTool(
  repo: MarketplaceRepository,
  rawArgs: Record<string, unknown>
): Promise<{
  totalMatchingListings: number;
  cards: AiListingCard[];
  listingsSummary: Array<{
    id: string;
    title: string;
    priceSar: number;
    breed: string;
    region: string;
    city: string;
    ageMonths: number;
    weightKg: number;
    quantity: number;
    vaccinated: boolean;
    negotiable: boolean;
    sellerDisplayName: string;
    sellerVerified: boolean;
  }>;
}> {
  const args = (rawArgs || {}) as ToolSearchArgs;
  const combinedHint = [args.query, args.breed, args.region, args.city]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join(' ');
  const nq = normalizeSaudiQuery(combinedHint);

  if (typeof args.minPrice === 'number' && Number.isFinite(args.minPrice) && args.minPrice >= 0) {
    nq.minPrice = Math.round(args.minPrice);
  }
  if (typeof args.maxPrice === 'number' && Number.isFinite(args.maxPrice) && args.maxPrice > 0) {
    nq.maxPrice = Math.round(args.maxPrice);
  }
  if (typeof args.sex === 'string' && VALID_SEX_VALUES.has(args.sex.trim())) {
    nq.sex = args.sex.trim() as NormalizedSaudiQuery['sex'];
  }
  if (typeof args.vaccinatedOnly === 'boolean') {
    nq.vaccinatedOnly = args.vaccinatedOnly;
  }
  if (typeof args.negotiableOnly === 'boolean') {
    nq.negotiableOnly = args.negotiableOnly;
  }
  if (typeof args.sort === 'string' && VALID_SORTS.has(args.sort)) {
    nq.sort = args.sort as NormalizedSaudiQuery['sort'];
  }

  const limitNum =
    typeof args.limit === 'number' && Number.isFinite(args.limit)
      ? Math.max(1, Math.min(4, Math.round(args.limit)))
      : 4;

  let bootstrap: Awaited<ReturnType<MarketplaceRepository['getBootstrap']>>;
  try {
    bootstrap = await repo.getBootstrap(null, null);
  } catch (err) {
    throw new AiToolExecutionError(
      'تعذر البحث في الإعلانات حالياً بسبب خلل مؤقت في جلب البيانات، حاول مرة أخرى بعد قليل.',
      'searchPublishedListings',
      err
    );
  }

  const regionsMap = new Map<string, string>();
  for (const r of bootstrap.regions || []) regionsMap.set(r.id, r.name);

  const breedsMap = new Map<string, string>();
  for (const b of bootstrap.breeds || []) breedsMap.set(b.id, b.name);

  const categoriesMap = new Map<string, string>();
  for (const c of bootstrap.categories || []) categoriesMap.set(c.id, c.name);

  const sellersMap = new Map<string, { displayName: string; verified: boolean }>();
  for (const s of bootstrap.sellers || []) {
    sellersMap.set(s.userId, {
      displayName: s.displayName || 'مربي مسجل',
      verified: s.verificationStatus === 'Verified',
    });
  }

  const runSearch = async (params: Record<string, string>) => {
    params.limit = String(limitNum);
    const parsed = validateAndParseListingQuery(params);
    if (!parsed.ok) return { listings: [], totalCount: 0 };
    try {
      return await repo.queryListings(parsed.value, null);
    } catch (err) {
      throw new AiToolExecutionError(
        'تعذر البحث في الإعلانات حالياً بسبب خلل مؤقت في جلب البيانات، حاول مرة أخرى بعد قليل.',
        'searchPublishedListings',
        err
      );
    }
  };

  let result = await runSearch(buildQueryParams(nq, true, true));
  if (result.totalCount === 0 && nq.searchKeywords) {
    result = await runSearch(buildQueryParams(nq, true, false));
  }
  if (result.totalCount === 0 && nq.city) {
    result = await runSearch(buildQueryParams(nq, false, false));
  }

  const cards = (result.listings || [])
    .filter((l: any) => l && l.status === 'Published')
    .slice(0, limitNum)
    .map((l: any) => toSafeCard(l, regionsMap, breedsMap, categoriesMap, sellersMap));

  return {
    totalMatchingListings: result.totalCount,
    cards,
    listingsSummary: cards.map((c) => ({
      id: c.id,
      title: c.title,
      priceSar: c.priceAmount,
      breed: c.breedName,
      region: c.regionName,
      city: c.city,
      ageMonths: c.ageMonths,
      weightKg: c.weightKg,
      quantity: c.quantity,
      vaccinated: c.vaccinated,
      negotiable: c.isNegotiable,
      sellerDisplayName: c.sellerDisplayName,
      sellerVerified: c.sellerVerified,
    })),
  };
}

/**
 * Read-only Gemini function-calling executor returning indicative Saudi livestock breed price guides.
 */
export async function executeGetBreedPriceGuidesTool(
  repo: MarketplaceRepository,
  rawArgs: Record<string, unknown>
): Promise<{ guides: AiBreedPriceGuide[] }> {
  const breedHint = typeof rawArgs?.breed === 'string' ? rawArgs.breed.trim() : '';
  const nq = breedHint ? normalizeSaudiQuery(breedHint) : null;

  let bootstrap: Awaited<ReturnType<MarketplaceRepository['getBootstrap']>>;
  try {
    bootstrap = await repo.getBootstrap(null, null);
  } catch (err) {
    throw new AiToolExecutionError(
      'تعذر جلب دليل الأسعار حالياً، حاول مرة أخرى بعد قليل.',
      'getBreedPriceGuides',
      err
    );
  }

  const indicativeByBreed = new Map<string, any[]>();
  for (const item of bootstrap.indicativePrices || []) {
    const arr = indicativeByBreed.get(item.breedId) || [];
    arr.push(item);
    indicativeByBreed.set(item.breedId, arr);
  }

  const allGuides: AiBreedPriceGuide[] = (bootstrap.breeds || []).map((b: any) => ({
    breedId: String(b.id),
    breedName: String(b.name),
    origin: String(b.origin || ''),
    avgWeightKg: String(b.avgWeightKg || ''),
    priceRangeSar: String(b.priceRangeSar || ''),
    summary: String(b.summary || ''),
    indicativeEntries: (indicativeByBreed.get(b.id) || []).map((ip) => ({
      ageLabel: String(ip.ageLabel || ''),
      minPriceSar: Number(ip.minPriceSar) || 0,
      maxPriceSar: Number(ip.maxPriceSar) || 0,
      marketNote: String(ip.marketNote || ''),
    })),
  }));

  const filtered = nq?.breedId ? allGuides.filter((g) => g.breedId === nq.breedId) : allGuides;
  return { guides: filtered.length > 0 ? filtered : allGuides };
}
