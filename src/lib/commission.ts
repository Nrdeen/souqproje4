export type CommissionRecordKind = 'sale_commission' | 'featured_listing';

export type CommissionRecordStatus =
  | 'exempt'
  | 'pending_payment'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'not_applicable';

export type CommissionExemptionReason =
  | 'none'
  | 'promo_days'
  | 'promo_free_listings'
  | 'not_sold_via_platform';

export interface CommissionSettings {
  commissionRatePercent: number;
  promoEnabled: boolean;
  promoFreeDays: number;
  promoFreeListingsCount: number;
  featuredWeeklyPriceSar: number;
  bankName: string;
  accountHolderName: string;
  iban: string;
  updatedAt: string;
}

export interface CommissionEligibility {
  isExempt: boolean;
  reason: CommissionExemptionReason;
  reasonLabel: string;
  remainingFreeDays: number;
  remainingFreeSales: number;
  effectiveRatePercent: number;
}

export interface CommissionRecord {
  id: string;
  kind: CommissionRecordKind;
  listingId: string | null;
  listingTitle: string;
  sellerId: string;
  sellerName: string;
  soldViaPlatform: boolean;
  saleAmountSar: number;
  ratePercent: number;
  commissionAmountSar: number;
  isExempt: boolean;
  exemptionReason: CommissionExemptionReason;
  status: CommissionRecordStatus;
  transferReference: string | null;
  payerName: string | null;
  transferAmountSar: number | null;
  transferNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionAdminSummary {
  totalPlatformSalesCount: number;
  totalPlatformSalesSar: number;
  totalDueSar: number;
  totalPendingReviewSar: number;
  totalApprovedSar: number;
  totalExemptSalesCount: number;
  pendingReviewCount: number;
  pendingPaymentCount: number;
  featuredRequestsPendingCount: number;
}

export function createDefaultCommissionSettings(
  updatedAt = new Date().toISOString()
): CommissionSettings {
  return {
    commissionRatePercent: 1,
    promoEnabled: true,
    promoFreeDays: 30,
    promoFreeListingsCount: 2,
    featuredWeeklyPriceSar: 35,
    bankName: '',
    accountHolderName: '',
    iban: '',
    updatedAt,
  };
}

export function roundCurrencySar(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateCommissionAmount(
  saleAmountSar: number,
  ratePercent: number
): number {
  if (!Number.isFinite(saleAmountSar) || saleAmountSar <= 0) return 0;
  if (!Number.isFinite(ratePercent) || ratePercent <= 0) return 0;
  return roundCurrencySar((saleAmountSar * ratePercent) / 100);
}

export function normalizeSaudiIban(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, '').toUpperCase();
}

export function isValidSaudiIban(iban: string): boolean {
  if (!iban) return true; // Optional until owner sets it
  return /^SA\d{22}$/.test(iban);
}

export function formatIbanSpaced(iban: string): string {
  const clean = normalizeSaudiIban(iban);
  if (!clean) return '';
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

export function evaluateSellerCommissionEligibility(params: {
  settings: CommissionSettings;
  userCreatedAt: string | number | Date | null | undefined;
  priorPlatformSalesCount: number;
  nowMs?: number;
}): CommissionEligibility {
  const { settings, userCreatedAt, priorPlatformSalesCount } = params;
  const nowMs = params.nowMs ?? Date.now();

  if (!settings.promoEnabled || settings.commissionRatePercent <= 0) {
    return {
      isExempt: settings.commissionRatePercent <= 0,
      reason: 'none',
      reasonLabel:
        settings.commissionRatePercent <= 0
          ? 'العمولة غير مفعّلة حالياً (0%)'
          : `تطبق عمولة المنصة (${settings.commissionRatePercent}%) بعد إتمام البيع`,
      remainingFreeDays: 0,
      remainingFreeSales: 0,
      effectiveRatePercent: settings.commissionRatePercent,
    };
  }

  let daysSinceJoin = Number.POSITIVE_INFINITY;
  if (userCreatedAt) {
    const joinedMs =
      userCreatedAt instanceof Date
        ? userCreatedAt.getTime()
        : typeof userCreatedAt === 'number'
        ? userCreatedAt
        : Date.parse(String(userCreatedAt));
    if (Number.isFinite(joinedMs)) {
      daysSinceJoin = Math.max(0, (nowMs - joinedMs) / (24 * 3600 * 1000));
    }
  }

  const remainingFreeDays =
    settings.promoFreeDays > 0 && Number.isFinite(daysSinceJoin)
      ? Math.max(0, Math.ceil(settings.promoFreeDays - daysSinceJoin))
      : 0;
  const remainingFreeSales =
    settings.promoFreeListingsCount > 0
      ? Math.max(0, settings.promoFreeListingsCount - Math.max(0, priorPlatformSalesCount))
      : 0;

  if (remainingFreeSales > 0) {
    return {
      isExempt: true,
      reason: 'promo_free_listings',
      reasonLabel: `مشمول بالإعفاء الترويجي للإطلاق (متبقي ${remainingFreeSales} من أول ${settings.promoFreeListingsCount} بيعات مجانية بدون عمولة)`,
      remainingFreeDays,
      remainingFreeSales,
      effectiveRatePercent: 0,
    };
  }

  if (remainingFreeDays > 0) {
    return {
      isExempt: true,
      reason: 'promo_days',
      reasonLabel: `مشمول بفترة الإعفاء الترويجي للشهر الأول (متبقي ${remainingFreeDays} يوم بدون عمولة)`,
      remainingFreeDays,
      remainingFreeSales: 0,
      effectiveRatePercent: 0,
    };
  }

  return {
    isExempt: false,
    reason: 'none',
    reasonLabel: `تطبق عمولة المنصة ${settings.commissionRatePercent}% من قيمة البيع بعد إتمام البيع`,
    remainingFreeDays: 0,
    remainingFreeSales: 0,
    effectiveRatePercent: settings.commissionRatePercent,
  };
}

export function getCommissionStatusMeta(status: CommissionRecordStatus): {
  label: string;
  cls: string;
} {
  switch (status) {
    case 'approved':
      return {
        label: 'مدفوعة ومعتمدة',
        cls: 'bg-[var(--color-green)]/10 text-[var(--color-green-ink)] border-[var(--color-green-ink)]/25',
      };
    case 'pending_review':
      return {
        label: 'بانتظار مراجعة الحوالة',
        cls: 'bg-[var(--color-gold-soft)] text-[var(--color-ink)] border-[var(--color-gold)]/45',
      };
    case 'pending_payment':
      return {
        label: 'بانتظار سداد العمولة',
        cls: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900/60',
      };
    case 'rejected':
      return {
        label: 'حوالة مرفوضة',
        cls: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/60',
      };
    case 'exempt':
      return {
        label: 'معفى (عرض الإطلاق)',
        cls: 'bg-[var(--color-cream)] text-[var(--color-green-ink)] border-[var(--color-border)]',
      };
    case 'not_applicable':
    default:
      return {
        label: 'بيع خارج المنصة',
        cls: 'bg-[var(--color-cream)] text-[var(--color-muted)] border-[var(--color-border)]',
      };
  }
}

export function buildCommissionAdminSummary(
  records: CommissionRecord[]
): CommissionAdminSummary {
  let totalPlatformSalesCount = 0;
  let totalPlatformSalesSar = 0;
  let totalDueSar = 0;
  let totalPendingReviewSar = 0;
  let totalApprovedSar = 0;
  let totalExemptSalesCount = 0;
  let pendingReviewCount = 0;
  let pendingPaymentCount = 0;
  let featuredRequestsPendingCount = 0;

  for (const r of records) {
    if (r.kind === 'sale_commission' && r.soldViaPlatform) {
      totalPlatformSalesCount += 1;
      totalPlatformSalesSar += Number(r.saleAmountSar || 0);
      if (r.isExempt || r.status === 'exempt') {
        totalExemptSalesCount += 1;
      }
    }
    if (r.status === 'pending_payment') {
      totalDueSar += Number(r.commissionAmountSar || 0);
      pendingPaymentCount += 1;
    } else if (r.status === 'pending_review') {
      totalPendingReviewSar += Number(r.transferAmountSar ?? r.commissionAmountSar ?? 0);
      pendingReviewCount += 1;
      if (r.kind === 'featured_listing') {
        featuredRequestsPendingCount += 1;
      }
    } else if (r.status === 'approved') {
      totalApprovedSar += Number(r.transferAmountSar ?? r.commissionAmountSar ?? 0);
    }
    if (r.kind === 'featured_listing' && r.status === 'pending_payment') {
      featuredRequestsPendingCount += 1;
    }
  }

  return {
    totalPlatformSalesCount,
    totalPlatformSalesSar: roundCurrencySar(totalPlatformSalesSar),
    totalDueSar: roundCurrencySar(totalDueSar),
    totalPendingReviewSar: roundCurrencySar(totalPendingReviewSar),
    totalApprovedSar: roundCurrencySar(totalApprovedSar),
    totalExemptSalesCount,
    pendingReviewCount,
    pendingPaymentCount,
    featuredRequestsPendingCount,
  };
}

