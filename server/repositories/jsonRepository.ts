import crypto from 'node:crypto';
import type { AppConfig } from '../config';
import {
  applySellerVerificationDecision,
  applyUserReactivation,
  applyUserSuspension,
  buildAdminOverview,
  createAuditLogEntry,
  filterAdminUsers,
  normalizeReportRecord,
  paginateAdminItems,
  resolveSellerVerificationStatus,
  toAdminReportItem,
  toAdminUserSummary,
  validateAdminNote,
} from '../admin';
import {
  buildSellerProfile,
  createGoogleIdentityRecord,
  createUserRecord,
} from '../auth/accounts';
import type { VerifiedGoogleClaims } from '../auth/google';
import { DEMO_USER_IDS } from '../auth/migrate';
import {
  canAccessConversation,
  canDeleteComment,
  canEditComment,
  canEditListing,
  canLikeListing,
  canReplyToListingComment,
  canRespondToOffer,
  canViewListing,
  canViewListingComments,
  isAdmin,
  visibleConversations,
  visibleOffers,
} from '../auth/policy';
import { toPublicSeller, toSelfUser } from '../auth/serialize';
import { SessionManager, type SessionRecord } from '../auth/sessions';
import type { Credential } from '../auth/types';
import {
  isDuplicateRecentComment,
  normalizeAndValidateCommentBody,
  paginateListingThreads,
  toPublicComment,
  type CommentRecord,
} from '../comments';
import { toUserConversation } from '../conversations';
import {
  type CreateNotificationInput,
  IMG,
  inferSubCategoryId,
  loadStore,
  RepositoryError,
  type StoreData,
  type StorePaths,
} from '../domain/marketplace';
import {
  applyListingLikeMutation,
  attachLikesCountToListing,
  getListingLikesCount,
  getUserLikedListingIds,
  hasUserLikedListing,
  type LikeAction,
  recordLikeNotification,
  shouldSendLikeNotification,
} from '../likes';
import {
  cleanupOrphanedDraftMediaAsync,
  extractMediaIdFromUrl,
  MediaUploadError,
  resolveListingMedia,
  type MediaAsset,
} from '../media';
import {
  resolveAdapterFromTarget,
  resolveAssetObjectRef,
  type MediaStorageAdapter,
} from '../mediaStorage';
import { appendAuditArchive, StorePersister } from '../storage';
import {
  INPUT_LIMITS,
  parseAndValidateKeywords,
  parseFinitePositiveNumber,
  parsePositiveInteger,
  validateCategoryParentAssignment,
  validateOptionalText,
  validateRequiredText,
} from '../validation';
import {
  listingMatchesCity,
  listingMatchesSearchQuery,
  sortListingsDeterministic,
  type ValidatedListingQuery,
} from '../../src/lib/listing-search';
import { hasMaterialListingChanges, validateExpectedPriceRule } from '../../src/lib/listing-validation';
import {
  buildCommissionAdminSummary,
  calculateCommissionAmount,
  createDefaultCommissionSettings,
  evaluateSellerCommissionEligibility,
  isValidSaudiIban,
  normalizeSaudiIban,
  roundCurrencySar,
  type CommissionEligibility,
  type CommissionRecord,
  type CommissionSettings,
} from '../../src/lib/commission';
import type { MarketplaceRepository, PaginatedListingsResult } from './types';

function collectCandidateMediaIds(imageInputs: unknown, videoInput: unknown): string[] {
  const ids: string[] = [];
  if (Array.isArray(imageInputs)) {
    for (const entry of imageInputs) {
      const rawUrl =
        typeof entry === 'string'
          ? entry.trim()
          : typeof (entry as any)?.url === 'string'
          ? String((entry as any).url).trim()
          : '';
      const rawMediaId =
        typeof (entry as any)?.mediaId === 'string'
          ? String((entry as any).mediaId).trim()
          : extractMediaIdFromUrl(rawUrl);
      if (rawMediaId) ids.push(rawMediaId);
    }
  }
  if (videoInput !== undefined && videoInput !== null && videoInput !== '') {
    const rawVideoId =
      typeof videoInput === 'string'
        ? extractMediaIdFromUrl(videoInput) || videoInput.trim()
        : typeof (videoInput as any)?.mediaId === 'string'
        ? String((videoInput as any).mediaId).trim()
        : typeof (videoInput as any)?.url === 'string'
        ? extractMediaIdFromUrl(String((videoInput as any).url))
        : null;
    if (rawVideoId) ids.push(rawVideoId);
  }
  return ids;
}

export class JsonMarketplaceRepository implements MarketplaceRepository {
  public readonly backend = 'json' as const;
  private store: StoreData;
  private readonly persister: StorePersister<StoreData>;
  public readonly sessions: SessionManager;

  constructor(
    private readonly config: AppConfig,
    private readonly paths: StorePaths,
    onSessionsRevoked?: (ids: string[]) => void
  ) {
    this.persister = new StorePersister<StoreData>(paths.dataDir, paths.storePath, 200);
    this.store = loadStore(paths);
    this.sessions = new SessionManager({
      getSessions: () => this.store.sessions,
      setSessions: (list) => {
        this.store.sessions = list;
      },
      persist: () => this.saveImmediate(),
      persistTouch: () => this.scheduleTouchSave(),
      idleMs: config.sessionIdleMs,
      absoluteMs: config.sessionAbsoluteMs,
      maxPerUser: config.maxSessionsPerUser,
      onRevoked: onSessionsRevoked,
    });
  }

  private enforceRetention() {
    if (
      this.config.auditLogMaxActive > 0 &&
      Array.isArray(this.store.auditLogs) &&
      this.store.auditLogs.length > this.config.auditLogMaxActive
    ) {
      const overflow = this.store.auditLogs.slice(this.config.auditLogMaxActive);
      try {
        appendAuditArchive(this.paths.dataDir, overflow.slice().reverse());
        this.store.auditLogs = this.store.auditLogs.slice(0, this.config.auditLogMaxActive);
      } catch (err) {
        console.error('Failed to archive overflowing audit logs; keeping active entries intact:', err);
      }
    }
  }

  public saveImmediate() {
    this.enforceRetention();
    this.persister.saveImmediate(this.store);
  }

  public scheduleTouchSave() {
    this.persister.scheduleSave(() => this.store);
  }

  public getRawJsonStore(): StoreData {
    return this.store;
  }

  public flush(): boolean {
    this.enforceRetention();
    return this.persister.flushSync(() => this.store);
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    this.flush();
  }

  private isUserSuspended(userId: string): boolean {
    const user = this.store.users.find((u) => u.id === userId);
    return Boolean(!user || user.status === 'suspended');
  }

  private isSellerContactAvailable(seller: any): boolean {
    const sellerUser = this.store.users.find((u) => u.id === seller?.userId);
    if (!sellerUser || sellerUser.status === 'suspended') return false;
    return Boolean(seller?.phone || seller?.whatsapp || sellerUser.phone);
  }

  private hasSellerInteraction(viewerId: string, sellerId: string): boolean {
    const hasConversationMessage = (this.store.conversations || []).some(
      (c) =>
        c.sellerId === sellerId &&
        c.buyerId === viewerId &&
        Array.isArray(c.messages) &&
        c.messages.length > 0
    );
    if (hasConversationMessage) return true;
    return (this.store.priceOffers || []).some(
      (o) => o.sellerId === sellerId && o.buyerId === viewerId
    );
  }

  private createNotificationRecord(input: CreateNotificationInput) {
    const item = {
      id: `ntf_${crypto.randomUUID().slice(0, 8)}`,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      listingId: input.listingId,
      conversationId: input.conversationId,
      commentId: input.commentId,
      read: false,
      createdAt: new Date().toISOString(),
    };
    this.store.notifications = this.store.notifications || [];
    this.store.notifications.unshift(item);

    if (this.config.maxReadNotificationsPerUser > 0) {
      let readSeen = 0;
      this.store.notifications = this.store.notifications.filter((n) => {
        if (n.userId !== input.userId || !n.read) return true;
        readSeen += 1;
        return readSeen <= this.config.maxReadNotificationsPerUser;
      });
    }
    return item;
  }

  private getCommissionSettingsInternal(): CommissionSettings {
    const defaults = createDefaultCommissionSettings();
    return {
      ...defaults,
      ...(this.store.commissionSettings || {}),
    };
  }

  private getSellerPlatformSalesCount(sellerId: string): number {
    return (this.store.commissionRecords || []).filter(
      (r) => r.sellerId === sellerId && r.kind === 'sale_commission' && r.soldViaPlatform
    ).length;
  }

  private getCommissionEligibilityForUser(user: any): CommissionEligibility {
    const settings = this.getCommissionSettingsInternal();
    const priorSales = this.getSellerPlatformSalesCount(user.id);
    return evaluateSellerCommissionEligibility({
      settings,
      userCreatedAt: user.createdAt,
      priorPlatformSalesCount: priorSales,
    });
  }

  private notifyActiveAdmins(
    excludeUserId: string | null,
    input: Omit<CreateNotificationInput, 'userId'>
  ): Array<{ userId: string; notification: any }> {
    const created: Array<{ userId: string; notification: any }> = [];
    for (const u of this.store.users || []) {
      if (u.role === 'admin' && u.status === 'active' && u.id !== excludeUserId) {
        const ntf = this.createNotificationRecord({ ...input, userId: u.id });
        created.push({ userId: u.id, notification: ntf });
      }
    }
    return created;
  }

  private markConversationMessageNotificationsReadInternal(
    userId: string,
    conversationId: string
  ): boolean {
    let changed = false;
    for (const ntf of this.store.notifications || []) {
      if (
        ntf.userId === userId &&
        ntf.type === 'new_message' &&
        ntf.conversationId === conversationId &&
        !ntf.read
      ) {
        ntf.read = true;
        changed = true;
      }
    }
    return changed;
  }

  // ---- Auth & sessions ----

  async findUserById(userId: string) {
    return this.store.users.find((u) => u.id === userId);
  }

  async findUserByPhone(phone: string) {
    return this.store.users.find((u) => u.phone === phone);
  }

  async getCredential(userId: string): Promise<Credential | undefined> {
    return this.store.credentials.find((c) => c.userId === userId);
  }

  async updateCredential(userId: string, passwordHash: string): Promise<void> {
    const existing = this.store.credentials.find((c) => c.userId === userId);
    const nowIso = new Date().toISOString();
    if (existing) {
      existing.passwordHash = passwordHash;
      existing.updatedAt = nowIso;
    } else {
      this.store.credentials.push({ userId, passwordHash, updatedAt: nowIso });
    }
    this.saveImmediate();
  }

  async registerUser(params: {
    name: string;
    phone: string;
    role: 'buyer' | 'seller';
    passwordHash: string;
  }) {
    if (this.store.users.some((u) => u.phone === params.phone)) {
      throw new RepositoryError(409, 'رقم الجوال مسجل مسبقاً، سجّل الدخول بدلاً من ذلك', 'phone_exists');
    }
    const user = createUserRecord({ name: params.name, phone: params.phone, role: params.role });
    this.store.users.push(user);
    let seller: any | undefined;
    if (params.role === 'seller') {
      seller = buildSellerProfile(user);
      this.store.sellers.push(seller);
    }
    this.store.credentials.push({
      userId: user.id,
      passwordHash: params.passwordHash,
      updatedAt: new Date().toISOString(),
    });
    this.saveImmediate();
    return { user, seller };
  }

  async getUserAuthMeta(userId: string): Promise<{ googleLinked: boolean; hasPassword: boolean }> {
    const googleLinked = (this.store.googleIdentities || []).some(
      (g) => g.userId === userId && g.provider === 'google'
    );
    const hasPassword = (this.store.credentials || []).some((c) => c.userId === userId);
    return { googleLinked, hasPassword };
  }

  async findUserByGoogleSubject(subject: string) {
    const identity = (this.store.googleIdentities || []).find(
      (g) => g.provider === 'google' && g.subject === subject
    );
    if (!identity) return undefined;
    return this.store.users.find((u) => u.id === identity.userId);
  }

  async authenticateWithGoogle(params: {
    claims: VerifiedGoogleClaims;
    role?: 'buyer' | 'seller';
    mode?: 'login' | 'register';
  }) {
    this.store.googleIdentities = this.store.googleIdentities || [];
    const existingIdentity = this.store.googleIdentities.find(
      (g) => g.provider === 'google' && g.subject === params.claims.sub
    );

    if (existingIdentity) {
      const user = this.store.users.find((u) => u.id === existingIdentity.userId);
      if (!user) {
        throw new RepositoryError(404, 'الحساب المرتبط بهوية Google غير موجود', 'linked_user_missing');
      }
      existingIdentity.email = params.claims.email;
      existingIdentity.emailVerified = params.claims.emailVerified;
      existingIdentity.name = params.claims.name;
      existingIdentity.pictureUrl = params.claims.picture || null;
      existingIdentity.updatedAt = new Date().toISOString();
      this.saveImmediate();
      const meta = await this.getUserAuthMeta(user.id);
      return { user, isNewUser: false, ...meta };
    }

    const emailLower = params.claims.email.trim().toLowerCase();
    const matchingEmailUser = this.store.users.find(
      (u) => typeof u.email === 'string' && u.email.trim().toLowerCase() === emailLower
    );
    if (matchingEmailUser) {
      // Never auto-link solely on matching email; require explicit proof of existing account ownership.
      throw new RepositoryError(
        409,
        'يوجد حساب مسجل مسبقاً بهذا البريد الإلكتروني. سجّل الدخول بحسابك الحالي وأكّد ملكيته لربطه بحساب Google.',
        'account_exists_link_required'
      );
    }

    const role: 'buyer' | 'seller' = params.role === 'seller' ? 'seller' : 'buyer';
    const user = createUserRecord({
      name: params.claims.name,
      phone: null,
      email: emailLower,
      role,
    });
    this.store.users.push(user);

    if (role === 'seller') {
      const seller = buildSellerProfile(user);
      this.store.sellers.push(seller);
    }

    const identity = createGoogleIdentityRecord({
      userId: user.id,
      subject: params.claims.sub,
      email: emailLower,
      emailVerified: params.claims.emailVerified,
      name: params.claims.name,
      pictureUrl: params.claims.picture || null,
    });
    this.store.googleIdentities.push(identity);
    this.saveImmediate();
    return { user, isNewUser: true, googleLinked: true, hasPassword: false };
  }

  async linkGoogleIdentity(params: { userId: string; claims: VerifiedGoogleClaims }) {
    const user = this.store.users.find((u) => u.id === params.userId);
    if (!user) {
      throw new RepositoryError(404, 'الحساب غير موجود', 'user_not_found');
    }
    if (user.status !== 'active') {
      throw new RepositoryError(403, 'هذا الحساب موقوف، تواصل مع إدارة المنصة', 'account_suspended');
    }

    this.store.googleIdentities = this.store.googleIdentities || [];
    const bySub = this.store.googleIdentities.find(
      (g) => g.provider === 'google' && g.subject === params.claims.sub
    );
    if (bySub && bySub.userId !== user.id) {
      throw new RepositoryError(
        409,
        'حساب Google هذا مرتبط بحساب آخر بالفعل',
        'google_subject_conflict'
      );
    }

    const byUser = this.store.googleIdentities.find(
      (g) => g.provider === 'google' && g.userId === user.id
    );
    if (byUser && byUser.subject !== params.claims.sub) {
      throw new RepositoryError(
        409,
        'هذا الحساب مرتبط بالفعل بحساب Google آخر',
        'google_already_linked'
      );
    }

    const nowIso = new Date().toISOString();
    if (bySub) {
      bySub.email = params.claims.email;
      bySub.emailVerified = params.claims.emailVerified;
      bySub.name = params.claims.name;
      bySub.pictureUrl = params.claims.picture || null;
      bySub.updatedAt = nowIso;
    } else {
      this.store.googleIdentities.push(
        createGoogleIdentityRecord({
          userId: user.id,
          subject: params.claims.sub,
          email: params.claims.email,
          emailVerified: params.claims.emailVerified,
          name: params.claims.name,
          pictureUrl: params.claims.picture || null,
        })
      );
    }

    this.saveImmediate();
    const meta = await this.getUserAuthMeta(user.id);
    return { user, ...meta };
  }

  async completeUserProfile(params: {
    userId: string;
    phone: string;
    name?: string;
    role?: 'buyer' | 'seller';
  }) {
    const user = this.store.users.find((u) => u.id === params.userId);
    if (!user) {
      throw new RepositoryError(404, 'الحساب غير موجود', 'user_not_found');
    }
    if (user.status !== 'active') {
      throw new RepositoryError(403, 'هذا الحساب موقوف، تواصل مع إدارة المنصة', 'account_suspended');
    }

    const duplicate = this.store.users.find((u) => u.id !== user.id && u.phone === params.phone);
    if (duplicate) {
      throw new RepositoryError(409, 'رقم الجوال مسجل لحساب آخر بالفعل', 'phone_exists');
    }

    if (user.phone !== params.phone) {
      user.phone = params.phone;
      // Never forge verification when adding or changing a phone number without OTP proof.
      user.phoneVerifiedAt = null;
    }
    if (typeof params.name === 'string' && params.name.trim()) {
      user.name = params.name.trim().slice(0, 80);
    }
    if ((params.role === 'buyer' || params.role === 'seller') && user.role !== 'admin') {
      user.role = params.role;
    }

    const existingSeller = this.store.sellers.find((s) => s.userId === user.id);
    if (existingSeller) {
      existingSeller.phone = params.phone;
      existingSeller.whatsapp = `966${params.phone.replace(/^0/, '')}`;
    } else if (user.role === 'seller') {
      this.store.sellers.push(buildSellerProfile(user));
    }

    this.saveImmediate();
    const meta = await this.getUserAuthMeta(user.id);
    return { user, ...meta };
  }

  async createSession(params: {
    userId: string;
    ip?: string;
    userAgent?: string;
    absoluteMs: number;
    maxPerUser: number;
  }) {
    const evictedIds: string[] = [];
    const { token, session } = this.sessions.create(params.userId, {
      ip: params.ip,
      userAgent: params.userAgent,
    });
    return { token, session, evictedIds };
  }

  async validateSession(params: { token: string | undefined }): Promise<SessionRecord | null> {
    return this.sessions.validate(params.token);
  }

  async isSessionAlive(params: { sessionId: string }): Promise<boolean> {
    return this.sessions.isAlive(params.sessionId);
  }

  async revokeSession(sessionId: string): Promise<boolean> {
    return this.sessions.revoke(sessionId);
  }

  async revokeAllSessionsForUser(userId: string, exceptId?: string): Promise<string[]> {
    const beforeIds = this.store.sessions
      .filter((s) => s.userId === userId && s.id !== exceptId)
      .map((s) => s.id);
    this.sessions.revokeAllForUser(userId, exceptId);
    return beforeIds;
  }

  async sweepExpiredSessions(): Promise<string[]> {
    this.sessions.sweep();
    return [];
  }

  async ensureDemoCredentials(hashPasswordFn: (password: string) => Promise<string>) {
    const created: Array<{ phone: string; role: string; password: string }> = [];
    for (const u of this.store.users) {
      if (!DEMO_USER_IDS.has(u.id) || this.store.credentials.some((c) => c.userId === u.id)) {
        continue;
      }
      const password = crypto.randomBytes(12).toString('base64url');
      this.store.credentials.push({
        userId: u.id,
        passwordHash: await hashPasswordFn(password),
        updatedAt: new Date().toISOString(),
      });
      created.push({ phone: u.phone, role: u.role, password });
    }
    if (created.length > 0) {
      this.saveImmediate();
    }
    return created;
  }

  async hasNonDemoAdminWithCredentials(): Promise<boolean> {
    return this.store.users.some(
      (u) =>
        u.role === 'admin' &&
        !u.isDemo &&
        this.store.credentials.some((c) => c.userId === u.id)
    );
  }

  // ---- Bootstrap & notifications ----

  async getBootstrap(viewer: any | null, csrfToken: string | null) {
    const favoriteIds = viewer ? this.store.favorites[viewer.id] || [] : [];
    const likedListingIds = viewer
      ? getUserLikedListingIds(this.store.likes, viewer.id, this.store.listings)
      : [];
    const visibleSellers = !viewer
      ? this.store.sellers.filter((s) => !this.isUserSuspended(s.userId))
      : this.store.sellers;

    return {
      sellers: visibleSellers.map((s) => toPublicSeller(s, this.isSellerContactAvailable(s))),
      categories: this.store.categories,
      breeds: this.store.breeds,
      regions: this.store.regions,
      indicativePrices: this.store.indicativePrices,
      articles: this.store.articles,
      faqs: this.store.faqs,
      currentUser: viewer ? toSelfUser(viewer, await this.getUserAuthMeta(viewer.id)) : null,
      csrfToken: csrfToken ?? null,
      favoriteIds,
      likedListingIds,
      conversations: viewer
        ? visibleConversations(viewer, this.store.conversations).map((c) =>
            toUserConversation(c, viewer.id, this.store)
          )
        : [],
      priceOffers: visibleOffers(viewer, this.store.priceOffers || []),
      notifications: viewer
        ? (this.store.notifications || []).filter((n) => n.userId === viewer.id)
        : [],
      reports: isAdmin(viewer) ? (this.store.reports || []).slice(0, 50) : [],
      auditLogs: isAdmin(viewer) ? (this.store.auditLogs || []).slice(0, 50) : [],
      commissionSettings: this.getCommissionSettingsInternal(),
      commissionEligibility: viewer ? this.getCommissionEligibilityForUser(viewer) : null,
      myCommissionRecords: viewer
        ? (this.store.commissionRecords || []).filter((r) => r.sellerId === viewer.id)
        : [],
    };
  }

  async getUserActivity(viewer: any) {
    return {
      favoriteIds: this.store.favorites[viewer.id] || [],
      likedListingIds: getUserLikedListingIds(this.store.likes, viewer.id, this.store.listings),
      conversations: visibleConversations(viewer, this.store.conversations).map((c) =>
        toUserConversation(c, viewer.id, this.store)
      ),
      priceOffers: visibleOffers(viewer, this.store.priceOffers || []),
      notifications: (this.store.notifications || []).filter((n) => n.userId === viewer.id),
      reports: isAdmin(viewer) ? (this.store.reports || []).slice(0, 50) : [],
      auditLogs: isAdmin(viewer) ? (this.store.auditLogs || []).slice(0, 50) : [],
      commissionSettings: this.getCommissionSettingsInternal(),
      commissionEligibility: this.getCommissionEligibilityForUser(viewer),
      myCommissionRecords: (this.store.commissionRecords || []).filter(
        (r) => r.sellerId === viewer.id
      ),
    };
  }

  async getNotificationsForUser(userId: string) {
    return (this.store.notifications || []).filter((n) => n.userId === userId);
  }

  async markNotificationRead(userId: string, notificationId: string) {
    const target = (this.store.notifications || []).find(
      (n) => n.id === notificationId && n.userId === userId
    );
    if (!target) return null;
    target.read = true;
    this.scheduleTouchSave();
    return (this.store.notifications || []).filter((n) => n.userId === userId);
  }

  async markAllNotificationsRead(userId: string) {
    let changed = false;
    this.store.notifications = (this.store.notifications || []).map((n) => {
      if (n.userId === userId && !n.read) {
        changed = true;
        return { ...n, read: true };
      }
      return n;
    });
    if (changed) {
      this.scheduleTouchSave();
    }
    return {
      changed,
      notifications: (this.store.notifications || []).filter((n) => n.userId === userId),
    };
  }

  // ---- Listings & Media ----

  async queryListings(
    params: ValidatedListingQuery,
    currentUser: any | null
  ): Promise<PaginatedListingsResult> {
    let items = [...this.store.listings];

    if (params.status) {
      if (params.status === 'Published') {
        items = items.filter((l) => l.status === 'Published');
        if (params.sellerId) {
          items = items.filter((l) => l.sellerId === params.sellerId);
        }
      } else if (isAdmin(currentUser)) {
        items = items.filter(
          (l) =>
            l.status === params.status && (!params.sellerId || l.sellerId === params.sellerId)
        );
      } else if (currentUser && params.sellerId && params.sellerId === currentUser.id) {
        items = items.filter((l) => l.sellerId === currentUser.id && l.status === params.status);
      } else if (currentUser && !params.sellerId && params.status === 'Sold') {
        items = items.filter((l) => l.sellerId === currentUser.id && l.status === 'Sold');
      } else {
        items = items.filter(
          (l) => l.status === 'Published' && (!params.sellerId || l.sellerId === params.sellerId)
        );
      }
    } else if (params.sellerId) {
      if ((currentUser && params.sellerId === currentUser.id) || isAdmin(currentUser)) {
        items = items.filter((l) => l.sellerId === params.sellerId);
      } else {
        items = items.filter((l) => l.sellerId === params.sellerId && l.status === 'Published');
      }
    } else if (params.availability === 'sold') {
      items = items.filter((l) => l.status === 'Sold' && canViewListing(currentUser, l));
    } else if (params.includeAllStatuses && isAdmin(currentUser)) {
      // Admin dashboard inventory across all listing statuses
    } else {
      items = items.filter((l) => l.status === 'Published');
    }

    if (!isAdmin(currentUser)) {
      items = items.filter((l) => !this.isUserSuspended(l.sellerId));
    }

    if (params.availability === 'available') {
      items = items.filter((l) => l.quantity > 0);
    } else if (params.availability === 'accepts_offers') {
      items = items.filter((l) => Boolean(l.allowPriceOffers));
    } else if (params.availability === 'negotiable') {
      items = items.filter((l) => Boolean(l.isNegotiable));
    }

    if (params.q) {
      const searchContext = {
        breeds: this.store.breeds,
        categories: this.store.categories,
        regions: this.store.regions,
        sellers: this.store.sellers,
      };
      items = items.filter((l) => listingMatchesSearchQuery(l, params.q, searchContext));
    }

    if (params.categoryId) items = items.filter((l) => l.categoryId === params.categoryId);
    if (params.subCategoryId) items = items.filter((l) => l.subCategoryId === params.subCategoryId);
    if (params.breedId) items = items.filter((l) => l.breedId === params.breedId);
    if (params.regionId) items = items.filter((l) => l.regionId === params.regionId);
    if (params.city) items = items.filter((l) => listingMatchesCity(l.city, params.city));
    if (params.minPrice !== undefined) items = items.filter((l) => l.priceAmount >= params.minPrice!);
    if (params.maxPrice !== undefined) items = items.filter((l) => l.priceAmount <= params.maxPrice!);
    if (params.minQty !== undefined) items = items.filter((l) => l.quantity >= params.minQty!);
    if (params.maxQty !== undefined) items = items.filter((l) => l.quantity <= params.maxQty!);
    if (params.sex) items = items.filter((l) => l.sex === params.sex);
    if (params.minAge !== undefined) items = items.filter((l) => l.ageMonths >= params.minAge!);
    if (params.maxAge !== undefined) items = items.filter((l) => l.ageMonths <= params.maxAge!);
    if (params.verifiedOnly) {
      const verifiedSellerIds = new Set(
        this.store.sellers.filter((s) => s.verificationStatus === 'Verified').map((s) => s.userId)
      );
      items = items.filter((l) => verifiedSellerIds.has(l.sellerId));
    }
    if (params.vaccinatedOnly) items = items.filter((l) => Boolean(l.vaccinated));
    if (params.hasVideoOnly) items = items.filter((l) => Boolean(l.video?.url));
    if (params.negotiableOnly) items = items.filter((l) => Boolean(l.isNegotiable));
    if (params.acceptsOffersOnly) items = items.filter((l) => Boolean(l.allowPriceOffers));

    const withLikes = sortListingsDeterministic(
      items.map((l) => attachLikesCountToListing(l, this.store.likes)),
      params.sort
    );

    const totalCount = withLikes.length;
    const paged = withLikes.slice(params.offset, params.offset + params.limit);
    const hasMore = params.offset + paged.length < totalCount;
    const nextOffset = hasMore ? params.offset + paged.length : null;
    const page = Math.floor(params.offset / params.limit) + 1;
    const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / params.limit);

    return {
      listings: paged,
      total: totalCount,
      totalCount,
      limit: params.limit,
      offset: params.offset,
      page,
      totalPages,
      hasMore,
      nextOffset,
    };
  }

  async getListingById(listingId: string, viewer: any | null) {
    const item = this.store.listings.find((l) => l.id === listingId);
    if (!item || !canViewListing(viewer, item) || (!isAdmin(viewer) && this.isUserSuspended(item.sellerId))) {
      return null;
    }
    return attachLikesCountToListing(item, this.store.likes);
  }

  async revealListingContact(listingId: string, currentUser: any) {
    const listing = this.store.listings.find((l) => l.id === listingId);
    if (!listing || !canViewListing(currentUser, listing)) {
      throw new RepositoryError(404, 'الإعلان غير موجود');
    }
    if (listing.status !== 'Published') {
      throw new RepositoryError(
        403,
        'بيانات الاتصال المباشر متاحة فقط للإعلانات المنشورة',
        'listing_not_published'
      );
    }

    const sellerUser = this.store.users.find((u) => u.id === listing.sellerId);
    if (!sellerUser || sellerUser.status === 'suspended') {
      throw new RepositoryError(403, 'لا تتوفر بيانات التواصل لهذا الحساب حالياً', 'seller_suspended');
    }

    const seller = this.store.sellers.find((s) => s.userId === listing.sellerId);
    return {
      listingId: listing.id,
      sellerId: listing.sellerId,
      phone: seller?.phone || sellerUser.phone || null,
      whatsapp: seller?.whatsapp || null,
    };
  }

  async createListing(
    currentUser: any,
    body: any,
    hooks?: { onCandidateMediaIds?: (ids: string[]) => void; onDoneMediaIds?: (ids: string[]) => void }
  ) {
    if (!currentUser?.phone) {
      throw new RepositoryError(
        403,
        'يرجى إكمال بيانات الحساب وإضافة رقم الجوال السعودي أولاً قبل نشر إعلان',
        'phone_required'
      );
    }
    const {
      categoryId,
      subCategoryId,
      breedId,
      regionId,
      city,
      title,
      description,
      priceAmount,
      expectedPrice,
      sex,
      ageMonths,
      weightKg,
      quantity,
      isNegotiable,
      allowPriceOffers,
      vaccinated,
      status: requestedStatus,
      imageUrls,
      images,
      video,
      videoMediaId,
      commissionPledgeAccepted,
      featuredRequested,
    } = body || {};

    if (
      commissionPledgeAccepted === false &&
      requestedStatus !== 'Draft' &&
      !isAdmin(currentUser)
    ) {
      throw new RepositoryError(
        400,
        'يجب الموافقة على إقرار الأمانة لعمولة المنصة قبل نشر الإعلان',
        'commission_pledge_required'
      );
    }

    const cleanTitle = validateRequiredText(title, {
      label: 'عنوان الإعلان',
      minLength: INPUT_LIMITS.listingTitleMin,
      maxLength: INPUT_LIMITS.listingTitleMax,
      code: 'invalid_title',
    });
    const cleanDescription = validateOptionalText(description, {
      label: 'وصف الإعلان',
      maxLength: INPUT_LIMITS.listingDescriptionMax,
      allowNewlines: true,
      defaultValue: '',
      code: 'invalid_description',
    });
    const cleanCity =
      city !== undefined && city !== null
        ? validateRequiredText(city, {
            label: 'المدينة',
            minLength: INPUT_LIMITS.listingCityMin,
            maxLength: INPUT_LIMITS.listingCityMax,
            code: 'invalid_city',
          })
        : 'الرياض';

    const cleanBreedId = typeof breedId === 'string' ? breedId.trim() : '';
    const breed = this.store.breeds.find((b) => b.id === cleanBreedId);
    if (!breed) {
      throw new RepositoryError(400, 'السلالة المحددة غير صالحة', 'invalid_breed');
    }

    const cleanRegionId = typeof regionId === 'string' ? regionId.trim() : '';
    if (!this.store.regions.some((r) => r.id === cleanRegionId)) {
      throw new RepositoryError(400, 'المنطقة المحددة غير صالحة', 'invalid_region');
    }

    const resolvedCategoryId =
      typeof categoryId === 'string' && categoryId.trim() ? categoryId.trim() : breed.categoryId;
    if (!this.store.categories.some((c) => c.id === resolvedCategoryId && c.parentId === null)) {
      throw new RepositoryError(400, 'التصنيف الرئيسي المحدد غير صالح', 'invalid_category');
    }

    let explicitSubCategoryId: string | null = null;
    if (subCategoryId !== undefined && subCategoryId !== null && subCategoryId !== '' && subCategoryId !== 'auto') {
      if (
        typeof subCategoryId !== 'string' ||
        !this.store.categories.some((c) => c.id === subCategoryId.trim() && c.parentId !== null)
      ) {
        throw new RepositoryError(400, 'الفئة الفرعية المحددة غير صالحة', 'invalid_subcategory');
      }
      explicitSubCategoryId = subCategoryId.trim();
    }

    const allowedSexes = new Set(['ذكر', 'أنثى', 'قطيع مختلط']);
    const resolvedSex = sex === undefined || sex === null || sex === '' ? 'ذكر' : sex;
    if (typeof resolvedSex !== 'string' || !allowedSexes.has(resolvedSex)) {
      throw new RepositoryError(400, 'قيمة الجنس غير صالحة', 'invalid_sex');
    }

    const parsedPrice = parseFinitePositiveNumber(priceAmount, {
      label: 'السعر المطلوب للرأس',
      max: INPUT_LIMITS.listingPriceMax,
      code: 'invalid_price',
    });

    const expectedCheck = validateExpectedPriceRule({
      priceAmount: parsedPrice,
      expectedPrice,
    });
    if (!expectedCheck.ok) {
      throw new RepositoryError(400, expectedCheck.error, 'invalid_expected_price');
    }
    const parsedExpected = expectedCheck.value;

    const parsedQuantity =
      quantity !== undefined && quantity !== null && quantity !== ''
        ? parsePositiveInteger(quantity, {
            label: 'الكمية',
            min: 1,
            max: INPUT_LIMITS.listingQuantityMax,
            code: 'invalid_quantity',
          })
        : 1;
    const parsedAgeMonths =
      ageMonths !== undefined && ageMonths !== null && ageMonths !== ''
        ? parsePositiveInteger(ageMonths, {
            label: 'العمر بالأشهر',
            min: INPUT_LIMITS.listingAgeMin,
            max: INPUT_LIMITS.listingAgeMax,
            code: 'invalid_age',
          })
        : 8;
    const parsedWeightKg =
      weightKg !== undefined && weightKg !== null && weightKg !== ''
        ? parseFinitePositiveNumber(weightKg, {
            label: 'الوزن التقريبي',
            minInclusive: INPUT_LIMITS.listingWeightMin,
            max: INPUT_LIMITS.listingWeightMax,
            code: 'invalid_weight',
          })
        : 42;

    const fallbackUrl = breed.imageUrl || IMG.naimi;
    const listingId = `lst_${crypto.randomUUID().slice(0, 6)}`;
    const candidateImageInputs = images !== undefined ? images : imageUrls;
    const candidateVideoInput = video !== undefined ? video : videoMediaId;
    const candidateMediaIds = collectCandidateMediaIds(candidateImageInputs, candidateVideoInput);
    hooks?.onCandidateMediaIds?.(candidateMediaIds);

    try {
      const resolvedMedia = resolveListingMedia({
        actorId: currentUser.id,
        actorIsAdmin: isAdmin(currentUser),
        targetListingId: listingId,
        mediaStore: this.store.media || [],
        imageInputs: candidateImageInputs,
        videoInput: candidateVideoInput,
        fallbackImageUrl: fallbackUrl,
      });

      if (!this.store.sellers.some((s) => s.userId === currentUser.id)) {
        const requestedAt = new Date().toISOString();
        this.store.sellers.push({
          userId: currentUser.id,
          displayName: `مراح ${currentUser.name}`,
          bio: 'مربٍ وبائع مواشٍ مسجل في منصة سوق الغنم.',
          regionId: cleanRegionId,
          city: cleanCity,
          phone: currentUser.phone,
          whatsapp: `966${currentUser.phone.replace(/^0/, '')}`,
          verificationStatus: 'Pending',
          verifiedAt: null,
          verificationNote: null,
          verificationRequestedAt: requestedAt,
          verificationReviewedAt: null,
          yearsExperience: 2,
          specialty: 'أغنام وماعز',
          rating: 0,
          ratingCount: 0,
          totalSales: 0,
        });
      }

      for (const asset of this.store.media || []) {
        if (resolvedMedia.boundMediaIds.has(asset.id)) {
          asset.listingId = listingId;
        }
      }

      const resolvedSubCategoryId =
        explicitSubCategoryId ??
        inferSubCategoryId(
          {
            title: cleanTitle,
            description: cleanDescription,
            sex: resolvedSex,
            ageMonths: parsedAgeMonths,
            categoryId: resolvedCategoryId,
          },
          this.store.categories
        );

      const allowOffers =
        allowPriceOffers !== undefined ? Boolean(allowPriceOffers) : Boolean(isNegotiable);

      const initialStatus =
        requestedStatus === 'Draft'
          ? 'Draft'
          : isAdmin(currentUser)
          ? 'Published'
          : 'Pending';

      const pledgeAccepted = Boolean(commissionPledgeAccepted);
      const wantFeatured = Boolean(featuredRequested);
      const nowIso = new Date().toISOString();
      const newListing = {
        id: listingId,
        sellerId: currentUser.id,
        categoryId: resolvedCategoryId,
        subCategoryId: resolvedSubCategoryId,
        breedId: cleanBreedId,
        regionId: cleanRegionId,
        city: cleanCity,
        title: cleanTitle,
        slug: `listing-${Date.now()}`,
        description: cleanDescription,
        priceAmount: parsedPrice,
        expectedPrice: parsedExpected,
        currency: 'SAR',
        sex: resolvedSex,
        ageMonths: parsedAgeMonths,
        weightKg: parsedWeightKg,
        quantity: parsedQuantity,
        isNegotiable: Boolean(isNegotiable) || allowOffers,
        allowPriceOffers: allowOffers,
        vaccinated: Boolean(vaccinated),
        status: initialStatus,
        publishedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
        isFeatured: false,
        commissionPledgeAccepted: pledgeAccepted,
        featuredRequested: wantFeatured,
        images: resolvedMedia.images,
        ...(resolvedMedia.video ? { video: resolvedMedia.video } : {}),
      };

      this.store.listings.unshift(newListing);

      if (wantFeatured && initialStatus !== 'Draft') {
        const settings = this.getCommissionSettingsInternal();
        const feeSar = roundCurrencySar(Number(settings.featuredWeeklyPriceSar || 35));
        this.store.commissionRecords = this.store.commissionRecords || [];
        this.store.commissionRecords.unshift({
          id: `cmr_${crypto.randomUUID().slice(0, 8)}`,
          kind: 'featured_listing',
          listingId: newListing.id,
          listingTitle: newListing.title,
          sellerId: currentUser.id,
          sellerName: currentUser.name,
          soldViaPlatform: true,
          saleAmountSar: 0,
          ratePercent: 0,
          commissionAmountSar: feeSar,
          isExempt: feeSar <= 0,
          exemptionReason: 'none',
          status: feeSar > 0 ? 'pending_payment' : 'approved',
          transferReference: null,
          payerName: null,
          transferAmountSar: null,
          transferNote: 'طلب تمييز وتثبيت الإعلان في الصفحة الرئيسية لمدة أسبوع',
          reviewedBy: null,
          reviewedAt: null,
          reviewNote: null,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }

      this.saveImmediate();
      return attachLikesCountToListing(newListing, this.store.likes);
    } finally {
      hooks?.onDoneMediaIds?.(candidateMediaIds);
    }
  }

  async updateListing(
    currentUser: any,
    listingId: string,
    body: any,
    hooks?: { onCandidateMediaIds?: (ids: string[]) => void; onDoneMediaIds?: (ids: string[]) => void }
  ) {
    const idx = this.store.listings.findIndex((l) => l.id === listingId);
    if (idx === -1) throw new RepositoryError(404, 'الإعلان غير موجود');

    const existing = this.store.listings[idx];
    if (!canEditListing(currentUser, existing)) {
      throw new RepositoryError(403, 'غير مصرح لك بتعديل هذا الإعلان');
    }

    const {
      categoryId,
      breedId,
      regionId,
      city,
      sex,
      vaccinated,
      title,
      description,
      priceAmount,
      expectedPrice,
      ageMonths,
      weightKg,
      quantity,
      isNegotiable,
      allowPriceOffers,
      status,
      subCategoryId,
      images,
      imageUrls,
      video,
      videoMediaId,
    } = body || {};

    let nextStatus = existing.status;
    if (status !== undefined) {
      if (isAdmin(currentUser)) {
        if (['Published', 'Pending', 'Rejected', 'Sold', 'Draft', 'Expired'].includes(String(status))) {
          nextStatus = String(status);
        } else {
          throw new RepositoryError(400, 'حالة الإعلان المطلوبة غير صالحة', 'invalid_status');
        }
      } else if (status === 'Sold') {
        if (existing.status !== 'Published' && existing.status !== 'Sold') {
          throw new RepositoryError(
            400,
            'يمكن تحديد الإعلان كمباع بعد اعتماده ونشره فقط',
            'invalid_status'
          );
        }
        nextStatus = 'Sold';
      } else if (status === 'Draft' || status === 'Pending') {
        nextStatus = String(status);
      } else if (status === 'Published' && existing.status !== 'Published') {
        throw new RepositoryError(
          403,
          'لا يمكن نشر الإعلان أو إعادة نشر إعلان مرفوض دون موافقة المشرف',
          'moderation_required'
        );
      } else if (status === 'Rejected') {
        throw new RepositoryError(403, 'صلاحيات المشرف مطلوبة لهذا الإجراء', 'forbidden');
      } else if (status !== existing.status) {
        throw new RepositoryError(400, 'حالة الإعلان المطلوبة غير صالحة', 'invalid_status');
      }
    }

    const nextTitle =
      title !== undefined
        ? validateRequiredText(title, {
            label: 'عنوان الإعلان',
            minLength: INPUT_LIMITS.listingTitleMin,
            maxLength: INPUT_LIMITS.listingTitleMax,
            code: 'invalid_title',
          })
        : existing.title;
    const nextDescription =
      description !== undefined
        ? validateOptionalText(description, {
            label: 'وصف الإعلان',
            maxLength: INPUT_LIMITS.listingDescriptionMax,
            allowNewlines: true,
            defaultValue: '',
            code: 'invalid_description',
          })
        : existing.description;
    const nextCity =
      city !== undefined
        ? validateRequiredText(city, {
            label: 'المدينة',
            minLength: INPUT_LIMITS.listingCityMin,
            maxLength: INPUT_LIMITS.listingCityMax,
            code: 'invalid_city',
          })
        : existing.city;

    let nextBreedId = existing.breedId;
    if (breedId !== undefined) {
      if (typeof breedId !== 'string' || !this.store.breeds.some((b) => b.id === breedId.trim())) {
        throw new RepositoryError(400, 'السلالة المحددة غير صالحة', 'invalid_breed');
      }
      nextBreedId = breedId.trim();
    }

    let nextRegionId = existing.regionId;
    if (regionId !== undefined) {
      if (typeof regionId !== 'string' || !this.store.regions.some((r) => r.id === regionId.trim())) {
        throw new RepositoryError(400, 'المنطقة المحددة غير صالحة', 'invalid_region');
      }
      nextRegionId = regionId.trim();
    }

    let nextCategoryId = existing.categoryId;
    if (categoryId !== undefined) {
      if (
        typeof categoryId !== 'string' ||
        !this.store.categories.some((c) => c.id === categoryId.trim() && c.parentId === null)
      ) {
        throw new RepositoryError(400, 'التصنيف الرئيسي المحدد غير صالح', 'invalid_category');
      }
      nextCategoryId = categoryId.trim();
    }

    let nextSex = existing.sex;
    if (sex !== undefined) {
      const allowedSexes = new Set(['ذكر', 'أنثى', 'قطيع مختلط']);
      if (typeof sex !== 'string' || !allowedSexes.has(sex)) {
        throw new RepositoryError(400, 'قيمة الجنس غير صالحة', 'invalid_sex');
      }
      nextSex = sex;
    }

    const nextPriceAmount =
      priceAmount !== undefined
        ? parseFinitePositiveNumber(priceAmount, {
            label: 'السعر المطلوب للرأس',
            max: INPUT_LIMITS.listingPriceMax,
            code: 'invalid_price',
          })
        : existing.priceAmount;

    let nextExpectedPrice = existing.expectedPrice;
    if (expectedPrice !== undefined) {
      const expectedCheck = validateExpectedPriceRule({
        priceAmount: nextPriceAmount,
        expectedPrice,
      });
      if (!expectedCheck.ok) {
        throw new RepositoryError(400, expectedCheck.error, 'invalid_expected_price');
      }
      nextExpectedPrice = expectedCheck.value;
    } else if (
      priceAmount !== undefined &&
      existing.expectedPrice !== null &&
      existing.expectedPrice !== undefined &&
      Number(existing.expectedPrice) > nextPriceAmount
    ) {
      throw new RepositoryError(
        400,
        'السعر المتوقع للتفاوض يجب أن يكون مساوياً أو أقل من السعر المطلوب للرأس',
        'invalid_expected_price'
      );
    }

    const nextAgeMonths =
      ageMonths !== undefined
        ? parsePositiveInteger(ageMonths, {
            label: 'العمر بالأشهر',
            min: INPUT_LIMITS.listingAgeMin,
            max: INPUT_LIMITS.listingAgeMax,
            code: 'invalid_age',
          })
        : existing.ageMonths;
    const nextWeightKg =
      weightKg !== undefined
        ? parseFinitePositiveNumber(weightKg, {
            label: 'الوزن التقريبي',
            minInclusive: INPUT_LIMITS.listingWeightMin,
            max: INPUT_LIMITS.listingWeightMax,
            code: 'invalid_weight',
          })
        : existing.weightKg;
    const nextQuantity =
      quantity !== undefined
        ? parsePositiveInteger(quantity, {
            label: 'الكمية',
            min: 1,
            max: INPUT_LIMITS.listingQuantityMax,
            code: 'invalid_quantity',
          })
        : existing.quantity;

    let nextSubCategoryId = existing.subCategoryId;
    if (subCategoryId !== undefined) {
      if (subCategoryId === 'auto') {
        nextSubCategoryId = inferSubCategoryId(
          {
            title: nextTitle,
            description: nextDescription,
            sex: nextSex,
            ageMonths: nextAgeMonths,
            categoryId: nextCategoryId,
          },
          this.store.categories
        );
      } else if (subCategoryId === null || subCategoryId === '') {
        nextSubCategoryId = null;
      } else if (
        typeof subCategoryId === 'string' &&
        this.store.categories.some((c) => c.id === subCategoryId.trim() && c.parentId !== null)
      ) {
        nextSubCategoryId = subCategoryId.trim();
      } else {
        throw new RepositoryError(400, 'الفئة الفرعية المحددة غير صالحة', 'invalid_subcategory');
      }
    }

    const nextVaccinated = vaccinated !== undefined ? Boolean(vaccinated) : existing.vaccinated;

    let nextImages = existing.images;
    let nextVideo = existing.video ?? null;
    const hasMediaPayload =
      images !== undefined ||
      imageUrls !== undefined ||
      video !== undefined ||
      videoMediaId !== undefined;
    const incomingImages = hasMediaPayload
      ? images !== undefined
        ? images
        : imageUrls !== undefined
        ? imageUrls
        : existing.images
      : undefined;
    const incomingVideo = hasMediaPayload
      ? video !== undefined
        ? video
        : videoMediaId !== undefined
        ? videoMediaId
        : existing.video
      : undefined;
    const candidateMediaIds = hasMediaPayload
      ? collectCandidateMediaIds(incomingImages, incomingVideo)
      : [];
    hooks?.onCandidateMediaIds?.(candidateMediaIds);

    try {
      if (hasMediaPayload) {
        const breed = this.store.breeds.find((b) => b.id === nextBreedId);
        const fallbackUrl = breed?.imageUrl || IMG.naimi;

        const resolvedMedia = resolveListingMedia({
          actorId: currentUser.id,
          actorIsAdmin: isAdmin(currentUser),
          targetListingId: existing.id,
          mediaStore: this.store.media || [],
          imageInputs: incomingImages,
          videoInput: incomingVideo,
          fallbackImageUrl: fallbackUrl,
        });

        for (const asset of this.store.media || []) {
          if (asset.listingId === existing.id && !resolvedMedia.boundMediaIds.has(asset.id)) {
            asset.listingId = null;
          }
          if (resolvedMedia.boundMediaIds.has(asset.id)) {
            asset.listingId = existing.id;
          }
        }

        nextImages = resolvedMedia.images;
        nextVideo = resolvedMedia.video;
      }

      const materialChanged = hasMaterialListingChanges(existing, {
        categoryId: nextCategoryId,
        subCategoryId: nextSubCategoryId,
        breedId: nextBreedId,
        regionId: nextRegionId,
        city: nextCity,
        title: nextTitle,
        description: nextDescription,
        priceAmount: nextPriceAmount,
        expectedPrice: nextExpectedPrice,
        sex: nextSex,
        ageMonths: nextAgeMonths,
        weightKg: nextWeightKg,
        quantity: nextQuantity,
        vaccinated: nextVaccinated,
        images: nextImages,
        video: nextVideo,
      });

      let nextRejectionReason = existing.rejectionReason;
      if (!isAdmin(currentUser)) {
        if (existing.status === 'Published' && materialChanged && nextStatus === 'Published') {
          nextStatus = 'Pending';
          nextRejectionReason = undefined;
        } else if (
          (existing.status === 'Rejected' || existing.status === 'Expired') &&
          status !== 'Draft'
        ) {
          nextStatus = 'Pending';
          nextRejectionReason = undefined;
        } else if (nextStatus === 'Pending') {
          nextRejectionReason = undefined;
        }
      } else if (nextStatus !== 'Rejected') {
        nextRejectionReason = undefined;
      }

      const updated = {
        ...existing,
        categoryId: nextCategoryId,
        breedId: nextBreedId,
        regionId: nextRegionId,
        city: nextCity,
        sex: nextSex,
        vaccinated: nextVaccinated,
        title: nextTitle,
        description: nextDescription,
        priceAmount: nextPriceAmount,
        expectedPrice: nextExpectedPrice,
        ageMonths: nextAgeMonths,
        weightKg: nextWeightKg,
        quantity: nextQuantity,
        isNegotiable: isNegotiable !== undefined ? Boolean(isNegotiable) : existing.isNegotiable,
        allowPriceOffers:
          allowPriceOffers !== undefined ? Boolean(allowPriceOffers) : existing.allowPriceOffers,
        subCategoryId: nextSubCategoryId,
        images: nextImages,
        video: nextVideo,
        status: nextStatus,
        rejectionReason: nextRejectionReason,
        updatedAt: new Date().toISOString(),
      };

      this.store.listings[idx] = updated;
      this.saveImmediate();
      return attachLikesCountToListing(updated, this.store.likes);
    } finally {
      hooks?.onDoneMediaIds?.(candidateMediaIds);
    }
  }

  async countUnboundMedia(uploaderId: string): Promise<number> {
    return (this.store.media || []).filter(
      (m) => m.uploaderId === uploaderId && m.listingId === null
    ).length;
  }

  async insertMediaAsset(asset: MediaAsset): Promise<void> {
    this.store.media = this.store.media || [];
    this.store.media.unshift(asset);
    this.saveImmediate();
  }

  async getMediaAssetForViewer(mediaId: string, viewer: any | null) {
    const asset = (this.store.media || []).find((m) => m.id === mediaId);
    if (!asset) return null;

    let isPublished = false;
    if (asset.listingId) {
      const listing = this.store.listings.find((l) => l.id === asset.listingId);
      if (
        !listing ||
        !canViewListing(viewer, listing) ||
        (!isAdmin(viewer) && this.isUserSuspended(listing.sellerId))
      ) {
        return null;
      }
      isPublished = listing.status === 'Published';
    } else if (!viewer || (asset.uploaderId !== viewer.id && !isAdmin(viewer))) {
      return null;
    }

    return { asset, isPublished };
  }

  async deleteMediaAsset(
    currentUser: any,
    mediaId: string,
    mediaTarget: string | MediaStorageAdapter
  ): Promise<void> {
    const idx = (this.store.media || []).findIndex((m) => m.id === mediaId);
    if (idx === -1) {
      throw new RepositoryError(404, 'الملف غير موجود');
    }

    const asset = this.store.media[idx];
    if (asset.uploaderId !== currentUser.id && !isAdmin(currentUser)) {
      throw new RepositoryError(403, 'غير مصرح لك بحذف هذا الملف');
    }

    if (asset.listingId) {
      const listing = this.store.listings.find((l) => l.id === asset.listingId);
      if (listing) {
        if (!canEditListing(currentUser, listing)) {
          throw new RepositoryError(403, 'غير مصرح لك بتعديل وسائط هذا الإعلان');
        }
        if (Array.isArray(listing.images)) {
          listing.images = listing.images
            .filter((img: any) => img.mediaId !== asset.id && img.url !== asset.url)
            .map((img: any, i: number) => ({ ...img, position: i + 1 }));
          if (listing.images.length === 0) {
            const breed = this.store.breeds.find((b) => b.id === listing.breedId);
            listing.images = [
              {
                id: `img_${crypto.randomUUID().slice(0, 6)}`,
                url: breed?.imageUrl || IMG.naimi,
                position: 1,
              },
            ];
          }
        }
        if (listing.video && (listing.video.mediaId === asset.id || listing.video.url === asset.url)) {
          listing.video = null;
        }
        if (
          !isAdmin(currentUser) &&
          (listing.status === 'Published' ||
            listing.status === 'Rejected' ||
            listing.status === 'Expired')
        ) {
          listing.status = 'Pending';
          listing.rejectionReason = undefined;
        }
        listing.updatedAt = new Date().toISOString();
      }
    }

    const storage = resolveAdapterFromTarget(mediaTarget);
    this.store.media.splice(idx, 1);
    this.saveImmediate();
    try {
      await storage.deleteObject(resolveAssetObjectRef(asset));
    } catch (err) {
      console.error(`[media] Failed to delete object for media ${asset.id}:`, err);
    }
  }

  async cleanupOrphanedMedia(
    mediaTarget: string | MediaStorageAdapter,
    ttlMs: number,
    nowMs = Date.now(),
    protectedMediaIds?: Set<string>
  ): Promise<string[]> {
    const storage = resolveAdapterFromTarget(mediaTarget);
    const res = await cleanupOrphanedDraftMediaAsync({
      storage,
      mediaStore: this.store.media || [],
      listings: this.store.listings || [],
      ttlMs,
      nowMs,
      protectedMediaIds,
    });
    if (res.removedIds.length > 0) {
      this.store.media = res.mediaStore;
      this.saveImmediate();
    }
    return res.removedIds;
  }

  // ---- Favorites & Likes ----

  async toggleFavorite(currentUser: any, listingId: string) {
    const currentFavs = this.store.favorites[currentUser.id] || [];
    const exists = currentFavs.includes(listingId);
    if (!exists) {
      const listing = this.store.listings.find((l) => l.id === listingId);
      if (!listing || !canViewListing(currentUser, listing)) {
        throw new RepositoryError(404, 'الإعلان غير موجود');
      }
      if (listing.status !== 'Published') {
        throw new RepositoryError(
          400,
          'يمكن حفظ الإعلانات المنشورة فقط في المفضلة',
          'listing_not_published'
        );
      }
      if (this.isUserSuspended(listing.sellerId)) {
        throw new RepositoryError(
          403,
          'هذا الحساب موقوف حالياً ولا يمكن حفظ إعلانه في المفضلة',
          'seller_suspended'
        );
      }
    }

    const nextFavs = exists
      ? currentFavs.filter((id) => id !== listingId)
      : [...currentFavs, listingId];
    this.store.favorites[currentUser.id] = nextFavs;
    this.saveImmediate();
    return { favoriteIds: nextFavs, isFavorite: !exists };
  }

  async getListingLikes(listingId: string, viewer: any | null) {
    const listing = this.store.listings.find((l) => l.id === listingId);
    if (!listing || !canViewListing(viewer, listing) || (!isAdmin(viewer) && this.isUserSuspended(listing.sellerId))) {
      return null;
    }
    const likesEnabled = listing.status === 'Published';
    return {
      listingId: listing.id,
      likesCount: likesEnabled ? getListingLikesCount(this.store.likes, listing.id) : 0,
      isLiked:
        likesEnabled && viewer ? hasUserLikedListing(this.store.likes, listing.id, viewer.id) : false,
      likesEnabled,
    };
  }

  async mutateListingLike(currentUser: any, listingId: string, action: LikeAction) {
    const listing = this.store.listings.find((l) => l.id === listingId);
    if (!listing || !canViewListing(currentUser, listing)) {
      throw new RepositoryError(404, 'الإعلان غير موجود');
    }
    if (!canLikeListing(currentUser, listing)) {
      throw new RepositoryError(403, 'الإعجاب متاح فقط للإعلانات المنشورة');
    }
    if (this.isUserSuspended(listing.sellerId)) {
      throw new RepositoryError(
        403,
        'هذا الحساب موقوف حالياً ولا يمكن التفاعل مع إعلاناته',
        'seller_suspended'
      );
    }

    this.store.likes = this.store.likes || {};
    this.store.likeNotificationHistory = this.store.likeNotificationHistory || {};

    const result = applyListingLikeMutation({
      likes: this.store.likes,
      listingId: listing.id,
      userId: currentUser.id,
      action,
    });

    let sellerNotification: { userId: string; notification: any } | undefined;
    if (result.changed) {
      if (
        result.isLiked &&
        shouldSendLikeNotification({
          history: this.store.likeNotificationHistory,
          listingId: listing.id,
          actorId: currentUser.id,
          sellerId: listing.sellerId,
        })
      ) {
        recordLikeNotification({
          history: this.store.likeNotificationHistory,
          listingId: listing.id,
          actorId: currentUser.id,
        });
        const notification = this.createNotificationRecord({
          userId: listing.sellerId,
          type: 'listing_liked',
          title: `إعجاب جديد من ${currentUser.name}`,
          body: `أعجب ${currentUser.name} بإعلانك «${listing.title}» (إجمالي الإعجابات: ${result.likesCount})`,
          listingId: listing.id,
        });
        sellerNotification = { userId: listing.sellerId, notification };
      }
      this.saveImmediate();
    }

    return {
      listingId: listing.id,
      likesCount: result.likesCount,
      isLiked: result.isLiked,
      likedListingIds: getUserLikedListingIds(this.store.likes, currentUser.id, this.store.listings),
      changed: result.changed,
      sellerNotification,
    };
  }

  // ---- Comments ----

  async getListingComments(
    listingId: string,
    viewer: any | null,
    opts: { limit?: number; offset?: number }
  ) {
    const listing = this.store.listings.find((l) => l.id === listingId);
    if (!listing || !canViewListing(viewer, listing) || (!isAdmin(viewer) && this.isUserSuspended(listing.sellerId))) {
      return null;
    }

    if (!canViewListingComments(listing)) {
      return {
        threads: [],
        totalThreads: 0,
        totalCount: 0,
        limit: 5,
        offset: 0,
        hasMore: false,
        nextOffset: null,
        commentsEnabled: false,
      };
    }

    const result = paginateListingThreads({
      comments: this.store.comments || [],
      listing,
      users: this.store.users,
      sellers: this.store.sellers,
      limit: opts.limit,
      offset: opts.offset,
    });

    return {
      ...result,
      commentsEnabled: true,
    };
  }

  async createComment(currentUser: any, listingId: string, bodyRaw: unknown, parentIdRaw: unknown) {
    const listing = this.store.listings.find((l) => l.id === listingId);
    if (!listing || !canViewListing(currentUser, listing)) {
      throw new RepositoryError(404, 'الإعلان غير موجود');
    }
    if (!canViewListingComments(listing)) {
      throw new RepositoryError(403, 'الأسئلة والتعليقات متاحة فقط على الإعلانات المنشورة');
    }
    if (this.isUserSuspended(listing.sellerId)) {
      throw new RepositoryError(
        403,
        'هذا الحساب موقوف حالياً ولا يمكن التعليق على إعلاناته',
        'seller_suspended'
      );
    }

    const cleanBody = normalizeAndValidateCommentBody(bodyRaw);
    const parentId =
      typeof parentIdRaw === 'string' && parentIdRaw.trim() ? parentIdRaw.trim() : null;

    let parentComment: CommentRecord | undefined;
    if (parentId !== null) {
      if (!canReplyToListingComment(currentUser, listing)) {
        throw new RepositoryError(403, 'فقط صاحب الإعلان يمكنه الرد مباشرة على الأسئلة', 'forbidden');
      }
      parentComment = (this.store.comments || []).find(
        (c) => c.id === parentId && c.listingId === listing.id
      );
      if (!parentComment) {
        throw new RepositoryError(404, 'التعليق الأساسي غير موجود');
      }
      if (parentComment.parentId !== null) {
        throw new RepositoryError(400, 'لا يمكن الرد على رد؛ يرجى الرد على السؤال الأساسي');
      }
    }

    this.store.comments = this.store.comments || [];
    if (
      isDuplicateRecentComment({
        comments: this.store.comments,
        listingId: listing.id,
        parentId,
        authorId: currentUser.id,
        body: cleanBody,
      })
    ) {
      throw new RepositoryError(400, 'تم إرسال هذا التعليق بالفعل قبل قليل');
    }

    const nowIso = new Date().toISOString();
    const record: CommentRecord = {
      id: `cmt_${crypto.randomUUID().slice(0, 8)}`,
      listingId: listing.id,
      parentId,
      authorId: currentUser.id,
      authorName: currentUser.name,
      body: cleanBody,
      isEdited: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.store.comments.push(record);

    let notifyUserId: string | undefined;
    let notification: any;
    if (parentId === null && currentUser.id !== listing.sellerId) {
      notification = this.createNotificationRecord({
        userId: listing.sellerId,
        type: 'new_comment',
        title: `سؤال جديد من ${currentUser.name}`,
        body: `على إعلان «${listing.title}»: ${cleanBody.slice(0, 90)}`,
        listingId: listing.id,
        commentId: record.id,
      });
      notifyUserId = listing.sellerId;
    } else if (parentComment && parentComment.authorId !== currentUser.id) {
      const sellerProfile = this.store.sellers.find((s) => s.userId === listing.sellerId);
      const sellerLabel = sellerProfile?.displayName || currentUser.name;
      notification = this.createNotificationRecord({
        userId: parentComment.authorId,
        type: 'comment_reply',
        title: `رد ${sellerLabel} على سؤالك`,
        body: `على إعلان «${listing.title}»: ${cleanBody.slice(0, 90)}`,
        listingId: listing.id,
        commentId: record.id,
      });
      notifyUserId = parentComment.authorId;
    }

    this.saveImmediate();
    return {
      comment: toPublicComment(record, listing, this.store.users, this.store.sellers),
      notifyUserId,
      notification,
    };
  }

  async updateComment(currentUser: any, commentId: string, bodyRaw: unknown) {
    const comment = (this.store.comments || []).find((c) => c.id === commentId);
    if (!comment) {
      throw new RepositoryError(404, 'التعليق غير موجود');
    }
    const listing = this.store.listings.find((l) => l.id === comment.listingId);
    if (!listing || !canViewListing(currentUser, listing)) {
      throw new RepositoryError(404, 'التعليق غير موجود');
    }
    if (!canViewListingComments(listing)) {
      throw new RepositoryError(403, 'لا يمكن تعديل تعليقات إعلان غير منشور');
    }
    if (!canEditComment(currentUser, comment, listing)) {
      throw new RepositoryError(403, 'غير مصرح لك بتعديل هذا التعليق');
    }

    const cleanBody = normalizeAndValidateCommentBody(bodyRaw);
    comment.body = cleanBody;
    comment.isEdited = true;
    comment.updatedAt = new Date().toISOString();
    this.saveImmediate();

    return {
      comment: toPublicComment(comment, listing, this.store.users, this.store.sellers),
    };
  }

  async deleteComment(currentUser: any, commentId: string, reasonRaw: unknown) {
    const comment = (this.store.comments || []).find((c) => c.id === commentId);
    if (!comment) {
      throw new RepositoryError(404, 'التعليق غير موجود');
    }
    const listing = this.store.listings.find((l) => l.id === comment.listingId);
    if (!listing || !canViewListing(currentUser, listing)) {
      throw new RepositoryError(404, 'التعليق غير موجود');
    }
    if (!canDeleteComment(currentUser, comment)) {
      throw new RepositoryError(403, 'غير مصرح لك بحذف هذا التعليق');
    }

    const deletedIds = new Set<string>([comment.id]);
    for (const c of this.store.comments || []) {
      if (c.parentId === comment.id) {
        deletedIds.add(c.id);
      }
    }

    const reason = validateOptionalText(reasonRaw, {
      label: 'سبب الحذف',
      maxLength: 300,
      defaultValue: '',
    });

    this.store.comments = (this.store.comments || []).filter((c) => !deletedIds.has(c.id));

    if (isAdmin(currentUser) && comment.authorId !== currentUser.id) {
      const nowIso = new Date().toISOString();
      for (const rep of this.store.reports || []) {
        if (rep.status === 'open' && rep.commentId && deletedIds.has(rep.commentId)) {
          rep.status = 'resolved';
          rep.resolvedAt = nowIso;
          rep.resolvedBy = currentUser.id;
          rep.resolutionNote = reason || 'تمت إزالة التعليق المخالف';
        }
      }
      this.store.auditLogs.unshift(
        createAuditLogEntry({
          actorId: currentUser.id,
          actorName: currentUser.name,
          action: 'إزالة تعليق مخالف',
          targetType: 'comment',
          targetId: comment.id,
          note: reason || comment.body.slice(0, 90),
          createdAt: nowIso,
        })
      );
    }

    this.saveImmediate();
    return { ok: true as const, deletedIds: [...deletedIds] };
  }

  // ---- Conversations & messages ----

  async startConversation(currentUser: any, rawListingId: unknown, initialMessage: unknown) {
    if (typeof rawListingId !== 'string' || !rawListingId.trim()) {
      throw new RepositoryError(400, 'معرف الإعلان مطلوب');
    }
    const listingId = rawListingId.trim();
    const listing = this.store.listings.find((l) => l.id === listingId);
    if (!listing || !canViewListing(currentUser, listing)) {
      throw new RepositoryError(404, 'الإعلان غير موجود');
    }
    if (listing.sellerId === currentUser.id) {
      throw new RepositoryError(400, 'لا يمكنك بدء محادثة على إعلانك الخاص');
    }
    if (listing.status !== 'Published') {
      throw new RepositoryError(400, 'لا يمكن بدء محادثة على إعلان غير منشور', 'listing_not_published');
    }
    const sellerUser = this.store.users.find((u) => u.id === listing.sellerId);
    if (!sellerUser || sellerUser.status === 'suspended') {
      throw new RepositoryError(403, 'لا يمكن التواصل مع هذا الحساب حالياً', 'seller_suspended');
    }

    const cleanInitial = validateOptionalText(initialMessage, {
      label: 'نص الرسالة',
      maxLength: INPUT_LIMITS.messageBodyMax,
      allowNewlines: true,
      defaultValue: '',
      code: 'invalid_message_body',
    });

    let conv = this.store.conversations.find(
      (c) => c.listingId === listingId && c.buyerId === currentUser.id
    );

    const nowIso = new Date().toISOString();
    if (!conv) {
      conv = {
        id: `conv_${crypto.randomUUID().slice(0, 6)}`,
        listingId,
        buyerId: currentUser.id,
        sellerId: listing.sellerId,
        updatedAt: nowIso,
        readAtByUserId: { [currentUser.id]: nowIso },
        messages: [],
      };
      this.store.conversations.unshift(conv);
    }

    let recipientId: string | undefined;
    let recipientConversation: any;
    let notification: any;

    if (cleanInitial) {
      const msgIso = new Date().toISOString();
      conv.messages.push({
        id: `msg_${crypto.randomUUID().slice(0, 6)}`,
        conversationId: conv.id,
        senderId: currentUser.id,
        body: cleanInitial,
        createdAt: msgIso,
      });
      conv.updatedAt = msgIso;
      conv.readAtByUserId = { ...(conv.readAtByUserId || {}), [currentUser.id]: msgIso };
      this.markConversationMessageNotificationsReadInternal(currentUser.id, conv.id);

      const otherId = currentUser.id === conv.buyerId ? conv.sellerId : conv.buyerId;
      if (otherId && otherId !== currentUser.id) {
        recipientId = otherId;
        notification = this.createNotificationRecord({
          userId: otherId,
          type: 'new_message',
          title: `رسالة جديدة من ${currentUser.name}`,
          body: cleanInitial.slice(0, 90),
          listingId: conv.listingId,
          conversationId: conv.id,
        });
        recipientConversation = toUserConversation(conv, otherId, this.store);
      }
    }

    this.saveImmediate();
    return {
      conversation: toUserConversation(conv, currentUser.id, this.store),
      recipientId,
      recipientConversation,
      notification,
    };
  }

  async sendMessage(currentUser: any, conversationId: string, bodyRaw: unknown) {
    const conv = this.store.conversations.find((c) => c.id === conversationId);
    if (!conv) throw new RepositoryError(404, 'المحادثة غير موجودة');
    if (!canAccessConversation(currentUser, conv)) {
      throw new RepositoryError(403, 'غير مصرح لك بالوصول لهذه المحادثة');
    }
    const otherId = currentUser.id === conv.buyerId ? conv.sellerId : conv.buyerId;
    if (otherId && this.isUserSuspended(otherId)) {
      throw new RepositoryError(
        403,
        'لا يمكن إرسال رسائل لهذا الحساب لأنه موقوف حالياً',
        'seller_suspended'
      );
    }
    const cleanBody = validateRequiredText(bodyRaw, {
      label: 'نص الرسالة',
      minLength: INPUT_LIMITS.messageBodyMin,
      maxLength: INPUT_LIMITS.messageBodyMax,
      allowNewlines: true,
      code: 'invalid_message_body',
    });

    const message = {
      id: `msg_${crypto.randomUUID().slice(0, 6)}`,
      conversationId: conv.id,
      senderId: currentUser.id,
      body: cleanBody,
      createdAt: new Date().toISOString(),
    };
    conv.messages.push(message);
    conv.updatedAt = message.createdAt;
    conv.readAtByUserId = { ...(conv.readAtByUserId || {}), [currentUser.id]: message.createdAt };
    this.markConversationMessageNotificationsReadInternal(currentUser.id, conv.id);

    let recipientId: string | undefined;
    let recipientConversation: any;
    let notification: any;
    if (otherId && otherId !== currentUser.id) {
      recipientId = otherId;
      notification = this.createNotificationRecord({
        userId: otherId,
        type: 'new_message',
        title: `رسالة جديدة من ${currentUser.name}`,
        body: message.body.slice(0, 90),
        listingId: conv.listingId,
        conversationId: conv.id,
      });
      recipientConversation = toUserConversation(conv, otherId, this.store);
    }

    this.saveImmediate();
    return {
      message,
      conversation: toUserConversation(conv, currentUser.id, this.store),
      recipientId,
      recipientConversation,
      notification,
    };
  }

  async markConversationRead(currentUser: any, conversationId: string) {
    const conv = this.store.conversations.find((c) => c.id === conversationId);
    if (!conv) throw new RepositoryError(404, 'المحادثة غير موجودة');
    if (!canAccessConversation(currentUser, conv)) {
      throw new RepositoryError(403, 'غير مصرح لك بالوصول لهذه المحادثة');
    }

    const nowIso = new Date().toISOString();
    conv.readAtByUserId = { ...(conv.readAtByUserId || {}), [currentUser.id]: nowIso };
    const changed = this.markConversationMessageNotificationsReadInternal(currentUser.id, conv.id);

    this.saveImmediate();
    return {
      conversation: toUserConversation(conv, currentUser.id, this.store),
      notificationsUpdatedUserId: changed ? currentUser.id : undefined,
      notifications: changed
        ? (this.store.notifications || []).filter((n) => n.userId === currentUser.id)
        : undefined,
    };
  }

  // ---- Price offers ----

  async createOffer(currentUser: any, listingId: string, body: any) {
    const listing = this.store.listings.find((l) => l.id === listingId);
    if (!listing || !canViewListing(currentUser, listing)) {
      throw new RepositoryError(404, 'الإعلان غير موجود');
    }
    if (listing.sellerId === currentUser.id) {
      throw new RepositoryError(400, 'لا يمكنك تقديم عرض سعر على إعلانك الخاص');
    }
    if (listing.status !== 'Published') {
      throw new RepositoryError(
        400,
        'يمكن تقديم عروض الأسعار على الإعلانات المنشورة فقط',
        'listing_not_published'
      );
    }
    const sellerUser = this.store.users.find((u) => u.id === listing.sellerId);
    if (!sellerUser || sellerUser.status === 'suspended') {
      throw new RepositoryError(403, 'لا يمكن تقديم عروض لهذا الحساب حالياً', 'seller_suspended');
    }

    const offersAllowed =
      listing.allowPriceOffers !== undefined ? listing.allowPriceOffers : listing.isNegotiable;
    if (!offersAllowed) {
      throw new RepositoryError(400, 'هذا الإعلان بسعر نهائي ولا يقبل عروض الأسعار');
    }

    const offeredPrice = parseFinitePositiveNumber(body?.offeredPrice, {
      label: 'قيمة العرض',
      max: INPUT_LIMITS.offerPriceMax,
      code: 'invalid_offer_price',
    });
    const maxQty = Math.max(1, Number(listing.quantity) || 1);
    const rawQty = body?.quantity === undefined || body?.quantity === null ? 1 : body?.quantity;
    const quantity = parsePositiveInteger(rawQty, {
      label: 'الكمية',
      min: 1,
      max: maxQty,
      code: 'invalid_offer_quantity',
    });
    const note = validateOptionalText(body?.note, {
      label: 'ملاحظات العرض',
      maxLength: INPUT_LIMITS.offerNoteMax,
      allowNewlines: true,
      defaultValue: '',
      code: 'invalid_offer_note',
    });

    const nowIso = new Date().toISOString();
    const offer = {
      id: `off_${crypto.randomUUID().slice(0, 6)}`,
      listingId: listing.id,
      buyerId: currentUser.id,
      buyerName: currentUser.name,
      sellerId: listing.sellerId,
      offeredPrice,
      quantity,
      note,
      status: 'pending',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.store.priceOffers = this.store.priceOffers || [];
    this.store.priceOffers.unshift(offer);

    let conv = this.store.conversations.find(
      (c) => c.listingId === listing.id && c.buyerId === currentUser.id
    );
    if (!conv) {
      conv = {
        id: `conv_${crypto.randomUUID().slice(0, 6)}`,
        listingId: listing.id,
        buyerId: currentUser.id,
        sellerId: listing.sellerId,
        updatedAt: nowIso,
        readAtByUserId: { [currentUser.id]: nowIso },
        messages: [],
      };
      this.store.conversations.unshift(conv);
    }
    const offerMsgBody = `تقديم عرض سعر جديد: ${offeredPrice.toLocaleString('en-US')} ر.س للرأس (الكمية: ${offer.quantity})${note ? ` — ${note}` : ''}`;
    conv.messages.push({
      id: `msg_${crypto.randomUUID().slice(0, 6)}`,
      conversationId: conv.id,
      senderId: currentUser.id,
      body: offerMsgBody,
      createdAt: nowIso,
    });
    conv.updatedAt = nowIso;
    conv.readAtByUserId = { ...(conv.readAtByUserId || {}), [currentUser.id]: nowIso };

    let recipientId: string | undefined;
    let recipientConversation: any;
    let notification: any;
    if (listing.sellerId !== currentUser.id) {
      recipientId = listing.sellerId;
      notification = this.createNotificationRecord({
        userId: listing.sellerId,
        type: 'new_message',
        title: `عرض سعر ورسالة جديدة من ${currentUser.name}`,
        body: offerMsgBody,
        listingId: listing.id,
        conversationId: conv.id,
      });
      recipientConversation = toUserConversation(conv, listing.sellerId, this.store);
    }

    this.saveImmediate();
    return { offer, recipientId, recipientConversation, notification };
  }

  async respondToOffer(currentUser: any, offerId: string, rawStatus: unknown) {
    const offer = (this.store.priceOffers || []).find((o) => o.id === offerId);
    if (!offer) throw new RepositoryError(404, 'عرض السعر غير موجود');
    if (!canRespondToOffer(currentUser, offer)) {
      throw new RepositoryError(403, 'صلاحية البائع مطلوبة للرد على عرض السعر');
    }
    if (rawStatus !== 'accepted' && rawStatus !== 'rejected') {
      throw new RepositoryError(400, 'حالة الرد على العرض يجب أن تكون accepted أو rejected');
    }

    const nextStatus = rawStatus;
    offer.status = nextStatus;
    offer.updatedAt = new Date().toISOString();

    const listing = this.store.listings.find((l) => l.id === offer.listingId);
    const listingTitle = listing?.title || 'الإعلان';

    const notification =
      nextStatus === 'accepted'
        ? this.createNotificationRecord({
            userId: offer.buyerId,
            type: 'offer_accepted',
            title: 'تم قبول عرض السعر الخاص بك',
            body: `وافق المربي على عرضك بقيمة ${Number(offer.offeredPrice).toLocaleString('en-US')} ر.س على إعلان «${listingTitle}».`,
            listingId: offer.listingId,
          })
        : this.createNotificationRecord({
            userId: offer.buyerId,
            type: 'offer_rejected',
            title: 'تحديث على عرض السعر',
            body: `تم الاعتذار عن عرضك على إعلان «${listingTitle}». يمكنك تقديم عرض جديد أو التواصل مع المربي.`,
            listingId: offer.listingId,
          });

    if (isAdmin(currentUser)) {
      this.store.auditLogs.unshift({
        id: `aud_${crypto.randomUUID().slice(0, 6)}`,
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: nextStatus === 'accepted' ? 'قبول عرض سعر' : 'رفض عرض سعر',
        targetType: 'offer',
        targetId: offer.id,
        note: `${offer.offeredPrice} ر.س`,
        createdAt: offer.updatedAt,
      });
    }

    this.saveImmediate();
    return {
      offer,
      buyerNotification: { userId: offer.buyerId, notification },
    };
  }

  // ---- Seller reviews, verification & reports ----

  async getSellerReviews(
    sellerId: string,
    viewer: any | null,
    opts: { limit: number; offset: number }
  ) {
    const seller = this.store.sellers.find((s) => s.userId === sellerId);
    if (!seller || (!isAdmin(viewer) && this.isUserSuspended(sellerId))) {
      return null;
    }

    const sellerReviewsList = (this.store.sellerReviews || [])
      .filter((r) => r.sellerId === sellerId)
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime()
      );

    const ratingBreakdown: Record<1 | 2 | 3 | 4 | 5, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let ratingSum = 0;
    for (const rev of sellerReviewsList) {
      const stars = Number(rev.rating) as 1 | 2 | 3 | 4 | 5;
      if (stars >= 1 && stars <= 5) {
        ratingBreakdown[stars] += 1;
        ratingSum += stars;
      }
    }

    const totalCount = sellerReviewsList.length;
    const averageRating =
      totalCount > 0 ? Math.round((ratingSum / totalCount) * 10) / 10 : seller.rating || 0;
    const paged = sellerReviewsList.slice(opts.offset, opts.offset + opts.limit);
    const hasMore = opts.offset + paged.length < totalCount;
    const nextOffset = hasMore ? opts.offset + paged.length : null;

    const myReview = viewer
      ? sellerReviewsList.find((r) => r.reviewerId === viewer.id) || null
      : null;

    let canReview = false;
    let reviewEligibilityReason: 'unauthenticated' | 'self_review' | 'no_interaction' | null = null;
    if (!viewer) {
      reviewEligibilityReason = 'unauthenticated';
    } else if (viewer.id === sellerId) {
      reviewEligibilityReason = 'self_review';
    } else if (this.hasSellerInteraction(viewer.id, sellerId)) {
      canReview = true;
    } else {
      reviewEligibilityReason = 'no_interaction';
    }

    return {
      sellerId,
      reviews: paged,
      totalCount,
      limit: opts.limit,
      offset: opts.offset,
      hasMore,
      nextOffset,
      averageRating,
      ratingBreakdown,
      myReview,
      canReview,
      reviewEligibilityReason,
    };
  }

  async upsertSellerReview(currentUser: any, sellerId: string, body: any) {
    const seller = this.store.sellers.find((s) => s.userId === sellerId);
    if (!seller) {
      throw new RepositoryError(404, 'ملف المربي غير موجود');
    }
    if (this.isUserSuspended(sellerId)) {
      throw new RepositoryError(403, 'لا يمكن إرسال تقييم لحساب موقوف حالياً', 'seller_suspended');
    }
    if (currentUser.id === sellerId) {
      throw new RepositoryError(400, 'لا يمكنك تقييم مراحك أو حسابك الشخصي');
    }
    if (!this.hasSellerInteraction(currentUser.id, sellerId)) {
      throw new RepositoryError(
        403,
        'يتاح التقييم بعد بدء محادثة أو تقديم عرض سعر مع المربي لضمان مصداقية التقييمات',
        'review_requires_interaction'
      );
    }

    const parsedRating = parsePositiveInteger(body?.rating, {
      label: 'التقييم',
      min: 1,
      max: 5,
      code: 'invalid_rating',
    });
    const comment = validateOptionalText(body?.comment, {
      label: 'التعليق',
      maxLength: INPUT_LIMITS.reviewCommentMax,
      allowNewlines: true,
      defaultValue: '',
    });
    const nowIso = new Date().toISOString();

    this.store.sellerReviews = this.store.sellerReviews || [];
    const existingIdx = this.store.sellerReviews.findIndex(
      (r) => r.sellerId === sellerId && r.reviewerId === currentUser.id
    );

    let savedReview;
    if (existingIdx !== -1) {
      savedReview = {
        ...this.store.sellerReviews[existingIdx],
        reviewerName: currentUser.name,
        rating: parsedRating,
        comment,
        updatedAt: nowIso,
      };
      this.store.sellerReviews[existingIdx] = savedReview;
    } else {
      savedReview = {
        id: `rev_${crypto.randomUUID().slice(0, 6)}`,
        sellerId,
        reviewerId: currentUser.id,
        reviewerName: currentUser.name,
        rating: parsedRating,
        comment,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      this.store.sellerReviews.unshift(savedReview);
    }

    const sellerReviewsList = this.store.sellerReviews
      .filter((r) => r.sellerId === sellerId)
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime()
      );
    const sum = sellerReviewsList.reduce((acc, r) => acc + Number(r.rating || 0), 0);
    seller.ratingCount = sellerReviewsList.length;
    seller.rating =
      sellerReviewsList.length > 0 ? Math.round((sum / sellerReviewsList.length) * 10) / 10 : 0;

    this.saveImmediate();
    return {
      created: existingIdx === -1,
      review: savedReview,
      seller: toPublicSeller(seller, this.isSellerContactAvailable(seller)),
      reviews: sellerReviewsList.slice(0, 10),
    };
  }

  async getSellerVerification(currentUser: any) {
    const seller = this.store.sellers.find((s) => s.userId === currentUser.id);
    if (!seller) return { seller: null };
    const status = resolveSellerVerificationStatus(seller);
    return {
      seller: {
        userId: seller.userId,
        displayName: seller.displayName,
        verificationStatus: status,
        verifiedAt: status === 'Verified' ? seller.verifiedAt || null : null,
        verificationNote: seller.verificationNote || null,
        verificationRequestedAt: seller.verificationRequestedAt || null,
        verificationReviewedAt: seller.verificationReviewedAt || null,
      },
    };
  }

  async requestSellerVerification(currentUser: any) {
    if (!currentUser?.phone) {
      throw new RepositoryError(
        403,
        'يرجى إكمال بيانات الحساب وإضافة رقم الجوال السعودي أولاً قبل طلب توثيق الحساب',
        'phone_required'
      );
    }
    let seller = this.store.sellers.find((s) => s.userId === currentUser.id);
    const nowIso = new Date().toISOString();

    if (!seller) {
      if (
        currentUser.role !== 'seller' &&
        !this.store.listings.some((l) => l.sellerId === currentUser.id)
      ) {
        throw new RepositoryError(403, 'طلب التوثيق متاح لحسابات البائعين والمربين فقط');
      }
      seller = {
        userId: currentUser.id,
        displayName: `مراح ${currentUser.name}`,
        bio: 'مربٍ وبائع مواشٍ مسجل في منصة سوق الغنم.',
        regionId: 'reg_riyadh',
        city: 'الرياض',
        phone: currentUser.phone,
        whatsapp: `966${currentUser.phone.replace(/^0/, '')}`,
        verificationStatus: 'Pending',
        verifiedAt: null,
        verificationNote: null,
        verificationRequestedAt: nowIso,
        verificationReviewedAt: null,
        yearsExperience: 2,
        specialty: 'أغنام وماعز',
        rating: 0,
        ratingCount: 0,
        totalSales: 0,
      };
      this.store.sellers.push(seller);
    } else {
      const currentStatus = resolveSellerVerificationStatus(seller);
      if (currentStatus === 'Verified') {
        throw new RepositoryError(400, 'حساب المربي موثق بالفعل');
      }
      if (!seller.phone && currentUser.phone) {
        seller.phone = currentUser.phone;
        seller.whatsapp = `966${currentUser.phone.replace(/^0/, '')}`;
      }
      seller.verificationStatus = 'Pending';
      seller.verifiedAt = null;
      seller.verificationNote = null;
      seller.verificationRequestedAt = nowIso;
    }

    this.saveImmediate();
    return {
      seller: {
        userId: seller.userId,
        displayName: seller.displayName,
        verificationStatus: seller.verificationStatus,
        verifiedAt: seller.verifiedAt,
        verificationNote: seller.verificationNote,
        verificationRequestedAt: seller.verificationRequestedAt,
        verificationReviewedAt: seller.verificationReviewedAt,
      },
    };
  }

  async createReport(currentUser: any, body: any) {
    const { listingId: rawListingId, commentId, reason, details } = body || {};
    if (typeof rawListingId !== 'string' || !rawListingId.trim()) {
      throw new RepositoryError(400, 'معرف الإعلان مطلوب');
    }
    const listingId = rawListingId.trim();

    const cleanReason = validateRequiredText(reason, {
      label: 'سبب البلاغ',
      minLength: INPUT_LIMITS.reportReasonMin,
      maxLength: INPUT_LIMITS.reportReasonMax,
      code: 'invalid_report_reason',
    });
    const cleanDetails = validateOptionalText(details, {
      label: 'تفاصيل البلاغ',
      maxLength: INPUT_LIMITS.reportDetailsMax,
      allowNewlines: true,
      defaultValue: '',
      code: 'invalid_report_details',
    });

    const listing = this.store.listings.find((l) => l.id === listingId);
    if (!listing || !canViewListing(currentUser, listing)) {
      throw new RepositoryError(404, 'الإعلان غير موجود');
    }

    const cleanCommentId = typeof commentId === 'string' && commentId.trim() ? commentId.trim() : null;
    const targetType: 'listing' | 'comment' = cleanCommentId ? 'comment' : 'listing';
    if (cleanCommentId) {
      if (listing.status !== 'Published') {
        throw new RepositoryError(404, 'التعليق غير موجود');
      }
      const targetComment = (this.store.comments || []).find(
        (c) => c.id === cleanCommentId && c.listingId === listing.id
      );
      if (!targetComment) {
        throw new RepositoryError(404, 'التعليق غير موجود');
      }
      if (targetComment.authorId === currentUser.id) {
        throw new RepositoryError(400, 'لا يمكنك الإبلاغ عن تعليقك الشخصي');
      }
    }

    const duplicateOpen = (this.store.reports || []).some((r) => {
      const normalized = normalizeReportRecord(r);
      return (
        normalized.status === 'open' &&
        normalized.reporterId === currentUser.id &&
        normalized.targetType === targetType &&
        normalized.listingId === listing.id &&
        normalized.commentId === cleanCommentId
      );
    });
    if (duplicateOpen) {
      throw new RepositoryError(409, 'تم إرسال بلاغ مماثل مسبقاً وهو قيد المراجعة');
    }

    const report = {
      id: `rep_${crypto.randomUUID().slice(0, 6)}`,
      targetType,
      reporterId: currentUser.id,
      listingId: listing.id,
      commentId: cleanCommentId,
      reason: cleanReason,
      details: cleanDetails,
      status: 'open',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      resolutionNote: null,
    };
    this.store.reports.unshift(report);
    this.saveImmediate();
    return { report };
  }

  // ---- Admin ----

  async getAdminOverview() {
    return buildAdminOverview(this.store);
  }

  async listAdminUsers(query: {
    q?: string;
    role?: string;
    status?: string;
    verificationStatus?: string;
    limit?: unknown;
    offset?: unknown;
  }) {
    const summaries = this.store.users.map((user) => {
      const seller = this.store.sellers.find((s) => s.userId === user.id);
      return toAdminUserSummary(user, seller, this.store.listings);
    });
    const filtered = filterAdminUsers(summaries, query).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const paged = paginateAdminItems(filtered, query, { defaultLimit: 50, maxLimit: 100 });
    return {
      users: paged.items,
      total: paged.totalCount,
      totalCount: paged.totalCount,
      limit: paged.limit,
      offset: paged.offset,
      hasMore: paged.hasMore,
      nextOffset: paged.nextOffset,
    };
  }

  async suspendUser(currentUser: any, targetUserId: string, reason: unknown) {
    const targetUser = this.store.users.find((u) => u.id === targetUserId);
    const { auditEntry } = applyUserSuspension({
      actor: currentUser,
      actorName: currentUser.name,
      targetUser,
      allUsers: this.store.users,
      reason,
    });
    const revokedSessionIds = await this.revokeAllSessionsForUser(targetUser.id);
    this.store.auditLogs.unshift(auditEntry);
    this.saveImmediate();
    const seller = this.store.sellers.find((s) => s.userId === targetUser.id);
    return {
      user: toAdminUserSummary(targetUser, seller, this.store.listings),
      auditEntry,
      revokedSessionIds,
    };
  }

  async reactivateUser(currentUser: any, targetUserId: string, reason: unknown) {
    const targetUser = this.store.users.find((u) => u.id === targetUserId);
    const { auditEntry } = applyUserReactivation({
      actor: currentUser,
      actorName: currentUser.name,
      targetUser,
      reason,
    });
    this.store.auditLogs.unshift(auditEntry);
    this.saveImmediate();
    const seller = this.store.sellers.find((s) => s.userId === targetUser.id);
    return {
      user: toAdminUserSummary(targetUser, seller, this.store.listings),
      auditEntry,
    };
  }

  async listAdminSellers(query: {
    status?: string;
    q?: string;
    limit?: unknown;
    offset?: unknown;
  }) {
    const statusFilter = query.status || 'all';
    const q = typeof query.q === 'string' ? query.q.trim().toLowerCase() : '';

    const items = this.store.users
      .filter((u) => this.store.sellers.some((s) => s.userId === u.id))
      .map((u) => {
        const seller = this.store.sellers.find((s) => s.userId === u.id);
        return toAdminUserSummary(u, seller, this.store.listings);
      })
      .filter((summary) => {
        if (!summary.sellerProfile) return false;
        if (
          statusFilter &&
          statusFilter !== 'all' &&
          summary.sellerProfile.verificationStatus !== statusFilter
        ) {
          return false;
        }
        if (!q) return true;
        return (
          summary.name.toLowerCase().includes(q) ||
          summary.phone.toLowerCase().includes(q) ||
          summary.sellerProfile.displayName.toLowerCase().includes(q) ||
          summary.sellerProfile.city.toLowerCase().includes(q)
        );
      });

    const paged = paginateAdminItems(items, query, { defaultLimit: 50, maxLimit: 100 });
    return {
      sellers: paged.items,
      totalCount: paged.totalCount,
      limit: paged.limit,
      offset: paged.offset,
      hasMore: paged.hasMore,
      nextOffset: paged.nextOffset,
    };
  }

  async reviewSellerVerification(
    currentUser: any,
    targetUserId: string,
    status: unknown,
    reason: unknown
  ) {
    const targetUser = this.store.users.find((u) => u.id === targetUserId);
    const seller = this.store.sellers.find((s) => s.userId === targetUserId);
    if (!targetUser || !seller) {
      throw new RepositoryError(404, 'ملف المربي غير موجود');
    }

    const { verificationStatus, auditEntry } = applySellerVerificationDecision({
      actor: currentUser,
      actorName: currentUser.name,
      seller,
      targetUserName: targetUser.name,
      status,
      reason,
    });

    let notification: { userId: string; notification: any } | undefined;
    if (verificationStatus === 'Verified') {
      notification = {
        userId: seller.userId,
        notification: this.createNotificationRecord({
          userId: seller.userId,
          type: 'seller_verified',
          title: 'تم توثيق حسابك كمربي معتمد',
          body: `أصبح حساب «${seller.displayName}» يحمل شارة المربي الموثق في السوق.`,
        }),
      };
    } else if (verificationStatus === 'Rejected') {
      notification = {
        userId: seller.userId,
        notification: this.createNotificationRecord({
          userId: seller.userId,
          type: 'seller_verification_rejected',
          title: 'تحديث حول طلب توثيق المربي',
          body: seller.verificationNote
            ? `لم يتم اعتماد التوثيق حالياً: ${seller.verificationNote}`
            : 'لم يتم اعتماد طلب التوثيق حالياً، يرجى مراجعة بيانات المراح.',
        }),
      };
    }

    this.store.auditLogs.unshift(auditEntry);
    this.saveImmediate();
    return {
      user: toAdminUserSummary(targetUser, seller, this.store.listings),
      seller: toPublicSeller(seller, this.isSellerContactAvailable(seller)),
      auditEntry,
      notification,
    };
  }

  async listAdminReports(query: {
    status?: string;
    targetType?: string;
    q?: string;
    limit?: unknown;
    offset?: unknown;
  }) {
    const statusFilter = query.status || 'all';
    const targetTypeFilter = query.targetType || 'all';
    const q = typeof query.q === 'string' ? query.q.trim().toLowerCase() : '';

    const items = (this.store.reports || [])
      .map((r) => toAdminReportItem(r, this.store))
      .filter((item) => {
        if (statusFilter !== 'all' && item.status !== statusFilter) return false;
        if (targetTypeFilter !== 'all' && item.targetType !== targetTypeFilter) return false;
        if (!q) return true;
        return (
          item.reason.toLowerCase().includes(q) ||
          item.details.toLowerCase().includes(q) ||
          item.reporterName.toLowerCase().includes(q) ||
          (item.listingTitle || '').toLowerCase().includes(q) ||
          (item.commentBody || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const paged = paginateAdminItems(items, query, { defaultLimit: 50, maxLimit: 100 });
    return {
      reports: paged.items,
      totalCount: paged.totalCount,
      limit: paged.limit,
      offset: paged.offset,
      hasMore: paged.hasMore,
      nextOffset: paged.nextOffset,
    };
  }

  async resolveReport(currentUser: any, reportId: string, statusRaw: unknown, noteRaw: unknown) {
    const report = this.store.reports.find((r) => r.id === reportId);
    if (!report) throw new RepositoryError(404, 'البلاغ غير موجود');

    const resolutionNote = validateAdminNote(noteRaw, {
      required: false,
      label: 'ملاحظة الإجراء',
      minLength: 2,
      maxLength: 300,
    });

    const nowIso = new Date().toISOString();
    report.targetType = report.targetType === 'comment' || report.commentId ? 'comment' : 'listing';
    report.status = statusRaw === 'dismissed' ? 'dismissed' : 'resolved';
    report.resolvedAt = nowIso;
    report.resolvedBy = currentUser.id;
    report.resolutionNote = resolutionNote;

    this.store.auditLogs.unshift(
      createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: report.status === 'resolved' ? 'معالجة بلاغ' : 'إغلاق بلاغ',
        targetType: 'report',
        targetId: report.id,
        note: resolutionNote ? `${report.reason} — ${resolutionNote}` : report.reason,
        createdAt: nowIso,
      })
    );
    this.saveImmediate();
    return { report: toAdminReportItem(report, this.store) };
  }

  async listAdminAuditLogs(query: {
    targetType?: string;
    q?: string;
    limit?: unknown;
    offset?: unknown;
  }) {
    const targetTypeFilter = query.targetType || 'all';
    const q = typeof query.q === 'string' ? query.q.trim().toLowerCase() : '';

    const filteredLogs = (this.store.auditLogs || []).filter((log) => {
      if (targetTypeFilter !== 'all' && log.targetType !== targetTypeFilter) return false;
      if (!q) return true;
      return (
        String(log.action || '').toLowerCase().includes(q) ||
        String(log.actorName || '').toLowerCase().includes(q) ||
        String(log.note || '').toLowerCase().includes(q) ||
        String(log.targetId || '').toLowerCase().includes(q)
      );
    });

    const paged = paginateAdminItems(filteredLogs, query, { defaultLimit: 50, maxLimit: 200 });
    return {
      auditLogs: paged.items,
      totalCount: paged.totalCount,
      limit: paged.limit,
      offset: paged.offset,
      hasMore: paged.hasMore,
      nextOffset: paged.nextOffset,
    };
  }

  async approveListing(currentUser: any, listingId: string) {
    const listing = this.store.listings.find((l) => l.id === listingId);
    if (!listing) throw new RepositoryError(404, 'الإعلان غير موجود');

    const nowIso = new Date().toISOString();
    listing.status = 'Published';
    listing.rejectionReason = undefined;
    listing.publishedAt = nowIso;
    listing.updatedAt = nowIso;

    let notification: { userId: string; notification: any } | undefined;
    if (listing.sellerId !== currentUser.id) {
      notification = {
        userId: listing.sellerId,
        notification: this.createNotificationRecord({
          userId: listing.sellerId,
          type: 'listing_approved',
          title: 'تم اعتماد ونشر إعلانك',
          body: `تمت الموافقة على إعلان «${listing.title}» ونشره في السوق.`,
          listingId: listing.id,
        }),
      };
    }

    this.store.auditLogs.unshift(
      createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'اعتماد ونشر إعلان',
        targetType: 'listing',
        targetId: listing.id,
        note: listing.title,
        createdAt: nowIso,
      })
    );

    this.saveImmediate();
    return { listing: attachLikesCountToListing(listing, this.store.likes), notification };
  }

  async rejectListing(currentUser: any, listingId: string, reason: unknown) {
    const listing = this.store.listings.find((l) => l.id === listingId);
    if (!listing) throw new RepositoryError(404, 'الإعلان غير موجود');

    const cleanReason = validateAdminNote(reason, {
      required: true,
      label: 'سبب رفض الإعلان',
      minLength: 3,
      maxLength: 400,
    });

    const nowIso = new Date().toISOString();
    listing.status = 'Rejected';
    listing.rejectionReason = cleanReason!;
    listing.updatedAt = nowIso;

    let notification: { userId: string; notification: any } | undefined;
    if (listing.sellerId !== currentUser.id) {
      notification = {
        userId: listing.sellerId,
        notification: this.createNotificationRecord({
          userId: listing.sellerId,
          type: 'listing_rejected',
          title: 'تحديث على حالة إعلانك',
          body: `لم يُعتمد إعلان «${listing.title}» — السبب: ${listing.rejectionReason}`,
          listingId: listing.id,
        }),
      };
    }

    this.store.auditLogs.unshift(
      createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'رفض إعلان',
        targetType: 'listing',
        targetId: listing.id,
        note: `${listing.title} — ${listing.rejectionReason}`,
        createdAt: nowIso,
      })
    );

    this.saveImmediate();
    return { listing: attachLikesCountToListing(listing, this.store.likes), notification };
  }

  async createBreed(currentUser: any, body: any) {
    const { name, categoryId, origin, summary, avgWeightKg, priceRangeSar } = body || {};
    const cleanName = validateRequiredText(name, {
      label: 'اسم السلالة',
      minLength: INPUT_LIMITS.breedNameMin,
      maxLength: INPUT_LIMITS.breedNameMax,
      code: 'invalid_breed_name',
    });
    if (
      typeof categoryId !== 'string' ||
      !this.store.categories.some((c) => c.id === categoryId.trim() && c.parentId === null)
    ) {
      throw new RepositoryError(400, 'التصنيف الرئيسي المحدد غير صالح', 'invalid_category');
    }
    const cleanOrigin = validateOptionalText(origin, {
      label: 'المنشأ',
      maxLength: INPUT_LIMITS.breedFieldMax,
      defaultValue: 'المملكة العربية السعودية',
    });
    const cleanSummary = validateOptionalText(summary, {
      label: 'الوصف',
      maxLength: INPUT_LIMITS.breedFieldMax,
      allowNewlines: true,
      defaultValue: 'سلالة مضافة عبر إدارة المنصة.',
    });
    const cleanAvgWeight = validateOptionalText(avgWeightKg, {
      label: 'متوسط الوزن',
      maxLength: INPUT_LIMITS.breedFieldMax,
      defaultValue: '35 – 55 كجم',
    });
    const cleanPriceRange = validateOptionalText(priceRangeSar, {
      label: 'النطاق السعري',
      maxLength: INPUT_LIMITS.breedFieldMax,
      defaultValue: '1,200 – 2,000 ر.س',
    });

    const newBreed = {
      id: `brd_${crypto.randomUUID().slice(0, 6)}`,
      categoryId: categoryId.trim(),
      name: cleanName,
      slug: `breed-${Date.now()}`,
      origin: cleanOrigin || 'المملكة العربية السعودية',
      summary: cleanSummary || 'سلالة مضافة عبر إدارة المنصة.',
      avgWeightKg: cleanAvgWeight || '35 – 55 كجم',
      priceRangeSar: cleanPriceRange || '1,200 – 2,000 ر.س',
      imageUrl: IMG.naimi,
      characteristics: ['سلالة معتمدة في المنصة'],
    };
    this.store.breeds.push(newBreed);
    this.store.auditLogs.unshift(
      createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'إضافة سلالة جديدة',
        targetType: 'breed',
        targetId: newBreed.id,
        note: newBreed.name,
      })
    );
    this.saveImmediate();
    return { breed: newBreed };
  }

  async createCategory(currentUser: any, body: any) {
    const { name, parentId, description, keywords } = body || {};
    const cleanName = validateRequiredText(name, {
      label: 'اسم الفئة الفرعية',
      minLength: INPUT_LIMITS.categoryNameMin,
      maxLength: INPUT_LIMITS.categoryNameMax,
      code: 'invalid_category_name',
    });
    const validatedParentId = validateCategoryParentAssignment({
      categories: this.store.categories,
      requestedParentId: parentId,
      isCreate: true,
    });
    const cleanDescription = validateOptionalText(description, {
      label: 'وصف الفئة',
      maxLength: INPUT_LIMITS.categoryDescriptionMax,
      allowNewlines: true,
      defaultValue: '',
    });
    const parsedKeywords = parseAndValidateKeywords(keywords);

    const newCat = {
      id: `sub_${crypto.randomUUID().slice(0, 6)}`,
      name: cleanName,
      slug: `sub-${Date.now()}`,
      parentId: validatedParentId,
      description: cleanDescription,
      keywords: parsedKeywords,
    };

    this.store.categories.push(newCat);
    this.store.auditLogs.unshift(
      createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'إنشاء فئة فرعية ذكية',
        targetType: 'category',
        targetId: newCat.id,
        note: newCat.name,
      })
    );
    this.saveImmediate();
    return { category: newCat };
  }

  async updateCategory(currentUser: any, categoryId: string, body: any) {
    const idx = this.store.categories.findIndex((c) => c.id === categoryId);
    if (idx === -1) throw new RepositoryError(404, 'الفئة غير موجودة');

    const existing = this.store.categories[idx];
    const { name, parentId, description, keywords } = body || {};
    const cleanName =
      name !== undefined
        ? validateRequiredText(name, {
            label: 'اسم الفئة',
            minLength: INPUT_LIMITS.categoryNameMin,
            maxLength: INPUT_LIMITS.categoryNameMax,
            code: 'invalid_category_name',
          })
        : existing.name;

    let nextParentId = existing.parentId;
    if (parentId !== undefined) {
      nextParentId = validateCategoryParentAssignment({
        categories: this.store.categories,
        targetId: existing.id,
        existingParentId: existing.parentId,
        requestedParentId: parentId,
        isCreate: false,
      });
    }

    const cleanDescription =
      description !== undefined
        ? validateOptionalText(description, {
            label: 'وصف الفئة',
            maxLength: INPUT_LIMITS.categoryDescriptionMax,
            allowNewlines: true,
            defaultValue: '',
          })
        : existing.description;

    const parsedKeywords =
      keywords !== undefined ? parseAndValidateKeywords(keywords) : existing.keywords || [];

    const updated = {
      ...existing,
      name: cleanName,
      parentId: nextParentId,
      description: cleanDescription,
      keywords: parsedKeywords,
    };
    this.store.categories[idx] = updated;
    this.store.auditLogs.unshift(
      createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'تعديل فئة فرعية',
        targetType: 'category',
        targetId: updated.id,
        note: updated.name,
      })
    );
    this.saveImmediate();
    return { category: updated };
  }

  async deleteCategory(currentUser: any, categoryId: string): Promise<void> {
    const target = this.store.categories.find((c) => c.id === categoryId);
    if (!target) throw new RepositoryError(404, 'الفئة غير موجودة');
    if (target.parentId === null) {
      throw new RepositoryError(400, 'لا يمكن حذف التصنيف الرئيسي');
    }

    this.store.categories = this.store.categories.filter((c) => c.id !== categoryId);
    this.store.listings = this.store.listings.map((l) =>
      l.subCategoryId === categoryId
        ? { ...l, subCategoryId: inferSubCategoryId(l, this.store.categories) }
        : l
    );
    this.store.auditLogs.unshift(
      createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'حذف فئة فرعية',
        targetType: 'category',
        targetId: target.id,
        note: target.name,
      })
    );
    this.saveImmediate();
  }

  async autoCategorizeListings(
    currentUser: any,
    body: { listingId?: string; subCategoryId?: string | null }
  ) {
    const { listingId, subCategoryId } = body || {};
    let updatedCount = 0;

    if (listingId) {
      const listing = this.store.listings.find((l) => l.id === listingId);
      if (!listing) throw new RepositoryError(404, 'الإعلان غير موجود');
      const nextSubId =
        subCategoryId === undefined
          ? inferSubCategoryId(listing, this.store.categories)
          : subCategoryId || null;
      listing.subCategoryId = nextSubId;
      listing.updatedAt = new Date().toISOString();
      updatedCount = 1;
    } else {
      this.store.listings = this.store.listings.map((l) => {
        const nextSub = inferSubCategoryId(l, this.store.categories);
        if (nextSub && nextSub !== l.subCategoryId) {
          updatedCount += 1;
          return { ...l, subCategoryId: nextSub, updatedAt: new Date().toISOString() };
        }
        return l;
      });
    }

    this.store.auditLogs.unshift(
      createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'تشغيل التصنيف الذكي للإعلانات',
        targetType: 'listing',
        targetId: listingId || 'all',
        note: `تم تحديث تصنيف ${updatedCount} إعلان`,
      })
    );
    this.saveImmediate();
    return { updatedCount };
  }

  async listAdminComments(query: {
    q?: string;
    listingId?: string;
    limit?: unknown;
    offset?: unknown;
  }) {
    const q = typeof query.q === 'string' ? query.q.trim().toLowerCase() : '';
    const listingIdFilter = typeof query.listingId === 'string' ? query.listingId.trim() : '';

    const items = (this.store.comments || [])
      .map((comment) => {
        const listing = this.store.listings.find((l) => l.id === comment.listingId);
        if (!listing) return null;
        return {
          ...toPublicComment(comment, listing, this.store.users, this.store.sellers),
          listingTitle: listing.title,
          listingStatus: listing.status,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .filter((item) => {
        if (listingIdFilter && item.listingId !== listingIdFilter) return false;
        if (!q) return true;
        return (
          String(item.body || '').toLowerCase().includes(q) ||
          String(item.authorName || '').toLowerCase().includes(q) ||
          String(item.listingTitle || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const paged = paginateAdminItems(items, query, { defaultLimit: 50, maxLimit: 100 });
    return {
      comments: paged.items,
      totalCount: paged.totalCount,
      limit: paged.limit,
      offset: paged.offset,
      hasMore: paged.hasMore,
      nextOffset: paged.nextOffset,
    };
  }

  // ---- Commission, Mark Sold & Featured Listing Operations ----

  async getCommissionPublicInfo(viewer: any | null) {
    return {
      settings: this.getCommissionSettingsInternal(),
      eligibility: viewer ? this.getCommissionEligibilityForUser(viewer) : null,
    };
  }

  async markListingSold(
    currentUser: any,
    listingId: string,
    body: {
      soldViaPlatform?: unknown;
      saleAmountSar?: unknown;
      transferReference?: unknown;
      payerName?: unknown;
      transferNote?: unknown;
    }
  ) {
    const idx = this.store.listings.findIndex((l) => l.id === listingId);
    if (idx === -1) throw new RepositoryError(404, 'الإعلان غير موجود');
    const listing = this.store.listings[idx];
    if (!canEditListing(currentUser, listing)) {
      throw new RepositoryError(403, 'غير مصرح لك بتعديل حالة هذا الإعلان');
    }
    if (listing.status === 'Sold') {
      throw new RepositoryError(400, 'تم تحديد هذا الإعلان كمباع مسبقاً', 'already_sold');
    }
    if (listing.status !== 'Published' && !isAdmin(currentUser)) {
      throw new RepositoryError(
        400,
        'يمكن تحديد الإعلان كمباع بعد اعتماده ونشره فقط',
        'invalid_status'
      );
    }

    if (typeof body?.soldViaPlatform !== 'boolean') {
      throw new RepositoryError(
        400,
        'يرجى تحديد هل تم البيع عن طريق المنصة أم خارجها',
        'sold_via_platform_required'
      );
    }

    const soldViaPlatform = body.soldViaPlatform;
    const settings = this.getCommissionSettingsInternal();
    const sellerUser =
      this.store.users.find((u) => u.id === listing.sellerId) || currentUser;
    const nowIso = new Date().toISOString();

    let saleAmountSar = 0;
    let ratePercent = 0;
    let commissionAmountSar = 0;
    let isExempt = false;
    let exemptionReason: CommissionRecord['exemptionReason'] = 'not_sold_via_platform';
    let status: CommissionRecord['status'] = 'not_applicable';
    let transferReference: string | null = null;
    let payerName: string | null = null;
    let transferAmountSar: number | null = null;
    let transferNote: string | null = null;

    if (soldViaPlatform) {
      saleAmountSar = parseFinitePositiveNumber(body.saleAmountSar, {
        label: 'مبلغ البيع الفعلي',
        max: INPUT_LIMITS.listingPriceMax * 100,
        code: 'invalid_sale_amount',
      });
      const priorPlatformSalesCount = this.getSellerPlatformSalesCount(listing.sellerId);
      const eligibility = evaluateSellerCommissionEligibility({
        settings,
        userCreatedAt: sellerUser?.createdAt,
        priorPlatformSalesCount,
      });

      if (eligibility.isExempt) {
        isExempt = true;
        exemptionReason = eligibility.reason;
        ratePercent = 0;
        commissionAmountSar = 0;
        status = 'exempt';
      } else {
        isExempt = false;
        exemptionReason = 'none';
        ratePercent = settings.commissionRatePercent;
        commissionAmountSar = calculateCommissionAmount(saleAmountSar, ratePercent);
        status = commissionAmountSar > 0 ? 'pending_payment' : 'exempt';
      }

      if (
        !isExempt &&
        commissionAmountSar > 0 &&
        typeof body.transferReference === 'string' &&
        body.transferReference.trim()
      ) {
        transferReference = validateRequiredText(body.transferReference, {
          label: 'رقم مرجع الحوالة',
          minLength: 2,
          maxLength: 120,
          code: 'invalid_transfer_reference',
        });
        payerName = validateRequiredText(body.payerName ?? sellerUser?.name ?? currentUser.name, {
          label: 'اسم المحوّل',
          minLength: 2,
          maxLength: 120,
          code: 'invalid_payer_name',
        });
        transferNote = validateOptionalText(body.transferNote, {
          label: 'ملاحظة الحوالة',
          maxLength: 500,
          allowNewlines: true,
          defaultValue: '',
        });
        transferAmountSar = commissionAmountSar;
        status = 'pending_review';
      }
    }

    const updatedListing = {
      ...listing,
      status: 'Sold',
      updatedAt: nowIso,
    };
    this.store.listings[idx] = updatedListing;

    const sellerProfile = this.store.sellers.find((s) => s.userId === listing.sellerId);
    if (sellerProfile) {
      sellerProfile.totalSales = Number(sellerProfile.totalSales || 0) + 1;
    }

    const record: CommissionRecord = {
      id: `cmr_${crypto.randomUUID().slice(0, 8)}`,
      kind: 'sale_commission',
      listingId: listing.id,
      listingTitle: listing.title,
      sellerId: listing.sellerId,
      sellerName: sellerUser?.name || currentUser.name,
      soldViaPlatform,
      saleAmountSar,
      ratePercent,
      commissionAmountSar,
      isExempt,
      exemptionReason,
      status,
      transferReference,
      payerName,
      transferAmountSar,
      transferNote: transferNote || null,
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.store.commissionRecords = this.store.commissionRecords || [];
    this.store.commissionRecords.unshift(record);

    const adminNotifications = soldViaPlatform
      ? this.notifyActiveAdmins(isAdmin(currentUser) ? currentUser.id : null, {
          type: status === 'pending_review' ? 'commission_submitted' : 'commission_due',
          title:
            status === 'exempt'
              ? 'تم بيع إعلان عبر المنصة (معفى بعرض الإطلاق)'
              : status === 'pending_review'
              ? 'بيع إعلان وتأكيد حوالة عمولة بانتظار المراجعة'
              : 'إشعار إتمام بيع وعمولة مستحقة',
          body: isExempt
            ? `أغلق ${record.sellerName} الإعلان «${listing.title}» كمباع عبر المنصة بمبلغ ${saleAmountSar.toLocaleString('en-US')} ر.س (معفى من العمولة ضمن عرض الإطلاق).`
            : `أغلق ${record.sellerName} الإعلان «${listing.title}» كمباع عبر المنصة بمبلغ ${saleAmountSar.toLocaleString('en-US')} ر.س — العمولة المستحقة: ${commissionAmountSar.toLocaleString('en-US')} ر.س (${ratePercent}%).`,
          listingId: listing.id,
        })
      : [];

    this.saveImmediate();
    const updatedEligibility = this.getCommissionEligibilityForUser(sellerUser);

    return {
      listing: attachLikesCountToListing(updatedListing, this.store.likes),
      commissionRecord: record,
      eligibility: updatedEligibility,
      adminNotifications,
    };
  }

  async submitCommissionPayment(
    currentUser: any,
    body: {
      recordId?: unknown;
      listingId?: unknown;
      saleAmountSar?: unknown;
      commissionAmountSar?: unknown;
      transferReference?: unknown;
      payerName?: unknown;
      transferNote?: unknown;
    }
  ) {
    const transferReference = validateRequiredText(body?.transferReference, {
      label: 'رقم مرجع الحوالة',
      minLength: 2,
      maxLength: 120,
      code: 'invalid_transfer_reference',
    });
    const payerName = validateRequiredText(body?.payerName, {
      label: 'اسم المحوّل',
      minLength: 2,
      maxLength: 120,
      code: 'invalid_payer_name',
    });
    const transferNote = validateOptionalText(body?.transferNote, {
      label: 'ملاحظات التحويل',
      maxLength: 500,
      allowNewlines: true,
      defaultValue: '',
    });

    this.store.commissionRecords = this.store.commissionRecords || [];
    const nowIso = new Date().toISOString();
    const settings = this.getCommissionSettingsInternal();
    let record: CommissionRecord;

    if (typeof body?.recordId === 'string' && body.recordId.trim()) {
      const existing = this.store.commissionRecords.find((r) => r.id === body.recordId!.toString().trim());
      if (!existing) {
        throw new RepositoryError(404, 'سجل العمولة غير موجود');
      }
      if (existing.sellerId !== currentUser.id && !isAdmin(currentUser)) {
        throw new RepositoryError(403, 'غير مصرح لك بتأكيد حوالة هذا السجل');
      }
      if (existing.status === 'approved' || existing.status === 'exempt') {
        throw new RepositoryError(400, 'هذا السجل مكتمل ولا يتطلب سداداً إضافياً');
      }

      const transferAmountSar =
        body?.commissionAmountSar !== undefined && body?.commissionAmountSar !== null && body?.commissionAmountSar !== ''
          ? parseFinitePositiveNumber(body.commissionAmountSar, {
              label: 'المبلغ المحول',
              max: INPUT_LIMITS.listingPriceMax * 10,
              code: 'invalid_transfer_amount',
            })
          : existing.commissionAmountSar;

      existing.transferReference = transferReference;
      existing.payerName = payerName;
      existing.transferAmountSar = roundCurrencySar(transferAmountSar);
      existing.transferNote = transferNote || null;
      existing.status = 'pending_review';
      existing.reviewNote = null;
      existing.updatedAt = nowIso;
      record = existing;
    } else {
      const listingId =
        typeof body?.listingId === 'string' && body.listingId.trim()
          ? body.listingId.trim()
          : null;
      let listingTitle = 'سداد عمولة مباشرة';
      if (listingId) {
        const listing = this.store.listings.find((l) => l.id === listingId);
        if (!listing) throw new RepositoryError(404, 'الإعلان المحدد غير موجود');
        if (listing.sellerId !== currentUser.id && !isAdmin(currentUser)) {
          throw new RepositoryError(403, 'غير مصرح لك بتسجيل حوالة لهذا الإعلان');
        }
        listingTitle = listing.title;
      }

      const saleAmountSar =
        body?.saleAmountSar !== undefined && body?.saleAmountSar !== null && body?.saleAmountSar !== ''
          ? parseFinitePositiveNumber(body.saleAmountSar, {
              label: 'مبلغ البيع',
              max: INPUT_LIMITS.listingPriceMax * 100,
              code: 'invalid_sale_amount',
            })
          : 0;

      const computedCommission =
        body?.commissionAmountSar !== undefined && body?.commissionAmountSar !== null && body?.commissionAmountSar !== ''
          ? parseFinitePositiveNumber(body.commissionAmountSar, {
              label: 'مبلغ العمولة المحول',
              max: INPUT_LIMITS.listingPriceMax * 10,
              code: 'invalid_transfer_amount',
            })
          : calculateCommissionAmount(saleAmountSar, settings.commissionRatePercent);

      if (computedCommission <= 0) {
        throw new RepositoryError(
          400,
          'يرجى إدخال مبلغ البيع أو مبلغ العمولة المحول بشكل صحيح',
          'invalid_transfer_amount'
        );
      }

      record = {
        id: `cmr_${crypto.randomUUID().slice(0, 8)}`,
        kind: 'sale_commission',
        listingId,
        listingTitle,
        sellerId: currentUser.id,
        sellerName: currentUser.name,
        soldViaPlatform: true,
        saleAmountSar: roundCurrencySar(saleAmountSar),
        ratePercent: settings.commissionRatePercent,
        commissionAmountSar: roundCurrencySar(computedCommission),
        isExempt: false,
        exemptionReason: 'none',
        status: 'pending_review',
        transferReference,
        payerName,
        transferAmountSar: roundCurrencySar(computedCommission),
        transferNote: transferNote || null,
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      this.store.commissionRecords.unshift(record);
    }

    const adminNotifications = this.notifyActiveAdmins(
      isAdmin(currentUser) ? currentUser.id : null,
      {
        type: 'commission_submitted',
        title:
          record.kind === 'featured_listing'
            ? 'تأكيد حوالة تمييز إعلان بانتظار المراجعة'
            : 'تأكيد حوالة عمولة بانتظار المراجعة',
        body: `أرسل ${currentUser.name} تأكيد حوالة بمبلغ ${Number(record.transferAmountSar ?? record.commissionAmountSar).toLocaleString('en-US')} ر.س (مرجع: ${transferReference}) لـ «${record.listingTitle}».`,
        ...(record.listingId ? { listingId: record.listingId } : {}),
      }
    );

    this.saveImmediate();
    return { commissionRecord: record, adminNotifications };
  }

  async requestListingFeatured(
    currentUser: any,
    listingId: string,
    body: {
      transferReference?: unknown;
      payerName?: unknown;
      transferNote?: unknown;
    }
  ) {
    const idx = this.store.listings.findIndex((l) => l.id === listingId);
    if (idx === -1) throw new RepositoryError(404, 'الإعلان غير موجود');
    const listing = this.store.listings[idx];
    if (!canEditListing(currentUser, listing)) {
      throw new RepositoryError(403, 'غير مصرح لك بطلب تمييز هذا الإعلان');
    }
    if (listing.isFeatured) {
      throw new RepositoryError(400, 'هذا الإعلان مميز ومثبت بالفعل في الصفحة الرئيسية');
    }
    if (listing.status === 'Sold' || listing.status === 'Rejected' || listing.status === 'Expired') {
      throw new RepositoryError(400, 'يمكن طلب التمييز للإعلانات النشطة أو قيد المراجعة فقط');
    }

    const settings = this.getCommissionSettingsInternal();
    const feeSar = roundCurrencySar(Number(settings.featuredWeeklyPriceSar || 35));
    const nowIso = new Date().toISOString();

    const hasTransfer =
      typeof body?.transferReference === 'string' && body.transferReference.trim().length > 0;
    const transferReference = hasTransfer
      ? validateRequiredText(body.transferReference, {
          label: 'رقم مرجع الحوالة',
          minLength: 2,
          maxLength: 120,
          code: 'invalid_transfer_reference',
        })
      : null;
    const payerName = hasTransfer
      ? validateRequiredText(body?.payerName ?? currentUser.name, {
          label: 'اسم المحوّل',
          minLength: 2,
          maxLength: 120,
          code: 'invalid_payer_name',
        })
      : null;
    const transferNote = validateOptionalText(body?.transferNote, {
      label: 'ملاحظات التمييز',
      maxLength: 500,
      allowNewlines: true,
      defaultValue: 'طلب تمييز وتثبيت الإعلان في الصفحة الرئيسية لمدة أسبوع',
    });

    this.store.listings[idx] = {
      ...listing,
      featuredRequested: true,
      updatedAt: nowIso,
    };

    this.store.commissionRecords = this.store.commissionRecords || [];
    let record = this.store.commissionRecords.find(
      (r) =>
        r.listingId === listing.id &&
        r.kind === 'featured_listing' &&
        (r.status === 'pending_payment' || r.status === 'rejected')
    );

    const nextStatus: CommissionRecord['status'] =
      feeSar <= 0 ? 'approved' : hasTransfer ? 'pending_review' : 'pending_payment';

    if (record) {
      record.commissionAmountSar = feeSar;
      record.status = nextStatus;
      record.transferReference = transferReference;
      record.payerName = payerName;
      record.transferAmountSar = hasTransfer ? feeSar : record.transferAmountSar;
      record.transferNote = transferNote || null;
      record.updatedAt = nowIso;
    } else {
      record = {
        id: `cmr_${crypto.randomUUID().slice(0, 8)}`,
        kind: 'featured_listing',
        listingId: listing.id,
        listingTitle: listing.title,
        sellerId: listing.sellerId,
        sellerName: currentUser.name,
        soldViaPlatform: true,
        saleAmountSar: 0,
        ratePercent: 0,
        commissionAmountSar: feeSar,
        isExempt: feeSar <= 0,
        exemptionReason: 'none',
        status: nextStatus,
        transferReference,
        payerName,
        transferAmountSar: hasTransfer ? feeSar : null,
        transferNote: transferNote || null,
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      this.store.commissionRecords.unshift(record);
    }

    if (feeSar <= 0) {
      this.store.listings[idx].isFeatured = true;
      this.store.listings[idx].featuredRequested = false;
    }

    const adminNotifications =
      nextStatus === 'pending_review' || nextStatus === 'pending_payment'
        ? this.notifyActiveAdmins(isAdmin(currentUser) ? currentUser.id : null, {
            type: nextStatus === 'pending_review' ? 'commission_submitted' : 'commission_due',
            title:
              nextStatus === 'pending_review'
                ? 'حوالة تمييز إعلان بانتظار الاعتماد'
                : 'طلب تمييز إعلان جديد',
            body:
              nextStatus === 'pending_review'
                ? `أرسل ${currentUser.name} حوالة تمييز إعلان «${listing.title}» بمبلغ ${feeSar} ر.س (مرجع: ${transferReference}).`
                : `طلب ${currentUser.name} تمييز إعلان «${listing.title}» برسوم أسبوعية ${feeSar} ر.س.`,
            listingId: listing.id,
          })
        : [];

    this.saveImmediate();
    return {
      listing: attachLikesCountToListing(this.store.listings[idx], this.store.likes),
      commissionRecord: record,
      adminNotifications,
    };
  }

  async getAdminCommissions(query: {
    status?: string;
    kind?: string;
    q?: string;
    limit?: unknown;
    offset?: unknown;
  }) {
    const allRecords = [...(this.store.commissionRecords || [])].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const summary = buildCommissionAdminSummary(allRecords);

    const statusFilter = typeof query.status === 'string' ? query.status.trim() : 'all';
    const kindFilter = typeof query.kind === 'string' ? query.kind.trim() : 'all';
    const q = typeof query.q === 'string' ? query.q.trim().toLowerCase() : '';

    const filtered = allRecords.filter((r) => {
      if (statusFilter && statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (kindFilter && kindFilter !== 'all' && r.kind !== kindFilter) return false;
      if (!q) return true;
      return (
        r.listingTitle.toLowerCase().includes(q) ||
        r.sellerName.toLowerCase().includes(q) ||
        (r.transferReference || '').toLowerCase().includes(q) ||
        (r.payerName || '').toLowerCase().includes(q)
      );
    });

    const paged = paginateAdminItems(filtered, query, { defaultLimit: 50, maxLimit: 100 });
    return {
      settings: this.getCommissionSettingsInternal(),
      summary,
      records: paged.items,
      totalCount: paged.totalCount,
      limit: paged.limit,
      offset: paged.offset,
      hasMore: paged.hasMore,
      nextOffset: paged.nextOffset,
    };
  }

  async updateCommissionSettings(currentUser: any, body: any) {
    const current = this.getCommissionSettingsInternal();

    let commissionRatePercent = current.commissionRatePercent;
    if (body?.commissionRatePercent !== undefined) {
      const n = Number(body.commissionRatePercent);
      if (!Number.isFinite(n) || n < 0 || n > 25) {
        throw new RepositoryError(400, 'نسبة العمولة يجب أن تكون بين 0% و 25%', 'invalid_rate');
      }
      commissionRatePercent = Math.round(n * 100) / 100;
    }

    const promoEnabled =
      body?.promoEnabled !== undefined ? Boolean(body.promoEnabled) : current.promoEnabled;

    let promoFreeDays = current.promoFreeDays;
    if (body?.promoFreeDays !== undefined) {
      const n = Number(body.promoFreeDays);
      if (!Number.isFinite(n) || n < 0 || n > 365) {
        throw new RepositoryError(400, 'أيام الإعفاء الترويجي يجب أن تكون بين 0 و 365 يوماً');
      }
      promoFreeDays = Math.trunc(n);
    }

    let promoFreeListingsCount = current.promoFreeListingsCount;
    if (body?.promoFreeListingsCount !== undefined) {
      const n = Number(body.promoFreeListingsCount);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        throw new RepositoryError(400, 'عدد البيعات المعفاة يجب أن يكون بين 0 و 100');
      }
      promoFreeListingsCount = Math.trunc(n);
    }

    let featuredWeeklyPriceSar = current.featuredWeeklyPriceSar;
    if (body?.featuredWeeklyPriceSar !== undefined) {
      const n = Number(body.featuredWeeklyPriceSar);
      if (!Number.isFinite(n) || n < 0 || n > 5000) {
        throw new RepositoryError(400, 'رسوم تمييز الإعلان الأسبوعية يجب أن تكون بين 0 و 5000 ر.س');
      }
      featuredWeeklyPriceSar = roundCurrencySar(n);
    }

    const bankName =
      body?.bankName !== undefined
        ? validateOptionalText(body.bankName, {
            label: 'اسم البنك',
            maxLength: 120,
            defaultValue: '',
          })
        : current.bankName;
    const accountHolderName =
      body?.accountHolderName !== undefined
        ? validateOptionalText(body.accountHolderName, {
            label: 'اسم صاحب الحساب البنكي',
            maxLength: 160,
            defaultValue: '',
          })
        : current.accountHolderName;
    const iban =
      body?.iban !== undefined ? normalizeSaudiIban(body.iban) : current.iban;
    if (!isValidSaudiIban(iban)) {
      throw new RepositoryError(
        400,
        'صيغة الآيبان السعودي غير صالحة (يجب أن يبدأ بـ SA ويليه 22 رقماً)',
        'invalid_iban'
      );
    }

    const updated: CommissionSettings = {
      commissionRatePercent,
      promoEnabled,
      promoFreeDays,
      promoFreeListingsCount,
      featuredWeeklyPriceSar,
      bankName,
      accountHolderName,
      iban,
      updatedAt: new Date().toISOString(),
    };
    this.store.commissionSettings = updated;

    const auditEntry = createAuditLogEntry({
      actorId: currentUser.id,
      actorName: currentUser.name,
      action: 'تحديث إعدادات العمولة والحساب البنكي',
      targetType: 'commission',
      targetId: 'default',
      note: `العمولة: ${commissionRatePercent}% | الإعفاء: ${promoEnabled ? `${promoFreeDays} يوم / ${promoFreeListingsCount} بيعات` : 'موقف'} | التمييز: ${featuredWeeklyPriceSar} ر.س`,
    });
    this.store.auditLogs.unshift(auditEntry);
    this.saveImmediate();
    return { settings: updated, auditEntry };
  }

  async reviewCommissionRecord(
    currentUser: any,
    recordId: string,
    statusRaw: unknown,
    noteRaw: unknown
  ) {
    if (statusRaw !== 'approved' && statusRaw !== 'rejected') {
      throw new RepositoryError(400, 'قرار المراجعة يجب أن يكون approved أو rejected');
    }
    const nextStatus: 'approved' | 'rejected' = statusRaw;
    const reviewNote = validateAdminNote(noteRaw, {
      required: nextStatus === 'rejected',
      label: nextStatus === 'rejected' ? 'سبب رفض تأكيد الحوالة' : 'ملاحظة الاعتماد',
      minLength: 3,
      maxLength: 400,
    });

    this.store.commissionRecords = this.store.commissionRecords || [];
    const record = this.store.commissionRecords.find((r) => r.id === recordId);
    if (!record) {
      throw new RepositoryError(404, 'سجل العمولة غير موجود');
    }

    const nowIso = new Date().toISOString();
    record.status = nextStatus;
    record.reviewedBy = currentUser.id;
    record.reviewedAt = nowIso;
    record.reviewNote = reviewNote;
    record.updatedAt = nowIso;

    let updatedListing: any | undefined;
    if (record.kind === 'featured_listing' && record.listingId) {
      const lIdx = this.store.listings.findIndex((l) => l.id === record.listingId);
      if (lIdx !== -1) {
        if (nextStatus === 'approved') {
          this.store.listings[lIdx] = {
            ...this.store.listings[lIdx],
            isFeatured: true,
            featuredRequested: false,
            updatedAt: nowIso,
          };
        } else {
          this.store.listings[lIdx] = {
            ...this.store.listings[lIdx],
            isFeatured: false,
            updatedAt: nowIso,
          };
        }
        updatedListing = attachLikesCountToListing(this.store.listings[lIdx], this.store.likes);
      }
    }

    const notificationType =
      nextStatus === 'approved'
        ? record.kind === 'featured_listing'
          ? 'featured_approved'
          : 'commission_approved'
        : 'commission_rejected';

    const notification = this.createNotificationRecord({
      userId: record.sellerId,
      type: notificationType,
      title:
        nextStatus === 'approved'
          ? record.kind === 'featured_listing'
            ? 'تم تفعيل تمييز إعلانك في الصفحة الرئيسية'
            : 'تم اعتماد حوالة العمولة بنجاح'
          : 'مراجعة حوالة العمولة / التمييز',
      body:
        nextStatus === 'approved'
          ? record.kind === 'featured_listing'
            ? `تم اعتماد حوالة التمييز وتثبيت إعلانك «${record.listingTitle}» في الصفحة الرئيسية.`
            : `تم استلام واعتماد حوالة العمولة لـ «${record.listingTitle}» — جزاك الله خيراً على أمانتك.`
          : `تعذر اعتماد تأكيد الحوالة لـ «${record.listingTitle}»${reviewNote ? `: ${reviewNote}` : ''}. يمكنك إعادة إرسال بيانات الحوالة من لوحة التحكم.`,
      ...(record.listingId ? { listingId: record.listingId } : {}),
    });

    const auditEntry = createAuditLogEntry({
      actorId: currentUser.id,
      actorName: currentUser.name,
      action:
        nextStatus === 'approved'
          ? record.kind === 'featured_listing'
            ? 'اعتماد حوالة تمييز إعلان'
            : 'اعتماد حوالة عمولة بيع'
          : 'رفض تأكيد حوالة عمولة/تمييز',
      targetType: 'commission',
      targetId: record.id,
      note: `${record.listingTitle} — ${record.sellerName}${reviewNote ? ` (${reviewNote})` : ''}`,
    });
    this.store.auditLogs.unshift(auditEntry);
    this.saveImmediate();

    return {
      commissionRecord: record,
      ...(updatedListing ? { listing: updatedListing } : {}),
      auditEntry,
      sellerNotification: { userId: record.sellerId, notification },
    };
  }
}
