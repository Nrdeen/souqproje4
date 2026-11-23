import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Credential, GoogleIdentityRecord } from '../auth/types';
import { migrateAuthFields } from '../auth/migrate';
import type { SessionRecord } from '../auth/sessions';
import { normalizeReportRecord, normalizeSellerVerificationFields } from '../admin';
import type { CommentRecord } from '../comments';
import {
  normalizeLikeNotificationHistory,
  normalizeLikesStore,
  type LikeNotificationHistory,
  type LikesMap,
} from '../likes';
import type { MediaAsset } from '../media';
import { STORE_FILE_NAME } from '../storage';
import {
  createDefaultCommissionSettings,
  type CommissionRecord,
  type CommissionSettings,
} from '../../src/lib/commission';

export interface StorePaths {
  readonly dataDir: string;
  readonly storePath: string;
  readonly uploadsDir: string;
}

export function makeStorePaths(dataDir: string): StorePaths {
  return {
    dataDir,
    storePath: path.join(dataDir, STORE_FILE_NAME),
    uploadsDir: path.join(dataDir, 'uploads'),
  };
}

export interface StoreData {
  users: any[];
  sellers: any[];
  categories: any[];
  breeds: any[];
  regions: any[];
  listings: any[];
  favorites: Record<string, string[]>;
  likes: LikesMap;
  likeNotificationHistory: LikeNotificationHistory;
  conversations: any[];
  priceOffers: any[];
  notifications: any[];
  sellerReviews: any[];
  reports: any[];
  indicativePrices: any[];
  articles: any[];
  faqs: any[];
  auditLogs: any[];
  comments: CommentRecord[];
  media: MediaAsset[];
  commissionSettings: CommissionSettings;
  commissionRecords: CommissionRecord[];
  /** Argon2id password hashes, one per account that can sign in. Never sent to clients. */
  credentials: Credential[];
  /** Server-side sessions (only SHA-256 hashes of the cookie tokens are stored). */
  sessions: SessionRecord[];
  /** Verified OpenID Connect external identity links (e.g. Google `sub` -> userId). */
  googleIdentities: GoogleIdentityRecord[];
}

export type NotificationType =
  | 'offer_accepted'
  | 'offer_rejected'
  | 'new_message'
  | 'new_comment'
  | 'comment_reply'
  | 'listing_liked'
  | 'listing_approved'
  | 'listing_rejected'
  | 'seller_verified'
  | 'seller_verification_rejected'
  | 'commission_due'
  | 'commission_submitted'
  | 'commission_approved'
  | 'commission_rejected'
  | 'featured_approved';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  listingId?: string;
  conversationId?: string;
  commentId?: string;
}

export class RepositoryError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'repository_error'
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export const IMG = {
  hero: '/src/assets/images/hero_saudi_livestock_1794608168927.jpg',
  naimi: '/src/assets/images/breed_naimi_sheep_1794608169331.jpg',
  najdi: '/src/assets/images/breed_najdi_sheep_1794608169810.jpg',
  harri: '/src/assets/images/breed_harri_sheep_1794608169989.jpg',
  ardhi: '/src/assets/images/breed_ardhi_goat_1794608169786.jpg',
  sawakni: '/src/assets/images/breed_sawakni_camels_1794608171012.jpg',
} as const;

export function createSeedData(): StoreData {
  const now = new Date('2026-11-13T12:00:00Z').getTime();
  const hoursAgo = (h: number) => new Date(now - h * 3600 * 1000).toISOString();

  const users = [
    {
      id: 'usr_seller_1',
      phone: '0504829104',
      email: 'fahad@alqahtani-farm.sa',
      name: 'فهد القحطاني',
      role: 'seller',
      status: 'active',
      createdAt: hoursAgo(720),
    },
    {
      id: 'usr_seller_2',
      phone: '0559134287',
      email: 'abdulrahman@najd-herds.sa',
      name: 'عبدالرحمن الدوسري',
      role: 'seller',
      status: 'active',
      createdAt: hoursAgo(960),
    },
    {
      id: 'usr_seller_3',
      phone: '0547201833',
      email: 'salem@hijaz-livestock.sa',
      name: 'سالم الحربي',
      role: 'seller',
      status: 'active',
      createdAt: hoursAgo(600),
    },
    {
      id: 'usr_buyer_1',
      phone: '0561940281',
      email: 'khalid@riyadh.sa',
      name: 'خالد السبيعي',
      role: 'buyer',
      status: 'active',
      createdAt: hoursAgo(300),
    },
    {
      id: 'usr_admin_1',
      phone: '0500000001',
      email: 'admin@souqalghanam.sa',
      name: 'إدارة المنصة',
      role: 'admin',
      status: 'active',
      createdAt: hoursAgo(2000),
    },
  ];

  const sellers = [
    {
      userId: 'usr_seller_1',
      displayName: 'مراح القحطاني للنعيمي الفاخر',
      bio: 'مربٍ متخصص في سلالات النعيمي النجدية والشمالية منذ أكثر من 18 عاماً، مع التزام تام بالتحصين البيطري والتغذية الطبيعية.',
      regionId: 'reg_riyadh',
      city: 'الرياض — المزاحمية',
      phone: '0504829104',
      whatsapp: '966504829104',
      verificationStatus: 'Verified',
      verifiedAt: hoursAgo(500),
      verificationNote: null,
      verificationRequestedAt: hoursAgo(520),
      verificationReviewedAt: hoursAgo(500),
      yearsExperience: 18,
      specialty: 'نعيمي ونجدي',
      rating: 4.8,
      ratingCount: 2,
      totalSales: 142,
    },
    {
      userId: 'usr_seller_2',
      displayName: 'مزارع الدوسري للسلالات النجدية والعارضية',
      bio: 'إنتاج وتأصيل الفحول النجدية والماعز العارضي الصنف في منطقة القصيم والخرج، مع شهادة صحية لكل رأس.',
      regionId: 'reg_qassim',
      city: 'بريدة — القصيم',
      phone: '0559134287',
      whatsapp: '966559134287',
      verificationStatus: 'Verified',
      verifiedAt: hoursAgo(800),
      verificationNote: null,
      verificationRequestedAt: hoursAgo(820),
      verificationReviewedAt: hoursAgo(800),
      yearsExperience: 14,
      specialty: 'نجدي وعارضي',
      rating: 4.5,
      ratingCount: 2,
      totalSales: 98,
    },
    {
      userId: 'usr_seller_3',
      displayName: 'حظائر الحربي للحري والسواكني',
      bio: 'توفير أجود أنواع الحري البلدي والسواكني المربى محلياً للمناسبات والذبائح والتربية في منطقة مكة المكرمة والطائف.',
      regionId: 'reg_makkah',
      city: 'الطائف — مكة المكرمة',
      phone: '0547201833',
      whatsapp: '966547201833',
      verificationStatus: 'Verified',
      verifiedAt: hoursAgo(400),
      verificationNote: null,
      verificationRequestedAt: hoursAgo(410),
      verificationReviewedAt: hoursAgo(400),
      yearsExperience: 11,
      specialty: 'حري وسواكني',
      rating: 5.0,
      ratingCount: 1,
      totalSales: 176,
    },
  ];

  const categories = [
    { id: 'cat_sheep', name: 'الأغنام', slug: 'sheep', parentId: null },
    { id: 'cat_goats', name: 'الماعز', slug: 'goats', parentId: null },
    { id: 'cat_breeding', name: 'فحول الإنتاج', slug: 'breeding-rams', parentId: null },
    {
      id: 'sub_slaughter',
      name: 'ذبائح',
      slug: 'slaughter',
      parentId: 'cat_sheep',
      description: 'أغنام وماعز جاهزة للذبح والمناسبات والأضاحي',
      keywords: ['جذعان', 'هرفي', 'بهم', 'طليان', 'ذبيحة', 'ذبائح', 'ولائم', 'عزائم', 'مناسبات'],
    },
    {
      id: 'sub_breeding',
      name: 'مواشي للتربية',
      slug: 'for-breeding',
      parentId: 'cat_sheep',
      description: 'إناث دفيع ومتابيع وقطيع إنتاج للتربية والتكاثر',
      keywords: ['رخال', 'دفيع', 'متابيع', 'حلوب', 'مضاريع', 'مقاريب', 'تربية', 'جفرتين'],
    },
    {
      id: 'sub_show',
      name: 'مواشي للعرض',
      slug: 'for-show',
      parentId: 'cat_breeding',
      description: 'فحول صنف وسلالات فاخرة للعرض والإنتاج المميز',
      keywords: ['فحل', 'صنف', 'فاخر', 'ناهي', 'أبرص', 'عرض', 'أصل وفصل', 'نسف'],
    },
  ];

  const breeds = [
    {
      id: 'brd_naimi',
      categoryId: 'cat_sheep',
      name: 'نعيمي',
      slug: 'naimi',
      origin: 'نجد والشمال',
      summary: 'السلالة الأكثر طلباً في المملكة للذبائح والمناسبات، تمتاز بجودة اللحم وتوازن الدهن وقدرتها العالية على التكيف.',
      avgWeightKg: '38 – 65 كجم',
      priceRangeSar: '1,450 – 2,400 ر.س',
      imageUrl: IMG.naimi,
      characteristics: ['رأس بني محمر وصوف أبيض كثيف', 'تتحمل أجواء الصحراء والبرد', 'نسبة تصافي لحم مرتفعة'],
    },
    {
      id: 'brd_najdi',
      categoryId: 'cat_sheep',
      name: 'نجدي',
      slug: 'najdi',
      origin: 'وسط المملكة (نجد)',
      summary: 'أيقونة المواشي النجدية الأصيلة، معروفة بقامتها الطويلة وشعرها الأسود اللامع وأنفها المقوّس وقيمتها العالية لدى المربين.',
      avgWeightKg: '42 – 72 كجم',
      priceRangeSar: '1,650 – 3,500 ر.س',
      imageUrl: IMG.najdi,
      characteristics: ['لون أسود حالك مع بياض في الوجه والأطراف', 'مناسبة جداً للتربية والإنتاج الفاخر', 'خصوبة عالية ومقاومة للجفاف'],
    },
    {
      id: 'brd_harri',
      categoryId: 'cat_sheep',
      name: 'حري',
      slug: 'harri',
      origin: 'الحجاز والساحل الغربي',
      summary: 'سلالة حجازية عريقة تشتهر بلحمها الطري ونموها السريع، وتحظى بإقبال كبير في مكة وجدة والطائف.',
      avgWeightKg: '32 – 52 كجم',
      priceRangeSar: '1,250 – 1,950 ر.س',
      imageUrl: IMG.harri,
      characteristics: ['لون أبيض ناصع وصوف ناعم متوسط', 'لحم خفيف الدهون ومذاق مميز', 'معدلات توأم عالية'],
    },
    {
      id: 'brd_ardhi',
      categoryId: 'cat_goats',
      name: 'عارضي',
      slug: 'ardhi',
      origin: 'هضبة نجد والعارض',
      summary: 'الماعز السعودي الأصيل المفضّل للإنتاج والزينة، يمتاز بالأذنين الطويلتين والهيكل القوي والقدرة الممتازة على إدرار الحليب.',
      avgWeightKg: '35 – 60 كجم',
      priceRangeSar: '1,100 – 2,800 ر.س',
      imageUrl: IMG.ardhi,
      characteristics: ['شعر أسود لامع وأذنان طويلتان متدليتان', 'مقاوم للحرارة وقلة المرعى', 'مطلوب لفحول الصنف والتربية'],
    },
    {
      id: 'brd_sawakni',
      categoryId: 'cat_sheep',
      name: 'سواكني',
      slug: 'sawakni',
      origin: 'مربى محلياً',
      summary: 'خيار اقتصادي عملي للولائم والعقود الغذائية، يمتاز بوفرة اللحم وانخفاض الشحم خاصة عند تربيته وتغذيته محلياً.',
      avgWeightKg: '40 – 62 كجم',
      priceRangeSar: '950 – 1,450 ر.س',
      imageUrl: IMG.sawakni,
      characteristics: ['غطاء قصير بلون بني أو أحمر فاتح', 'وزن لحم صافٍ مرتفع', 'سعر اقتصادي للمناسبات الكبيرة'],
    },
  ];

  const regions = [
    { id: 'reg_riyadh', name: 'الرياض', parentId: null },
    { id: 'reg_makkah', name: 'مكة المكرمة', parentId: null },
    { id: 'reg_eastern', name: 'المنطقة الشرقية', parentId: null },
    { id: 'reg_qassim', name: 'القصيم', parentId: null },
    { id: 'reg_madinah', name: 'المدينة المنورة', parentId: null },
    { id: 'reg_asir', name: 'عسير', parentId: null },
    { id: 'reg_hail', name: 'حائل', parentId: null },
    { id: 'reg_tabuk', name: 'تبوك', parentId: null },
  ];

  const listings = [
    {
      id: 'lst_101',
      sellerId: 'usr_seller_1',
      categoryId: 'cat_sheep',
      subCategoryId: 'sub_slaughter',
      breedId: 'brd_naimi',
      regionId: 'reg_riyadh',
      city: 'المزاحمية',
      title: 'جذعان نعيمي بلدي تربية مراح شرط الصحة والنظافة',
      slug: 'naimi-lambs-riyadh-101',
      description: 'عدد 12 رأس جذعان نعيمي بلدي تربية مراح خاص في المزاحمية، التغذية على الشعير والبرسيم الصافي، محصنة دموي ومعوي، أوزان طيبة وتصلح للذبائح والمناسبات.',
      priceAmount: 1850,
      expectedPrice: 1750,
      currency: 'SAR',
      sex: 'ذكر',
      ageMonths: 8,
      weightKg: 46,
      quantity: 12,
      isNegotiable: true,
      allowPriceOffers: true,
      vaccinated: true,
      status: 'Published',
      publishedAt: hoursAgo(2),
      createdAt: hoursAgo(3),
      updatedAt: hoursAgo(2),
      isFeatured: true,
      images: [
        { id: 'img_101_1', url: IMG.naimi, position: 1 },
        { id: 'img_101_2', url: IMG.hero, position: 2 },
      ],
    },
    {
      id: 'lst_102',
      sellerId: 'usr_seller_2',
      categoryId: 'cat_breeding',
      subCategoryId: 'sub_show',
      breedId: 'brd_najdi',
      regionId: 'reg_qassim',
      city: 'بريدة',
      title: 'فحل نجدي رباع فاخر سلالة أصيلة شرط النسف',
      slug: 'najdi-ram-qassim-102',
      description: 'فحل نجدي صنف رباع، جرم ناهي، رأس أبرص، شعرة حريرية، منتج وله إنتاج فاخر في المراح، خالٍ من جميع العيوب والأمراض ولله الحمد.',
      priceAmount: 3400,
      expectedPrice: 3150,
      currency: 'SAR',
      sex: 'ذكر',
      ageMonths: 24,
      weightKg: 70,
      quantity: 1,
      isNegotiable: true,
      allowPriceOffers: true,
      vaccinated: true,
      status: 'Published',
      publishedAt: hoursAgo(5),
      createdAt: hoursAgo(6),
      updatedAt: hoursAgo(5),
      isFeatured: true,
      images: [
        { id: 'img_102_1', url: IMG.najdi, position: 1 },
        { id: 'img_102_2', url: IMG.naimi, position: 2 },
      ],
    },
    {
      id: 'lst_103',
      sellerId: 'usr_seller_3',
      categoryId: 'cat_sheep',
      subCategoryId: 'sub_slaughter',
      breedId: 'brd_harri',
      regionId: 'reg_makkah',
      city: 'الطائف',
      title: 'بهم حري أعمار 6 إلى 7 أشهر من حلال الطائف',
      slug: 'harri-lambs-taif-103',
      description: 'بهم حري سمان وشحم طيب، رعي طبيعي مع علف مركز، البيع جملة أو تفريد حسب الرغبة مع إمكانية التوصيل داخل مكة وجدة والطائف.',
      priceAmount: 1480,
      currency: 'SAR',
      sex: 'ذكر',
      ageMonths: 7,
      weightKg: 38,
      quantity: 20,
      isNegotiable: false,
      vaccinated: true,
      status: 'Published',
      publishedAt: hoursAgo(9),
      createdAt: hoursAgo(10),
      updatedAt: hoursAgo(9),
      isFeatured: true,
      images: [
        { id: 'img_103_1', url: IMG.harri, position: 1 },
      ],
    },
    {
      id: 'lst_104',
      sellerId: 'usr_seller_2',
      categoryId: 'cat_goats',
      subCategoryId: 'sub_breeding',
      breedId: 'brd_ardhi',
      regionId: 'reg_riyadh',
      city: 'الخرج',
      title: 'تيس عارضي ثني أصل وفصل مع جفرتين دفيع',
      slug: 'ardhi-goat-kharj-104',
      description: 'مجموعة عوارض صنف: تيس ثني جرم طيب وأذن طويلة وجفرتين مضاريع على فحل المراح، سليمة ومحصنة كاملة.',
      priceAmount: 2650,
      currency: 'SAR',
      sex: 'قطيع مختلط',
      ageMonths: 14,
      weightKg: 48,
      quantity: 3,
      isNegotiable: true,
      vaccinated: true,
      status: 'Published',
      publishedAt: hoursAgo(14),
      createdAt: hoursAgo(15),
      updatedAt: hoursAgo(14),
      isFeatured: false,
      images: [
        { id: 'img_104_1', url: IMG.ardhi, position: 1 },
      ],
    },
    {
      id: 'lst_105',
      sellerId: 'usr_seller_3',
      categoryId: 'cat_sheep',
      subCategoryId: 'sub_slaughter',
      breedId: 'brd_sawakni',
      regionId: 'reg_eastern',
      city: 'الدمام',
      title: 'سواكني مربى في المملكة 5 أشهر نظيف جداً',
      slug: 'sawakni-dammam-105',
      description: 'سواكني تربية محلية لمدة 5 أشهر على البرسيم والشعير، لحم أحمر صافي وخالٍ من الزفر، مناسب للعزائم والمطابخ.',
      priceAmount: 1180,
      currency: 'SAR',
      sex: 'ذكر',
      ageMonths: 11,
      weightKg: 50,
      quantity: 15,
      isNegotiable: false,
      vaccinated: true,
      status: 'Published',
      publishedAt: hoursAgo(20),
      createdAt: hoursAgo(22),
      updatedAt: hoursAgo(20),
      isFeatured: false,
      images: [
        { id: 'img_105_1', url: IMG.sawakni, position: 1 },
      ],
    },
    {
      id: 'lst_106',
      sellerId: 'usr_seller_1',
      categoryId: 'cat_sheep',
      subCategoryId: 'sub_breeding',
      breedId: 'brd_naimi',
      regionId: 'reg_hail',
      city: 'حائل',
      title: 'رخال نعيميات صنف دفيع مقاريب عدد 8 رؤوس',
      slug: 'naimi-ewes-hail-106',
      description: 'رخال نعيميات جذعات وثنيات مقاريب على فحل من حلال الشمال، أصحاح وأحوال ممتازة والبيع سمح للصامل.',
      priceAmount: 2150,
      currency: 'SAR',
      sex: 'أنثى',
      ageMonths: 15,
      weightKg: 54,
      quantity: 8,
      isNegotiable: true,
      vaccinated: true,
      status: 'Published',
      publishedAt: hoursAgo(26),
      createdAt: hoursAgo(28),
      updatedAt: hoursAgo(26),
      isFeatured: false,
      images: [
        { id: 'img_106_1', url: IMG.naimi, position: 1 },
      ],
    },
    {
      id: 'lst_107',
      sellerId: 'usr_seller_1',
      categoryId: 'cat_sheep',
      subCategoryId: 'sub_slaughter',
      breedId: 'brd_najdi',
      regionId: 'reg_riyadh',
      city: 'رماح',
      title: 'طليان نجدية جذعان تربية برية — بانتظار المراجعة',
      slug: 'najdi-pending-107',
      description: 'طليان نجدية من إنتاج مراح رماح، مرعى طبيعي مع شعير بلدي، أعمار 7 أشهر ونظيفة تماماً.',
      priceAmount: 1950,
      currency: 'SAR',
      sex: 'ذكر',
      ageMonths: 7,
      weightKg: 43,
      quantity: 6,
      isNegotiable: true,
      vaccinated: true,
      status: 'Pending',
      publishedAt: hoursAgo(1),
      createdAt: hoursAgo(1),
      updatedAt: hoursAgo(1),
      isFeatured: false,
      images: [
        { id: 'img_107_1', url: IMG.najdi, position: 1 },
      ],
    },
    {
      id: 'lst_108',
      sellerId: 'usr_seller_3',
      categoryId: 'cat_goats',
      subCategoryId: 'sub_breeding',
      breedId: 'brd_ardhi',
      regionId: 'reg_makkah',
      city: 'جدة',
      title: 'معزا عوارض حلوب متابيع — بانتظار الاعتماد',
      slug: 'ardhi-pending-108',
      description: 'عنزين عوارض معها 3 جفار، حليب وافر وصحة ممتازة ومحصنة ضد الطاعون والدموي.',
      priceAmount: 2300,
      currency: 'SAR',
      sex: 'أنثى',
      ageMonths: 22,
      weightKg: 45,
      quantity: 2,
      isNegotiable: true,
      vaccinated: true,
      status: 'Pending',
      publishedAt: hoursAgo(0.5),
      createdAt: hoursAgo(0.5),
      updatedAt: hoursAgo(0.5),
      isFeatured: false,
      images: [
        { id: 'img_108_1', url: IMG.ardhi, position: 1 },
      ],
    },
  ];

  const favorites: Record<string, string[]> = {
    usr_buyer_1: ['lst_101', 'lst_102'],
    usr_seller_1: ['lst_102'],
    usr_admin_1: ['lst_101'],
  };

  const likes: LikesMap = {
    lst_101: ['usr_buyer_1', 'usr_seller_2'],
    lst_102: ['usr_buyer_1'],
    lst_103: ['usr_seller_1'],
  };

  const likeNotificationHistory: LikeNotificationHistory = {};

  const conversations = [
    {
      id: 'conv_1',
      listingId: 'lst_101',
      buyerId: 'usr_buyer_1',
      sellerId: 'usr_seller_1',
      updatedAt: hoursAgo(1),
      messages: [
        {
          id: 'msg_1',
          conversationId: 'conv_1',
          senderId: 'usr_buyer_1',
          body: 'السلام عليكم، هل الجذعان النعيمي ما زالت متوفرة؟ وكم تحسب لي 4 رؤوس؟',
          createdAt: hoursAgo(1.5),
        },
        {
          id: 'msg_2',
          conversationId: 'conv_1',
          senderId: 'usr_seller_1',
          body: 'وعليكم السلام ورحمة الله، حياك الله يا أبو عبدالله، نعم متوفرة وللأربعة رؤوس نحسبها لك بـ 1,800 ريال للرأس مع التحصين.',
          createdAt: hoursAgo(1),
        },
      ],
    },
  ];

  const priceOffers = [
    {
      id: 'off_1',
      listingId: 'lst_101',
      buyerId: 'usr_buyer_1',
      buyerName: 'خالد السبيعي',
      sellerId: 'usr_seller_1',
      offeredPrice: 1750,
      quantity: 4,
      note: 'شامل التوصيل داخل الرياض والدفع عند الاستلام.',
      status: 'pending',
      createdAt: hoursAgo(1.2),
      updatedAt: hoursAgo(1.2),
    },
    {
      id: 'off_2',
      listingId: 'lst_102',
      buyerId: 'usr_buyer_1',
      buyerName: 'خالد السبيعي',
      sellerId: 'usr_seller_2',
      offeredPrice: 3100,
      quantity: 1,
      note: 'صامل في الشراء بعد المعاينة في بريدة.',
      status: 'pending',
      createdAt: hoursAgo(3),
      updatedAt: hoursAgo(3),
    },
  ];

  const reports = [
    {
      id: 'rep_1',
      targetType: 'listing',
      reporterId: 'usr_buyer_1',
      listingId: 'lst_105',
      commentId: null,
      reason: 'استفسار عن السعر والتفاصيل',
      details: 'يرجى التأكد من توضيح عمر التغذية المحلية في الوصف بشكل أدق.',
      status: 'open',
      createdAt: hoursAgo(4),
      resolvedAt: null,
      resolutionNote: null,
    },
  ];

  const indicativePrices = [
    {
      id: 'prc_1',
      breedId: 'brd_naimi',
      breedName: 'نعيمي بلدي',
      categoryName: 'الأغنام',
      ageGroup: 'هرفي / جذع (6-9 أشهر)',
      minPrice: 1550,
      maxPrice: 2050,
      avgPrice: 1800,
      trend: 'up',
      regionNote: 'الرياض والقصيم والشرقية',
      updatedAt: hoursAgo(6),
    },
    {
      id: 'prc_2',
      breedId: 'brd_najdi',
      breedName: 'نجدي أصيل',
      categoryName: 'الأغنام',
      ageGroup: 'جذع (7-10 أشهر)',
      minPrice: 1700,
      maxPrice: 2350,
      avgPrice: 1980,
      trend: 'stable',
      regionNote: 'الرياض وحائل والقصيم',
      updatedAt: hoursAgo(6),
    },
    {
      id: 'prc_3',
      breedId: 'brd_harri',
      breedName: 'حري حجازي',
      categoryName: 'الأغنام',
      ageGroup: 'بهم وسط (5-8 أشهر)',
      minPrice: 1300,
      maxPrice: 1750,
      avgPrice: 1520,
      trend: 'stable',
      regionNote: 'مكة وجدة والطائف',
      updatedAt: hoursAgo(6),
    },
    {
      id: 'prc_4',
      breedId: 'brd_ardhi',
      breedName: 'ماعز عارضي',
      categoryName: 'الماعز',
      ageGroup: 'جذع / ثني',
      minPrice: 1150,
      maxPrice: 2400,
      avgPrice: 1650,
      trend: 'up',
      regionNote: 'الرياض والقصيم',
      updatedAt: hoursAgo(6),
    },
    {
      id: 'prc_5',
      breedId: 'brd_sawakni',
      breedName: 'سواكني مربى محلياً',
      categoryName: 'الأغنام',
      ageGroup: 'جذع كبير (9-12 شهراً)',
      minPrice: 1050,
      maxPrice: 1400,
      avgPrice: 1220,
      trend: 'down',
      regionNote: 'جميع مناطق المملكة',
      updatedAt: hoursAgo(6),
    },
  ];

  const articles = [
    {
      id: 'art_1',
      title: 'كيف تفحص الأضحية أو الذبيحة قبل الشراء؟ 7 علامات أساسية للصحة',
      category: 'إرشادات المشتري',
      readTimeMinutes: 4,
      publishedAt: hoursAgo(72),
      excerpt: 'دليل عملي لفحص العينين والصوف والأسنان والنشاط الحركي للتأكد من خلو الماشية من العيوب الشرعية والصحية.',
      content:
        'عند معاينة الماشية سواء في الحظيرة أو عند الاستلام، ابدأ بفحص النشاط العام للحيوان واستجابته للمحيط. تأكد من لمعان العينين وخلوهما من الإفرازات، وافحص الصوف أو الشعر للتأكد من تماسكه وعدم وجود مناطق صلع أو جرب. كما يُنصح بفحص الأسنان لمعرفة العمر التقريبي (جذع، ثني، رباع)، والتأكد من امتلاء الظهر والخواصر دلالةً على جودة التغذية.',
      imageUrl: IMG.naimi,
    },
    {
      id: 'art_2',
      title: 'برنامج التحصين البيطري السنوي للمربين في البيئة السعودية',
      category: 'رعاية المراح',
      readTimeMinutes: 5,
      publishedAt: hoursAgo(120),
      excerpt: 'جدول زمني متكامل للقاحات الدموي والمعوي والطاعون والجدري لتقليل النفوق ورفع كفاءة الإنتاج.',
      content:
        'تُعد الوقاية البيطرية حجر الأساس في نجاح أي مشروع تربية مواشٍ. يُنصح بالالتزام بجرعات التسمم الدموي والمعوي كل 6 أشهر، وتطعيم الجدري والحمى القلاعية حسب التوجيهات البيطرية الرسمية، مع عزل الحالات المشتراة حديثاً لمدة 14 يوماً قبل دمجها في القطيع الرئيسي.',
      imageUrl: IMG.hero,
    },
    {
      id: 'art_3',
      title: 'الفرق بين النعيمي والنجدي والحري: أيهما يناسب احتياجك؟',
      category: 'دليل السلالات',
      readTimeMinutes: 4,
      publishedAt: hoursAgo(180),
      excerpt: 'مقارنة شاملة في الوزن والمذاق وتحمّل المناخ والعائد الاقتصادي للمربين والمستهلكين.',
      content:
        'تتميز المملكة بتنوع سلالات الأغنام لتناسب أذواق المستهلكين وبيئات التربية المختلفة. يتصدر النعيمي مبيعات الولائم في الوسطى والشرقية لتوازن شحمه، بينما يحتفظ النجدي بمكانة تراثية واقتصادية رفيعة لدى المربين المحترفين، في حين يُعد الحري الخيار الأول في المنطقة الغربية بفضل طراوة لحمه وسرعة نموه.',
      imageUrl: IMG.najdi,
    },
  ];

  const faqs = [
    {
      id: 'faq_1',
      question: 'كيف تتم مراجعة الإعلانات في سوق الغنم 2.0؟',
      answer: 'يمر كل إعلان جديد بحالة «بانتظار المراجعة» حيث يتأكد فريق الإشراف من وضوح الصور واكتمال المواصفات (السلالة، العمر، الوزن، السعر بالريال) قبل اعتماده للنشر، وذلك لحماية المشترين والمربين.',
    },
    {
      id: 'faq_2',
      question: 'هل الأسعار الاسترشادية ملزمة للبائعين؟',
      answer: 'لا، الأسعار الاسترشادية هي متوسطات استرشادية تُحدّث أسبوعياً بناءً على حركة السوق والمناطق، وتساعد البائع والمشتري على التقييم العادل دون إلزام بسعر محدد.',
    },
    {
      id: 'faq_3',
      question: 'كيف أحصل على توثيق حساب المربي؟',
      answer: 'يمكن للمربين المنتظمين طلب التوثيق بعد نشر 3 إعلانات مكتملة وتوثيق رقم الجوال وتحديد موقع المراح، ليظهر شعار المربي الموثوق في ملفهم الشخصي وإعلاناتهم.',
    },
    {
      id: 'faq_4',
      question: 'ماذا أفعل إذا لاحظت إعلاناً غير مطابق أو مخالفاً؟',
      answer: 'يمكنك استخدام زر «إبلاغ عن مخالفة» داخل صفحة تفاصيل الإعلان، وسيصل البلاغ فوراً إلى لوحة المشرفين لاتخاذ الإجراء المناسب وحماية المستخدمين.',
    },
  ];

  const auditLogs = [
    {
      id: 'aud_1',
      actorId: 'usr_admin_1',
      actorName: 'إدارة المنصة',
      action: 'اعتماد إعلان',
      targetType: 'listing',
      targetId: 'lst_101',
      note: 'تم التحقق من الصور والمواصفات البيطرية.',
      createdAt: hoursAgo(2),
    },
  ];

  const notifications = [
    {
      id: 'ntf_1',
      userId: 'usr_buyer_1',
      type: 'new_message',
      title: 'رسالة جديدة من فهد القحطاني',
      body: 'وعليكم السلام ورحمة الله، حياك الله يا أبو عبدالله، نعم متوفرة وللأربعة رؤوس نحسبها لك بـ 1,800 ريال...',
      listingId: 'lst_101',
      conversationId: 'conv_1',
      read: false,
      createdAt: hoursAgo(1),
    },
  ];

  const sellerReviews = [
    {
      id: 'rev_1',
      sellerId: 'usr_seller_1',
      reviewerId: 'usr_buyer_1',
      reviewerName: 'خالد السبيعي',
      rating: 5,
      comment: 'تعامل راقٍ ومصداقية في الوزن والعمر والتحصين، الحلال وصل بحالة ممتازة.',
      createdAt: hoursAgo(48),
      updatedAt: hoursAgo(48),
    },
    {
      id: 'rev_2',
      sellerId: 'usr_seller_1',
      reviewerId: 'usr_seller_3',
      reviewerName: 'سالم الحربي',
      rating: 5,
      comment: 'مراح نظيف وأمانة في البيع والشراء وسرعة في التوصيل.',
      createdAt: hoursAgo(120),
      updatedAt: hoursAgo(120),
    },
    {
      id: 'rev_3',
      sellerId: 'usr_seller_2',
      reviewerId: 'usr_buyer_1',
      reviewerName: 'خالد السبيعي',
      rating: 4,
      comment: 'سلالات نجدية طيبة وأصل معروف، والتجاوب سريع.',
      createdAt: hoursAgo(96),
      updatedAt: hoursAgo(96),
    },
    {
      id: 'rev_4',
      sellerId: 'usr_seller_2',
      reviewerId: 'usr_seller_1',
      reviewerName: 'فهد القحطاني',
      rating: 5,
      comment: 'فحول صنف ومستوى عالٍ من العناية البيطرية.',
      createdAt: hoursAgo(168),
      updatedAt: hoursAgo(168),
    },
    {
      id: 'rev_5',
      sellerId: 'usr_seller_3',
      reviewerId: 'usr_buyer_1',
      reviewerName: 'خالد السبيعي',
      rating: 5,
      comment: 'الحري البلدي مطابق للمواصفات والوزن تماماً، أنصح بالتعامل معه.',
      createdAt: hoursAgo(72),
      updatedAt: hoursAgo(72),
    },
  ];

  const comments: CommentRecord[] = [
    {
      id: 'cmt_seed_1',
      listingId: 'lst_101',
      parentId: null,
      authorId: 'usr_buyer_1',
      authorName: 'خالد السبيعي',
      body: 'السلام عليكم، هل الجذعان محصّنة دموي ومعوي حديثاً؟ وهل يتوفر توصيل لشمال الرياض؟',
      isEdited: false,
      createdAt: hoursAgo(4),
      updatedAt: hoursAgo(4),
    },
    {
      id: 'cmt_seed_2',
      listingId: 'lst_101',
      parentId: 'cmt_seed_1',
      authorId: 'usr_seller_1',
      authorName: 'مراح القحطاني للنعيمي الفاخر',
      body: 'وعليكم السلام حياك الله، نعم جميعها محصّنة دموي ومعوي قبل شهر، والتوصيل متاح داخل الرياض وضواحيها بالاتفاق.',
      isEdited: false,
      createdAt: hoursAgo(3),
      updatedAt: hoursAgo(3),
    },
  ];

  return {
    users,
    sellers,
    categories,
    breeds,
    regions,
    listings,
    favorites,
    likes,
    likeNotificationHistory,
    conversations,
    priceOffers,
    notifications,
    sellerReviews,
    reports,
    indicativePrices,
    articles,
    faqs,
    auditLogs,
    comments,
    media: [],
    commissionSettings: createDefaultCommissionSettings(new Date(now).toISOString()),
    commissionRecords: [],
    credentials: [],
    sessions: [],
    googleIdentities: [],
  };
}

export function inferSubCategoryId(
  listing: { title?: string; description?: string; sex?: string; ageMonths?: number; categoryId?: string },
  categories: any[]
): string | null {
  const subCategories = categories.filter((c) => c.parentId !== null);
  if (subCategories.length === 0) return null;

  const text = `${listing.title || ''} ${listing.description || ''}`.toLowerCase();
  let bestId: string | null = null;
  let bestScore = 0;

  for (const sub of subCategories) {
    const kws: string[] = Array.isArray(sub.keywords) ? sub.keywords : [];
    let score = 0;
    for (const kw of kws) {
      if (kw && text.includes(kw.toLowerCase())) {
        score += 2;
      }
    }
    if (sub.parentId && sub.parentId === listing.categoryId) {
      score += 0.5;
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = sub.id;
    }
  }

  if (bestScore >= 2 && bestId) return bestId;

  if (listing.categoryId === 'cat_breeding') {
    const showCat = subCategories.find((c) => c.id === 'sub_show');
    if (showCat) return showCat.id;
  }
  if (listing.sex === 'أنثى' || listing.sex === 'قطيع مختلط') {
    const breedCat = subCategories.find((c) => c.id === 'sub_breeding');
    if (breedCat) return breedCat.id;
  }
  const slaughterCat = subCategories.find((c) => c.id === 'sub_slaughter');
  return slaughterCat?.id || subCategories[0]?.id || null;
}

export function hydrateStore(parsed: StoreData): StoreData {
  const seed = createSeedData();
  const hasSubCategories = parsed.categories?.some((c) => c.parentId !== null);
  if (!hasSubCategories) {
    const existingIds = new Set((parsed.categories || []).map((c) => c.id));
    for (const cat of seed.categories) {
      if (!existingIds.has(cat.id)) {
        parsed.categories.push(cat);
      }
    }
  }
  if (!Array.isArray(parsed.priceOffers)) {
    parsed.priceOffers = seed.priceOffers;
  }
  if (!Array.isArray(parsed.notifications)) {
    parsed.notifications = seed.notifications;
  }
  if (!Array.isArray(parsed.sellerReviews)) {
    parsed.sellerReviews = seed.sellerReviews;
  }
  if (!Array.isArray(parsed.media)) {
    parsed.media = [];
  }
  if (!Array.isArray(parsed.comments)) {
    parsed.comments = [];
  }
  if (!Array.isArray(parsed.reports)) {
    parsed.reports = seed.reports;
  } else {
    parsed.reports = parsed.reports.map((r) => normalizeReportRecord(r));
  }
  parsed.likes = normalizeLikesStore(parsed.likes);
  parsed.likeNotificationHistory = normalizeLikeNotificationHistory(parsed.likeNotificationHistory);
  if (Array.isArray(parsed.users)) {
    parsed.users = parsed.users.map((u) => ({
      ...u,
      status: u.status === 'suspended' ? 'suspended' : 'active',
    }));
  }
  if (Array.isArray(parsed.sellers)) {
    parsed.sellers = parsed.sellers.map((s) => {
      const normalizedSeller = normalizeSellerVerificationFields(s);
      const reviews = (parsed.sellerReviews || []).filter((r) => r.sellerId === s.userId);
      if (reviews.length > 0) {
        const sum = reviews.reduce((acc, r) => acc + Number(r.rating || 0), 0);
        return {
          ...normalizedSeller,
          rating: Math.round((sum / reviews.length) * 10) / 10,
          ratingCount: reviews.length,
        };
      }
      return { ...normalizedSeller, ratingCount: s.ratingCount ?? 0 };
    });
  }
  if (Array.isArray(parsed.listings)) {
    parsed.listings = parsed.listings.map((l) => ({
      ...l,
      subCategoryId: l.subCategoryId || inferSubCategoryId(l, parsed.categories),
      expectedPrice:
        l.expectedPrice !== undefined
          ? l.expectedPrice
          : l.isNegotiable
          ? Math.round((l.priceAmount * 0.92) / 10) * 10
          : null,
      allowPriceOffers:
        l.allowPriceOffers !== undefined ? Boolean(l.allowPriceOffers) : Boolean(l.isNegotiable),
    }));
  }
  if (!Array.isArray(parsed.commissionRecords)) {
    parsed.commissionRecords = [];
  }
  const defaultCommission = createDefaultCommissionSettings();
  parsed.commissionSettings = {
    ...defaultCommission,
    ...(parsed.commissionSettings && typeof parsed.commissionSettings === 'object'
      ? parsed.commissionSettings
      : {}),
  };
  migrateAuthFields(parsed);
  return parsed;
}

/** Atomic write (temp file + rename), owner-only permissions: the file holds password hashes. */
export function writeStoreFile(paths: StorePaths, data: StoreData) {
  const tmp = `${paths.storePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmp, paths.storePath);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // best effort cleanup of the temp file
    }
    throw err;
  }
}

export function loadStore(paths: StorePaths): StoreData {
  try {
    if (!fs.existsSync(paths.dataDir)) {
      fs.mkdirSync(paths.dataDir, { recursive: true });
    }
    if (!fs.existsSync(paths.storePath)) {
      const seed = createSeedData();
      writeStoreFile(paths, seed);
      return seed;
    }
    const raw = fs.readFileSync(paths.storePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.credentials)) {
      const backupDir = path.join(paths.dataDir, 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.writeFileSync(path.join(backupDir, `store.pre-auth-${stamp}.json`), raw, {
        encoding: 'utf-8',
        mode: 0o600,
      });
    }
    const hydrated = hydrateStore(parsed);
    writeStoreFile(paths, hydrated);
    return hydrated;
  } catch (err) {
    console.error('Failed to load store:', err);
    throw err;
  }
}
