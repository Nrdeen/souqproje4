import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCommissionAdminSummary,
  calculateCommissionAmount,
  createDefaultCommissionSettings,
  evaluateSellerCommissionEligibility,
  formatIbanSpaced,
  getCommissionStatusMeta,
  isValidSaudiIban,
  normalizeSaudiIban,
  type CommissionRecord,
} from '../../src/lib/commission';
import { createRoute, parseUrlToRoute, routeToUrl } from '../../src/lib/router';

test('calculateCommissionAmount computes 1% commission accurately', () => {
  assert.equal(calculateCommissionAmount(1500, 1), 15);
  assert.equal(calculateCommissionAmount(30000, 1), 300);
  assert.equal(calculateCommissionAmount(1250, 1), 12.5);
  assert.equal(calculateCommissionAmount(0, 1), 0);
  assert.equal(calculateCommissionAmount(5000, 0), 0);
});

test('Saudi IBAN normalization, validation, and formatting', () => {
  assert.equal(normalizeSaudiIban(' sa12 3456 7890 1234 5678 9012 '), 'SA1234567890123456789012');
  assert.equal(isValidSaudiIban('SA1234567890123456789012'), true);
  assert.equal(isValidSaudiIban(''), true);
  assert.equal(isValidSaudiIban('SA1234'), false);
  assert.equal(isValidSaudiIban('AE1234567890123456789012'), false);
  assert.equal(
    formatIbanSpaced('SA1234567890123456789012'),
    'SA12 3456 7890 1234 5678 9012'
  );
});

test('evaluateSellerCommissionEligibility covers free listings, promo days, expired promo, and disabled promo', () => {
  const settings = createDefaultCommissionSettings();
  const now = Date.parse('2026-06-15T12:00:00Z');

  // Within first 2 sales
  const firstSale = evaluateSellerCommissionEligibility({
    settings,
    userCreatedAt: '2026-06-10T00:00:00Z',
    priorPlatformSalesCount: 0,
    nowMs: now,
  });
  assert.equal(firstSale.isExempt, true);
  assert.equal(firstSale.reason, 'promo_free_listings');
  assert.equal(firstSale.remainingFreeSales, 2);
  assert.equal(firstSale.effectiveRatePercent, 0);

  // Used 2 free sales, still within first 30 days
  const withinDays = evaluateSellerCommissionEligibility({
    settings,
    userCreatedAt: '2026-06-10T00:00:00Z',
    priorPlatformSalesCount: 2,
    nowMs: now,
  });
  assert.equal(withinDays.isExempt, true);
  assert.equal(withinDays.reason, 'promo_days');
  assert.equal(withinDays.remainingFreeSales, 0);
  assert.ok(withinDays.remainingFreeDays > 0);
  assert.equal(withinDays.effectiveRatePercent, 0);

  // Used 2 free sales and > 30 days since signup -> 1% applies
  const regularSeller = evaluateSellerCommissionEligibility({
    settings,
    userCreatedAt: '2026-04-01T00:00:00Z',
    priorPlatformSalesCount: 2,
    nowMs: now,
  });
  assert.equal(regularSeller.isExempt, false);
  assert.equal(regularSeller.reason, 'none');
  assert.equal(regularSeller.effectiveRatePercent, 1);

  // Promo disabled -> 1% applies immediately
  const promoOff = evaluateSellerCommissionEligibility({
    settings: { ...settings, promoEnabled: false },
    userCreatedAt: '2026-06-14T00:00:00Z',
    priorPlatformSalesCount: 0,
    nowMs: now,
  });
  assert.equal(promoOff.isExempt, false);
  assert.equal(promoOff.effectiveRatePercent, 1);
});

test('buildCommissionAdminSummary aggregates sales, due, pending review, and approved totals', () => {
  const now = new Date().toISOString();
  const base: CommissionRecord = {
    id: 'com_1',
    kind: 'sale_commission',
    listingId: 'lst_1',
    listingTitle: 'خروف نعيمي',
    sellerId: 'usr_1',
    sellerName: 'مربي 1',
    soldViaPlatform: true,
    saleAmountSar: 1500,
    ratePercent: 1,
    commissionAmountSar: 15,
    isExempt: false,
    exemptionReason: 'none',
    status: 'pending_payment',
    transferReference: null,
    payerName: null,
    transferAmountSar: null,
    transferNote: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: now,
    updatedAt: now,
  };

  const summary = buildCommissionAdminSummary([
    base,
    {
      ...base,
      id: 'com_2',
      saleAmountSar: 30000,
      commissionAmountSar: 300,
      status: 'pending_review',
      transferReference: 'REF-100',
      payerName: 'أحمد',
      transferAmountSar: 300,
    },
    {
      ...base,
      id: 'com_3',
      kind: 'featured_listing',
      soldViaPlatform: false,
      saleAmountSar: 0,
      ratePercent: 0,
      commissionAmountSar: 35,
      status: 'approved',
      transferReference: 'REF-200',
      payerName: 'أحمد',
      transferAmountSar: 35,
    },
    {
      ...base,
      id: 'com_4',
      saleAmountSar: 2000,
      commissionAmountSar: 0,
      isExempt: true,
      exemptionReason: 'promo_free_listings',
      status: 'exempt',
    },
  ]);

  assert.equal(summary.totalPlatformSalesCount, 3);
  assert.equal(summary.totalPlatformSalesSar, 33500);
  assert.equal(summary.totalDueSar, 15);
  assert.equal(summary.totalPendingReviewSar, 300);
  assert.equal(summary.totalApprovedSar, 35);
  assert.equal(summary.totalExemptSalesCount, 1);
  assert.equal(summary.pendingPaymentCount, 1);
  assert.equal(summary.pendingReviewCount, 1);
});

test('commission route parses and serializes cleanly', () => {
  const route = parseUrlToRoute('/commission', '');
  assert.equal(route.page, 'commission');
  assert.equal(routeToUrl(createRoute({ page: 'commission' })), '/commission');
  assert.equal(getCommissionStatusMeta('pending_review').label, 'بانتظار مراجعة الحوالة');
});
