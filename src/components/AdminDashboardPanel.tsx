import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgePercent,
  Building2,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  ExternalLink,
  Flag,
  LayoutDashboard,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  UserX,
  XCircle,
} from 'lucide-react';
import type {
  AdminCommentItem,
  AdminInquiryItem,
  AdminOverviewStats,
  AdminReportItem,
  AdminUserSummary,
  AuditLog,
  Breed,
  Category,
  InquiryStatus,
  Listing,
  Region,
  SellerProfile,
  SellerVerificationStatus,
  User,
} from '../types/marketplace';
import {
  type CommissionAdminSummary,
  type CommissionRecord,
  type CommissionSettings,
  formatIbanSpaced,
  getCommissionStatusMeta,
  isValidSaudiIban,
  normalizeSaudiIban,
} from '../lib/commission';
import { api } from '../lib/api';
import { formatPriceSar, formatRelativeArabicTime, formatStatusLabel } from '../lib/format';
import { Modal } from './Modal';
import { SafeImage } from './SafeImage';
import { isSellerVerified, VerifiedSellerBadge } from './VerifiedSellerBadge';

const DashboardAnalytics = lazy(() =>
  import('./DashboardAnalytics').then((m) => ({ default: m.DashboardAnalytics }))
);

type AdminSubTab =
  | 'overview'
  | 'users'
  | 'verification'
  | 'listings'
  | 'moderation'
  | 'commissions'
  | 'inquiries'
  | 'audit';

interface AdminDashboardPanelProps {
  currentUser: User;
  allListings: Listing[];
  categories: Category[];
  breeds: Breed[];
  regions: Region[];
  sellers: SellerProfile[];
  auditLogs: AuditLog[];
  onSelectListing: (listing: Listing) => void;
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
  onAutoCategorizeListings: (payload?: {
    listingId?: string;
    subCategoryId?: string;
  }) => Promise<void>;
  onRefreshData?: () => Promise<void>;
  onNotify?: (message: string) => void;
}

const PRESET_LISTING_REJECTION_REASONS = [
  'الصور غير واضحة أو لا تُظهر الحلال بشكل كافٍ',
  'بيانات العمر أو الوزن أو السعر غير مكتملة',
  'سعر غير واقعي أو إعلان مكرر',
  'مخالفة شروط النشر في المنصة',
];

const PRESET_SUSPENSION_REASONS = [
  'نشر إعلانات وهمية أو مضللة للمشترين',
  'تكرار مخالفة شروط استخدام المنصة',
  'سلوك غير لائق أو إساءة في التعليقات والمحادثات',
];

const AUDIT_TARGET_LABELS: Record<string, string> = {
  user: 'حساب مستخدم',
  seller: 'توثيق مربي',
  listing: 'إعلان',
  report: 'بلاغ',
  comment: 'تعليق',
  category: 'فئة فرعية',
  breed: 'سلالة',
  offer: 'عرض سعر',
  commission: 'العمولة والمدفوعات',
};

function AnalyticsFallback() {
  return (
    <div className="py-12 text-center" role="status" aria-live="polite">
      <p className="text-sm text-[var(--color-muted)]">جاري تحميل الرسوم البيانية...</p>
    </div>
  );
}

function verificationStatusLabel(status: SellerVerificationStatus) {
  if (status === 'Verified') return 'موثق';
  if (status === 'Rejected') return 'مرفوض';
  return 'قيد المراجعة';
}

function verificationStatusTextClass(status: SellerVerificationStatus) {
  if (status === 'Verified') return 'text-[var(--color-green-ink)]';
  if (status === 'Rejected') return 'text-red-700 dark:text-red-400';
  return 'text-[var(--color-gold)]';
}

function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function AdminPaginationFooter({
  shownCount,
  totalCount,
  hasMore,
  loadingMore,
  onLoadMore,
  itemLabel = 'عنصر',
}: {
  shownCount: number;
  totalCount: number;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  itemLabel?: string;
}) {
  if (totalCount === 0 && shownCount === 0) return null;
  const remaining = Math.max(0, totalCount - shownCount);
  return (
    <div className="pt-4 border-t border-[var(--color-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <p className="text-xs text-[var(--color-muted)] tabular-nums">
        عرض {shownCount.toLocaleString('en-US')} من أصل {totalCount.toLocaleString('en-US')} {itemLabel}
      </p>
      {hasMore && (
        <button
          type="button"
          disabled={loadingMore}
          onClick={onLoadMore}
          className="min-h-[44px] sm:min-h-[38px] px-5 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)] hover:bg-[var(--color-cream-hover)] text-xs font-semibold text-[var(--color-green-ink)] cursor-pointer disabled:opacity-60"
        >
          {loadingMore
            ? 'جاري تحميل المزيد...'
            : `عرض المزيد (${remaining.toLocaleString('en-US')} متبقٍ)`}
        </button>
      )}
    </div>
  );
}

export function AdminDashboardPanel({
  currentUser,
  allListings,
  categories,
  breeds,
  regions,
  sellers,
  auditLogs: bootstrapAuditLogs,
  onSelectListing,
  onApproveListing,
  onRejectListing,
  onCreateBreed,
  onCreateSubCategory,
  onUpdateSubCategory,
  onDeleteSubCategory,
  onAutoCategorizeListings,
  onRefreshData,
  onNotify,
}: AdminDashboardPanelProps) {
  const [subTab, setSubTab] = useState<AdminSubTab>('overview');

  // Overview
  const [overview, setOverview] = useState<AdminOverviewStats | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);

  // Users management (server-side paginated)
  const [adminUsers, setAdminUsers] = useState<AdminUserSummary[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersHasMore, setUsersHasMore] = useState(false);
  const [usersNextOffset, setUsersNextOffset] = useState<number | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingMoreUsers, setLoadingMoreUsers] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const debouncedUserSearch = useDebouncedValue(userSearch, 250);
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userStatusFilter, setUserStatusFilter] = useState('all');
  const [userVerifFilter, setUserVerifFilter] = useState('all');

  const [suspendTarget, setSuspendTarget] = useState<AdminUserSummary | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [reactivateTarget, setReactivateTarget] = useState<AdminUserSummary | null>(null);
  const [reactivateNote, setReactivateNote] = useState('');
  const [userActionBusy, setUserActionBusy] = useState(false);
  const [userModalError, setUserModalError] = useState('');

  // Seller verification workflow (server-side paginated)
  const [adminSellers, setAdminSellers] = useState<AdminUserSummary[]>([]);
  const [sellersTotal, setSellersTotal] = useState(0);
  const [sellersHasMore, setSellersHasMore] = useState(false);
  const [sellersNextOffset, setSellersNextOffset] = useState<number | null>(null);
  const [loadingSellers, setLoadingSellers] = useState(false);
  const [loadingMoreSellers, setLoadingMoreSellers] = useState(false);
  const [sellersError, setSellersError] = useState('');
  const [sellerStatusFilter, setSellerStatusFilter] = useState<'all' | SellerVerificationStatus>(
    'Pending'
  );
  const [sellerSearch, setSellerSearch] = useState('');
  const debouncedSellerSearch = useDebouncedValue(sellerSearch, 250);
  const [rejectSellerTarget, setRejectSellerTarget] = useState<AdminUserSummary | null>(null);
  const [rejectSellerReason, setRejectSellerReason] = useState('');
  const [sellerReviewBusyId, setSellerReviewBusyId] = useState<string | null>(null);
  const [sellerModalError, setSellerModalError] = useState('');

  // Listing moderation (windowed rendering)
  const [listingStatusFilter, setListingStatusFilter] = useState<
    'Pending' | 'Published' | 'Rejected' | 'Sold' | 'Draft' | 'Expired' | 'all'
  >('Pending');
  const [listingSearch, setListingSearch] = useState('');
  const [listingsVisibleLimit, setListingsVisibleLimit] = useState(25);
  const [categorizeVisibleLimit, setCategorizeVisibleLimit] = useState(25);
  const [rejectTargetListing, setRejectTargetListing] = useState<Listing | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [listingBusyId, setListingBusyId] = useState<string | null>(null);
  const [listingActionError, setListingActionError] = useState('');

  // Unified Moderation (Reports + Comments, server-side paginated)
  const [adminReports, setAdminReports] = useState<AdminReportItem[]>([]);
  const [reportsTotal, setReportsTotal] = useState(0);
  const [reportsHasMore, setReportsHasMore] = useState(false);
  const [reportsNextOffset, setReportsNextOffset] = useState<number | null>(null);
  const [loadingReports, setLoadingReports] = useState(false);
  const [loadingMoreReports, setLoadingMoreReports] = useState(false);
  const [reportsError, setReportsError] = useState('');
  const [reportStatusFilter, setReportStatusFilter] = useState<'open' | 'resolved' | 'dismissed' | 'all'>('open');
  const [reportTypeFilter, setReportTypeFilter] = useState<'all' | 'listing' | 'comment'>('all');
  const [reportSearch, setReportSearch] = useState('');
  const debouncedReportSearch = useDebouncedValue(reportSearch, 250);
  const [resolveTargetReport, setResolveTargetReport] = useState<{
    report: AdminReportItem;
    nextStatus: 'resolved' | 'dismissed';
  } | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [reportActionBusy, setReportActionBusy] = useState(false);
  const [reportModalError, setReportModalError] = useState('');

  const [adminComments, setAdminComments] = useState<AdminCommentItem[]>([]);
  const [commentsTotal, setCommentsTotal] = useState(0);
  const [commentsHasMore, setCommentsHasMore] = useState(false);
  const [commentsNextOffset, setCommentsNextOffset] = useState<number | null>(null);
  const [loadingAdminComments, setLoadingAdminComments] = useState(false);
  const [loadingMoreComments, setLoadingMoreComments] = useState(false);
  const [adminCommentsError, setAdminCommentsError] = useState('');
  const [commentSearch, setCommentSearch] = useState('');
  const debouncedCommentSearch = useDebouncedValue(commentSearch, 250);
  const [moderateCommentTargetId, setModerateCommentTargetId] = useState<string | null>(null);
  const [moderateCommentReason, setModerateCommentReason] = useState('');
  const [moderatingCommentId, setModeratingCommentId] = useState<string | null>(null);

  // Audit logs (server-side paginated)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(bootstrapAuditLogs);

  // Inquiries (Contact Us + Service Requests, server-side paginated)
  const [inquiries, setInquiries] = useState<AdminInquiryItem[]>([]);
  const [inquirySummary, setInquirySummary] = useState<{
    total: number;
    newCount: number;
    inProgressCount: number;
    resolvedCount: number;
  } | null>(null);
  const [inquiriesTotal, setInquiriesTotal] = useState(0);
  const [inquiriesHasMore, setInquiriesHasMore] = useState(false);
  const [inquiriesNextOffset, setInquiriesNextOffset] = useState<number | null>(null);
  const [loadingInquiries, setLoadingInquiries] = useState(false);
  const [loadingMoreInquiries, setLoadingMoreInquiries] = useState(false);
  const [inquiriesError, setInquiriesError] = useState('');
  const [inquiryStatusFilter, setInquiryStatusFilter] = useState<'all' | InquiryStatus>('all');
  const [inquiryKindFilter, setInquiryKindFilter] = useState<'all' | 'contact' | 'service_request'>('all');
  const [inquirySearch, setInquirySearch] = useState('');
  const debouncedInquirySearch = useDebouncedValue(inquirySearch, 250);
  const [inquiryBusyRefId, setInquiryBusyRefId] = useState<string | null>(null);
  const [inquiryNoteDrafts, setInquiryNoteDrafts] = useState<Record<string, string>>({});
  const [auditTotal, setAuditTotal] = useState(bootstrapAuditLogs.length);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditNextOffset, setAuditNextOffset] = useState<number | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [loadingMoreAudit, setLoadingMoreAudit] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [auditTypeFilter, setAuditTypeFilter] = useState('all');
  const [auditSearch, setAuditSearch] = useState('');
  const debouncedAuditSearch = useDebouncedValue(auditSearch, 250);

  // Commissions & Bank settings state
  const [commissionSettings, setCommissionSettings] = useState<CommissionSettings | null>(null);
  const [commissionSummary, setCommissionSummary] = useState<CommissionAdminSummary | null>(null);
  const [commissionRecords, setCommissionRecords] = useState<CommissionRecord[]>([]);
  const [commTotal, setCommTotal] = useState(0);
  const [commHasMore, setCommHasMore] = useState(false);
  const [commNextOffset, setCommNextOffset] = useState<number | null>(null);
  const [loadingComm, setLoadingComm] = useState(false);
  const [loadingMoreComm, setLoadingMoreComm] = useState(false);
  const [commError, setCommError] = useState('');
  const [commStatusFilter, setCommStatusFilter] = useState('all');
  const [commKindFilter, setCommKindFilter] = useState('all');
  const [commSearch, setCommSearch] = useState('');
  const debouncedCommSearch = useDebouncedValue(commSearch, 250);

  const [rateInput, setRateInput] = useState('1');
  const [promoEnabledInput, setPromoEnabledInput] = useState(true);
  const [promoDaysInput, setPromoDaysInput] = useState('30');
  const [promoCountInput, setPromoCountInput] = useState('2');
  const [featuredPriceInput, setFeaturedPriceInput] = useState('35');
  const [bankNameInput, setBankNameInput] = useState('');
  const [accountHolderInput, setAccountHolderInput] = useState('');
  const [ibanInput, setIbanInput] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');

  const [commBusyId, setCommBusyId] = useState<string | null>(null);
  const [rejectCommTarget, setRejectCommTarget] = useState<CommissionRecord | null>(null);
  const [rejectCommNote, setRejectCommNote] = useState('');
  const [commModalError, setCommModalError] = useState('');

  // Sub-categories & breeds state
  const [breedName, setBreedName] = useState('');
  const [breedCategoryId, setBreedCategoryId] = useState(
    categories.find((c) => c.parentId === null)?.id || 'cat_sheep'
  );
  const [breedOrigin, setBreedOrigin] = useState('');
  const mainCategories = useMemo(
    () => categories.filter((c) => c.parentId === null),
    [categories]
  );
  const subCategories = useMemo(
    () => categories.filter((c) => c.parentId !== null),
    [categories]
  );
  const [subSearch, setSubSearch] = useState('');
  const [subParentFilter, setSubParentFilter] = useState('all');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [subName, setSubName] = useState('');
  const [subParentId, setSubParentId] = useState(mainCategories[0]?.id || 'cat_sheep');
  const [subDescription, setSubDescription] = useState('');
  const [subKeywords, setSubKeywords] = useState('');
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [editSubName, setEditSubName] = useState('');
  const [editSubParentId, setEditSubParentId] = useState('cat_sheep');
  const [editSubDescription, setEditSubDescription] = useState('');
  const [editSubKeywords, setEditSubKeywords] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [subSaving, setSubSaving] = useState(false);
  const [subModalError, setSubModalError] = useState('');
  const [autoRunning, setAutoRunning] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const res = await api.getAdminOverview();
      setOverview(res.overview);
    } catch (err: any) {
      onNotify?.(err?.message || 'تعذر تحميل ملخص لوحة المشرف');
    } finally {
      setLoadingOverview(false);
    }
  }, [onNotify]);

  const loadUsers = useCallback(
    async (offset = 0, append = false) => {
      if (append) setLoadingMoreUsers(true);
      else setLoadingUsers(true);
      setUsersError('');
      try {
        const res = await api.getAdminUsers({
          q: debouncedUserSearch,
          role: userRoleFilter,
          status: userStatusFilter,
          verificationStatus: userVerifFilter,
          limit: 20,
          offset,
        });
        setAdminUsers((prev) => {
          if (!append) return res.users;
          const seen = new Set(prev.map((u) => u.id));
          return [...prev, ...res.users.filter((u) => !seen.has(u.id))];
        });
        setUsersTotal(res.totalCount ?? res.total ?? res.users.length);
        setUsersHasMore(Boolean(res.hasMore));
        setUsersNextOffset(res.nextOffset ?? null);
      } catch (err: any) {
        setUsersError(err?.message || 'تعذر تحميل قائمة المستخدمين');
      } finally {
        setLoadingUsers(false);
        setLoadingMoreUsers(false);
      }
    },
    [debouncedUserSearch, userRoleFilter, userStatusFilter, userVerifFilter]
  );

  const loadSellers = useCallback(
    async (offset = 0, append = false) => {
      if (append) setLoadingMoreSellers(true);
      else setLoadingSellers(true);
      setSellersError('');
      try {
        const res = await api.getAdminSellers({
          status: sellerStatusFilter,
          q: debouncedSellerSearch,
          limit: 20,
          offset,
        });
        setAdminSellers((prev) => {
          if (!append) return res.sellers;
          const seen = new Set(prev.map((s) => s.id));
          return [...prev, ...res.sellers.filter((s) => !seen.has(s.id))];
        });
        setSellersTotal(res.totalCount ?? res.sellers.length);
        setSellersHasMore(Boolean(res.hasMore));
        setSellersNextOffset(res.nextOffset ?? null);
      } catch (err: any) {
        setSellersError(err?.message || 'تعذر تحميل طلبات توثيق المربين');
      } finally {
        setLoadingSellers(false);
        setLoadingMoreSellers(false);
      }
    },
    [sellerStatusFilter, debouncedSellerSearch]
  );

  const loadReports = useCallback(
    async (offset = 0, append = false) => {
      if (append) setLoadingMoreReports(true);
      else setLoadingReports(true);
      setReportsError('');
      try {
        const res = await api.getAdminReports({
          status: reportStatusFilter,
          targetType: reportTypeFilter,
          q: debouncedReportSearch,
          limit: 20,
          offset,
        });
        setAdminReports((prev) => {
          if (!append) return res.reports;
          const seen = new Set(prev.map((r) => r.id));
          return [...prev, ...res.reports.filter((r) => !seen.has(r.id))];
        });
        setReportsTotal(res.totalCount ?? res.reports.length);
        setReportsHasMore(Boolean(res.hasMore));
        setReportsNextOffset(res.nextOffset ?? null);
      } catch (err: any) {
        setReportsError(err?.message || 'تعذر تحميل البلاغات');
      } finally {
        setLoadingReports(false);
        setLoadingMoreReports(false);
      }
    },
    [reportStatusFilter, reportTypeFilter, debouncedReportSearch]
  );

  const loadAdminComments = useCallback(
    async (offset = 0, append = false) => {
      if (append) setLoadingMoreComments(true);
      else setLoadingAdminComments(true);
      setAdminCommentsError('');
      try {
        const res = await api.getAdminComments({
          q: debouncedCommentSearch,
          limit: 20,
          offset,
        });
        setAdminComments((prev) => {
          if (!append) return res.comments;
          const seen = new Set(prev.map((c) => c.id));
          return [...prev, ...res.comments.filter((c) => !seen.has(c.id))];
        });
        setCommentsTotal(res.totalCount ?? res.comments.length);
        setCommentsHasMore(Boolean(res.hasMore));
        setCommentsNextOffset(res.nextOffset ?? null);
      } catch (err: any) {
        setAdminCommentsError(err?.message || 'تعذر تحميل التعليقات');
      } finally {
        setLoadingAdminComments(false);
        setLoadingMoreComments(false);
      }
    },
    [debouncedCommentSearch]
  );

  const loadAuditLogs = useCallback(
    async (offset = 0, append = false) => {
      if (append) setLoadingMoreAudit(true);
      else setLoadingAudit(true);
      setAuditError('');
      try {
        const res = await api.getAdminAuditLogs({
          targetType: auditTypeFilter,
          q: debouncedAuditSearch,
          limit: 25,
          offset,
        });
        setAuditLogs((prev) => {
          if (!append) return res.auditLogs;
          const seen = new Set(prev.map((a) => a.id));
          return [...prev, ...res.auditLogs.filter((a) => !seen.has(a.id))];
        });
        setAuditTotal(res.totalCount ?? res.auditLogs.length);
        setAuditHasMore(Boolean(res.hasMore));
        setAuditNextOffset(res.nextOffset ?? null);
      } catch (err: any) {
        setAuditError(err?.message || 'تعذر تحميل سجل التدقيق');
      } finally {
        setLoadingAudit(false);
        setLoadingMoreAudit(false);
      }
    },
    [auditTypeFilter, debouncedAuditSearch]
  );

  const loadCommissions = useCallback(
    async (offset = 0, append = false, syncSettingsForm = false) => {
      if (append) setLoadingMoreComm(true);
      else setLoadingComm(true);
      setCommError('');
      try {
        const res = await api.getAdminCommissions({
          status: commStatusFilter,
          kind: commKindFilter,
          q: debouncedCommSearch,
          limit: 20,
          offset,
        });
        setCommissionSettings(res.settings);
        setCommissionSummary(res.summary);
        if (syncSettingsForm && res.settings) {
          setRateInput(String(res.settings.commissionRatePercent ?? 1));
          setPromoEnabledInput(Boolean(res.settings.promoEnabled));
          setPromoDaysInput(String(res.settings.promoFreeDays ?? 30));
          setPromoCountInput(String(res.settings.promoFreeListingsCount ?? 2));
          setFeaturedPriceInput(String(res.settings.featuredWeeklyPriceSar ?? 35));
          setBankNameInput(res.settings.bankName || '');
          setAccountHolderInput(res.settings.accountHolderName || '');
          setIbanInput(res.settings.iban || '');
        }
        setCommissionRecords((prev) => {
          if (!append) return res.records;
          const seen = new Set(prev.map((r) => r.id));
          return [...prev, ...res.records.filter((r) => !seen.has(r.id))];
        });
        setCommTotal(res.totalCount ?? res.records.length);
        setCommHasMore(Boolean(res.hasMore));
        setCommNextOffset(res.nextOffset ?? null);
      } catch (err: any) {
        setCommError(err?.message || 'تعذر تحميل بيانات العمولات والمدفوعات');
      } finally {
        setLoadingComm(false);
        setLoadingMoreComm(false);
      }
    },
    [commStatusFilter, commKindFilter, debouncedCommSearch]
  );

  const loadInquiries = useCallback(
    async (offset = 0, append = false) => {
      if (append) setLoadingMoreInquiries(true);
      else setLoadingInquiries(true);
      setInquiriesError('');
      try {
        const res = await api.getAdminInquiries({
          status: inquiryStatusFilter,
          kind: inquiryKindFilter,
          q: debouncedInquirySearch,
          limit: 25,
          offset,
        });
        setInquirySummary(res.summary);
        setInquiries((prev) => {
          if (!append) return res.inquiries;
          const seen = new Set(prev.map((item) => item.referenceId));
          return [...prev, ...res.inquiries.filter((item) => !seen.has(item.referenceId))];
        });
        setInquiriesTotal(res.totalCount ?? res.inquiries.length);
        setInquiriesHasMore(Boolean(res.hasMore));
        setInquiriesNextOffset(res.nextOffset ?? null);
      } catch (err: any) {
        setInquiriesError(err?.message || 'تعذر تحميل رسائل التواصل');
      } finally {
        setLoadingInquiries(false);
        setLoadingMoreInquiries(false);
      }
    },
    [inquiryStatusFilter, inquiryKindFilter, debouncedInquirySearch]
  );

  const handleUpdateInquiryStatus = async (
    referenceId: string,
    status: InquiryStatus
  ) => {
    setInquiryBusyRefId(referenceId);
    setInquiriesError('');
    try {
      const note = inquiryNoteDrafts[referenceId]?.trim() || undefined;
      await api.updateAdminInquiry(referenceId, { status, adminNote: note });
      onNotify?.('تم تحديث حالة رسالة التواصل بنجاح');
      await loadInquiries(0, false);
    } catch (err: any) {
      setInquiriesError(err?.message || 'تعذر تحديث حالة الرسالة');
    } finally {
      setInquiryBusyRefId(null);
    }
  };

  useEffect(() => {
    loadOverview();
    loadCommissions(0, false, true);
    loadInquiries(0, false);
  }, [loadOverview]);

  useEffect(() => {
    if (subTab === 'users') loadUsers(0, false);
  }, [subTab, loadUsers]);

  useEffect(() => {
    if (subTab === 'verification') loadSellers(0, false);
  }, [subTab, loadSellers]);

  useEffect(() => {
    if (subTab === 'moderation') {
      loadReports(0, false);
    }
  }, [subTab, loadReports]);

  useEffect(() => {
    if (subTab === 'moderation') {
      loadAdminComments(0, false);
    }
  }, [subTab, loadAdminComments]);

  useEffect(() => {
    if (subTab === 'commissions') {
      loadCommissions(0, false, false);
    }
  }, [subTab, loadCommissions]);

  useEffect(() => {
    if (subTab === 'inquiries') {
      loadInquiries(0, false);
    }
  }, [subTab, loadInquiries]);

  useEffect(() => {
    if (subTab === 'audit') loadAuditLogs(0, false);
  }, [subTab, loadAuditLogs]);

  useEffect(() => {
    setListingsVisibleLimit(25);
  }, [listingStatusFilter, listingSearch]);

  useEffect(() => {
    if (subTab !== 'audit') {
      setAuditLogs(bootstrapAuditLogs);
    }
  }, [bootstrapAuditLogs, subTab]);

  const allUsersInView =
    !usersHasMore &&
    userRoleFilter === 'all' &&
    userStatusFilter === 'all' &&
    userVerifFilter === 'all' &&
    !debouncedUserSearch.trim();

  const activeAdminCount = useMemo(
    () => adminUsers.filter((u) => u.role === 'admin' && u.status === 'active').length,
    [adminUsers]
  );

  const pendingListingsCount = useMemo(
    () =>
      overview?.listings.pending ?? allListings.filter((l) => l.status === 'Pending').length,
    [overview, allListings]
  );

  const pendingSellersCount = useMemo(
    () =>
      overview?.sellers.pending ??
      sellers.filter((s) => !isSellerVerified(s) && s.verificationStatus !== 'Rejected').length,
    [overview, sellers]
  );

  const openReportsCount = overview?.reports.open ?? 0;

  const filteredListings = useMemo(() => {
    const term = listingSearch.trim().toLowerCase();
    return allListings
      .filter((item) => {
        if (listingStatusFilter !== 'all' && item.status !== listingStatusFilter) return false;
        if (!term) return true;
        return (
          item.title.toLowerCase().includes(term) ||
          item.city.toLowerCase().includes(term) ||
          item.description.toLowerCase().includes(term)
        );
      })
      .sort((a, b) => (b.updatedAt || b.publishedAt).localeCompare(a.updatedAt || a.publishedAt));
  }, [allListings, listingStatusFilter, listingSearch]);

  const visibleListings = useMemo(
    () => filteredListings.slice(0, listingsVisibleLimit),
    [filteredListings, listingsVisibleLimit]
  );

  const visibleCategorizeListings = useMemo(
    () => allListings.slice(0, categorizeVisibleLimit),
    [allListings, categorizeVisibleLimit]
  );

  const filteredSubCategories = useMemo(
    () =>
      subCategories.filter((sub) => {
        const matchesParent = subParentFilter === 'all' || sub.parentId === subParentFilter;
        const term = subSearch.trim().toLowerCase();
        if (!term) return matchesParent;
        const matchesText =
          sub.name.toLowerCase().includes(term) ||
          (sub.description || '').toLowerCase().includes(term) ||
          (sub.keywords || []).some((k) => k.toLowerCase().includes(term));
        return matchesParent && matchesText;
      }),
    [subCategories, subParentFilter, subSearch]
  );

  const handleConfirmSuspend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suspendTarget) return;
    if (suspendReason.trim().length < 3) {
      setUserModalError('يرجى كتابة سبب الإيقاف (3 أحرف على الأقل)');
      return;
    }
    setUserActionBusy(true);
    setUserModalError('');
    try {
      await api.suspendAdminUser(suspendTarget.id, suspendReason.trim());
      setSuspendTarget(null);
      setSuspendReason('');
      onNotify?.('تم إيقاف الحساب وإنهاء جلساته النشطة');
      await Promise.all([loadUsers(0, false), loadOverview(), onRefreshData?.()]);
    } catch (err: any) {
      setUserModalError(err?.message || 'تعذر إيقاف الحساب');
    } finally {
      setUserActionBusy(false);
    }
  };

  const handleConfirmReactivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reactivateTarget) return;
    setUserActionBusy(true);
    setUserModalError('');
    try {
      await api.reactivateAdminUser(
        reactivateTarget.id,
        reactivateNote.trim() || undefined
      );
      setReactivateTarget(null);
      setReactivateNote('');
      onNotify?.('تمت إعادة تفعيل حساب المستخدم بنجاح');
      await Promise.all([loadUsers(0, false), loadOverview(), onRefreshData?.()]);
    } catch (err: any) {
      setUserModalError(err?.message || 'تعذر إعادة تفعيل الحساب');
    } finally {
      setUserActionBusy(false);
    }
  };

  const handleSellerDecision = async (
    target: AdminUserSummary,
    status: SellerVerificationStatus,
    reason?: string
  ) => {
    setSellerReviewBusyId(target.id);
    setSellersError('');
    setSellerModalError('');
    try {
      await api.reviewSellerVerification(target.id, { status, reason });
      if (rejectSellerTarget?.id === target.id) {
        setRejectSellerTarget(null);
        setRejectSellerReason('');
      }
      const msg =
        status === 'Verified'
          ? `تم اعتماد توثيق «${target.sellerProfile?.displayName || target.name}»`
          : status === 'Rejected'
          ? 'تم رفض طلب التوثيق وإشعار المربي بالسبب'
          : 'تمت إعادة طلب التوثيق إلى قائمة المراجعة';
      onNotify?.(msg);
      await Promise.all([loadSellers(0, false), loadOverview(), onRefreshData?.()]);
    } catch (err: any) {
      const msg = err?.message || 'تعذر تحديث حالة توثيق المربي';
      if (rejectSellerTarget?.id === target.id) {
        setSellerModalError(msg);
      } else {
        setSellersError(msg);
      }
    } finally {
      setSellerReviewBusyId(null);
    }
  };

  const handleApprove = async (listing: Listing) => {
    setListingBusyId(listing.id);
    setListingActionError('');
    try {
      await onApproveListing(listing.id);
      await loadOverview();
    } catch (err: any) {
      setListingActionError(err?.message || 'تعذر اعتماد الإعلان');
    } finally {
      setListingBusyId(null);
    }
  };

  const handleConfirmRejectListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTargetListing) return;
    if (rejectReason.trim().length < 3) {
      setListingActionError('يرجى إدخال سبب واضح لرفض الإعلان');
      return;
    }
    setListingBusyId(rejectTargetListing.id);
    setListingActionError('');
    try {
      await onRejectListing(rejectTargetListing.id, rejectReason.trim());
      setRejectTargetListing(null);
      setRejectReason('');
      await loadOverview();
    } catch (err: any) {
      setListingActionError(err?.message || 'تعذر رفض الإعلان');
    } finally {
      setListingBusyId(null);
    }
  };

  const handleConfirmResolveReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveTargetReport) return;
    setReportActionBusy(true);
    setReportModalError('');
    try {
      await api.resolveReport(
        resolveTargetReport.report.id,
        resolveTargetReport.nextStatus,
        resolveNote.trim() || undefined
      );
      setResolveTargetReport(null);
      setResolveNote('');
      onNotify?.('تم تحديث حالة البلاغ وتوثيق الإجراء في سجل التدقيق');
      await Promise.all([loadReports(0, false), loadOverview(), onRefreshData?.()]);
    } catch (err: any) {
      setReportModalError(err?.message || 'تعذر تحديث البلاغ');
    } finally {
      setReportActionBusy(false);
    }
  };

  const handleModerateAdminComment = async (commentId: string, reason?: string) => {
    setModeratingCommentId(commentId);
    setAdminCommentsError('');
    try {
      const res = await api.deleteListingComment(
        commentId,
        reason?.trim() || moderateCommentReason.trim() || undefined
      );
      const removed = new Set(res.deletedIds || [commentId]);
      setAdminComments((prev) => prev.filter((c) => !removed.has(c.id)));
      setCommentsTotal((n) => Math.max(0, n - removed.size));
      setModerateCommentTargetId(null);
      setModerateCommentReason('');
      onNotify?.('تمت إزالة التعليق المخالف وتحديث البلاغات المرتبطة');
      await Promise.all([loadReports(0, false), loadOverview(), onRefreshData?.()]);
    } catch (err: any) {
      setAdminCommentsError(err?.message || 'تعذر إزالة التعليق');
    } finally {
      setModeratingCommentId(null);
    }
  };

  const handleAddBreedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!breedName.trim()) return;
    await onCreateBreed({
      name: breedName.trim(),
      categoryId: breedCategoryId,
      origin: breedOrigin.trim() || 'المملكة العربية السعودية',
      summary: 'سلالة مضافة عبر لوحة إدارة التصنيفات والسلالات.',
      avgWeightKg: '38 – 60 كجم',
      priceRangeSar: '1,300 – 2,200 ر.س',
    });
    setBreedName('');
    setBreedOrigin('');
    await loadOverview();
  };

  const openCreateModal = () => {
    setSubModalError('');
    setSubName('');
    setSubParentId(mainCategories[0]?.id || 'cat_sheep');
    setSubDescription('');
    setSubKeywords('');
    setCreateModalOpen(true);
  };

  const handleCreateSubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subName.trim()) {
      setSubModalError('يرجى إدخال اسم الفئة الفرعية');
      return;
    }
    setSubModalError('');
    setSubSaving(true);
    try {
      await onCreateSubCategory({
        name: subName.trim(),
        parentId: subParentId,
        description: subDescription.trim(),
        keywords: subKeywords.trim(),
      });
      setCreateModalOpen(false);
    } catch (err: any) {
      setSubModalError(err?.message || 'تعذر حفظ الفئة الفرعية');
    } finally {
      setSubSaving(false);
    }
  };

  const openEditModal = (sub: Category) => {
    setSubModalError('');
    setEditTarget(sub);
    setEditSubName(sub.name);
    setEditSubParentId(sub.parentId || mainCategories[0]?.id || 'cat_sheep');
    setEditSubDescription(sub.description || '');
    setEditSubKeywords((sub.keywords || []).join('، '));
  };

  const handleSaveEditSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget || !editSubName.trim()) {
      setSubModalError('يرجى إدخال اسم الفئة الفرعية');
      return;
    }
    setSubModalError('');
    setSubSaving(true);
    try {
      await onUpdateSubCategory(editTarget.id, {
        name: editSubName.trim(),
        parentId: editSubParentId,
        description: editSubDescription.trim(),
        keywords: editSubKeywords.trim(),
      });
      setEditTarget(null);
    } catch (err: any) {
      setSubModalError(err?.message || 'تعذر تحديث الفئة الفرعية');
    } finally {
      setSubSaving(false);
    }
  };

  const handleConfirmDeleteSub = async () => {
    if (!deleteTarget) return;
    setSubModalError('');
    setSubSaving(true);
    try {
      await onDeleteSubCategory(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err: any) {
      setSubModalError(err?.message || 'تعذر حذف الفئة الفرعية');
    } finally {
      setSubSaving(false);
    }
  };

  const handleSaveCommissionSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError('');
    setSettingsSuccess('');

    const parsedRate = Number(rateInput);
    if (!Number.isFinite(parsedRate) || parsedRate < 0 || parsedRate > 25) {
      setSettingsError('نسبة العمولة يجب أن تكون بين 0% و 25%');
      return;
    }
    const parsedDays = Math.max(0, Math.round(Number(promoDaysInput) || 0));
    const parsedCount = Math.max(0, Math.round(Number(promoCountInput) || 0));
    const parsedFeatured = Math.max(0, Number(featuredPriceInput) || 0);
    const cleanIban = normalizeSaudiIban(ibanInput);
    if (!isValidSaudiIban(cleanIban)) {
      setSettingsError('صيغة الآيبان غير صحيحة؛ يجب أن يبدأ بـ SA ويتبعه 22 رقماً (24 خانة إجمالاً)');
      return;
    }

    setSavingSettings(true);
    try {
      const res = await api.updateCommissionSettings({
        commissionRatePercent: parsedRate,
        promoEnabled: promoEnabledInput,
        promoFreeDays: parsedDays,
        promoFreeListingsCount: parsedCount,
        featuredWeeklyPriceSar: parsedFeatured,
        bankName: bankNameInput.trim(),
        accountHolderName: accountHolderInput.trim(),
        iban: cleanIban,
      });
      setCommissionSettings(res.settings);
      setIbanInput(res.settings.iban || '');
      setSettingsSuccess('تم حفظ إعدادات العمولة والحساب البنكي بنجاح');
      onNotify?.('تم تحديث إعدادات العمولة والحساب البنكي');
      await Promise.all([loadCommissions(0, false, false), loadOverview(), onRefreshData?.()]);
    } catch (err: any) {
      setSettingsError(err?.message || 'تعذر حفظ إعدادات العمولة والحساب البنكي');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleReviewCommission = async (
    record: CommissionRecord,
    status: 'approved' | 'rejected',
    note?: string
  ) => {
    setCommBusyId(record.id);
    setCommError('');
    setCommModalError('');
    try {
      await api.reviewCommissionRecord(record.id, status, note);
      if (rejectCommTarget?.id === record.id) {
        setRejectCommTarget(null);
        setRejectCommNote('');
      }
      onNotify?.(
        status === 'approved'
          ? record.kind === 'featured_listing'
            ? 'تم اعتماد حوالة التمييز وتفعيل تمييز الإعلان'
            : 'تم اعتماد الحوالة وإقفال سجل العمولة'
          : 'تم رفض الحوالة وإشعار البائع بالملاحظة'
      );
      await Promise.all([loadCommissions(0, false, false), loadOverview(), onRefreshData?.()]);
    } catch (err: any) {
      const msg = err?.message || 'تعذر تحديث حالة السجل المالي';
      if (rejectCommTarget?.id === record.id) {
        setCommModalError(msg);
      } else {
        setCommError(msg);
      }
    } finally {
      setCommBusyId(null);
    }
  };

  const fieldCls =
    'h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/75 focus:outline-none focus:border-[var(--color-green-ink)]';

  const subNavItems: Array<{
    id: AdminSubTab;
    label: string;
    count?: number;
    icon: typeof LayoutDashboard;
  }> = [
    { id: 'overview', label: 'نظرة عامة', icon: LayoutDashboard },
    { id: 'users', label: 'إدارة المستخدمين', count: overview?.users.total, icon: Users },
    {
      id: 'verification',
      label: 'توثيق المربين',
      count: pendingSellersCount,
      icon: UserCheck,
    },
    {
      id: 'listings',
      label: 'مراجعة الإعلانات',
      count: pendingListingsCount,
      icon: CheckCircle2,
    },
    { id: 'moderation', label: 'البلاغات والإشراف', count: openReportsCount, icon: Flag },
    {
      id: 'commissions',
      label: 'العمولة والمدفوعات',
      count: commissionSummary?.pendingReviewCount,
      icon: BadgePercent,
    },
    {
      id: 'inquiries',
      label: 'رسائل التواصل',
      count: inquirySummary?.newCount,
      icon: Mail,
    },
    { id: 'audit', label: 'سجل التدقيق', icon: ClipboardList },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-navigation Bar */}
      <nav
        aria-label="أقسام لوحة المشرف"
        className="flex flex-nowrap lg:flex-wrap items-center gap-1.5 p-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)] overflow-x-auto no-scrollbar"
      >
        {subNavItems.map((item) => {
          const Icon = item.icon;
          const active = subTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSubTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-[var(--color-green)] text-white'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface)]'
              }`}
            >
              <Icon size={14} aria-hidden="true" />
              <span>{item.label}</span>
              {typeof item.count === 'number' && item.count > 0 && (
                <span
                  className={`tabular-nums font-bold px-1.5 py-0.5 rounded text-[11px] ${
                    active
                      ? 'bg-white/15 text-[var(--color-gold)]'
                      : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-green-ink)]'
                  }`}
                >
                  {item.count.toLocaleString('en-US')}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* SECTION 1: ADMIN OVERVIEW */}
      {subTab === 'overview' && (
        <div className="space-y-6">
          {/* KPI Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-3.5 sm:p-5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] sm:text-xs font-medium text-[var(--color-muted)]">إجمالي المستخدمين</p>
                <Users size={16} className="text-[var(--color-green-ink)] shrink-0" aria-hidden="true" />
              </div>
              <p className="font-display text-xl sm:text-2xl font-extrabold text-[var(--color-ink)] tabular-nums">
                {(overview?.users.total ?? 0).toLocaleString('en-US')}
              </p>
              <p className="text-[11px] sm:text-xs text-[var(--color-muted)] tabular-nums">
                نشط: {overview?.users.active ?? 0} · موقوف: {overview?.users.suspended ?? 0}
              </p>
            </div>

            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-3.5 sm:p-5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] sm:text-xs font-medium text-[var(--color-muted)]">توثيق المربين</p>
                <ShieldCheck size={16} className="text-[var(--color-green-ink)] shrink-0" aria-hidden="true" />
              </div>
              <p className="font-display text-xl sm:text-2xl font-extrabold text-[var(--color-green-ink)] tabular-nums">
                {(overview?.sellers.verified ?? 0).toLocaleString('en-US')} موثق
              </p>
              <p className="text-[11px] sm:text-xs text-[var(--color-muted)] tabular-nums">
                قيد المراجعة: {overview?.sellers.pending ?? 0} · مرفوض: {overview?.sellers.rejected ?? 0}
              </p>
            </div>

            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-3.5 sm:p-5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] sm:text-xs font-medium text-[var(--color-muted)]">الإعلانات والاعتماد</p>
                <CheckCircle2 size={16} className="text-[var(--color-green-ink)] shrink-0" aria-hidden="true" />
              </div>
              <p className="font-display text-xl sm:text-2xl font-extrabold text-[var(--color-ink)] tabular-nums">
                {(overview?.listings.published ?? 0).toLocaleString('en-US')} منشور
              </p>
              <p className="text-[11px] sm:text-xs text-[var(--color-muted)] tabular-nums">
                بانتظار المراجعة: {overview?.listings.pending ?? 0} · مرفوض:{' '}
                {overview?.listings.rejected ?? 0}
              </p>
            </div>

            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-3.5 sm:p-5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] sm:text-xs font-medium text-[var(--color-muted)]">البلاغات المفتوحة</p>
                <Flag size={16} className="text-[var(--color-gold)] shrink-0" aria-hidden="true" />
              </div>
              <p className="font-display text-xl sm:text-2xl font-extrabold text-[var(--color-gold)] tabular-nums">
                {(overview?.reports.open ?? 0).toLocaleString('en-US')} مفتوح
              </p>
              <p className="text-[11px] sm:text-xs text-[var(--color-muted)] tabular-nums">
                إعلانات: {overview?.reports.listingReportsOpen ?? 0} · تعليقات:{' '}
                {overview?.reports.commentReportsOpen ?? 0}
              </p>
            </div>
          </div>

          {/* Pending Action Queues + Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 space-y-4">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--color-border)]">
                <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
                  مهام المراجعة العاجلة
                </h2>
                <button
                  type="button"
                  onClick={loadOverview}
                  disabled={loadingOverview}
                  className="text-xs font-semibold text-[var(--color-green-ink)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw size={13} className={loadingOverview ? 'animate-spin' : ''} />
                  <span>تحديث</span>
                </button>
              </div>

              <div className="divide-y divide-[var(--color-border)] text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setListingStatusFilter('Pending');
                    setSubTab('listings');
                  }}
                  className="w-full py-3 flex items-center justify-between text-right hover:bg-[var(--color-cream)]/60 px-2 rounded-lg transition-colors cursor-pointer"
                >
                  <span className="font-medium text-[var(--color-ink)]">إعلانات بانتظار الاعتماد</span>
                  <span className="font-bold text-[var(--color-green-ink)] tabular-nums">
                    {pendingListingsCount.toLocaleString('en-US')}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSellerStatusFilter('Pending');
                    setSubTab('verification');
                  }}
                  className="w-full py-3 flex items-center justify-between text-right hover:bg-[var(--color-cream)]/60 px-2 rounded-lg transition-colors cursor-pointer"
                >
                  <span className="font-medium text-[var(--color-ink)]">طلبات توثيق المربين</span>
                  <span className="font-bold text-[var(--color-green-ink)] tabular-nums">
                    {pendingSellersCount.toLocaleString('en-US')}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setReportStatusFilter('open');
                    setSubTab('moderation');
                  }}
                  className="w-full py-3 flex items-center justify-between text-right hover:bg-[var(--color-cream)]/60 px-2 rounded-lg transition-colors cursor-pointer"
                >
                  <span className="font-medium text-[var(--color-ink)]">بلاغات الإعلانات والتعليقات المفتوحة</span>
                  <span className="font-bold text-[var(--color-gold)] tabular-nums">
                    {openReportsCount.toLocaleString('en-US')}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setUserStatusFilter('suspended');
                    setSubTab('users');
                  }}
                  className="w-full py-3 flex items-center justify-between text-right hover:bg-[var(--color-cream)]/60 px-2 rounded-lg transition-colors cursor-pointer"
                >
                  <span className="font-medium text-[var(--color-ink)]">حسابات المستخدمين الموقوفة</span>
                  <span className="font-bold text-[var(--color-muted)] tabular-nums">
                    {(overview?.users.suspended ?? 0).toLocaleString('en-US')}
                  </span>
                </button>
              </div>
            </div>

            <div className="lg:col-span-7 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 space-y-4">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--color-border)]">
                <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
                  أحدث الأنشطة الإدارية
                </h2>
                <button
                  type="button"
                  onClick={() => setSubTab('audit')}
                  className="text-xs font-semibold text-[var(--color-green-ink)] hover:underline cursor-pointer"
                >
                  عرض سجل التدقيق الكامل
                </button>
              </div>

              {(overview?.recentActivity || auditLogs).length === 0 ? (
                <p className="text-sm text-[var(--color-muted)] py-4">
                  لا توجد أنشطة إدارية مسجلة بعد.
                </p>
              ) : (
                <div className="divide-y divide-[var(--color-border)]">
                  {(overview?.recentActivity || auditLogs).slice(0, 6).map((log) => (
                    <div
                      key={log.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-[var(--color-green-ink)]">
                          {log.action}
                        </span>
                        <span aria-hidden="true" className="mx-1.5 text-[var(--color-muted)]">
                          ·
                        </span>
                        <span className="text-[var(--color-ink)]">{log.actorName}</span>
                        {log.note && (
                          <p className="text-[var(--color-muted)] mt-0.5 truncate">{log.note}</p>
                        )}
                      </div>
                      <span className="text-[var(--color-muted)] shrink-0 tabular-nums">
                        {formatRelativeArabicTime(log.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <Suspense fallback={<AnalyticsFallback />}>
            <DashboardAnalytics listings={allListings} regions={regions} isAdmin={true} />
          </Suspense>
        </div>
      )}

      {/* SECTION 2: USER MANAGEMENT */}
      {subTab === 'users' && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-[var(--color-border)]">
            <div>
              <h2 className="font-display text-xl font-bold text-[var(--color-ink)]">
                إدارة المستخدمين وحالة الحسابات ({usersTotal.toLocaleString('en-US')})
              </h2>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                البحث عن الحسابات المسجلة ومراجعة نشاطها، مع إمكانية إيقاف الحسابات المخالفة أو إعادة تفعيلها مع توثيق السبب.
              </p>
            </div>
            <button
              type="button"
              onClick={() => loadUsers(0, false)}
              disabled={loadingUsers}
              className="min-h-[44px] sm:min-h-[36px] px-3.5 rounded-lg border border-[var(--color-border)] text-xs font-semibold text-[var(--color-ink)] hover:bg-[var(--color-cream)] inline-flex items-center gap-1.5 self-start cursor-pointer disabled:opacity-60"
            >
              <RefreshCw size={13} className={loadingUsers ? 'animate-spin' : ''} aria-hidden="true" />
              <span>تحديث القائمة</span>
            </button>
          </div>

          {/* Search & Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search
                size={15}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
                aria-hidden="true"
              />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="ابحث بالاسم، الجوال، أو اسم المراح..."
                aria-label="البحث عن مستخدم"
                className="w-full h-10 pr-9 pl-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)]/40 text-xs text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
              />
            </div>

            <select
              aria-label="تصفية حسب نوع الحساب"
              value={userRoleFilter}
              onChange={(e) => setUserRoleFilter(e.target.value)}
              className={fieldCls}
            >
              <option value="all">جميع الأدوار</option>
              <option value="buyer">مشتري</option>
              <option value="seller">بائع / مربي</option>
              <option value="admin">مشرف</option>
            </select>

            <select
              aria-label="تصفية حسب حالة الحساب"
              value={userStatusFilter}
              onChange={(e) => setUserStatusFilter(e.target.value)}
              className={fieldCls}
            >
              <option value="all">جميع الحالات</option>
              <option value="active">نشط</option>
              <option value="suspended">موقوف</option>
            </select>

            <select
              aria-label="تصفية حسب حالة التوثيق"
              value={userVerifFilter}
              onChange={(e) => setUserVerifFilter(e.target.value)}
              className={fieldCls}
            >
              <option value="all">كل حالات التوثيق</option>
              <option value="Pending">توثيق قيد المراجعة</option>
              <option value="Verified">مربي موثق</option>
              <option value="Rejected">توثيق مرفوض</option>
            </select>
          </div>

          {usersError && (
            <p
              role="alert"
              className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
            >
              {usersError}
            </p>
          )}

          {/* Mobile Users Cards (< 768px) */}
          <div className="md:hidden space-y-3">
            {loadingUsers && adminUsers.length === 0 ? (
              <p className="py-8 text-center text-xs text-[var(--color-muted)]">
                جاري تحميل المستخدمين...
              </p>
            ) : adminUsers.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--color-muted)]">
                لا توجد حسابات مطابقة لمعايير البحث الحالية.
              </p>
            ) : (
              adminUsers.map((u) => {
                const isSelf = u.id === currentUser.id;
                const isLastActiveAdmin =
                  allUsersInView &&
                  u.role === 'admin' &&
                  u.status === 'active' &&
                  activeAdminCount <= 1;
                const suspendDisabled = isSelf || isLastActiveAdmin;

                return (
                  <article
                    key={u.id}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/30 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-display font-bold text-sm text-[var(--color-ink)] break-words">
                          {u.name}
                          {isSelf && (
                            <span className="mr-1.5 text-[11px] font-medium text-[var(--color-green-ink)]">
                              (أنت)
                            </span>
                          )}
                        </p>
                        {u.sellerProfile && (
                          <p className="text-xs text-[var(--color-muted)] mt-0.5">
                            {u.sellerProfile.displayName} · {u.sellerProfile.city}
                          </p>
                        )}
                      </div>
                      {u.status === 'active' ? (
                        <span className="shrink-0 px-2 py-0.5 rounded-md border border-[var(--color-green-ink)]/25 bg-[var(--color-green)]/10 text-[11px] font-semibold text-[var(--color-green-ink)]">
                          نشط
                        </span>
                      ) : (
                        <span className="shrink-0 px-2 py-0.5 rounded-md border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-[11px] font-semibold text-red-700 dark:text-red-300">
                          موقوف
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-muted)] tabular-nums">
                      <span>الجوال: {u.phone || 'غير مضاف'}</span>
                      <span>
                        {u.role === 'admin'
                          ? 'مشرف'
                          : u.role === 'seller'
                          ? 'بائع / مربي'
                          : 'مشتري'}
                        {' · '}
                        {u.listingsCount} إعلان
                      </span>
                    </div>

                    {u.sellerProfile && (
                      <p
                        className={`text-xs font-semibold ${verificationStatusTextClass(
                          u.sellerProfile.verificationStatus
                        )}`}
                      >
                        توثيق: {verificationStatusLabel(u.sellerProfile.verificationStatus)}
                      </p>
                    )}

                    {u.status !== 'active' && u.suspensionReason && (
                      <p className="text-xs text-red-700 dark:text-red-400">
                        سبب الإيقاف: {u.suspensionReason}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--color-border)]">
                      <span className="text-[11px] text-[var(--color-muted)]">
                        {formatRelativeArabicTime(u.createdAt)}
                      </span>
                      {u.status === 'active' ? (
                        <button
                          type="button"
                          disabled={suspendDisabled}
                          onClick={() => {
                            setUserModalError('');
                            setSuspendReason('');
                            setSuspendTarget(u);
                          }}
                          className="min-h-[44px] px-3.5 py-2 rounded-lg border border-red-200 dark:border-red-900/60 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                        >
                          <UserX size={13} aria-hidden="true" />
                          <span>
                            {isSelf
                              ? 'حسابك الحالي'
                              : isLastActiveAdmin
                              ? 'آخر مشرف نشط'
                              : 'إيقاف الحساب'}
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setUserModalError('');
                            setReactivateNote('');
                            setReactivateTarget(u);
                          }}
                          className="min-h-[44px] px-3.5 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <UserCheck size={13} aria-hidden="true" />
                          <span>إعادة التفعيل</span>
                        </button>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>

          {/* Desktop Users Table (768px+) */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-[var(--color-border)]">
            <table className="w-full text-right text-sm border-collapse min-w-[780px]">
              <thead>
                <tr className="bg-[var(--color-cream)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted)]">
                  <th className="py-3 px-4">المستخدم</th>
                  <th className="py-3 px-4">الجوال</th>
                  <th className="py-3 px-4">الدور والتوثيق</th>
                  <th className="py-3 px-4">الحالة</th>
                  <th className="py-3 px-4">الإعلانات</th>
                  <th className="py-3 px-4">تاريخ التسجيل</th>
                  <th className="py-3 px-4 text-left">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {loadingUsers && adminUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-xs text-[var(--color-muted)]">
                      جاري تحميل المستخدمين...
                    </td>
                  </tr>
                ) : adminUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-sm text-[var(--color-muted)]">
                      لا توجد حسابات مطابقة لمعايير البحث الحالية.
                    </td>
                  </tr>
                ) : (
                  adminUsers.map((u) => {
                    const isSelf = u.id === currentUser.id;
                    const isLastActiveAdmin =
                      allUsersInView &&
                      u.role === 'admin' &&
                      u.status === 'active' &&
                      activeAdminCount <= 1;
                    const suspendDisabled = isSelf || isLastActiveAdmin;

                    return (
                      <tr key={u.id} className="hover:bg-[var(--color-cream)]/30 align-top">
                        <td className="py-3.5 px-4">
                          <p className="font-display font-bold text-[var(--color-ink)]">
                            {u.name}
                            {isSelf && (
                              <span className="mr-1.5 text-[11px] font-medium text-[var(--color-green-ink)]">
                                (أنت)
                              </span>
                            )}
                          </p>
                          {u.sellerProfile && (
                            <p className="text-xs text-[var(--color-muted)] mt-0.5">
                              {u.sellerProfile.displayName} · {u.sellerProfile.city}
                            </p>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-xs font-medium text-[var(--color-ink)] tabular-nums whitespace-nowrap">
                          {u.phone || 'غير مضاف'}
                        </td>
                        <td className="py-3.5 px-4 text-xs whitespace-nowrap">
                          <span className="font-semibold text-[var(--color-ink)]">
                            {u.role === 'admin'
                              ? 'مشرف'
                              : u.role === 'seller'
                              ? 'بائع / مربي'
                              : 'مشتري'}
                          </span>
                          {u.sellerProfile && (
                            <span
                              className={`block mt-0.5 font-semibold ${verificationStatusTextClass(
                                u.sellerProfile.verificationStatus
                              )}`}
                            >
                              توثيق: {verificationStatusLabel(u.sellerProfile.verificationStatus)}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-xs">
                          {u.status === 'active' ? (
                            <span className="font-semibold text-[var(--color-green-ink)]">نشط</span>
                          ) : (
                            <div>
                              <span className="font-semibold text-red-700 dark:text-red-400">
                                موقوف
                              </span>
                              {u.suspensionReason && (
                                <p className="text-[11px] text-[var(--color-muted)] mt-0.5 max-w-[200px]">
                                  {u.suspensionReason}
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-[var(--color-ink)] tabular-nums whitespace-nowrap">
                          {u.listingsCount} ({u.publishedListingsCount} منشور)
                        </td>
                        <td className="py-3.5 px-4 text-xs text-[var(--color-muted)] whitespace-nowrap">
                          {formatRelativeArabicTime(u.createdAt)}
                        </td>
                        <td className="py-3.5 px-4 text-left whitespace-nowrap">
                          {u.status === 'active' ? (
                            <button
                              type="button"
                              disabled={suspendDisabled}
                              title={
                                isSelf
                                  ? 'لا يمكنك إيقاف حسابك الشخصي'
                                  : isLastActiveAdmin
                                  ? 'لا يمكن إيقاف آخر مشرف نشط في المنصة'
                                  : 'إيقاف الحساب'
                              }
                              onClick={() => {
                                setUserModalError('');
                                setSuspendReason('');
                                setSuspendTarget(u);
                              }}
                              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                            >
                              <UserX size={13} aria-hidden="true" />
                              <span>
                                {isSelf
                                  ? 'حسابك الحالي'
                                  : isLastActiveAdmin
                                  ? 'آخر مشرف نشط'
                                  : 'إيقاف الحساب'}
                              </span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setUserModalError('');
                                setReactivateNote('');
                                setReactivateTarget(u);
                              }}
                              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <UserCheck size={13} aria-hidden="true" />
                              <span>إعادة التفعيل</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <AdminPaginationFooter
            shownCount={adminUsers.length}
            totalCount={usersTotal}
            hasMore={usersHasMore}
            loadingMore={loadingMoreUsers}
            itemLabel="مستخدم"
            onLoadMore={() => {
              if (usersNextOffset !== null) loadUsers(usersNextOffset, true);
            }}
          />
        </div>
      )}

      {/* SECTION 3: SELLER VERIFICATION WORKFLOW */}
      {subTab === 'verification' && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-[var(--color-border)]">
            <div>
              <h2 className="font-display text-xl font-bold text-[var(--color-ink)]">
                سير عمل توثيق المربين ({sellersTotal.toLocaleString('en-US')})
              </h2>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                مراجعة طلبات المربين ومنح شارة «مربي موثق» أو رفض الطلب مع ذكر السبب لتحسين جودة المراحات الموثقة.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)]">
              {(
                [
                  { id: 'Pending', label: 'قيد المراجعة' },
                  { id: 'Verified', label: 'موثق' },
                  { id: 'Rejected', label: 'مرفوض' },
                  { id: 'all', label: 'الكل' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSellerStatusFilter(tab.id)}
                  className={`min-h-[44px] sm:min-h-[34px] px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                    sellerStatusFilter === tab.id
                      ? 'bg-[var(--color-green)] text-white'
                      : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative max-w-sm">
            <Search
              size={15}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
              aria-hidden="true"
            />
            <input
              type="text"
              value={sellerSearch}
              onChange={(e) => setSellerSearch(e.target.value)}
              placeholder="ابحث باسم المراح، المربي، المدينة، أو الجوال..."
              aria-label="البحث في طلبات التوثيق"
              className="w-full h-10 pr-9 pl-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)]/40 text-xs text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
            />
          </div>

          {sellersError && (
            <p
              role="alert"
              className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
            >
              {sellersError}
            </p>
          )}

          {loadingSellers && adminSellers.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)] py-6 text-center">
              جاري تحميل ملفات المربين...
            </p>
          ) : adminSellers.length === 0 ? (
            <div className="py-8 text-center rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/30">
              <p className="text-sm font-semibold text-[var(--color-ink)]">
                لا توجد ملفات مربين ضمن هذه الحالة حالياً
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {adminSellers.map((entry) => {
                const sp = entry.sellerProfile!;
                const busy = sellerReviewBusyId === entry.id;
                return (
                  <article
                    key={entry.id}
                    className="p-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/40 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={`font-bold ${verificationStatusTextClass(
                            sp.verificationStatus
                          )}`}
                        >
                          {verificationStatusLabel(sp.verificationStatus)}
                        </span>
                        <span aria-hidden="true" className="text-[var(--color-muted)]">
                          ·
                        </span>
                        <span className="text-[var(--color-muted)]">{sp.city}</span>
                        <span aria-hidden="true" className="text-[var(--color-muted)]">
                          ·
                        </span>
                        <span className="text-[var(--color-muted)]">{sp.specialty}</span>
                        <span aria-hidden="true" className="text-[var(--color-muted)]">
                          ·
                        </span>
                        <span className="text-[var(--color-muted)] tabular-nums">
                          خبرة {sp.yearsExperience} سنوات · {entry.listingsCount} إعلان
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-base font-bold text-[var(--color-ink)]">
                          {sp.displayName}
                        </h3>
                        {sp.verificationStatus === 'Verified' && (
                          <VerifiedSellerBadge variant="compact" />
                        )}
                      </div>

                      <p className="text-xs text-[var(--color-muted)] tabular-nums">
                        صاحب الحساب: {entry.name} · الجوال: {entry.phone || 'غير مضاف'}
                        {entry.status === 'suspended' ? ' · (حساب موقوف)' : ''}
                      </p>

                      {sp.verificationNote && (
                        <p className="text-xs text-[var(--color-ink)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 inline-block mt-1">
                          ملاحظة المراجعة: {sp.verificationNote}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {sp.verificationStatus !== 'Verified' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleSellerDecision(entry, 'Verified')}
                          className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                        >
                          <ShieldCheck size={14} aria-hidden="true" />
                          <span>اعتماد التوثيق</span>
                        </button>
                      )}

                      {sp.verificationStatus !== 'Rejected' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setSellerModalError('');
                            setRejectSellerReason('');
                            setRejectSellerTarget(entry);
                          }}
                          className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-lg border border-red-300 dark:border-red-900/60 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                        >
                          <XCircle size={14} aria-hidden="true" />
                          <span>رفض التوثيق</span>
                        </button>
                      )}

                      {sp.verificationStatus !== 'Pending' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleSellerDecision(entry, 'Pending')}
                          className="min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)] text-xs font-semibold text-[var(--color-ink)] cursor-pointer disabled:opacity-60"
                        >
                          إعادة للمراجعة
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <AdminPaginationFooter
            shownCount={adminSellers.length}
            totalCount={sellersTotal}
            hasMore={sellersHasMore}
            loadingMore={loadingMoreSellers}
            itemLabel="مربي"
            onLoadMore={() => {
              if (sellersNextOffset !== null) loadSellers(sellersNextOffset, true);
            }}
          />
        </div>
      )}

      {/* SECTION 4: LISTINGS MODERATION + CATEGORIES & BREEDS */}
      {subTab === 'listings' && (
        <div className="space-y-8">
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-[var(--color-border)]">
              <div>
                <h2 className="font-display text-xl font-bold text-[var(--color-ink)]">
                  مراجعة واعتماد الإعلانات ({filteredListings.length})
                </h2>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">
                  اعتماد الإعلانات المعلقة أو رفضها مع تحديد سبب واضح يصل للبائع فوراً في إشعاراته ولوحة حسابه.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)]">
                {(
                  [
                    { id: 'Pending', label: `بانتظار المراجعة (${allListings.filter((l) => l.status === 'Pending').length})` },
                    { id: 'Published', label: 'المنشورة' },
                    { id: 'Rejected', label: 'المرفوضة' },
                    { id: 'Draft', label: 'المسودات' },
                    { id: 'Expired', label: 'منتهية الصلاحية' },
                    { id: 'Sold', label: 'المباعة' },
                    { id: 'all', label: 'الكل' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setListingStatusFilter(tab.id)}
                    className={`min-h-[44px] sm:min-h-[34px] px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                      listingStatusFilter === tab.id
                        ? 'bg-[var(--color-green)] text-white'
                        : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative max-w-sm">
              <Search
                size={15}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
                aria-hidden="true"
              />
              <input
                type="text"
                value={listingSearch}
                onChange={(e) => setListingSearch(e.target.value)}
                placeholder="ابحث بعنوان الإعلان، المدينة، أو الوصف..."
                aria-label="البحث في الإعلانات"
                className="w-full h-10 pr-9 pl-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)]/40 text-xs text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
              />
            </div>

            {listingActionError && (
              <p
                role="alert"
                className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
              >
                {listingActionError}
              </p>
            )}

            {filteredListings.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)] py-4">
                لا توجد إعلانات مطابقة لهذه التصفية حالياً.
              </p>
            ) : (
              <div className="space-y-4">
                {visibleListings.map((item) => {
                  const breed = breeds.find((b) => b.id === item.breedId);
                  const region = regions.find((r) => r.id === item.regionId);
                  const seller = sellers.find((s) => s.userId === item.sellerId);
                  const busy = listingBusyId === item.id;
                  const thumbUrl = item.images[0]?.url || breed?.imageUrl;

                  return (
                    <div
                      key={item.id}
                      className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/40 flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div className="w-20 h-16 rounded-lg overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
                          <SafeImage
                            src={thumbUrl}
                            alt={item.title}
                            width={800}
                            height={597}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-muted)]">
                            <span
                              className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${
                                item.status === 'Published'
                                  ? 'bg-[var(--color-green)]/10 text-[var(--color-green-ink)] border-[var(--color-green-ink)]/25'
                                  : item.status === 'Rejected'
                                  ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/60'
                                  : 'bg-[var(--color-gold-soft)] text-[var(--color-ink)] border-[var(--color-gold)]/35'
                              }`}
                            >
                              {formatStatusLabel(item.status)}
                            </span>
                            {item.status === 'Pending' && item.updatedAt > item.createdAt && (
                              <span className="px-2 py-0.5 rounded-md border border-[var(--color-gold)]/40 bg-[var(--color-gold-soft)] text-[11px] font-semibold text-[var(--color-ink)]">
                                مُعاد للمراجعة
                              </span>
                            )}
                            <span aria-hidden="true">·</span>
                            <span>{breed?.name}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {region?.name} — {item.city}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums font-bold text-[var(--color-green-ink)]">
                              {formatPriceSar(item.priceAmount)}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <button
                              type="button"
                              onClick={() => onSelectListing(item)}
                              className="font-display text-base font-bold text-[var(--color-ink)] hover:text-[var(--color-green-ink)] text-right cursor-pointer inline-flex items-center gap-1"
                            >
                              <span>{item.title}</span>
                              <ExternalLink size={13} aria-hidden="true" />
                            </button>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)] mt-1">
                            <span>البائع: {seller?.displayName || item.sellerId}</span>
                            {isSellerVerified(seller) && <VerifiedSellerBadge variant="compact" />}
                          </div>

                          <p className="text-xs text-[var(--color-muted)] mt-1 line-clamp-2">
                            {item.description}
                          </p>

                          {item.rejectionReason && (
                            <p className="text-xs text-red-700 dark:text-red-400 mt-1.5 font-medium">
                              سبب الرفض المسجل: {item.rejectionReason}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {item.status !== 'Published' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleApprove(item)}
                            className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                          >
                            <CheckCircle2 size={15} aria-hidden="true" />
                            <span>اعتماد ونشر</span>
                          </button>
                        )}
                        {item.status !== 'Rejected' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setListingActionError('');
                              setRejectReason('');
                              setRejectTargetListing(item);
                            }}
                            className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-lg border border-red-300 dark:border-red-900/60 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                          >
                            <XCircle size={15} aria-hidden="true" />
                            <span>رفض</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <AdminPaginationFooter
                  shownCount={visibleListings.length}
                  totalCount={filteredListings.length}
                  hasMore={visibleListings.length < filteredListings.length}
                  loadingMore={false}
                  itemLabel="إعلان"
                  onLoadMore={() => setListingsVisibleLimit((prev) => prev + 25)}
                />
              </div>
            )}
          </div>

          {/* Smart Listing Categorization Section (Preserved) */}
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--color-border)]">
              <div>
                <h2 className="font-display text-xl font-bold text-[var(--color-ink)]">
                  التصنيف الذكي للإعلانات (الفئات الفرعية)
                </h2>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  استعرض وأدر الفئات الفرعية للإعلانات مثل «مواشي للتربية» و«ذبائح» و«مواشي للعرض» مع الكلمات المفتاحية لتسهيل الفلترة على المستخدمين.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus size={15} aria-hidden="true" />
                  <span>إنشاء فئة فرعية</span>
                </button>

                <button
                  type="button"
                  disabled={autoRunning}
                  onClick={async () => {
                    setAutoRunning(true);
                    try {
                      await onAutoCategorizeListings();
                    } finally {
                      setAutoRunning(false);
                    }
                  }}
                  className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-lg bg-[var(--color-gold)] hover:bg-[var(--color-gold-hover)] text-[#14261D] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <Sparkles size={15} aria-hidden="true" />
                  <span>{autoRunning ? 'جاري التصنيف...' : 'تصنيف تلقائي ذكي'}</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search
                  size={15}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={subSearch}
                  onChange={(e) => setSubSearch(e.target.value)}
                  placeholder="ابحث باسم الفئة أو الكلمة المفتاحية..."
                  className="w-full h-10 pr-9 pl-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)]/40 text-xs text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/75 focus:outline-none focus:border-[var(--color-green-ink)]"
                />
              </div>

              <div className="flex items-center gap-2">
                <label
                  htmlFor="sub-parent-filter"
                  className="text-xs text-[var(--color-muted)] whitespace-nowrap"
                >
                  التصنيف الرئيسي:
                </label>
                <select
                  id="sub-parent-filter"
                  value={subParentFilter}
                  onChange={(e) => setSubParentFilter(e.target.value)}
                  className="h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                >
                  <option value="all">الكل ({subCategories.length})</option>
                  {mainCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Mobile Sub-Categories Cards (< 768px) */}
            <div className="md:hidden space-y-3">
              {filteredSubCategories.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--color-muted)]">
                  {subCategories.length === 0
                    ? 'لا توجد فئات فرعية مضافة حالياً. اضغط على «إنشاء فئة فرعية» للبدء.'
                    : 'لا توجد فئات فرعية مطابقة لخيار البحث المحدد.'}
                </p>
              ) : (
                filteredSubCategories.map((sub) => {
                  const parentName =
                    mainCategories.find((m) => m.id === sub.parentId)?.name || 'عام';
                  const count = allListings.filter((l) => l.subCategoryId === sub.id).length;

                  return (
                    <article
                      key={sub.id}
                      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/30 p-4 space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-display font-bold text-sm text-[var(--color-ink)]">
                            {sub.name}
                          </h3>
                          <p className="text-xs text-[var(--color-muted)]">{parentName}</p>
                        </div>
                        <span className="text-xs font-bold text-[var(--color-green-ink)] tabular-nums shrink-0">
                          {count} إعلان
                        </span>
                      </div>

                      {sub.description && (
                        <p className="text-xs text-[var(--color-ink)]">{sub.description}</p>
                      )}
                      {sub.keywords && sub.keywords.length > 0 && (
                        <p className="text-[11px] text-[var(--color-muted)]">
                          المطابقة: {sub.keywords.join(' · ')}
                        </p>
                      )}

                      <div className="flex items-center gap-2 pt-2 border-t border-[var(--color-border)]">
                        <button
                          type="button"
                          onClick={() => openEditModal(sub)}
                          className="flex-1 min-h-[44px] px-3 py-2 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-ink)] hover:bg-[var(--color-cream)] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Pencil size={13} aria-hidden="true" />
                          <span>تعديل</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSubModalError('');
                            setDeleteTarget(sub);
                          }}
                          className="flex-1 min-h-[44px] px-3 py-2 rounded-lg border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 size={13} aria-hidden="true" />
                          <span>حذف</span>
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            {/* Desktop Sub-Categories Table (768px+) */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-[var(--color-border)]">
              <table className="w-full text-right text-sm border-collapse">
                <thead>
                  <tr className="bg-[var(--color-cream)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted)]">
                    <th className="py-3 px-4">الفئة الفرعية</th>
                    <th className="py-3 px-4">التصنيف الرئيسي</th>
                    <th className="py-3 px-4">الوصف والكلمات المفتاحية</th>
                    <th className="py-3 px-4">عدد الإعلانات</th>
                    <th className="py-3 px-4 text-left">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
                  {filteredSubCategories.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-8 px-4 text-center text-sm text-[var(--color-muted)]"
                      >
                        {subCategories.length === 0
                          ? 'لا توجد فئات فرعية مضافة حالياً. اضغط على «إنشاء فئة فرعية» للبدء.'
                          : 'لا توجد فئات فرعية مطابقة لخيار البحث المحدد.'}
                      </td>
                    </tr>
                  ) : (
                    filteredSubCategories.map((sub) => {
                      const parentName =
                        mainCategories.find((m) => m.id === sub.parentId)?.name || 'عام';
                      const count = allListings.filter((l) => l.subCategoryId === sub.id).length;

                      return (
                        <tr key={sub.id} className="hover:bg-[var(--color-cream)]/40">
                          <td className="py-3.5 px-4 font-display font-bold text-[var(--color-ink)] whitespace-nowrap">
                            {sub.name}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-[var(--color-muted)] whitespace-nowrap">
                            {parentName}
                          </td>
                          <td className="py-3.5 px-4 max-w-md">
                            {sub.description && (
                              <p className="text-xs text-[var(--color-ink)] line-clamp-1">
                                {sub.description}
                              </p>
                            )}
                            {sub.keywords && sub.keywords.length > 0 && (
                              <p className="text-[11px] text-[var(--color-muted)] mt-0.5 line-clamp-1">
                                المطابقة: {sub.keywords.join(' · ')}
                              </p>
                            )}
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-[var(--color-green-ink)] tabular-nums whitespace-nowrap">
                            {count} إعلان
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => openEditModal(sub)}
                                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-ink)] hover:bg-[var(--color-cream)] inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Pencil size={13} aria-hidden="true" />
                                <span>تعديل</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSubModalError('');
                                  setDeleteTarget(sub);
                                }}
                                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Trash2 size={13} aria-hidden="true" />
                                <span>حذف</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="pt-4 border-t border-[var(--color-border)]">
              <p className="text-sm font-bold text-[var(--color-ink)] mb-3">
                تخصيص الفئة الفرعية للإعلانات الحالية
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-muted)]">
                      <th className="py-2 px-3">عنوان الإعلان</th>
                      <th className="py-2 px-3">الحالة</th>
                      <th className="py-2 px-3">الفئة الفرعية المسندة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {visibleCategorizeListings.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2.5 px-3 font-medium text-[var(--color-ink)]">
                          {item.title}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-[var(--color-muted)]">
                          {formatStatusLabel(item.status)}
                        </td>
                        <td className="py-2.5 px-3">
                          <select
                            aria-label={`الفئة الفرعية لإعلان ${item.title}`}
                            value={item.subCategoryId || ''}
                            onChange={(e) =>
                              onAutoCategorizeListings({
                                listingId: item.id,
                                subCategoryId: e.target.value,
                              })
                            }
                            className="h-11 sm:h-9 px-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-ink)]"
                          >
                            <option value="">غير مصنف</option>
                            {subCategories.map((sub) => (
                              <option key={sub.id} value={sub.id}>
                                {sub.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <AdminPaginationFooter
                shownCount={visibleCategorizeListings.length}
                totalCount={allListings.length}
                hasMore={visibleCategorizeListings.length < allListings.length}
                loadingMore={false}
                itemLabel="إعلان"
                onLoadMore={() => setCategorizeVisibleLimit((prev) => prev + 25)}
              />
            </div>
          </div>

          {/* Add New Breed */}
          <form
            onSubmit={handleAddBreedSubmit}
            className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 space-y-4 max-w-2xl"
          >
            <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
              إضافة سلالة جديدة إلى قاعدة البيانات
            </h2>
            <p className="text-xs text-[var(--color-muted)]">
              أضف سلالات جديدة لتظهر فوراً في نموذج إضافة الإعلان وفلاتر البحث ودليل السلالات.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="اسم السلالة (مثال: رفيدي)"
                value={breedName}
                onChange={(e) => setBreedName(e.target.value)}
                required
                className={fieldCls}
              />
              <select
                value={breedCategoryId}
                onChange={(e) => setBreedCategoryId(e.target.value)}
                className={fieldCls}
              >
                {mainCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="text"
              placeholder="الموطن (مثال: جنوب المملكة)"
              value={breedOrigin}
              onChange={(e) => setBreedOrigin(e.target.value)}
              className={`w-full ${fieldCls}`}
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold cursor-pointer"
            >
              حفظ السلالة الجديدة
            </button>
          </form>
        </div>
      )}

      {/* SECTION 5: UNIFIED MODERATION (REPORTS + PUBLIC COMMENTS) */}
      {subTab === 'moderation' && (
        <div className="space-y-8">
          {/* Unified Reports Center (Listings & Comments) */}
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-[var(--color-border)]">
              <div>
                <h2 className="font-display text-xl font-bold text-[var(--color-ink)] inline-flex items-center gap-2">
                  <Flag size={18} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                  <span>مركز البلاغات الموحد للإعلانات والتعليقات ({reportsTotal.toLocaleString('en-US')})</span>
                </h2>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">
                  متابعة ومعالجة بلاغات المستخدمين على الإعلانات والتعليقات العامة واتخاذ الإجراء المناسب مع توثيقه في سجل التدقيق.
                </p>
              </div>
              <button
                type="button"
                onClick={() => loadReports(0, false)}
                disabled={loadingReports}
                className="min-h-[44px] sm:min-h-[36px] px-3.5 rounded-lg border border-[var(--color-border)] text-xs font-semibold text-[var(--color-ink)] hover:bg-[var(--color-cream)] inline-flex items-center gap-1.5 self-start cursor-pointer disabled:opacity-60"
              >
                <RefreshCw size={13} className={loadingReports ? 'animate-spin' : ''} aria-hidden="true" />
                <span>تحديث</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative">
                <Search
                  size={15}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={reportSearch}
                  onChange={(e) => setReportSearch(e.target.value)}
                  placeholder="ابحث في البلاغات..."
                  aria-label="البحث في البلاغات"
                  className="w-full h-10 pr-9 pl-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)]/40 text-xs text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                />
              </div>

              <select
                aria-label="تصفية حسب نوع البلاغ"
                value={reportTypeFilter}
                onChange={(e) => setReportTypeFilter(e.target.value as 'all' | 'listing' | 'comment')}
                className={fieldCls}
              >
                <option value="all">كل البلاغات (إعلانات وتعليقات)</option>
                <option value="listing">بلاغات الإعلانات</option>
                <option value="comment">بلاغات التعليقات</option>
              </select>

              <select
                aria-label="تصفية حسب حالة البلاغ"
                value={reportStatusFilter}
                onChange={(e) =>
                  setReportStatusFilter(
                    e.target.value as 'open' | 'resolved' | 'dismissed' | 'all'
                  )
                }
                className={fieldCls}
              >
                <option value="open">البلاغات المفتوحة</option>
                <option value="resolved">البلاغات المعالجة</option>
                <option value="dismissed">البلاغات المغلقة بدون إجراء</option>
                <option value="all">جميع الحالات</option>
              </select>
            </div>

            {reportsError && (
              <p
                role="alert"
                className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
              >
                {reportsError}
              </p>
            )}

            {loadingReports && adminReports.length === 0 ? (
              <p className="text-xs text-[var(--color-muted)] py-6 text-center">
                جاري تحميل البلاغات...
              </p>
            ) : adminReports.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)] py-4">
                لا توجد بلاغات مطابقة لهذه التصفية حالياً.
              </p>
            ) : (
              <div className="space-y-3">
                {adminReports.map((rep) => {
                  const targetListing = allListings.find((l) => l.id === rep.listingId);
                  return (
                    <div
                      key={rep.id}
                      className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/40 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-bold text-[var(--color-green-ink)]">
                            {rep.targetType === 'comment' ? 'بلاغ على تعليق' : 'بلاغ على إعلان'}
                          </span>
                          <span aria-hidden="true" className="text-[var(--color-muted)]">
                            ·
                          </span>
                          <span className="text-[var(--color-muted)]">
                            المبلّغ: {rep.reporterName}
                          </span>
                          <span aria-hidden="true" className="text-[var(--color-muted)]">
                            ·
                          </span>
                          <span className="text-[var(--color-muted)]">
                            {formatRelativeArabicTime(rep.createdAt)}
                          </span>
                          <span aria-hidden="true" className="text-[var(--color-muted)]">
                            ·
                          </span>
                          <span
                            className={`font-semibold ${
                              rep.status === 'open'
                                ? 'text-[var(--color-gold)]'
                                : 'text-[var(--color-muted)]'
                            }`}
                          >
                            {rep.status === 'open'
                              ? 'مفتوح'
                              : rep.status === 'resolved'
                              ? 'تمت المعالجة'
                              : 'مغلق'}
                          </span>
                        </div>

                        <p className="font-display text-sm font-bold text-[var(--color-ink)]">
                          {rep.reason}
                        </p>

                        {rep.details && (
                          <p className="text-xs text-[var(--color-muted)]">{rep.details}</p>
                        )}

                        {rep.listingTitle && (
                          <p className="text-xs text-[var(--color-muted)]">
                            الإعلان:{' '}
                            {targetListing ? (
                              <button
                                type="button"
                                onClick={() => onSelectListing(targetListing)}
                                className="font-semibold text-[var(--color-green-ink)] hover:underline cursor-pointer"
                              >
                                {rep.listingTitle}
                              </button>
                            ) : (
                              <span className="font-semibold text-[var(--color-ink)]">
                                {rep.listingTitle}
                              </span>
                            )}
                          </p>
                        )}

                        {rep.targetType === 'comment' && rep.commentBody && (
                          <div className="p-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-ink)] mt-1">
                            <span className="font-semibold text-[var(--color-muted)]">
                              نص التعليق ({rep.commentAuthorName || 'مستخدم'}):{' '}
                            </span>
                            <span>«{rep.commentBody}»</span>
                          </div>
                        )}

                        {rep.resolutionNote && (
                          <p className="text-xs text-[var(--color-green-ink)] font-medium">
                            نتيجة المعالجة: {rep.resolutionNote}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {rep.status === 'open' && rep.targetType === 'comment' && rep.commentId && rep.commentBody && (
                          <button
                            type="button"
                            disabled={moderatingCommentId === rep.commentId}
                            onClick={() =>
                              handleModerateAdminComment(
                                rep.commentId!,
                                `إزالة بناءً على بلاغ: ${rep.reason}`
                              )
                            }
                            className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-900/60 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                          >
                            <ShieldAlert size={13} aria-hidden="true" />
                            <span>إزالة التعليق</span>
                          </button>
                        )}

                        {rep.status === 'open' && rep.targetType === 'listing' && targetListing && (
                          <button
                            type="button"
                            onClick={() => {
                              setListingActionError('');
                              setRejectReason('');
                              setRejectTargetListing(targetListing);
                            }}
                            className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-900/60 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold cursor-pointer"
                          >
                            رفض الإعلان
                          </button>
                        )}

                        {rep.status === 'open' && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setReportModalError('');
                                setResolveNote('');
                                setResolveTargetReport({ report: rep, nextStatus: 'resolved' });
                              }}
                              className="min-h-[44px] sm:min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold cursor-pointer"
                            >
                              تمت المعالجة
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setReportModalError('');
                                setResolveNote('');
                                setResolveTargetReport({ report: rep, nextStatus: 'dismissed' });
                              }}
                              className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)] text-xs font-semibold text-[var(--color-ink)] cursor-pointer"
                            >
                              إغلاق
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <AdminPaginationFooter
              shownCount={adminReports.length}
              totalCount={reportsTotal}
              hasMore={reportsHasMore}
              loadingMore={loadingMoreReports}
              itemLabel="بلاغ"
              onLoadMore={() => {
                if (reportsNextOffset !== null) loadReports(reportsNextOffset, true);
              }}
            />
          </div>

          {/* Admin Comments Moderation Feed */}
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-[var(--color-ink)] inline-flex items-center gap-2">
                  <MessageCircle size={18} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                  <span>سجل الأسئلة والتعليقات العامة ({commentsTotal.toLocaleString('en-US')})</span>
                </h2>
                <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                  متابعة الأسئلة والردود المنشورة على الإعلانات وإزالة أي محتوى مخالف مع توثيق السبب في سجل التدقيق.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={commentSearch}
                    onChange={(e) => setCommentSearch(e.target.value)}
                    placeholder="بحث في التعليقات..."
                    aria-label="بحث في التعليقات العامة"
                    className="h-11 sm:h-9 pr-8 pl-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)]/40 text-xs text-[var(--color-ink)]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => loadAdminComments(0, false)}
                  disabled={loadingAdminComments}
                  className="min-h-[44px] sm:min-h-[36px] px-3.5 rounded-lg border border-[var(--color-border)] text-xs font-semibold text-[var(--color-ink)] hover:bg-[var(--color-cream)] cursor-pointer disabled:opacity-60"
                >
                  {loadingAdminComments ? 'جاري التحديث...' : 'تحديث'}
                </button>
              </div>
            </div>

            {adminCommentsError && (
              <p
                role="alert"
                className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
              >
                {adminCommentsError}
              </p>
            )}

            {loadingAdminComments && adminComments.length === 0 ? (
              <p className="text-xs text-[var(--color-muted)] py-4">جاري تحميل التعليقات...</p>
            ) : adminComments.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">لا توجد تعليقات مطابقة حالياً.</p>
            ) : (
              <div className="space-y-3">
                {adminComments.map((cmt) => {
                  const targetListing = allListings.find((l) => l.id === cmt.listingId);
                  return (
                    <div
                      key={cmt.id}
                      className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/40 space-y-2.5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-bold text-[var(--color-ink)]">
                              {cmt.authorName}
                            </span>
                            {cmt.isSeller && (
                              <span className="px-1.5 py-0.5 rounded bg-[var(--color-green)] text-white text-[10px] font-semibold">
                                صاحب الإعلان
                              </span>
                            )}
                            {cmt.isVerifiedSeller && <VerifiedSellerBadge variant="compact" />}
                            <span aria-hidden="true" className="text-[var(--color-muted)]">
                              ·
                            </span>
                            <span className="text-[var(--color-muted)]">
                              {cmt.parentId ? 'رد' : 'سؤال'}
                            </span>
                            <span aria-hidden="true" className="text-[var(--color-muted)]">
                              ·
                            </span>
                            <span className="text-[var(--color-muted)]">
                              {formatRelativeArabicTime(cmt.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--color-muted)]">
                            على إعلان:{' '}
                            {targetListing ? (
                              <button
                                type="button"
                                onClick={() => onSelectListing(targetListing)}
                                className="font-semibold text-[var(--color-green-ink)] hover:underline cursor-pointer"
                              >
                                {cmt.listingTitle}
                              </button>
                            ) : (
                              <span className="font-semibold text-[var(--color-ink)]">
                                {cmt.listingTitle}
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-[var(--color-ink)] leading-relaxed">
                            {cmt.body}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setModerateCommentTargetId(
                              moderateCommentTargetId === cmt.id ? null : cmt.id
                            );
                            setModerateCommentReason('');
                          }}
                          className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <ShieldAlert size={13} aria-hidden="true" />
                          <span>إزالة</span>
                        </button>
                      </div>

                      {moderateCommentTargetId === cmt.id && (
                        <div className="pt-2.5 border-t border-[var(--color-border)] flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            value={moderateCommentReason}
                            onChange={(e) => setModerateCommentReason(e.target.value)}
                            placeholder="سبب الإزالة (يُسجل في سجل التدقيق)..."
                            className="flex-1 h-11 sm:h-9 px-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-[var(--color-surface)] text-xs text-[var(--color-ink)]"
                          />
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={moderatingCommentId === cmt.id}
                              onClick={() => handleModerateAdminComment(cmt.id)}
                              className="min-h-[44px] sm:min-h-[36px] px-3.5 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                            >
                              {moderatingCommentId === cmt.id ? 'جاري الإزالة...' : 'تأكيد الإزالة'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setModerateCommentTargetId(null)}
                              className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-ink)] cursor-pointer"
                            >
                              إلغاء
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <AdminPaginationFooter
              shownCount={adminComments.length}
              totalCount={commentsTotal}
              hasMore={commentsHasMore}
              loadingMore={loadingMoreComments}
              itemLabel="تعليق"
              onLoadMore={() => {
                if (commentsNextOffset !== null) loadAdminComments(commentsNextOffset, true);
              }}
            />
          </div>
        </div>
      )}

      {/* SECTION 6: AUDIT LOG */}
      {subTab === 'audit' && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-[var(--color-border)]">
            <div>
              <h2 className="font-display text-xl font-bold text-[var(--color-ink)]">
                سجل التدقيق الإداري ({auditTotal.toLocaleString('en-US')})
              </h2>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                توثيق كامل لجميع القرارات الإدارية الحساسة: إيقاف وتفعيل الحسابات، توثيق المربين، مراجعة الإعلانات، ومعالجة البلاغات.
              </p>
            </div>
            <button
              type="button"
              onClick={() => loadAuditLogs(0, false)}
              disabled={loadingAudit}
              className="min-h-[44px] sm:min-h-[36px] px-3.5 rounded-lg border border-[var(--color-border)] text-xs font-semibold text-[var(--color-ink)] hover:bg-[var(--color-cream)] inline-flex items-center gap-1.5 self-start cursor-pointer disabled:opacity-60"
            >
              <RefreshCw size={13} className={loadingAudit ? 'animate-spin' : ''} aria-hidden="true" />
              <span>تحديث السجل</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
            <div className="relative">
              <Search
                size={15}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
                aria-hidden="true"
              />
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="ابحث بالإجراء، المشرف، أو التفاصيل..."
                aria-label="البحث في سجل التدقيق"
                className="w-full h-10 pr-9 pl-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)]/40 text-xs text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
              />
            </div>

            <select
              aria-label="تصفية سجل التدقيق حسب النطاق"
              value={auditTypeFilter}
              onChange={(e) => setAuditTypeFilter(e.target.value)}
              className={fieldCls}
            >
              <option value="all">جميع الإجراءات</option>
              <option value="user">حسابات المستخدمين</option>
              <option value="seller">توثيق المربين</option>
              <option value="listing">الإعلانات</option>
              <option value="report">البلاغات</option>
              <option value="comment">التعليقات</option>
              <option value="category">الفئات الفرعية</option>
              <option value="breed">السلالات</option>
              <option value="commission">العمولة والمدفوعات</option>
            </select>
          </div>

          {auditError && (
            <p
              role="alert"
              className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
            >
              {auditError}
            </p>
          )}

          {/* Mobile Audit Cards (< 768px) */}
          <div className="md:hidden space-y-3">
            {auditLogs.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--color-muted)]">
                لا توجد سجلات مطابقة.
              </p>
            ) : (
              auditLogs.map((log) => (
                <article
                  key={log.id}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/30 p-4 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[var(--color-green-ink)]">{log.action}</span>
                    <span className="px-2 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-[11px] text-[var(--color-muted)]">
                      {AUDIT_TARGET_LABELS[log.targetType] || log.targetType}
                    </span>
                  </div>
                  <p className="text-[var(--color-ink)] font-medium">المنفذ: {log.actorName}</p>
                  <p className="text-[var(--color-muted)] break-words">
                    {log.note || log.targetId}
                  </p>
                  <p className="text-[11px] text-[var(--color-muted)] tabular-nums">
                    {formatRelativeArabicTime(log.createdAt)}
                  </p>
                </article>
              ))
            )}
          </div>

          {/* Desktop Audit Table (768px+) */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-[var(--color-border)]">
            <table className="w-full text-right text-sm border-collapse min-w-[680px]">
              <thead>
                <tr className="bg-[var(--color-cream)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted)]">
                  <th className="py-3 px-4">الإجراء</th>
                  <th className="py-3 px-4">النطاق</th>
                  <th className="py-3 px-4">المشرف المنفذ</th>
                  <th className="py-3 px-4">التفاصيل والسبب</th>
                  <th className="py-3 px-4">التوقيت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-sm text-[var(--color-muted)]">
                      لا توجد سجلات مطابقة.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[var(--color-cream)]/30">
                      <td className="py-3 px-4 font-semibold text-[var(--color-green-ink)] whitespace-nowrap">
                        {log.action}
                      </td>
                      <td className="py-3 px-4 text-xs text-[var(--color-muted)] whitespace-nowrap">
                        {AUDIT_TARGET_LABELS[log.targetType] || log.targetType}
                      </td>
                      <td className="py-3 px-4 text-xs text-[var(--color-ink)] whitespace-nowrap">
                        {log.actorName}
                      </td>
                      <td className="py-3 px-4 text-xs text-[var(--color-muted)]">
                        {log.note || log.targetId}
                      </td>
                      <td className="py-3 px-4 text-xs text-[var(--color-muted)] whitespace-nowrap tabular-nums">
                        {formatRelativeArabicTime(log.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <AdminPaginationFooter
            shownCount={auditLogs.length}
            totalCount={auditTotal}
            hasMore={auditHasMore}
            loadingMore={loadingMoreAudit}
            itemLabel="سجل"
            onLoadMore={() => {
              if (auditNextOffset !== null) loadAuditLogs(auditNextOffset, true);
            }}
          />
        </div>
      )}

      {/* SECTION 7: COMMISSIONS & BANK SETTINGS */}
      {subTab === 'commissions' && (
        <div className="space-y-6">
          {/* Commission KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 space-y-1">
              <p className="text-xs font-medium text-[var(--color-muted)]">إجمالي مبيعات المنصة</p>
              <p className="font-display text-xl font-extrabold text-[var(--color-ink)] tabular-nums">
                {formatPriceSar(commissionSummary?.totalPlatformSalesSar ?? 0)}
              </p>
              <p className="text-[11px] text-[var(--color-muted)] tabular-nums">
                عدد الصفقات: {commissionSummary?.totalPlatformSalesCount ?? 0} · معفى:{' '}
                {commissionSummary?.totalExemptSalesCount ?? 0}
              </p>
            </div>

            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 space-y-1">
              <p className="text-xs font-medium text-[var(--color-muted)]">المستحق بانتظار السداد</p>
              <p className="font-display text-xl font-extrabold text-amber-700 dark:text-amber-300 tabular-nums">
                {formatPriceSar(commissionSummary?.totalDueSar ?? 0)}
              </p>
              <p className="text-[11px] text-[var(--color-muted)] tabular-nums">
                بانتظار السداد: {commissionSummary?.pendingPaymentCount ?? 0}
              </p>
            </div>

            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 space-y-1">
              <p className="text-xs font-medium text-[var(--color-muted)]">حوالات بانتظار المراجعة</p>
              <p className="font-display text-xl font-extrabold text-[var(--color-gold)] tabular-nums">
                {formatPriceSar(commissionSummary?.totalPendingReviewSar ?? 0)}
              </p>
              <p className="text-[11px] text-[var(--color-muted)] tabular-nums">
                حوالات للمراجعة: {commissionSummary?.pendingReviewCount ?? 0}
              </p>
            </div>

            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 space-y-1">
              <p className="text-xs font-medium text-[var(--color-muted)]">المحصّل المعتمد</p>
              <p className="font-display text-xl font-extrabold text-[var(--color-green-ink)] tabular-nums">
                {formatPriceSar(commissionSummary?.totalApprovedSar ?? 0)}
              </p>
              <p className="text-[11px] text-[var(--color-muted)] tabular-nums">
                النسبة الحالية: {commissionSettings?.commissionRatePercent ?? 1}%
              </p>
            </div>
          </div>

          {/* Commission Settings & Bank IBAN Editor */}
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-[var(--color-border)]">
              <div className="flex items-start gap-2.5">
                <Building2
                  size={20}
                  className="text-[var(--color-green-ink)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div>
                  <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
                    إعدادات العمولة والحساب البنكي (IBAN)
                  </h2>
                  <p className="text-xs text-[var(--color-muted)] mt-0.5">
                    عدّل نسبة العمولة، شروط الإعفاء التشجيعي للإطلاق، رسوم تمييز الإعلانات، وبيانات الآيبان الظاهرة للبائعين.
                  </p>
                </div>
              </div>
              {commissionSettings?.iban && (
                <span
                  dir="ltr"
                  className="px-3 py-1.5 rounded-lg bg-[var(--color-cream)] border border-[var(--color-border)] text-xs font-mono font-bold text-[var(--color-green-ink)]"
                >
                  {formatIbanSpaced(commissionSettings.iban)}
                </span>
              )}
            </div>

            <form onSubmit={handleSaveCommissionSettings} className="space-y-4">
              {settingsError && (
                <p
                  role="alert"
                  className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
                >
                  {settingsError}
                </p>
              )}
              {settingsSuccess && (
                <p
                  role="status"
                  className="p-3 rounded-lg bg-[var(--color-green)]/10 border border-[var(--color-green-ink)]/25 text-xs font-semibold text-[var(--color-green-ink)]"
                >
                  {settingsSuccess}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label
                    htmlFor="admin-comm-rate"
                    className="block text-xs font-medium text-[var(--color-muted)] mb-1"
                  >
                    نسبة العمولة (%)
                  </label>
                  <input
                    id="admin-comm-rate"
                    type="number"
                    step="0.1"
                    min={0}
                    max={25}
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                    className={`w-full ${fieldCls} tabular-nums`}
                  />
                </div>

                <div>
                  <label
                    htmlFor="admin-comm-featured-price"
                    className="block text-xs font-medium text-[var(--color-muted)] mb-1"
                  >
                    رسوم تمييز الإعلان الأسبوعية (ر.س)
                  </label>
                  <input
                    id="admin-comm-featured-price"
                    type="number"
                    min={0}
                    step="1"
                    value={featuredPriceInput}
                    onChange={(e) => setFeaturedPriceInput(e.target.value)}
                    className={`w-full ${fieldCls} tabular-nums`}
                  />
                </div>

                <div>
                  <label
                    htmlFor="admin-comm-promo-days"
                    className="block text-xs font-medium text-[var(--color-muted)] mb-1"
                  >
                    أيام الإعفاء عند التسجيل (يوم)
                  </label>
                  <input
                    id="admin-comm-promo-days"
                    type="number"
                    min={0}
                    step="1"
                    value={promoDaysInput}
                    onChange={(e) => setPromoDaysInput(e.target.value)}
                    className={`w-full ${fieldCls} tabular-nums`}
                  />
                </div>

                <div>
                  <label
                    htmlFor="admin-comm-promo-count"
                    className="block text-xs font-medium text-[var(--color-muted)] mb-1"
                  >
                    أول بيعات مجانية للمربي
                  </label>
                  <input
                    id="admin-comm-promo-count"
                    type="number"
                    min={0}
                    step="1"
                    value={promoCountInput}
                    onChange={(e) => setPromoCountInput(e.target.value)}
                    className={`w-full ${fieldCls} tabular-nums`}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/40 cursor-pointer">
                <input
                  type="checkbox"
                  checked={promoEnabledInput}
                  onChange={(e) => setPromoEnabledInput(e.target.checked)}
                  className="w-4 h-4 accent-[var(--color-green)] rounded cursor-pointer"
                />
                <span className="text-xs font-semibold text-[var(--color-ink)]">
                  تفعيل عرض الإطلاق الترويجي (إعفاء البائعين الجدد تلقائياً خلال المدة أو عدد البيعات المحدد أعلاه، وبعدها تتفعل نسبة العمولة تلقائياً)
                </span>
              </label>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-[var(--color-border)]">
                <div>
                  <label
                    htmlFor="admin-comm-bank-name"
                    className="block text-xs font-medium text-[var(--color-muted)] mb-1"
                  >
                    اسم البنك السعودي
                  </label>
                  <input
                    id="admin-comm-bank-name"
                    type="text"
                    value={bankNameInput}
                    onChange={(e) => setBankNameInput(e.target.value)}
                    placeholder="مثال: مصرف الراجحي"
                    className={`w-full ${fieldCls}`}
                  />
                </div>

                <div>
                  <label
                    htmlFor="admin-comm-holder"
                    className="block text-xs font-medium text-[var(--color-muted)] mb-1"
                  >
                    اسم صاحب الحساب البنكي
                  </label>
                  <input
                    id="admin-comm-holder"
                    type="text"
                    value={accountHolderInput}
                    onChange={(e) => setAccountHolderInput(e.target.value)}
                    placeholder="الاسم الثلاثي أو اسم المؤسسة"
                    className={`w-full ${fieldCls}`}
                  />
                </div>

                <div>
                  <label
                    htmlFor="admin-comm-iban"
                    className="block text-xs font-medium text-[var(--color-muted)] mb-1"
                  >
                    رقم الآيبان السعودي (SA + 22 رقماً)
                  </label>
                  <input
                    id="admin-comm-iban"
                    type="text"
                    dir="ltr"
                    value={ibanInput}
                    onChange={(e) => setIbanInput(e.target.value.toUpperCase())}
                    placeholder="SA0000000000000000000000"
                    className={`w-full ${fieldCls} font-mono text-left`}
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="min-h-[44px] px-5 py-2.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  <Save size={15} aria-hidden="true" />
                  <span>{savingSettings ? 'جاري الحفظ...' : 'حفظ إعدادات العمولة والحساب البنكي'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Commission Records & Bank Transfer Review */}
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-[var(--color-border)]">
              <div className="flex items-start gap-2.5">
                <CreditCard
                  size={20}
                  className="text-[var(--color-green-ink)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div>
                  <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
                    سجل المبيعات والحوالات البنكية ({commTotal.toLocaleString('en-US')})
                  </h2>
                  <p className="text-xs text-[var(--color-muted)] mt-0.5">
                    راجع حوالات عمولة الـ 1% وطلبات تمييز الإعلانات الأسبوعية؛ اعتماد طلب التمييز يثبت الإعلان تلقائياً.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => loadCommissions(0, false, false)}
                disabled={loadingComm}
                className="min-h-[44px] sm:min-h-[36px] px-3.5 rounded-lg border border-[var(--color-border)] text-xs font-semibold text-[var(--color-ink)] hover:bg-[var(--color-cream)] inline-flex items-center gap-1.5 self-start cursor-pointer disabled:opacity-60"
              >
                <RefreshCw size={13} className={loadingComm ? 'animate-spin' : ''} aria-hidden="true" />
                <span>تحديث السجل</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative">
                <Search
                  size={15}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={commSearch}
                  onChange={(e) => setCommSearch(e.target.value)}
                  placeholder="ابحث بالبائع، الإعلان، المرجع..."
                  aria-label="البحث في سجل العمولة والحوالات"
                  className="w-full h-10 pr-9 pl-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)]/40 text-xs text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                />
              </div>

              <select
                aria-label="تصفية حسب حالة السجل المالي"
                value={commStatusFilter}
                onChange={(e) => setCommStatusFilter(e.target.value)}
                className={fieldCls}
              >
                <option value="all">جميع الحالات</option>
                <option value="pending_review">بانتظار مراجعة الحوالة</option>
                <option value="pending_payment">بانتظار السداد</option>
                <option value="approved">معتمدة ومدفوعة</option>
                <option value="rejected">مرفوضة</option>
                <option value="exempt">معفاة (عرض الإطلاق)</option>
                <option value="not_applicable">بيع خارج المنصة</option>
              </select>

              <select
                aria-label="تصفية حسب نوع السجل المالي"
                value={commKindFilter}
                onChange={(e) => setCommKindFilter(e.target.value)}
                className={fieldCls}
              >
                <option value="all">جميع الأنواع</option>
                <option value="sale_commission">عمولة بيع (1%)</option>
                <option value="featured_listing">تمييز إعلان أسبوعي</option>
              </select>
            </div>

            {commError && (
              <p
                role="alert"
                className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
              >
                {commError}
              </p>
            )}

            {/* Mobile Commission Cards (< 768px) */}
            <div className="md:hidden space-y-3">
              {commissionRecords.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--color-muted)]">
                  لا توجد سجلات عمولة أو حوالات مطابقة حالياً.
                </p>
              ) : (
                commissionRecords.map((rec) => {
                  const statusMeta = getCommissionStatusMeta(rec.status);
                  const canApprove =
                    rec.status === 'pending_review' ||
                    rec.status === 'pending_payment' ||
                    rec.status === 'rejected';
                  const canReject = rec.status === 'pending_review';
                  return (
                    <article
                      key={rec.id}
                      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/30 p-4 space-y-2.5 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-[var(--color-ink)] truncate">
                            {rec.listingTitle}
                          </p>
                          <p className="text-[var(--color-muted)] mt-0.5">
                            البائع: {rec.sellerName} ·{' '}
                            {rec.kind === 'featured_listing' ? 'تمييز إعلان' : 'عمولة بيع'}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-lg border text-[11px] font-semibold shrink-0 ${statusMeta.cls}`}
                        >
                          {statusMeta.label}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-[var(--color-muted)]">
                        <span>
                          قيمة البيع:{' '}
                          <strong className="text-[var(--color-ink)] tabular-nums">
                            {rec.saleAmountSar > 0 ? formatPriceSar(rec.saleAmountSar) : '—'}
                          </strong>
                        </span>
                        <span>
                          المبلغ المستحق:{' '}
                          <strong className="text-[var(--color-green-ink)] tabular-nums">
                            {formatPriceSar(rec.commissionAmountSar)}
                          </strong>
                        </span>
                      </div>

                      {(rec.transferReference || rec.payerName) && (
                        <p className="p-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[11px] text-[var(--color-ink)]">
                          الحوالة: {rec.payerName || '—'} · مرجع: {rec.transferReference || '—'}
                          {rec.transferAmountSar != null && ` · ${formatPriceSar(rec.transferAmountSar)}`}
                        </p>
                      )}

                      {(canApprove || canReject) && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {canApprove && (
                            <button
                              type="button"
                              disabled={commBusyId === rec.id}
                              onClick={() => handleReviewCommission(rec, 'approved')}
                              className="min-h-[44px] flex-1 px-3 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                            >
                              {rec.kind === 'featured_listing' ? 'اعتماد وتمييز الإعلان' : 'اعتماد الحوالة'}
                            </button>
                          )}
                          {canReject && (
                            <button
                              type="button"
                              disabled={commBusyId === rec.id}
                              onClick={() => {
                                setRejectCommTarget(rec);
                                setRejectCommNote('');
                                setCommModalError('');
                              }}
                              className="min-h-[44px] px-3 py-2 rounded-lg border border-red-300 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs font-semibold cursor-pointer"
                            >
                              رفض
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </div>

            {/* Desktop Commission Table (768px+) */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-[var(--color-border)]">
              <table className="w-full text-right text-sm border-collapse min-w-[780px]">
                <thead>
                  <tr className="bg-[var(--color-cream)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted)]">
                    <th className="py-3 px-4">الإعلان والنوع</th>
                    <th className="py-3 px-4">البائع</th>
                    <th className="py-3 px-4">قيمة البيع / العمولة</th>
                    <th className="py-3 px-4">بيانات الحوالة</th>
                    <th className="py-3 px-4">الحالة</th>
                    <th className="py-3 px-4">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {commissionRecords.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-[var(--color-muted)]">
                        لا توجد سجلات عمولة أو حوالات مطابقة حالياً.
                      </td>
                    </tr>
                  ) : (
                    commissionRecords.map((rec) => {
                      const statusMeta = getCommissionStatusMeta(rec.status);
                      const canApprove =
                        rec.status === 'pending_review' ||
                        rec.status === 'pending_payment' ||
                        rec.status === 'rejected';
                      const canReject = rec.status === 'pending_review';
                      return (
                        <tr key={rec.id} className="hover:bg-[var(--color-cream)]/30">
                          <td className="py-3 px-4">
                            <p className="font-semibold text-[var(--color-ink)] text-xs">
                              {rec.listingTitle}
                            </p>
                            <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                              {rec.kind === 'featured_listing'
                                ? 'طلب تمييز إعلان أسبوعي'
                                : rec.soldViaPlatform
                                ? `عمولة بيع (${rec.ratePercent}%)`
                                : 'بيع خارج المنصة'}
                            </p>
                          </td>
                          <td className="py-3 px-4 text-xs text-[var(--color-ink)] whitespace-nowrap">
                            {rec.sellerName}
                          </td>
                          <td className="py-3 px-4 text-xs whitespace-nowrap tabular-nums">
                            <p className="font-bold text-[var(--color-green-ink)]">
                              {formatPriceSar(rec.commissionAmountSar)}
                            </p>
                            {rec.saleAmountSar > 0 && (
                              <p className="text-[11px] text-[var(--color-muted)]">
                                من {formatPriceSar(rec.saleAmountSar)}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs text-[var(--color-muted)]">
                            {rec.transferReference || rec.payerName ? (
                              <div className="space-y-0.5">
                                <p className="text-[var(--color-ink)] font-medium">
                                  {rec.payerName || '—'}
                                </p>
                                <p className="font-mono text-[11px]">
                                  {rec.transferReference || '—'}
                                </p>
                              </div>
                            ) : (
                              <span>—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${statusMeta.cls}`}
                            >
                              {statusMeta.label}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {canApprove && (
                                <button
                                  type="button"
                                  disabled={commBusyId === rec.id}
                                  onClick={() => handleReviewCommission(rec, 'approved')}
                                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                                >
                                  {rec.kind === 'featured_listing' ? 'اعتماد وتمييز' : 'اعتماد'}
                                </button>
                              )}
                              {canReject && (
                                <button
                                  type="button"
                                  disabled={commBusyId === rec.id}
                                  onClick={() => {
                                    setRejectCommTarget(rec);
                                    setRejectCommNote('');
                                    setCommModalError('');
                                  }}
                                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs font-semibold cursor-pointer"
                                >
                                  رفض
                                </button>
                              )}
                              {!canApprove && !canReject && (
                                <span className="text-[11px] text-[var(--color-muted)]">
                                  {formatRelativeArabicTime(rec.updatedAt)}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <AdminPaginationFooter
              shownCount={commissionRecords.length}
              totalCount={commTotal}
              hasMore={commHasMore}
              loadingMore={loadingMoreComm}
              itemLabel="سجل مالي"
              onLoadMore={() => {
                if (commNextOffset !== null) loadCommissions(commNextOffset, true, false);
              }}
            />
          </div>
        </div>
      )}

      {/* SECTION: INQUIRIES & CONTACT MESSAGES */}
      {subTab === 'inquiries' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
              <p className="text-xs text-[var(--color-muted)]">إجمالي الرسائل</p>
              <p className="font-display text-xl font-extrabold text-[var(--color-ink)] tabular-nums mt-1">
                {(inquirySummary?.total ?? 0).toLocaleString('en-US')}
              </p>
            </div>
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-gold)]/45 p-4">
              <p className="text-xs text-[var(--color-muted)]">رسائل جديدة</p>
              <p className="font-display text-xl font-extrabold text-[var(--color-gold-hover)] dark:text-[var(--color-gold)] tabular-nums mt-1">
                {(inquirySummary?.newCount ?? 0).toLocaleString('en-US')}
              </p>
            </div>
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
              <p className="text-xs text-[var(--color-muted)]">قيد المتابعة</p>
              <p className="font-display text-xl font-extrabold text-[var(--color-ink)] tabular-nums mt-1">
                {(inquirySummary?.inProgressCount ?? 0).toLocaleString('en-US')}
              </p>
            </div>
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-green-ink)]/30 p-4">
              <p className="text-xs text-[var(--color-muted)]">تمت المعالجة</p>
              <p className="font-display text-xl font-extrabold text-[var(--color-green-ink)] tabular-nums mt-1">
                {(inquirySummary?.resolvedCount ?? 0).toLocaleString('en-US')}
              </p>
            </div>
          </div>

          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 sm:p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-bold text-[var(--color-ink)]">
                  رسائل صفحة تواصل معنا وطلبات الخدمة
                </h3>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">
                  اطّلع على استفسارات المستخدمين وحدّث حالة المتابعة لكل رسالة برقمها المرجعي.
                </p>
              </div>
              <button
                type="button"
                onClick={() => loadInquiries(0, false)}
                disabled={loadingInquiries}
                className="min-h-[38px] px-3.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)]/60 hover:bg-[var(--color-cream)] text-xs font-semibold text-[var(--color-ink)] inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <RefreshCw size={13} className={loadingInquiries ? 'animate-spin' : ''} aria-hidden="true" />
                <span>تحديث</span>
              </button>
            </div>

            <div className="flex flex-col md:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search
                  size={15}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={inquirySearch}
                  onChange={(e) => setInquirySearch(e.target.value)}
                  placeholder="ابحث بالاسم أو البريد أو الرقم المرجعي (MSG-)..."
                  className={`w-full pr-9 ${fieldCls}`}
                />
              </div>

              <select
                value={inquiryStatusFilter}
                onChange={(e) => setInquiryStatusFilter(e.target.value as 'all' | InquiryStatus)}
                aria-label="تصفية حسب الحالة"
                className={fieldCls}
              >
                <option value="all">جميع الحالات</option>
                <option value="new">جديدة</option>
                <option value="in_progress">قيد المتابعة</option>
                <option value="resolved">تم الحل</option>
              </select>

              <select
                value={inquiryKindFilter}
                onChange={(e) =>
                  setInquiryKindFilter(e.target.value as 'all' | 'contact' | 'service_request')
                }
                aria-label="تصفية حسب المصدر"
                className={fieldCls}
              >
                <option value="all">كل الرسائل والطلبات</option>
                <option value="contact">رسائل تواصل معنا</option>
                <option value="service_request">طلبات الخدمات</option>
              </select>
            </div>

            {inquiriesError && (
              <p
                role="alert"
                className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
              >
                {inquiriesError}
              </p>
            )}

            {loadingInquiries && inquiries.length === 0 ? (
              <p className="py-10 text-center text-xs text-[var(--color-muted)]">
                جاري تحميل رسائل التواصل...
              </p>
            ) : inquiries.length === 0 ? (
              <div className="py-10 text-center text-xs text-[var(--color-muted)] border border-dashed border-[var(--color-border)] rounded-xl">
                لا توجد رسائل مطابقة لعوامل التصفية الحالية.
              </div>
            ) : (
              <div className="space-y-3">
                {inquiries.map((inq) => {
                  const statusBadge =
                    inq.status === 'resolved'
                      ? 'bg-[var(--color-green)]/10 text-[var(--color-green-ink)] border-[var(--color-green-ink)]/25'
                      : inq.status === 'in_progress'
                      ? 'bg-sky-50 dark:bg-sky-950/35 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800'
                      : 'bg-[var(--color-gold-soft)] text-[var(--color-ink)] border-[var(--color-gold)]/45';
                  const statusText =
                    inq.status === 'resolved'
                      ? 'تم الحل'
                      : inq.status === 'in_progress'
                      ? 'قيد المتابعة'
                      : 'جديد';
                  const noteDraft =
                    inquiryNoteDrafts[inq.referenceId] ?? inq.adminNote ?? '';
                  const busy = inquiryBusyRefId === inq.referenceId;

                  return (
                    <div
                      key={inq.referenceId}
                      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-[var(--color-green-ink)] tabular-nums">
                              {inq.referenceId}
                            </span>
                            <span className={`px-2 py-0.5 rounded-md border text-[11px] font-bold ${statusBadge}`}>
                              {statusText}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] text-[11px] font-semibold text-[var(--color-muted)]">
                              {inq.kind === 'service_request'
                                ? inq.serviceType || 'طلب خدمة'
                                : inq.category || inq.topic || 'استفسار عام'}
                            </span>
                          </div>
                          <p className="text-sm font-bold text-[var(--color-ink)]">
                            {inq.name || 'مستخدم'}
                            {inq.email && (
                              <span dir="ltr" className="mr-2 font-normal text-xs text-[var(--color-muted)]">
                                {inq.email}
                              </span>
                            )}
                            {!inq.email && (inq.contact || inq.phone) && (
                              <span dir="ltr" className="mr-2 font-normal text-xs text-[var(--color-muted)]">
                                {inq.contact || inq.phone}
                              </span>
                            )}
                          </p>
                        </div>
                        <span className="text-[11px] text-[var(--color-muted)] tabular-nums">
                          {formatRelativeArabicTime(inq.receivedAt)}
                        </span>
                      </div>

                      <p className="text-xs sm:text-sm text-[var(--color-ink)] leading-relaxed whitespace-pre-line bg-[var(--color-surface)] border border-[var(--color-border)]/75 rounded-lg p-3">
                        {inq.message || inq.details}
                      </p>

                      {inq.reviewedByName && inq.reviewedAt && (
                        <p className="text-[11px] text-[var(--color-muted)]">
                          آخر تحديث بواسطة {inq.reviewedByName} · {formatRelativeArabicTime(inq.reviewedAt)}
                        </p>
                      )}

                      <div className="flex flex-col sm:flex-row gap-2 pt-1">
                        <input
                          type="text"
                          value={noteDraft}
                          onChange={(e) =>
                            setInquiryNoteDrafts((prev) => ({
                              ...prev,
                              [inq.referenceId]: e.target.value,
                            }))
                          }
                          placeholder="أضف ملاحظة داخلية (اختياري)..."
                          aria-label={`ملاحظة داخلية للرسالة ${inq.referenceId}`}
                          className={`flex-1 ${fieldCls}`}
                        />
                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          {inq.status !== 'in_progress' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                handleUpdateInquiryStatus(inq.referenceId, 'in_progress')
                              }
                              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)] text-xs font-semibold text-[var(--color-ink)] cursor-pointer disabled:opacity-60"
                            >
                              قيد المتابعة
                            </button>
                          )}
                          {inq.status !== 'resolved' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                handleUpdateInquiryStatus(inq.referenceId, 'resolved')
                              }
                              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                            >
                              تعيين كـ تم الحل
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <AdminPaginationFooter
              shownCount={inquiries.length}
              totalCount={inquiriesTotal}
              hasMore={inquiriesHasMore}
              loadingMore={loadingMoreInquiries}
              itemLabel="رسالة"
              onLoadMore={() => {
                if (inquiriesNextOffset !== null) loadInquiries(inquiriesNextOffset, true);
              }}
            />
          </div>
        </div>
      )}

      {/* MODALS */}

      {/* Suspend User Modal */}
      <Modal
        open={Boolean(suspendTarget)}
        onClose={() => setSuspendTarget(null)}
        title={suspendTarget ? `إيقاف حساب: ${suspendTarget.name}` : 'إيقاف حساب مستخدم'}
        subtitle="سيتم إنهاء جميع جلسات واتصالات المستخدم فوراً ومنعه من استخدام المزايا المحمية حتى إعادة التفعيل."
        size="md"
      >
        <form onSubmit={handleConfirmSuspend} className="space-y-4">
          {userModalError && (
            <p
              role="alert"
              className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
            >
              {userModalError}
            </p>
          )}

          <div className="space-y-2">
            <p className="text-xs text-[var(--color-muted)]">أسباب شائعة (اختيار سريع):</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_SUSPENSION_REASONS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setSuspendReason(preset)}
                  className="px-2.5 py-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)]/60 hover:bg-[var(--color-cream)] text-[11px] text-[var(--color-ink)] cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="suspend-reason-input"
              className="block text-xs font-medium text-[var(--color-muted)] mb-1"
            >
              سبب إيقاف الحساب (مطلوب للتوثيق)
            </label>
            <textarea
              id="suspend-reason-input"
              rows={3}
              required
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="اكتب سبب الإيقاف بوضوح..."
              className="w-full p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setSuspendTarget(null)}
              className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-muted)] hover:bg-[var(--color-cream)] cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={userActionBusy}
              className="px-5 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              {userActionBusy ? 'جاري التنفيذ...' : 'تأكيد إيقاف الحساب'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Reactivate User Modal */}
      <Modal
        open={Boolean(reactivateTarget)}
        onClose={() => setReactivateTarget(null)}
        title={reactivateTarget ? `إعادة تفعيل حساب: ${reactivateTarget.name}` : 'إعادة تفعيل الحساب'}
        subtitle="سيتمكن المستخدم من تسجيل الدخول واستخدام جميع مزايا المنصة من جديد."
        size="md"
      >
        <form onSubmit={handleConfirmReactivate} className="space-y-4">
          {userModalError && (
            <p
              role="alert"
              className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
            >
              {userModalError}
            </p>
          )}
          <div>
            <label
              htmlFor="reactivate-note-input"
              className="block text-xs font-medium text-[var(--color-muted)] mb-1"
            >
              ملاحظة إعادة التفعيل (اختياري)
            </label>
            <input
              id="reactivate-note-input"
              type="text"
              value={reactivateNote}
              onChange={(e) => setReactivateNote(e.target.value)}
              placeholder="مثال: تم تصحيح البيانات بناءً على تواصل صاحب الحساب"
              className={`w-full ${fieldCls}`}
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setReactivateTarget(null)}
              className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-muted)] hover:bg-[var(--color-cream)] cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={userActionBusy}
              className="px-5 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              {userActionBusy ? 'جاري التنفيذ...' : 'تأكيد إعادة التفعيل'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Reject Seller Verification Modal */}
      <Modal
        open={Boolean(rejectSellerTarget)}
        onClose={() => setRejectSellerTarget(null)}
        title={
          rejectSellerTarget
            ? `رفض توثيق: ${rejectSellerTarget.sellerProfile?.displayName || rejectSellerTarget.name}`
            : 'رفض توثيق المربي'
        }
        subtitle="سيصل سبب الرفض للمربي ليتمكن من استكمال متطلبات التوثيق وإعادة التقديم."
        size="md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!rejectSellerTarget) return;
            handleSellerDecision(rejectSellerTarget, 'Rejected', rejectSellerReason);
          }}
          className="space-y-4"
        >
          {sellerModalError && (
            <p
              role="alert"
              className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
            >
              {sellerModalError}
            </p>
          )}
          <div>
            <label
              htmlFor="reject-seller-reason"
              className="block text-xs font-medium text-[var(--color-muted)] mb-1"
            >
              سبب رفض التوثيق
            </label>
            <textarea
              id="reject-seller-reason"
              rows={3}
              required
              value={rejectSellerReason}
              onChange={(e) => setRejectSellerReason(e.target.value)}
              placeholder="مثال: يرجى توضيح موقع المراح ونشاط التربية في النبذة التعريفية..."
              className="w-full p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)]"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setRejectSellerTarget(null)}
              className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-muted)] hover:bg-[var(--color-cream)] cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={Boolean(rejectSellerTarget && sellerReviewBusyId === rejectSellerTarget.id)}
              className="px-5 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              تأكيد الرفض
            </button>
          </div>
        </form>
      </Modal>

      {/* Reject Listing Modal */}
      <Modal
        open={Boolean(rejectTargetListing)}
        onClose={() => setRejectTargetListing(null)}
        title={rejectTargetListing ? `رفض إعلان: ${rejectTargetListing.title}` : 'رفض الإعلان'}
        subtitle="يظهر سبب الرفض لصاحب الإعلان في لوحة حسابه وفي إشعاراته."
        size="md"
      >
        <form onSubmit={handleConfirmRejectListing} className="space-y-4">
          {listingActionError && (
            <p
              role="alert"
              className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
            >
              {listingActionError}
            </p>
          )}

          <div className="space-y-2">
            <p className="text-xs text-[var(--color-muted)]">أسباب شائعة:</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_LISTING_REJECTION_REASONS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setRejectReason(preset)}
                  className="px-2.5 py-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)]/60 hover:bg-[var(--color-cream)] text-[11px] text-[var(--color-ink)] cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="reject-listing-reason"
              className="block text-xs font-medium text-[var(--color-muted)] mb-1"
            >
              سبب الرفض
            </label>
            <textarea
              id="reject-listing-reason"
              rows={3}
              required
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="مثال: الصور غير واضحة أو السعر غير مكتمل"
              className="w-full p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setRejectTargetListing(null)}
              className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-muted)] hover:bg-[var(--color-cream)] cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={Boolean(rejectTargetListing && listingBusyId === rejectTargetListing.id)}
              className="px-5 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              تأكيد الرفض
            </button>
          </div>
        </form>
      </Modal>

      {/* Resolve / Dismiss Report Modal */}
      <Modal
        open={Boolean(resolveTargetReport)}
        onClose={() => setResolveTargetReport(null)}
        title={
          resolveTargetReport?.nextStatus === 'dismissed'
            ? 'إغلاق البلاغ بدون إجراء'
            : 'معالجة البلاغ'
        }
        subtitle="يمكنك تسجيل ملاحظة إدارية توضح الإجراء المتخذ في سجل التدقيق."
        size="md"
      >
        <form onSubmit={handleConfirmResolveReport} className="space-y-4">
          {reportModalError && (
            <p
              role="alert"
              className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
            >
              {reportModalError}
            </p>
          )}
          <div>
            <label
              htmlFor="resolve-report-note"
              className="block text-xs font-medium text-[var(--color-muted)] mb-1"
            >
              ملاحظة المعالجة (اختياري)
            </label>
            <input
              id="resolve-report-note"
              type="text"
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              placeholder="مثال: تم التحقق من الإعلان وإزالة المحتوى المخالف"
              className={`w-full ${fieldCls}`}
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setResolveTargetReport(null)}
              className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-muted)] hover:bg-[var(--color-cream)] cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={reportActionBusy}
              className="px-5 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              {reportActionBusy ? 'جاري الحفظ...' : 'حفظ الحالة'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Create Sub-Category Modal */}
      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="إنشاء فئة فرعية جديدة"
        subtitle="أضف فئة فرعية لتصنيف الإعلانات وتسهيل فلترة المشترين داخل السوق."
        size="lg"
      >
        <form onSubmit={handleCreateSubSubmit} className="space-y-4">
          {subModalError && (
            <p className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300">
              {subModalError}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="modal-sub-name"
                className="block text-xs text-[var(--color-muted)] mb-1"
              >
                اسم الفئة الفرعية
              </label>
              <input
                id="modal-sub-name"
                type="text"
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                placeholder="مثال: أضاحي العيد"
                required
                className={`w-full ${fieldCls}`}
              />
            </div>

            <div>
              <label
                htmlFor="modal-sub-parent"
                className="block text-xs text-[var(--color-muted)] mb-1"
              >
                التصنيف الرئيسي المرتبط
              </label>
              <select
                id="modal-sub-parent"
                value={subParentId}
                onChange={(e) => setSubParentId(e.target.value)}
                className={`w-full ${fieldCls}`}
              >
                {mainCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="modal-sub-desc"
              className="block text-xs text-[var(--color-muted)] mb-1"
            >
              وصف الفئة
            </label>
            <input
              id="modal-sub-desc"
              type="text"
              value={subDescription}
              onChange={(e) => setSubDescription(e.target.value)}
              placeholder="وصف مختصر يوضح غرض هذه الفئة للمستخدمين..."
              className={`w-full ${fieldCls}`}
            />
          </div>

          <div>
            <label
              htmlFor="modal-sub-kw"
              className="block text-xs text-[var(--color-muted)] mb-1"
            >
              كلمات مفتاحية للتصنيف التلقائي الذكي (مفصولة بفاصلة)
            </label>
            <input
              id="modal-sub-kw"
              type="text"
              value={subKeywords}
              onChange={(e) => setSubKeywords(e.target.value)}
              placeholder="أضحية، جذع، هرفي، مناسبات"
              className={`w-full ${fieldCls}`}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-muted)] hover:bg-[var(--color-cream)] cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={subSaving}
              className="px-5 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              {subSaving ? 'جاري الحفظ...' : 'حفظ الفئة الفرعية'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Sub-Category Modal */}
      <Modal
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title={editTarget ? `تعديل الفئة الفرعية: ${editTarget.name}` : 'تعديل الفئة الفرعية'}
        subtitle="حدّث الاسم أو التصنيف الرئيسي أو الكلمات المفتاحية المستخدمة في المطابقة الذكية."
        size="lg"
      >
        <form onSubmit={handleSaveEditSub} className="space-y-4">
          {subModalError && (
            <p className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300">
              {subModalError}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="edit-sub-name"
                className="block text-xs text-[var(--color-muted)] mb-1"
              >
                اسم الفئة الفرعية
              </label>
              <input
                id="edit-sub-name"
                type="text"
                value={editSubName}
                onChange={(e) => setEditSubName(e.target.value)}
                required
                className={`w-full ${fieldCls}`}
              />
            </div>

            <div>
              <label
                htmlFor="edit-sub-parent"
                className="block text-xs text-[var(--color-muted)] mb-1"
              >
                التصنيف الرئيسي المرتبط
              </label>
              <select
                id="edit-sub-parent"
                value={editSubParentId}
                onChange={(e) => setEditSubParentId(e.target.value)}
                className={`w-full ${fieldCls}`}
              >
                {mainCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="edit-sub-desc"
              className="block text-xs text-[var(--color-muted)] mb-1"
            >
              وصف الفئة
            </label>
            <input
              id="edit-sub-desc"
              type="text"
              value={editSubDescription}
              onChange={(e) => setEditSubDescription(e.target.value)}
              className={`w-full ${fieldCls}`}
            />
          </div>

          <div>
            <label
              htmlFor="edit-sub-kw"
              className="block text-xs text-[var(--color-muted)] mb-1"
            >
              كلمات مفتاحية للتصنيف الذكي (مفصولة بفاصلة)
            </label>
            <input
              id="edit-sub-kw"
              type="text"
              value={editSubKeywords}
              onChange={(e) => setEditSubKeywords(e.target.value)}
              className={`w-full ${fieldCls}`}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setEditTarget(null)}
              className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-muted)] hover:bg-[var(--color-cream)] cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={subSaving}
              className="px-5 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              {subSaving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Sub-Category Modal */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="تأكيد حذف الفئة الفرعية"
        size="md"
      >
        {deleteTarget && (
          <div className="space-y-4">
            {subModalError && (
              <p className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300">
                {subModalError}
              </p>
            )}

            <p className="text-sm text-[var(--color-ink)] leading-relaxed">
              هل أنت متأكد من حذف الفئة الفرعية{' '}
              <span className="font-bold text-[var(--color-green-ink)]">
                «{deleteTarget.name}»
              </span>
              ؟
            </p>
            <p className="text-xs text-[var(--color-muted)] bg-[var(--color-cream)] border border-[var(--color-border)] rounded-lg p-3 leading-relaxed">
              يوجد حالياً{' '}
              <span className="font-bold tabular-nums text-[var(--color-ink)]">
                {allListings.filter((l) => l.subCategoryId === deleteTarget.id).length}
              </span>{' '}
              إعلان مرتبط بهذه الفئة، وسيتم إعادة تصنيفها تلقائياً على أقرب فئة فرعية متبقية عند الحذف.
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-muted)] hover:bg-[var(--color-cream)] cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={subSaving}
                onClick={handleConfirmDeleteSub}
                className="px-5 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {subSaving ? 'جاري الحذف...' : 'تأكيد الحذف'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reject Commission / Bank Transfer Modal */}
      <Modal
        open={Boolean(rejectCommTarget)}
        onClose={() => setRejectCommTarget(null)}
        title="رفض تأكيد الحوالة البنكية"
        subtitle="اكتب ملاحظة واضحة للبائع ليتمكن من مراجعة بيانات التحويل وإعادة إرسالها."
        size="md"
      >
        {rejectCommTarget && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await handleReviewCommission(
                rejectCommTarget,
                'rejected',
                rejectCommNote.trim() || undefined
              );
            }}
            className="space-y-4"
          >
            {commModalError && (
              <p
                role="alert"
                className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
              >
                {commModalError}
              </p>
            )}
            <div className="p-3 rounded-lg bg-[var(--color-cream)]/60 border border-[var(--color-border)] text-xs space-y-1">
              <p className="font-bold text-[var(--color-ink)]">{rejectCommTarget.listingTitle}</p>
              <p className="text-[var(--color-muted)]">
                البائع: {rejectCommTarget.sellerName} · المبلغ:{' '}
                {formatPriceSar(rejectCommTarget.commissionAmountSar)}
              </p>
            </div>
            <div>
              <label
                htmlFor="reject-comm-note-input"
                className="block text-xs font-medium text-[var(--color-muted)] mb-1"
              >
                سبب الرفض / ملاحظة للبائع
              </label>
              <textarea
                id="reject-comm-note-input"
                rows={3}
                value={rejectCommNote}
                onChange={(e) => setRejectCommNote(e.target.value)}
                placeholder="مثال: رقم المرجع البنكي غير مطابق أو لم تصل الحوالة بعد"
                className="w-full p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)]"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setRejectCommTarget(null)}
                className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-muted)] hover:bg-[var(--color-cream)] cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={commBusyId === rejectCommTarget.id}
                className="px-5 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {commBusyId === rejectCommTarget.id ? 'جاري التنفيذ...' : 'تأكيد رفض الحوالة'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
