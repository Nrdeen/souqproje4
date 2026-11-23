import { useEffect, useRef, useState } from 'react';
import {
  Award,
  BadgePercent,
  Bell,
  BellRing,
  BookOpen,
  Calculator,
  Check,
  CheckCircle2,
  ChevronDown,
  Compass,
  FileText,
  Gift,
  Globe,
  Heart,
  HelpCircle,
  LayoutDashboard,
  Lock,
  LogOut,
  MessageCircle,
  MessageSquare,
  Moon,
  Package,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  Tag,
  ThumbsUp,
  TrendingUp,
  Truck,
  User as UserIcon,
  Users,
  Wheat,
  X,
  XCircle,
} from 'lucide-react';
import type { AppNotification, User } from '../types/marketplace';
import { formatRelativeArabicTime } from '../lib/format';
import { LANGUAGE_OPTIONS, useI18n } from '../lib/i18n';
import type { DirectoryFilters } from '../lib/listing-search';
import { getRoleAwareNavItems } from '../lib/marketplace-helpers';
import type { AuthMode, DashboardTab, PageView } from '../lib/router';

export type { PageView };

interface HeaderProps {
  currentPage: PageView;
  activeDashboardTab?: DashboardTab | null;
  onNavigate: (
    page: PageView,
    options?: {
      authMode?: AuthMode;
      dashboardTab?: DashboardTab;
      hash?: string;
      listingFilters?: Partial<DirectoryFilters>;
    }
  ) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  notifications: AppNotification[];
  onOpenNotification: (notification: AppNotification) => void;
  onMarkAllNotificationsRead: () => void;
  currentUser: User | null;
  onLogout: () => void;
}

type MegaMenuKey = 'listings' | 'breeds' | 'breeders' | 'services';

interface EditorialTile {
  key: string;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  page: PageView;
  icon: typeof Tag;
  hash?: string;
  listingFilters?: Partial<DirectoryFilters>;
}

interface EditorialMenuConfig {
  key: MegaMenuKey;
  id: string;
  labelAr: string;
  labelEn: string;
  primaryPage: PageView;
  asideTagAr: string;
  asideTagEn: string;
  asideTitleAr: string;
  asideTitleEn: string;
  asideBodyAr: string;
  asideBodyEn: string;
  asideCtaAr: string;
  asideCtaEn: string;
  asideTarget: {
    page: PageView;
    hash?: string;
    listingFilters?: Partial<DirectoryFilters>;
  };
  countTextAr: string;
  countTextEn: string;
  tiles: EditorialTile[];
  secondaryColumnTitleAr?: string;
  secondaryColumnTitleEn?: string;
  secondaryTiles?: EditorialTile[];
  mobileItems?: Array<{
    key: string;
    labelAr: string;
    labelEn: string;
    page: PageView;
    hash?: string;
    listingFilters?: Partial<DirectoryFilters>;
  }>;
}

const MEGA_MENUS: Record<MegaMenuKey, EditorialMenuConfig> = {
  listings: {
    key: 'listings',
    id: 'drop-listings',
    labelAr: 'الإعلانات',
    labelEn: 'Listings',
    primaryPage: 'listings',
    asideTagAr: 'دليل السوق النشط',
    asideTagEn: 'Active Marketplace',
    asideTitleAr: 'ابحث عن المواشي المناسبة في مدينتك',
    asideTitleEn: 'Find verified livestock across Saudi Arabia',
    asideBodyAr:
      'تصفّح حسب الفئة والسلالة والمنطقة والسعر مع مواصفات واضحة للعمر والوزن والتحصين.',
    asideBodyEn:
      'Filter by breed, region, weight, vaccination status, and direct price offers in SAR.',
    asideCtaAr: 'عرض جميع الإعلانات',
    asideCtaEn: 'Browse All Listings',
    asideTarget: { page: 'listings' },
    countTextAr: '05 أقسام',
    countTextEn: '05 Sections',
    tiles: [
      {
        key: 'all-listings',
        titleAr: 'جميع الإعلانات',
        titleEn: 'All Listings',
        descAr: 'كافة العروض المتاحة في المملكة',
        descEn: 'Every active listing nationwide',
        page: 'listings',
        icon: Tag,
      },
      {
        key: 'sheep',
        titleAr: 'الأغنام',
        titleEn: 'Sheep',
        descAr: 'نعيمي ونجدي وحري وسواكني',
        descEn: 'Naimi, Najdi, Harri & Sawakni',
        page: 'listings',
        icon: Award,
        listingFilters: { categoryId: 'cat_sheep' },
      },
      {
        key: 'goats',
        titleAr: 'الماعز',
        titleEn: 'Goats',
        descAr: 'العارضي والبلدي للتربية والولائم',
        descEn: 'Ardhi & local goat listings',
        page: 'listings',
        icon: Sparkles,
        listingFilters: { categoryId: 'cat_goats' },
      },
      {
        key: 'breeding',
        titleAr: 'مواشي التربية والفحول',
        titleEn: 'Breeding & Herd Stock',
        descAr: 'رخال ودفيع وفحول إنتاج مختارة',
        descEn: 'Selected ewes and breeding rams',
        page: 'listings',
        icon: ShieldCheck,
        listingFilters: { categoryId: 'cat_breeding' },
      },
      {
        key: 'camels-cattle',
        titleAr: 'عروض التصفية والقطيع',
        titleEn: 'Verified Breeder Offers',
        descAr: 'عروض من حسابات مربين موثقين',
        descEn: 'Listings from verified Saudi ranches',
        page: 'listings',
        icon: Compass,
        listingFilters: { verifiedOnly: true },
      },
    ],
  },
  breeds: {
    key: 'breeds',
    id: 'drop-breeds',
    labelAr: 'السلالات',
    labelEn: 'Breeds',
    primaryPage: 'breeds',
    asideTagAr: 'موسوعة السلالات',
    asideTagEn: 'Saudi Breeds Hub',
    asideTitleAr: 'السلالات السعودية ومؤشر الأسعار',
    asideTitleEn: 'Saudi Breeds & Seasonal Price Index',
    asideBodyAr:
      'قارن خصائص السلالات المحلية والأوزان الشائعة ومنحنى الأسعار الموسمي بالريال السعودي.',
    asideBodyEn:
      'Compare native breed characteristics, average weights, and 12-month SAR pricing benchmarks.',
    asideCtaAr: 'فتح دليل السلالات',
    asideCtaEn: 'Open Breeds Guide',
    asideTarget: { page: 'breeds' },
    countTextAr: '06 أقسام',
    countTextEn: '06 Sections',
    tiles: [
      {
        key: 'naimi',
        titleAr: 'النعيمي',
        titleEn: 'Naimi Sheep',
        descAr: 'سلالة الولائم الأولى في المملكة',
        descEn: 'Top Saudi breed for feasts & quality',
        page: 'listings',
        icon: Award,
        listingFilters: { breedId: 'brd_naimi' },
      },
      {
        key: 'najdi',
        titleAr: 'النجدي',
        titleEn: 'Najdi Sheep',
        descAr: 'الأصالة النجدية والحجم المميز',
        descEn: 'Heritage Najd breed with high frame',
        page: 'listings',
        icon: Sparkles,
        listingFilters: { breedId: 'brd_najdi' },
      },
      {
        key: 'harri',
        titleAr: 'الحري',
        titleEn: 'Harri Sheep',
        descAr: 'سلالة الحجاز والطائف عالية التصافي',
        descEn: 'Hejaz & Taif high-yield breed',
        page: 'listings',
        icon: Tag,
        listingFilters: { breedId: 'brd_harri' },
      },
      {
        key: 'ardhi',
        titleAr: 'الماعز العارضي',
        titleEn: 'Ardhi Goat',
        descAr: 'مطلوب للتربية والمندي والشواء',
        descEn: 'Prized local goat for breeding & roasting',
        page: 'listings',
        icon: Compass,
        listingFilters: { breedId: 'brd_ardhi' },
      },
      {
        key: 'sawakni',
        titleAr: 'السواكني',
        titleEn: 'Sawakni Sheep',
        descAr: 'خيار اقتصادي متوازن للولائم',
        descEn: 'Balanced value for medium gatherings',
        page: 'listings',
        icon: Package,
        listingFilters: { breedId: 'brd_sawakni' },
      },
      {
        key: 'price-index',
        titleAr: 'مؤشر الأسعار الموسمي',
        titleEn: 'Seasonal Price Index',
        descAr: 'متوسطات السوق بالريال خلال العام',
        descEn: '12-month indicative SAR market curves',
        page: 'breeds',
        icon: TrendingUp,
        hash: 'price-index',
      },
    ],
  },
  breeders: {
    key: 'breeders',
    id: 'drop-breeders',
    labelAr: 'المربون',
    labelEn: 'Breeders',
    primaryPage: 'breeders',
    asideTagAr: 'شركاء الثقة',
    asideTagEn: 'Verified Ranches',
    asideTitleAr: 'تواصل مباشرة مع المربين الموثقين',
    asideTitleEn: 'Connect with Verified Livestock Breeders',
    asideBodyAr:
      'اطّلع على تقييمات المشترين السابقين، سنوات الخبرة، والتخصص في السلالات قبل الاتفاق.',
    asideBodyEn:
      'Review buyer ratings, years of experience, and breed specialties across Saudi regions.',
    asideCtaAr: 'استعراض دليل المربين',
    asideCtaEn: 'View Breeders Directory',
    asideTarget: { page: 'breeders' },
    countTextAr: '03 مسارات',
    countTextEn: '03 Tracks',
    tiles: [
      {
        key: 'breeders-dir',
        titleAr: 'دليل المربين الكامل',
        titleEn: 'All Breeders Directory',
        descAr: 'تصفح المراحات في مناطق المملكة',
        descEn: 'Browse ranch profiles nationwide',
        page: 'breeders',
        icon: Users,
      },
      {
        key: 'breeders-verified',
        titleAr: 'عروض المربين الموثقين',
        titleEn: 'Verified Ranch Listings',
        descAr: 'إعلانات الحسابات الموثقة فقط',
        descEn: 'Listings from verified breeders only',
        page: 'listings',
        icon: ShieldCheck,
        listingFilters: { verifiedOnly: true },
      },
      {
        key: 'guides-link',
        titleAr: 'أدلة المربين والفحص',
        titleEn: 'Breeding & Buying Guides',
        descAr: 'مقالات عملية للعناية والاختيار',
        descEn: 'Practical care and inspection tips',
        page: 'guides',
        icon: BookOpen,
      },
    ],
  },
  services: {
    key: 'services',
    id: 'drop-services',
    labelAr: 'الخدمات',
    labelEn: 'Services',
    primaryPage: 'services',
    asideTagAr: 'منظومة الخدمات الذكية',
    asideTagEn: 'Services & Tools Hub',
    asideTitleAr: 'حاسبات دقيقة وخدمات مساندة متكاملة',
    asideTitleEn: 'Smart Calculators & Support Services',
    asideBodyAr:
      'قدّر الأوزان والولائم وتكلفة النقل والأعلاف، أو اطلب خدمة بيطرية ونقل مجهزة وتعرّف على آلية السوق.',
    asideBodyEn:
      'Estimate meat yield, feast headcount, regional transport, and feed budgets, or access help & rules.',
    asideCtaAr: 'مركز الخدمات والطلبات',
    asideCtaEn: 'Open Services Hub',
    asideTarget: { page: 'services' },
    countTextAr: 'حاسبات + دعم ومعرفة',
    countTextEn: 'Calculators & Support',
    tiles: [
      {
        key: 'feast',
        titleAr: 'حاسبة الولائم الذكية',
        titleEn: 'Feast Calculator',
        descAr: 'تقدير عدد الذبائح والأرز للضيوف',
        descEn: 'Estimate heads & rice by guest count',
        page: 'feast',
        icon: Calculator,
      },
      {
        key: 'weights',
        titleAr: 'حاسبة الأوزان والتصافي',
        titleEn: 'Weights & Yield Calculator',
        descAr: 'تقدير وزن الذبيحة وصافي اللحم',
        descEn: 'Estimate carcass & clean meat yield',
        page: 'weights',
        icon: Scale,
      },
      {
        key: 'transport',
        titleAr: 'حاسبة تكلفة النقل',
        titleEn: 'Transport Cost Estimator',
        descAr: 'تقدير تكلفة الشحن بين المناطق',
        descEn: 'Estimate inter-region delivery cost',
        page: 'transport',
        icon: Truck,
      },
      {
        key: 'feed',
        titleAr: 'مخطط الأعلاف والقطيع',
        titleEn: 'Herd & Feed Planner',
        descAr: 'حساب كميات الشعير والبرسيم والميزانية',
        descEn: 'Estimate barley, hay & monthly cost',
        page: 'feed',
        icon: Wheat,
      },
      {
        key: 'commission',
        titleAr: 'حاسبة العمولة (1%)',
        titleEn: 'Commission Calculator (1%)',
        descAr: 'حساب عمولة الموقع وسداد الحوالة',
        descEn: 'Calculate 1% fee & bank transfer',
        page: 'commission',
        icon: BadgePercent,
      },
      {
        key: 'occasions',
        titleAr: 'اختيار حسب المناسبة',
        titleEn: 'By Occasion',
        descAr: 'ترشيحات العقيقة والزواج والتربية',
        descEn: 'Picks for Aqiqa, weddings & herds',
        page: 'occasions',
        icon: Gift,
      },
    ],
    secondaryColumnTitleAr: 'الخدمات المساندة والمعرفة والدعم',
    secondaryColumnTitleEn: 'Support Services, Guides & Policies',
    secondaryTiles: [
      {
        key: 'services-hub',
        titleAr: 'طلب خدمات مساندة',
        titleEn: 'Request Support Services',
        descAr: 'نقل مواشي، فحص بيطري، وتوريد أعلاف',
        descEn: 'Book transport, vet checkup, or feed supply',
        page: 'services',
        icon: Truck,
      },
      {
        key: 'how',
        titleAr: 'كيف يعمل السوق؟',
        titleEn: 'How It Works',
        descAr: 'خطوات الشراء والبيع الآمن في 4 مراحل',
        descEn: '4-step safe buying & selling workflow',
        page: 'how',
        icon: Compass,
      },
      {
        key: 'guides',
        titleAr: 'مقالات وأدلة المربين',
        titleEn: 'Guides & Articles',
        descAr: 'محتوى إرشادي لاختيار وفحص الحلال',
        descEn: 'Field inspection & seasonal market tips',
        page: 'guides',
        icon: BookOpen,
      },
      {
        key: 'help',
        titleAr: 'مركز المساعدة والأسئلة الشائعة',
        titleEn: 'Help Center & FAQ',
        descAr: 'إجابات وافية لأبرز الاستفسارات',
        descEn: 'Searchable buyer & seller Q&A',
        page: 'help',
        icon: HelpCircle,
      },
      {
        key: 'rules',
        titleAr: 'شروط النشر والسياسات',
        titleEn: 'Listing Rules & Policies',
        descAr: 'معايير قبول الإعلانات والخصوصية',
        descEn: 'Moderation standards, privacy & terms',
        page: 'rules',
        icon: ShieldCheck,
      },
      {
        key: 'about',
        titleAr: 'عن سوق الغنم 2.0',
        titleEn: 'About SouqAlGhanam',
        descAr: 'رؤيتنا لخدمة المربين والمشترين في المملكة',
        descEn: 'Our mission and regional standards',
        page: 'about',
        icon: FileText,
      },
    ],
  },
};

export function Header({
  currentPage,
  activeDashboardTab,
  onNavigate,
  theme,
  onToggleTheme,
  notifications,
  onOpenNotification,
  onMarkAllNotificationsRead,
  currentUser,
  onLogout,
}: HeaderProps) {
  const { lang, dir, setLanguage, t } = useI18n();
  const isEn = lang === 'en';

  const [openMenu, setOpenMenu] = useState<MegaMenuKey | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  const headerRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const notifContainerRef = useRef<HTMLDivElement | null>(null);
  const accountContainerRef = useRef<HTMLDivElement | null>(null);
  const langContainerRef = useRef<HTMLDivElement | null>(null);
  const menuPinnedRef = useRef(false);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const roleNavItems = getRoleAwareNavItems(currentUser?.role ?? null);
  const hasAdminNav = roleNavItems.some((item) => item.dashboardTab === 'admin');
  const userInitial = currentUser?.name?.trim().charAt(0) || '';

  const formatRoleLabel = (role: User['role']) => {
    if (role === 'admin') return t.roleAdmin;
    if (role === 'seller') return t.roleSeller;
    return t.roleBuyer;
  };

  const accountMenuItems: Array<{
    key: string;
    label: string;
    dashboardTab: DashboardTab;
    icon: typeof LayoutDashboard;
  }> = currentUser
    ? [
        {
          key: 'dashboard',
          label: t.menuDashboard,
          dashboardTab: hasAdminNav ? 'admin' : 'analytics',
          icon: LayoutDashboard,
        },
        {
          key: 'profile',
          label: t.menuProfile,
          dashboardTab: 'profile',
          icon: UserIcon,
        },
        ...(currentUser.role === 'seller' || currentUser.role === 'admin'
          ? [
              {
                key: 'my-listings',
                label: t.menuMyListings,
                dashboardTab: 'my-listings' as DashboardTab,
                icon: Package,
              },
            ]
          : []),
        {
          key: 'favorites',
          label: t.menuFavorites,
          dashboardTab: 'favorites',
          icon: Heart,
        },
      ]
    : [];

  const dismissDesktopMenu = () => {
    menuPinnedRef.current = false;
    setOpenMenu(null);
  };

  const closeAll = () => {
    dismissDesktopMenu();
    setMobileOpen(false);
    setSearchOpen(false);
    setNotifOpen(false);
    setAccountOpen(false);
    setLangOpen(false);
  };

  const handleNav = (
    page: PageView,
    options?: {
      authMode?: AuthMode;
      dashboardTab?: DashboardTab;
      hash?: string;
      listingFilters?: Partial<DirectoryFilters>;
    }
  ) => {
    onNavigate(page, options);
    closeAll();
  };

  useEffect(() => {
    if (!currentUser) {
      setNotifOpen(false);
      setAccountOpen(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (searchOpen) {
      window.requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [searchOpen]);

  useEffect(() => {
    const handleDocumentPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (headerRef.current && !headerRef.current.contains(target)) {
        menuPinnedRef.current = false;
        setOpenMenu(null);
        setMobileOpen(false);
        setSearchOpen(false);
        setNotifOpen(false);
        setAccountOpen(false);
        setLangOpen(false);
        return;
      }
      if (notifContainerRef.current && !notifContainerRef.current.contains(target)) {
        setNotifOpen(false);
      }
      if (accountContainerRef.current && !accountContainerRef.current.contains(target)) {
        setAccountOpen(false);
      }
      if (langContainerRef.current && !langContainerRef.current.contains(target)) {
        setLangOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeAll();
      }
    };

    const handleResize = () => {
      if (window.innerWidth > 1080) {
        setMobileOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentPointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('mousedown', handleDocumentPointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const isMenuActive = (key: MegaMenuKey) => {
    if (key === 'listings') return currentPage === 'listings' || currentPage === 'detail';
    if (key === 'breeds') return currentPage === 'breeds';
    if (key === 'breeders') return currentPage === 'breeders' || currentPage === 'seller';
    if (key === 'services') {
      return (
        currentPage === 'services' ||
        currentPage === 'commission' ||
        currentPage === 'weights' ||
        currentPage === 'feast' ||
        currentPage === 'transport' ||
        currentPage === 'feed' ||
        currentPage === 'occasions' ||
        currentPage === 'how' ||
        currentPage === 'guides' ||
        currentPage === 'help' ||
        currentPage === 'about' ||
        currentPage === 'rules' ||
        currentPage === 'privacy' ||
        currentPage === 'terms'
      );
    }
    return false;
  };

  const handleDesktopMenuHover = (key: MegaMenuKey) => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover) and (min-width: 1081px)').matches
    ) {
      if (menuPinnedRef.current && openMenu === key) return;
      menuPinnedRef.current = false;
      setOpenMenu(key);
      setNotifOpen(false);
      setAccountOpen(false);
      setLangOpen(false);
    }
  };

  const handleDesktopMenuClick = (key: MegaMenuKey) => {
    setSearchOpen(false);
    setNotifOpen(false);
    setAccountOpen(false);
    setLangOpen(false);
    const shouldClose = openMenu === key && menuPinnedRef.current;
    menuPinnedRef.current = !shouldClose;
    setOpenMenu(shouldClose ? null : key);
  };

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = searchQuery.trim();
    handleNav('listings', {
      listingFilters: trimmed ? { q: trimmed } : undefined,
    });
    setSearchQuery('');
  };

  const renderMegaMenu = (menu: EditorialMenuConfig) => {
    const isOpen = openMenu === menu.key;
    const isActive = isMenuActive(menu.key);
    return (
      <div
        key={menu.key}
        className={`souq-nav-item ${isOpen ? 'open' : ''}`}
        onMouseEnter={() => handleDesktopMenuHover(menu.key)}
        onMouseLeave={() => {
          if (menuPinnedRef.current) return;
          setOpenMenu((prev) => (prev === menu.key ? null : prev));
        }}
      >
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={menu.id}
          onClick={() => handleDesktopMenuClick(menu.key)}
          className={`souq-nav-link ${isActive ? 'active' : ''}`}
        >
          <span>{isEn ? menu.labelEn : menu.labelAr}</span>
          <ChevronDown className="souq-chevron" size={13} aria-hidden="true" />
        </button>

        <div className="souq-editorial-menu" id={menu.id}>
          <div className="souq-editorial-shell">
            <div className="souq-editorial-aside">
              <div className="souq-aside-top">
                <span>{isEn ? menu.asideTagEn : menu.asideTagAr}</span>
              </div>
              <h2>{isEn ? menu.asideTitleEn : menu.asideTitleAr}</h2>
              <p>{isEn ? menu.asideBodyEn : menu.asideBodyAr}</p>
              <button
                type="button"
                className="souq-aside-action"
                onClick={() =>
                  handleNav(menu.asideTarget.page, {
                    hash: menu.asideTarget.hash,
                    listingFilters: menu.asideTarget.listingFilters,
                  })
                }
              >
                {isEn ? menu.asideCtaEn : menu.asideCtaAr}
                <span aria-hidden="true">↗</span>
              </button>
            </div>

            <div className="souq-editorial-content">
              <div className="souq-editorial-top">
                <span>{isEn ? 'Explore Sections' : 'استكشف الأقسام'}</span>
                <span className="souq-editorial-count">
                  {isEn ? menu.countTextEn : menu.countTextAr}
                </span>
              </div>

              {menu.secondaryTiles && menu.secondaryTiles.length > 0 ? (
                <div className="souq-services-mega-columns">
                  <div>
                    <p className="souq-services-col-title">{t.toolsColTitle}</p>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                      {menu.tiles.map((tile) => {
                        const TileIcon = tile.icon;
                        return (
                          <button
                            key={tile.key}
                            type="button"
                            className="souq-editorial-tile"
                            onClick={() =>
                              handleNav(tile.page, {
                                hash: tile.hash,
                                listingFilters: tile.listingFilters,
                              })
                            }
                          >
                            <span className="souq-tile-icon" aria-hidden="true">
                              <TileIcon size={15} />
                            </span>
                            <span className="souq-tile-copy">
                              <strong>{isEn ? tile.titleEn : tile.titleAr}</strong>
                              <small>{isEn ? tile.descEn : tile.descAr}</small>
                            </span>
                            <span className="souq-tile-arrow" aria-hidden="true">
                              ↗
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="souq-services-col-title">
                      {isEn ? menu.secondaryColumnTitleEn : menu.secondaryColumnTitleAr}
                    </p>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                      {menu.secondaryTiles.map((tile) => {
                        const TileIcon = tile.icon;
                        return (
                          <button
                            key={tile.key}
                            type="button"
                            className="souq-editorial-tile"
                            onClick={() =>
                              handleNav(tile.page, {
                                hash: tile.hash,
                                listingFilters: tile.listingFilters,
                              })
                            }
                          >
                            <span className="souq-tile-icon" aria-hidden="true">
                              <TileIcon size={15} />
                            </span>
                            <span className="souq-tile-copy">
                              <strong>{isEn ? tile.titleEn : tile.titleAr}</strong>
                              <small>{isEn ? tile.descEn : tile.descAr}</small>
                            </span>
                            <span className="souq-tile-arrow" aria-hidden="true">
                              ↗
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className={`souq-editorial-grid ${
                    menu.tiles.length === 3 ? 'cols-3' : 'grid-cols-3'
                  }`}
                >
                  {menu.tiles.map((tile) => {
                    const TileIcon = tile.icon;
                    return (
                      <button
                        key={tile.key}
                        type="button"
                        className="souq-editorial-tile"
                        onClick={() =>
                          handleNav(tile.page, {
                            hash: tile.hash,
                            listingFilters: tile.listingFilters,
                          })
                        }
                      >
                        <span className="souq-tile-icon" aria-hidden="true">
                          <TileIcon size={15} />
                        </span>
                        <span className="souq-tile-copy">
                          <strong>{isEn ? tile.titleEn : tile.titleAr}</strong>
                          <small>{isEn ? tile.descEn : tile.descAr}</small>
                        </span>
                        <span className="souq-tile-arrow" aria-hidden="true">
                          ↗
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="souq-editorial-bottom">
                <span className="souq-bottom-line" />
                <span>
                  {isEn
                    ? 'Souq Al-Ghanam 2.0 • Trusted Saudi Livestock Marketplace'
                    : 'سوق الغنم 2.0 • منصة سعودية منظمة لتجارة المواشي'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="souq-announcement" dir={dir}>
        {isEn ? (
          <>
            Souq Al-Ghanam 2.0 <b>—</b> Direct breeder-to-buyer Saudi livestock marketplace in SAR
          </>
        ) : (
          <>
            سوق الغنم 2.0 <b>—</b> المنصة السعودية المتخصصة لربط المربّين والمشترين مباشرة
          </>
        )}
      </div>

      <header
        ref={headerRef}
        id="header"
        dir={dir}
        className="souq-header"
        onMouseLeave={() => {
          if (menuPinnedRef.current) return;
          dismissDesktopMenu();
        }}
      >
        <div className="souq-header-inner">
          {/* Compact Saudi Heritage Brand Area */}
          <button
            type="button"
            className="souq-brand"
            aria-label={isEn ? 'Souq Al-Ghanam - Home' : 'سوق الغنم - الرئيسية'}
            onClick={() => handleNav('home')}
          >
            <span className="souq-mark" aria-hidden="true">
              <svg
                viewBox="0 0 48 48"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M13 21c-4-8 3-13 8-10 2-4 8-4 10 0 6-3 12 3 8 10 4 5 0 13-6 13H16c-7 0-11-8-3-13Z" />
                <path d="M17 34v6m14-6v6M16 23l-5 4m22-4 5 4M20 20h.1M29 20h.1M22 26q2 3 4 0" />
              </svg>
            </span>
            <span>
              <span className="souq-brand-title">{t.brandName}</span>
              <span className="block souq-brand-caption">{t.brandSubtitle}</span>
            </span>
          </button>

          {/* 7-Item Main Desktop Navigation in Requested Order */}
          <nav className="souq-desktop-nav" aria-label={t.navAriaLabel}>
            {/* 1. الرئيسية */}
            <button
              type="button"
              onClick={() => handleNav('home')}
              aria-current={currentPage === 'home' ? 'page' : undefined}
              className={`souq-nav-link ${currentPage === 'home' ? 'active' : ''}`}
            >
              {t.navHome}
            </button>

            {/* 2. الإعلانات */}
            {renderMegaMenu(MEGA_MENUS.listings)}

            {/* 3. السلالات */}
            {renderMegaMenu(MEGA_MENUS.breeds)}

            {/* 4. المربون */}
            {renderMegaMenu(MEGA_MENUS.breeders)}

            {/* 5. الباقات والأسعار */}
            <button
              type="button"
              onClick={() => handleNav('pricing')}
              aria-current={currentPage === 'pricing' ? 'page' : undefined}
              className={`souq-nav-link ${currentPage === 'pricing' ? 'active' : ''}`}
            >
              {t.navPricing}
            </button>

            {/* 6. الخدمات */}
            {renderMegaMenu(MEGA_MENUS.services)}

            {/* 7. تواصل معنا (clearly visible main nav link) */}
            <button
              type="button"
              onClick={() => handleNav('contact')}
              aria-current={currentPage === 'contact' ? 'page' : undefined}
              className={`souq-nav-link ${currentPage === 'contact' ? 'active' : ''}`}
            >
              {t.navContact}
            </button>
          </nav>

          {/* Right/End Utility Controls & Auth Actions */}
          <div className="souq-actions">
            <button
              type="button"
              id="searchToggle"
              className="souq-icon-btn"
              aria-label={isEn ? 'Search' : 'البحث'}
              aria-expanded={searchOpen}
              aria-controls="searchOverlay"
              onClick={() => {
                dismissDesktopMenu();
                setMobileOpen(false);
                setNotifOpen(false);
                setAccountOpen(false);
                setLangOpen(false);
                setSearchOpen((prev) => !prev);
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <circle cx="10.8" cy="10.8" r="6.6" />
                <path d="m16 16 4.5 4.5" />
              </svg>
            </button>

            <button
              type="button"
              id="themeToggle"
              className="souq-icon-btn"
              aria-label={theme === 'dark' ? t.themeLight : t.themeDark}
              title={theme === 'dark' ? t.themeLight : t.themeDark}
              aria-pressed={theme === 'dark'}
              onClick={onToggleTheme}
            >
              {theme === 'dark' ? (
                <Sun size={17} style={{ color: 'var(--nav-gold)' }} aria-hidden="true" />
              ) : (
                <Moon size={17} aria-hidden="true" />
              )}
            </button>

            {/* Compact Globe + Chevron Language Dropdown */}
            <div className="relative" ref={langContainerRef}>
              <button
                type="button"
                id="languageToggle"
                className="souq-lang-trigger"
                aria-label={t.langMenuLabel}
                aria-expanded={langOpen}
                aria-haspopup="menu"
                onClick={() => {
                  dismissDesktopMenu();
                  setSearchOpen(false);
                  setNotifOpen(false);
                  setAccountOpen(false);
                  setLangOpen((prev) => !prev);
                }}
              >
                <Globe size={16} aria-hidden="true" />
                <ChevronDown
                  size={13}
                  className={`transition-transform duration-150 ${langOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>

              {langOpen && (
                <div
                  role="menu"
                  aria-label={t.langMenuLabel}
                  className="header-dropdown-enter absolute end-0 top-full mt-2 w-40 rounded-xl bg-[var(--nav-surface)] border border-[var(--nav-border)] shadow-[0_18px_40px_rgba(0,0,0,0.24)] p-1.5 z-50 space-y-0.5 text-[var(--nav-text)]"
                >
                  {LANGUAGE_OPTIONS.map((opt) => {
                    const active = lang === opt.code;
                    return (
                      <button
                        key={opt.code}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        onClick={() => {
                          setLanguage(opt.code);
                          setLangOpen(false);
                        }}
                        className={`w-full text-start px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          active
                            ? 'bg-[var(--nav-hover)] text-[var(--nav-gold)] font-bold'
                            : 'hover:bg-[var(--nav-hover)]'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {active && <Check size={14} aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {currentUser && (
              <div className="relative" ref={notifContainerRef}>
                <button
                  type="button"
                  onClick={() => {
                    dismissDesktopMenu();
                    setSearchOpen(false);
                    setAccountOpen(false);
                    setLangOpen(false);
                    setNotifOpen((prev) => !prev);
                  }}
                  aria-label={`${t.notificationsTitle}${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
                  aria-expanded={notifOpen}
                  aria-haspopup="true"
                  className="souq-icon-btn"
                >
                  {unreadCount > 0 ? (
                    <BellRing size={17} style={{ color: 'var(--nav-gold)' }} aria-hidden="true" />
                  ) : (
                    <Bell size={17} aria-hidden="true" />
                  )}
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -end-1 min-w-[17px] h-[17px] px-1 rounded-full bg-[var(--nav-gold)] text-[#15251c] text-[10px] font-bold tabular-nums flex items-center justify-center">
                      {unreadCount > 9 ? '+9' : unreadCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div
                    role="region"
                    aria-label={t.notificationsTitle}
                    className="fixed inset-x-3 top-[82px] w-auto sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:mt-2 sm:w-96 max-w-[calc(100vw-1.5rem)] bg-[var(--color-surface-warm)] rounded-xl border border-[var(--color-border)] shadow-[0_18px_42px_-10px_rgba(0,0,0,0.28)] overflow-hidden z-50 text-[var(--color-ink)]"
                  >
                    <div className="px-4 py-3 bg-[var(--color-cream)]/60 border-b border-[var(--color-border)] flex items-center justify-between gap-2">
                      <span className="font-display text-sm font-bold text-[var(--color-ink)]">
                        {t.notificationsTitle} ({notifications.length})
                      </span>
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={onMarkAllNotificationsRead}
                          className="text-xs font-semibold text-[var(--color-green-ink)] hover:underline cursor-pointer"
                        >
                          {t.markAllRead}
                        </button>
                      )}
                    </div>

                    <div className="max-h-[70vh] sm:max-h-96 overflow-y-auto divide-y divide-[var(--color-border)]">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center space-y-2">
                          <div className="w-10 h-10 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)] text-[var(--color-muted)] flex items-center justify-center mx-auto">
                            <Bell size={18} aria-hidden="true" />
                          </div>
                          <p className="text-xs text-[var(--color-muted)] leading-relaxed">
                            {t.notificationsEmpty}
                          </p>
                        </div>
                      ) : (
                        notifications.slice(0, 12).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              onOpenNotification(item);
                              setNotifOpen(false);
                            }}
                            className={`w-full text-start p-3.5 transition-colors flex items-start gap-3 cursor-pointer ${
                              item.read
                                ? 'bg-[var(--color-surface)] hover:bg-[var(--color-cream)]/50'
                                : 'bg-[var(--color-cream)] hover:bg-[var(--color-cream-hover)]'
                            }`}
                          >
                            <div className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center mt-0.5 shrink-0">
                              {item.type === 'offer_accepted' ||
                              item.type === 'listing_approved' ||
                              item.type === 'commission_approved' ? (
                                <CheckCircle2
                                  size={16}
                                  className="text-[var(--color-green-ink)]"
                                  aria-hidden="true"
                                />
                              ) : item.type === 'featured_approved' ? (
                                <Sparkles
                                  size={16}
                                  className="text-[var(--color-gold)]"
                                  aria-hidden="true"
                                />
                              ) : item.type === 'commission_due' ||
                                item.type === 'commission_submitted' ? (
                                <BadgePercent
                                  size={16}
                                  className="text-[var(--color-green-ink)]"
                                  aria-hidden="true"
                                />
                              ) : item.type === 'offer_rejected' ||
                                item.type === 'listing_rejected' ||
                                item.type === 'commission_rejected' ? (
                                <XCircle
                                  size={16}
                                  className="text-red-700 dark:text-red-400"
                                  aria-hidden="true"
                                />
                              ) : item.type === 'seller_verified' ? (
                                <ShieldCheck
                                  size={16}
                                  className="text-[var(--color-green-ink)]"
                                  aria-hidden="true"
                                />
                              ) : item.type === 'seller_verification_rejected' ? (
                                <ShieldAlert
                                  size={16}
                                  className="text-red-700 dark:text-red-400"
                                  aria-hidden="true"
                                />
                              ) : item.type === 'new_comment' ||
                                item.type === 'comment_reply' ? (
                                <MessageCircle
                                  size={16}
                                  className="text-[var(--color-green-ink)]"
                                  aria-hidden="true"
                                />
                              ) : item.type === 'listing_liked' ? (
                                <ThumbsUp
                                  size={16}
                                  className="text-[var(--color-gold)]"
                                  aria-hidden="true"
                                />
                              ) : (
                                <MessageSquare
                                  size={16}
                                  className="text-[var(--color-gold)]"
                                  aria-hidden="true"
                                />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-bold text-[var(--color-ink)] truncate">
                                  {item.title}
                                </p>
                                {!item.read && (
                                  <span className="px-1.5 py-0.5 rounded bg-[var(--color-gold-soft)] text-[var(--color-ink)] text-[10px] font-bold shrink-0">
                                    {t.newBadge}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-[var(--color-muted)] mt-1 line-clamp-2 leading-relaxed">
                                {item.body}
                              </p>
                              <p className="text-[11px] text-[var(--color-muted)]/80 mt-1 tabular-nums">
                                {formatRelativeArabicTime(item.createdAt, undefined, lang)}
                              </p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <span className="souq-separator" aria-hidden="true" />

            {currentUser ? (
              <div className="relative souq-login-wrap" ref={accountContainerRef}>
                <button
                  type="button"
                  onClick={() => {
                    dismissDesktopMenu();
                    setSearchOpen(false);
                    setNotifOpen(false);
                    setLangOpen(false);
                    setAccountOpen((prev) => !prev);
                  }}
                  aria-label={`${t.myAccount}: ${currentUser.name}`}
                  aria-expanded={accountOpen}
                  aria-haspopup="menu"
                  title={`${currentUser.name} — ${formatRoleLabel(currentUser.role)}`}
                  className="souq-login"
                >
                  <span
                    aria-hidden="true"
                    className="w-6 h-6 rounded-full bg-[var(--nav-gold)]/20 text-[var(--nav-gold)] text-[11px] font-bold flex items-center justify-center shrink-0"
                  >
                    {userInitial || <UserIcon size={13} />}
                  </span>
                  <span>{t.myAccount}</span>
                  <ChevronDown size={13} aria-hidden="true" />
                </button>

                {accountOpen && (
                  <div
                    role="menu"
                    aria-label={t.myAccount}
                    className="header-dropdown-enter absolute end-0 top-full mt-2 w-60 rounded-xl bg-[var(--nav-surface)] border border-[var(--nav-border)] shadow-[0_18px_40px_rgba(0,0,0,0.28)] p-1.5 z-50 space-y-0.5 text-[var(--nav-text)]"
                  >
                    <div className="px-3 py-2 border-b border-[var(--nav-border)] mb-1">
                      <p className="text-xs font-bold truncate">{currentUser.name}</p>
                      <p className="text-[11px] text-[var(--nav-muted)] mt-0.5">
                        {formatRoleLabel(currentUser.role)}
                      </p>
                    </div>

                    {accountMenuItems.map((item) => {
                      const Icon = item.icon;
                      const active =
                        currentPage === 'dashboard' && activeDashboardTab === item.dashboardTab;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          role="menuitem"
                          onClick={() =>
                            handleNav('dashboard', { dashboardTab: item.dashboardTab })
                          }
                          className={`w-full text-start px-3 py-2 rounded-lg text-[13px] font-medium flex items-center gap-2.5 transition-colors cursor-pointer ${
                            active
                              ? 'bg-[var(--nav-hover)] text-[var(--nav-gold)] font-semibold'
                              : 'hover:bg-[var(--nav-hover)]'
                          }`}
                        >
                          <Icon
                            size={14}
                            style={{ color: 'var(--nav-gold)' }}
                            className="shrink-0"
                            aria-hidden="true"
                          />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}

                    <div className="pt-1 mt-1 border-t border-[var(--nav-border)]">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onLogout();
                          closeAll();
                        }}
                        className="w-full text-start px-3 py-2 rounded-lg text-[13px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <LogOut size={14} className="shrink-0" aria-hidden="true" />
                        <span>{t.menuLogout}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="souq-login-wrap">
                <button
                  type="button"
                  className="souq-login"
                  onClick={() => handleNav('login', { authMode: 'login' })}
                >
                  {t.signIn}
                </button>
              </div>
            )}

            <button
              type="button"
              className="souq-post"
              onClick={() => handleNav('add')}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.3"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              {t.addListing}
            </button>

            <button
              type="button"
              id="mobileToggle"
              className="souq-icon-btn souq-mobile-toggle"
              aria-label={mobileOpen ? t.mobileMenuClose : t.mobileMenuOpen}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-drawer"
              onClick={() => {
                dismissDesktopMenu();
                setSearchOpen(false);
                setNotifOpen(false);
                setAccountOpen(false);
                setLangOpen(false);
                setMobileOpen((prev) => !prev);
              }}
            >
              {mobileOpen ? (
                <X size={18} aria-hidden="true" />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Search Overlay */}
        <div className={`souq-search-overlay ${searchOpen ? 'open' : ''}`} id="searchOverlay">
          <form className="souq-search-form" onSubmit={handleSearchSubmit}>
            <input
              ref={searchInputRef}
              name="q"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={isEn ? 'Search for a listing' : 'ابحث عن إعلان'}
              placeholder={
                isEn
                  ? 'Search by breed, city, or listing...'
                  : 'ابحث عن سلالة أو مدينة أو إعلان...'
              }
              required
            />
            <button type="submit">{isEn ? 'Search' : 'بحث'}</button>
          </form>
        </div>

        {/* Mobile Drawer Panel (Zero horizontal overflow, ordered 1..7) */}
        <nav
          id="mobile-nav-drawer"
          className={`souq-mobile-panel ${mobileOpen ? 'open' : ''}`}
          aria-label={isEn ? 'Mobile navigation' : 'القائمة على الجوال'}
        >
          <button
            type="button"
            className="souq-mobile-link"
            onClick={() => handleNav('home')}
          >
            {t.navHome}
          </button>

          {(['listings', 'breeds', 'breeders'] as MegaMenuKey[]).map((menuKey) => {
            const menu = MEGA_MENUS[menuKey];
            const subItems =
              menu.mobileItems ??
              menu.tiles.map((tile) => ({
                key: tile.key,
                labelAr: tile.titleAr,
                labelEn: tile.titleEn,
                page: tile.page,
                hash: tile.hash,
                listingFilters: tile.listingFilters,
              }));

            return (
              <details key={menu.key} className="souq-mobile-details">
                <summary className="souq-mobile-summary">
                  <span>{isEn ? menu.labelEn : menu.labelAr}</span>
                  <ChevronDown size={14} aria-hidden="true" />
                </summary>
                <div className="souq-mobile-sub">
                  {subItems.map((sub) => (
                    <button
                      key={sub.key}
                      type="button"
                      onClick={() =>
                        handleNav(sub.page, {
                          hash: sub.hash,
                          listingFilters: sub.listingFilters,
                        })
                      }
                    >
                      {isEn ? sub.labelEn : sub.labelAr}
                    </button>
                  ))}
                </div>
              </details>
            );
          })}

          <button
            type="button"
            className="souq-mobile-link"
            onClick={() => handleNav('pricing')}
          >
            {t.navPricing}
          </button>

          <details className="souq-mobile-details">
            <summary className="souq-mobile-summary">
              <span>{t.navServices}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </summary>
            <div className="souq-mobile-sub">
              {[...MEGA_MENUS.services.tiles, ...(MEGA_MENUS.services.secondaryTiles || [])].map(
                (sub) => (
                  <button
                    key={sub.key}
                    type="button"
                    onClick={() =>
                      handleNav(sub.page, {
                        hash: sub.hash,
                        listingFilters: sub.listingFilters,
                      })
                    }
                  >
                    {isEn ? sub.titleEn : sub.titleAr}
                  </button>
                )
              )}
            </div>
          </details>

          <button
            type="button"
            className="souq-mobile-link"
            onClick={() => handleNav('contact')}
          >
            {t.navContact}
          </button>

          <div className="souq-mobile-actions">
            {currentUser ? (
              <button
                type="button"
                onClick={() =>
                  handleNav('dashboard', {
                    dashboardTab: hasAdminNav ? 'admin' : 'analytics',
                  })
                }
              >
                {t.myAccount}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleNav('login', { authMode: 'login' })}
              >
                {t.signIn}
              </button>
            )}
            <button
              type="button"
              className="souq-post"
              onClick={() => handleNav('add')}
            >
              {isEn ? '+ Post Listing' : '+ أضف إعلانك'}
            </button>
          </div>

          {currentUser && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => {
                  onLogout();
                  closeAll();
                }}
                className="w-full py-2.5 rounded-xl border border-red-400/30 text-red-500 text-xs font-bold cursor-pointer"
              >
                {t.menuLogout}
              </button>
            </div>
          )}
        </nav>
      </header>
    </>
  );
}
