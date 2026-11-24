import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BadgePercent,
  Bell,
  Building2,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  BarChart3,
  Heart,
  Link2,
  LogOut,
  Menu,
  Loader2,
  Lock,
  MessageCircle,
  MessageSquare,
  PackageOpen,
  Pencil,
  Phone,
  Plus,
  Search,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  User as UserIcon,
  X,
  XCircle,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import type {
  CommissionEligibility,
  CommissionRecord,
  CommissionSettings,
} from '../lib/commission';
import { formatIbanSpaced, getCommissionStatusMeta } from '../lib/commission';
import type {
  AppNotification,
  AuditLog,
  Breed,
  Category,
  Conversation,
  FacebookAuthConfig,
  GoogleAuthConfig,
  Listing,
  PriceOffer,
  Region,
  SellerProfile,
  SellerVerificationState,
  User,
} from '../types/marketplace';
import { api } from '../lib/api';
import { normalizeSaudiMobileClient } from '../lib/auth-validation';
import { openFacebookOAuthPopup } from '../lib/facebook-auth';
import {
  promptGoogleOneTap,
  renderGoogleOfficialButton,
} from '../lib/google-auth';
import { formatPriceSar, formatRelativeArabicTime, formatStatusLabel } from '../lib/format';
import { scopeAnalyticsDataset } from '../lib/analytics';
import { copyTextWithFallback } from '../lib/share';
import { ListingCard } from './ListingCard';
import { MarkSoldModal } from './MarkSoldModal';
import { Modal } from './Modal';
import { SafeImage } from './SafeImage';
import { VerifiedSellerBadge } from './VerifiedSellerBadge';

// Recharts & AdminDashboardPanel are loaded on demand so buyers/sellers do not pay for chart or admin code upfront.
const DashboardAnalytics = lazy(() =>
  import('./DashboardAnalytics').then((m) => ({ default: m.DashboardAnalytics })),
);
const AdminDashboardPanel = lazy(() =>
  import('./AdminDashboardPanel').then((m) => ({ default: m.AdminDashboardPanel })),
);

export type DashboardTab =
  | 'my-listings'
  | 'profile'
  | 'favorites'
  | 'likes'
  | 'messages'
  | 'subscription'
  | 'settings'
  | 'notifications'
  | 'analytics'
  | 'admin';

interface DashboardViewProps {
  requestedTab?: DashboardTab | null;
  requestedConvId?: string | null;
  onClearNavigationHint?: () => void;
  onTabChange?: (
    tab: DashboardTab,
    options?: { replace?: boolean; conversationId?: string | null }
  ) => void;
  currentUser: User;
  googleAuth?: GoogleAuthConfig;
  facebookAuth?: FacebookAuthConfig;
  allListings: Listing[];
  categories: Category[];
  breeds: Breed[];
  regions: Region[];
  sellers: SellerProfile[];
  favoriteIds: string[];
  likedListingIds: string[];
  conversations: Conversation[];
  priceOffers: PriceOffer[];
  auditLogs: AuditLog[];
  onLogout: () => Promise<void>;
  onSelectListing: (listing: Listing) => void;
  onSelectSeller?: (sellerId: string) => void;
  onBrowseListings?: () => void;
  onOpenPricing?: () => void;
  onAddListing?: () => void;
  onGoHome?: () => void;
  onEditListing: (listing: Listing) => void;
  onToggleFavorite: (listingId: string) => void;
  onToggleLike: (listingId: string) => void;
  onMarkSold: (listingId: string) => Promise<void>;
  onSendMessage: (conversationId: string, body: string) => Promise<void>;
  onMarkConversationRead?: (conversationId: string) => Promise<void> | void;
  onRespondToOffer: (offerId: string, status: 'accepted' | 'rejected') => Promise<void>;
  onApproveListing: (listingId: string) => Promise<void>;
  onRejectListing: (listingId: string, reason: string) => Promise<void>;
  onCreateBreed: (payload: {
    name: string;
    categoryId: string;
    origin: string;
    summary: string;
    avgWeightKg: string;
    priceRangeSar: string;
  }) => Promise<void>;
  onCreateSubCategory: (payload: {
    name: string;
    parentId: string;
    description: string;
    keywords: string;
  }) => Promise<void>;
  onUpdateSubCategory: (
    id: string,
    payload: {
      name: string;
      parentId: string;
      description: string;
      keywords: string;
    }
  ) => Promise<void>;
  onDeleteSubCategory: (id: string) => Promise<void>;
  onAutoCategorizeListings: (payload?: { listingId?: string; subCategoryId?: string }) => Promise<void>;
  onRefreshData?: () => Promise<void>;
  onNotify?: (message: string) => void;
  notifications?: AppNotification[];
  onOpenNotification?: (item: AppNotification) => void;
  onMarkAllNotificationsRead?: () => void;
  commissionSettings?: CommissionSettings | null;
  commissionEligibility?: CommissionEligibility | null;
  myCommissionRecords?: CommissionRecord[];
}

function getListingStatusBadge(status: Listing['status']) {
  if (status === 'Published') {
    return {
      label: formatStatusLabel(status),
      cls: 'bg-[var(--color-green)]/10 text-[var(--color-green-ink)] border-[var(--color-green-ink)]/25',
      Icon: CheckCircle2,
    };
  }
  if (status === 'Pending') {
    return {
      label: formatStatusLabel(status),
      cls: 'bg-[var(--color-gold-soft)] text-[var(--color-ink)] border-[var(--color-gold)]/35',
      Icon: Clock,
    };
  }
  if (status === 'Rejected') {
    return {
      label: formatStatusLabel(status),
      cls: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/60',
      Icon: XCircle,
    };
  }
  return {
    label: formatStatusLabel(status),
    cls: 'bg-[var(--color-cream)] text-[var(--color-muted)] border-[var(--color-border)]',
    Icon: CheckCircle2,
  };
}

function AnalyticsFallback() {
  return (
    <div className="py-16 text-center" role="status" aria-live="polite">
      <p className="text-sm text-[var(--color-muted)]">جاري تحميل الرسوم البيانية...</p>
    </div>
  );
}

function AdminPanelFallback() {
  return (
    <div className="py-16 text-center" role="status" aria-live="polite">
      <p className="text-sm text-[var(--color-muted)]">جاري تحميل لوحة الإدارة...</p>
    </div>
  );
}

function DashboardShellIcon({ id }: { id: DashboardTab }) {
  const props = { size: 16, 'aria-hidden': true as const };
  if (id === 'profile') return <UserIcon {...props} />;
  if (id === 'favorites') return <Heart {...props} />;
  if (id === 'likes') return <ThumbsUp {...props} />;
  if (id === 'messages') return <MessageSquare {...props} />;
  if (id === 'subscription') return <CreditCard {...props} />;
  if (id === 'settings') return <Settings {...props} />;
  if (id === 'notifications') return <Bell {...props} />;
  if (id === 'analytics') return <BarChart3 {...props} />;
  if (id === 'admin') return <ShieldCheck {...props} />;
  return <PackageOpen {...props} />;
}

export function DashboardView({
  requestedTab,
  requestedConvId,
  onClearNavigationHint,
  onTabChange,
  currentUser,
  googleAuth,
  facebookAuth,
  allListings,
  categories,
  breeds,
  regions,
  sellers,
  favoriteIds,
  likedListingIds,
  conversations,
  priceOffers,
  auditLogs,
  onLogout,
  onSelectListing,
  onSelectSeller,
  onBrowseListings,
  onOpenPricing,
  onAddListing,
  onGoHome,
  onEditListing,
  onToggleFavorite,
  onToggleLike,
  onMarkSold,
  onSendMessage,
  onMarkConversationRead,
  onRespondToOffer,
  onApproveListing,
  onRejectListing,
  onCreateBreed,
  onCreateSubCategory,
  onUpdateSubCategory,
  onDeleteSubCategory,
  onAutoCategorizeListings,
  onRefreshData,
  onNotify,
  notifications = [],
  onOpenNotification,
  onMarkAllNotificationsRead,
  commissionSettings = null,
  commissionEligibility = null,
  myCommissionRecords = [],
}: DashboardViewProps) {
  const { t } = useI18n();
  const resolveAllowedTab = useCallback(
    (tab: DashboardTab | null | undefined): DashboardTab => {
      if (tab === 'admin' && currentUser.role !== 'admin') {
        return 'my-listings';
      }
      return tab || (currentUser.role === 'admin' ? 'admin' : 'my-listings');
    },
    [currentUser.role]
  );

  const [activeTab, setActiveTab] = useState<DashboardTab>(() => resolveAllowedTab(requestedTab));
  const [selectedConvId, setSelectedConvId] = useState<string>(
    requestedConvId || conversations[0]?.id || ''
  );
  const [mobileThreadOpen, setMobileThreadOpen] = useState<boolean>(() => Boolean(requestedConvId));
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const [isDesktopViewport, setIsDesktopViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 1024px)').matches
      : true
  );

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const lastMarkedReadKeyRef = useRef<string>('');

  const [myVerification, setMyVerification] = useState<SellerVerificationState | null>(null);
  const [requestingVerification, setRequestingVerification] = useState(false);

  const [completionPhone, setCompletionPhone] = useState('');
  const [completionName, setCompletionName] = useState(currentUser.name);
  const [completionBusy, setCompletionBusy] = useState(false);
  const [completionError, setCompletionError] = useState('');

  const [linkGoogleOpen, setLinkGoogleOpen] = useState(false);
  const [linkCurrentPassword, setLinkCurrentPassword] = useState('');
  const [linkGoogleBusy, setLinkGoogleBusy] = useState(false);
  const [linkGoogleError, setLinkGoogleError] = useState('');
  const [showLinkGisButton, setShowLinkGisButton] = useState(false);
  const linkGisContainerRef = useRef<HTMLDivElement | null>(null);

  // Account Settings & Facebook linking state
  const [settingsName, setSettingsName] = useState(currentUser.name);
  const [settingsPhone, setSettingsPhone] = useState(currentUser.phone || '');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [fbLinkPassword, setFbLinkPassword] = useState('');
  const [fbLinkBusy, setFbLinkBusy] = useState(false);
  const [fbLinkError, setFbLinkError] = useState('');
  const [logoutAllBusy, setLogoutAllBusy] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread'>('all');

  const [markSoldListing, setMarkSoldListing] = useState<Listing | null>(null);
  const [featuringListingId, setFeaturingListingId] = useState<string | null>(null);
  const [transferRecord, setTransferRecord] = useState<CommissionRecord | null>(null);
  const [transferReference, setTransferReference] = useState('');
  const [transferPayerName, setTransferPayerName] = useState('');
  const [transferAmountInput, setTransferAmountInput] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [copiedIban, setCopiedIban] = useState(false);

  const unreadNotificationsCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktopViewport(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  useEffect(() => {
    if (!navOpen || isDesktopViewport) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [navOpen, isDesktopViewport]);

  const loadMyVerification = useCallback(async () => {
    try {
      const res = await api.getMySellerVerification();
      setMyVerification(res.seller);
    } catch {
      // Ignore silent check failure
    }
  }, []);

  useEffect(() => {
    loadMyVerification();
  }, [loadMyVerification, currentUser.id]);

  const handleRequestVerification = async () => {
    setRequestingVerification(true);
    try {
      const res = await api.requestSellerVerification();
      setMyVerification(res.seller);
      onNotify?.('تم إرسال طلب توثيق المربي لمراجعة الإدارة');
      await onRefreshData?.();
    } catch (err: any) {
      onNotify?.(err?.message || 'تعذر إرسال طلب التوثيق');
    } finally {
      setRequestingVerification(false);
    }
  };

  const handleRequestFeaturedListing = async (item: Listing) => {
    if (featuringListingId) return;
    setFeaturingListingId(item.id);
    try {
      await api.requestListingFeatured(item.id);
      onNotify?.('تم تسجيل طلب تمييز الإعلان؛ يمكنك تأكيد الحوالة من سجل العمولة أدناه');
      await onRefreshData?.();
    } catch (err: any) {
      onNotify?.(err?.message || 'تعذر تسجيل طلب التمييز');
    } finally {
      setFeaturingListingId(null);
    }
  };

  const openTransferModal = (rec: CommissionRecord) => {
    setTransferRecord(rec);
    setTransferReference(rec.transferReference || '');
    setTransferPayerName(rec.payerName || currentUser.name || '');
    setTransferAmountInput(String(rec.transferAmountSar || rec.commissionAmountSar || ''));
    setTransferNote(rec.transferNote || '');
    setTransferError('');
  };

  const handleConfirmTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferRecord || transferBusy) return;
    setTransferError('');
    const parsedAmt = Number(transferAmountInput);
    if (!Number.isFinite(parsedAmt) || parsedAmt <= 0) {
      setTransferError('يرجى إدخال مبلغ الحوالة الصحيح بالريال السعودي');
      return;
    }
    if (transferReference.trim().length < 2) {
      setTransferError('يرجى إدخال رقم مرجع الحوالة (حرفان على الأقل)');
      return;
    }
    if (transferPayerName.trim().length < 2) {
      setTransferError('يرجى إدخال اسم المحوّل (حرفان على الأقل)');
      return;
    }
    setTransferBusy(true);
    try {
      await api.submitCommissionPayment({
        recordId: transferRecord.id,
        transferReference: transferReference.trim(),
        payerName: transferPayerName.trim(),
        commissionAmountSar: parsedAmt,
        transferNote: transferNote.trim(),
      });
      setTransferRecord(null);
      onNotify?.('تم إرسال بيانات الحوالة للمراجعة الإدارية بنجاح');
      await onRefreshData?.();
    } catch (err: any) {
      setTransferError(err?.message || 'تعذر إرسال بيانات الحوالة');
    } finally {
      setTransferBusy(false);
    }
  };

  const handleCopyBankIban = async () => {
    if (!commissionSettings?.iban) return;
    const ok = await copyTextWithFallback(commissionSettings.iban);
    if (ok) {
      setCopiedIban(true);
      onNotify?.('تم نسخ رقم الآيبان بنجاح');
      window.setTimeout(() => setCopiedIban(false), 2200);
    }
  };

  useEffect(() => {
    setCompletionName(currentUser.name);
    setSettingsName(currentUser.name);
    setSettingsPhone(currentUser.phone || '');
  }, [currentUser.name, currentUser.phone]);

  const submitGoogleLinkCredential = useCallback(
    async (credential: string) => {
      setLinkGoogleError('');
      setLinkGoogleBusy(true);
      try {
        await api.linkGoogleIdentity({
          credential,
          ...(currentUser.hasPassword !== false ? { password: linkCurrentPassword } : {}),
        });
        setLinkGoogleOpen(false);
        setShowLinkGisButton(false);
        setLinkCurrentPassword('');
        onNotify?.('تم ربط حسابك بـ Google بنجاح');
        await onRefreshData?.();
      } catch (err: any) {
        setLinkGoogleError(err?.message || 'تعذر ربط الحساب بـ Google');
      } finally {
        setLinkGoogleBusy(false);
      }
    },
    [currentUser.hasPassword, linkCurrentPassword, onNotify, onRefreshData]
  );

  useEffect(() => {
    if (
      !showLinkGisButton ||
      !linkGisContainerRef.current ||
      !googleAuth?.enabled ||
      !googleAuth.clientId
    ) {
      return;
    }
    const isDark =
      typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    renderGoogleOfficialButton({
      container: linkGisContainerRef.current,
      clientId: googleAuth.clientId,
      mode: 'login',
      isDark,
      onCredential: (credential) => {
        void submitGoogleLinkCredential(credential);
      },
    }).catch((err: any) => {
      setLinkGoogleError(err?.message || 'تعذر تحميل زر Google الرسمي');
    });
  }, [showLinkGisButton, googleAuth, submitGoogleLinkCredential]);

  const handleCompleteProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (completionBusy) return;
    setCompletionError('');

    const normalized = normalizeSaudiMobileClient(completionPhone);
    if (!normalized) {
      setCompletionError('أدخل رقم جوال سعودي صحيح بصيغة 05XXXXXXXX');
      return;
    }
    const trimmedName = completionName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      setCompletionError('الاسم الكامل يجب أن يكون بين حرفين و 80 حرفاً');
      return;
    }

    setCompletionBusy(true);
    try {
      await api.completeProfile({
        phone: normalized,
        name: trimmedName,
      });
      setCompletionPhone('');
      onNotify?.('تم إكمال بيانات الحساب وحفظ رقم الجوال بنجاح');
      await onRefreshData?.();
    } catch (err: any) {
      setCompletionError(err?.message || 'تعذر حفظ بيانات الحساب');
    } finally {
      setCompletionBusy(false);
    }
  };

  const handleStartAuthenticatedGoogleLink = async () => {
    if (!googleAuth?.enabled || !googleAuth.clientId || linkGoogleBusy) return;
    setLinkGoogleError('');
    if (currentUser.hasPassword !== false && !linkCurrentPassword) {
      setLinkGoogleError('أدخل كلمة المرور الحالية أولاً لإثبات ملكية الحساب قبل ربط Google');
      return;
    }

    setLinkGoogleBusy(true);
    try {
      const outcome = await promptGoogleOneTap(googleAuth.clientId);
      if (outcome.kind === 'credential') {
        await submitGoogleLinkCredential(outcome.credential);
        return;
      }
      if (outcome.kind === 'canceled') {
        setLinkGoogleError(outcome.message);
        return;
      }
      setShowLinkGisButton(true);
    } catch (err: any) {
      setLinkGoogleError(err?.message || 'تعذر بدء ربط حساب Google');
    } finally {
      setLinkGoogleBusy(false);
    }
  };

  const handleSaveAccountSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (settingsBusy) return;
    setSettingsError('');
    const normalizedPhone = normalizeSaudiMobileClient(settingsPhone);
    if (!normalizedPhone) {
      setSettingsError('أدخل رقم جوال سعودي صحيح بصيغة 05XXXXXXXX');
      return;
    }
    const cleanName = settingsName.trim();
    if (cleanName.length < 2 || cleanName.length > 80) {
      setSettingsError('يجب أن يكون الاسم بين حرفين و 80 حرفاً');
      return;
    }
    setSettingsBusy(true);
    try {
      await api.completeProfile({
        phone: normalizedPhone,
        name: cleanName,
      });
      onNotify?.('تم تحديث إعدادات الحساب بنجاح');
      await onRefreshData?.();
    } catch (err: any) {
      setSettingsError(err?.message || 'تعذر تحديث بيانات الحساب');
    } finally {
      setSettingsBusy(false);
    }
  };

  const handleStartAuthenticatedFacebookLink = async () => {
    if (!facebookAuth?.enabled || fbLinkBusy) return;
    setFbLinkError('');
    if (currentUser.hasPassword !== false && !fbLinkPassword) {
      setFbLinkError('أدخل كلمة المرور الحالية أولاً لإثبات ملكية الحساب قبل ربط Facebook');
      return;
    }
    setFbLinkBusy(true);
    try {
      const { url } = await api.getFacebookOAuthUrl({ intent: 'link' });
      const popupResult = await openFacebookOAuthPopup(url);
      if (!popupResult.ok) {
        if (popupResult.code !== 'facebook_canceled') {
          setFbLinkError(popupResult.error);
        }
        return;
      }
      if (popupResult.intent !== 'link') {
        setFbLinkError('تعذر التحقق من رمز ربط Facebook');
        return;
      }
      await api.linkFacebookIdentity({
        linkToken: popupResult.linkToken,
        ...(currentUser.hasPassword !== false ? { password: fbLinkPassword } : {}),
      });
      setFbLinkPassword('');
      onNotify?.('تم ربط حسابك بـ Facebook بنجاح');
      await onRefreshData?.();
    } catch (err: any) {
      setFbLinkError(err?.message || 'تعذر ربط الحساب بـ Facebook');
    } finally {
      setFbLinkBusy(false);
    }
  };

  const handleLogoutAllDevices = async () => {
    if (logoutAllBusy) return;
    setLogoutAllBusy(true);
    try {
      await api.logoutAll();
      onNotify?.('تم تسجيل الخروج من جميع الأجهزة بنجاح');
      await onLogout();
    } catch (err: any) {
      onNotify?.(err?.message || 'تعذر إنهاء الجلسات الأخرى');
    } finally {
      setLogoutAllBusy(false);
    }
  };

  useEffect(() => {
    if (requestedTab || requestedConvId) {
      if (requestedTab) {
        const resolved = resolveAllowedTab(requestedTab);
        setActiveTab(resolved);
        if (resolved !== requestedTab) {
          onTabChange?.(resolved, { replace: true });
        }
      } else if (requestedConvId) {
        setActiveTab('messages');
      }
      if (requestedConvId) {
        setSelectedConvId(requestedConvId);
        setMobileThreadOpen(true);
      }
      onClearNavigationHint?.();
    }
  }, [requestedTab, requestedConvId, onClearNavigationHint, resolveAllowedTab, onTabChange]);

  const handleSelectTab = (tab: DashboardTab) => {
    const allowed = resolveAllowedTab(tab);
    setActiveTab(allowed);
    setNavOpen(false);
    if (allowed !== 'messages') {
      setMobileThreadOpen(false);
    }
    onTabChange?.(allowed);
  };

  const myListings = useMemo(
    () => allListings.filter((l) => l.sellerId === currentUser.id),
    [allListings, currentUser.id]
  );

  const myOffers = useMemo(
    () =>
      priceOffers.filter(
        (o) =>
          o.sellerId === currentUser.id ||
          o.buyerId === currentUser.id ||
          currentUser.role === 'admin'
      ),
    [priceOffers, currentUser.id, currentUser.role]
  );

  const favoriteListings = useMemo(
    () => allListings.filter((l) => favoriteIds.includes(l.id) && l.status === 'Published'),
    [allListings, favoriteIds]
  );

  const likedListings = useMemo(
    () => allListings.filter((l) => likedListingIds.includes(l.id) && l.status === 'Published'),
    [allListings, likedListingIds]
  );

  const pendingListings = useMemo(
    () => allListings.filter((l) => l.status === 'Pending'),
    [allListings]
  );

  const scopedAnalytics = useMemo(
    () =>
      scopeAnalyticsDataset({
        userId: currentUser.id,
        isAdmin: currentUser.role === 'admin',
        allListings,
        priceOffers,
        conversations,
      }),
    [currentUser.id, currentUser.role, allListings, priceOffers, conversations]
  );

  const totalUnreadMessages = useMemo(
    () => conversations.reduce((sum, c) => sum + (Number(c.unreadCount) || 0), 0),
    [conversations]
  );

  const activeConv =
    conversations.find((c) => c.id === selectedConvId) || conversations[0] || null;

  // Keep selectedConvId synced if current selection disappears
  useEffect(() => {
    if (!activeConv && selectedConvId) {
      setSelectedConvId('');
      setMobileThreadOpen(false);
    } else if (activeConv && !selectedConvId) {
      setSelectedConvId(activeConv.id);
    }
  }, [activeConv, selectedConvId]);

  // Auto-scroll chat container to latest message whenever active conversation or message count changes
  useEffect(() => {
    if (activeTab !== 'messages' || !activeConv) return;
    if (!isDesktopViewport && !mobileThreadOpen) return;

    const rafId = window.requestAnimationFrame(() => {
      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
      if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
        messagesEndRef.current.scrollIntoView({ block: 'nearest' });
      }
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [activeTab, activeConv?.id, activeConv?.messages.length, mobileThreadOpen, isDesktopViewport]);

  // Mark active conversation read when opened and visible to the user
  useEffect(() => {
    if (activeTab !== 'messages' || !activeConv || !onMarkConversationRead) return;
    if (!isDesktopViewport && !mobileThreadOpen) return;
    if ((activeConv.unreadCount ?? 0) <= 0) return;

    const lastMsgId = activeConv.messages[activeConv.messages.length - 1]?.id || 'empty';
    const key = `${activeConv.id}:${lastMsgId}`;
    if (lastMarkedReadKeyRef.current === key) return;
    lastMarkedReadKeyRef.current = key;

    Promise.resolve(onMarkConversationRead(activeConv.id)).catch(() => {
      lastMarkedReadKeyRef.current = '';
    });
  }, [activeTab, activeConv, mobileThreadOpen, isDesktopViewport, onMarkConversationRead]);

  const resolveConversationMeta = useCallback(
    (conv: Conversation) => {
      const listing = allListings.find((l) => l.id === conv.listingId);
      const otherId =
        conv.otherParticipantId ||
        (conv.buyerId === currentUser.id ? conv.sellerId : conv.buyerId);
      const otherSeller = sellers.find((s) => s.userId === otherId);
      const otherParticipantName =
        conv.otherParticipantName || otherSeller?.displayName || 'مستخدم';
      const listingTitle = listing?.title || conv.listingTitle || 'استفسار عن إعلان';
      const unreadCount = Number(conv.unreadCount) || 0;
      return {
        listing,
        listingTitle,
        otherId,
        otherParticipantName,
        unreadCount,
      };
    },
    [allListings, currentUser.id, sellers]
  );

  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConvId(conv.id);
    setMobileThreadOpen(true);
    onTabChange?.('messages', { replace: true, conversationId: conv.id });
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv || !replyText.trim() || sendingReply) return;
    setSendingReply(true);
    try {
      await onSendMessage(activeConv.id, replyText.trim());
      setReplyText('');
      window.requestAnimationFrame(() => {
        const container = messagesContainerRef.current;
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      });
    } catch {
      // The app already showed the error toast; keep the typed reply so the user can retry.
    } finally {
      setSendingReply(false);
    }
  };

  const roleLabel =
    currentUser.role === 'admin'
      ? 'مشرف المنصة'
      : 'عضو سوق الغنم';

  const shellItems: Array<{ id: DashboardTab; label: string; meta?: string }> = [
    { id: 'profile', label: t.menuProfile },
    { id: 'my-listings', label: 'إعلاناتي', meta: String(myListings.length) },
    { id: 'favorites', label: 'المفضلة', meta: String(favoriteListings.length) },
    { id: 'likes', label: 'إعجاباتي', meta: String(likedListings.length) },
    {
      id: 'messages',
      label: 'المحادثات',
      meta: totalUnreadMessages > 0 ? String(totalUnreadMessages) : undefined,
    },
    { id: 'subscription', label: t.menuSubscription },
    { id: 'settings', label: t.menuSettings },
    {
      id: 'notifications',
      label: t.menuNotifications,
      meta: unreadNotificationsCount > 0 ? String(unreadNotificationsCount) : undefined,
    },
    {
      id: 'analytics',
      label: currentUser.role === 'admin' ? 'تحكم الأداء' : 'تحليلات إعلاناتي',
    },
  ];
  if (currentUser.role === 'admin') {
    shellItems.push({
      id: 'admin',
      label: 'لوحة المشرف',
      meta: pendingListings.length > 0 ? String(pendingListings.length) : undefined,
    });
  }
  const shellTitle = shellItems.find((item) => item.id === activeTab)?.label ?? 'لوحة التحكم';

  return (
    <section className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink)]">
      <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)] min-h-screen">
        {navOpen && (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-[#0F2B20]/55 lg:hidden cursor-pointer"
            aria-label="إغلاق القائمة"
            onClick={() => setNavOpen(false)}
          />
        )}
        <aside
          inert={!isDesktopViewport && !navOpen ? true : undefined}
          className={`bg-[#0F2B20] text-[#F4EFE4] flex flex-col max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-50 max-lg:w-[248px] max-lg:shadow-2xl max-lg:transition-transform max-lg:duration-200 lg:sticky lg:top-0 lg:h-screen ${
            navOpen ? 'max-lg:translate-x-0' : 'max-lg:translate-x-full'
          }`}
        >
          <div className="px-5 pt-5 pb-4 border-b border-white/10 flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={onGoHome}
              className="text-right cursor-pointer rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8BC63]"
            >
              <span className="block font-display text-[1.35rem] leading-none text-[#F4EFE4]">سوق الغنم</span>
              <span className="mt-2 block text-[12px] text-[#E8BC63]">لوحة التحكم</span>
            </button>
            <button
              type="button"
              className="lg:hidden w-9 h-9 rounded-lg text-[#F4EFE4]/80 hover:bg-white/10 inline-flex items-center justify-center cursor-pointer"
              aria-label="إغلاق القائمة"
              onClick={() => setNavOpen(false)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="أقسام لوحة التحكم">
            <ul className="space-y-1">
              {shellItems.map((item) => {
                const selected = item.id === activeTab;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={selected ? 'page' : undefined}
                      onClick={() => handleSelectTab(item.id)}
                      className={`w-full min-h-11 px-3 rounded-lg flex items-center gap-2.5 text-sm font-semibold cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8BC63] ${
                        selected
                          ? 'bg-white/10 text-white border-s-[3px] border-[#E8BC63]'
                          : 'text-[#F4EFE4]/75 hover:bg-white/10 hover:text-white border-s-[3px] border-transparent'
                      }`}
                    >
                      <DashboardShellIcon id={item.id} />
                      <span className="flex-1 text-right truncate">{item.label}</span>
                      {item.meta && (
                        <span className="text-[12px] tabular-nums text-[#E8BC63]">{item.meta}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="px-4 py-4 border-t border-white/10">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-lg bg-white/10 text-[#E8BC63] flex items-center justify-center shrink-0 text-sm font-bold">
                {currentUser.name.slice(0, 1)}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{currentUser.name}</p>
                <p className="text-[12px] text-[#F4EFE4]/80 truncate">{roleLabel}</p>
              </div>
            </div>
            {myVerification?.verificationStatus === 'Verified' && (
              <div className="mt-3">
                <VerifiedSellerBadge variant="compact" />
              </div>
            )}
            <button
              type="button"
              onClick={() => onLogout()}
              className="mt-3 w-full min-h-11 px-3 rounded-lg text-sm font-semibold text-[#F4EFE4]/80 hover:bg-white/10 hover:text-white cursor-pointer inline-flex items-center justify-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8BC63]"
            >
              <LogOut size={15} aria-hidden="true" />
              تسجيل الخروج
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex flex-col min-h-screen">
          <header className="sticky top-0 z-30 min-h-16 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex items-center gap-2 sm:gap-3 px-3 sm:px-6">
            <button
              type="button"
              className="lg:hidden w-10 h-10 shrink-0 rounded-lg border border-[var(--color-border)] inline-flex items-center justify-center cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8BC63]"
              aria-label="فتح القائمة"
              onClick={() => setNavOpen(true)}
            >
              <Menu size={18} aria-hidden="true" />
            </button>
            <h1 className="min-w-0 flex-1 font-display text-base sm:text-lg font-bold truncate">{shellTitle}</h1>
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setNotificationsOpen((prev) => !prev)}
                aria-expanded={notificationsOpen}
                aria-label="الإشعارات"
                className={`min-h-10 px-2.5 sm:px-3.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-2 border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8BC63] ${
                  notificationsOpen
                    ? 'bg-[var(--color-gold-soft)] border-[var(--color-gold)] text-[var(--color-ink)]'
                    : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-ink)] hover:border-[var(--color-gold)]'
                }`}
              >
                <Bell size={15} aria-hidden="true" />
                <span className="hidden sm:inline">الإشعارات</span>
                {unreadNotificationsCount > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-md bg-[var(--color-gold)] text-[#0B231A] text-xs font-extrabold tabular-nums inline-flex items-center justify-center">
                    {unreadNotificationsCount > 99 ? '+99' : unreadNotificationsCount}
                  </span>
                )}
              </button>
              {onAddListing && (
                <button
                  type="button"
                  onClick={onAddListing}
                  aria-label="أضف إعلاناً"
                  className="min-h-10 px-2.5 sm:px-4 rounded-lg text-xs font-extrabold transition-colors cursor-pointer bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white inline-flex items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8BC63]"
                >
                  <Plus size={15} aria-hidden="true" />
                  <span className="hidden sm:inline">أضف إعلاناً</span>
                </button>
              )}
              {!currentUser.googleLinked && googleAuth?.enabled && googleAuth.clientId && (
                <button
                  type="button"
                  onClick={() => {
                    setLinkGoogleOpen((prev) => !prev);
                    setLinkGoogleError('');
                    setShowLinkGisButton(false);
                  }}
                  aria-expanded={linkGoogleOpen}
                  aria-label="ربط بـ Google"
                  className="min-h-10 px-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-ink)] hover:border-[var(--color-gold)] inline-flex items-center gap-1.5"
                >
                  <Link2 size={14} aria-hidden="true" />
                  <span className="hidden md:inline">ربط بـ Google</span>
                </button>
              )}
              <button
                type="button"
                onClick={onBrowseListings}
                className="min-h-10 px-2.5 sm:px-3.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-ink)] hover:border-[var(--color-gold)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8BC63]"
              >
                السوق
              </button>
            </div>
          </header>
          <div className="flex-1 w-full px-3 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* Contextual Account Completion / Linking / Notifications Panels */}
      {(!currentUser.phone || linkGoogleOpen || notificationsOpen) && (
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-4 sm:p-5 shadow-xs space-y-4">

        {/* Profile Completion Card for Google accounts missing a Saudi mobile number */}
        {!currentUser.phone && (
          <form
            onSubmit={handleCompleteProfileSubmit}
            className="rounded-xl border border-[var(--color-gold)] bg-[var(--color-cream)] p-4 sm:p-5 space-y-3"
            noValidate
          >
            <div className="flex items-start gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-green-ink)] flex items-center justify-center shrink-0">
                <Phone size={16} aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h2 className="font-display text-sm sm:text-base font-bold text-[var(--color-ink)]">
                  إكمال بيانات الحساب
                </h2>
                <p className="text-xs text-[var(--color-muted)] leading-relaxed">
                  يمكنك تصفح السوق بحرية الآن. ولنشر الإعلانات أو طلب شارة التوثيق، أضف رقم الجوال السعودي (05XXXXXXXX). لن يتم تعليم الرقم كموثق تلقائياً بدون إجراءات التحقق المعتمدة.
                </p>
              </div>
            </div>

            {completionError && (
              <p
                role="alert"
                className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
              >
                {completionError}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="dash-complete-phone"
                  className="block text-xs font-semibold text-[var(--color-ink)] mb-1"
                >
                  رقم الجوال السعودي
                </label>
                <input
                  id="dash-complete-phone"
                  type="tel"
                  dir="ltr"
                  placeholder="05XXXXXXXX"
                  value={completionPhone}
                  onChange={(e) => setCompletionPhone(e.target.value)}
                  required
                  className="w-full h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] text-right tabular-nums focus:outline-none focus:border-[var(--color-green-ink)]"
                />
              </div>

              <div>
                <label
                  htmlFor="dash-complete-name"
                  className="block text-xs font-semibold text-[var(--color-ink)] mb-1"
                >
                  الاسم المعروض
                </label>
                <input
                  id="dash-complete-name"
                  type="text"
                  value={completionName}
                  onChange={(e) => setCompletionName(e.target.value)}
                  required
                  className="w-full h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                />
              </div>

            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={completionBusy}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors"
              >
                {completionBusy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                <span>{completionBusy ? 'جاري الحفظ...' : 'حفظ وإكمال البيانات'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Authenticated Google Account Linking Box */}
        {linkGoogleOpen && !currentUser.googleLinked && googleAuth?.enabled && (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/60 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-display text-sm font-bold text-[var(--color-ink)]">
                  ربط حسابك الحالي بحساب Google
                </h2>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">
                  لتأمين حسابك، أدخل كلمة المرور الحالية ثم اختر حساب Google المراد ربطه.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLinkGoogleOpen(false)}
                className="text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-ink)] cursor-pointer"
              >
                إغلاق
              </button>
            </div>

            {linkGoogleError && (
              <p
                role="alert"
                className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
              >
                {linkGoogleError}
              </p>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              {currentUser.hasPassword !== false && (
                <input
                  type="password"
                  value={linkCurrentPassword}
                  onChange={(e) => setLinkCurrentPassword(e.target.value)}
                  placeholder="كلمة المرور الحالية"
                  aria-label="كلمة المرور الحالية لتأكيد ربط Google"
                  className="flex-1 h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                />
              )}
              <button
                type="button"
                disabled={linkGoogleBusy}
                onClick={handleStartAuthenticatedGoogleLink}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors shrink-0"
              >
                {linkGoogleBusy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                <span>{linkGoogleBusy ? 'جاري التحقق...' : 'المتابعة باستخدام Google'}</span>
              </button>
            </div>

            {showLinkGisButton && googleAuth.clientId && (
              <div className="pt-2 flex flex-col items-center gap-1.5">
                <div
                  ref={linkGisContainerRef}
                  className="min-h-[44px] flex items-center justify-center w-full"
                />
              </div>
            )}
          </div>
        )}

        {/* Account Summary Strip moved into PageBanner above */}

        {/* Collapsible Dashboard Notifications Feed */}
        {notificationsOpen && (
          <div
            aria-label="إشعارات الحساب"
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/35 overflow-hidden"
          >
            <div className="px-4 py-3 bg-[var(--color-cream)] border-b border-[var(--color-border)] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bell size={15} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                <span className="font-display text-sm font-bold text-[var(--color-ink)]">
                  مركز الإشعارات ({notifications.length})
                </span>
              </div>
              {unreadNotificationsCount > 0 && onMarkAllNotificationsRead && (
                <button
                  type="button"
                  onClick={onMarkAllNotificationsRead}
                  className="text-xs font-semibold text-[var(--color-green-ink)] hover:underline cursor-pointer"
                >
                  تحديد الكل كمقروء
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-[var(--color-muted)]">
                لا توجد إشعارات في سجل حسابك حالياً. ستصلك التنبيهات فور تلقي رسالة أو سؤال أو رد أو تحديث على إعلاناتك.
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border)] max-h-72 overflow-y-auto bg-[var(--color-surface)]">
                {notifications.slice(0, 15).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onOpenNotification?.(item);
                      setNotificationsOpen(false);
                    }}
                    className={`w-full text-right p-3.5 transition-colors flex items-start gap-3 cursor-pointer ${
                      item.read
                        ? 'bg-[var(--color-surface)] hover:bg-[var(--color-cream)]/40'
                        : 'bg-[var(--color-cream)]/80 hover:bg-[var(--color-cream)]'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center shrink-0 mt-0.5">
                      {item.type === 'offer_accepted' ||
                      item.type === 'listing_approved' ||
                      item.type === 'commission_approved' ? (
                        <CheckCircle2 size={15} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                      ) : item.type === 'featured_approved' ? (
                        <Sparkles size={15} className="text-[var(--color-gold)]" aria-hidden="true" />
                      ) : item.type === 'commission_due' || item.type === 'commission_submitted' ? (
                        <BadgePercent size={15} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                      ) : item.type === 'offer_rejected' ||
                        item.type === 'listing_rejected' ||
                        item.type === 'commission_rejected' ? (
                        <XCircle size={15} className="text-red-700 dark:text-red-400" aria-hidden="true" />
                      ) : item.type === 'seller_verified' ? (
                        <ShieldCheck size={15} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                      ) : item.type === 'seller_verification_rejected' ? (
                        <ShieldAlert size={15} className="text-red-700 dark:text-red-400" aria-hidden="true" />
                      ) : item.type === 'new_comment' || item.type === 'comment_reply' ? (
                        <MessageCircle size={15} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                      ) : item.type === 'listing_liked' ? (
                        <ThumbsUp size={15} className="text-[var(--color-gold)]" aria-hidden="true" />
                      ) : (
                        <MessageSquare size={15} className="text-[var(--color-gold)]" aria-hidden="true" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-[var(--color-ink)] truncate">
                          {item.title}
                        </p>
                        {!item.read && (
                          <span className="px-1.5 py-0.5 rounded bg-[var(--color-gold-soft)] text-[var(--color-ink)] text-[10px] font-bold shrink-0">
                            جديد
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--color-muted)] mt-0.5 line-clamp-2 leading-relaxed">
                        {item.body}
                      </p>
                      <p className="text-[11px] text-[var(--color-muted)]/80 mt-1 tabular-nums">
                        {formatRelativeArabicTime(item.createdAt)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* Profile Overview Tab */}
      {activeTab === 'profile' && (
        <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-7 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)] text-[var(--color-green-ink)] flex items-center justify-center shrink-0">
                <UserIcon size={20} aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-display text-lg font-extrabold text-[var(--color-ink)]">
                  {t.profileTabTitle}
                </h2>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">
                  {currentUser.name}
                </p>
              </div>
            </div>
            {myVerification?.verificationStatus === 'Verified' && (
              <VerifiedSellerBadge variant="badge" label="حساب مربي موثق ومعتمد" />
            )}
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] p-4 space-y-1">
              <dt className="text-xs text-[var(--color-muted)]">{t.profileNameLabel}</dt>
              <dd className="text-sm font-bold text-[var(--color-ink)]">{currentUser.name}</dd>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] p-4 space-y-1">
              <dt className="text-xs text-[var(--color-muted)]">{t.profilePhoneLabel}</dt>
              <dd className="text-sm font-bold text-[var(--color-ink)] tabular-nums" dir="ltr">
                {currentUser.phone || t.profileNotSet}
              </dd>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] p-4 space-y-1">
              <dt className="text-xs text-[var(--color-muted)]">{t.profileEmailLabel}</dt>
              <dd className="text-sm font-bold text-[var(--color-ink)] truncate" dir="ltr">
                {currentUser.email || t.profileNotSet}
              </dd>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] p-4 space-y-1">
              <dt className="text-xs text-[var(--color-muted)]">{t.profileRoleLabel}</dt>
              <dd className="text-sm font-bold text-[var(--color-green-ink)]">
                {currentUser.role === 'admin' ? t.roleAdmin : t.memberBadge}
              </dd>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] p-4 space-y-1">
              <dt className="text-xs text-[var(--color-muted)]">{t.profileGoogleLabel}</dt>
              <dd className="text-sm font-bold text-[var(--color-ink)]">
                {currentUser.googleLinked ? t.profileConnected : t.profileNotConnected}
              </dd>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] p-4 space-y-1">
              <dt className="text-xs text-[var(--color-muted)]">الربط بحساب Facebook</dt>
              <dd className="text-sm font-bold text-[var(--color-ink)]">
                {currentUser.facebookLinked ? 'مرتبط بحساب Facebook' : t.profileNotConnected}
              </dd>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] p-4 space-y-1">
              <dt className="text-xs text-[var(--color-muted)]">{t.profileVerificationLabel}</dt>
              <dd className="text-sm font-bold text-[var(--color-ink)]">
                {myVerification?.verificationStatus === 'Verified'
                  ? 'حساب مربي موثق'
                  : myVerification?.verificationStatus === 'Pending'
                  ? 'قيد مراجعة الإدارة'
                  : myVerification?.verificationStatus === 'Rejected'
                  ? 'مرفوض'
                  : 'غير مقدم'}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {/* Subscription & Plan Overview Tab */}
      {activeTab === 'subscription' && (
        <div className="space-y-6">
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-7 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)] text-[var(--color-green-ink)] flex items-center justify-center shrink-0">
                  <CreditCard size={20} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="font-display text-lg font-extrabold text-[var(--color-ink)]">
                    باقتي واشتراكي
                  </h2>
                  <p className="text-xs text-[var(--color-muted)] mt-0.5">
                    ملخص خطة العضوية الحالية وامتيازات النشر والتوثيق في سوق الغنم 2.0
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-lg bg-[var(--color-green)]/10 text-[var(--color-green-ink)] text-xs font-extrabold">
                {myVerification?.verificationStatus === 'Verified'
                  ? 'باقة المربي الموثق'
                  : 'العضوية المجانية النشطة'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] p-4 space-y-1">
                <p className="text-xs text-[var(--color-muted)]">الإعلانات المسجلة</p>
                <p className="text-xl font-extrabold text-[var(--color-ink)] tabular-nums">
                  {myListings.length}
                </p>
                <p className="text-[11px] text-[var(--color-muted)]">النشر متاح مجاناً للمربين</p>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] p-4 space-y-1">
                <p className="text-xs text-[var(--color-muted)]">الإعلانات المميزة</p>
                <p className="text-xl font-extrabold text-[var(--color-gold)] tabular-nums">
                  {myListings.filter((l) => l.isFeatured).length}
                </p>
                <p className="text-[11px] text-[var(--color-muted)]">أولوية ظهور في الرئيسية والدليل</p>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] p-4 space-y-1">
                <p className="text-xs text-[var(--color-muted)]">عمولة السوق للمبيعات</p>
                <p className="text-xl font-extrabold text-[var(--color-green-ink)] tabular-nums">
                  {commissionEligibility?.isExempt
                    ? '0% (إعفاء نشط)'
                    : `${commissionEligibility?.effectiveRatePercent ?? 1}%`}
                </p>
                <p className="text-[11px] text-[var(--color-muted)]">
                  {commissionEligibility?.reasonLabel || 'تُدفع بعد إتمام البيع بنجاح'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              {onOpenPricing && (
                <button
                  type="button"
                  onClick={onOpenPricing}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Sparkles size={16} aria-hidden="true" />
                  <span>استعراض الباقات والترقية</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => handleSelectTab('my-listings')}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)] hover:bg-[var(--color-cream-hover)] text-[var(--color-ink)] text-xs sm:text-sm font-semibold cursor-pointer transition-colors"
              >
                تمييز إعلان من إعلاناتي
              </button>
            </div>
          </div>

          {myCommissionRecords.length > 0 && (
            <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6 space-y-4">
              <h3 className="font-display text-base font-bold text-[var(--color-ink)]">
                سجل الحوالات والعمولات والتمييز ({myCommissionRecords.length})
              </h3>
              <div className="divide-y divide-[var(--color-border)]">
                {myCommissionRecords.map((rec) => {
                  const meta = getCommissionStatusMeta(rec.status);
                  return (
                    <div
                      key={rec.id}
                      className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <p className="font-bold text-[var(--color-ink)] truncate">
                          {rec.listingTitle}
                        </p>
                        <p className="text-xs text-[var(--color-muted)] tabular-nums">
                          المبلغ المستحق: {formatPriceSar(rec.commissionAmountSar)} · الحالة: {meta.label}
                        </p>
                      </div>
                      {rec.status === 'pending_payment' && (
                        <button
                          type="button"
                          onClick={() => openTransferModal(rec)}
                          className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[var(--color-green)] text-white text-xs font-bold cursor-pointer"
                        >
                          تأكيد الحوالة
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Account Settings Tab */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <form
            onSubmit={handleSaveAccountSettings}
            className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-7 space-y-5"
            noValidate
          >
            <div className="flex items-center gap-3 pb-4 border-b border-[var(--color-border)]">
              <span className="w-11 h-11 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)] text-[var(--color-green-ink)] flex items-center justify-center shrink-0">
                <Settings size={20} aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-display text-lg font-extrabold text-[var(--color-ink)]">
                  إعدادات الحساب والبيانات الشخصية
                </h2>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">
                  حدّث الاسم المعروض ورقم الجوال السعودي ونوع نشاطك في المنصة.
                </p>
              </div>
            </div>

            {settingsError && (
              <p
                role="alert"
                className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
              >
                {settingsError}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="settings-name"
                  className="block text-xs font-semibold text-[var(--color-ink)] mb-1.5"
                >
                  الاسم الكامل
                </label>
                <input
                  id="settings-name"
                  type="text"
                  value={settingsName}
                  onChange={(e) => setSettingsName(e.target.value)}
                  required
                  className="w-full h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                />
              </div>

              <div>
                <label
                  htmlFor="settings-phone"
                  className="block text-xs font-semibold text-[var(--color-ink)] mb-1.5"
                >
                  رقم الجوال السعودي
                </label>
                <input
                  id="settings-phone"
                  type="tel"
                  dir="ltr"
                  placeholder="05XXXXXXXX"
                  value={settingsPhone}
                  onChange={(e) => setSettingsPhone(e.target.value)}
                  required
                  className="w-full h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] text-sm text-[var(--color-ink)] text-right tabular-nums focus:outline-none focus:border-[var(--color-green-ink)]"
                />
              </div>

            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={settingsBusy}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] disabled:opacity-60 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 cursor-pointer transition-colors"
              >
                {settingsBusy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                <span>{settingsBusy ? 'جاري الحفظ...' : 'حفظ التغييرات'}</span>
              </button>
            </div>
          </form>

          {/* Connected Social Accounts */}
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-7 space-y-4">
            <div>
              <h3 className="font-display text-base font-extrabold text-[var(--color-ink)]">
                الحسابات الاجتماعية المرتبطة
              </h3>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                اربط حسابك بـ Google أو Facebook للدخول السريع مع حماية ملكية الحساب.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Google Link Card */}
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-[var(--color-ink)]">Google</span>
                  <span
                    className={`text-xs font-bold ${
                      currentUser.googleLinked
                        ? 'text-[var(--color-green-ink)]'
                        : 'text-[var(--color-muted)]'
                    }`}
                  >
                    {currentUser.googleLinked ? 'مرتبط' : 'غير مرتبط'}
                  </span>
                </div>
                {!currentUser.googleLinked && googleAuth?.enabled && googleAuth.clientId && (
                  <button
                    type="button"
                    onClick={() => {
                      setLinkGoogleOpen(true);
                      setLinkGoogleError('');
                      if (typeof window !== 'undefined') {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                    className="min-h-[40px] w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-green-ink)] text-xs font-bold text-[var(--color-ink)] cursor-pointer transition-colors"
                  >
                    ربط حساب Google الآن
                  </button>
                )}
              </div>

              {/* Facebook Link Card */}
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-[var(--color-ink)]">Facebook</span>
                  <span
                    className={`text-xs font-bold ${
                      currentUser.facebookLinked
                        ? 'text-[var(--color-green-ink)]'
                        : 'text-[var(--color-muted)]'
                    }`}
                  >
                    {currentUser.facebookLinked ? 'مرتبط' : 'غير مرتبط'}
                  </span>
                </div>
                {!currentUser.facebookLinked && (
                  <div className="space-y-2">
                    {fbLinkError && (
                      <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                        {fbLinkError}
                      </p>
                    )}
                    {facebookAuth?.enabled ? (
                      <>
                        {currentUser.hasPassword !== false && (
                          <input
                            type="password"
                            value={fbLinkPassword}
                            onChange={(e) => setFbLinkPassword(e.target.value)}
                            placeholder="كلمة المرور الحالية للتحقق"
                            aria-label="كلمة المرور الحالية لربط Facebook"
                            className="w-full h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                          />
                        )}
                        <button
                          type="button"
                          disabled={fbLinkBusy}
                          onClick={handleStartAuthenticatedFacebookLink}
                          className="min-h-[40px] w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-green-ink)] text-xs font-bold text-[var(--color-ink)] cursor-pointer transition-colors disabled:opacity-60"
                        >
                          {fbLinkBusy ? 'جاري التحقق من Facebook...' : 'ربط حساب Facebook الآن'}
                        </button>
                      </>
                    ) : (
                      <p className="text-[11px] text-[var(--color-muted)]">
                        يتاح الربط عند تفعيل إعدادات Facebook في الخادم.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Session Security */}
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-ink)]">
                <Lock size={15} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                <span>أمان الجلسات النشطة</span>
              </div>
              <p className="text-xs text-[var(--color-muted)]">
                أنهِ جميع جلسات تسجيل الدخول المفتوحة على أجهزتك الأخرى فوراً.
              </p>
            </div>
            <button
              type="button"
              disabled={logoutAllBusy}
              onClick={handleLogoutAllDevices}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 text-red-700 dark:text-red-300 text-xs font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <LogOut size={14} aria-hidden="true" />
              <span>{logoutAllBusy ? 'جاري الإنهاء...' : 'تسجيل الخروج من جميع الأجهزة'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Full Notifications Center Tab (linked from Header Notification Bell Footer) */}
      {activeTab === 'notifications' && (
        <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-[var(--color-border)] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-10 h-10 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)] text-[var(--color-green-ink)] flex items-center justify-center shrink-0">
                <Bell size={18} aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-display text-base sm:text-lg font-extrabold text-[var(--color-ink)]">
                  سجل الإشعارات ({notifications.length})
                </h2>
                <p className="text-xs text-[var(--color-muted)]">
                  جميع تنبيهات الرسائل، عروض الأسعار، وحالة الإعلانات.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] p-1">
                <button
                  type="button"
                  onClick={() => setNotifFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                    notifFilter === 'all'
                      ? 'bg-[var(--color-green)] text-white'
                      : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                  }`}
                >
                  الكل ({notifications.length})
                </button>
                <button
                  type="button"
                  onClick={() => setNotifFilter('unread')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                    notifFilter === 'unread'
                      ? 'bg-[var(--color-green)] text-white'
                      : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                  }`}
                >
                  غير مقروءة ({unreadNotificationsCount})
                </button>
              </div>

              {unreadNotificationsCount > 0 && onMarkAllNotificationsRead && (
                <button
                  type="button"
                  onClick={onMarkAllNotificationsRead}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)] hover:bg-[var(--color-cream-hover)] text-xs font-bold text-[var(--color-green-ink)] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCheck size={14} aria-hidden="true" />
                  <span>تحديد الكل كمقروء</span>
                </button>
              )}
            </div>
          </div>

          {(() => {
            const visibleNotifications =
              notifFilter === 'unread'
                ? notifications.filter((n) => !n.read)
                : notifications;
            if (visibleNotifications.length === 0) {
              return (
                <div className="p-10 text-center space-y-2">
                  <Bell size={28} className="mx-auto text-[var(--color-muted)]/60" aria-hidden="true" />
                  <p className="text-sm font-semibold text-[var(--color-muted)]">
                    {notifFilter === 'unread'
                      ? 'لا توجد إشعارات غير مقروءة حالياً'
                      : 'لا توجد إشعارات في سجل حسابك حالياً'}
                  </p>
                </div>
              );
            }
            return (
              <div className="divide-y divide-[var(--color-border)]">
                {visibleNotifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onOpenNotification?.(item)}
                    className={`w-full text-start p-4 sm:px-6 transition-colors flex items-start gap-3.5 cursor-pointer ${
                      item.read
                        ? 'bg-[var(--color-surface)] hover:bg-[var(--color-cream)]/40'
                        : 'bg-[var(--color-cream)]/75 hover:bg-[var(--color-cream)]'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center shrink-0 mt-0.5">
                      {item.type === 'offer_accepted' ||
                      item.type === 'listing_approved' ||
                      item.type === 'commission_approved' ? (
                        <CheckCircle2 size={16} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                      ) : item.type === 'featured_approved' ? (
                        <Sparkles size={16} className="text-[var(--color-gold)]" aria-hidden="true" />
                      ) : item.type === 'commission_due' || item.type === 'commission_submitted' ? (
                        <BadgePercent size={16} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                      ) : item.type === 'offer_rejected' ||
                        item.type === 'listing_rejected' ||
                        item.type === 'commission_rejected' ? (
                        <XCircle size={16} className="text-red-700 dark:text-red-400" aria-hidden="true" />
                      ) : item.type === 'seller_verified' ? (
                        <ShieldCheck size={16} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                      ) : item.type === 'seller_verification_rejected' ? (
                        <ShieldAlert size={16} className="text-red-700 dark:text-red-400" aria-hidden="true" />
                      ) : item.type === 'new_comment' || item.type === 'comment_reply' ? (
                        <MessageCircle size={16} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                      ) : item.type === 'listing_liked' ? (
                        <ThumbsUp size={16} className="text-[var(--color-gold)]" aria-hidden="true" />
                      ) : (
                        <MessageSquare size={16} className="text-[var(--color-gold)]" aria-hidden="true" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-[var(--color-ink)] truncate">
                          {item.title}
                        </p>
                        {!item.read && (
                          <span className="px-2 py-0.5 rounded bg-[var(--color-gold-soft)] text-[var(--color-ink)] text-[10px] font-bold shrink-0">
                            جديد
                          </span>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-[var(--color-muted)] mt-1 leading-relaxed">
                        {item.body}
                      </p>
                      <p className="text-[11px] text-[var(--color-muted)]/80 mt-1.5 tabular-nums">
                        {formatRelativeArabicTime(item.createdAt)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Tab 1: My Listings */}
      {activeTab === 'my-listings' && (
        <div className="space-y-8">
          {(currentUser.role !== 'admin' || myListings.length > 0 || myVerification) && (
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--color-muted)]">
                    حالة توثيق المربي:
                  </span>
                  {myVerification?.verificationStatus === 'Verified' ? (
                    <VerifiedSellerBadge variant="badge" label="حساب مربي موثق ومعتمد" />
                  ) : myVerification?.verificationStatus === 'Rejected' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400">
                      <ShieldAlert size={14} aria-hidden="true" />
                      <span>لم يُعتمد طلب التوثيق</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-gold)]">
                      <ShieldCheck size={14} aria-hidden="true" />
                      <span>
                        {myVerification
                          ? 'طلب التوثيق قيد مراجعة الإدارة'
                          : 'غير موثق بعد — يمكنك تقديم طلب توثيق'}
                      </span>
                    </span>
                  )}
                </div>
                {myVerification?.verificationNote && (
                  <p className="text-xs text-[var(--color-muted)]">
                    ملاحظة الإدارة: {myVerification.verificationNote}
                  </p>
                )}
              </div>

              {(!myVerification || myVerification.verificationStatus === 'Rejected') && (
                <button
                  type="button"
                  disabled={requestingVerification}
                  onClick={handleRequestVerification}
                  className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold shrink-0 cursor-pointer disabled:opacity-60"
                >
                  {requestingVerification
                    ? 'جاري الإرسال...'
                    : myVerification?.verificationStatus === 'Rejected'
                    ? 'إعادة إرسال طلب التوثيق'
                    : 'تقديم طلب توثيق مربي'}
                </button>
              )}
            </div>
          )}

          {myListings.length === 0 ? (
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-8 sm:p-10 text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)] text-[var(--color-green-ink)] flex items-center justify-center mx-auto">
                <PackageOpen size={22} aria-hidden="true" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <p className="font-display text-lg font-bold text-[var(--color-ink)]">
                  لا توجد إعلانات مسجلة في حسابك بعد
                </p>
                <p className="text-sm text-[var(--color-muted)] leading-relaxed">
                  أضف إعلانك الأول مع صور واضحة ومواصفات السلالة والوزن والعمر ليظهر للمشترين بعد المراجعة، أو تصفح عروض السوق الحالية.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                {onAddListing && (
                  <button
                    type="button"
                    onClick={onAddListing}
                    className="min-h-[44px] px-5 py-2.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Plus size={16} aria-hidden="true" />
                    <span>أضف إعلانك الأول</span>
                  </button>
                )}
                {onBrowseListings && (
                  <button
                    type="button"
                    onClick={onBrowseListings}
                    className="min-h-[44px] px-5 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)] hover:bg-[var(--color-cream-hover)] text-[var(--color-ink)] text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Search size={15} aria-hidden="true" />
                    <span>تصفح الإعلانات</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Mobile card layout (320px - 767px): prevents horizontal clipping */}
              <div className="md:hidden space-y-3">
                {myListings.map((item) => {
                  const statusMeta = getListingStatusBadge(item.status);
                  const StatusIcon = statusMeta.Icon;
                  const breed = breeds.find((b) => b.id === item.breedId);
                  const thumbUrl = item.images[0]?.url || breed?.imageUrl;

                  return (
                    <article
                      key={item.id}
                      className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 space-y-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-16 h-14 rounded-lg overflow-hidden border border-[var(--color-border)] bg-[var(--color-cream)] shrink-0">
                          <SafeImage
                            src={thumbUrl}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => onSelectListing(item)}
                              className="font-display font-bold text-sm text-[var(--color-ink)] hover:text-[var(--color-green-ink)] text-right cursor-pointer break-words min-w-0 flex-1"
                            >
                              {item.title}
                            </button>
                            <span
                              className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap ${statusMeta.cls}`}
                            >
                              <StatusIcon size={12} aria-hidden="true" />
                              <span>{statusMeta.label}</span>
                            </span>
                          </div>
                          <p className="text-[11px] text-[var(--color-muted)] tabular-nums">
                            {breed?.name || 'حلال'} · {item.city} · {item.quantity} رأس
                          </p>
                        </div>
                      </div>

                      {item.rejectionReason && (
                        <p className="text-xs text-red-700 dark:text-red-400 break-words bg-red-50/70 dark:bg-red-950/30 rounded-lg px-2.5 py-1.5 border border-red-200/70 dark:border-red-900/50">
                          سبب الرفض: {item.rejectionReason}
                        </p>
                      )}

                      <div className="flex flex-wrap items-baseline justify-between gap-2 pt-2 border-t border-[var(--color-border)]">
                        <div className="font-bold text-sm text-[var(--color-green-ink)] tabular-nums">
                          {formatPriceSar(item.priceAmount)}
                          {item.quantity > 1 && (
                            <span className="text-[11px] font-medium text-[var(--color-muted)] mr-1.5">
                              (الإجمالي: {formatPriceSar(item.priceAmount * item.quantity)})
                            </span>
                          )}
                        </div>
                        {item.expectedPrice && (
                          <p className="text-xs font-medium text-[var(--color-muted)] tabular-nums">
                            المتوقع: {formatPriceSar(item.expectedPrice)}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => onEditListing(item)}
                          className="flex-1 min-w-[110px] min-h-[44px] px-3 py-2 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-green-ink)] hover:bg-[var(--color-cream)] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Pencil size={13} aria-hidden="true" />
                          <span>
                            {item.status === 'Rejected' ||
                            item.status === 'Draft' ||
                            item.status === 'Expired'
                              ? 'تعديل وإعادة إرسال'
                              : 'تعديل'}
                          </span>
                        </button>
                        {item.status === 'Published' && (
                          <button
                            type="button"
                            onClick={() => setMarkSoldListing(item)}
                            className="flex-1 min-w-[110px] min-h-[44px] px-3 py-2 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-ink)] hover:bg-[var(--color-cream)] inline-flex items-center justify-center cursor-pointer"
                          >
                            تحديد كمباع
                          </button>
                        )}
                        {!item.isFeatured &&
                          !item.featuredRequested &&
                          (item.status === 'Published' || item.status === 'Pending') && (
                            <button
                              type="button"
                              disabled={featuringListingId === item.id}
                              onClick={() => handleRequestFeaturedListing(item)}
                              className="min-h-[44px] px-3 py-2 rounded-lg border border-[var(--color-gold)]/70 text-xs font-semibold text-[var(--color-ink)] hover:bg-[var(--color-gold-soft)]/30 inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-60"
                            >
                              <Sparkles size={13} className="text-[var(--color-gold)]" aria-hidden="true" />
                              <span>{featuringListingId === item.id ? 'جاري الطلب...' : 'تمييز'}</span>
                            </button>
                          )}
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Tablet & Desktop table (768px+) with horizontal scroll protection */}
              <div className="hidden md:block bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-x-auto no-scrollbar">
                <table className="w-full min-w-[640px] text-right border-collapse">
                  <thead>
                    <tr className="bg-[var(--color-cream)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted)]">
                      <th className="py-3 px-4">الإعلان</th>
                      <th className="py-3 px-4 whitespace-nowrap">السعر</th>
                      <th className="py-3 px-4 whitespace-nowrap">الحالة</th>
                      <th className="py-3 px-4 whitespace-nowrap">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)] text-sm">
                    {myListings.map((item) => {
                      const statusMeta = getListingStatusBadge(item.status);
                      const StatusIcon = statusMeta.Icon;
                      const breed = breeds.find((b) => b.id === item.breedId);
                      const thumbUrl = item.images[0]?.url || breed?.imageUrl;

                      return (
                        <tr key={item.id} className="hover:bg-[var(--color-cream)]/30">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-14 h-12 rounded-lg overflow-hidden border border-[var(--color-border)] bg-[var(--color-cream)] shrink-0">
                                <SafeImage
                                  src={thumbUrl}
                                  alt={item.title}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="min-w-0">
                                <button
                                  type="button"
                                  onClick={() => onSelectListing(item)}
                                  className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-green-ink)] text-right cursor-pointer"
                                >
                                  {item.title}
                                </button>
                                <p className="text-[11px] text-[var(--color-muted)] tabular-nums mt-0.5">
                                  {breed?.name || 'حلال'} · {item.city} · {item.quantity} رأس
                                </p>
                                {item.rejectionReason && (
                                  <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                                    سبب الرفض: {item.rejectionReason}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-bold text-[var(--color-green-ink)] tabular-nums whitespace-nowrap">
                            <div>{formatPriceSar(item.priceAmount)}</div>
                            {item.quantity > 1 && (
                              <p className="text-[11px] font-medium text-[var(--color-muted)] mt-0.5">
                                الإجمالي: {formatPriceSar(item.priceAmount * item.quantity)}
                              </p>
                            )}
                            {item.expectedPrice && (
                              <p className="text-[11px] font-medium text-[var(--color-muted)] mt-0.5">
                                المتوقع: {formatPriceSar(item.expectedPrice)}
                              </p>
                            )}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs font-semibold ${statusMeta.cls}`}
                            >
                              <StatusIcon size={13} aria-hidden="true" />
                              <span>{statusMeta.label}</span>
                            </span>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => onEditListing(item)}
                                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-green-ink)] hover:bg-[var(--color-cream)] inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Pencil size={13} aria-hidden="true" />
                                <span>
                                  {item.status === 'Rejected' ||
                                  item.status === 'Draft' ||
                                  item.status === 'Expired'
                                    ? 'تعديل وإعادة إرسال'
                                    : 'تعديل'}
                                </span>
                              </button>
                              {item.status === 'Published' && (
                                <button
                                  type="button"
                                  onClick={() => setMarkSoldListing(item)}
                                  className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-ink)] hover:bg-[var(--color-cream)] cursor-pointer"
                                >
                                  تحديد كمباع
                                </button>
                              )}
                              {!item.isFeatured &&
                                !item.featuredRequested &&
                                (item.status === 'Published' || item.status === 'Pending') && (
                                  <button
                                    type="button"
                                    disabled={featuringListingId === item.id}
                                    onClick={() => handleRequestFeaturedListing(item)}
                                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--color-gold)]/70 text-xs font-semibold text-[var(--color-ink)] hover:bg-[var(--color-gold-soft)]/30 inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                                  >
                                    <Sparkles size={13} className="text-[var(--color-gold)]" aria-hidden="true" />
                                    <span>{featuringListingId === item.id ? 'جاري...' : 'تمييز'}</span>
                                  </button>
                                )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Price Offers / Negotiation Activity */}
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 sm:p-6 space-y-4">
            <div>
              <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
                عروض الأسعار والتفاوض (السوم) ({myOffers.length})
              </h2>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                متابعة عروض الأسعار الواردة على إعلاناتك أو العروض التي أرسلتها للمربين
              </p>
            </div>

            {myOffers.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">
                لا توجد عروض أسعار مسجلة لهذا الحساب حالياً.
              </p>
            ) : (
              <>
                {/* Mobile Offer Cards (< 768px) */}
                <div className="md:hidden space-y-3">
                  {myOffers.map((offer) => {
                    const listing = allListings.find((l) => l.id === offer.listingId);
                    const canRespond =
                      offer.status === 'pending' &&
                      (offer.sellerId === currentUser.id || currentUser.role === 'admin');
                    const totalOfferValue = offer.offeredPrice * offer.quantity;
                    const badgeCls =
                      offer.status === 'accepted'
                        ? 'bg-[var(--color-green)]/10 text-[var(--color-green-ink)] border-[var(--color-green-ink)]/25'
                        : offer.status === 'rejected'
                        ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/60'
                        : 'bg-[var(--color-gold-soft)] text-[var(--color-ink)] border-[var(--color-gold)]/35';

                    return (
                      <article
                        key={offer.id}
                        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/30 p-3.5 space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          {listing ? (
                            <button
                              type="button"
                              onClick={() => onSelectListing(listing)}
                              className="font-semibold text-xs text-[var(--color-ink)] hover:text-[var(--color-green-ink)] text-right cursor-pointer break-words min-w-0 flex-1"
                            >
                              {listing.title}
                            </button>
                          ) : (
                            <span className="text-xs text-[var(--color-muted)]">{offer.listingId}</span>
                          )}
                          <span
                            className={`shrink-0 px-2 py-0.5 rounded-md border text-[11px] font-bold ${badgeCls}`}
                          >
                            {offer.status === 'accepted'
                              ? 'مقبول'
                              : offer.status === 'rejected'
                              ? 'مرفوض'
                              : 'بانتظار الرد'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="text-[var(--color-muted)]">المشتري: {offer.buyerName}</span>
                          <div className="text-left tabular-nums">
                            <span className="font-bold text-[var(--color-green-ink)]">
                              {formatPriceSar(offer.offeredPrice)} × {offer.quantity}
                            </span>
                            {offer.quantity > 1 && (
                              <span className="text-[11px] text-[var(--color-muted)] mr-1.5">
                                ({formatPriceSar(totalOfferValue)})
                              </span>
                            )}
                          </div>
                        </div>

                        {offer.note && (
                          <p className="text-xs text-[var(--color-muted)] break-words">{offer.note}</p>
                        )}

                        {canRespond && (
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => onRespondToOffer(offer.id, 'accepted')}
                              className="flex-1 min-h-[44px] px-3 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold cursor-pointer"
                            >
                              قبول
                            </button>
                            <button
                              type="button"
                              onClick={() => onRespondToOffer(offer.id, 'rejected')}
                              className="flex-1 min-h-[44px] px-3 py-2 rounded-lg border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold cursor-pointer"
                            >
                              رفض
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>

                {/* Desktop / Tablet Offers Table (768px+) */}
                <div className="hidden md:block overflow-x-auto rounded-lg border border-[var(--color-border)]">
                  <table className="w-full text-right text-sm border-collapse">
                    <thead>
                      <tr className="bg-[var(--color-cream)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted)]">
                        <th className="py-2.5 px-3">الإعلان</th>
                        <th className="py-2.5 px-3">المشتري</th>
                        <th className="py-2.5 px-3">العرض المقدم</th>
                        <th className="py-2.5 px-3">الحالة</th>
                        <th className="py-2.5 px-3 text-left">الإجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {myOffers.map((offer) => {
                        const listing = allListings.find((l) => l.id === offer.listingId);
                        const canRespond =
                          offer.status === 'pending' &&
                          (offer.sellerId === currentUser.id || currentUser.role === 'admin');
                        const totalOfferValue = offer.offeredPrice * offer.quantity;
                        const badgeCls =
                          offer.status === 'accepted'
                            ? 'bg-[var(--color-green)]/10 text-[var(--color-green-ink)] border-[var(--color-green-ink)]/25'
                            : offer.status === 'rejected'
                            ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/60'
                            : 'bg-[var(--color-gold-soft)] text-[var(--color-ink)] border-[var(--color-gold)]/35';

                        return (
                          <tr key={offer.id} className="hover:bg-[var(--color-cream)]/30">
                            <td className="py-3 px-3">
                              {listing ? (
                                <button
                                  type="button"
                                  onClick={() => onSelectListing(listing)}
                                  className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-green-ink)] text-right cursor-pointer"
                                >
                                  {listing.title}
                                </button>
                              ) : (
                                <span className="text-[var(--color-muted)]">{offer.listingId}</span>
                              )}
                              {offer.note && (
                                <p className="text-xs text-[var(--color-muted)] mt-0.5">{offer.note}</p>
                              )}
                            </td>
                            <td className="py-3 px-3 text-xs text-[var(--color-ink)] whitespace-nowrap">
                              {offer.buyerName}
                            </td>
                            <td className="py-3 px-3 font-bold text-[var(--color-green-ink)] tabular-nums whitespace-nowrap">
                              <div>{formatPriceSar(offer.offeredPrice)} × {offer.quantity}</div>
                              {offer.quantity > 1 && (
                                <p className="text-[11px] font-medium text-[var(--color-muted)] mt-0.5">
                                  الإجمالي: {formatPriceSar(totalOfferValue)}
                                </p>
                              )}
                            </td>
                            <td className="py-3 px-3 text-xs font-semibold whitespace-nowrap">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md border ${badgeCls}`}>
                                {offer.status === 'accepted'
                                  ? 'مقبول'
                                  : offer.status === 'rejected'
                                  ? 'مرفوض'
                                  : 'بانتظار الرد'}
                              </span>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              {canRespond && (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => onRespondToOffer(offer.id, 'accepted')}
                                    className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold cursor-pointer"
                                  >
                                    قبول
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onRespondToOffer(offer.id, 'rejected')}
                                    className="min-h-[36px] px-3 py-1 rounded-lg border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold cursor-pointer"
                                  >
                                    رفض
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Commission & Bank Transfer History Panel */}
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-[var(--color-ink)] inline-flex items-center gap-2">
                  <BadgePercent size={18} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                  <span>سجل العمولة والحوالات ({myCommissionRecords.length})</span>
                </h2>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">
                  متابعة عمولة المبيعات عبر المنصة ({commissionSettings?.commissionRatePercent ?? 1}%) وطلبات تمييز الإعلانات وتأكيد الحوالات
                </p>
              </div>
              {commissionEligibility && (
                <span className="px-3 py-1 rounded-lg bg-[var(--color-cream)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-green-ink)] shrink-0">
                  {commissionEligibility.isExempt
                    ? 'إعفاء الإطلاق مفعّل حالياً (0%)'
                    : `النسبة المفعّلة: ${commissionEligibility.effectiveRatePercent}%`}
                </span>
              )}
            </div>

            {commissionEligibility && (
              <p className="text-xs text-[var(--color-muted)] bg-[var(--color-cream)]/60 border border-[var(--color-border)] rounded-xl px-3.5 py-2.5">
                {commissionEligibility.reasonLabel}
              </p>
            )}

            {myCommissionRecords.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">
                لا توجد عمليات عمولة أو طلبات تمييز مسجلة لهذا الحساب حتى الآن.
              </p>
            ) : (
              <div className="space-y-3">
                {myCommissionRecords.map((rec) => {
                  const statusMeta = getCommissionStatusMeta(rec.status);
                  const canSubmitTransfer =
                    rec.status === 'pending_payment' || rec.status === 'rejected';
                  return (
                    <div
                      key={rec.id}
                      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/30 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-display text-sm font-bold text-[var(--color-ink)]">
                            {rec.listingTitle}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md border text-[11px] font-bold ${statusMeta.cls}`}
                          >
                            {statusMeta.label}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] text-[11px] text-[var(--color-muted)]">
                            {rec.kind === 'featured_listing' ? 'رسوم تمييز إعلان' : 'عمولة بيع'}
                          </span>
                        </div>

                        <p className="text-xs text-[var(--color-muted)] tabular-nums">
                          {rec.kind === 'sale_commission' && rec.soldViaPlatform
                            ? `مبلغ البيع: ${formatPriceSar(rec.saleAmountSar)} · نسبة ${rec.ratePercent}%`
                            : rec.kind === 'featured_listing'
                            ? 'تمييز أسبوعي للإعلان في الرئيسية'
                            : 'بيع خارج المنصة'}
                          {' · '}
                          المبلغ المستحق:{' '}
                          <strong className="text-[var(--color-green-ink)]">
                            {formatPriceSar(rec.commissionAmountSar)}
                          </strong>
                        </p>

                        {rec.transferReference && (
                          <p className="text-[11px] text-[var(--color-muted)]">
                            مرجع الحوالة: <span className="font-semibold text-[var(--color-ink)]">{rec.transferReference}</span>
                            {rec.payerName ? ` · المحوّل: ${rec.payerName}` : ''}
                          </p>
                        )}
                        {rec.reviewNote && (
                          <p className="text-xs text-[var(--color-ink)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2.5 py-1 inline-block">
                            ملاحظة الإدارة: {rec.reviewNote}
                          </p>
                        )}
                      </div>

                      {canSubmitTransfer && (
                        <button
                          type="button"
                          onClick={() => openTransferModal(rec)}
                          className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                        >
                          <CreditCard size={14} aria-hidden="true" />
                          <span>
                            {rec.status === 'rejected' ? 'إعادة تأكيد الحوالة' : 'تأكيد الحوالة'}
                          </span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Favorites */}
      {activeTab === 'favorites' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--color-border)]">
            <div>
              <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
                الإعلانات المحفوظة في المفضلة ({favoriteListings.length})
              </h2>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                قائمة خاصة بالإعلانات التي حفظتها للمقارنة والمتابعة السريعة.
              </p>
            </div>
          </div>

          {favoriteListings.length === 0 ? (
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-8 sm:p-10 text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)] text-[var(--color-green-ink)] flex items-center justify-center mx-auto">
                <Heart size={22} aria-hidden="true" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <p className="font-display text-lg font-bold text-[var(--color-ink)]">
                  قائمة المفضلة فارغة حالياً
                </p>
                <p className="text-sm text-[var(--color-muted)] leading-relaxed">
                  احفظ الإعلانات التي تهمك بالضغط على أيقونة القلب لتتمكن من مقارنتها والرجوع إليها بسهولة في أي وقت.
                </p>
              </div>
              {onBrowseListings && (
                <button
                  type="button"
                  onClick={onBrowseListings}
                  className="min-h-[44px] px-5 py-2.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                >
                  <Search size={15} aria-hidden="true" />
                  <span>تصفح الإعلانات المتاحة</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {favoriteListings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  category={categories.find((c) => c.id === listing.categoryId)}
                  breed={breeds.find((b) => b.id === listing.breedId)}
                  subCategory={categories.find((c) => c.id === listing.subCategoryId)}
                  region={regions.find((r) => r.id === listing.regionId)}
                  seller={sellers.find((s) => s.userId === listing.sellerId)}
                  isFavorite={true}
                  isLiked={likedListingIds.includes(listing.id)}
                  onSelect={onSelectListing}
                  onSelectSeller={onSelectSeller}
                  onToggleFavorite={onToggleFavorite}
                  onToggleLike={onToggleLike}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2b: Liked Listings (Separate from Saved Favorites) */}
      {activeTab === 'likes' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--color-border)]">
            <div>
              <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
                الإعلانات التي أعجبتك ({likedListings.length})
              </h2>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                سجل تفاعلات الإعجاب العامة على الإعلانات المنشورة، بشكل منفصل عن قائمة المفضلة الخاصة بك.
              </p>
            </div>
          </div>

          {likedListings.length === 0 ? (
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-8 sm:p-10 text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)] text-[var(--color-gold)] flex items-center justify-center mx-auto">
                <ThumbsUp size={22} aria-hidden="true" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <p className="font-display text-lg font-bold text-[var(--color-ink)]">
                  لم تسجل إعجاباً بأي إعلان بعد
                </p>
                <p className="text-sm text-[var(--color-muted)] leading-relaxed">
                  اضغط على زر «إعجاب» في أي إعلان منشور لدعم المربي وإضافة الإعلان إلى قائمتك هنا.
                </p>
              </div>
              {onBrowseListings && (
                <button
                  type="button"
                  onClick={onBrowseListings}
                  className="min-h-[44px] px-5 py-2.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                >
                  <Search size={15} aria-hidden="true" />
                  <span>استعراض الإعلانات</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {likedListings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  category={categories.find((c) => c.id === listing.categoryId)}
                  breed={breeds.find((b) => b.id === listing.breedId)}
                  subCategory={categories.find((c) => c.id === listing.subCategoryId)}
                  region={regions.find((r) => r.id === listing.regionId)}
                  seller={sellers.find((s) => s.userId === listing.sellerId)}
                  isFavorite={favoriteIds.includes(listing.id)}
                  isLiked={true}
                  onSelect={onSelectListing}
                  onSelectSeller={onSelectSeller}
                  onToggleFavorite={onToggleFavorite}
                  onToggleLike={onToggleLike}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Conversations (Responsive Switcher, Participant Previews, Unread Badges, Auto-Scroll) */}
      {activeTab === 'messages' && (
        conversations.length === 0 ? (
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-8 sm:p-10 text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)] text-[var(--color-green-ink)] flex items-center justify-center mx-auto">
              <MessageSquare size={22} aria-hidden="true" />
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <p className="font-display text-lg font-bold text-[var(--color-ink)]">
                لا توجد محادثات في بريدك حتى الآن
              </p>
              <p className="text-sm text-[var(--color-muted)] leading-relaxed">
                يمكنك بدء محادثة مباشرة وخاصة مع أي مربي من صفحة تفاصيل الإعلان للاستفسار عن الحلال أو التفاوض على السعر.
              </p>
            </div>
            {onBrowseListings && (
              <button
                type="button"
                onClick={onBrowseListings}
                className="min-h-[44px] px-5 py-2.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                <Search size={15} aria-hidden="true" />
                <span>تصفح الإعلانات والتواصل مع المربين</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden min-h-[460px]">
            {/* Conversation List Pane (Hidden on mobile when a thread is open) */}
            <div
              aria-label="قائمة المحادثات"
              className={`lg:col-span-4 lg:border-l border-[var(--color-border)] bg-[var(--color-cream)]/35 divide-y divide-[var(--color-border)] flex-col max-h-[560px] overflow-y-auto ${
                mobileThreadOpen ? 'hidden lg:flex' : 'flex'
              }`}
            >
              <div className="px-4 py-3 bg-[var(--color-cream)] border-b border-[var(--color-border)] flex items-center justify-between gap-2">
                <span className="font-display text-xs font-bold text-[var(--color-ink)]">
                  المحادثات النشطة ({conversations.length})
                </span>
                {totalUnreadMessages > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-[var(--color-gold-soft)] text-[var(--color-ink)] text-[11px] font-bold tabular-nums">
                    {totalUnreadMessages} غير مقروء
                  </span>
                )}
              </div>

              {conversations.map((conv) => {
                const meta = resolveConversationMeta(conv);
                const selected = activeConv?.id === conv.id;
                const lastMessage = conv.messages[conv.messages.length - 1];
                const initialChar = meta.otherParticipantName.trim().charAt(0) || 'م';

                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => handleSelectConversation(conv)}
                    aria-current={selected ? 'true' : undefined}
                    className={`w-full text-right p-3.5 sm:p-4 transition-colors cursor-pointer flex items-start gap-3 min-h-[76px] ${
                      selected
                        ? 'bg-[var(--color-surface)] ring-1 ring-inset ring-[var(--color-green-ink)]/35'
                        : 'hover:bg-[var(--color-surface)]/75'
                    }`}
                  >
                    <div
                      aria-hidden="true"
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-display font-bold text-sm shrink-0 border ${
                        selected
                          ? 'bg-[var(--color-green)] text-white border-[var(--color-green)]'
                          : 'bg-[var(--color-surface)] text-[var(--color-green-ink)] border-[var(--color-border)]'
                      }`}
                    >
                      {initialChar}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-sm font-bold text-[var(--color-ink)] truncate">
                          {meta.otherParticipantName}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {meta.unreadCount > 0 && (
                            <span
                              aria-label={`${meta.unreadCount} رسائل غير مقروءة`}
                              className="min-w-[20px] h-5 px-1.5 rounded-md bg-[var(--color-gold)] text-[#14261D] text-[11px] font-extrabold tabular-nums inline-flex items-center justify-center"
                            >
                              {meta.unreadCount}
                            </span>
                          )}
                          <span className="text-[11px] text-[var(--color-muted)] whitespace-nowrap tabular-nums">
                            {formatRelativeArabicTime(conv.updatedAt)}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs font-semibold text-[var(--color-green-ink)] truncate">
                        {meta.listingTitle}
                      </p>

                      <p className="text-xs text-[var(--color-muted)] truncate">
                        {lastMessage?.body || 'بدء المحادثة'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Active Chat Thread Pane (On mobile, shown only when mobileThreadOpen is true) */}
            <div
              className={`lg:col-span-8 flex-col justify-between min-w-0 ${
                mobileThreadOpen ? 'flex' : 'hidden lg:flex'
              }`}
            >
              {activeConv ? (
                (() => {
                  const activeMeta = resolveConversationMeta(activeConv);
                  const activeInitial = activeMeta.otherParticipantName.trim().charAt(0) || 'م';

                  return (
                    <>
                      <div className="p-3.5 sm:p-4 border-b border-[var(--color-border)] bg-[var(--color-cream)]/40 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => setMobileThreadOpen(false)}
                            aria-label="العودة إلى قائمة المحادثات"
                            className="lg:hidden min-w-[44px] min-h-[44px] px-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)] text-xs font-semibold text-[var(--color-ink)] inline-flex items-center justify-center gap-1 shrink-0 cursor-pointer"
                          >
                            <ArrowRight size={15} aria-hidden="true" />
                            <span>المحادثات</span>
                          </button>

                          <div
                            aria-hidden="true"
                            className="hidden sm:flex w-10 h-10 rounded-xl bg-[var(--color-green)] text-white items-center justify-center font-display font-bold text-sm shrink-0"
                          >
                            {activeInitial}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="font-display text-sm sm:text-base font-bold text-[var(--color-ink)] truncate">
                              {activeMeta.otherParticipantName}
                            </p>
                            <p className="text-xs text-[var(--color-muted)] truncate">
                              {activeMeta.listing ? (
                                <button
                                  type="button"
                                  onClick={() => onSelectListing(activeMeta.listing!)}
                                  className="text-[var(--color-green-ink)] hover:underline font-semibold text-right truncate max-w-full cursor-pointer"
                                >
                                  {activeMeta.listingTitle}
                                </button>
                              ) : (
                                activeMeta.listingTitle
                              )}
                            </p>
                          </div>
                        </div>

                        <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[11px] font-medium text-[var(--color-muted)] shrink-0">
                          <Lock size={12} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                          <span>مراسلة آمنة داخل المنصة</span>
                        </span>
                      </div>

                      <div
                        ref={messagesContainerRef}
                        className="p-3.5 sm:p-5 space-y-3.5 flex-1 overflow-y-auto max-h-[380px] min-h-[280px] bg-[var(--color-canvas)]/40"
                      >
                        {activeConv.messages.map((msg) => {
                          const isMine = msg.senderId === currentUser.id;
                          return (
                            <div
                              key={msg.id}
                              className={`flex flex-col ${isMine ? 'items-start' : 'items-end'}`}
                            >
                              <div
                                className={`max-w-[85%] sm:max-w-md rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words shadow-xs ${
                                  isMine
                                    ? 'bg-[var(--color-green)] text-white rounded-tr-sm'
                                    : 'bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-border)] rounded-tl-sm'
                                }`}
                              >
                                <p>{msg.body}</p>
                              </div>
                              <span className="text-[11px] text-[var(--color-muted)] mt-1 tabular-nums">
                                {formatRelativeArabicTime(msg.createdAt)}
                              </span>
                            </div>
                          );
                        })}
                        <div ref={messagesEndRef} aria-hidden="true" />
                      </div>

                      <form
                        onSubmit={handleReplySubmit}
                        className="p-3 sm:p-4 border-t border-[var(--color-border)] flex items-center gap-2 bg-[var(--color-surface)]"
                      >
                        <label htmlFor="chat-reply-input" className="sr-only">
                          نص الرسالة
                        </label>
                        <input
                          id="chat-reply-input"
                          type="text"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="اكتب رسالتك هنا..."
                          className="flex-1 min-w-0 h-11 px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/30 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/75 focus:outline-none focus:border-[var(--color-green-ink)] focus:bg-[var(--color-surface)] transition-colors"
                        />
                        <button
                          type="submit"
                          disabled={sendingReply || !replyText.trim()}
                          className="min-h-[44px] h-11 px-4 sm:px-5 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-semibold inline-flex items-center gap-2 shrink-0 cursor-pointer disabled:opacity-60"
                        >
                          <Send size={15} aria-hidden="true" />
                          <span>{sendingReply ? 'جاري الإرسال...' : 'إرسال'}</span>
                        </button>
                      </form>
                    </>
                  );
                })()
              ) : (
                <div className="p-8 text-center text-sm text-[var(--color-muted)]">
                  اختر محادثة لعرض الرسائل أو أرسل استفساراً من أي صفحة إعلان.
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* Tab 4: Dashboard Analytics (Strictly scoped to authenticated user's own listings & activity unless Admin) */}
      {activeTab === 'analytics' && (
        <Suspense fallback={<AnalyticsFallback />}>
          <DashboardAnalytics
            listings={scopedAnalytics.listings}
            offers={scopedAnalytics.offers}
            conversations={scopedAnalytics.conversations}
            regions={regions}
            isAdmin={currentUser.role === 'admin'}
            onAddListing={onAddListing}
          />
        </Suspense>
      )}

      {/* Tab 5: Admin Moderation Panel */}
      {activeTab === 'admin' && (
        <div className="space-y-8">
          {currentUser.role !== 'admin' ? (
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-8 text-center max-w-xl mx-auto">
              <p className="font-display text-lg font-bold text-[var(--color-ink)]">
                لوحة الإشراف مخصصة لإدارة المنصة
              </p>
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                إدارة المستخدمين وتوثيق المربين واعتماد الإعلانات ومعالجة البلاغات متاحة لحسابات المشرفين فقط.
              </p>
            </div>
          ) : (
            <Suspense fallback={<AdminPanelFallback />}>
              <AdminDashboardPanel
                currentUser={currentUser}
                allListings={allListings}
                categories={categories}
                breeds={breeds}
                regions={regions}
                sellers={sellers}
                auditLogs={auditLogs}
                onSelectListing={onSelectListing}
                onApproveListing={onApproveListing}
                onRejectListing={onRejectListing}
                onCreateBreed={onCreateBreed}
                onCreateSubCategory={onCreateSubCategory}
                onUpdateSubCategory={onUpdateSubCategory}
                onDeleteSubCategory={onDeleteSubCategory}
                onAutoCategorizeListings={onAutoCategorizeListings}
                onRefreshData={onRefreshData}
                onNotify={onNotify}
              />
            </Suspense>
          )}
        </div>
      )}

      <MarkSoldModal
        open={Boolean(markSoldListing)}
        onClose={() => setMarkSoldListing(null)}
        listing={markSoldListing}
        commissionSettings={commissionSettings}
        commissionEligibility={commissionEligibility}
        onSoldComplete={async () => {
          await onRefreshData?.();
        }}
        onTransferSubmitted={async () => {
          await onRefreshData?.();
        }}
        onNotify={onNotify}
      />

      <Modal
        open={Boolean(transferRecord)}
        onClose={() => setTransferRecord(null)}
        title="تأكيد الحوالة البنكية"
        subtitle={transferRecord ? `${transferRecord.listingTitle} — ${formatPriceSar(transferRecord.commissionAmountSar)}` : undefined}
        size="md"
      >
        {transferRecord && (
          <form onSubmit={handleConfirmTransferSubmit} className="space-y-4">
            {commissionSettings?.iban ? (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/60 p-3.5 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-[var(--color-ink)]">
                  <Building2 size={14} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                  <span>{commissionSettings.bankName || 'الحساب البنكي للمنصة'}</span>
                </div>
                {commissionSettings.accountHolderName && (
                  <p className="text-[var(--color-muted)]">
                    باسم: <strong className="text-[var(--color-ink)]">{commissionSettings.accountHolderName}</strong>
                  </p>
                )}
                <div className="flex items-center justify-between gap-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-2">
                  <span dir="ltr" className="font-mono font-bold text-[var(--color-ink)] tabular-nums">
                    {formatIbanSpaced(commissionSettings.iban)}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyBankIban}
                    className="min-h-[32px] px-2.5 rounded-lg border border-[var(--color-border)] text-[var(--color-green-ink)] font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    {copiedIban ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                    <span>{copiedIban ? 'تم النسخ' : 'نسخ'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[var(--color-muted)] bg-[var(--color-cream)]/50 border border-[var(--color-border)] rounded-xl p-3">
                سيظهر الآيبان هنا بمجرد اعتماده من مالك المنصة.
              </p>
            )}

            {transferError && (
              <p
                role="alert"
                className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
              >
                {transferError}
              </p>
            )}

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="dash-transfer-ref"
                  className="block text-xs font-semibold text-[var(--color-ink)] mb-1"
                >
                  رقم مرجع الحوالة
                </label>
                <input
                  id="dash-transfer-ref"
                  type="text"
                  value={transferReference}
                  onChange={(e) => setTransferReference(e.target.value)}
                  placeholder="مثال: TRF-77821"
                  className="w-full h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                />
              </div>

              <div>
                <label
                  htmlFor="dash-transfer-payer"
                  className="block text-xs font-semibold text-[var(--color-ink)] mb-1"
                >
                  اسم المحوّل
                </label>
                <input
                  id="dash-transfer-payer"
                  type="text"
                  value={transferPayerName}
                  onChange={(e) => setTransferPayerName(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                />
              </div>

              <div>
                <label
                  htmlFor="dash-transfer-amount"
                  className="block text-xs font-semibold text-[var(--color-ink)] mb-1"
                >
                  مبلغ الحوالة (ريال سعودي)
                </label>
                <input
                  id="dash-transfer-amount"
                  type="number"
                  min={1}
                  step="any"
                  required
                  value={transferAmountInput}
                  onChange={(e) => setTransferAmountInput(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-bold text-[var(--color-ink)] tabular-nums focus:outline-none focus:border-[var(--color-green-ink)]"
                />
              </div>

              <div>
                <label
                  htmlFor="dash-transfer-note"
                  className="block text-xs font-semibold text-[var(--color-ink)] mb-1"
                >
                  ملاحظة إضافية (اختياري)
                </label>
                <input
                  id="dash-transfer-note"
                  type="text"
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setTransferRecord(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted)] hover:bg-[var(--color-cream)] cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={transferBusy}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {transferBusy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                <span>{transferBusy ? 'جاري الإرسال...' : 'إرسال تأكيد الحوالة'}</span>
              </button>
            </div>
          </form>
        )}
      </Modal>
          </div>
        </div>
      </div>
    </section>
  );
}
