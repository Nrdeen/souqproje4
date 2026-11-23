import { normalizeArabicSearchText } from '../../src/lib/listing-search';
import type {
  AiChatHistoryItem,
  AiClarificationStage,
  AiIntent,
  NormalizedSaudiQuery,
} from './types';

interface TermRule<T extends string> {
  value: T;
  label: string;
  terms: string[];
}

const BREED_RULES: TermRule<string>[] = [
  {
    value: 'brd_naimi',
    label: 'نعيمي',
    terms: ['نعيمي', 'نعيميه', 'نعيميات', 'نعيم', 'النعيمي', 'النعيم'],
  },
  {
    value: 'brd_najdi',
    label: 'نجدي',
    terms: ['نجدي', 'نجديه', 'نجديات', 'النجدي', 'النجديات'],
  },
  {
    value: 'brd_harri',
    label: 'حري',
    terms: ['حري', 'حريه', 'حريات', 'الحري', 'الحريات'],
  },
  {
    value: 'brd_ardhi',
    label: 'عارضي',
    terms: ['عارضي', 'عارضيه', 'عوارض', 'عارضيات', 'العارضي', 'العوارض'],
  },
  {
    value: 'brd_sawakni',
    label: 'سواكني',
    terms: ['سواكني', 'سواكن', 'السواكني'],
  },
];

export const BREED_LABEL_BY_ID: Record<string, string> = {
  brd_naimi: 'نعيمي',
  brd_najdi: 'نجدي',
  brd_harri: 'حري',
  brd_ardhi: 'عارضي',
  brd_sawakni: 'سواكني',
};

export const REGION_LABEL_BY_ID: Record<string, string> = {
  reg_riyadh: 'الرياض',
  reg_makkah: 'مكة المكرمة',
  reg_qassim: 'القصيم',
  reg_eastern: 'المنطقة الشرقية',
  reg_madinah: 'المدينة المنورة',
  reg_asir: 'عسير',
  reg_hail: 'حائل',
  reg_tabuk: 'تبوك',
};

const SUBCATEGORY_RULES: TermRule<string>[] = [
  {
    value: 'sub_slaughter',
    label: 'ذبائح',
    terms: [
      'ذبيحه',
      'ذبايح',
      'ذبائح',
      'طلي',
      'طليان',
      'جذع',
      'جذعان',
      'هرفي',
      'هرافي',
      'بهم',
      'وليمه',
      'عزيمه',
      'اضحيه',
      'اضاحي',
      'ثلاجه',
      'مناسبات',
    ],
  },
  {
    value: 'sub_breeding',
    label: 'تربية',
    terms: [
      'تربيه',
      'دفيع',
      'مضاريع',
      'متابيع',
      'رخال',
      'رخل',
      'حلوب',
      'جفره',
      'جفرتين',
      'جفرات',
      'انتاج',
      'مقاريب',
    ],
  },
  {
    value: 'sub_show',
    label: 'عرض/فحول',
    terms: ['فحل', 'فحول', 'صنف', 'ناهي', 'نسف', 'ابرص', 'مزاين'],
  },
];

const CATEGORY_RULES: TermRule<string>[] = [
  {
    value: 'cat_breeding',
    label: 'فحول الإنتاج',
    terms: ['فحل', 'فحول'],
  },
  {
    value: 'cat_goats',
    label: 'الماعز',
    terms: ['ماعز', 'معزا', 'تيس', 'تيوس', 'جفره', 'جفرات', 'جفرتين', 'عوارض', 'عارضي'],
  },
  {
    value: 'cat_sheep',
    label: 'الأغنام',
    terms: [
      'غنم',
      'اغنام',
      'ضان',
      'ضأن',
      'خروف',
      'خرفان',
      'طلي',
      'طليان',
      'جذعان',
      'هرفي',
      'بهم',
      'نعيمي',
      'نجدي',
      'حري',
      'سواكني',
    ],
  },
];

const REGION_RULES: Array<{ regionId: string; city?: string; terms: string[] }> = [
  { regionId: 'reg_riyadh', city: 'المزاحمية', terms: ['المزاحميه', 'مزاحميه'] },
  { regionId: 'reg_riyadh', city: 'الخرج', terms: ['الخرج', 'خرج'] },
  { regionId: 'reg_riyadh', terms: ['الرياض', 'رياض', 'الدوادمي', 'المجمعه', 'رماح'] },
  { regionId: 'reg_makkah', city: 'الطائف', terms: ['الطايف', 'الطائف', 'طايف'] },
  { regionId: 'reg_makkah', terms: ['مكه', 'جده', 'الحجاز', 'رابغ'] },
  { regionId: 'reg_qassim', city: 'بريدة', terms: ['بريده'] },
  { regionId: 'reg_qassim', terms: ['القصيم', 'قصيم', 'عنيزه', 'الرس'] },
  { regionId: 'reg_eastern', city: 'الدمام', terms: ['الدمام', 'دمام'] },
  { regionId: 'reg_eastern', terms: ['الشرقيه', 'الخبر', 'الاحساء', 'الجبيل', 'حفر الباطن'] },
  { regionId: 'reg_madinah', terms: ['المدينه', 'مدينه', 'ينبع'] },
  { regionId: 'reg_asir', terms: ['عسير', 'ابها', 'خميس مشيط'] },
  { regionId: 'reg_hail', terms: ['حايل', 'حائل'] },
  { regionId: 'reg_tabuk', terms: ['تبوك'] },
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsTerm(normalizedSentence: string, term: string): boolean {
  const normTerm = normalizeArabicSearchText(term);
  if (!normTerm) return false;
  const cleanedSentence = normalizedSentence.replace(/[؟?!.,،؛:()«»"']/g, ' ');
  const base = normTerm.startsWith('ال') ? normTerm.slice(2) : normTerm;
  const escapedFull = escapeRegex(normTerm);
  const escapedBase = escapeRegex(base);
  const re = new RegExp(`(?:^|\\s)(?:[بو]?(?:ال)?${escapedBase}|[بو]?${escapedFull})(?:$|\\s)`);
  return re.test(cleanedSentence);
}

function extractWordedPrice(normalizedText: string): number | undefined {
  if (/الفين\s+ونص|الفين\s+وخمس/u.test(normalizedText)) return 2500;
  if (/الف\s+ونص|الف\s+وخمس/u.test(normalizedText)) return 1500;
  if (/ثلاث\s*الاف|ثلاثه\s*الاف/u.test(normalizedText)) return 3000;
  if (/اربع\s*الاف|اربعه\s*الاف/u.test(normalizedText)) return 4000;
  if (/خمس\s*الاف|خمسه\s*الاف/u.test(normalizedText)) return 5000;
  if (/(?:اقل من|تحت|بحدود|ميزانيه|سقف|خل السعر|السعر)\s+الفين\b/u.test(normalizedText)) {
    return 2000;
  }
  if (/(?:اقل من|تحت|بحدود|ميزانيه|سقف|خل السعر|السعر)\s+الف\b/u.test(normalizedText)) {
    return 1000;
  }
  return undefined;
}

function extractPriceBounds(
  normalizedText: string,
  options: { allowBareNumber?: boolean } = {}
): {
  minPrice?: number;
  maxPrice?: number;
  detectedTerms: string[];
} {
  const detectedTerms: string[] = [];
  let minPrice: number | undefined;
  let maxPrice: number | undefined;

  const rangeMatch = normalizedText.match(/(?:من|بين)\s+(\d{2,6})\s+(?:الى|و|-)\s+(\d{2,6})/);
  if (rangeMatch) {
    const a = Number(rangeMatch[1]);
    const b = Number(rangeMatch[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b >= a) {
      minPrice = a;
      maxPrice = b;
      detectedTerms.push(`سعر ${a}-${b}`);
      return { minPrice, maxPrice, detectedTerms };
    }
  }

  const maxMatch = normalizedText.match(
    /(?:تحت|اقل من|بحدود|حول|ما يتعدى|لا يتعدى|لا يزيد عن|ميزانيتي|ميزانيه|سقف|خل السعر|خلي السعر|غير السعر|عدل السعر|ارفع السعر|نزل السعر|السعر الى|السعر على|حدي)\s+(\d{2,6})/
  );
  if (maxMatch) {
    const v = Number(maxMatch[1]);
    if (Number.isFinite(v) && v >= 100 && v <= 500_000) {
      maxPrice = v;
      detectedTerms.push(`سقف السعر ${v}`);
    }
  }

  const minMatch = normalizedText.match(/(?:فوق|اكثر من|يبدأ من|يبدا من)\s+(\d{3,6})/);
  if (minMatch && !maxMatch) {
    const v = Number(minMatch[1]);
    if (Number.isFinite(v) && v >= 100 && v <= 500_000) {
      minPrice = v;
      detectedTerms.push(`الحد الأدنى ${v}`);
    }
  }

  if (maxPrice === undefined && minPrice === undefined) {
    const worded = extractWordedPrice(normalizedText);
    if (worded !== undefined) {
      maxPrice = worded;
      detectedTerms.push(`سقف السعر ${worded}`);
    }
  }

  if (maxPrice === undefined && minPrice === undefined && options.allowBareNumber) {
    const bareMatch = normalizedText.match(/^(?:تقريبا\s+|حوالي\s+|ممكن\s+)?(\d{3,6})(?:\s*(?:ريال|ر\s*س|رس|sar))?$/);
    if (bareMatch) {
      const v = Number(bareMatch[1]);
      if (Number.isFinite(v) && v >= 200 && v <= 500_000) {
        maxPrice = v;
        detectedTerms.push(`سقف السعر ${v}`);
      }
    }
  }

  return { minPrice, maxPrice, detectedTerms };
}

function extractSexFilter(normalizedText: string): NormalizedSaudiQuery['sex'] {
  if (
    containsTerm(normalizedText, 'مختلط') ||
    containsTerm(normalizedText, 'قطيع مختلط') ||
    (containsTerm(normalizedText, 'ذكور') && containsTerm(normalizedText, 'اناث'))
  ) {
    return 'قطيع مختلط';
  }
  if (
    ['ذكر', 'ذكور', 'ذكران', 'طليان', 'فحل', 'فحول', 'تيس', 'تيوس'].some((t) =>
      containsTerm(normalizedText, t)
    )
  ) {
    return 'ذكر';
  }
  if (
    ['انثى', 'اناث', 'رخال', 'رخل', 'نعجه', 'نعاج', 'عنز', 'جفره', 'جفرات', 'جفرتين', 'دفيع', 'مضاريع'].some(
      (t) => containsTerm(normalizedText, t)
    )
  ) {
    return 'أنثى';
  }
  return undefined;
}

export function normalizeSaudiQuery(
  rawQuery: string,
  options: { allowBarePriceNumber?: boolean } = {}
): NormalizedSaudiQuery {
  const normalizedText = normalizeArabicSearchText(rawQuery);
  const detectedDialectTerms: string[] = [];

  let breedId: string | undefined;
  for (const rule of BREED_RULES) {
    if (rule.terms.some((t) => containsTerm(normalizedText, t))) {
      breedId = rule.value;
      detectedDialectTerms.push(rule.label);
      break;
    }
  }

  let subCategoryId: string | undefined;
  for (const rule of SUBCATEGORY_RULES) {
    if (rule.terms.some((t) => containsTerm(normalizedText, t))) {
      subCategoryId = rule.value;
      detectedDialectTerms.push(rule.label);
      break;
    }
  }

  let categoryId: string | undefined;
  for (const rule of CATEGORY_RULES) {
    if (rule.terms.some((t) => containsTerm(normalizedText, t))) {
      categoryId = rule.value;
      break;
    }
  }

  let regionId: string | undefined;
  let city: string | undefined;
  for (const rule of REGION_RULES) {
    if (rule.terms.some((t) => containsTerm(normalizedText, t))) {
      regionId = rule.regionId;
      if (rule.city) city = rule.city;
      detectedDialectTerms.push(rule.city || REGION_LABEL_BY_ID[rule.regionId] || rule.terms[0]);
      break;
    }
  }

  const priceInfo = extractPriceBounds(normalizedText, {
    allowBareNumber: options.allowBarePriceNumber,
  });
  detectedDialectTerms.push(...priceInfo.detectedTerms);

  const sex = extractSexFilter(normalizedText);
  if (sex) {
    detectedDialectTerms.push(sex === 'ذكر' ? 'ذكور' : sex === 'أنثى' ? 'إناث' : 'مختلط');
  }

  let vaccinatedOnly: boolean | undefined;
  if (
    containsTerm(normalizedText, 'محصن') ||
    containsTerm(normalizedText, 'محصنه') ||
    containsTerm(normalizedText, 'مطعم') ||
    containsTerm(normalizedText, 'تحصين')
  ) {
    vaccinatedOnly = true;
    detectedDialectTerms.push('محصن');
  }

  let acceptsOffersOnly: boolean | undefined;
  if (
    containsTerm(normalizedText, 'سوم') ||
    containsTerm(normalizedText, 'عروض') ||
    containsTerm(normalizedText, 'يسام')
  ) {
    acceptsOffersOnly = true;
    detectedDialectTerms.push('يقبل السوم');
  }

  let negotiableOnly: boolean | undefined;
  if (
    containsTerm(normalizedText, 'تفاوض') ||
    containsTerm(normalizedText, 'سمح') ||
    containsTerm(normalizedText, 'قابل للتفاوض')
  ) {
    negotiableOnly = true;
  }

  let sort: NormalizedSaudiQuery['sort'];
  if (
    containsTerm(normalizedText, 'ارخص') ||
    containsTerm(normalizedText, 'الارخص') ||
    containsTerm(normalizedText, 'اقتصادي') ||
    containsTerm(normalizedText, 'رخيص')
  ) {
    sort = 'price_asc';
  } else if (containsTerm(normalizedText, 'اغلى') || containsTerm(normalizedText, 'الاغلى')) {
    sort = 'price_desc';
  } else if (containsTerm(normalizedText, 'الافضل') || containsTerm(normalizedText, 'مميز')) {
    sort = 'most_liked';
  }

  const keywordTokens: string[] = [];
  if (containsTerm(normalizedText, 'جذعان') || containsTerm(normalizedText, 'جذع')) {
    keywordTokens.push('جذعان');
  }
  if (containsTerm(normalizedText, 'هرفي') || containsTerm(normalizedText, 'هرافي')) {
    keywordTokens.push('هرفي');
  }
  if (containsTerm(normalizedText, 'فحل') || containsTerm(normalizedText, 'فحول')) {
    keywordTokens.push('فحل');
  }
  if (containsTerm(normalizedText, 'دفيع') || containsTerm(normalizedText, 'مضاريع')) {
    keywordTokens.push('دفيع');
  }
  if (containsTerm(normalizedText, 'بهم')) {
    keywordTokens.push('بهم');
  }

  return {
    rawQuery,
    normalizedText,
    searchKeywords: keywordTokens.join(' ').trim(),
    breedId,
    categoryId,
    subCategoryId,
    regionId,
    city,
    minPrice: priceInfo.minPrice,
    maxPrice: priceInfo.maxPrice,
    sex,
    vaccinatedOnly,
    negotiableOnly,
    acceptsOffersOnly,
    sort,
    detectedDialectTerms,
  };
}

function hasSearchEntity(nq: NormalizedSaudiQuery): boolean {
  return Boolean(
    nq.breedId ||
      nq.categoryId ||
      nq.subCategoryId ||
      nq.regionId ||
      nq.city ||
      nq.minPrice !== undefined ||
      nq.maxPrice !== undefined ||
      nq.sex ||
      nq.vaccinatedOnly ||
      nq.negotiableOnly ||
      nq.acceptsOffersOnly ||
      nq.sort
  );
}

function isPureGreetingPhrase(norm: string): boolean {
  const cleaned = norm.replace(/[؟?!.,،؛:()«»"']/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return false;
  return /^(?:السلام عليكم(?:\s+ورحمة الله(?:\s+وبركاته)?)?|وعليكم السلام|اهلا(?:\s+وسهلا)?|مرحبا(?:\s+بك)?|هلا(?:\s+والله|\s+بك|\s+وغلا)?|حياك(?:\s+الله)?|صباح الخير|صباح النور|مساء الخير|مساء النور|سلام(?:\s+عليكم)?|hello|hi|hey)(?:\s+.*)?$/u.test(
    cleaned
  ) && cleaned.split(' ').length <= 7;
}

function isCasualConversationPhrase(norm: string): boolean {
  const cleaned = norm.replace(/[؟?!.,،؛:()«»"']/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return false;
  if (
    /(?:كيف\s+حالك|كيفك|شلونك|وش\s+اخبارك|اخبارك|علومك|وش\s+لونك|طيب\s+الحمد|الحمد\s*لله|بخير(?:\s+الحمد\s*لله)?|تمام\s+والله|وش\s+اسمك|ما\s+اسمك|من\s+انت|مين\s+انت|عرفني\s+عليك|انت\s+(?:انسان|بشر|حقيقي|روبوت|بوت|ذكاء\s+اصطناعي)|مشكور|مشكوره|شكرا|يعطيك\s+العافيه|ما\s+قصرت|تسلم|الله\s+يسلمك|جزاك\s+الله\s+خير|الله\s+يسعدك|بيض\s+الله\s+وجهك|كفو|مبدع|طفشان|ملل|زهقان|ضاق\s+صدري|نسولف|سولف|فمان\s+الله|مع\s+السلامه|تصبح\s+على\s+خير|how\s+are\s+you|who\s+are\s+you|are\s+you\s+(?:human|ai|real)|thank\s*you|thanks)/u.test(
      cleaned
    )
  ) {
    return true;
  }
  return false;
}

function isHelpQuestion(norm: string): boolean {
  return /(?:كيف\s+(?:اضيف|انشر|اعدل|احذف|اسجل|اوثق|اتواصل|اسوم|اقدم|ادخل|ابحث|اعرض)|وشلون\s+(?:اضيف|اعدل|اسوم|اوثق|اسجل)|طريقه\s+(?:التسجيل|النشر|التعديل|التوثيق|السوم|الدفع|الشراء|البيع)|هل\s+يوجد\s+دفع|الدفع\s+الالكتروني|العموله|رسوم\s+المنصه|الباقات|توثيق\s+(?:المربي|الحساب)|لوحه\s+التحكم|شروط\s+الاستخدام|استرجاع\s+الرقم|رقم\s+(?:البائع|الجوال|التواصل)|حساب\s+جديد|كيف\s+تعمل\s+المنصه|خطوات\s+البيع)/u.test(
    norm
  );
}

function isBreedComparisonOrPriceQuestion(norm: string, normalized: NormalizedSaudiQuery): boolean {
  const asksPricesOrComparison =
    /(?:كم\s+(?:اسعار|سعر)|متوسط\s+(?:سعر|اسعار)|دليل\s+(?:السلالات|الاسعار)|الاسعار\s+الاسترشاديه|(?:وش|ما|هل\s+يوجد)?\s*(?:ال)?فرق\s+بين|قارن\s+بين|مقارنه\s+بين|ايهما\s+افضل|افضل\s+سلاله|مميزات\s+(?:النعيمي|النجدي|الحري|العارضي|السواكني)|عيوب\s+(?:النعيمي|النجدي|الحري))/u.test(
      norm
    );
  const asksForListings =
    /(?:ابي|ابغى|اريد|بغيت|ابحث|دور\s+لي|اعرض|ورني|هات|فيه\s+عروض|اعلانات\s+متاحه)/u.test(norm);
  return asksPricesOrComparison && !normalized.regionId && !normalized.maxPrice && !asksForListings;
}

function isFilterCorrectionText(norm: string): boolean {
  return /^(?:لا|لاء|بل|قصدي|غيرها|غيره|بدلها|بدله|خلها|خله|خل\s+السعر|خلي\s+السعر|غير\s+السعر|عدل\s+السعر|ارفع\s+السعر|نزل\s+السعر|تعديل)\b/u.test(
    norm
  ) || /(?:لا\s+قصدي|قصدي|غير\s+لـ|خل\s+السعر|خلي\s+السعر|بدل\s+ال)/u.test(norm);
}

function isClearAllPriceText(norm: string): boolean {
  return /(?:بدون\s+حد|اي\s+سعر|السعر\s+مفتوح|الغي\s+السعر|لا\s+يهم\s+السعر)/u.test(norm);
}

function isClearRegionText(norm: string): boolean {
  return /(?:كل\s+المناطق|اي\s+منطقه|اي\s+مكان|الغي\s+المنطقه)/u.test(norm);
}

function isExplicitSearchTrigger(norm: string): boolean {
  return /(?:ورني|اعرض|اعرضها|ابحث|دور\s+لي|هات|اشوف|اظهر|اعلانات|المتاح|الكل|عروض|سوم|محصن)/u.test(
    norm
  );
}

function buildDialectTermsSummary(q: NormalizedSaudiQuery): string[] {
  const terms: string[] = [];
  if (q.breedId && BREED_LABEL_BY_ID[q.breedId]) terms.push(BREED_LABEL_BY_ID[q.breedId]);
  if (q.subCategoryId === 'sub_slaughter') terms.push('ذبائح');
  else if (q.subCategoryId === 'sub_breeding') terms.push('تربية');
  else if (q.subCategoryId === 'sub_show') terms.push('فحول/عرض');
  if (q.regionId) terms.push(q.city || REGION_LABEL_BY_ID[q.regionId] || q.regionId);
  if (q.minPrice !== undefined && q.maxPrice !== undefined) {
    terms.push(`سعر ${q.minPrice}-${q.maxPrice}`);
  } else if (q.maxPrice !== undefined) {
    terms.push(`سقف السعر ${q.maxPrice}`);
  } else if (q.minPrice !== undefined) {
    terms.push(`الحد الأدنى ${q.minPrice}`);
  }
  if (q.sex) terms.push(q.sex === 'ذكر' ? 'ذكور' : q.sex === 'أنثى' ? 'إناث' : 'مختلط');
  if (q.vaccinatedOnly) terms.push('محصن');
  if (q.acceptsOffersOnly) terms.push('يقبل السوم');
  return terms;
}

export function classifyAiIntent(
  rawQuery: string,
  normalized: NormalizedSaudiQuery,
  history: AiChatHistoryItem[] = []
): AiIntent {
  const norm = normalized.normalizedText;
  const hasSearchFilter = hasSearchEntity(normalized);

  if (isPureGreetingPhrase(norm) && !hasSearchFilter && !isHelpQuestion(norm)) {
    return 'greeting';
  }

  if (
    isCasualConversationPhrase(norm) &&
    !hasSearchFilter &&
    !isHelpQuestion(norm) &&
    !isBreedComparisonOrPriceQuestion(norm, normalized) &&
    !isExplicitSearchTrigger(norm)
  ) {
    return 'casual_chat';
  }

  if (isHelpQuestion(norm)) {
    return 'marketplace_help';
  }

  if (isBreedComparisonOrPriceQuestion(norm, normalized)) {
    return 'breed_prices';
  }

  if (
    hasSearchFilter ||
    isExplicitSearchTrigger(norm) ||
    /(?:ابي|ابغى|اريد|بغيت|ابحث|دور\s+لي|اعرض|ورني|فيه\s+(?:غنم|نعيمي|نجدي|حري|عارضي|سواكني|حلال)|اعلانات|عروض\s+حلال)/u.test(
      norm
    )
  ) {
    return 'marketplace_search';
  }

  // Check if user sent a short contextual reply to an assistant search prompt (e.g. "بدون حد", "كل المناطق", "2000")
  const lastAssistant = [...history].reverse().find((h) => h.role === 'assistant');
  if (
    lastAssistant &&
    /(?:منطقة|ميزانية|سعر|تبحث|تفضل|عروض)/u.test(normalizeArabicSearchText(lastAssistant.content)) &&
    (isClearAllPriceText(norm) || isClearRegionText(norm) || /^\d{3,6}$/.test(norm))
  ) {
    return 'marketplace_search';
  }

  // Short casual statement / non-livestock harmless chitchat when no livestock keywords appear
  if (
    !/(?:غنم|اغنام|ماعز|معزا|حلال|ضأن|نعيمي|نجدي|حري|عارضي|سواكني|فحل|طلي|رخل|علف|شعير|برسيم|تحصين|تطعيم|بيطر|ذبيحه|اضحيه|مراح|سوق|سلاله|سلالات)/u.test(
      norm
    )
  ) {
    return 'casual_chat';
  }

  return 'general_livestock';
}

export interface ConversationalResolution {
  intent: AiIntent;
  mergedQuery: NormalizedSaudiQuery;
  turnQuery: NormalizedSaudiQuery;
  clarificationStage: AiClarificationStage;
  isFilterModification: boolean;
}

function mergeSearchQueries(
  base: NormalizedSaudiQuery,
  patch: NormalizedSaudiQuery
): NormalizedSaudiQuery {
  const norm = patch.normalizedText;
  const next: NormalizedSaudiQuery = {
    ...base,
    rawQuery: patch.rawQuery,
    normalizedText: patch.normalizedText,
  };

  if (isClearRegionText(norm)) {
    next.regionId = undefined;
    next.city = undefined;
  } else if (patch.regionId) {
    next.regionId = patch.regionId;
    next.city = patch.city; // update or clear previous sub-city when region switches
  } else if (patch.city) {
    next.city = patch.city;
  }

  if (patch.breedId) {
    next.breedId = patch.breedId;
    // Switching from goat breed -> sheep breed (or vice versa) updates category cleanly
    if (patch.categoryId) {
      next.categoryId = patch.categoryId;
    }
  } else if (patch.categoryId && !next.breedId) {
    next.categoryId = patch.categoryId;
  }

  if (patch.subCategoryId) {
    next.subCategoryId = patch.subCategoryId;
  }

  if (isClearAllPriceText(norm)) {
    next.minPrice = undefined;
    next.maxPrice = undefined;
  } else {
    if (patch.maxPrice !== undefined) {
      next.maxPrice = patch.maxPrice;
      if (next.minPrice !== undefined && next.minPrice > next.maxPrice) {
        next.minPrice = undefined;
      }
    }
    if (patch.minPrice !== undefined) {
      next.minPrice = patch.minPrice;
    }
  }

  if (patch.sex) {
    next.sex = patch.sex;
    // If user explicitly switched to males only, clear female-only breeding hints cleanly
    if (patch.sex === 'ذكر' && next.subCategoryId === 'sub_breeding') {
      next.subCategoryId = undefined;
    }
  }

  if (patch.vaccinatedOnly !== undefined) next.vaccinatedOnly = patch.vaccinatedOnly;
  if (patch.negotiableOnly !== undefined) next.negotiableOnly = patch.negotiableOnly;
  if (patch.acceptsOffersOnly !== undefined) next.acceptsOffersOnly = patch.acceptsOffersOnly;
  if (patch.sort) next.sort = patch.sort;
  if (patch.searchKeywords) {
    next.searchKeywords = patch.searchKeywords;
  } else if (patch.breedId && patch.breedId !== base.breedId) {
    next.searchKeywords = '';
  }

  next.detectedDialectTerms = buildDialectTermsSummary(next);
  return next;
}

export function resolveConversationalQuery(
  rawQuery: string,
  history: AiChatHistoryItem[] = []
): ConversationalResolution {
  const lastAssistant = [...history].reverse().find((h) => h.role === 'assistant');
  const lastAssistantNorm = lastAssistant ? normalizeArabicSearchText(lastAssistant.content) : '';
  const assistantAskedBudget = /(?:ميزانيه|سعر|حدود|تحت كم|بكم)/u.test(lastAssistantNorm);
  const assistantAskedRegion = /(?:في اي منطقه|اي منطقه|وين تبحث|منطقه تبحث)/u.test(lastAssistantNorm);

  // Reconstruct accumulated search filters across recent user turns
  let accumulated: NormalizedSaudiQuery | null = null;
  let hadPriorSearchTurn = false;

  for (let i = 0; i < history.length; i += 1) {
    const item = history[i];
    if (item.role !== 'user') continue;
    const prevAssistant = i > 0 && history[i - 1]?.role === 'assistant' ? history[i - 1] : undefined;
    const prevAssistantAskedBudget = Boolean(
      prevAssistant && /(?:ميزانيه|سعر|حدود|تحت كم|بكم)/u.test(normalizeArabicSearchText(prevAssistant.content))
    );
    const step = normalizeSaudiQuery(item.content, {
      allowBarePriceNumber: prevAssistantAskedBudget,
    });
    const stepIntent = classifyAiIntent(item.content, step, history.slice(0, i));
    if (stepIntent === 'marketplace_search' || (hadPriorSearchTurn && hasSearchEntity(step))) {
      accumulated = accumulated ? mergeSearchQueries(accumulated, step) : step;
      hadPriorSearchTurn = true;
    }
  }

  const turnQuery = normalizeSaudiQuery(rawQuery, {
    allowBarePriceNumber: assistantAskedBudget || hadPriorSearchTurn,
  });
  const baseIntent = classifyAiIntent(rawQuery, turnQuery, history);
  const isModification =
    hadPriorSearchTurn &&
    (isFilterCorrectionText(turnQuery.normalizedText) ||
      isClearAllPriceText(turnQuery.normalizedText) ||
      isClearRegionText(turnQuery.normalizedText));

  // If this turn is a clear greeting or casual social chat or help, don't force listing search
  if (
    baseIntent === 'greeting' ||
    baseIntent === 'casual_chat' ||
    baseIntent === 'marketplace_help' ||
    baseIntent === 'breed_prices'
  ) {
    return {
      intent: baseIntent,
      mergedQuery: turnQuery,
      turnQuery,
      clarificationStage: 'none',
      isFilterModification: false,
    };
  }

  const mergedQuery =
    accumulated && (baseIntent === 'marketplace_search' || isModification)
      ? mergeSearchQueries(accumulated, turnQuery)
      : turnQuery;

  if (baseIntent !== 'marketplace_search' && !isModification) {
    return {
      intent: baseIntent,
      mergedQuery: turnQuery,
      turnQuery,
      clarificationStage: 'none',
      isFilterModification: false,
    };
  }

  // Decide conversational narrowing vs immediate listing search execution
  const explicitCommand =
    isExplicitSearchTrigger(turnQuery.normalizedText) ||
    isModification ||
    turnQuery.maxPrice !== undefined ||
    turnQuery.minPrice !== undefined ||
    turnQuery.sex !== undefined ||
    isClearAllPriceText(turnQuery.normalizedText) ||
    isClearRegionText(turnQuery.normalizedText);

  let clarificationStage: AiClarificationStage = 'execute_search';

  if (!explicitCommand) {
    const onlyBreed =
      Boolean(mergedQuery.breedId) &&
      !mergedQuery.regionId &&
      !mergedQuery.city &&
      !mergedQuery.subCategoryId &&
      mergedQuery.maxPrice === undefined &&
      mergedQuery.minPrice === undefined &&
      !mergedQuery.vaccinatedOnly;

    if (onlyBreed && !hadPriorSearchTurn) {
      // User just opened with a single bare breed (e.g. "أبغى نعيمي") -> ask region first
      clarificationStage = 'ask_region';
    } else if (
      assistantAskedRegion &&
      Boolean(mergedQuery.breedId) &&
      Boolean(mergedQuery.regionId || mergedQuery.city) &&
      mergedQuery.maxPrice === undefined &&
      mergedQuery.minPrice === undefined
    ) {
      // User answered the region prompt (e.g. "الرياض") -> ask budget naturally next
      clarificationStage = 'ask_budget';
    }
  }

  return {
    intent: 'marketplace_search',
    mergedQuery,
    turnQuery,
    clarificationStage,
    isFilterModification: isModification,
  };
}
