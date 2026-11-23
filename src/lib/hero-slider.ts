export type HeroCtaAction = 'browse' | 'add' | 'breeds' | 'how';

export interface HeroSlideAction {
  label: string;
  action: HeroCtaAction;
  variant: 'primary' | 'secondary';
}

export interface HeroSlideSpec {
  id: string;
  imageSrc: string;
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
  /** Responsive object-position classes tuned so key livestock & people remain visible */
  objectPositionClass: string;
  eyebrow?: string;
  headline: string;
  subheadline?: string;
  description: string;
  actions: HeroSlideAction[];
}

export const HERO_AUTOPLAY_INTERVAL_MS = 7000;
export const HERO_TRANSITION_DURATION_MS = 900;
export const HERO_SWIPE_THRESHOLD_PX = 42;

export const HERO_SLIDES: HeroSlideSpec[] = [
  {
    id: 'brand-identity',
    imageSrc: '/src/assets/images/hero_saudi_livestock_1794608168927.jpg',
    imageAlt:
      'راعي أغنام سعودي بالزي التقليدي مع قطيع من الأغنام وسط الجبال والنخيل عند الغروب في المملكة العربية السعودية',
    imageWidth: 1774,
    imageHeight: 887,
    objectPositionClass: 'object-[14%_42%] sm:object-[20%_50%] lg:object-[42%_52%]',
    eyebrow: 'سوق المواشي السعودي',
    headline: 'سوق الغنم',
    subheadline: 'من المربّي إلى المشتري',
    description: 'اكتشف عروض الأغنام والمواشي، وتواصل مباشرة مع المربين في أنحاء المملكة.',
    actions: [
      { label: 'تصفح الإعلانات', action: 'browse', variant: 'primary' },
      { label: 'أضف إعلانك', action: 'add', variant: 'secondary' },
    ],
  },
  {
    id: 'breeds-discovery',
    imageSrc: '/src/assets/images/hero_breeds_discovery_1795031278390.jpg',
    imageAlt: 'أغنام سعودية أصيلة من سلالات النعيمي والنجدي في مرعى صحراوي دافئ وقت الغروب',
    imageWidth: 1376,
    imageHeight: 768,
    objectPositionClass: 'object-[36%_54%] sm:object-[28%_55%] lg:object-[24%_55%]',
    headline: 'اكتشف السلالات الأصيلة',
    description: 'تصفح عروض النعيمي والنجدي والحري وغيرها من السلالات.',
    actions: [
      { label: 'استكشف السلالات', action: 'breeds', variant: 'primary' },
      { label: 'تصفح الإعلانات', action: 'browse', variant: 'secondary' },
    ],
  },
  {
    id: 'seller-experience',
    imageSrc: '/src/assets/images/hero_seller_ranch_1795031279075.jpg',
    imageAlt: 'مراح أغنام سعودي منظم وسط النخيل والحظائر الحجرية النظيفة في إضاءة الصباح الذهبية',
    imageWidth: 1376,
    imageHeight: 768,
    objectPositionClass: 'object-[26%_62%] sm:object-[18%_60%] lg:object-[12%_60%]',
    headline: 'مواشيك تستحق أفضل عرض',
    description: 'أضف إعلانك بمواصفات واضحة، وتواصل مع المشترين مباشرة.',
    actions: [
      { label: 'أضف إعلانك', action: 'add', variant: 'primary' },
      { label: 'كيف تعمل المنصة؟', action: 'how', variant: 'secondary' },
    ],
  },
];

export const HERO_SLIDES_EN: HeroSlideSpec[] = [
  {
    id: 'brand-identity',
    imageSrc: '/src/assets/images/hero_saudi_livestock_1794608168927.jpg',
    imageAlt:
      'Saudi shepherd in traditional attire tending a sheep herd amid mountains and palms at sunset in Saudi Arabia',
    imageWidth: 1774,
    imageHeight: 887,
    objectPositionClass: 'object-[14%_42%] sm:object-[20%_50%] lg:object-[42%_52%]',
    eyebrow: 'Saudi Livestock Marketplace',
    headline: 'SouqAlGhanam',
    subheadline: 'Direct from Breeder to Buyer',
    description: 'Explore verified sheep and livestock listings, and connect directly with breeders across the Kingdom.',
    actions: [
      { label: 'Browse Listings', action: 'browse', variant: 'primary' },
      { label: 'Post Listing', action: 'add', variant: 'secondary' },
    ],
  },
  {
    id: 'breeds-discovery',
    imageSrc: '/src/assets/images/hero_breeds_discovery_1795031278390.jpg',
    imageAlt: 'Authentic Naimi and Najdi Saudi sheep grazing in a warm golden desert pasture at sunset',
    imageWidth: 1376,
    imageHeight: 768,
    objectPositionClass: 'object-[36%_54%] sm:object-[28%_55%] lg:object-[24%_55%]',
    headline: 'Discover Pure Breeds',
    description: 'Browse Naimi, Najdi, Harri, Ardhi, and Sawakni livestock listings with transparent specs.',
    actions: [
      { label: 'Explore Breeds', action: 'breeds', variant: 'primary' },
      { label: 'Browse Listings', action: 'browse', variant: 'secondary' },
    ],
  },
  {
    id: 'seller-experience',
    imageSrc: '/src/assets/images/hero_seller_ranch_1795031279075.jpg',
    imageAlt: 'Organized Saudi sheep ranch surrounded by palm trees and clean stone pens in golden morning light',
    imageWidth: 1376,
    imageHeight: 768,
    objectPositionClass: 'object-[26%_62%] sm:object-[18%_60%] lg:object-[12%_60%]',
    headline: 'Showcase Your Herd Properly',
    description: 'Publish your livestock with verified age, weight, and health specs, and reach serious buyers directly.',
    actions: [
      { label: 'Post Listing', action: 'add', variant: 'primary' },
      { label: 'How It Works', action: 'how', variant: 'secondary' },
    ],
  },
];

export function getHeroSlides(lang: 'ar' | 'en' = 'ar'): HeroSlideSpec[] {
  return lang === 'en' ? HERO_SLIDES_EN : HERO_SLIDES;
}

/**
 * Computes next or previous slide index with clean circular wrap-around.
 */
export function stepHeroSlide(
  currentIndex: number,
  totalSlides: number,
  direction: 'next' | 'prev'
): number {
  if (totalSlides <= 1) return 0;
  const safeIndex = ((currentIndex % totalSlides) + totalSlides) % totalSlides;
  return direction === 'next'
    ? (safeIndex + 1) % totalSlides
    : (safeIndex - 1 + totalSlides) % totalSlides;
}

/**
 * Resolves touch swipe gesture direction in RTL or LTR hero layout.
 */
export function resolveHeroSwipeDirection(
  deltaX: number,
  deltaY: number,
  thresholdPx = HERO_SWIPE_THRESHOLD_PX
): 'next' | 'prev' | null {
  if (Math.abs(deltaX) < thresholdPx) return null;
  if (Math.abs(deltaX) <= Math.abs(deltaY)) return null;
  return deltaX < 0 ? 'next' : 'prev';
}

/**
 * Resolves keyboard arrow navigation respecting RTL or LTR reading direction.
 */
export function resolveHeroKeyDirection(
  key: string,
  dir: 'rtl' | 'ltr' = 'rtl'
): 'next' | 'prev' | null {
  if (dir === 'ltr') {
    if (key === 'ArrowRight') return 'next';
    if (key === 'ArrowLeft') return 'prev';
    return null;
  }
  if (key === 'ArrowLeft') return 'next';
  if (key === 'ArrowRight') return 'prev';
  return null;
}

/**
 * Resolves extended carousel keyboard navigation including Home/End keys.
 */
export function resolveHeroKeyAction(
  key: string,
  dir: 'rtl' | 'ltr' = 'rtl'
): 'next' | 'prev' | 'first' | 'last' | null {
  if (key === 'Home') return 'first';
  if (key === 'End') return 'last';
  return resolveHeroKeyDirection(key, dir);
}
