import type { Language } from './i18n';

export function formatPriceSar(amount: number, lang: Language = 'ar'): string {
  const num = Number(amount || 0).toLocaleString('en-US');
  return lang === 'en' ? `${num} SAR` : `${num} ر.س`;
}

export function formatRelativeArabicTime(
  isoDate: string,
  nowMs: number = Date.now(),
  lang: Language = 'ar'
): string {
  const ts = new Date(isoDate).getTime();
  if (!Number.isFinite(ts)) return lang === 'en' ? 'Just now' : 'الآن';
  const diffMs = Math.max(0, nowMs - ts);
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (lang === 'en') {
    if (diffHours < 1) return 'Just now';
    if (diffHours === 1) return '1h ago';
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays}d ago`;
  }

  if (diffHours < 1) return 'قبل قليل';
  if (diffHours === 1) return 'منذ ساعة';
  if (diffHours === 2) return 'منذ ساعتين';
  if (diffHours <= 10) return `منذ ${diffHours} ساعات`;
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'أمس';
  if (diffDays === 2) return 'منذ يومين';
  if (diffDays <= 10) return `منذ ${diffDays} أيام`;
  return `منذ ${diffDays} يوماً`;
}

export function formatArabicGregorianDate(
  dateInput: Date | string,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' },
  lang: Language = 'ar'
): string {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '—';
  const locale = lang === 'en' ? 'en-US' : 'ar-SA-u-ca-gregory';
  return new Intl.DateTimeFormat(locale, options).format(date);
}

export function formatStatusLabel(status: string, lang: Language = 'ar'): string {
  if (lang === 'en') {
    switch (status) {
      case 'Published':
        return 'Published';
      case 'Pending':
        return 'Pending Review';
      case 'Rejected':
        return 'Rejected';
      case 'Sold':
        return 'Sold';
      case 'Draft':
        return 'Draft';
      case 'Expired':
        return 'Expired';
      default:
        return status;
    }
  }
  switch (status) {
    case 'Published':
      return 'منشور';
    case 'Pending':
      return 'بانتظار المراجعة';
    case 'Rejected':
      return 'مرفوض';
    case 'Sold':
      return 'تم البيع';
    case 'Draft':
      return 'مسودة';
    case 'Expired':
      return 'منتهي الصلاحية';
    default:
      return status;
  }
}

export const STOCK_GALLERY_OPTIONS = [
  { label: 'نعيمي بلدي', url: '/src/assets/images/breed_naimi_sheep_1794608169331.jpg' },
  { label: 'نجدي أصيل', url: '/src/assets/images/breed_najdi_sheep_1794608169810.jpg' },
  { label: 'حري حجازي', url: '/src/assets/images/breed_harri_sheep_1794608169989.jpg' },
  { label: 'ماعز عارضي', url: '/src/assets/images/breed_ardhi_goat_1794608169786.jpg' },
  { label: 'سواكني محلي', url: '/src/assets/images/breed_sawakni_camels_1794608171012.jpg' },
];

export function getStockGalleryOptions(lang: Language = 'ar') {
  if (lang === 'ar') return STOCK_GALLERY_OPTIONS;
  return [
    { label: 'Local Naimi', url: '/src/assets/images/breed_naimi_sheep_1794608169331.jpg' },
    { label: 'Pure Najdi', url: '/src/assets/images/breed_najdi_sheep_1794608169810.jpg' },
    { label: 'Hijazi Harri', url: '/src/assets/images/breed_harri_sheep_1794608169989.jpg' },
    { label: 'Ardhi Goat', url: '/src/assets/images/breed_ardhi_goat_1794608169786.jpg' },
    { label: 'Local Sawakni', url: '/src/assets/images/breed_sawakni_camels_1794608171012.jpg' },
  ];
}
