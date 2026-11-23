import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  computeConversationUnreadCount,
  toUserConversation,
  type ConversationLike,
} from '../../server/conversations';
import {
  buildDailyAnalyticsSeries,
  buildRegionAnalyticsSeries,
  computeAnalyticsSummary,
  scopeAnalyticsDataset,
} from '../../src/lib/analytics';
import { formatArabicGregorianDate } from '../../src/lib/format';
import {
  computeHerdSummary,
  filterSubCategoriesByParent,
  validateExpectedPriceRule,
} from '../../src/lib/listing-validation';
import type { Category, Conversation, Listing, PriceOffer, Region } from '../../src/types/marketplace';

test('computeConversationUnreadCount and toUserConversation calculate unread counts and mask private user fields', () => {
  const conv: ConversationLike = {
    id: 'conv_1',
    listingId: 'lst_1',
    buyerId: 'usr_buyer',
    sellerId: 'usr_seller',
    updatedAt: '2026-04-01T10:20:00Z',
    readAtByUserId: {
      usr_seller: '2026-04-01T10:05:00Z',
      usr_buyer: '2026-04-01T10:15:00Z',
    },
    messages: [
      {
        id: 'm1',
        conversationId: 'conv_1',
        senderId: 'usr_buyer',
        body: 'السلام عليكم، كم الحد؟',
        createdAt: '2026-04-01T10:00:00Z',
      },
      {
        id: 'm2',
        conversationId: 'conv_1',
        senderId: 'usr_seller',
        body: 'وعليكم السلام، على السوم',
        createdAt: '2026-04-01T10:05:00Z',
      },
      {
        id: 'm3',
        conversationId: 'conv_1',
        senderId: 'usr_buyer',
        body: 'هل يوجد توصيل؟',
        createdAt: '2026-04-01T10:10:00Z',
      },
      {
        id: 'm4',
        conversationId: 'conv_1',
        senderId: 'usr_buyer',
        body: 'وهل التحصينات مكتملة؟',
        createdAt: '2026-04-01T10:20:00Z',
      },
    ],
  };

  // Seller read up to 10:05, so m3 (10:10) and m4 (10:20) from buyer are unread
  assert.equal(computeConversationUnreadCount(conv, 'usr_seller'), 2);
  // Buyer read up to 10:15 and sent m3/m4 themselves, so 0 unread
  assert.equal(computeConversationUnreadCount(conv, 'usr_buyer'), 0);

  // Legacy conversation without readAtByUserId uses latest own sent message as baseline
  const legacyConv: ConversationLike = {
    id: 'conv_legacy',
    listingId: 'lst_1',
    buyerId: 'usr_buyer',
    sellerId: 'usr_seller',
    updatedAt: '2026-04-01T10:12:00Z',
    messages: [
      {
        id: 'lm1',
        conversationId: 'conv_legacy',
        senderId: 'usr_buyer',
        body: 'مرحبا',
        createdAt: '2026-04-01T10:00:00Z',
      },
      {
        id: 'lm2',
        conversationId: 'conv_legacy',
        senderId: 'usr_seller',
        body: 'أهلاً بك',
        createdAt: '2026-04-01T10:05:00Z',
      },
      {
        id: 'lm3',
        conversationId: 'conv_legacy',
        senderId: 'usr_buyer',
        body: 'كم السوم؟',
        createdAt: '2026-04-01T10:12:00Z',
      },
    ],
  };
  assert.equal(computeConversationUnreadCount(legacyConv, 'usr_seller'), 1);

  const dto = toUserConversation(conv, 'usr_seller', {
    users: [
      { id: 'usr_buyer', name: 'سعد المشتري' },
      { id: 'usr_seller', name: 'مزرعة الشمال' },
    ],
    sellers: [{ userId: 'usr_seller', displayName: 'مراح الشمال المعتمد' }],
    listings: [{ id: 'lst_1', title: 'جذعان نعيمي عدد 20 رأس' }],
  });

  assert.equal(dto.otherParticipantId, 'usr_buyer');
  assert.equal(dto.otherParticipantName, 'سعد المشتري');
  assert.equal(dto.listingTitle, 'جذعان نعيمي عدد 20 رأس');
  assert.equal(dto.unreadCount, 2);
  assert.equal(dto.lastReadAt, '2026-04-01T10:05:00Z');
  // Other participant's readAtByUserId map is not leaked to the client
  assert.equal('readAtByUserId' in dto, false);
});

test('scopeAnalyticsDataset and computeAnalyticsSummary isolate seller stats from marketplace-wide stats', () => {
  const listings: Listing[] = [
    {
      id: 'l_s1_1',
      sellerId: 'seller_1',
      categoryId: 'cat_sheep',
      subCategoryId: 'sub_slaughter',
      breedId: 'brd_naimi',
      regionId: 'reg_riyadh',
      city: 'الرياض',
      title: 'نعيمي 1',
      slug: 'l1',
      description: 'desc',
      priceAmount: 1800,
      currency: 'SAR',
      sex: 'ذكر',
      ageMonths: 8,
      weightKg: 45,
      quantity: 10,
      isNegotiable: true,
      vaccinated: true,
      status: 'Published',
      publishedAt: '2026-04-10T08:00:00Z',
      createdAt: '2026-04-10T08:00:00Z',
      updatedAt: '2026-04-10T08:00:00Z',
      likesCount: 5,
      images: [],
    },
    {
      id: 'l_s1_2',
      sellerId: 'seller_1',
      categoryId: 'cat_sheep',
      subCategoryId: 'sub_breeding',
      breedId: 'brd_najdi',
      regionId: 'reg_qassim',
      city: 'بريدة',
      title: 'نجدي 2',
      slug: 'l2',
      description: 'desc',
      priceAmount: 2000,
      currency: 'SAR',
      sex: 'أنثى',
      ageMonths: 12,
      weightKg: 50,
      quantity: 4,
      isNegotiable: false,
      vaccinated: true,
      status: 'Sold',
      publishedAt: '2026-04-11T08:00:00Z',
      createdAt: '2026-04-11T08:00:00Z',
      updatedAt: '2026-04-11T08:00:00Z',
      likesCount: 3,
      images: [],
    },
    {
      id: 'l_s2_other',
      sellerId: 'seller_2',
      categoryId: 'cat_goats',
      subCategoryId: 'sub_slaughter',
      breedId: 'brd_ardhi',
      regionId: 'reg_makkah',
      city: 'جدة',
      title: 'إعلان بائع آخر ضخم',
      slug: 'l3',
      description: 'desc',
      priceAmount: 9900,
      currency: 'SAR',
      sex: 'ذكر',
      ageMonths: 10,
      weightKg: 60,
      quantity: 200,
      isNegotiable: true,
      vaccinated: true,
      status: 'Published',
      publishedAt: '2026-04-12T08:00:00Z',
      createdAt: '2026-04-12T08:00:00Z',
      updatedAt: '2026-04-12T08:00:00Z',
      likesCount: 99,
      images: [],
    },
  ];

  const offers: PriceOffer[] = [
    {
      id: 'off_mine',
      listingId: 'l_s1_1',
      buyerId: 'buyer_1',
      buyerName: 'خالد',
      sellerId: 'seller_1',
      offeredPrice: 1700,
      quantity: 5,
      note: '',
      status: 'pending',
      createdAt: '2026-04-11T10:00:00Z',
      updatedAt: '2026-04-11T10:00:00Z',
    },
    {
      id: 'off_other_seller',
      listingId: 'l_s2_other',
      buyerId: 'buyer_2',
      buyerName: 'ناصر',
      sellerId: 'seller_2',
      offeredPrice: 9000,
      quantity: 10,
      note: '',
      status: 'pending',
      createdAt: '2026-04-12T10:00:00Z',
      updatedAt: '2026-04-12T10:00:00Z',
    },
  ];

  const convs: Conversation[] = [
    {
      id: 'c_mine',
      listingId: 'l_s1_1',
      buyerId: 'buyer_1',
      sellerId: 'seller_1',
      updatedAt: '2026-04-11T09:00:00Z',
      messages: [],
    },
    {
      id: 'c_other',
      listingId: 'l_s2_other',
      buyerId: 'buyer_2',
      sellerId: 'seller_2',
      updatedAt: '2026-04-12T09:00:00Z',
      messages: [],
    },
  ];

  const sellerScoped = scopeAnalyticsDataset({
    userId: 'seller_1',
    isAdmin: false,
    allListings: listings,
    priceOffers: offers,
    conversations: convs,
  });

  assert.equal(sellerScoped.listings.length, 2);
  assert.ok(sellerScoped.listings.every((l) => l.sellerId === 'seller_1'));
  assert.equal(sellerScoped.offers.length, 1);
  assert.equal(sellerScoped.conversations.length, 1);

  const summary = computeAnalyticsSummary(sellerScoped);
  assert.equal(summary.totalListings, 2);
  assert.equal(summary.publishedCount, 1);
  assert.equal(summary.soldCount, 1);
  assert.equal(summary.totalHeads, 14);
  assert.equal(summary.totalLikes, 8);
  assert.equal(summary.incomingOffersCount, 1);
  assert.equal(summary.pendingOffersCount, 1);
  assert.equal(summary.sellerConversationsCount, 1);
  // Avg of seller_1 listings (1800 and 2000) = 1900, NOT polluted by 9900
  assert.equal(summary.averagePrice, 1900);

  const regions: Region[] = [
    { id: 'reg_riyadh', name: 'الرياض', parentId: null },
    { id: 'reg_qassim', name: 'القصيم', parentId: null },
    { id: 'reg_makkah', name: 'مكة المكرمة', parentId: null },
  ];
  const regionSeries = buildRegionAnalyticsSeries({
    filteredListings: sellerScoped.listings,
    regions,
  });
  // Makkah belongs to seller_2 only so its count in seller_1 analytics must be 0
  const makkahPoint = regionSeries.find((r) => r.regionId === 'reg_makkah');
  assert.equal(makkahPoint?.count, 0);
  assert.equal(regionSeries.filter((r) => r.count > 0).length, 2);

  // Admin scope sees marketplace-wide records
  const adminScoped = scopeAnalyticsDataset({
    userId: 'admin_1',
    isAdmin: true,
    allListings: listings,
    priceOffers: offers,
    conversations: convs,
  });
  assert.equal(adminScoped.listings.length, 3);
  assert.equal(adminScoped.offers.length, 2);
});

test('formatArabicGregorianDate and buildDailyAnalyticsSeries use ar-SA-u-ca-gregory Gregorian dates', () => {
  const formatted = formatArabicGregorianDate('2026-04-12T12:00:00Z', {
    day: 'numeric',
    month: 'short',
  });
  // Verify Gregorian month (أبريل) rather than Hijri month (شوال/ذو القعدة)
  assert.ok(formatted.includes('أبريل'), `Expected Gregorian Arabic month in: ${formatted}`);

  const series = buildDailyAnalyticsSeries({
    allScopedListings: [],
    filteredListings: [],
    rangeDays: 7,
    nowMs: new Date('2026-04-12T12:00:00Z').getTime(),
  });
  assert.equal(series.length, 7);
  assert.ok(series[series.length - 1].label.includes('أبريل'));
});

test('validateExpectedPriceRule, computeHerdSummary, and filterSubCategoriesByParent enforce Phase 2B listing form rules', () => {
  assert.deepEqual(
    validateExpectedPriceRule({ priceAmount: 1800, expectedPrice: '' }),
    { ok: true, value: null }
  );
  assert.deepEqual(
    validateExpectedPriceRule({ priceAmount: 1800, expectedPrice: 1700 }),
    { ok: true, value: 1700 }
  );
  assert.deepEqual(
    validateExpectedPriceRule({ priceAmount: 1800, expectedPrice: 1800 }),
    { ok: true, value: 1800 }
  );

  const tooHigh = validateExpectedPriceRule({ priceAmount: 1800, expectedPrice: 2000 });
  assert.equal(tooHigh.ok, false);

  const nonPositive = validateExpectedPriceRule({ priceAmount: 1800, expectedPrice: 0 });
  assert.equal(nonPositive.ok, false);

  const summary = computeHerdSummary({
    priceAmount: 1500,
    expectedPrice: 1400,
    quantity: 12,
  });
  assert.equal(summary.isValidQuantity, true);
  assert.equal(summary.quantity, 12);
  assert.equal(summary.totalAskingValue, 18000);
  assert.equal(summary.totalExpectedValue, 16800);

  const invalidQty = computeHerdSummary({
    priceAmount: 1500,
    expectedPrice: '',
    quantity: 0,
  });
  assert.equal(invalidQty.isValidQuantity, false);
  assert.equal(invalidQty.totalAskingValue, 0);

  const categories: Category[] = [
    { id: 'cat_sheep', name: 'الأغنام', slug: 'sheep', parentId: null },
    { id: 'cat_goats', name: 'الماعز', slug: 'goats', parentId: null },
    { id: 'sub_slaughter', name: 'ذبايح', slug: 'slaughter', parentId: 'cat_sheep' },
    { id: 'sub_breeding', name: 'تربية', slug: 'breeding', parentId: 'cat_sheep' },
    { id: 'sub_goats_milk', name: 'حلوب', slug: 'milk', parentId: 'cat_goats' },
  ];

  const sheepSubs = filterSubCategoriesByParent(categories, 'cat_sheep');
  assert.deepEqual(
    sheepSubs.map((s) => s.id),
    ['sub_slaughter', 'sub_breeding']
  );
  const goatSubs = filterSubCategoriesByParent(categories, 'cat_goats');
  assert.deepEqual(
    goatSubs.map((s) => s.id),
    ['sub_goats_milk']
  );
});

test('Phase 2B UI components enforce responsive, accessibility, messaging, and form safeguards', () => {
  const addFormSrc = readFileSync(resolve(process.cwd(), 'src/components/AddListingView.tsx'), 'utf-8');
  const dashboardSrc = readFileSync(resolve(process.cwd(), 'src/components/DashboardView.tsx'), 'utf-8');
  const analyticsSrc = readFileSync(
    resolve(process.cwd(), 'src/components/DashboardAnalytics.tsx'),
    'utf-8'
  );

  // AddListingView checks
  assert.ok(addFormSrc.includes('رجوع / إلغاء') && addFormSrc.includes('العودة إلى الإعلان'));
  assert.ok(addFormSrc.includes('<Modal') && addFormSrc.includes('beforeunload'));
  assert.ok(addFormSrc.includes('!initialMediaIds.has(id)'));
  assert.ok(addFormSrc.includes('filterSubCategoriesByParent(categories, categoryId)'));
  assert.ok(addFormSrc.includes('min-w-[44px] min-h-[44px]'));
  assert.ok(addFormSrc.includes('computeHerdSummary') && addFormSrc.includes('validateExpectedPriceRule'));

  // DashboardView checks
  assert.ok(dashboardSrc.includes('otherParticipantName') && dashboardSrc.includes('listingTitle'));
  assert.ok(dashboardSrc.includes('unreadCount') && dashboardSrc.includes('totalUnreadMessages'));
  assert.ok(dashboardSrc.includes('messagesContainerRef') && dashboardSrc.includes('messagesEndRef'));
  assert.ok(dashboardSrc.includes('mobileThreadOpen') && dashboardSrc.includes('onMarkConversationRead'));
  assert.ok(dashboardSrc.includes('scopeAnalyticsDataset'));
  assert.ok(dashboardSrc.includes('أضف إعلانك الأول') && dashboardSrc.includes('تصفح الإعلانات'));

  // DashboardAnalytics checks
  assert.ok(analyticsSrc.includes('النسبة من إعلاناتك') && analyticsSrc.includes('النسبة من السوق'));
  assert.ok(analyticsSrc.includes('buildDailyAnalyticsSeries'));
});
