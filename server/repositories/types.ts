import type { AdminOverviewStats, AdminReportItem, AdminUserSummary, AuditLogEntry } from '../admin';
import type { SessionRecord } from '../auth/sessions';
import type { Credential } from '../auth/types';
import type { VerifiedGoogleClaims } from '../auth/google';
import type { VerifiedFacebookClaims } from '../auth/facebook';
import type { StoreData } from '../domain/marketplace';
import type { LikeAction } from '../likes';
import type { MediaAsset } from '../media';
import type { MediaStorageAdapter } from '../mediaStorage';
import type { ValidatedListingQuery } from '../../src/lib/listing-search';

export interface PaginatedListingsResult {
  listings: any[];
  total: number;
  totalCount: number;
  limit: number;
  offset: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
  nextOffset: number | null;
}

export interface MarketplaceRepository {
  readonly backend: 'json' | 'postgres';
  healthCheck(): Promise<boolean>;
  close(): Promise<void>;

  // Auth & sessions
  findUserById(userId: string): Promise<any | undefined>;
  findUserByPhone(phone: string): Promise<any | undefined>;
  findUserByEmail(email: string): Promise<any | undefined>;
  getCredential(userId: string): Promise<Credential | undefined>;
  updateCredential(userId: string, passwordHash: string): Promise<void>;
  getUserAuthMeta(userId: string): Promise<{
    googleLinked: boolean;
    facebookLinked: boolean;
    hasPassword: boolean;
  }>;
  findUserByGoogleSubject(subject: string): Promise<any | undefined>;
  findUserByFacebookSubject(subject: string): Promise<any | undefined>;
  authenticateWithGoogle(params: {
    claims: VerifiedGoogleClaims;
    role?: 'buyer' | 'seller';
    mode?: 'login' | 'register';
  }): Promise<{
    user: any;
    isNewUser: boolean;
    googleLinked: boolean;
    facebookLinked: boolean;
    hasPassword: boolean;
  }>;
  linkGoogleIdentity(params: {
    userId: string;
    claims: VerifiedGoogleClaims;
  }): Promise<{
    user: any;
    googleLinked: boolean;
    facebookLinked: boolean;
    hasPassword: boolean;
  }>;
  authenticateWithFacebook(params: {
    claims: VerifiedFacebookClaims;
    role?: 'buyer' | 'seller';
    mode?: 'login' | 'register';
  }): Promise<{
    user: any;
    isNewUser: boolean;
    googleLinked: boolean;
    facebookLinked: boolean;
    hasPassword: boolean;
  }>;
  linkFacebookIdentity(params: {
    userId: string;
    claims: VerifiedFacebookClaims;
  }): Promise<{
    user: any;
    googleLinked: boolean;
    facebookLinked: boolean;
    hasPassword: boolean;
  }>;
  completeUserProfile(params: {
    userId: string;
    phone: string;
    name?: string;
    role?: 'buyer' | 'seller';
  }): Promise<{
    user: any;
    googleLinked: boolean;
    facebookLinked: boolean;
    hasPassword: boolean;
  }>;
  registerUser(params: {
    name: string;
    phone: string;
    email?: string | null;
    role: 'buyer' | 'seller';
    passwordHash: string;
  }): Promise<{ user: any; seller?: any }>;
  createSession(params: {
    userId: string;
    ip?: string;
    userAgent?: string;
    absoluteMs: number;
    maxPerUser: number;
    nowMs?: number;
  }): Promise<{ token: string; session: SessionRecord; evictedIds: string[] }>;
  validateSession(params: {
    token: string | undefined;
    idleMs: number;
    nowMs?: number;
  }): Promise<SessionRecord | null>;
  isSessionAlive(params: { sessionId: string; idleMs: number; nowMs?: number }): Promise<boolean>;
  revokeSession(sessionId: string): Promise<boolean>;
  revokeAllSessionsForUser(userId: string, exceptId?: string): Promise<string[]>;
  sweepExpiredSessions(idleMs: number, nowMs?: number): Promise<string[]>;
  ensureDemoCredentials(
    hashPasswordFn: (password: string) => Promise<string>
  ): Promise<Array<{ phone: string; role: string; password: string }>>;
  hasNonDemoAdminWithCredentials(): Promise<boolean>;

  // Bootstrap & user activity & notifications
  getBootstrap(viewer: any | null, csrfToken: string | null): Promise<any>;
  getUserActivity(viewer: any): Promise<any>;
  getNotificationsForUser(userId: string): Promise<any[]>;
  markNotificationRead(userId: string, notificationId: string): Promise<any[] | null>;
  markAllNotificationsRead(userId: string): Promise<{ changed: boolean; notifications: any[] }>;

  // Listings & media
  queryListings(params: ValidatedListingQuery, viewer: any | null): Promise<PaginatedListingsResult>;
  getListingById(listingId: string, viewer: any | null): Promise<any | null>;
  revealListingContact(listingId: string, viewer: any): Promise<{
    listingId: string;
    sellerId: string;
    phone: string | null;
    whatsapp: string | null;
  }>;
  createListing(
    actor: any,
    body: any,
    hooks?: { onCandidateMediaIds?: (ids: string[]) => void; onDoneMediaIds?: (ids: string[]) => void }
  ): Promise<any>;
  updateListing(
    actor: any,
    listingId: string,
    body: any,
    hooks?: { onCandidateMediaIds?: (ids: string[]) => void; onDoneMediaIds?: (ids: string[]) => void }
  ): Promise<any>;
  countUnboundMedia(uploaderId: string): Promise<number>;
  insertMediaAsset(asset: MediaAsset): Promise<void>;
  getMediaAssetForViewer(
    mediaId: string,
    viewer: any | null
  ): Promise<{ asset: MediaAsset; isPublished: boolean } | null>;
  deleteMediaAsset(
    actor: any,
    mediaId: string,
    mediaTarget: string | MediaStorageAdapter
  ): Promise<void>;
  cleanupOrphanedMedia(
    mediaTarget: string | MediaStorageAdapter,
    ttlMs: number,
    nowMs?: number,
    protectedMediaIds?: Set<string>
  ): Promise<string[]>;

  // Favorites & likes
  toggleFavorite(actor: any, listingId: string): Promise<{ favoriteIds: string[]; isFavorite: boolean }>;
  getListingLikes(
    listingId: string,
    viewer: any | null
  ): Promise<{ listingId: string; likesCount: number; isLiked: boolean; likesEnabled: boolean } | null>;
  mutateListingLike(
    actor: any,
    listingId: string,
    action: LikeAction
  ): Promise<{
    listingId: string;
    likesCount: number;
    isLiked: boolean;
    likedListingIds: string[];
    changed: boolean;
    sellerNotification?: { userId: string; notification: any };
  }>;

  // Comments
  getListingComments(
    listingId: string,
    viewer: any | null,
    opts: { limit?: number; offset?: number }
  ): Promise<any | null>;
  createComment(
    actor: any,
    listingId: string,
    body: unknown,
    parentIdRaw: unknown
  ): Promise<{
    comment: any;
    notifyUserId?: string;
    notification?: any;
  }>;
  updateComment(actor: any, commentId: string, body: unknown): Promise<{ comment: any }>;
  deleteComment(actor: any, commentId: string, reasonRaw: unknown): Promise<{ ok: true; deletedIds: string[] }>;

  // Conversations & messages
  startConversation(
    actor: any,
    listingIdRaw: unknown,
    initialMessageRaw: unknown
  ): Promise<{
    conversation: any;
    recipientId?: string;
    recipientConversation?: any;
    notification?: any;
  }>;
  sendMessage(
    actor: any,
    conversationId: string,
    bodyRaw: unknown
  ): Promise<{
    message: any;
    conversation: any;
    recipientId?: string;
    recipientConversation?: any;
    notification?: any;
  }>;
  markConversationRead(
    actor: any,
    conversationId: string
  ): Promise<{
    conversation: any;
    notificationsUpdatedUserId?: string;
    notifications?: any[];
  }>;

  // Price offers
  createOffer(
    actor: any,
    listingId: string,
    body: any
  ): Promise<{
    offer: any;
    recipientId?: string;
    recipientConversation?: any;
    notification?: any;
  }>;
  respondToOffer(
    actor: any,
    offerId: string,
    statusRaw: unknown
  ): Promise<{
    offer: any;
    buyerNotification?: { userId: string; notification: any };
  }>;

  // Seller reviews, verification & reports
  getSellerReviews(
    sellerId: string,
    viewer: any | null,
    opts: { limit: number; offset: number }
  ): Promise<any | null>;
  upsertSellerReview(
    actor: any,
    sellerId: string,
    body: any
  ): Promise<{ created: boolean; review: any; seller: any; reviews: any[] }>;
  getSellerVerification(actor: any): Promise<any>;
  requestSellerVerification(actor: any): Promise<any>;
  createReport(actor: any, body: any): Promise<{ report: any }>;

  // Admin operations
  getAdminOverview(): Promise<AdminOverviewStats>;
  listAdminUsers(query: {
    q?: string;
    role?: string;
    status?: string;
    verificationStatus?: string;
    limit?: unknown;
    offset?: unknown;
  }): Promise<any>;
  suspendUser(
    actor: any,
    targetUserId: string,
    reason: unknown
  ): Promise<{ user: AdminUserSummary; auditEntry: AuditLogEntry; revokedSessionIds: string[] }>;
  reactivateUser(
    actor: any,
    targetUserId: string,
    reason: unknown
  ): Promise<{ user: AdminUserSummary; auditEntry: AuditLogEntry }>;
  listAdminSellers(query: {
    status?: string;
    q?: string;
    limit?: unknown;
    offset?: unknown;
  }): Promise<any>;
  reviewSellerVerification(
    actor: any,
    targetUserId: string,
    status: unknown,
    reason: unknown
  ): Promise<{
    user: AdminUserSummary;
    seller: any;
    auditEntry: AuditLogEntry;
    notification?: { userId: string; notification: any };
  }>;
  listAdminReports(query: {
    status?: string;
    targetType?: string;
    q?: string;
    limit?: unknown;
    offset?: unknown;
  }): Promise<any>;
  resolveReport(
    actor: any,
    reportId: string,
    statusRaw: unknown,
    noteRaw: unknown
  ): Promise<{ report: AdminReportItem }>;
  listAdminAuditLogs(query: {
    targetType?: string;
    q?: string;
    limit?: unknown;
    offset?: unknown;
  }): Promise<any>;
  approveListing(
    actor: any,
    listingId: string
  ): Promise<{ listing: any; notification?: { userId: string; notification: any } }>;
  rejectListing(
    actor: any,
    listingId: string,
    reason: unknown
  ): Promise<{ listing: any; notification?: { userId: string; notification: any } }>;
  createBreed(actor: any, body: any): Promise<{ breed: any }>;
  createCategory(actor: any, body: any): Promise<{ category: any }>;
  updateCategory(actor: any, categoryId: string, body: any): Promise<{ category: any }>;
  deleteCategory(actor: any, categoryId: string): Promise<void>;
  autoCategorizeListings(
    actor: any,
    body: { listingId?: string; subCategoryId?: string | null }
  ): Promise<{ updatedCount: number }>;
  listAdminComments(query: {
    q?: string;
    listingId?: string;
    limit?: unknown;
    offset?: unknown;
  }): Promise<any>;

  // Commission, Mark Sold & Featured Listing operations
  getCommissionPublicInfo(viewer: any | null): Promise<{
    settings: import('../../src/lib/commission').CommissionSettings;
    eligibility: import('../../src/lib/commission').CommissionEligibility | null;
  }>;
  markListingSold(
    actor: any,
    listingId: string,
    body: {
      soldViaPlatform?: unknown;
      saleAmountSar?: unknown;
      transferReference?: unknown;
      payerName?: unknown;
      transferNote?: unknown;
    }
  ): Promise<{
    listing: any;
    commissionRecord: import('../../src/lib/commission').CommissionRecord;
    eligibility: import('../../src/lib/commission').CommissionEligibility;
    adminNotifications: Array<{ userId: string; notification: any }>;
  }>;
  submitCommissionPayment(
    actor: any,
    body: {
      recordId?: unknown;
      listingId?: unknown;
      saleAmountSar?: unknown;
      commissionAmountSar?: unknown;
      transferReference?: unknown;
      payerName?: unknown;
      transferNote?: unknown;
    }
  ): Promise<{
    commissionRecord: import('../../src/lib/commission').CommissionRecord;
    adminNotifications: Array<{ userId: string; notification: any }>;
  }>;
  requestListingFeatured(
    actor: any,
    listingId: string,
    body: {
      transferReference?: unknown;
      payerName?: unknown;
      transferNote?: unknown;
    }
  ): Promise<{
    listing: any;
    commissionRecord: import('../../src/lib/commission').CommissionRecord;
    adminNotifications: Array<{ userId: string; notification: any }>;
  }>;
  getAdminCommissions(query: {
    status?: string;
    kind?: string;
    q?: string;
    limit?: unknown;
    offset?: unknown;
  }): Promise<{
    settings: import('../../src/lib/commission').CommissionSettings;
    summary: import('../../src/lib/commission').CommissionAdminSummary;
    records: import('../../src/lib/commission').CommissionRecord[];
    totalCount: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    nextOffset: number | null;
  }>;
  updateCommissionSettings(
    actor: any,
    body: any
  ): Promise<{
    settings: import('../../src/lib/commission').CommissionSettings;
    auditEntry: AuditLogEntry;
  }>;
  reviewCommissionRecord(
    actor: any,
    recordId: string,
    statusRaw: unknown,
    noteRaw: unknown
  ): Promise<{
    commissionRecord: import('../../src/lib/commission').CommissionRecord;
    listing?: any;
    auditEntry: AuditLogEntry;
    sellerNotification?: { userId: string; notification: any };
  }>;

  // JSON-only helpers for backwards-compatible integration tests
  getRawJsonStore?(): StoreData;
  flush?(): boolean;
}
