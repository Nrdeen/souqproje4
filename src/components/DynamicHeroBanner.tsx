import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Home } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { SafeImage } from './SafeImage';

export type DynamicHeroPageKey =
  | 'breeders'
  | 'services'
  | 'how-it-works'
  | 'breeds'
  | 'pricing'
  | 'commission'
  | 'weights'
  | 'feast'
  | 'transport'
  | 'feed'
  | 'occasions'
  | 'guides'
  | 'help'
  | 'about'
  | 'rules'
  | 'privacy'
  | 'terms'
  | 'contact'
  | 'listings'
  | 'detail'
  | 'seller'
  | 'add'
  | 'dashboard'
  | 'auth'
  | 'fallback';

export type DynamicHeroVariant =
  | 'emerald-royal'
  | 'night-vault'
  | 'sand-ivory'
  | 'oasis-horizon';

export type DynamicHeroStyle = 'auto' | 'showcase' | 'compact';

export interface DynamicHeroBreadcrumb {
  label: string;
  onClick?: () => void;
}

export interface DynamicHeroStat {
  label: string;
  value: string;
  accent?: boolean;
}

interface SecondaryBannerPreset {
  defaultStyle: 'showcase' | 'compact';
  illustrationSrc: string;
  illustrationAltAr: string;
  illustrationAltEn: string;
  eyebrowAr: string;
  eyebrowEn: string;
  titleAr: string;
  titleEn: string;
  titleAccentAr?: string;
  titleAccentEn?: string;
  subHeadlineAr: string;
  subHeadlineEn: string;
  sceneCaptionAr: string;
  sceneCaptionEn: string;
  objectPositionClass: string;
}

const PHOTO_RANCH = '/src/assets/images/hero_seller_ranch_1795031279075.jpg';
const PHOTO_TRANSPORT = '/src/assets/images/hero_livestock_transport_1795288735598.jpg';
const PHOTO_HOWTO = '/src/assets/images/hero_photo_howto_1795297964183.jpg';
const PHOTO_BREEDS = '/src/assets/images/hero_breeds_discovery_1795031278390.jpg';
const PHOTO_FINANCE = '/src/assets/images/hero_photo_finance_1795297964123.jpg';
const PHOTO_ARCH = '/src/assets/images/hero_market_heritage_arch_1795288734346.jpg';
const PHOTO_WEIGHTS = '/src/assets/images/hero_photo_weights_1795297964240.jpg';
const PHOTO_FEAST = '/src/assets/images/hero_feast_hospitality_1795288734921.jpg';
const PHOTO_OCCASIONS = '/src/assets/images/hero_photo_occasions_1795297964259.jpg';
const PHOTO_LISTINGS = '/src/assets/images/hero_saudi_livestock_1794608168927.jpg';
const PHOTO_SUNRISE = '/src/assets/images/hero_photo_ranch_sunrise_1795297964222.jpg';
const PHOTO_PASTURE = '/src/assets/images/hero_green_pasture_sunset_1795288735497.jpg';

export const SECONDARY_BANNER_PRESETS: Record<DynamicHeroPageKey, SecondaryBannerPreset> = {
  breeders: {
    defaultStyle: 'showcase',
    illustrationSrc: PHOTO_RANCH,
    illustrationAltAr: 'مراح أغنام سعودي منظم وسط النخيل والحظائر الحجرية النظيفة في إضاءة الصباح',
    illustrationAltEn: 'Organized Saudi sheep ranch surrounded by date palms and clean stone pens in morning sunlight',
    eyebrowAr: 'مراحات ومربون معتمدون ومفحوصون',
    eyebrowEn: 'Verified Saudi Ranches & Breeders',
    titleAr: 'المربون الموثقون',
    titleEn: 'Verified Livestock Breeders',
    titleAccentAr: 'في المملكة',
    titleAccentEn: 'Across Saudi Arabia',
    subHeadlineAr:
      'نخبة من المربين وأصحاب المراحات المعتمدة في المملكة بعد التحقق من بياناتهم، مع تقييمات المشترين السابقين.',
    subHeadlineEn:
      'Explore vetted Saudi ranches and verified breeders across the Kingdom, complete with buyer reviews and direct access.',
    sceneCaptionAr: 'مراحات السعودية الموثقة',
    sceneCaptionEn: 'Verified Saudi Ranches',
    objectPositionClass: 'object-[34%_54%] sm:object-[28%_52%]',
  },
  services: {
    defaultStyle: 'showcase',
    illustrationSrc: PHOTO_TRANSPORT,
    illustrationAltAr: 'شاحنة نقل مواشي حديثة مجهزة أمام مراح سعودي في ضوء الصباح الذهبي',
    illustrationAltEn: 'Modern equipped livestock transport carrier beside an organized Saudi mountain ranch',
    eyebrowAr: 'منظومة الخدمات والأدوات المساندة',
    eyebrowEn: 'Integrated Livestock Support Services',
    titleAr: 'خدمات سوق الغنم',
    titleEn: 'Marketplace Services',
    titleAccentAr: 'للمشترين والمربين',
    titleAccentEn: 'Across All 13 Regions',
    subHeadlineAr:
      'من حاسبات الأوزان والولائم والنقل والأعلاف إلى طلبات النقل المجهّز والفحص البيطري في جميع مناطق المملكة.',
    subHeadlineEn:
      'Smart calculators plus equipped livestock transport, veterinary inspection, and feed logistics across 13 regions.',
    sceneCaptionAr: 'النقل المجهز والرعاية الميدانية',
    sceneCaptionEn: 'Equipped Transport & Field Care',
    objectPositionClass: 'object-[34%_54%] sm:object-[28%_52%]',
  },
  'how-it-works': {
    defaultStyle: 'showcase',
    illustrationSrc: PHOTO_HOWTO,
    illustrationAltAr: 'مربي أغنام سعودي يستعرض قطيع النعيمي مع المشتري داخل المراح الحجري في ضوء الصباح',
    illustrationAltEn: 'Saudi breeder inspecting healthy Naimi sheep with a buyer at a sunlit stone ranch pen',
    eyebrowAr: 'دليل الاستخدام الواضح والآمن',
    eyebrowEn: 'Clear & Trusted Marketplace Guide',
    titleAr: 'كيف يعمل',
    titleEn: 'How Souq Al-Ghanam',
    titleAccentAr: 'سوق الغنم؟',
    titleAccentEn: 'Works Step by Step',
    subHeadlineAr:
      'رحلة منظمة وواضحة من البحث وحتى الاستلام سواء كنت مشترياً تبحث عن ذبيحة أو مربياً يعرض إنتاجه مباشرة.',
    subHeadlineEn:
      'A transparent 4-step journey from breed comparison and direct negotiation to verified inspection and safe delivery.',
    sceneCaptionAr: 'خطوات الشراء والبيع الآمن',
    sceneCaptionEn: 'Safe Buying & Selling Steps',
    objectPositionClass: 'object-[46%_36%] sm:object-[42%_34%]',
  },
  breeds: {
    defaultStyle: 'showcase',
    illustrationSrc: PHOTO_BREEDS,
    illustrationAltAr: 'أغنام النعيمي والنجدي السعودية الأصيلة أمام جبال طويق في مرعى ذهبي دافئ',
    illustrationAltEn: 'Authentic Saudi Naimi and Najdi sheep standing in a golden desert pasture before Tuwaiq cliffs',
    eyebrowAr: 'موسوعة مرجعية لأشهر السلالات السعودية',
    eyebrowEn: 'Authentic Saudi Breeds Encyclopedia',
    titleAr: 'دليل السلالات',
    titleEn: 'Saudi Breeds Guide',
    titleAccentAr: 'ومؤشر الأسعار الموسمي',
    titleAccentEn: '& Seasonal Price Index',
    subHeadlineAr:
      'تعرّف على خصائص النعيمي والنجدي والحري والعارضي والسواكني، وقارن النطاقات السعرية الاسترشادية على مدار 12 شهراً.',
    subHeadlineEn:
      'Compare Naimi, Najdi, Harri, Ardhi, and Sawakni breed traits alongside 12-month seasonal pricing trends in SAR.',
    sceneCaptionAr: 'سلالات المملكة ومؤشر الأسعار',
    sceneCaptionEn: 'Saudi Breeds & Price Curves',
    objectPositionClass: 'object-[36%_50%] sm:object-[28%_52%]',
  },
  occasions: {
    defaultStyle: 'showcase',
    illustrationSrc: PHOTO_OCCASIONS,
    illustrationAltAr: 'قطيع من الأغنام والرخال الحرية البيضاء داخل مراح حجري مظلل بالنخيل في الطائف',
    illustrationAltEn: 'Flock of pure white Saudi Harri sheep and lambs resting in a palm-shaded stone ranch courtyard',
    eyebrowAr: 'دليل الاختيار السريع للمشتري',
    eyebrowEn: 'Curated Recommendations by Occasion',
    titleAr: 'اختيار الماشية',
    titleEn: 'Choosing Livestock',
    titleAccentAr: 'حسب المناسبة',
    titleAccentEn: 'by Occasion',
    subHeadlineAr:
      'اختر مناسبتك لتظهر لك التوصيات العملية من حيث السلالة والوزن والسن والميزانية مع انتقال مباشر للعروض المناسبة.',
    subHeadlineEn:
      'Tailored guidance on breed, age, weight, and budget for Aqiqa, weddings, family gatherings, and herd breeding.',
    sceneCaptionAr: 'توصيات العقيقة والولائم والتربية',
    sceneCaptionEn: 'Aqiqa, Feasts & Herd Picks',
    objectPositionClass: 'object-[45%_54%]',
  },
  guides: {
    defaultStyle: 'showcase',
    illustrationSrc: PHOTO_PASTURE,
    illustrationAltAr: 'مراعي مرتفعات الطائف الخضراء عند الغروب مع قطيع أغنام تحت الجبال',
    illustrationAltEn: 'Lush Saudi highland pastures at golden sunset with grazing sheep',
    eyebrowAr: 'المعرفة والإرشاد العملي',
    eyebrowEn: 'Practical Livestock Knowledge Hub',
    titleAr: 'مقالات وأدلة',
    titleEn: 'Livestock Guides',
    titleAccentAr: 'المربين والمشترين',
    titleAccentEn: '& Field Checklists',
    subHeadlineAr:
      'أدلة عملية للفحص البيطري، تغذية القطيع، اختيار الأضاحي والولائم، وإدارة المراح باحترافية في بيئة المملكة.',
    subHeadlineEn:
      'Practical guides covering veterinary inspection, herd nutrition, seasonal pricing, and ranch management.',
    sceneCaptionAr: 'معرفة موثوقة للسوق',
    sceneCaptionEn: 'Trusted Field Guides',
    objectPositionClass: 'object-[45%_56%]',
  },
  pricing: {
    defaultStyle: 'compact',
    illustrationSrc: PHOTO_FINANCE,
    illustrationAltAr: 'فناء معماري نجدي حديث مضاء بإضاءة دافئة يطل على واحة النخيل عند الغسق',
    illustrationAltEn: 'Refined Najdi limestone architectural terrace overlooking illuminated date palm groves at twilight',
    eyebrowAr: 'خطط مرنة للأفراد والمربين المحترفين',
    eyebrowEn: 'Flexible Plans for Breeders & Merchants',
    titleAr: 'الباقات',
    titleEn: 'Plans &',
    titleAccentAr: 'والأسعار',
    titleAccentEn: 'Pricing',
    subHeadlineAr:
      'ابدأ بنشر إعلاناتك مجاناً أو فعّل باقات الإعلان المميز والتاجر لتصدر البحث وتضاعف وصولك.',
    subHeadlineEn:
      'Publish standard listings free or unlock featured placement and merchant analytics across Saudi Arabia.',
    sceneCaptionAr: 'باقات التمييز والتوثيق',
    sceneCaptionEn: 'Breeder & Merchant Tiers',
    objectPositionClass: 'object-center',
  },
  commission: {
    defaultStyle: 'compact',
    illustrationSrc: PHOTO_ARCH,
    illustrationAltAr: 'قوس معماري نجدي تراثي يطل على واحة النخيل في المملكة وقت الغروب',
    illustrationAltEn: 'Traditional Najdi mudbrick heritage archway overlooking lush Saudi palm oasis at sunset',
    eyebrowAr: 'نظام السداد الشفاف بعد إتمام البيع',
    eyebrowEn: 'Transparent Post-Sale Commission',
    titleAr: 'عمولة الموقع (1%)',
    titleEn: 'Platform Commission (1%)',
    titleAccentAr: 'وحاسبة السداد',
    titleAccentEn: '& Bank Settlement',
    subHeadlineAr:
      'احسب عمولة المنصة بدقة بعد إتمام البيعة عن طريق الموقع، وراجع بيانات الآيبان أو أرفق إيصال الحوالة.',
    subHeadlineEn:
      'Calculate post-sale 1% commission, review launch exemptions, and submit bank transfer receipts.',
    sceneCaptionAr: 'شفافية السداد والعمولة',
    sceneCaptionEn: 'Commission & Bank Settlement',
    objectPositionClass: 'object-center',
  },
  weights: {
    defaultStyle: 'compact',
    illustrationSrc: PHOTO_WEIGHTS,
    illustrationAltAr: 'فحل نعيمي سعودي أصيل في ضوء الشروق الذهبي',
    illustrationAltEn: 'Purebred Saudi Naimi ram in golden sunrise light',
    eyebrowAr: 'أداة حساب التصافي واللحم الصافي',
    eyebrowEn: 'Livestock Weight & Yield Tool',
    titleAr: 'حاسبة الأوزان',
    titleEn: 'Weights & Carcass',
    titleAccentAr: 'وتقدير التصافي',
    titleAccentEn: 'Yield Calculator',
    subHeadlineAr:
      'قدّر صافي الذبيحة واللحم الصافي والقيمة الاسترشادية للرأس والقطيع قبل الشراء.',
    subHeadlineEn:
      'Estimate dressed carcass weight, clean meat yield, and per-head SAR value across Saudi breeds.',
    sceneCaptionAr: 'مؤشر التصافي والأوزان',
    sceneCaptionEn: 'Carcass Yield Modeling',
    objectPositionClass: 'object-[64%_38%] sm:object-[58%_38%]',
  },
  feast: {
    defaultStyle: 'compact',
    illustrationSrc: PHOTO_FEAST,
    illustrationAltAr: 'مجلس ضيافة سعودي تقليدي بإضاءة الغسق الدافئة',
    illustrationAltEn: 'Traditional Saudi courtyard majlis at twilight',
    eyebrowAr: 'أداة تقدير الذبائح والميزانية',
    eyebrowEn: 'Smart Feast & Hospitality Planner',
    titleAr: 'حاسبة الولائم',
    titleEn: 'Smart Feast',
    titleAccentAr: 'والمناسبات الذكية',
    titleAccentEn: '& Budget Calculator',
    subHeadlineAr:
      'احسب عدد الرؤوس المناسب وكمية اللحم والأرز والتكلفة التقديرية بالريال حسب عدد ضيوفك.',
    subHeadlineEn:
      'Calculate recommended head count, meat, rice, and estimated SAR budget for your guests.',
    sceneCaptionAr: 'تقدير الولائم والضيافة',
    sceneCaptionEn: 'Feast & Majlis Planning',
    objectPositionClass: 'object-center sm:object-[42%_52%]',
  },
  transport: {
    defaultStyle: 'compact',
    illustrationSrc: PHOTO_TRANSPORT,
    illustrationAltAr: 'شاحنة نقل مواشي حديثة مجهزة',
    illustrationAltEn: 'Equipped livestock transport carrier',
    eyebrowAr: 'تقدير الشحن بين مدن ومناطق المملكة',
    eyebrowEn: 'Inter-Region Livestock Logistics',
    titleAr: 'حاسبة تكلفة',
    titleEn: 'Livestock Transport',
    titleAccentAr: 'نقل المواشي',
    titleAccentEn: 'Cost Estimator',
    subHeadlineAr:
      'قدّر تكلفة النقل التقديرية بالريال السعودي حسب المسافة، عدد الرؤوس، نوع الناقلة، وخدمات الرعاية.',
    subHeadlineEn:
      'Estimate regional transport cost in SAR based on route distance, head count, carrier class, and care stops.',
    sceneCaptionAr: 'حاسبة النقل اللوجستي',
    sceneCaptionEn: 'Transport Cost Modeling',
    objectPositionClass: 'object-[34%_54%]',
  },
  feed: {
    defaultStyle: 'compact',
    illustrationSrc: PHOTO_RANCH,
    illustrationAltAr: 'مراح أغنام سعودي منظم',
    illustrationAltEn: 'Organized Saudi livestock ranch',
    eyebrowAr: 'تخطيط تغذية القطيع والتسمين',
    eyebrowEn: 'Herd Nutrition & Budget Planner',
    titleAr: 'مخطط تكلفة',
    titleEn: 'Herd & Feed',
    titleAccentAr: 'الأعلاف والقطيع',
    titleAccentEn: 'Budget Planner',
    subHeadlineAr:
      'احسب الاحتياج اليومي والشهري من الشعير والبرسيم والمكملات مع متوسط التكلفة لكل رأس في قطيعك.',
    subHeadlineEn:
      'Calculate daily and monthly barley, alfalfa hay, and mineral costs per head and for your full flock.',
    sceneCaptionAr: 'تخطيط الأعلاف والتسمين',
    sceneCaptionEn: 'Feed & Herd Economics',
    objectPositionClass: 'object-[34%_54%]',
  },
  help: {
    defaultStyle: 'compact',
    illustrationSrc: PHOTO_HOWTO,
    illustrationAltAr: 'دعم المربين والمشترين في سوق الغنم',
    illustrationAltEn: 'Support for Saudi livestock breeders and buyers',
    eyebrowAr: 'مركز المساعدة السريع',
    eyebrowEn: 'Marketplace Help Center',
    titleAr: 'مركز المساعدة',
    titleEn: 'Help Center',
    titleAccentAr: 'والأسئلة الشائعة',
    titleAccentEn: '& Common Questions',
    subHeadlineAr:
      'إجابات مباشرة حول النشر، توثيق المربين، عروض السوم، المعاينة الآمنة، وسداد العمولة.',
    subHeadlineEn:
      'Clear answers covering listing publishing, breeder verification, offers, safe inspection, and commission.',
    sceneCaptionAr: 'إجابات السوق المعتمدة',
    sceneCaptionEn: 'Help & Answers',
    objectPositionClass: 'object-[46%_36%]',
  },
  about: {
    defaultStyle: 'showcase',
    illustrationSrc: PHOTO_SUNRISE,
    illustrationAltAr: 'مزرعة مواشي سعودية حديثة عند الشروق',
    illustrationAltEn: 'Modern Saudi livestock ranch at sunrise',
    eyebrowAr: 'هوية سعودية وتنظيم رقمي موثوق',
    eyebrowEn: 'Authentic Saudi Livestock Platform',
    titleAr: 'عن سوق الغنم',
    titleEn: 'About SouqAlGhanam',
    titleAccentAr: 'ومعاييرنا في المملكة',
    titleAccentEn: '& Our Standards',
    subHeadlineAr:
      'منصة سعودية متخصصة تربط المربين بالمشترين بشفافية عالية وبيانات منظمة وأسعار واضحة بالريال السعودي.',
    subHeadlineEn:
      'A specialized Saudi digital marketplace built for transparent livestock trading, verified ranches, and fair pricing.',
    sceneCaptionAr: 'رسالة سوق الغنم 2.0',
    sceneCaptionEn: 'Marketplace Mission',
    objectPositionClass: 'object-[44%_50%]',
  },
  rules: {
    defaultStyle: 'compact',
    illustrationSrc: PHOTO_ARCH,
    illustrationAltAr: 'عمارة نجدية تراثية',
    illustrationAltEn: 'Traditional Saudi Najdi architecture',
    eyebrowAr: 'حوكمة السوق ومراجعة المحتوى',
    eyebrowEn: 'Marketplace Governance & Moderation',
    titleAr: 'شروط النشر',
    titleEn: 'Listing Rules',
    titleAccentAr: 'ومعايير المراجعة',
    titleAccentEn: '& Quality Policy',
    subHeadlineAr:
      'الضوابط التي تحكم جودة الإعلانات ومصداقية المواصفات والعمر والوزن والتحصين لضمان ثقة الجميع.',
    subHeadlineEn:
      'Standards governing listing accuracy, photo quality, honest pricing, and moderation review.',
    sceneCaptionAr: 'ضوابط جودة الإعلانات',
    sceneCaptionEn: 'Listing Quality Rules',
    objectPositionClass: 'object-center',
  },
  privacy: {
    defaultStyle: 'compact',
    illustrationSrc: PHOTO_FINANCE,
    illustrationAltAr: 'بوابة حماية البيانات والخصوصية',
    illustrationAltEn: 'Privacy and data protection',
    eyebrowAr: 'حماية البيانات والخصوصية',
    eyebrowEn: 'Data Security & Member Privacy',
    titleAr: 'سياسة الخصوصية',
    titleEn: 'Privacy Policy',
    titleAccentAr: 'وحماية البيانات',
    titleAccentEn: '& Data Protection',
    subHeadlineAr:
      'كيف نحفظ بيانات حسابات المربين والمشترين، وندير كشف أرقام التواصل، ونصون سرية المراسلات.',
    subHeadlineEn:
      'How member accounts, phone reveal controls, and platform conversations are secured and handled.',
    sceneCaptionAr: 'حماية خصوصية الأعضاء',
    sceneCaptionEn: 'Member Data Protection',
    objectPositionClass: 'object-center',
  },
  terms: {
    defaultStyle: 'compact',
    illustrationSrc: PHOTO_ARCH,
    illustrationAltAr: 'الشروط والأحكام',
    illustrationAltEn: 'Terms of use',
    eyebrowAr: 'الإطار النظامي واتفاقية الاستخدام',
    eyebrowEn: 'Terms of Use & Service Agreement',
    titleAr: 'الشروط والأحكام',
    titleEn: 'Terms of Use',
    titleAccentAr: 'واتفاقية الخدمة',
    titleAccentEn: '& Service Agreement',
    subHeadlineAr:
      'الأحكام التنظيمية لاستخدام سوق الغنم 2.0، وحقوق المشتري والبائع، وآلية الوساطة والعمولة.',
    subHeadlineEn:
      'Platform terms governing direct breeder-buyer communication, moderation, and the 1% post-sale fee.',
    sceneCaptionAr: 'شروط الاستخدام والخدمة',
    sceneCaptionEn: 'Terms & Service Agreement',
    objectPositionClass: 'object-center',
  },
  contact: {
    defaultStyle: 'compact',
    illustrationSrc: PHOTO_ARCH,
    illustrationAltAr: 'فناء وأقواس نجدية تراثية مضاءة بالفوانيس تطل على واحة النخيل',
    illustrationAltEn: 'Traditional Saudi architectural archway illuminated by warm lanterns overlooking date palms',
    eyebrowAr: 'مركز خدمة العملاء والدعم المباشر',
    eyebrowEn: 'Direct Marketplace Support Desk',
    titleAr: 'تواصل معنا',
    titleEn: 'Contact Support',
    titleAccentAr: 'وفريق المساندة',
    titleAccentEn: '& Marketplace Team',
    subHeadlineAr:
      'أرسل استفسارك أو بلاغك أو مقترحك مباشرة إلى فريق سوق الغنم مع رقم متابعة مرجعي فوري.',
    subHeadlineEn:
      'Send inquiries, account questions, or partnership requests directly to our support team with a reference ID.',
    sceneCaptionAr: 'الدعم المباشر والمتابعة',
    sceneCaptionEn: 'Customer Care & Routing',
    objectPositionClass: 'object-center',
  },
  listings: {
    defaultStyle: 'compact',
    illustrationSrc: PHOTO_LISTINGS,
    illustrationAltAr: 'راعي أغنام سعودي مع قطيع من الأغنام وسط الجبال والنخيل عند الغروب',
    illustrationAltEn: 'Saudi shepherd with sheep herd amid mountains and palms at golden sunset',
    eyebrowAr: 'سوق المواشي الموثوق في المملكة',
    eyebrowEn: 'Verified Saudi Livestock Directory',
    titleAr: 'دليل إعلانات المواشي',
    titleEn: 'Livestock Listings',
    titleAccentAr: 'المتاح الآن',
    titleAccentEn: 'Directory',
    subHeadlineAr:
      'تصفّح عروض المربين مع تصفية فورية حسب السلالة والمنطقة والسعر وحالة التحصين والتوفر.',
    subHeadlineEn:
      'Filter verified breeder listings across Saudi regions by breed, age, weight, vaccination, and SAR price.',
    sceneCaptionAr: 'تصفح عروض السوق النشطة',
    sceneCaptionEn: 'Active Saudi Livestock Market',
    objectPositionClass: 'object-[28%_48%] sm:object-[36%_50%]',
  },
  detail: {
    defaultStyle: 'compact',
    illustrationSrc: PHOTO_WEIGHTS,
    illustrationAltAr: 'رأس نعيمي سعودي أصيل في ضوء الشروق الذهبي',
    illustrationAltEn: 'Close-up portrait of a prime Saudi Naimi ram in golden morning sunlight',
    eyebrowAr: 'عرض مواشي مباشر في السوق',
    eyebrowEn: 'Verified Livestock Listing',
    titleAr: 'تفاصيل العرض والمواصفات',
    titleEn: 'Listing Specifications',
    subHeadlineAr:
      'راجع العمر والوزن والكمية والتحصين، وتواصل مباشرة مع المربي أو قدّم عرض سعرك.',
    subHeadlineEn:
      'Inspect age, weight, head count, and vaccination details, then message the breeder or submit an offer.',
    sceneCaptionAr: 'بطاقة مواصفات العرض',
    sceneCaptionEn: 'Listing Detail & Offers',
    objectPositionClass: 'object-[64%_38%] sm:object-[58%_38%]',
  },
  seller: {
    defaultStyle: 'compact',
    illustrationSrc: PHOTO_HOWTO,
    illustrationAltAr: 'مربي سعودي في المراح الحجري يستعرض قطيع الأغنام الأصيلة',
    illustrationAltEn: 'Saudi livestock breeder beside healthy sheep inside a traditional stone ranch',
    eyebrowAr: 'ملف المربي والمراح',
    eyebrowEn: 'Breeder & Ranch Profile',
    titleAr: 'ملف المربي المعتمد',
    titleEn: 'Verified Ranch Profile',
    subHeadlineAr:
      'استعرض تخصص المراح وخبرة المربي وسجل المبيعات وتقييمات المشترين السابقين.',
    subHeadlineEn:
      'Review ranch experience, regional coverage, verified buyer ratings, and active listings.',
    sceneCaptionAr: 'سجل المراح والتقييمات',
    sceneCaptionEn: 'Ranch Record & Reviews',
    objectPositionClass: 'object-[46%_36%] sm:object-[42%_34%]',
  },
  add: {
    defaultStyle: 'compact',
    illustrationSrc: PHOTO_SUNRISE,
    illustrationAltAr: 'مزرعة مواشي سعودية حديثة ومنظمة في القصيم',
    illustrationAltEn: 'Organized modern Saudi livestock farm in Al-Qassim',
    eyebrowAr: 'نموذج النشر الاحترافي',
    eyebrowEn: 'Professional Listing Publisher',
    titleAr: 'إضافة',
    titleEn: 'Publish a New',
    titleAccentAr: 'إعلان جديد',
    titleAccentEn: 'Livestock Listing',
    subHeadlineAr:
      'أدخل البيانات المنظمة بدقة وأرفق صوراً واضحة؛ يمر الإعلان بمراجعة المشرفين قبل الظهور.',
    subHeadlineEn:
      'Provide structured breed, weight, age, and vaccination specs with clear photos for moderation review.',
    sceneCaptionAr: 'نشر وتوثيق الإعلان',
    sceneCaptionEn: 'Structured Listing Setup',
    objectPositionClass: 'object-[44%_50%]',
  },
  dashboard: {
    defaultStyle: 'compact',
    illustrationSrc: PHOTO_SUNRISE,
    illustrationAltAr: 'إطلالة بانورامية على مراح مواشي منظم',
    illustrationAltEn: 'Panoramic view over an organized Saudi livestock ranch',
    eyebrowAr: 'مركز إدارة الحساب والسوم',
    eyebrowEn: 'Account & Offer Command Center',
    titleAr: 'لوحة حسابي',
    titleEn: 'My Account',
    titleAccentAr: 'وإدارة العروض',
    titleAccentEn: 'Dashboard',
    subHeadlineAr:
      'تابع إعلاناتك، محادثات المشترين، عروض السعر، المفضلة، وطلبات التوثيق في مكان واحد.',
    subHeadlineEn:
      'Manage your listings, buyer conversations, price offers, favorites, and verification status.',
    sceneCaptionAr: 'إدارة الإعلانات والمحادثات',
    sceneCaptionEn: 'Listings, Chats & Analytics',
    objectPositionClass: 'object-[44%_50%]',
  },
  auth: {
    defaultStyle: 'compact',
    illustrationSrc: PHOTO_FINANCE,
    illustrationAltAr: 'فناء معماري نجدي أنيق',
    illustrationAltEn: 'Refined Arabian architectural courtyard',
    eyebrowAr: 'عضوية سوق الغنم 2.0',
    eyebrowEn: 'Souq Al-Ghanam Membership',
    titleAr: 'بوابة الدخول',
    titleEn: 'Secure Member',
    titleAccentAr: 'والتسجيل الآمن',
    titleAccentEn: 'Sign In & Registration',
    subHeadlineAr:
      'ادخل برقم الجوال السعودي وكلمة المرور أو عبر Google لإدارة إعلاناتك وعروض السوم والمحادثات.',
    subHeadlineEn:
      'Sign in with your Saudi mobile number or Google account to manage listings, offers, and chats.',
    sceneCaptionAr: 'الدخول الآمن للمنصة',
    sceneCaptionEn: 'Secure Account Access',
    objectPositionClass: 'object-center',
  },
  fallback: {
    defaultStyle: 'compact',
    illustrationSrc: PHOTO_PASTURE,
    illustrationAltAr: 'مراعي مرتفعات الطائف الخضراء عند الغروب',
    illustrationAltEn: 'Lush Saudi highland pastures in Taif at golden sunset',
    eyebrowAr: 'توجيه سريع في سوق الغنم',
    eyebrowEn: 'Quick Marketplace Navigation',
    titleAr: 'استكشف العروض النشطة',
    titleEn: 'Explore Active Listings',
    titleAccentAr: 'في السوق الآن',
    titleAccentEn: 'Across Saudi Arabia',
    subHeadlineAr:
      'تعذر العثور على العنصر المطلوب؛ اختر إحدى السلالات أو المناطق للانتقال الفوري إلى الإعلانات المتاحة.',
    subHeadlineEn:
      'The requested item could not be found. Browse active breeds or regions below to continue exploring.',
    sceneCaptionAr: 'الانتقال السريع للعروض',
    sceneCaptionEn: 'Quick Discovery Shortcuts',
    objectPositionClass: 'object-[45%_56%]',
  },
};

export interface DynamicHeroBannerProps {
  pageKey: DynamicHeroPageKey;
  eyebrow?: string;
  title?: string;
  titleAccent?: string;
  /** Primary sub-headline text rendered beneath the banner title */
  subHeadline?: string;
  /** Alias for subHeadline so callers can migrate seamlessly */
  description?: string;
  variant?: DynamicHeroVariant;
  heroStyle?: DynamicHeroStyle;
  breadcrumbs?: DynamicHeroBreadcrumb[];
  contextLabel?: string;
  stats?: DynamicHeroStat[];
  actions?: ReactNode;
  visual?: ReactNode;
  interactiveDock?: ReactNode;
  headingId?: string;
  headingAs?: 'h1' | 'h2';
  compact?: boolean;
  className?: string;
  animateScene?: boolean;
}

export function DynamicHeroBanner({
  pageKey,
  eyebrow,
  title,
  titleAccent,
  subHeadline,
  description,
  variant: _variant = 'emerald-royal',
  heroStyle = 'auto',
  breadcrumbs,
  contextLabel,
  stats,
  actions,
  visual: _visual,
  interactiveDock,
  headingId,
  headingAs = 'h1',
  compact = false,
  className = '',
  animateScene: _animateScene = true,
}: DynamicHeroBannerProps) {
  const { isEn, dir } = useI18n();
  const CrumbSeparator = isEn ? ChevronRight : ChevronLeft;
  const HeadingTag = headingAs;

  const preset = SECONDARY_BANNER_PRESETS[pageKey] || SECONDARY_BANNER_PRESETS.fallback;
  const effectiveStyle: 'showcase' | 'compact' =
    compact ? 'compact' : heroStyle === 'auto' ? preset.defaultStyle : heroStyle;

  const resolvedEyebrow = eyebrow ?? (isEn ? preset.eyebrowEn : preset.eyebrowAr);
  const resolvedTitle = title ?? (isEn ? preset.titleEn : preset.titleAr);
  const resolvedTitleAccent =
    titleAccent !== undefined
      ? titleAccent
      : title !== undefined
      ? undefined
      : isEn
      ? preset.titleAccentEn
      : preset.titleAccentAr;
  const resolvedSubHeadline =
    subHeadline ?? description ?? (isEn ? preset.subHeadlineEn : preset.subHeadlineAr);
  const resolvedAlt = isEn ? preset.illustrationAltEn : preset.illustrationAltAr;

  const hasStats = Boolean(stats && stats.length > 0);
  const hasInteractiveDock = Boolean(interactiveDock);
  const hasBottomDock = hasStats || hasInteractiveDock;
  const isCompactPadding = Boolean(compact || effectiveStyle === 'compact');

  // Consistent Uretia-matched vertical rhythm: generous on showcase pages, sleek on calculators & policy pages
  const stageVerticalPadding = hasBottomDock
    ? isCompactPadding
      ? 'pt-6 pb-12 sm:pt-7 sm:pb-14 lg:pt-8 lg:pb-14'
      : 'pt-8 pb-14 sm:pt-10 sm:pb-16 lg:pt-12 lg:pb-18'
    : isCompactPadding
    ? 'py-6 sm:py-8 lg:py-9'
    : 'py-9 sm:py-12 lg:py-14';

  const statsGridCols =
    stats && stats.length >= 4
      ? 'grid-cols-2 sm:grid-cols-4'
      : stats && stats.length === 3
      ? 'grid-cols-3'
      : 'grid-cols-2';

  return (
    <div dir={dir} className={`w-full ${className}`}>
      <section
        aria-label={resolvedTitle}
        className="relative w-full overflow-hidden bg-[#003E20] text-white"
      >
        <div className={`relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${stageVerticalPadding}`}>
          {/* Unified Uretia-Matched Two-Column Split (Text Aligned Flush With Clean Rounded-2xl Photo) */}
          <div
            className={`grid grid-cols-1 lg:grid-cols-12 items-center ${
              isCompactPadding
                ? 'gap-5 sm:gap-6 lg:gap-10'
                : 'gap-6 sm:gap-8 lg:gap-12'
            }`}
          >
            {/* Start Column: Inline Breadcrumb Trail, Editorial Heading, Description & CTAs */}
            <div className="lg:col-span-6 flex flex-col justify-center min-w-0">
              {(breadcrumbs?.length || contextLabel) && (
                <div
                  className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs ${
                    isCompactPadding ? 'mb-2' : 'mb-2.5'
                  }`}
                >
                  {breadcrumbs && breadcrumbs.length > 0 && (
                    <nav aria-label={isEn ? 'Breadcrumb' : 'مسار الصفحة'}>
                      <ol className="flex flex-wrap items-center gap-1.5 text-white/75">
                        {breadcrumbs.map((crumb, idx) => {
                          const isLast = idx === breadcrumbs.length - 1;
                          return (
                            <li
                              key={`${crumb.label}-${idx}`}
                              className="inline-flex items-center gap-1.5"
                            >
                              {idx > 0 && (
                                <CrumbSeparator
                                  size={12}
                                  className="text-white/45 shrink-0"
                                  aria-hidden="true"
                                />
                              )}
                              {crumb.onClick && !isLast ? (
                                <button
                                  type="button"
                                  onClick={crumb.onClick}
                                  className="inline-flex items-center gap-1 font-medium text-white/80 hover:text-[#E8BC63] transition-colors cursor-pointer"
                                >
                                  {idx === 0 && <Home size={12} aria-hidden="true" />}
                                  <span>{crumb.label}</span>
                                </button>
                              ) : (
                                <span
                                  aria-current={isLast ? 'page' : undefined}
                                  className={`inline-flex items-center gap-1 ${
                                    isLast ? 'font-semibold text-white/95' : 'font-medium text-white/75'
                                  }`}
                                >
                                  {idx === 0 && <Home size={12} aria-hidden="true" />}
                                  <span>{crumb.label}</span>
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    </nav>
                  )}

                  {breadcrumbs && breadcrumbs.length > 0 && contextLabel && (
                    <span className="text-white/40 inline" aria-hidden="true">
                      ·
                    </span>
                  )}

                  {contextLabel && (
                    <span className="text-[11px] font-semibold text-[#E8BC63] tabular-nums">
                      {contextLabel}
                    </span>
                  )}
                </div>
              )}

              {!breadcrumbs?.length && resolvedEyebrow && (
                <div className="mb-2 inline-flex items-center gap-2 text-[11px] font-bold tracking-wider uppercase text-[#E8BC63]">
                  <span className="w-5 h-[1.5px] bg-[#C79A43] shrink-0" aria-hidden="true" />
                  <span>{resolvedEyebrow}</span>
                </div>
              )}

              <HeadingTag
                id={headingId}
                className={
                  isCompactPadding
                    ? 'font-display text-[1.7rem] sm:text-[2.1rem] lg:text-[2.35rem] font-extrabold text-white leading-[1.16] tracking-tight text-start'
                    : 'font-display text-[1.9rem] sm:text-[2.35rem] lg:text-[2.75rem] xl:text-[2.95rem] font-extrabold text-white leading-[1.15] tracking-tight text-start'
                }
              >
                <span>{resolvedTitle}</span>
                {resolvedTitleAccent && (
                  <>
                    {' '}
                    <span>{resolvedTitleAccent}</span>
                  </>
                )}
              </HeadingTag>

              <p
                className={
                  isCompactPadding
                    ? 'mt-2.5 text-[14px] sm:text-[15px] text-white/80 leading-[1.6] max-w-[500px] font-normal'
                    : 'mt-3 text-[15px] sm:text-base lg:text-[17px] text-white/80 leading-[1.65] max-w-[520px] font-normal'
                }
              >
                {resolvedSubHeadline}
              </p>

              {actions && (
                <div
                  className={
                    isCompactPadding
                      ? 'mt-4 sm:mt-5 flex flex-wrap items-center gap-2.5'
                      : 'mt-5 sm:mt-6 flex flex-wrap items-center gap-3'
                  }
                >
                  {actions}
                </div>
              )}
            </div>

            {/* End Column: Clean Editorial Rounded-2xl Saudi Livestock Frame (Uretia Proportions) */}
            <div className="lg:col-span-6 min-w-0 flex lg:justify-end">
              <div
                className={
                  isCompactPadding
                    ? 'relative w-full lg:w-[440px] lg:ms-auto h-[170px] sm:h-[195px] lg:h-[215px] rounded-2xl overflow-hidden bg-[#002D17] shadow-2xl'
                    : 'relative w-full lg:w-[500px] lg:ms-auto h-[200px] sm:h-[235px] lg:h-[260px] rounded-2xl overflow-hidden bg-[#002D17] shadow-2xl'
                }
              >
                <SafeImage
                  src={preset.illustrationSrc}
                  alt={resolvedAlt}
                  width={1376}
                  height={768}
                  loading="eager"
                  decoding="sync"
                  fetchPriority="high"
                  className={`w-full h-full object-cover ${preset.objectPositionClass}`}
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Centered Uretia-Matched -mt-8 Overlapping Summary / Action Dock */}
      {hasBottomDock && (
        <div className="relative z-20 -mt-7 sm:-mt-8 pb-4 sm:pb-6">
          <div className="max-w-[1100px] mx-auto px-4">
            <div className="bg-[#003E20] rounded-2xl px-4 py-3.5 sm:px-6 sm:py-4 border border-white/15 shadow-[0_14px_34px_-10px_rgba(0,0,0,0.42)] text-white space-y-2.5">
              {hasStats && stats && (
                <dl className={`grid ${statsGridCols} gap-2 sm:gap-4 items-center`}>
                  {stats.map((stat, idx) => (
                    <div
                      key={`${stat.label}-${idx}`}
                      className={`text-center ${
                        idx > 0
                          ? stats.length >= 4
                            ? 'sm:border-s sm:border-white/15 sm:ps-4'
                            : 'border-s border-white/15 ps-2 sm:ps-4'
                          : ''
                      }`}
                    >
                      <dd
                        className={`font-display text-lg sm:text-xl font-extrabold tabular-nums leading-tight ${
                          stat.accent ? 'text-[#E8BC63]' : 'text-white'
                        }`}
                      >
                        {stat.value}
                      </dd>
                      <dt className="mt-0.5 text-[11px] font-medium text-white/75 tracking-wide">
                        {stat.label}
                      </dt>
                    </div>
                  ))}
                </dl>
              )}

              {hasStats && hasInteractiveDock && (
                <div className="border-t border-white/12" aria-hidden="true" />
              )}

              {hasInteractiveDock && <div>{interactiveDock}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
