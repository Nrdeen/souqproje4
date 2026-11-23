import type { CommissionEligibility, CommissionRecordStatus, CommissionSettings } from './commission';
import type { Language } from './i18n';

const CATEGORY_NAME_EN: Record<string, string> = {
  الأغنام: 'Sheep',
  الماعز: 'Goats',
  'فحول الإنتاج': 'Breeding Rams',
  ذبائح: 'Slaughter',
  'مواشي للتربية': 'Breeding Livestock',
  'مواشي للعرض': 'Show Livestock',
};

const CATEGORY_DESC_EN: Record<string, string> = {
  'أغنام وماعز جاهزة للذبح والمناسبات والأضاحي':
    'Sheep and goats ready for slaughter, feasts, and sacrifices',
  'إناث دفيع ومتابيع وقطيع إنتاج للتربية والتكاثر':
    'Pregnant ewes, nursing females, and breeding herds for reproduction',
  'فحول صنف وسلالات فاخرة للعرض والإنتاج المميز':
    'Pedigree breeding sires and show-grade livestock',
};

const BREED_NAME_EN: Record<string, string> = {
  نعيمي: 'Naimi',
  نجدي: 'Najdi',
  حري: 'Harri',
  عارضي: 'Ardhi',
  سواكني: 'Sawakni',
  'نعيمي بلدي': 'Local Naimi',
  'نجدي أصيل': 'Pure Najdi',
  'حري حجازي': 'Hijazi Harri',
  'ماعز عارضي': 'Ardhi Goat',
  'سواكني مربى محلياً': 'Locally Raised Sawakni',
  'سواكني محلي': 'Local Sawakni',
};

const BREED_ORIGIN_EN: Record<string, string> = {
  'نجد والشمال': 'Najd & Northern Region',
  'وسط المملكة (نجد)': 'Central Saudi Arabia (Najd)',
  'الحجاز والساحل الغربي': 'Hijaz & Western Coast',
  'هضبة نجد والعارض': 'Najd Plateau & Al-Arid',
  'مربى محلياً': 'Locally Raised in Saudi Arabia',
};

const BREED_SUMMARY_EN: Record<string, string> = {
  'السلالة الأكثر طلباً في المملكة للذبائح والمناسبات، تمتاز بجودة اللحم وتوازن الدهن وقدرتها العالية على التكيف.':
    'The most demanded sheep breed in Saudi Arabia for slaughter and feasts, known for tender meat quality, balanced fat marbling, and strong adaptability.',
  'أيقونة المواشي النجدية الأصيلة، معروفة بقامتها الطويلة وشعرها الأسود اللامع وأنفها المقوّس وقيمتها العالية لدى المربين.':
    'An icon of authentic Najdi livestock, prized for its tall stature, glossy black coat, arched profile, and high value among breeders.',
  'سلالة حجازية عريقة تشتهر بلحمها الطري ونموها السريع، وتحظى بإقبال كبير في مكة وجدة والطائف.':
    'A classic Hijazi breed celebrated for tender meat and rapid growth, heavily favored in Makkah, Jeddah, and Taif.',
  'الماعز السعودي الأصيل المفضّل للإنتاج والزينة، يمتاز بالأذنين الطويلتين والهيكل القوي والقدرة الممتازة على إدرار الحليب.':
    'Saudi Arabia’s premier native goat for breeding and show, distinguished by long ears, sturdy build, and strong milk production.',
  'خيار اقتصادي عملي للولائم والعقود الغذائية، يمتاز بوفرة اللحم وانخفاض الشحم خاصة عند تربيته وتغذيته محلياً.':
    'A practical, economical choice for large feasts and catering, offering abundant lean meat especially when locally raised and grain-fed.',
};

const BREED_CHAR_EN: Record<string, string> = {
  'رأس بني محمر وصوف أبيض كثيف': 'Reddish-brown head with thick white wool',
  'تتحمل أجواء الصحراء والبرد': 'Tolerant to desert heat and cold winters',
  'نسبة تصافي لحم مرتفعة': 'High dressed carcass meat yield',
  'لون أسود حالك مع بياض في الوجه والأطراف': 'Jet-black coat with white facial and leg markings',
  'مناسبة جداً للتربية والإنتاج الفاخر': 'Ideal for pedigree breeding and premium stock',
  'خصوبة عالية ومقاومة للجفاف': 'High fertility and drought resilience',
  'لون أبيض ناصع وصوف ناعم متوسط': 'Bright white coat with soft medium wool',
  'لحم خفيف الدهون ومذاق مميز': 'Low-fat meat with distinctive mild flavor',
  'معدلات توأم عالية': 'High twinning rate',
  'شعر أسود لامع وأذنان طويلتان متدليتان': 'Glossy black coat with long drooping ears',
  'مقاوم للحرارة وقلة المرعى': 'Heat-hardy and adaptable to sparse grazing',
  'مطلوب لفحول الصنف والتربية': 'Highly sought after for pedigree bucks and breeding',
  'غطاء قصير بلون بني أو أحمر فاتح': 'Short coat in light brown or reddish-tan',
  'وزن لحم صافٍ مرتفع': 'High net clean meat yield',
  'سعر اقتصادي للمناسبات الكبيرة': 'Cost-effective pricing for large feasts',
};

const REGION_NAME_EN: Record<string, string> = {
  الرياض: 'Riyadh',
  'منطقة الرياض': 'Riyadh Region',
  'مكة المكرمة': 'Makkah',
  'منطقة مكة المكرمة': 'Makkah Region',
  'المنطقة الشرقية': 'Eastern Province',
  القصيم: 'Al-Qassim',
  'منطقة القصيم': 'Al-Qassim Region',
  'المدينة المنورة': 'Madinah',
  'منطقة المدينة المنورة': 'Madinah Region',
  عسير: 'Asir',
  'منطقة عسير': 'Asir Region',
  حائل: 'Hail',
  'منطقة حائل': 'Hail Region',
  تبوك: 'Tabuk',
  'منطقة تبوك': 'Tabuk Region',
  'الحدود الشمالية': 'Northern Borders',
  'منطقة الحدود الشمالية': 'Northern Borders Region',
  جازان: 'Jazan',
  'منطقة جازان': 'Jazan Region',
  نجران: 'Najran',
  'منطقة نجران': 'Najran Region',
  الباحة: 'Al-Bahah',
  'منطقة الباحة': 'Al-Bahah Region',
  الجوف: 'Al-Jouf',
  'منطقة الجوف': 'Al-Jouf Region',
  'جميع مناطق المملكة': 'All Saudi Regions',
  'كل مناطق المملكة': 'All Saudi Regions',
};

const CITY_NAME_EN: Record<string, string> = {
  الرياض: 'Riyadh',
  المزاحمية: 'Al-Muzahimiyah',
  'الرياض — المزاحمية': 'Riyadh — Al-Muzahimiyah',
  بريدة: 'Buraidah',
  'بريدة — القصيم': 'Buraidah — Al-Qassim',
  الطائف: 'Taif',
  'الطائف — مكة المكرمة': 'Taif — Makkah',
  الخرج: 'Al-Kharj',
  الدمام: 'Dammam',
  الخبر: 'Khobar',
  الأحساء: 'Al-Ahsa',
  حائل: 'Hail',
  رماح: 'Rumah',
  جدة: 'Jeddah',
  مكة: 'Makkah',
  'مكة المكرمة': 'Makkah',
  'المدينة المنورة': 'Madinah',
  أبها: 'Abha',
  تبوك: 'Tabuk',
  نجران: 'Najran',
  الباحة: 'Al-Bahah',
  سكاكا: 'Sakaka',
  عرعر: 'Arar',
  جازان: 'Jazan',
  عنيزة: 'Unaizah',
  الرس: 'Ar Rass',
  الجبيل: 'Jubail',
  ينبع: 'Yanbu',
};

const SEX_LABEL_EN: Record<string, string> = {
  ذكر: 'Male',
  أنثى: 'Female',
  'قطيع مختلط': 'Mixed Herd',
};

const AGE_GROUP_EN: Record<string, string> = {
  'هرفي / جذع (6-9 أشهر)': 'Young / Jadha (6–9 months)',
  'جذع (7-10 أشهر)': 'Jadha (7–10 months)',
  'بهم وسط (5-8 أشهر)': 'Medium Lamb (5–8 months)',
  'جذع / ثني': 'Jadha / Thani',
  'جذع كبير (9-12 شهراً)': 'Mature Jadha (9–12 months)',
};

const REGION_NOTE_EN: Record<string, string> = {
  'الرياض والقصيم والشرقية': 'Riyadh, Al-Qassim & Eastern Province',
  'الرياض وحائل والقصيم': 'Riyadh, Hail & Al-Qassim',
  'مكة وجدة والطائف': 'Makkah, Jeddah & Taif',
  'الرياض والقصيم': 'Riyadh & Al-Qassim',
  'جميع مناطق المملكة': 'All Regions in Saudi Arabia',
};

const SPECIALTY_EN: Record<string, string> = {
  'نعيمي ونجدي': 'Naimi & Najdi',
  'نجدي وعارضي': 'Najdi & Ardhi',
  'حري وسواكني': 'Harri & Sawakni',
};

const FAQ_EN_BY_ID: Record<string, { question: string; answer: string }> = {
  faq_1: {
    question: 'How are listings reviewed on SouqAlGhanam 2.0?',
    answer:
      'Every new listing starts as "Pending Review" so moderators can verify photo clarity and complete specifications (breed, age, weight, and SAR price) before publishing to protect buyers and breeders.',
  },
  faq_2: {
    question: 'Are the indicative market prices mandatory for sellers?',
    answer:
      'No. Indicative prices are weekly market reference averages across Saudi regions to help sellers and buyers evaluate fair value without enforcing fixed pricing.',
  },
  faq_3: {
    question: 'How do I get my breeder account verified?',
    answer:
      'Active breeders can request verification from their dashboard by completing their mobile number and ranch location, earning the Verified Breeder badge on their profile and listings.',
  },
  faq_4: {
    question: 'What should I do if I notice a misleading or violating listing?',
    answer:
      'Use the "Report Violation" button on the listing details page. Your report goes straight to the moderation team for prompt review.',
  },
};

export function trCategoryName(name: string | undefined | null, lang: Language): string {
  if (!name) return '';
  if (lang === 'ar') return name;
  return CATEGORY_NAME_EN[name] ?? name;
}

export function trCategoryDesc(desc: string | undefined | null, lang: Language): string {
  if (!desc) return '';
  if (lang === 'ar') return desc;
  return CATEGORY_DESC_EN[desc] ?? desc;
}

export function trBreedName(name: string | undefined | null, lang: Language): string {
  if (!name) return '';
  if (lang === 'ar') return name;
  return BREED_NAME_EN[name] ?? name;
}

export function trBreedOrigin(origin: string | undefined | null, lang: Language): string {
  if (!origin) return '';
  if (lang === 'ar') return origin;
  return BREED_ORIGIN_EN[origin] ?? origin;
}

export function trBreedSummary(summary: string | undefined | null, lang: Language): string {
  if (!summary) return '';
  if (lang === 'ar') return summary;
  return BREED_SUMMARY_EN[summary] ?? summary;
}

export function trBreedCharacteristics(items: string[] | undefined, lang: Language): string[] {
  if (!Array.isArray(items)) return [];
  if (lang === 'ar') return items;
  return items.map((item) => BREED_CHAR_EN[item] ?? item);
}

export function trUnitString(value: string | undefined | null, lang: Language): string {
  if (!value) return '';
  if (lang === 'ar') return value;
  return value
    .replace(/ر\.س/g, 'SAR')
    .replace(/ريال سعودي/g, 'SAR')
    .replace(/ريال/g, 'SAR')
    .replace(/كجم/g, 'kg')
    .replace(/رأس/g, 'head');
}

export function trRegionName(name: string | undefined | null, lang: Language): string {
  if (!name) return '';
  if (lang === 'ar') return name;
  return REGION_NAME_EN[name] ?? name;
}

export function trCityName(name: string | undefined | null, lang: Language): string {
  if (!name) return '';
  if (lang === 'ar') return name;
  const trimmed = name.trim();
  if (CITY_NAME_EN[trimmed]) return CITY_NAME_EN[trimmed];
  if (trimmed.includes('—')) {
    return trimmed
      .split('—')
      .map((part) => {
        const p = part.trim();
        return CITY_NAME_EN[p] ?? REGION_NAME_EN[p] ?? p;
      })
      .join(' — ');
  }
  return trimmed;
}

export function trSexLabel(sex: string | undefined | null, lang: Language): string {
  if (!sex) return '';
  if (lang === 'ar') return sex;
  return SEX_LABEL_EN[sex] ?? sex;
}

export function trIndicativeAgeGroup(ageGroup: string | undefined | null, lang: Language): string {
  if (!ageGroup) return '';
  if (lang === 'ar') return ageGroup;
  return AGE_GROUP_EN[ageGroup] ?? ageGroup;
}

export function trIndicativeRegionNote(note: string | undefined | null, lang: Language): string {
  if (!note) return '';
  if (lang === 'ar') return note;
  return REGION_NOTE_EN[note] ?? trRegionName(note, lang);
}

export function trSellerSpecialty(specialty: string | undefined | null, lang: Language): string {
  if (!specialty) return '';
  if (lang === 'ar') return specialty;
  return SPECIALTY_EN[specialty] ?? specialty;
}

export function trFaqItem<T extends { id: string; question: string; answer: string }>(
  faq: T,
  lang: Language
): T {
  if (lang === 'ar') return faq;
  const mapped = FAQ_EN_BY_ID[faq.id];
  if (!mapped) return faq;
  return { ...faq, question: mapped.question, answer: mapped.answer };
}

export function trVerificationStatus(
  status: string | undefined | null,
  lang: Language
): string {
  const s = status || 'Unverified';
  if (lang === 'en') {
    switch (s) {
      case 'Verified':
        return 'Verified';
      case 'Pending':
        return 'Under Review';
      case 'Rejected':
        return 'Rejected';
      default:
        return 'Unverified';
    }
  }
  switch (s) {
    case 'Verified':
      return 'موثق';
    case 'Pending':
      return 'قيد المراجعة';
    case 'Rejected':
      return 'مرفوض';
    default:
      return 'غير موثق';
  }
}

export function trCommissionStatusLabel(
  status: CommissionRecordStatus,
  lang: Language
): string {
  if (lang === 'ar') {
    switch (status) {
      case 'approved':
        return 'مدفوعة ومعتمدة';
      case 'pending_review':
        return 'بانتظار مراجعة الحوالة';
      case 'pending_payment':
        return 'بانتظار سداد العمولة';
      case 'rejected':
        return 'حوالة مرفوضة';
      case 'exempt':
        return 'معفى (عرض الإطلاق)';
      case 'not_applicable':
      default:
        return 'بيع خارج المنصة';
    }
  }
  switch (status) {
    case 'approved':
      return 'Paid & Approved';
    case 'pending_review':
      return 'Transfer Under Review';
    case 'pending_payment':
      return 'Awaiting Commission Payment';
    case 'rejected':
      return 'Transfer Rejected';
    case 'exempt':
      return 'Exempt (Launch Promo)';
    case 'not_applicable':
    default:
      return 'Sold Outside Platform';
  }
}

export function trCommissionEligibilityReason(
  eligibility: CommissionEligibility,
  settings: CommissionSettings,
  lang: Language
): string {
  if (lang === 'ar') return eligibility.reasonLabel;
  if (!settings.promoEnabled || settings.commissionRatePercent <= 0) {
    return settings.commissionRatePercent <= 0
      ? 'Commission is currently disabled (0%)'
      : `Platform commission (${settings.commissionRatePercent}%) applies after a completed sale`;
  }
  if (eligibility.reason === 'promo_free_listings') {
    return `Covered by launch promo (${eligibility.remainingFreeSales} of first ${settings.promoFreeListingsCount} sales commission-free)`;
  }
  if (eligibility.reason === 'promo_days') {
    return `Covered by first-month launch exemption (${eligibility.remainingFreeDays} days remaining commission-free)`;
  }
  return `Platform commission (${settings.commissionRatePercent}%) applies on the sale total once completed`;
}
