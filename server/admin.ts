import crypto from 'node:crypto';
import {
  canReactivateUser,
  canReviewSellerVerification,
  canSuspendUser,
  type Actor,
} from './auth/policy';

export type SellerVerificationStatus = 'Pending' | 'Verified' | 'Rejected';

export type AuditTargetType =
  | 'listing'
  | 'report'
  | 'breed'
  | 'category'
  | 'offer'
  | 'comment'
  | 'user'
  | 'seller'
  | 'commission';

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetType: AuditTargetType;
  targetId: string;
  note?: string;
  createdAt: string;
}

export interface AdminUserSellerSummary {
  displayName: string;
  city: string;
  regionId: string;
  verificationStatus: SellerVerificationStatus;
  verifiedAt: string | null;
  verificationNote: string | null;
  verificationRequestedAt: string | null;
  verificationReviewedAt: string | null;
  yearsExperience: number;
  specialty: string;
  rating: number;
  ratingCount: number;
  totalSales: number;
}

export interface AdminUserSummary {
  id: string;
  name: string;
  phone: string;
  role: 'buyer' | 'seller' | 'admin';
  status: 'active' | 'suspended';
  phoneVerified: boolean;
  createdAt: string;
  suspendedAt: string | null;
  suspensionReason: string | null;
  reactivatedAt: string | null;
  listingsCount: number;
  publishedListingsCount: number;
  pendingListingsCount: number;
  sellerProfile: AdminUserSellerSummary | null;
}

export interface AdminReportItem {
  id: string;
  targetType: 'listing' | 'comment';
  listingId: string;
  commentId: string | null;
  reporterId: string;
  reporterName: string;
  reason: string;
  details: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  listingTitle: string | null;
  listingStatus: string | null;
  commentBody: string | null;
  commentAuthorName: string | null;
}

export interface AdminOverviewStats {
  users: {
    total: number;
    active: number;
    suspended: number;
    buyers: number;
    sellers: number;
    admins: number;
  };
  sellers: {
    total: number;
    verified: number;
    pending: number;
    rejected: number;
  };
  listings: {
    total: number;
    published: number;
    pending: number;
    rejected: number;
    sold: number;
    draft: number;
    expired: number;
  };
  reports: {
    total: number;
    open: number;
    resolved: number;
    dismissed: number;
    listingReportsOpen: number;
    commentReportsOpen: number;
  };
  comments: {
    total: number;
  };
  recentActivity: AuditLogEntry[];
}

export class AdminValidationError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'invalid_admin_input'
  ) {
    super(message);
    this.name = 'AdminValidationError';
  }
}

export function resolveSellerVerificationStatus(seller: {
  verificationStatus?: unknown;
  verifiedAt?: string | null;
} | null | undefined): SellerVerificationStatus {
  if (!seller) return 'Pending';
  if (seller.verificationStatus === 'Verified') return 'Verified';
  if (seller.verificationStatus === 'Rejected') return 'Rejected';
  if (seller.verificationStatus === 'Pending') return 'Pending';
  return seller.verifiedAt ? 'Verified' : 'Pending';
}

export function isSellerProfileVerified(seller: {
  verificationStatus?: unknown;
  verifiedAt?: string | null;
} | null | undefined): boolean {
  return resolveSellerVerificationStatus(seller) === 'Verified';
}

export function normalizeSellerVerificationFields<T extends Record<string, any>>(seller: T): T {
  const status = resolveSellerVerificationStatus(seller);
  return {
    ...seller,
    verificationStatus: status,
    verifiedAt: status === 'Verified' ? seller.verifiedAt || new Date().toISOString() : null,
    verificationNote:
      typeof seller.verificationNote === 'string' && seller.verificationNote.trim()
        ? seller.verificationNote.trim()
        : null,
    verificationRequestedAt: seller.verificationRequestedAt || null,
    verificationReviewedAt: seller.verificationReviewedAt || null,
  };
}

export function normalizeReportRecord<T extends Record<string, any>>(report: T): T {
  const targetType: 'listing' | 'comment' =
    report.targetType === 'comment' || Boolean(report.commentId) ? 'comment' : 'listing';
  const status: 'open' | 'resolved' | 'dismissed' =
    report.status === 'resolved' || report.status === 'dismissed' ? report.status : 'open';
  return {
    ...report,
    targetType,
    commentId: typeof report.commentId === 'string' && report.commentId ? report.commentId : null,
    status,
    details: typeof report.details === 'string' ? report.details : '',
    resolvedAt: report.resolvedAt || null,
    resolutionNote:
      typeof report.resolutionNote === 'string' && report.resolutionNote.trim()
        ? report.resolutionNote.trim()
        : null,
  };
}

export function validateAdminNote(
  raw: unknown,
  opts: { required: boolean; label: string; minLength?: number; maxLength?: number }
): string | null {
  const minLength = opts.minLength ?? 3;
  const maxLength = opts.maxLength ?? 400;
  if (raw === undefined || raw === null) {
    if (opts.required) {
      throw new AdminValidationError(400, `يرجى إدخال ${opts.label}`);
    }
    return null;
  }
  if (typeof raw !== 'string') {
    throw new AdminValidationError(400, `قيمة ${opts.label} غير صالحة`);
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(raw)) {
    throw new AdminValidationError(400, `يحتوي ${opts.label} على أحرف غير صالحة`);
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    if (opts.required) {
      throw new AdminValidationError(400, `يرجى إدخال ${opts.label}`);
    }
    return null;
  }
  if (trimmed.length < minLength) {
    throw new AdminValidationError(
      400,
      `يجب أن لا يقل ${opts.label} عن ${minLength} أحرف`
    );
  }
  if (trimmed.length > maxLength) {
    throw new AdminValidationError(
      400,
      `يتجاوز ${opts.label} الحد الأقصى المسموح (${maxLength} حرف)`
    );
  }
  return trimmed;
}

export function parseVerificationDecision(rawStatus: unknown): SellerVerificationStatus {
  if (rawStatus === 'Verified' || rawStatus === 'Rejected' || rawStatus === 'Pending') {
    return rawStatus;
  }
  throw new AdminValidationError(
    400,
    'حالة التوثيق غير صالحة؛ يجب أن تكون Pending أو Verified أو Rejected'
  );
}

export function createAuditLogEntry(input: {
  actorId: string;
  actorName: string;
  action: string;
  targetType: AuditTargetType;
  targetId: string;
  note?: string | null;
  createdAt?: string;
}): AuditLogEntry {
  return {
    id: `aud_${crypto.randomUUID().slice(0, 8)}`,
    actorId: input.actorId,
    actorName: input.actorName,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    ...(input.note ? { note: input.note } : {}),
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

/** Strict whitelist serializer for admin user management: never leaks credentials, hashes, tokens, or private user records. */
export function toAdminUserSummary(
  user: any,
  seller: any | undefined,
  listings: any[]
): AdminUserSummary {
  const userListings = listings.filter((l) => l.sellerId === user.id);
  const publishedListingsCount = userListings.filter((l) => l.status === 'Published').length;
  const pendingListingsCount = userListings.filter((l) => l.status === 'Pending').length;

  let sellerProfile: AdminUserSellerSummary | null = null;
  if (seller) {
    const verificationStatus = resolveSellerVerificationStatus(seller);
    sellerProfile = {
      displayName: String(seller.displayName || user.name || ''),
      city: String(seller.city || ''),
      regionId: String(seller.regionId || ''),
      verificationStatus,
      verifiedAt: verificationStatus === 'Verified' ? seller.verifiedAt || null : null,
      verificationNote: seller.verificationNote || null,
      verificationRequestedAt: seller.verificationRequestedAt || null,
      verificationReviewedAt: seller.verificationReviewedAt || null,
      yearsExperience: Number(seller.yearsExperience || 0),
      specialty: String(seller.specialty || ''),
      rating: Number(seller.rating || 0),
      ratingCount: Number(seller.ratingCount || 0),
      totalSales: Number(seller.totalSales || 0),
    };
  }

  return {
    id: String(user.id),
    name: String(user.name || ''),
    phone: String(user.phone || ''),
    role: user.role === 'admin' ? 'admin' : user.role === 'seller' ? 'seller' : 'buyer',
    status: user.status === 'suspended' ? 'suspended' : 'active',
    phoneVerified: Boolean(user.phoneVerifiedAt),
    createdAt: String(user.createdAt || ''),
    suspendedAt: user.suspendedAt || null,
    suspensionReason: user.suspensionReason || null,
    reactivatedAt: user.reactivatedAt || null,
    listingsCount: userListings.length,
    publishedListingsCount,
    pendingListingsCount,
    sellerProfile,
  };
}

export function filterAdminUsers(
  users: AdminUserSummary[],
  query: {
    q?: string;
    role?: string;
    status?: string;
    verificationStatus?: string;
  }
): AdminUserSummary[] {
  const term = typeof query.q === 'string' ? query.q.trim().toLowerCase() : '';
  return users.filter((u) => {
    if (query.role && query.role !== 'all' && u.role !== query.role) {
      return false;
    }
    if (query.status && query.status !== 'all' && u.status !== query.status) {
      return false;
    }
    if (query.verificationStatus && query.verificationStatus !== 'all') {
      if (!u.sellerProfile || u.sellerProfile.verificationStatus !== query.verificationStatus) {
        return false;
      }
    }
    if (!term) return true;
    return (
      u.name.toLowerCase().includes(term) ||
      u.phone.toLowerCase().includes(term) ||
      u.id.toLowerCase().includes(term) ||
      (u.sellerProfile?.displayName || '').toLowerCase().includes(term) ||
      (u.sellerProfile?.city || '').toLowerCase().includes(term)
    );
  });
}

export function applyUserSuspension(params: {
  actor: Actor;
  actorName: string;
  targetUser: any;
  allUsers: any[];
  reason?: unknown;
  nowIso?: string;
}): { auditEntry: AuditLogEntry } {
  const decision = canSuspendUser(params.actor, params.targetUser, params.allUsers);
  if (!decision.ok) {
    throw new AdminValidationError(decision.status, decision.error, decision.code);
  }
  const cleanReason = validateAdminNote(params.reason, {
    required: true,
    label: 'سبب إيقاف الحساب',
    minLength: 3,
    maxLength: 300,
  });
  const nowIso = params.nowIso || new Date().toISOString();

  params.targetUser.status = 'suspended';
  params.targetUser.suspendedAt = nowIso;
  params.targetUser.suspendedBy = params.actor.id;
  params.targetUser.suspensionReason = cleanReason;

  const targetContact = params.targetUser.phone || params.targetUser.email || 'بدون جوال';
  const auditEntry = createAuditLogEntry({
    actorId: params.actor.id,
    actorName: params.actorName,
    action: 'إيقاف حساب مستخدم',
    targetType: 'user',
    targetId: params.targetUser.id,
    note: `${params.targetUser.name} (${targetContact}) — السبب: ${cleanReason}`,
    createdAt: nowIso,
  });

  return { auditEntry };
}

export function applyUserReactivation(params: {
  actor: Actor;
  actorName: string;
  targetUser: any;
  reason?: unknown;
  nowIso?: string;
}): { auditEntry: AuditLogEntry } {
  const decision = canReactivateUser(params.actor, params.targetUser);
  if (!decision.ok) {
    throw new AdminValidationError(decision.status, decision.error, decision.code);
  }
  const cleanNote = validateAdminNote(params.reason, {
    required: false,
    label: 'ملاحظة إعادة التفعيل',
    minLength: 2,
    maxLength: 300,
  });
  const nowIso = params.nowIso || new Date().toISOString();

  params.targetUser.status = 'active';
  params.targetUser.reactivatedAt = nowIso;
  params.targetUser.reactivatedBy = params.actor.id;
  params.targetUser.suspendedAt = null;
  params.targetUser.suspendedBy = null;
  params.targetUser.suspensionReason = null;

  const targetContact = params.targetUser.phone || params.targetUser.email || 'بدون جوال';
  const auditEntry = createAuditLogEntry({
    actorId: params.actor.id,
    actorName: params.actorName,
    action: 'إعادة تفعيل حساب مستخدم',
    targetType: 'user',
    targetId: params.targetUser.id,
    note: cleanNote
      ? `${params.targetUser.name} (${targetContact}) — ${cleanNote}`
      : `${params.targetUser.name} (${targetContact})`,
    createdAt: nowIso,
  });

  return { auditEntry };
}

export function applySellerVerificationDecision(params: {
  actor: Actor;
  actorName: string;
  seller: any;
  targetUserName?: string;
  status: unknown;
  reason?: unknown;
  nowIso?: string;
}): { verificationStatus: SellerVerificationStatus; auditEntry: AuditLogEntry } {
  if (!canReviewSellerVerification(params.actor)) {
    throw new AdminValidationError(403, 'صلاحيات المشرف مطلوبة لهذا الإجراء', 'forbidden');
  }
  const nextStatus = parseVerificationDecision(params.status);
  const cleanReason = validateAdminNote(params.reason, {
    required: nextStatus === 'Rejected',
    label: nextStatus === 'Rejected' ? 'سبب رفض التوثيق' : 'ملاحظة المراجعة',
    minLength: 3,
    maxLength: 300,
  });

  const nowIso = params.nowIso || new Date().toISOString();
  params.seller.verificationStatus = nextStatus;
  params.seller.verifiedAt = nextStatus === 'Verified' ? nowIso : null;
  params.seller.verificationNote = cleanReason;
  params.seller.verificationReviewedAt = nowIso;
  params.seller.verificationReviewedBy = params.actor.id;

  const actionLabel =
    nextStatus === 'Verified'
      ? 'توثيق حساب مربي'
      : nextStatus === 'Rejected'
      ? 'رفض توثيق مربي'
      : 'إعادة توثيق مربي للمراجعة';

  const sellerLabel = params.seller.displayName || params.targetUserName || params.seller.userId;
  const auditEntry = createAuditLogEntry({
    actorId: params.actor.id,
    actorName: params.actorName,
    action: actionLabel,
    targetType: 'seller',
    targetId: params.seller.userId,
    note: cleanReason ? `${sellerLabel} — ${cleanReason}` : sellerLabel,
    createdAt: nowIso,
  });

  return { verificationStatus: nextStatus, auditEntry };
}

export function toAdminReportItem(
  report: any,
  store: { users: any[]; listings: any[]; comments?: any[] }
): AdminReportItem {
  const normalized = normalizeReportRecord(report);
  const reporter = store.users.find((u) => u.id === normalized.reporterId);
  const listing = store.listings.find((l) => l.id === normalized.listingId);
  const comment = normalized.commentId
    ? (store.comments || []).find((c) => c.id === normalized.commentId)
    : undefined;
  const commentAuthor = comment ? store.users.find((u) => u.id === comment.authorId) : undefined;

  return {
    id: String(normalized.id),
    targetType: normalized.targetType,
    listingId: String(normalized.listingId || ''),
    commentId: normalized.commentId,
    reporterId: String(normalized.reporterId || ''),
    reporterName: reporter?.name || 'مستخدم',
    reason: String(normalized.reason || ''),
    details: String(normalized.details || ''),
    status: normalized.status,
    createdAt: String(normalized.createdAt || ''),
    resolvedAt: normalized.resolvedAt || null,
    resolutionNote: normalized.resolutionNote || null,
    listingTitle: listing?.title || null,
    listingStatus: listing?.status || null,
    commentBody: comment?.body || null,
    commentAuthorName: commentAuthor?.name || comment?.authorName || null,
  };
}

export function buildAdminOverview(store: {
  users: any[];
  sellers: any[];
  listings: any[];
  reports: any[];
  comments?: any[];
  auditLogs?: AuditLogEntry[];
}): AdminOverviewStats {
  const users = store.users || [];
  const sellers = store.sellers || [];
  const listings = store.listings || [];
  const reports = (store.reports || []).map(normalizeReportRecord);
  const comments = store.comments || [];
  const auditLogs = store.auditLogs || [];

  let sellerVerified = 0;
  let sellerPending = 0;
  let sellerRejected = 0;
  for (const s of sellers) {
    const st = resolveSellerVerificationStatus(s);
    if (st === 'Verified') sellerVerified += 1;
    else if (st === 'Rejected') sellerRejected += 1;
    else sellerPending += 1;
  }

  return {
    users: {
      total: users.length,
      active: users.filter((u) => (u.status ?? 'active') === 'active').length,
      suspended: users.filter((u) => u.status === 'suspended').length,
      buyers: users.filter((u) => u.role === 'buyer').length,
      sellers: users.filter((u) => u.role === 'seller').length,
      admins: users.filter((u) => u.role === 'admin').length,
    },
    sellers: {
      total: sellers.length,
      verified: sellerVerified,
      pending: sellerPending,
      rejected: sellerRejected,
    },
    listings: {
      total: listings.length,
      published: listings.filter((l) => l.status === 'Published').length,
      pending: listings.filter((l) => l.status === 'Pending').length,
      rejected: listings.filter((l) => l.status === 'Rejected').length,
      sold: listings.filter((l) => l.status === 'Sold').length,
      draft: listings.filter((l) => l.status === 'Draft').length,
      expired: listings.filter((l) => l.status === 'Expired').length,
    },
    reports: {
      total: reports.length,
      open: reports.filter((r) => r.status === 'open').length,
      resolved: reports.filter((r) => r.status === 'resolved').length,
      dismissed: reports.filter((r) => r.status === 'dismissed').length,
      listingReportsOpen: reports.filter((r) => r.status === 'open' && r.targetType === 'listing')
        .length,
      commentReportsOpen: reports.filter((r) => r.status === 'open' && r.targetType === 'comment')
        .length,
    },
    comments: {
      total: comments.length,
    },
    recentActivity: auditLogs.slice(0, 12),
  };
}

export interface PaginatedAdminSlice<T> {
  items: T[];
  totalCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number | null;
}

export function resolveAdminPagination(
  query: { limit?: unknown; offset?: unknown } = {},
  opts: { defaultLimit?: number; maxLimit?: number } = {}
): { limit: number; offset: number } {
  const defaultLimit = opts.defaultLimit ?? 50;
  const maxLimit = opts.maxLimit ?? 100;
  const rawLimit = Number(query.limit);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.max(1, Math.min(maxLimit, Math.trunc(rawLimit)))
      : defaultLimit;

  const rawOffset = Number(query.offset);
  const offset =
    Number.isFinite(rawOffset) && rawOffset >= 0
      ? Math.min(100_000, Math.trunc(rawOffset))
      : 0;

  return { limit, offset };
}

export function paginateAdminItems<T>(
  allItems: T[],
  query: { limit?: unknown; offset?: unknown } = {},
  opts: { defaultLimit?: number; maxLimit?: number } = {}
): PaginatedAdminSlice<T> {
  const { limit, offset } = resolveAdminPagination(query, opts);
  const totalCount = allItems.length;
  const items = allItems.slice(offset, offset + limit);
  const hasMore = offset + items.length < totalCount;
  const nextOffset = hasMore ? offset + items.length : null;

  return {
    items,
    totalCount,
    limit,
    offset,
    hasMore,
    nextOffset,
  };
}

