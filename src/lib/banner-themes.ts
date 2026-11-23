import type { HeroSlideSpec } from './hero-slider';

export type PageBannerTheme =
  | 'market'
  | 'breeds'
  | 'breeders'
  | 'services'
  | 'feast'
  | 'finance'
  | 'account'
  | 'detail'
  | 'contact'
  | 'home-studio'
  | 'occasions'
  | 'howto'
  | 'fallback';

export interface PageBannerSlide {
  id: string;
  imageSrc: string;
  imageAltAr: string;
  imageAltEn: string;
  captionAr: string;
  captionEn: string;
  imageWidth: number;
  imageHeight: number;
  objectPositionClass: string;
}

const SLIDE_ASSETS = {
  shepherdSunset: {
    imageSrc: '/src/assets/images/hero_saudi_livestock_1794608168927.jpg',
    imageAltAr: 'راعي أغنام سعودي بالزي التقليدي مع قطيع من الأغنام وسط الجبال والنخيل عند الغروب',
    imageAltEn: 'Saudi shepherd in traditional attire with sheep herd amid mountains and palms at sunset',
    captionAr: 'أسواق المملكة الأصيلة',
    captionEn: 'Authentic Saudi Herds',
    imageWidth: 1774,
    imageHeight: 887,
    objectPositionClass: 'object-[18%_45%] sm:object-[28%_48%] lg:object-[46%_50%]',
  },
  breedsPasture: {
    imageSrc: '/src/assets/images/hero_breeds_discovery_1795031278390.jpg',
    imageAltAr: 'أغنام النعيمي والنجدي السعودية الأصيلة في مرعى ذهبي دافئ وقت الغروب',
    imageAltEn: 'Authentic Naimi and Najdi Saudi sheep grazing in a golden desert pasture',
    captionAr: 'النعيمي والنجدي والحري',
    captionEn: 'Naimi, Najdi & Harri Breeds',
    imageWidth: 1376,
    imageHeight: 768,
    objectPositionClass: 'object-[36%_52%] sm:object-[30%_54%] lg:object-[28%_52%]',
  },
  sellerRanch: {
    imageSrc: '/src/assets/images/hero_seller_ranch_1795031279075.jpg',
    imageAltAr: 'مراح أغنام سعودي منظم وسط النخيل والحظائر الحجرية النظيفة في إضاءة الصباح',
    imageAltEn: 'Organized Saudi sheep ranch surrounded by palms and clean stone pens in morning light',
    captionAr: 'مراحات ومربون موثقون',
    captionEn: 'Verified Saudi Ranches',
    imageWidth: 1376,
    imageHeight: 768,
    objectPositionClass: 'object-[34%_56%] sm:object-[30%_54%] lg:object-[26%_55%]',
  },
  feastMajlis: {
    imageSrc: '/src/assets/images/hero_feast_hospitality_1795288734921.jpg',
    imageAltAr: 'مجلس ضيافة سعودي تقليدي بإضاءة الغسق الذهبية مع الدلة النحاسية والأقواس الحجرية',
    imageAltEn: 'Traditional Saudi courtyard majlis at twilight with brass dallah coffee hospitality setup',
    captionAr: 'ضيافة سعودية للولائم والمناسبات',
    captionEn: 'Saudi Feast & Majlis Hospitality',
    imageWidth: 1376,
    imageHeight: 768,
    objectPositionClass: 'object-center sm:object-[42%_52%]',
  },
  transportFleet: {
    imageSrc: '/src/assets/images/hero_livestock_transport_1795288735598.jpg',
    imageAltAr: 'شاحنة نقل مواشي حديثة أمام مراح سعودي منظم في ضوء الصباح الذهبي',
    imageAltEn: 'Modern livestock transport carrier beside an organized Saudi mountain ranch',
    captionAr: 'نقل مجهّز وفحص بيطري',
    captionEn: 'Equipped Livestock Transport',
    imageWidth: 1376,
    imageHeight: 768,
    objectPositionClass: 'object-[38%_55%] sm:object-[32%_54%]',
  },
  heritageArch: {
    imageSrc: '/src/assets/images/hero_market_heritage_arch_1795288734346.jpg',
    imageAltAr: 'قوس معماري نجدي تقليدي يطل على واحة النخيل في المملكة وقت الغروب',
    imageAltEn: 'Traditional Najdi mudbrick heritage archway overlooking lush Saudi palm oasis at sunset',
    captionAr: 'عمارة نجدية وشفافية تجارية',
    captionEn: 'Najdi Heritage & Clear Commerce',
    imageWidth: 1376,
    imageHeight: 768,
    objectPositionClass: 'object-center',
  },
  highlandPasture: {
    imageSrc: '/src/assets/images/hero_green_pasture_sunset_1795288735497.jpg',
    imageAltAr: 'مراعي مرتفعات الطائف الخضراء عند الغروب مع قطيع أغنام تحت أشجار السدر والجبال',
    imageAltEn: 'Lush Saudi highland pastures in Taif at golden sunset with healthy grazing sheep',
    captionAr: 'مراعي المرتفعات والتربية الصحية',
    captionEn: 'Highland Pastures & Healthy Herds',
    imageWidth: 1376,
    imageHeight: 768,
    objectPositionClass: 'object-[42%_58%] sm:object-[48%_56%]',
  },
  naimiPortrait: {
    imageSrc: '/src/assets/images/breed_naimi_sheep_1794608169331.jpg',
    imageAltAr: 'رأس نعيمي سعودي فاخر بألوانه المميزة في إضاءة صحراوية دافئة',
    imageAltEn: 'Prime Saudi Naimi sheep standing in warm golden hour ranch lighting',
    captionAr: 'سلالة النعيمي الأصيلة',
    captionEn: 'Prime Naimi Lineage',
    imageWidth: 1024,
    imageHeight: 768,
    objectPositionClass: 'object-[45%_32%] sm:object-[40%_30%]',
  },
  najdiPortrait: {
    imageSrc: '/src/assets/images/breed_najdi_sheep_1794608169810.jpg',
    imageAltAr: 'سلالة النجدي السعودية بلونها الأسود وأنفها المقوس الفاخر',
    imageAltEn: 'Distinctive Saudi Najdi sheep with classic dark coat and noble profile',
    captionAr: 'سلالة النجدي الفاخرة',
    captionEn: 'Royal Najdi Profile',
    imageWidth: 1024,
    imageHeight: 768,
    objectPositionClass: 'object-[45%_30%] sm:object-[40%_28%]',
  },
  harriPortrait: {
    imageSrc: '/src/assets/images/breed_harri_sheep_1794608169989.jpg',
    imageAltAr: 'أغنام الحري الحجازية في مرتفعات السروات المضيئة',
    imageAltEn: 'Hijazi Harri sheep resting calmly on warm highland stone ranch ground',
    captionAr: 'سلالة الحري الحجازية',
    captionEn: 'Hijazi Harri Sheep',
    imageWidth: 1024,
    imageHeight: 768,
    objectPositionClass: 'object-[48%_32%] sm:object-[42%_30%]',
  },
  ardhiPortrait: {
    imageSrc: '/src/assets/images/breed_ardhi_goat_1794608169786.jpg',
    imageAltAr: 'الماعز العارضي السعودي الأصيل في مراح مرتب',
    imageAltEn: 'Authentic Saudi Ardhi goat standing proudly at ranch courtyard',
    captionAr: 'الماعز العارضي السعودي',
    captionEn: 'Saudi Ardhi Goat',
    imageWidth: 1024,
    imageHeight: 768,
    objectPositionClass: 'object-[48%_30%] sm:object-[42%_28%]',
  },
};

function makeSlide(id: string, asset: (typeof SLIDE_ASSETS)[keyof typeof SLIDE_ASSETS]): PageBannerSlide {
  return {
    id,
    ...asset,
  };
}

const THEME_SLIDE_MAP: Record<PageBannerTheme, PageBannerSlide[]> = {
  market: [
    makeSlide('market-1', SLIDE_ASSETS.shepherdSunset),
    makeSlide('market-2', SLIDE_ASSETS.highlandPasture),
    makeSlide('market-3', SLIDE_ASSETS.breedsPasture),
  ],
  breeds: [
    makeSlide('breeds-1', SLIDE_ASSETS.breedsPasture),
    makeSlide('breeds-2', SLIDE_ASSETS.naimiPortrait),
    makeSlide('breeds-3', SLIDE_ASSETS.najdiPortrait),
  ],
  breeders: [
    makeSlide('breeders-1', SLIDE_ASSETS.sellerRanch),
    makeSlide('breeders-2', SLIDE_ASSETS.highlandPasture),
    makeSlide('breeders-3', SLIDE_ASSETS.shepherdSunset),
  ],
  services: [
    makeSlide('services-1', SLIDE_ASSETS.transportFleet),
    makeSlide('services-2', SLIDE_ASSETS.sellerRanch),
    makeSlide('services-3', SLIDE_ASSETS.highlandPasture),
  ],
  feast: [
    makeSlide('feast-1', SLIDE_ASSETS.feastMajlis),
    makeSlide('feast-2', SLIDE_ASSETS.breedsPasture),
    makeSlide('feast-3', SLIDE_ASSETS.heritageArch),
  ],
  finance: [
    makeSlide('finance-1', SLIDE_ASSETS.heritageArch),
    makeSlide('finance-2', SLIDE_ASSETS.sellerRanch),
    makeSlide('finance-3', SLIDE_ASSETS.shepherdSunset),
  ],
  account: [
    makeSlide('account-1', SLIDE_ASSETS.sellerRanch),
    makeSlide('account-2', SLIDE_ASSETS.heritageArch),
    makeSlide('account-3', SLIDE_ASSETS.shepherdSunset),
  ],
  detail: [
    makeSlide('detail-1', SLIDE_ASSETS.breedsPasture),
    makeSlide('detail-2', SLIDE_ASSETS.harriPortrait),
    makeSlide('detail-3', SLIDE_ASSETS.highlandPasture),
  ],
  contact: [
    makeSlide('contact-1', SLIDE_ASSETS.heritageArch),
    makeSlide('contact-2', SLIDE_ASSETS.feastMajlis),
    makeSlide('contact-3', SLIDE_ASSETS.shepherdSunset),
  ],
  'home-studio': [
    makeSlide('studio-1', SLIDE_ASSETS.highlandPasture),
    makeSlide('studio-2', SLIDE_ASSETS.feastMajlis),
    makeSlide('studio-3', SLIDE_ASSETS.transportFleet),
  ],
  occasions: [
    makeSlide('occasions-1', SLIDE_ASSETS.feastMajlis),
    makeSlide('occasions-2', SLIDE_ASSETS.naimiPortrait),
    makeSlide('occasions-3', SLIDE_ASSETS.ardhiPortrait),
  ],
  howto: [
    makeSlide('howto-1', SLIDE_ASSETS.transportFleet),
    makeSlide('howto-2', SLIDE_ASSETS.heritageArch),
    makeSlide('howto-3', SLIDE_ASSETS.sellerRanch),
  ],
  fallback: [
    makeSlide('fallback-1', SLIDE_ASSETS.highlandPasture),
    makeSlide('fallback-2', SLIDE_ASSETS.heritageArch),
    makeSlide('fallback-3', SLIDE_ASSETS.breedsPasture),
  ],
};

export function resolveBannerSlides(
  theme?: PageBannerTheme,
  variant?: 'emerald-royal' | 'night-vault' | 'sand-ivory' | 'oasis-horizon',
  customSlides?: PageBannerSlide[]
): PageBannerSlide[] {
  if (customSlides && customSlides.length > 0) {
    return customSlides;
  }
  if (theme && THEME_SLIDE_MAP[theme]) {
    return THEME_SLIDE_MAP[theme];
  }
  switch (variant) {
    case 'night-vault':
      return THEME_SLIDE_MAP.finance;
    case 'sand-ivory':
      return THEME_SLIDE_MAP.breeds;
    case 'oasis-horizon':
      return THEME_SLIDE_MAP.breeders;
    case 'emerald-royal':
    default:
      return THEME_SLIDE_MAP.market;
  }
}

// Type guard / parity export reference with HeroSlideSpec if needed by callers
export type { HeroSlideSpec };
