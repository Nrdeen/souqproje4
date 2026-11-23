import type { Category } from '../types/marketplace';

export type ExpectedPriceValidationResult =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

/**
 * Validates optional expected negotiation price against asking priceAmount.
 * Business rule: if provided, expectedPrice must be > 0 and <= priceAmount.
 */
export function validateExpectedPriceRule(params: {
  priceAmount: number | string;
  expectedPrice: number | string | null | undefined;
}): ExpectedPriceValidationResult {
  const rawExpected = params.expectedPrice;
  if (rawExpected === null || rawExpected === undefined) {
    return { ok: true, value: null };
  }
  if (typeof rawExpected === 'boolean' || typeof rawExpected === 'object') {
    return {
      ok: false,
      error: 'السعر المتوقع للتفاوض يجب أن يكون رقماً موجباً أكبر من صفر',
    };
  }
  const strExpected = typeof rawExpected === 'string' ? rawExpected.trim() : String(rawExpected);
  if (strExpected === '') {
    return { ok: true, value: null };
  }

  const expectedNum = Number(strExpected);
  if (!Number.isFinite(expectedNum) || expectedNum <= 0) {
    return {
      ok: false,
      error: 'السعر المتوقع للتفاوض يجب أن يكون رقماً موجباً أكبر من صفر',
    };
  }

  const askingNum = Number(params.priceAmount);
  if (Number.isFinite(askingNum) && askingNum > 0 && expectedNum > askingNum) {
    return {
      ok: false,
      error: 'السعر المتوقع للتفاوض يجب أن يكون مساوياً أو أقل من السعر المطلوب للرأس',
    };
  }

  return { ok: true, value: expectedNum };
}

export interface HerdSummaryFeedback {
  unitPrice: number;
  unitExpectedPrice: number | null;
  quantity: number;
  isValidQuantity: boolean;
  totalAskingValue: number;
  totalExpectedValue: number | null;
}

/**
 * Computes live livestock quantity and total herd value feedback for listing forms.
 */
export function computeHerdSummary(params: {
  priceAmount: number | string;
  expectedPrice?: number | string | null;
  quantity: number | string;
}): HerdSummaryFeedback {
  const rawPrice = Number(params.priceAmount);
  const unitPrice = Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : 0;

  const rawExpected =
    params.expectedPrice === null || params.expectedPrice === undefined
      ? NaN
      : String(params.expectedPrice).trim() === ''
      ? NaN
      : Number(params.expectedPrice);
  const unitExpectedPrice = Number.isFinite(rawExpected) && rawExpected > 0 ? rawExpected : null;

  const rawQty = Number(params.quantity);
  const isValidQuantity = Number.isInteger(rawQty) && rawQty >= 1;
  const quantity = isValidQuantity ? rawQty : Math.max(0, Math.floor(Number.isFinite(rawQty) ? rawQty : 0));

  return {
    unitPrice,
    unitExpectedPrice,
    quantity,
    isValidQuantity,
    totalAskingValue: unitPrice * quantity,
    totalExpectedValue: unitExpectedPrice !== null ? unitExpectedPrice * quantity : null,
  };
}

/**
 * Filters subcategories strictly by their parent category ID.
 */
export function filterSubCategoriesByParent(
  categories: Category[],
  parentCategoryId: string
): Category[] {
  return categories.filter((c) => c.parentId !== null && c.parentId === parentCategoryId);
}

export interface ListingContentSnapshot {
  categoryId: string;
  subCategoryId?: string | null;
  breedId: string;
  regionId: string;
  city: string;
  title: string;
  description: string;
  priceAmount: number;
  expectedPrice?: number | null;
  sex: string;
  ageMonths: number;
  weightKg: number;
  quantity: number;
  vaccinated: boolean;
  images?: Array<{ url?: string; mediaId?: string | null }>;
  video?: { url?: string; mediaId?: string | null } | null;
}

function normalizeNullableNumber(value: number | null | undefined): number | null {
  if (value === null || value === undefined || value === ('' as any)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeImageSignatures(
  images: Array<{ url?: string; mediaId?: string | null }> | undefined
): string[] {
  if (!Array.isArray(images)) return [];
  return images.map((img) => {
    const mediaId = typeof img?.mediaId === 'string' ? img.mediaId.trim() : '';
    const url = typeof img?.url === 'string' ? img.url.trim() : '';
    return `${mediaId}::${url}`;
  });
}

/**
 * Returns true if any material buyer-facing or pricing/spec/media attribute changed
 * compared to the existing listing. Non-material flags (allowPriceOffers, isNegotiable)
 * and lifecycle-only status transitions (e.g. Published -> Sold / Draft) return false.
 */
export function hasMaterialListingChanges(
  existing: ListingContentSnapshot,
  next: ListingContentSnapshot
): boolean {
  if (String(existing.title || '').trim() !== String(next.title || '').trim()) return true;
  if (String(existing.description || '').trim() !== String(next.description || '').trim()) {
    return true;
  }
  if (Number(existing.priceAmount) !== Number(next.priceAmount)) return true;
  if (normalizeNullableNumber(existing.expectedPrice) !== normalizeNullableNumber(next.expectedPrice)) {
    return true;
  }
  if (String(existing.categoryId || '') !== String(next.categoryId || '')) return true;
  if (String(existing.subCategoryId || '') !== String(next.subCategoryId || '')) return true;
  if (String(existing.breedId || '') !== String(next.breedId || '')) return true;
  if (String(existing.regionId || '') !== String(next.regionId || '')) return true;
  if (String(existing.city || '').trim() !== String(next.city || '').trim()) return true;
  if (String(existing.sex || '') !== String(next.sex || '')) return true;
  if (Number(existing.ageMonths) !== Number(next.ageMonths)) return true;
  if (Number(existing.weightKg) !== Number(next.weightKg)) return true;
  if (Number(existing.quantity) !== Number(next.quantity)) return true;
  if (Boolean(existing.vaccinated) !== Boolean(next.vaccinated)) return true;

  const existingImgs = normalizeImageSignatures(existing.images);
  const nextImgs = normalizeImageSignatures(next.images);
  if (existingImgs.length !== nextImgs.length) return true;
  for (let i = 0; i < existingImgs.length; i += 1) {
    if (existingImgs[i] !== nextImgs[i]) return true;
  }

  const existingVideoId = existing.video?.mediaId || existing.video?.url || null;
  const nextVideoId = next.video?.mediaId || next.video?.url || null;
  if (existingVideoId !== nextVideoId) return true;

  return false;
}

