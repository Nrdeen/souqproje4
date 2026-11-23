import type { Conversation, Listing, PriceOffer, Region } from '../types/marketplace';
import { trRegionName } from './bilingual';
import { formatArabicGregorianDate } from './format';

export type AnalyticsDateRangeDays = 7 | 14 | 30;
export type AnalyticsStatusScope =
  | 'all'
  | 'Published'
  | 'Pending'
  | 'Rejected'
  | 'Sold'
  | 'Draft'
  | 'Expired';

export interface DailyAnalyticsPoint {
  dateKey: string;
  label: string;
  count: number;
  published: number;
  pending: number;
}

export interface RegionAnalyticsPoint {
  regionId: string;
  name: string;
  count: number;
  avgPrice: number;
  totalHeads: number;
  sharePercent: number;
}

export interface ScopedAnalyticsSummary {
  totalListings: number;
  publishedCount: number;
  pendingCount: number;
  soldCount: number;
  rejectedCount: number;
  draftCount: number;
  expiredCount: number;
  totalHeads: number;
  totalLikes: number;
  averagePrice: number;
  incomingOffersCount: number;
  pendingOffersCount: number;
  sellerConversationsCount: number;
}

/**
 * Ensures personal seller analytics include strictly the authenticated user's
 * own listings and activity, while admin view sees the full marketplace dataset.
 */
export function scopeAnalyticsDataset(params: {
  userId: string;
  isAdmin: boolean;
  allListings: Listing[];
  priceOffers?: PriceOffer[];
  conversations?: Conversation[];
}): {
  listings: Listing[];
  offers: PriceOffer[];
  conversations: Conversation[];
} {
  const { userId, isAdmin, allListings, priceOffers = [], conversations = [] } = params;
  if (isAdmin) {
    return {
      listings: allListings,
      offers: priceOffers,
      conversations,
    };
  }

  return {
    listings: allListings.filter((l) => l.sellerId === userId),
    offers: priceOffers.filter((o) => o.sellerId === userId),
    conversations: conversations.filter((c) => c.sellerId === userId),
  };
}

export function computeAnalyticsSummary(params: {
  listings: Listing[];
  offers?: PriceOffer[];
  conversations?: Conversation[];
}): ScopedAnalyticsSummary {
  const { listings, offers = [], conversations = [] } = params;
  const publishedCount = listings.filter((l) => l.status === 'Published').length;
  const pendingCount = listings.filter((l) => l.status === 'Pending').length;
  const soldCount = listings.filter((l) => l.status === 'Sold').length;
  const rejectedCount = listings.filter((l) => l.status === 'Rejected').length;
  const draftCount = listings.filter((l) => l.status === 'Draft').length;
  const expiredCount = listings.filter((l) => l.status === 'Expired').length;
  const totalHeads = listings.reduce((acc, l) => acc + Math.max(1, Number(l.quantity) || 1), 0);
  const totalLikes = listings.reduce((acc, l) => acc + (Number(l.likesCount) || 0), 0);
  const averagePrice =
    listings.length > 0
      ? Math.round(listings.reduce((acc, l) => acc + (Number(l.priceAmount) || 0), 0) / listings.length)
      : 0;

  return {
    totalListings: listings.length,
    publishedCount,
    pendingCount,
    soldCount,
    rejectedCount,
    draftCount,
    expiredCount,
    totalHeads,
    totalLikes,
    averagePrice,
    incomingOffersCount: offers.length,
    pendingOffersCount: offers.filter((o) => o.status === 'pending').length,
    sellerConversationsCount: conversations.length,
  };
}

function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function buildDailyAnalyticsSeries(params: {
  allScopedListings: Listing[];
  filteredListings: Listing[];
  rangeDays: AnalyticsDateRangeDays;
  nowMs?: number;
  lang?: 'ar' | 'en';
}): DailyAnalyticsPoint[] {
  const { allScopedListings, filteredListings, rangeDays, nowMs, lang = 'ar' } = params;
  const timestamps = allScopedListings
    .map((l) => new Date(l.createdAt).getTime())
    .filter((t) => !Number.isNaN(t));
  const anchorMs = timestamps.length > 0 ? Math.max(...timestamps) : nowMs ?? Date.now();
  const anchorDate = new Date(anchorMs);
  anchorDate.setHours(0, 0, 0, 0);

  const byDate = new Map<string, { count: number; published: number; pending: number }>();
  for (const item of filteredListings) {
    const d = new Date(item.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = toLocalDateKey(d);
    const curr = byDate.get(key) || { count: 0, published: 0, pending: 0 };
    curr.count += 1;
    if (item.status === 'Published') curr.published += 1;
    if (item.status === 'Pending') curr.pending += 1;
    byDate.set(key, curr);
  }

  const points: DailyAnalyticsPoint[] = [];
  for (let i = rangeDays - 1; i >= 0; i -= 1) {
    const d = new Date(anchorDate);
    d.setDate(anchorDate.getDate() - i);
    const key = toLocalDateKey(d);
    const stats = byDate.get(key) || { count: 0, published: 0, pending: 0 };
    points.push({
      dateKey: key,
      label: formatArabicGregorianDate(d, { month: 'short', day: 'numeric' }, lang),
      count: stats.count,
      published: stats.published,
      pending: stats.pending,
    });
  }
  return points;
}

export function buildRegionAnalyticsSeries(params: {
  filteredListings: Listing[];
  regions: Region[];
  lang?: 'ar' | 'en';
}): RegionAnalyticsPoint[] {
  const { filteredListings, regions, lang = 'ar' } = params;
  const total = filteredListings.length || 1;
  return regions
    .map((reg) => {
      const items = filteredListings.filter((l) => l.regionId === reg.id);
      const count = items.length;
      const avgPrice =
        count > 0
          ? Math.round(items.reduce((acc, l) => acc + l.priceAmount, 0) / count)
          : 0;
      const totalHeads = items.reduce((acc, l) => acc + (l.quantity || 1), 0);
      const sharePercent = filteredListings.length > 0 ? Math.round((count / total) * 100) : 0;
      return {
        regionId: reg.id,
        name: trRegionName(reg.name, lang),
        count,
        avgPrice,
        totalHeads,
        sharePercent,
      };
    })
    .sort((a, b) => b.count - a.count);
}
