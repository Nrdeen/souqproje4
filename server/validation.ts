export class ValidationError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'invalid_input'
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export const INPUT_LIMITS = {
  jsonBodyLimit: '256kb',
  listingTitleMin: 3,
  listingTitleMax: 140,
  listingDescriptionMax: 2000,
  listingCityMin: 2,
  listingCityMax: 80,
  listingPriceMax: 10_000_000,
  listingQuantityMax: 100_000,
  listingAgeMin: 1,
  listingAgeMax: 360,
  listingWeightMin: 1,
  listingWeightMax: 2_000,
  messageBodyMin: 1,
  messageBodyMax: 2_000,
  offerPriceMax: 10_000_000,
  offerNoteMax: 500,
  reviewCommentMax: 1_000,
  reportReasonMin: 2,
  reportReasonMax: 140,
  reportDetailsMax: 600,
  categoryNameMin: 2,
  categoryNameMax: 80,
  categoryDescriptionMax: 400,
  categoryKeywordsMax: 30,
  categoryKeywordMaxLength: 40,
  breedNameMin: 2,
  breedNameMax: 80,
  breedFieldMax: 500,
} as const;

const UNSAFE_CONTROL_SINGLE_LINE_RE = /[\u0000-\u001f\u007f]/;
const UNSAFE_CONTROL_MULTILINE_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export function hasUnsafeControlChars(raw: string, allowNewlines = false): boolean {
  return allowNewlines
    ? UNSAFE_CONTROL_MULTILINE_RE.test(raw)
    : UNSAFE_CONTROL_SINGLE_LINE_RE.test(raw);
}

export function validateRequiredText(
  raw: unknown,
  opts: {
    label: string;
    minLength: number;
    maxLength: number;
    allowNewlines?: boolean;
    code?: string;
  }
): string {
  if (typeof raw !== 'string') {
    throw new ValidationError(400, `قيمة ${opts.label} غير صالحة`, opts.code);
  }
  if (hasUnsafeControlChars(raw, Boolean(opts.allowNewlines))) {
    throw new ValidationError(400, `يحتوي ${opts.label} على أحرف غير صالحة`, opts.code);
  }
  const normalized = opts.allowNewlines
    ? raw.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    : raw.trim();

  if (normalized.length < opts.minLength) {
    throw new ValidationError(
      400,
      `يجب أن لا يقل ${opts.label} عن ${opts.minLength} أحرف`,
      opts.code
    );
  }
  if (normalized.length > opts.maxLength) {
    throw new ValidationError(
      400,
      `يتجاوز ${opts.label} الحد الأقصى المسموح (${opts.maxLength} حرف)`,
      opts.code
    );
  }
  return normalized;
}

export function validateOptionalText(
  raw: unknown,
  opts: {
    label: string;
    maxLength: number;
    allowNewlines?: boolean;
    defaultValue?: string;
    code?: string;
  }
): string {
  if (raw === undefined || raw === null) {
    return opts.defaultValue ?? '';
  }
  if (typeof raw !== 'string') {
    throw new ValidationError(400, `قيمة ${opts.label} غير صالحة`, opts.code);
  }
  if (hasUnsafeControlChars(raw, Boolean(opts.allowNewlines))) {
    throw new ValidationError(400, `يحتوي ${opts.label} على أحرف غير صالحة`, opts.code);
  }
  const normalized = opts.allowNewlines
    ? raw.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    : raw.trim();

  if (normalized.length > opts.maxLength) {
    throw new ValidationError(
      400,
      `يتجاوز ${opts.label} الحد الأقصى المسموح (${opts.maxLength} حرف)`,
      opts.code
    );
  }
  return normalized;
}

function parseStrictNumericInput(raw: unknown, label: string, code = 'invalid_number'): number {
  if (raw === null || raw === undefined || typeof raw === 'boolean' || typeof raw === 'object') {
    throw new ValidationError(400, `قيمة ${label} يجب أن تكون رقماً صالحاً`, code);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      throw new ValidationError(400, `قيمة ${label} مطلوبة كرقم صالح`, code);
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n)) {
      throw new ValidationError(400, `قيمة ${label} يجب أن تكون رقماً محدداً وصالحاً`, code);
    }
    return n;
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      throw new ValidationError(400, `قيمة ${label} يجب أن تكون رقماً محدداً وصالحاً`, code);
    }
    return raw;
  }
  throw new ValidationError(400, `قيمة ${label} يجب أن تكون رقماً صالحاً`, code);
}

export function parseFinitePositiveNumber(
  raw: unknown,
  opts: {
    label: string;
    minInclusive?: number;
    max: number;
    code?: string;
  }
): number {
  const num = parseStrictNumericInput(raw, opts.label, opts.code);
  if (num <= 0) {
    throw new ValidationError(400, `${opts.label} يجب أن يكون رقماً موجباً أكبر من صفر`, opts.code);
  }
  if (opts.minInclusive !== undefined && num < opts.minInclusive) {
    throw new ValidationError(
      400,
      `${opts.label} يجب أن لا يقل عن ${opts.minInclusive}`,
      opts.code
    );
  }
  if (num > opts.max) {
    throw new ValidationError(
      400,
      `${opts.label} يتجاوز الحد الأقصى المسموح (${opts.max.toLocaleString('en-US')})`,
      opts.code
    );
  }
  return num;
}

export function parsePositiveInteger(
  raw: unknown,
  opts: {
    label: string;
    min?: number;
    max: number;
    code?: string;
  }
): number {
  const min = opts.min ?? 1;
  const num = parseStrictNumericInput(raw, opts.label, opts.code);
  if (!Number.isInteger(num)) {
    throw new ValidationError(400, `${opts.label} يجب أن يكون عدداً صحيحاً بدون كسور`, opts.code);
  }
  if (num < min) {
    throw new ValidationError(400, `${opts.label} يجب أن لا يقل عن ${min}`, opts.code);
  }
  if (num > opts.max) {
    throw new ValidationError(
      400,
      `${opts.label} يتجاوز الحد الأقصى المسموح (${opts.max.toLocaleString('en-US')})`,
      opts.code
    );
  }
  return num;
}

export interface CategoryLike {
  id: string;
  parentId: string | null;
}

/**
 * Validates parentId assignments for the 2-level category hierarchy,
 * preventing self-parenting, cycles, root re-parenting, and invalid references.
 */
export function validateCategoryParentAssignment(params: {
  categories: CategoryLike[];
  targetId?: string;
  existingParentId?: string | null;
  requestedParentId: unknown;
  isCreate: boolean;
}): string {
  const { categories, targetId, existingParentId, requestedParentId, isCreate } = params;

  if (!isCreate && existingParentId === null) {
    if (requestedParentId !== undefined && requestedParentId !== null) {
      throw new ValidationError(
        400,
        'لا يمكن تحويل التصنيف الرئيسي إلى فئة فرعية',
        'cannot_reparent_root_category'
      );
    }
    return null as unknown as string;
  }

  const candidateParentId =
    isCreate && (requestedParentId === undefined || requestedParentId === '')
      ? 'cat_sheep'
      : requestedParentId;

  if (typeof candidateParentId !== 'string' || !candidateParentId.trim()) {
    throw new ValidationError(
      400,
      'التصنيف الرئيسي للفئة الفرعية مطلوب ويجب أن يكون نصاً صالحاً',
      'invalid_parent_category'
    );
  }

  const cleanParentId = candidateParentId.trim();
  if (targetId && cleanParentId === targetId) {
    throw new ValidationError(400, 'لا يمكن ربط الفئة بنفسها كتصنيف أب', 'category_self_parent');
  }

  const parent = categories.find((c) => c.id === cleanParentId);
  if (!parent) {
    throw new ValidationError(400, 'التصنيف الرئيسي المحدد غير موجود', 'invalid_parent_category');
  }

  if (parent.parentId !== null) {
    throw new ValidationError(
      400,
      'يجب أن يتبع التصنيف الفرعي تصنيفاً رئيسياً (مستوى أول) فقط',
      'invalid_category_hierarchy'
    );
  }

  // Defense-in-depth cycle check across existing parent links
  if (targetId) {
    const visited = new Set<string>([targetId]);
    let cursor: CategoryLike | undefined = parent;
    while (cursor) {
      if (visited.has(cursor.id)) {
        throw new ValidationError(400, 'تم رصد حلقة دائرية في شجرة التصنيفات', 'category_cycle');
      }
      visited.add(cursor.id);
      cursor = cursor.parentId ? categories.find((c) => c.id === cursor!.parentId) : undefined;
    }
  }

  return cleanParentId;
}

export function parseAndValidateKeywords(raw: unknown): string[] {
  let list: string[];
  if (Array.isArray(raw)) {
    list = raw.map((item) => {
      if (typeof item !== 'string') {
        throw new ValidationError(400, 'الكلمات المفتاحية يجب أن تكون نصوصاً صالحة');
      }
      if (hasUnsafeControlChars(item, false)) {
        throw new ValidationError(400, 'تحتوي الكلمات المفتاحية على أحرف غير صالحة');
      }
      return item.trim();
    });
  } else if (typeof raw === 'string') {
    if (hasUnsafeControlChars(raw, false)) {
      throw new ValidationError(400, 'تحتوي الكلمات المفتاحية على أحرف غير صالحة');
    }
    list = raw.split(/[،,]/).map((k) => k.trim());
  } else if (raw === undefined || raw === null) {
    return [];
  } else {
    throw new ValidationError(400, 'تنسيق الكلمات المفتاحية غير صالح');
  }

  const filtered = list.filter(Boolean);
  if (filtered.length > INPUT_LIMITS.categoryKeywordsMax) {
    throw new ValidationError(
      400,
      `الحد الأقصى للكلمات المفتاحية هو ${INPUT_LIMITS.categoryKeywordsMax} كلمة`
    );
  }
  for (const kw of filtered) {
    if (kw.length > INPUT_LIMITS.categoryKeywordMaxLength) {
      throw new ValidationError(
        400,
        `طول الكلمة المفتاحية يتجاوز الحد المسموح (${INPUT_LIMITS.categoryKeywordMaxLength} حرف)`
      );
    }
  }
  return filtered;
}
