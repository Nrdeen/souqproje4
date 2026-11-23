import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Language = 'ar' | 'en';

export interface LanguageOption {
  code: Language;
  label: string;
  shortLabel: string;
  dir: 'rtl' | 'ltr';
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'ar', label: 'العربية', shortLabel: 'العربية', dir: 'rtl' },
  { code: 'en', label: 'English', shortLabel: 'EN', dir: 'ltr' },
];

export const INQUIRY_CATEGORY_KEYS = [
  'general',
  'account',
  'listing',
  'technical',
  'feedback',
] as const;

export type InquiryCategoryKey = (typeof INQUIRY_CATEGORY_KEYS)[number];

interface TranslationBundle {
  brandName: string;
  brandSubtitle: string;
  pageTitle: string;
  navAriaLabel: string;
  navHome: string;
  navListings: string;
  navBreeds: string;
  navBreeders: string;
  navPricing: string;
  navServices: string;
  navContact: string;
  navTools: string;
  navHelp: string;
  navServicesTools: string;
  toolsColTitle: string;
  helpColTitle: string;
  toolCommission: string;
  toolCommissionDesc: string;
  toolWeights: string;
  toolWeightsDesc: string;
  toolFeast: string;
  toolFeastDesc: string;
  toolTransport: string;
  toolTransportDesc: string;
  toolFeed: string;
  toolFeedDesc: string;
  toolOccasions: string;
  toolOccasionsDesc: string;
  toolServices: string;
  toolServicesDesc: string;
  helpFaq: string;
  helpFaqDesc: string;
  helpHow: string;
  helpHowDesc: string;
  helpGuides: string;
  helpGuidesDesc: string;
  helpRules: string;
  helpRulesDesc: string;
  helpAbout: string;
  helpAboutDesc: string;
  helpContact: string;
  helpContactDesc: string;
  signIn: string;
  myAccount: string;
  menuDashboard: string;
  menuProfile: string;
  menuMyListings: string;
  menuFavorites: string;
  menuLogout: string;
  addListing: string;
  addListingShort: string;
  notificationsTitle: string;
  notificationsEmpty: string;
  markAllRead: string;
  newBadge: string;
  themeLight: string;
  themeDark: string;
  langMenuLabel: string;
  mobileMenuOpen: string;
  mobileMenuClose: string;
  roleAdmin: string;
  roleSeller: string;
  roleBuyer: string;
  bottomNavHome: string;
  bottomNavListings: string;
  bottomNavAdd: string;
  bottomNavMessages: string;
  bottomNavAccount: string;
  bottomNavLogin: string;
  footerDescription: string;
  footerSectionsTitle: string;
  footerHelpTitle: string;
  footerBreedsTitle: string;
  footerAccountTitleVisitor: string;
  footerAccountTitleUser: string;
  footerNewsletterTitle: string;
  footerNewsletterSubtitle: string;
  footerNewsletterPlaceholder: string;
  footerNewsletterCta: string;
  footerNewsletterError: string;
  footerNewsletterSuccess: string;
  footerCopyright: string;
  footerTrustNote: string;
  footerLinkAllListings: string;
  footerLinkServices: string;
  footerLinkPricing: string;
  footerLinkCommission: string;
  footerLinkWeights: string;
  footerLinkFeast: string;
  footerLinkTransport: string;
  footerLinkFeed: string;
  footerLinkOccasions: string;
  footerLinkAdd: string;
  footerLinkBreedAdsPrefix: string;
  contactBadge: string;
  contactTitle: string;
  contactIntro: string;
  contactSupportCardTitle: string;
  contactSupportCardBody: string;
  contactPointsTitle: string;
  contactPoint1: string;
  contactPoint2: string;
  contactPoint3: string;
  contactQuickLinksTitle: string;
  contactFormTitle: string;
  contactFormSubtitle: string;
  contactNameLabel: string;
  contactNamePlaceholder: string;
  contactEmailLabel: string;
  contactEmailPlaceholder: string;
  contactCategoryLabel: string;
  contactRegionLabel: string;
  contactAllRegions: string;
  contactMessageLabel: string;
  contactMessagePlaceholder: string;
  contactSubmit: string;
  contactSubmitting: string;
  contactSuccessTitle: string;
  contactSuccessBody: string;
  contactRefLabel: string;
  contactSendAnother: string;
  contactErrName: string;
  contactErrEmail: string;
  contactErrMessage: string;
  contactErrGeneric: string;
  contactCategories: Record<InquiryCategoryKey, string>;
  weightsTitle: string;
  weightsSubtitle: string;
  weightsSpeciesLabel: string;
  weightsLiveWeightLabel: string;
  weightsCountLabel: string;
  weightsPricePerKgLabel: string;
  weightsResultYieldTitle: string;
  weightsResultCarcassLabel: string;
  weightsResultCleanMeatLabel: string;
  weightsResultTotalLiveLabel: string;
  weightsResultEstValueLabel: string;
  weightsToFeastBtn: string;
  weightsToListingsBtn: string;
  profileTabTitle: string;
  profileNameLabel: string;
  profilePhoneLabel: string;
  profileEmailLabel: string;
  profileRoleLabel: string;
  profileVerificationLabel: string;
  profileGoogleLabel: string;
  profileConnected: string;
  profileNotConnected: string;
  profileNotSet: string;
}

const AR_BUNDLE: TranslationBundle = {
  brandName: 'سوق الغنم 2.0',
  brandSubtitle: 'منصة سعودية لبيع وشراء المواشي',
  pageTitle: 'سوق الغنم 2.0 — منصة سعودية لبيع وشراء المواشي',
  navAriaLabel: 'التنقل الرئيسي',
  navHome: 'الرئيسية',
  navListings: 'الإعلانات',
  navBreeds: 'السلالات',
  navBreeders: 'المربون',
  navPricing: 'الباقات والأسعار',
  navServices: 'الخدمات',
  navContact: 'تواصل معنا',
  navTools: 'الأدوات',
  navHelp: 'المساعدة',
  navServicesTools: 'الخدمات والأدوات',
  toolsColTitle: 'الحاسبات والأدوات الذكية',
  helpColTitle: 'الخدمات والدعم والمعرفة',
  toolCommission: 'حاسبة العمولة والسداد',
  toolCommissionDesc: 'حساب عمولة 1% ورفع إيصال الحوالة',
  toolWeights: 'حاسبة الأوزان والتصافي',
  toolWeightsDesc: 'تقدير وزن الذبيحة وصافي اللحم',
  toolFeast: 'حاسبة الولائم الذكية',
  toolFeastDesc: 'تقدير عدد الذبائح والأرز للضيوف',
  toolTransport: 'حاسبة تكلفة النقل',
  toolTransportDesc: 'تقدير نقل المواشي بين المناطق',
  toolFeed: 'مخطط تكلفة الأعلاف',
  toolFeedDesc: 'تقدير الشعير والبرسيم للقطيع',
  toolOccasions: 'اختيار حسب المناسبة',
  toolOccasionsDesc: 'ترشيحات العقيقة والولائم والتربية',
  toolServices: 'طلب خدمات مساندة',
  toolServicesDesc: 'نقل مجهز، بيطرة، أعلاف وتجهيز',
  helpFaq: 'الأسئلة الشائعة ومركز المساعدة',
  helpFaqDesc: 'إجابات سريعة للمربين والمشترين',
  helpHow: 'كيف يعمل السوق؟',
  helpHowDesc: 'خطوات الشراء والبيع الآمن',
  helpGuides: 'مقالات وأدلة المربين',
  helpGuidesDesc: 'إرشادات الفحص والتربية والأسواق',
  helpRules: 'شروط النشر والمراجعة',
  helpRulesDesc: 'ضوابط جودة الإعلانات والتوثيق',
  helpAbout: 'عن سوق الغنم',
  helpAboutDesc: 'رسالتنا ومعايير الثقة في المملكة',
  helpContact: 'تواصل معنا',
  helpContactDesc: 'فريق الدعم الفني والاستفسارات',
  signIn: 'تسجيل الدخول',
  myAccount: 'حسابي',
  menuDashboard: 'لوحة التحكم',
  menuProfile: 'الملف الشخصي',
  menuMyListings: 'إعلاناتي',
  menuFavorites: 'المفضلة',
  menuLogout: 'تسجيل الخروج',
  addListing: 'أضف إعلانك',
  addListingShort: 'أضف إعلان',
  notificationsTitle: 'الإشعارات',
  notificationsEmpty: 'لا توجد إشعارات حالياً. ستصلك التنبيهات فور تلقي رسالة أو سؤال أو رد أو تحديث على عرض سعر.',
  markAllRead: 'تحديد الكل كمقروء',
  newBadge: 'جديد',
  themeLight: 'الوضع الفاتح',
  themeDark: 'الوضع المظلم',
  langMenuLabel: 'اختيار اللغة',
  mobileMenuOpen: 'فتح القائمة',
  mobileMenuClose: 'إغلاق القائمة',
  roleAdmin: 'مشرف المنصة',
  roleSeller: 'مربي / بائع',
  roleBuyer: 'مشتري',
  bottomNavHome: 'الرئيسية',
  bottomNavListings: 'الإعلانات',
  bottomNavAdd: 'أضف إعلان',
  bottomNavMessages: 'الرسائل',
  bottomNavAccount: 'حسابي',
  bottomNavLogin: 'دخول',
  footerDescription:
    'منصة سعودية متخصصة لإعلانات المواشي، تجمع المربين والبائعين والمشترين في بيئة منظمة بمواصفات واضحة للعمر والوزن والتحصين والأسعار الاسترشادية بالريال السعودي.',
  footerSectionsTitle: 'أقسام المنصة',
  footerHelpTitle: 'المساعدة والدعم',
  footerBreedsTitle: 'السلالات الشائعة',
  footerAccountTitleVisitor: 'حسابك في السوق',
  footerAccountTitleUser: 'الحساب والخدمات',
  footerNewsletterTitle: 'النشرة البريدية وتنبيهات السوق',
  footerNewsletterSubtitle: 'اشترك ليصلك تحديث الأسعار الاسترشادية وأبرز عروض المربين المعتمدين',
  footerNewsletterPlaceholder: 'أدخل بريدك الإلكتروني...',
  footerNewsletterCta: 'اشترك الآن',
  footerNewsletterError: 'يرجى إدخال بريد إلكتروني صحيح.',
  footerNewsletterSuccess: 'تم الاشتراك بنجاح',
  footerCopyright: '© 2026 سوق الغنم 2.0 — المملكة العربية السعودية. جميع الأسعار بالريال السعودي.',
  footerTrustNote: 'تواصل مباشر بين المربين والمشترين · إعلانات خاضعة لمراجعة الإدارة',
  footerLinkAllListings: 'جميع الإعلانات',
  footerLinkServices: 'الخدمات المساندة',
  footerLinkPricing: 'الباقات والأسعار',
  footerLinkCommission: 'حاسبة السداد والعمولة',
  footerLinkWeights: 'حاسبة الأوزان',
  footerLinkFeast: 'حاسبة الولائم',
  footerLinkTransport: 'حاسبة تكلفة النقل',
  footerLinkFeed: 'مخطط الأعلاف والقطيع',
  footerLinkOccasions: 'حسب المناسبة',
  footerLinkAdd: 'أضف إعلانك',
  footerLinkBreedAdsPrefix: 'إعلانات',
  contactBadge: 'خدمة المربين والمشترين',
  contactTitle: 'تواصل معنا',
  contactIntro:
    'نرحب باستفساراتك وملاحظاتك حول الإعلانات أو الحساب أو خدمات المنصة. أرسل رسالتك عبر النموذج التالي ليراجعها فريق الإدارة مباشرة برقم متابعة مرجعي.',
  contactSupportCardTitle: 'كيف تُعالج رسائل التواصل؟',
  contactSupportCardBody:
    'يصل استفسارك مباشرة إلى لوحة متابعة الإدارة داخل المنصة مع رقم مرجعي فوري، ليتم الرد على بريدك الإلكتروني وتحديث حالة الطلب.',
  contactPointsTitle: 'ما الذي يمكنك مراسلتنا بشأنه؟',
  contactPoint1: 'استفسارات العضوية وتوثيق حسابات المربين والمشترين',
  contactPoint2: 'الإبلاغ عن إعلان مخالف أو طلب مراجعة تقنية',
  contactPoint3: 'ملاحظات تطوير المنصة وتحسين تجربة السوق',
  contactQuickLinksTitle: 'روابط مساعدة سريعة',
  contactFormTitle: 'أرسل رسالتك للإدارة',
  contactFormSubtitle: 'املأ الحقول التالية بدقة لنتمكن من مساعدتك بأسرع وقت.',
  contactNameLabel: 'الاسم الكامل *',
  contactNamePlaceholder: 'مثال: فهد القحطاني',
  contactEmailLabel: 'البريد الإلكتروني *',
  contactEmailPlaceholder: 'name@example.com',
  contactCategoryLabel: 'فئة الاستفسار *',
  contactRegionLabel: 'المنطقة (اختياري)',
  contactAllRegions: 'كل مناطق المملكة',
  contactMessageLabel: 'الرسالة *',
  contactMessagePlaceholder: 'اكتب تفاصيل استفسارك أو المشكلة التي تواجهها بوضوح...',
  contactSubmit: 'إرسال الرسالة',
  contactSubmitting: 'جاري الإرسال...',
  contactSuccessTitle: 'تم استلام رسالتك بنجاح',
  contactSuccessBody: 'تم تسجيل رسالتك في نظام متابعة المنصة وسيتم الرد عليك عبر البريد الإلكتروني المسجل.',
  contactRefLabel: 'رقم المتابعة المرجعي',
  contactSendAnother: 'إرسال رسالة أخرى',
  contactErrName: 'يرجى كتابة الاسم الكامل (حرفين على الأقل).',
  contactErrEmail: 'يرجى إدخال بريد إلكتروني صحيح.',
  contactErrMessage: 'يرجى كتابة تفاصيل رسالتك (8 أحرف على الأقل).',
  contactErrGeneric: 'تعذر إرسال الرسالة، يرجى المحاولة مرة أخرى.',
  contactCategories: {
    general: 'استفسار عام',
    account: 'مشكلة في الحساب',
    listing: 'مشكلة في إعلان',
    technical: 'مشكلة تقنية',
    feedback: 'اقتراح أو ملاحظة',
  },
  weightsTitle: 'حاسبة الأوزان وتقدير التصافي',
  weightsSubtitle:
    'احسب الوزن القائم وصافي الذبيحة واللحم الصافي التقريبي حسب السلالة وعدد الرؤوس، مع تقدير القيمة الاسترشادية بالريال السعودي.',
  weightsSpeciesLabel: 'نوع الماشية والسلالة',
  weightsLiveWeightLabel: 'الوزن الحي للرأس الواحد (كجم)',
  weightsCountLabel: 'عدد الرؤوس',
  weightsPricePerKgLabel: 'السعر التقديري للكيلو القائم (ر.س)',
  weightsResultYieldTitle: 'النتائج التقديرية للوزن والتصافي',
  weightsResultCarcassLabel: 'الوزن التقديري للذبيحة (كجم)',
  weightsResultCleanMeatLabel: 'صافي اللحم الصالح للأكل (كجم)',
  weightsResultTotalLiveLabel: 'إجمالي الوزن الحي (كجم)',
  weightsResultEstValueLabel: 'القيمة السوقية التقديرية',
  weightsToFeastBtn: 'احسب في حاسبة الولائم',
  weightsToListingsBtn: 'تصفح الإعلانات المتاحة',
  profileTabTitle: 'الملف الشخصي وبيانات الحساب',
  profileNameLabel: 'الاسم الكامل',
  profilePhoneLabel: 'رقم الجوال السعودي',
  profileEmailLabel: 'البريد الإلكتروني',
  profileRoleLabel: 'نوع الحساب',
  profileVerificationLabel: 'حالة التوثيق',
  profileGoogleLabel: 'الربط بحساب Google',
  profileConnected: 'مرتبط بحساب Google',
  profileNotConnected: 'غير مرتبط بعد',
  profileNotSet: 'غير مضاف بعد',
};

const EN_BUNDLE: TranslationBundle = {
  brandName: 'SouqAlGhanam 2.0',
  brandSubtitle: 'Saudi Livestock Marketplace',
  pageTitle: 'SouqAlGhanam 2.0 — Saudi Livestock Marketplace',
  navAriaLabel: 'Main Navigation',
  navHome: 'Home',
  navListings: 'Listings',
  navBreeds: 'Breeds',
  navBreeders: 'Breeders',
  navPricing: 'Plans & Pricing',
  navServices: 'Services',
  navContact: 'Contact Us',
  navTools: 'Tools',
  navHelp: 'Help',
  navServicesTools: 'Services & Tools',
  toolsColTitle: 'Smart Calculators & Tools',
  helpColTitle: 'Services, Guides & Support',
  toolCommission: 'Payment & Fee Calculator',
  toolCommissionDesc: 'Calculate 1% fee & bank transfer',
  toolWeights: 'Weights & Yield Calculator',
  toolWeightsDesc: 'Estimate carcass yield & clean meat',
  toolFeast: 'Smart Feast Calculator',
  toolFeastDesc: 'Estimate heads & rice for guests',
  toolTransport: 'Transport Cost Estimator',
  toolTransportDesc: 'Estimate inter-region livestock delivery',
  toolFeed: 'Herd & Feed Cost Planner',
  toolFeedDesc: 'Estimate barley & alfalfa feed budget',
  toolOccasions: 'By Occasion',
  toolOccasionsDesc: 'Recommendations for Aqiqa & feasts',
  toolServices: 'Support Services',
  toolServicesDesc: 'Livestock transport, vet & feed logistics',
  helpFaq: 'Help Center & FAQ',
  helpFaqDesc: 'Quick answers for breeders & buyers',
  helpHow: 'How It Works',
  helpHowDesc: 'Steps for safe buying & selling',
  helpGuides: 'Breeders Guides & Articles',
  helpGuidesDesc: 'Practical inspection & market advice',
  helpRules: 'Listing Rules & Review',
  helpRulesDesc: 'Publishing quality & verification standards',
  helpAbout: 'About SouqAlGhanam',
  helpAboutDesc: 'Our mission and trust standards',
  helpContact: 'Contact Us',
  helpContactDesc: 'Support team & user inquiries',
  signIn: 'Sign In',
  myAccount: 'My Account',
  menuDashboard: 'Dashboard',
  menuProfile: 'Profile',
  menuMyListings: 'My Listings',
  menuFavorites: 'Favorites',
  menuLogout: 'Sign Out',
  addListing: 'Post Listing',
  addListingShort: 'Post',
  notificationsTitle: 'Notifications',
  notificationsEmpty: 'No notifications yet. Alerts will appear here when messages, comments, or offers arrive.',
  markAllRead: 'Mark all as read',
  newBadge: 'New',
  themeLight: 'Light mode',
  themeDark: 'Dark mode',
  langMenuLabel: 'Select language',
  mobileMenuOpen: 'Open menu',
  mobileMenuClose: 'Close menu',
  roleAdmin: 'Platform Admin',
  roleSeller: 'Breeder / Seller',
  roleBuyer: 'Buyer',
  bottomNavHome: 'Home',
  bottomNavListings: 'Listings',
  bottomNavAdd: 'Post',
  bottomNavMessages: 'Messages',
  bottomNavAccount: 'Account',
  bottomNavLogin: 'Sign In',
  footerDescription:
    'A specialized Saudi livestock marketplace connecting breeders, sellers, and buyers with structured age, weight, vaccination details, and SAR market benchmarks.',
  footerSectionsTitle: 'Marketplace',
  footerHelpTitle: 'Help & Support',
  footerBreedsTitle: 'Popular Breeds',
  footerAccountTitleVisitor: 'Your Account',
  footerAccountTitleUser: 'Account & Tools',
  footerNewsletterTitle: 'Market Alerts & Price Updates',
  footerNewsletterSubtitle: 'Subscribe to receive indicative SAR livestock pricing updates and verified breeder highlights',
  footerNewsletterPlaceholder: 'Enter your email address...',
  footerNewsletterCta: 'Subscribe',
  footerNewsletterError: 'Please enter a valid email address.',
  footerNewsletterSuccess: 'Subscribed successfully',
  footerCopyright: '© 2026 SouqAlGhanam 2.0 — Kingdom of Saudi Arabia. All prices in SAR.',
  footerTrustNote: 'Direct communication between breeders and buyers · Admin-reviewed listings',
  footerLinkAllListings: 'All Listings',
  footerLinkServices: 'Support Services',
  footerLinkPricing: 'Plans & Pricing',
  footerLinkCommission: 'Payment & Fee Calculator',
  footerLinkWeights: 'Weights Calculator',
  footerLinkFeast: 'Feast Calculator',
  footerLinkTransport: 'Transport Estimator',
  footerLinkFeed: 'Feed Cost Planner',
  footerLinkOccasions: 'By Occasion',
  footerLinkAdd: 'Post Listing',
  footerLinkBreedAdsPrefix: 'Listings:',
  contactBadge: 'Breeder & Buyer Support',
  contactTitle: 'Contact Us',
  contactIntro:
    'Have a question about an account, listing, or marketplace tool? Send your message below and our moderation team will log and review it with a tracking reference.',
  contactSupportCardTitle: 'How Inquiries Are Handled',
  contactSupportCardBody:
    'Every submission is saved securely with a tracking reference (MSG-...) in our admin queue so moderators can review your request and follow up by email.',
  contactPointsTitle: 'Common Inquiry Topics',
  contactPoint1: 'Account access, breeder verification, or profile updates',
  contactPoint2: 'Reporting an issue with a listing or marketplace rule',
  contactPoint3: 'Technical bugs, suggestions, or general marketplace feedback',
  contactQuickLinksTitle: 'Helpful Links',
  contactFormTitle: 'Send a Message',
  contactFormSubtitle: 'Please fill in your details so our team can assist you clearly.',
  contactNameLabel: 'Full Name *',
  contactNamePlaceholder: 'e.g. Fahad Al-Qahtani',
  contactEmailLabel: 'Email Address *',
  contactEmailPlaceholder: 'name@example.com',
  contactCategoryLabel: 'Inquiry Category *',
  contactRegionLabel: 'Region (optional)',
  contactAllRegions: 'All Saudi Regions',
  contactMessageLabel: 'Message *',
  contactMessagePlaceholder: 'Describe your inquiry, listing issue, or suggestion clearly...',
  contactSubmit: 'Send Message',
  contactSubmitting: 'Sending...',
  contactSuccessTitle: 'Message Received',
  contactSuccessBody: 'Your inquiry has been logged in our support queue for review via your registered email.',
  contactRefLabel: 'Reference Number',
  contactSendAnother: 'Send Another Message',
  contactErrName: 'Please enter your full name (at least 2 characters).',
  contactErrEmail: 'Please enter a valid email address.',
  contactErrMessage: 'Please enter your message (at least 8 characters).',
  contactErrGeneric: 'Unable to send your message right now. Please try again.',
  contactCategories: {
    general: 'General Inquiry',
    account: 'Account Issue',
    listing: 'Listing Issue',
    technical: 'Technical Issue',
    feedback: 'Suggestion or Feedback',
  },
  weightsTitle: 'Livestock Weights & Yield Calculator',
  weightsSubtitle:
    'Estimate total live weight, dressed carcass weight, and clean edible meat yield across Saudi breeds, along with an indicative SAR valuation.',
  weightsSpeciesLabel: 'Livestock Breed Preset',
  weightsLiveWeightLabel: 'Live Weight per Head (kg)',
  weightsCountLabel: 'Number of Heads',
  weightsPricePerKgLabel: 'Estimated SAR / Live kg',
  weightsResultYieldTitle: 'Estimated Weight & Yield Summary',
  weightsResultCarcassLabel: 'Estimated Dressed Carcass (kg)',
  weightsResultCleanMeatLabel: 'Estimated Clean Meat (kg)',
  weightsResultTotalLiveLabel: 'Total Live Weight (kg)',
  weightsResultEstValueLabel: 'Estimated Market Value',
  weightsToFeastBtn: 'Open Feast Calculator',
  weightsToListingsBtn: 'Browse Available Listings',
  profileTabTitle: 'Profile & Account Details',
  profileNameLabel: 'Full Name',
  profilePhoneLabel: 'Saudi Mobile Number',
  profileEmailLabel: 'Email Address',
  profileRoleLabel: 'Account Role',
  profileVerificationLabel: 'Verification Status',
  profileGoogleLabel: 'Google Account Link',
  profileConnected: 'Connected with Google',
  profileNotConnected: 'Not connected yet',
  profileNotSet: 'Not provided yet',
};

const BUNDLES: Record<Language, TranslationBundle> = {
  ar: AR_BUNDLE,
  en: EN_BUNDLE,
};

const STORAGE_KEY = 'souq-lang';

function resolveInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'ar';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'ar' || saved === 'en') {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return 'ar';
}

interface I18nContextValue {
  lang: Language;
  isEn: boolean;
  dir: 'rtl' | 'ltr';
  setLanguage: (next: Language) => void;
  bi: (ar: string, en: string) => string;
  t: TranslationBundle;
}

const I18nContext = createContext<I18nContextValue>({
  lang: 'ar',
  isEn: false,
  dir: 'rtl',
  setLanguage: () => {},
  bi: (ar) => ar,
  t: AR_BUNDLE,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>(resolveInitialLanguage);

  const isEn = lang === 'en';
  const dir: 'rtl' | 'ltr' = lang === 'ar' ? 'rtl' : 'ltr';
  const t = BUNDLES[lang] || AR_BUNDLE;

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
      document.documentElement.dir = dir;
      document.title = t.pageTitle;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore storage errors
    }
  }, [lang, dir, t.pageTitle]);

  const setLanguage = useCallback((next: Language) => {
    setLang(next === 'en' ? 'en' : 'ar');
  }, []);

  const bi = useCallback(
    (ar: string, en: string) => (lang === 'en' ? en : ar),
    [lang]
  );

  const value = useMemo<I18nContextValue>(
    () => ({ lang, isEn, dir, setLanguage, bi, t }),
    [lang, isEn, dir, setLanguage, bi, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
