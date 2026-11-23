import crypto from 'node:crypto';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import type { Pool } from 'pg';
import type { AppConfig } from '../config';
import {
  type AdminOverviewStats,
  AdminValidationError,
  type AuditLogEntry,
  createAuditLogEntry,
  filterAdminUsers,
  paginateAdminItems,
  resolveAdminPagination,
  resolveSellerVerificationStatus,
  toAdminUserSummary,
  validateAdminNote,
} from '../admin';
import {
  buildSellerProfile,
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
  canReactivateUser,
  canReplyToListingComment,
  canRespondToOffer,
  canReviewSellerVerification,
  canSuspendUser,
  canViewListing,
  canViewListingComments,
  isAdmin,
} from '../auth/policy';
import { toPublicSeller, toSelfUser } from '../auth/serialize';
import { hashToken, type SessionRecord } from '../auth/sessions';
import type { Credential } from '../auth/types';
import {
  DUPLICATE_COMMENT_COOLDOWN_MS,
  normalizeAndValidateCommentBody,
  paginateListingThreads,
  toPublicComment,
  type CommentRecord,
} from '../comments';
import { toUserConversation } from '../conversations';
import { buildListingNormalizedColumns, tokenizeNormalizedQuery } from '../db/arabicSearch';
import { checkDatabaseHealth, type AppDatabase } from '../db/client';
import {
  articles,
  auditLogs,
  breeds,
  categories,
  commissionRecords,
  conversationReadStates,
  conversations,
  faqs,
  googleIdentities,
  indicativePrices,
  likeNotificationCooldowns,
  listingComments,
  listingFavorites,
  listingImages,
  listingLikes,
  listings,
  listingVideos,
  mediaAssets,
  messages,
  notifications,
  platformSettings,
  priceOffers,
  regions,
  reports,
  sellerProfiles,
  sellerReviews,
  sessions,
  userCredentials,
  users,
} from '../db/schema';
import {
  type CreateNotificationInput,
  IMG,
  inferSubCategoryId,
  RepositoryError,
} from '../domain/marketplace';
import { LIKE_NOTIFICATION_COOLDOWN_MS, type LikeAction } from '../likes';
import {
  extractMediaIdFromUrl,
  MAX_LISTING_IMAGES,
  MediaUploadError,
  type ListingImageRecord,
  type ListingVideoRecord,
  type MediaAsset,
} from '../media';
import {
  resolveAdapterFromTarget,
  resolveAssetObjectRef,
  type MediaStorageAdapter,
  type MediaStorageProvider,
} from '../mediaStorage';
import {
  INPUT_LIMITS,
  parseAndValidateKeywords,
  parseFinitePositiveNumber,
  parsePositiveInteger,
  validateCategoryParentAssignment,
  validateOptionalText,
  validateRequiredText,
} from '../validation';
import type { ValidatedListingQuery } from '../../src/lib/listing-search';
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

const TOUCH_INTERVAL_MS = 60_000;
const STOCK_IMAGE_PATH_RE = /^\/src\/assets\/images\/[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$/;

function toIso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString();
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toIsoRequired(d: Date | string | null | undefined): string {
  return toIso(d) || new Date(0).toISOString();
}

function escapeSqlLike(token: string): string {
  return token.replace(/[\\%_]/g, '\\$&');
}

function isPgUniqueViolation(err: any): boolean {
  return err?.code === '23505' || err?.cause?.code === '23505';
}

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
  return Array.from(new Set(ids));
}

function mapDbUser(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    phone: row.phone,
    email: row.email,
    name: row.name,
    role: row.role as 'buyer' | 'seller' | 'admin',
    status: (row.status === 'suspended' ? 'suspended' : 'active') as 'active' | 'suspended',
    isDemo: row.isDemo,
    phoneVerifiedAt: toIso(row.phoneVerifiedAt),
    suspendedAt: toIso(row.suspendedAt),
    suspendedBy: row.suspendedBy ?? null,
    suspensionReason: row.suspensionReason ?? null,
    reactivatedAt: toIso(row.reactivatedAt),
    reactivatedBy: row.reactivatedBy ?? null,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

function mapDbSeller(row: typeof sellerProfiles.$inferSelect) {
  return {
    userId: row.userId,
    displayName: row.displayName,
    bio: row.bio,
    regionId: row.regionId,
    city: row.city,
    phone: row.phone,
    whatsapp: row.whatsapp,
    verificationStatus: row.verificationStatus as 'Pending' | 'Verified' | 'Rejected',
    verifiedAt: toIso(row.verifiedAt),
    verificationNote: row.verificationNote ?? null,
    verificationRequestedAt: toIso(row.verificationRequestedAt),
    verificationReviewedAt: toIso(row.verificationReviewedAt),
    verificationReviewedBy: row.verificationReviewedBy ?? null,
    yearsExperience: row.yearsExperience,
    specialty: row.specialty,
    rating: Number(row.rating),
    ratingCount: row.ratingCount,
    totalSales: row.totalSales,
  };
}

function mapDbSession(row: typeof sessions.$inferSelect): SessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt.getTime(),
    lastSeenAt: row.lastSeenAt.getTime(),
    expiresAt: row.expiresAt.getTime(),
    ...(row.ip ? { ip: row.ip } : {}),
    ...(row.userAgent ? { userAgent: row.userAgent } : {}),
  };
}

function mapDbNotification(row: typeof notifications.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    title: row.title,
    body: row.body,
    ...(row.listingId ? { listingId: row.listingId } : {}),
    ...(row.conversationId ? { conversationId: row.conversationId } : {}),
    ...(row.commentId ? { commentId: row.commentId } : {}),
    read: row.isRead,
    createdAt: toIsoRequired(row.createdAt),
  };
}

function mapDbPriceOffer(row: typeof priceOffers.$inferSelect) {
  return {
    id: row.id,
    listingId: row.listingId,
    buyerId: row.buyerId,
    buyerName: row.buyerName,
    sellerId: row.sellerId,
    offeredPrice: Number(row.offeredPrice),
    quantity: row.quantity,
    note: row.note,
    status: row.status as 'pending' | 'accepted' | 'rejected',
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

function mapDbComment(row: typeof listingComments.$inferSelect): CommentRecord {
  return {
    id: row.id,
    listingId: row.listingId,
    parentId: row.parentId ?? null,
    authorId: row.authorId,
    authorName: row.authorName,
    body: row.body,
    isEdited: row.isEdited,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

function mapDbReview(row: typeof sellerReviews.$inferSelect) {
  return {
    id: row.id,
    sellerId: row.sellerId,
    reviewerId: row.reviewerId,
    reviewerName: row.reviewerName,
    rating: row.rating,
    comment: row.comment,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

function mapDbReport(row: typeof reports.$inferSelect) {
  return {
    id: row.id,
    targetType: row.targetType as 'listing' | 'comment',
    reporterId: row.reporterId,
    listingId: row.listingId,
    commentId: row.commentId ?? null,
    reason: row.reason,
    details: row.details,
    status: row.status as 'open' | 'resolved' | 'dismissed',
    createdAt: toIsoRequired(row.createdAt),
    resolvedAt: toIso(row.resolvedAt),
    ...(row.resolvedBy ? { resolvedBy: row.resolvedBy } : {}),
    resolutionNote: row.resolutionNote ?? null,
  };
}

function mapDbAuditLog(row: typeof auditLogs.$inferSelect): AuditLogEntry {
  return {
    id: row.id,
    actorId: row.actorId || 'system',
    actorName: row.actorName,
    action: row.action,
    targetType: row.targetType as AuditLogEntry['targetType'],
    targetId: row.targetId,
    ...(row.note ? { note: row.note } : {}),
    createdAt: toIsoRequired(row.createdAt),
  };
}

function mapDbMediaAsset(row: typeof mediaAssets.$inferSelect): MediaAsset {
  return {
    id: row.id,
    filename: row.filename,
    url: row.url,
    kind: row.kind as 'image' | 'video',
    mimeType: row.mimeType,
    sizeBytes: Number(row.sizeBytes),
    originalName: row.originalName,
    uploaderId: row.uploaderId,
    listingId: row.listingId ?? null,
    createdAt: toIsoRequired(row.createdAt),
    storageProvider: (row.storageProvider as MediaStorageProvider) || 'local',
    bucket: row.bucket ?? null,
    objectKey: row.objectKey || row.filename,
    sha256Hex: row.sha256Hex ?? null,
  };
}

function mapDbListing(
  row: typeof listings.$inferSelect,
  imgs: Array<typeof listingImages.$inferSelect>,
  vid?: typeof listingVideos.$inferSelect
) {
  const sortedImgs = [...imgs].sort((a, b) => a.position - b.position);
  return {
    id: row.id,
    sellerId: row.sellerId,
    categoryId: row.categoryId,
    subCategoryId: row.subCategoryId ?? null,
    breedId: row.breedId,
    regionId: row.regionId,
    city: row.city,
    title: row.title,
    slug: row.slug,
    description: row.description,
    priceAmount: Number(row.priceAmount),
    expectedPrice: row.expectedPrice !== null ? Number(row.expectedPrice) : null,
    currency: row.currency,
    sex: row.sex,
    ageMonths: row.ageMonths,
    weightKg: Number(row.weightKg),
    quantity: row.quantity,
    isNegotiable: row.isNegotiable,
    allowPriceOffers: row.allowPriceOffers,
    vaccinated: row.vaccinated,
    status: row.status,
    ...(row.rejectionReason ? { rejectionReason: row.rejectionReason } : {}),
    publishedAt: toIso(row.publishedAt),
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
    isFeatured: row.isFeatured,
    commissionPledgeAccepted: Boolean((row as any).commissionPledgeAccepted),
    featuredRequested: Boolean((row as any).featuredRequested),
    likesCount: row.likesCount,
    images: sortedImgs.map((img) => ({
      id: img.id,
      url: img.url,
      position: img.position,
      ...(img.mediaId ? { mediaId: img.mediaId } : {}),
    })),
    ...(vid
      ? {
          video: {
            id: vid.id,
            url: vid.url,
            mimeType: vid.mimeType,
            sizeBytes: Number(vid.sizeBytes),
            mediaId: vid.mediaId,
            ...(vid.originalName ? { originalName: vid.originalName } : {}),
          },
        }
      : {}),
  };
}

function mapDbCommissionSettings(
  row: typeof platformSettings.$inferSelect | undefined
): CommissionSettings {
  if (!row) return createDefaultCommissionSettings();
  return {
    commissionRatePercent: Number(row.commissionRatePercent ?? 1),
    promoEnabled: Boolean(row.promoEnabled),
    promoFreeDays: Number(row.promoFreeDays ?? 30),
    promoFreeListingsCount: Number(row.promoFreeListingsCount ?? 2),
    featuredWeeklyPriceSar: Number(row.featuredWeeklyPriceSar ?? 35),
    bankName: row.bankName || '',
    accountHolderName: row.accountHolderName || '',
    iban: row.iban || '',
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

function mapDbCommissionRecord(
  row: typeof commissionRecords.$inferSelect
): CommissionRecord {
  return {
    id: row.id,
    kind: row.kind === 'featured_listing' ? 'featured_listing' : 'sale_commission',
    listingId: row.listingId ?? null,
    listingTitle: row.listingTitle || '',
    sellerId: row.sellerId,
    sellerName: row.sellerName || '',
    soldViaPlatform: Boolean(row.soldViaPlatform),
    saleAmountSar: Number(row.saleAmountSar || 0),
    ratePercent: Number(row.ratePercent || 0),
    commissionAmountSar: Number(row.commissionAmountSar || 0),
    isExempt: Boolean(row.isExempt),
    exemptionReason: (row.exemptionReason || 'none') as CommissionRecord['exemptionReason'],
    status: (row.status || 'pending_payment') as CommissionRecord['status'],
    transferReference: row.transferReference ?? null,
    payerName: row.payerName ?? null,
    transferAmountSar:
      row.transferAmountSar !== null && row.transferAmountSar !== undefined
        ? Number(row.transferAmountSar)
        : null,
    transferNote: row.transferNote ?? null,
    reviewedBy: row.reviewedBy ?? null,
    reviewedAt: toIso(row.reviewedAt),
    reviewNote: row.reviewNote ?? null,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

type DbExecutor = Pick<
  AppDatabase,
  'select' | 'insert' | 'update' | 'delete' | 'execute'
>;

export class PostgresMarketplaceRepository implements MarketplaceRepository {
  public readonly backend = 'postgres' as const;

  constructor(
    private readonly pool: Pool,
    private readonly db: AppDatabase,
    private readonly config: AppConfig,
    private readonly onSessionsRevoked?: (ids: string[]) => void
  ) {}

  async healthCheck(): Promise<boolean> {
    return checkDatabaseHealth(this.pool);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async insertNotificationTx(tx: DbExecutor, input: CreateNotificationInput) {
    const id = `ntf_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date();
    const [inserted] = await tx
      .insert(notifications)
      .values({
        id,
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        listingId: input.listingId ?? null,
        conversationId: input.conversationId ?? null,
        commentId: input.commentId ?? null,
        isRead: false,
        createdAt: now,
      })
      .returning();

    if (this.config.maxReadNotificationsPerUser > 0) {
      const readRows = await tx
        .select({ id: notifications.id })
        .from(notifications)
        .where(and(eq(notifications.userId, input.userId), eq(notifications.isRead, true)))
        .orderBy(desc(notifications.createdAt))
        .offset(this.config.maxReadNotificationsPerUser);
      if (readRows.length > 0) {
        await tx.delete(notifications).where(
          inArray(
            notifications.id,
            readRows.map((r) => r.id)
          )
        );
      }
    }

    return mapDbNotification(inserted);
  }

  private async hydrateListingsBatch(
    executor: DbExecutor,
    listingRows: Array<typeof listings.$inferSelect>
  ) {
    if (listingRows.length === 0) return [];
    const ids = listingRows.map((l) => l.id);
    const imageRows = await executor
      .select()
      .from(listingImages)
      .where(inArray(listingImages.listingId, ids))
      .orderBy(asc(listingImages.position));
    const videoRows = await executor
      .select()
      .from(listingVideos)
      .where(inArray(listingVideos.listingId, ids));

    const imagesByListing = new Map<string, Array<typeof listingImages.$inferSelect>>();
    for (const img of imageRows) {
      const arr = imagesByListing.get(img.listingId) || [];
      arr.push(img);
      imagesByListing.set(img.listingId, arr);
    }

    const videoByListing = new Map<string, typeof listingVideos.$inferSelect>();
    for (const vid of videoRows) {
      videoByListing.set(vid.listingId, vid);
    }

    return listingRows.map((row) =>
      mapDbListing(row, imagesByListing.get(row.id) || [], videoByListing.get(row.id))
    );
  }

  private async buildListingSearchColsTx(
    tx: DbExecutor,
    listing: {
      title: string;
      description?: string | null;
      city: string;
      breedId: string;
      categoryId: string;
      subCategoryId?: string | null;
      regionId: string;
      sellerId: string;
    }
  ) {
    const breedRows = await tx
      .select({ name: breeds.name })
      .from(breeds)
      .where(eq(breeds.id, listing.breedId))
      .limit(1);
    const catRows = await tx
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(
        listing.subCategoryId
          ? inArray(categories.id, [listing.categoryId, listing.subCategoryId])
          : eq(categories.id, listing.categoryId)
      );
    const regRows = await tx
      .select({ name: regions.name })
      .from(regions)
      .where(eq(regions.id, listing.regionId))
      .limit(1);
    const sellerRows = await tx
      .select({ displayName: sellerProfiles.displayName })
      .from(sellerProfiles)
      .where(eq(sellerProfiles.userId, listing.sellerId))
      .limit(1);

    const categoryName = catRows.find((c) => c.id === listing.categoryId)?.name || '';
    const subCategoryName = listing.subCategoryId
      ? catRows.find((c) => c.id === listing.subCategoryId)?.name || ''
      : '';

    return buildListingNormalizedColumns(
      {
        title: listing.title,
        description: listing.description || '',
        city: listing.city,
      },
      {
        breedName: breedRows[0]?.name || '',
        categoryName,
        subCategoryName,
        regionName: regRows[0]?.name || '',
        sellerDisplayName: sellerRows[0]?.displayName || '',
      }
    );
  }

  private async hasSellerInteractionTx(
    executor: DbExecutor,
    viewerId: string,
    sellerId: string
  ): Promise<boolean> {
    const [msgRow] = await executor
      .select({ id: messages.id })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(and(eq(conversations.sellerId, sellerId), eq(conversations.buyerId, viewerId)))
      .limit(1);
    if (msgRow) return true;

    const [offerRow] = await executor
      .select({ id: priceOffers.id })
      .from(priceOffers)
      .where(and(eq(priceOffers.sellerId, sellerId), eq(priceOffers.buyerId, viewerId)))
      .limit(1);
    return Boolean(offerRow);
  }

  private async resolveListingMediaTx(params: {
    tx: DbExecutor;
    actorId: string;
    actorIsAdmin: boolean;
    targetListingId: string;
    imageInputs?: unknown;
    videoInput?: unknown;
    fallbackImageUrl: string;
  }): Promise<{
    images: ListingImageRecord[];
    video: ListingVideoRecord | null;
    boundMediaIds: Set<string>;
  }> {
    const {
      tx,
      actorId,
      actorIsAdmin,
      targetListingId,
      imageInputs,
      videoInput,
      fallbackImageUrl,
    } = params;

    const candidateIds = collectCandidateMediaIds(imageInputs, videoInput);
    const mediaMap = new Map<string, typeof mediaAssets.$inferSelect>();
    if (candidateIds.length > 0) {
      const lockedRows = await tx
        .select()
        .from(mediaAssets)
        .where(inArray(mediaAssets.id, candidateIds))
        .for('update');
      for (const row of lockedRows) {
        mediaMap.set(row.id, row);
      }
    }

    const boundMediaIds = new Set<string>();
    const images: ListingImageRecord[] = [];

    if (Array.isArray(imageInputs) && imageInputs.length > 0) {
      if (imageInputs.length > MAX_LISTING_IMAGES) {
        throw new MediaUploadError(400, `الحد الأقصى للصور هو ${MAX_LISTING_IMAGES} صور لكل إعلان`);
      }

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

        if (rawMediaId) {
          const asset = mediaMap.get(rawMediaId);
          if (!asset || asset.kind !== 'image') {
            throw new MediaUploadError(400, 'إحدى الصور المرفوعة غير موجودة أو غير صالحة');
          }
          if (!actorIsAdmin && asset.uploaderId !== actorId) {
            throw new MediaUploadError(403, 'غير مصرح لك باستخدام ملف مرفوع لحساب آخر', 'forbidden');
          }
          if (asset.listingId !== null && asset.listingId !== targetListingId) {
            throw new MediaUploadError(403, 'هذا الملف مرتبط بإعلان آخر بالفعل', 'forbidden');
          }
          if (boundMediaIds.has(asset.id)) {
            continue;
          }
          boundMediaIds.add(asset.id);
          images.push({
            id: `img_${crypto.randomUUID().slice(0, 6)}`,
            url: asset.url,
            position: images.length + 1,
            mediaId: asset.id,
          });
        } else if (STOCK_IMAGE_PATH_RE.test(rawUrl)) {
          images.push({
            id: `img_${crypto.randomUUID().slice(0, 6)}`,
            url: rawUrl,
            position: images.length + 1,
          });
        } else {
          throw new MediaUploadError(400, 'رابط الصورة غير صالح أو غير مسموح به');
        }
      }
    } else {
      images.push({
        id: `img_${crypto.randomUUID().slice(0, 6)}`,
        url: fallbackImageUrl,
        position: 1,
      });
    }

    let video: ListingVideoRecord | null = null;
    if (videoInput !== undefined && videoInput !== null && videoInput !== '') {
      const rawVideoId =
        typeof videoInput === 'string'
          ? extractMediaIdFromUrl(videoInput) || videoInput.trim()
          : typeof (videoInput as any)?.mediaId === 'string'
          ? String((videoInput as any).mediaId).trim()
          : typeof (videoInput as any)?.url === 'string'
          ? extractMediaIdFromUrl(String((videoInput as any).url))
          : null;

      if (!rawVideoId) {
        throw new MediaUploadError(400, 'بيانات الفيديو المرفق غير صالحة');
      }

      const asset = mediaMap.get(rawVideoId);
      if (!asset || asset.kind !== 'video') {
        throw new MediaUploadError(400, 'ملف الفيديو غير موجود أو غير صالح');
      }
      if (!actorIsAdmin && asset.uploaderId !== actorId) {
        throw new MediaUploadError(403, 'غير مصرح لك باستخدام فيديو مرفوع لحساب آخر', 'forbidden');
      }
      if (asset.listingId !== null && asset.listingId !== targetListingId) {
        throw new MediaUploadError(403, 'هذا الفيديو مرتبط بإعلان آخر بالفعل', 'forbidden');
      }

      boundMediaIds.add(asset.id);
      video = {
        id: `vid_${crypto.randomUUID().slice(0, 6)}`,
        url: asset.url,
        mimeType: asset.mimeType,
        sizeBytes: Number(asset.sizeBytes),
        mediaId: asset.id,
        originalName: asset.originalName,
      };
    }

    return { images, video, boundMediaIds };
  }

  private async serializeConversationsForUser(
    executor: DbExecutor,
    convRows: Array<typeof conversations.$inferSelect>,
    viewerId: string
  ) {
    if (convRows.length === 0) return [];
    const convIds = convRows.map((c) => c.id);
    const partyIds = Array.from(
      new Set(convRows.flatMap((c) => [c.buyerId, c.sellerId]))
    );
    const listingIds = Array.from(new Set(convRows.map((c) => c.listingId)));

    const msgRows = await executor
      .select()
      .from(messages)
      .where(inArray(messages.conversationId, convIds))
      .orderBy(asc(messages.createdAt));
    const readRows = await executor
      .select()
      .from(conversationReadStates)
      .where(
        and(
          inArray(conversationReadStates.conversationId, convIds),
          eq(conversationReadStates.userId, viewerId)
        )
      );
    const userRows = await executor
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, partyIds));
    const sellerRows = await executor
      .select({ userId: sellerProfiles.userId, displayName: sellerProfiles.displayName })
      .from(sellerProfiles)
      .where(inArray(sellerProfiles.userId, partyIds));
    const listingRows = await executor
      .select({ id: listings.id, title: listings.title })
      .from(listings)
      .where(inArray(listings.id, listingIds));

    const msgsByConv = new Map<string, Array<{ id: string; conversationId: string; senderId: string; body: string; createdAt: string }>>();
    for (const m of msgRows) {
      const arr = msgsByConv.get(m.conversationId) || [];
      arr.push({
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        body: m.body,
        createdAt: toIsoRequired(m.createdAt),
      });
      msgsByConv.set(m.conversationId, arr);
    }

    const readByConv = new Map<string, string>();
    for (const r of readRows) {
      readByConv.set(r.conversationId, toIsoRequired(r.lastReadAt));
    }

    const context = {
      users: userRows,
      sellers: sellerRows,
      listings: listingRows,
    };

    return convRows.map((c) => {
      const lastReadAt = readByConv.get(c.id);
      return toUserConversation(
        {
          id: c.id,
          listingId: c.listingId,
          buyerId: c.buyerId,
          sellerId: c.sellerId,
          updatedAt: toIsoRequired(c.updatedAt),
          readAtByUserId: lastReadAt ? { [viewerId]: lastReadAt } : {},
          messages: msgsByConv.get(c.id) || [],
        },
        viewerId,
        context
      );
    });
  }

  // ---- Auth & sessions ----

  async findUserById(userId: string) {
    const [row] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    return row ? mapDbUser(row) : undefined;
  }

  async findUserByPhone(phone: string) {
    const [row] = await this.db.select().from(users).where(eq(users.phone, phone)).limit(1);
    return row ? mapDbUser(row) : undefined;
  }

  async getCredential(userId: string): Promise<Credential | undefined> {
    const [row] = await this.db
      .select()
      .from(userCredentials)
      .where(eq(userCredentials.userId, userId))
      .limit(1);
    if (!row) return undefined;
    return {
      userId: row.userId,
      passwordHash: row.passwordHash,
      updatedAt: toIsoRequired(row.updatedAt),
    };
  }

  async updateCredential(userId: string, passwordHash: string): Promise<void> {
    const now = new Date();
    await this.db
      .insert(userCredentials)
      .values({ userId, passwordHash, updatedAt: now })
      .onConflictDoUpdate({
        target: userCredentials.userId,
        set: { passwordHash, updatedAt: now },
      });
  }

  async registerUser(params: {
    name: string;
    phone: string;
    role: 'buyer' | 'seller';
    passwordHash: string;
  }) {
    try {
      return await this.db.transaction(async (tx) => {
        const now = new Date();
        const userId = `usr_${crypto.randomUUID().slice(0, 8)}`;
        const [insertedUser] = await tx
          .insert(users)
          .values({
            id: userId,
            phone: params.phone,
            email: `${params.phone}@souqalghanam.sa`,
            name: params.name,
            role: params.role,
            status: 'active',
            isDemo: false,
            phoneVerifiedAt: null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        let seller: any;
        if (params.role === 'seller') {
          const [insertedSeller] = await tx
            .insert(sellerProfiles)
            .values({
              userId,
              displayName: `مراح ${params.name}`,
              bio: 'مربٍ وبائع مواشٍ مسجل في منصة سوق الغنم.',
              regionId: 'reg_riyadh',
              city: 'الرياض',
              phone: params.phone,
              whatsapp: `966${params.phone.replace(/^0/, '')}`,
              verificationStatus: 'Pending',
              verifiedAt: null,
              verificationNote: null,
              verificationRequestedAt: now,
              verificationReviewedAt: null,
              yearsExperience: 3,
              specialty: 'أغنام وماعز',
              rating: '0',
              ratingCount: 0,
              totalSales: 0,
              createdAt: now,
              updatedAt: now,
            })
            .returning();
          seller = mapDbSeller(insertedSeller);
        }

        await tx.insert(userCredentials).values({
          userId,
          passwordHash: params.passwordHash,
          updatedAt: now,
        });

        return { user: mapDbUser(insertedUser), seller };
      });
    } catch (err: any) {
      if (isPgUniqueViolation(err)) {
        throw new RepositoryError(
          409,
          'رقم الجوال مسجل مسبقاً، سجّل الدخول بدلاً من ذلك',
          'phone_exists'
        );
      }
      throw err;
    }
  }

  async getUserAuthMeta(userId: string): Promise<{ googleLinked: boolean; hasPassword: boolean }> {
    const [googleRow, credRow] = await Promise.all([
      this.db
        .select({ id: googleIdentities.id })
        .from(googleIdentities)
        .where(and(eq(googleIdentities.userId, userId), eq(googleIdentities.provider, 'google')))
        .limit(1),
      this.db
        .select({ userId: userCredentials.userId })
        .from(userCredentials)
        .where(eq(userCredentials.userId, userId))
        .limit(1),
    ]);
    return {
      googleLinked: googleRow.length > 0,
      hasPassword: credRow.length > 0,
    };
  }

  async findUserByGoogleSubject(subject: string) {
    const [row] = await this.db
      .select({ user: users })
      .from(googleIdentities)
      .innerJoin(users, eq(googleIdentities.userId, users.id))
      .where(and(eq(googleIdentities.provider, 'google'), eq(googleIdentities.subject, subject)))
      .limit(1);
    return row ? mapDbUser(row.user) : undefined;
  }

  async authenticateWithGoogle(params: {
    claims: VerifiedGoogleClaims;
    role?: 'buyer' | 'seller';
    mode?: 'login' | 'register';
  }) {
    const emailLower = params.claims.email.trim().toLowerCase();
    try {
      return await this.db.transaction(async (tx) => {
        const [existingIdentity] = await tx
          .select()
          .from(googleIdentities)
          .where(
            and(
              eq(googleIdentities.provider, 'google'),
              eq(googleIdentities.subject, params.claims.sub)
            )
          )
          .limit(1);

        if (existingIdentity) {
          const [userRow] = await tx
            .select()
            .from(users)
            .where(eq(users.id, existingIdentity.userId))
            .limit(1);
          if (!userRow) {
            throw new RepositoryError(
              404,
              'الحساب المرتبط بهوية Google غير موجود',
              'linked_user_missing'
            );
          }

          const now = new Date();
          await tx
            .update(googleIdentities)
            .set({
              email: emailLower,
              emailVerified: params.claims.emailVerified,
              name: params.claims.name.slice(0, 120),
              pictureUrl: params.claims.picture || null,
              updatedAt: now,
            })
            .where(eq(googleIdentities.id, existingIdentity.id));

          const [credRow] = await tx
            .select({ userId: userCredentials.userId })
            .from(userCredentials)
            .where(eq(userCredentials.userId, userRow.id))
            .limit(1);

          return {
            user: mapDbUser(userRow),
            isNewUser: false,
            googleLinked: true,
            hasPassword: Boolean(credRow),
          };
        }

        const [emailMatch] = await tx
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(${users.email}) = ${emailLower}`)
          .limit(1);

        if (emailMatch) {
          // Never auto-link based solely on email; require proof of ownership.
          throw new RepositoryError(
            409,
            'يوجد حساب مسجل مسبقاً بهذا البريد الإلكتروني. سجّل الدخول بحسابك الحالي وأكّد ملكيته لربطه بحساب Google.',
            'account_exists_link_required'
          );
        }

        const now = new Date();
        const role: 'buyer' | 'seller' = params.role === 'seller' ? 'seller' : 'buyer';
        const draftUser = createUserRecord({
          name: params.claims.name,
          phone: null,
          email: emailLower,
          role,
        });

        const [insertedUser] = await tx
          .insert(users)
          .values({
            id: draftUser.id,
            phone: null,
            email: emailLower.slice(0, 255),
            name: draftUser.name.slice(0, 80),
            role,
            status: 'active',
            isDemo: false,
            phoneVerifiedAt: null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        if (role === 'seller') {
          const sellerDraft = buildSellerProfile({
            id: insertedUser.id,
            name: insertedUser.name,
            phone: null,
          });
          await tx.insert(sellerProfiles).values({
            userId: insertedUser.id,
            displayName: sellerDraft.displayName.slice(0, 120),
            bio: sellerDraft.bio,
            regionId: sellerDraft.regionId,
            city: sellerDraft.city,
            phone: '',
            whatsapp: '',
            verificationStatus: 'Pending',
            verifiedAt: null,
            verificationNote: null,
            verificationRequestedAt: now,
            verificationReviewedAt: null,
            yearsExperience: 3,
            specialty: 'أغنام وماعز',
            rating: '0',
            ratingCount: 0,
            totalSales: 0,
            createdAt: now,
            updatedAt: now,
          });
        }

        await tx.insert(googleIdentities).values({
          id: `gid_${crypto.randomUUID().slice(0, 10)}`,
          userId: insertedUser.id,
          provider: 'google',
          subject: params.claims.sub,
          email: emailLower.slice(0, 255),
          emailVerified: params.claims.emailVerified,
          name: params.claims.name.slice(0, 120),
          pictureUrl: params.claims.picture || null,
          createdAt: now,
          updatedAt: now,
        });

        return {
          user: mapDbUser(insertedUser),
          isNewUser: true,
          googleLinked: true,
          hasPassword: false,
        };
      });
    } catch (err: any) {
      if (err instanceof RepositoryError) throw err;
      if (isPgUniqueViolation(err)) {
        throw new RepositoryError(
          409,
          'تعذر إتمام المصادقة بسبب تعارض في بيانات الحساب، حاول مرة أخرى',
          'account_conflict'
        );
      }
      throw err;
    }
  }

  async linkGoogleIdentity(params: { userId: string; claims: VerifiedGoogleClaims }) {
    const emailLower = params.claims.email.trim().toLowerCase();
    try {
      return await this.db.transaction(async (tx) => {
        const [userRow] = await tx
          .select()
          .from(users)
          .where(eq(users.id, params.userId))
          .limit(1);
        if (!userRow) {
          throw new RepositoryError(404, 'الحساب غير موجود', 'user_not_found');
        }
        if (userRow.status !== 'active') {
          throw new RepositoryError(403, 'هذا الحساب موقوف، تواصل مع إدارة المنصة', 'account_suspended');
        }

        const [bySub] = await tx
          .select()
          .from(googleIdentities)
          .where(
            and(
              eq(googleIdentities.provider, 'google'),
              eq(googleIdentities.subject, params.claims.sub)
            )
          )
          .limit(1);
        if (bySub && bySub.userId !== userRow.id) {
          throw new RepositoryError(
            409,
            'حساب Google هذا مرتبط بحساب آخر بالفعل',
            'google_subject_conflict'
          );
        }

        const [byUser] = await tx
          .select()
          .from(googleIdentities)
          .where(
            and(
              eq(googleIdentities.provider, 'google'),
              eq(googleIdentities.userId, userRow.id)
            )
          )
          .limit(1);
        if (byUser && byUser.subject !== params.claims.sub) {
          throw new RepositoryError(
            409,
            'هذا الحساب مرتبط بالفعل بحساب Google آخر',
            'google_already_linked'
          );
        }

        const now = new Date();
        if (bySub) {
          await tx
            .update(googleIdentities)
            .set({
              email: emailLower.slice(0, 255),
              emailVerified: params.claims.emailVerified,
              name: params.claims.name.slice(0, 120),
              pictureUrl: params.claims.picture || null,
              updatedAt: now,
            })
            .where(eq(googleIdentities.id, bySub.id));
        } else {
          await tx.insert(googleIdentities).values({
            id: `gid_${crypto.randomUUID().slice(0, 10)}`,
            userId: userRow.id,
            provider: 'google',
            subject: params.claims.sub,
            email: emailLower.slice(0, 255),
            emailVerified: params.claims.emailVerified,
            name: params.claims.name.slice(0, 120),
            pictureUrl: params.claims.picture || null,
            createdAt: now,
            updatedAt: now,
          });
        }

        const [credRow] = await tx
          .select({ userId: userCredentials.userId })
          .from(userCredentials)
          .where(eq(userCredentials.userId, userRow.id))
          .limit(1);

        return {
          user: mapDbUser(userRow),
          googleLinked: true,
          hasPassword: Boolean(credRow),
        };
      });
    } catch (err: any) {
      if (err instanceof RepositoryError) throw err;
      if (isPgUniqueViolation(err)) {
        throw new RepositoryError(
          409,
          'حساب Google هذا مرتبط بحساب آخر بالفعل',
          'google_subject_conflict'
        );
      }
      throw err;
    }
  }

  async completeUserProfile(params: {
    userId: string;
    phone: string;
    name?: string;
    role?: 'buyer' | 'seller';
  }) {
    try {
      return await this.db.transaction(async (tx) => {
        const [userRow] = await tx
          .select()
          .from(users)
          .where(eq(users.id, params.userId))
          .for('update');
        if (!userRow) {
          throw new RepositoryError(404, 'الحساب غير موجود', 'user_not_found');
        }
        if (userRow.status !== 'active') {
          throw new RepositoryError(403, 'هذا الحساب موقوف، تواصل مع إدارة المنصة', 'account_suspended');
        }

        const [phoneTaken] = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.phone, params.phone), ne(users.id, userRow.id)))
          .limit(1);
        if (phoneTaken) {
          throw new RepositoryError(409, 'رقم الجوال مسجل لحساب آخر بالفعل', 'phone_exists');
        }

        const now = new Date();
        const phoneChanged = userRow.phone !== params.phone;
        const nextName =
          typeof params.name === 'string' && params.name.trim()
            ? params.name.trim().slice(0, 80)
            : userRow.name;
        const nextRole =
          (params.role === 'buyer' || params.role === 'seller') && userRow.role !== 'admin'
            ? params.role
            : (userRow.role as 'buyer' | 'seller' | 'admin');

        const [updatedUser] = await tx
          .update(users)
          .set({
            phone: params.phone,
            phoneVerifiedAt: phoneChanged ? null : userRow.phoneVerifiedAt,
            name: nextName,
            role: nextRole,
            updatedAt: now,
          })
          .where(eq(users.id, userRow.id))
          .returning();

        const [existingSeller] = await tx
          .select()
          .from(sellerProfiles)
          .where(eq(sellerProfiles.userId, userRow.id))
          .limit(1);

        const whatsapp = `966${params.phone.replace(/^0/, '')}`;
        if (existingSeller) {
          await tx
            .update(sellerProfiles)
            .set({ phone: params.phone, whatsapp, updatedAt: now })
            .where(eq(sellerProfiles.userId, userRow.id));
        } else if (nextRole === 'seller') {
          await tx.insert(sellerProfiles).values({
            userId: userRow.id,
            displayName: `مراح ${nextName}`,
            bio: 'مربٍ وبائع مواشٍ مسجل في منصة سوق الغنم.',
            regionId: 'reg_riyadh',
            city: 'الرياض',
            phone: params.phone,
            whatsapp,
            verificationStatus: 'Pending',
            verifiedAt: null,
            verificationNote: null,
            verificationRequestedAt: now,
            verificationReviewedAt: null,
            yearsExperience: 3,
            specialty: 'أغنام وماعز',
            rating: '0',
            ratingCount: 0,
            totalSales: 0,
            createdAt: now,
            updatedAt: now,
          });
        }

        const [googleRow, credRow] = await Promise.all([
          tx
            .select({ id: googleIdentities.id })
            .from(googleIdentities)
            .where(and(eq(googleIdentities.userId, userRow.id), eq(googleIdentities.provider, 'google')))
            .limit(1),
          tx
            .select({ userId: userCredentials.userId })
            .from(userCredentials)
            .where(eq(userCredentials.userId, userRow.id))
            .limit(1),
        ]);

        return {
          user: mapDbUser(updatedUser),
          googleLinked: googleRow.length > 0,
          hasPassword: credRow.length > 0,
        };
      });
    } catch (err: any) {
      if (err instanceof RepositoryError) throw err;
      if (isPgUniqueViolation(err)) {
        throw new RepositoryError(409, 'رقم الجوال مسجل لحساب آخر بالفعل', 'phone_exists');
      }
      throw err;
    }
  }

  async createSession(params: {
    userId: string;
    ip?: string;
    userAgent?: string;
    absoluteMs: number;
    maxPerUser: number;
    nowMs?: number;
  }) {
    const token = crypto.randomBytes(32).toString('base64url');
    const id = hashToken(token);
    const t = params.nowMs ?? Date.now();
    const createdAt = new Date(t);
    const lastSeenAt = new Date(t);
    const expiresAt = new Date(t + params.absoluteMs);

    const { session, evictedIds } = await this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(sessions)
        .values({
          id,
          userId: params.userId,
          createdAt,
          lastSeenAt,
          expiresAt,
          ip: params.ip ?? null,
          userAgent: params.userAgent ? params.userAgent.slice(0, 200) : null,
        })
        .returning();

      const mine = await tx
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.userId, params.userId))
        .orderBy(asc(sessions.lastSeenAt));

      const overflow = mine.length - params.maxPerUser;
      const toDrop = overflow > 0 ? mine.slice(0, overflow).map((s) => s.id) : [];
      if (toDrop.length > 0) {
        await tx.delete(sessions).where(inArray(sessions.id, toDrop));
      }

      return { session: mapDbSession(inserted), evictedIds: toDrop };
    });

    if (evictedIds.length > 0) {
      this.onSessionsRevoked?.(evictedIds);
    }

    return { token, session, evictedIds };
  }

  async validateSession(params: {
    token: string | undefined;
    idleMs: number;
    nowMs?: number;
  }): Promise<SessionRecord | null> {
    const { token, idleMs } = params;
    if (!token || token.length < 20 || token.length > 200) return null;
    const id = hashToken(token);
    const [row] = await this.db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    if (!row) return null;

    const t = params.nowMs ?? Date.now();
    const expiresMs = row.expiresAt.getTime();
    const lastSeenMs = row.lastSeenAt.getTime();
    if (t >= expiresMs || t - lastSeenMs >= idleMs) {
      await this.revokeSession(row.id);
      return null;
    }

    if (t - lastSeenMs >= TOUCH_INTERVAL_MS) {
      const nextSeen = new Date(t);
      await this.db.update(sessions).set({ lastSeenAt: nextSeen }).where(eq(sessions.id, row.id));
      row.lastSeenAt = nextSeen;
    }

    return mapDbSession(row);
  }

  async isSessionAlive(params: {
    sessionId: string;
    idleMs: number;
    nowMs?: number;
  }): Promise<boolean> {
    const [row] = await this.db
      .select({ expiresAt: sessions.expiresAt, lastSeenAt: sessions.lastSeenAt })
      .from(sessions)
      .where(eq(sessions.id, params.sessionId))
      .limit(1);
    if (!row) return false;
    const t = params.nowMs ?? Date.now();
    return t < row.expiresAt.getTime() && t - row.lastSeenAt.getTime() < params.idleMs;
  }

  async revokeSession(sessionId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(sessions)
      .where(eq(sessions.id, sessionId))
      .returning({ id: sessions.id });
    if (deleted.length > 0) {
      this.onSessionsRevoked?.([sessionId]);
      return true;
    }
    return false;
  }

  async revokeAllSessionsForUser(userId: string, exceptId?: string): Promise<string[]> {
    const cond = exceptId
      ? and(eq(sessions.userId, userId), ne(sessions.id, exceptId))
      : eq(sessions.userId, userId);
    const deleted = await this.db.delete(sessions).where(cond).returning({ id: sessions.id });
    const ids = deleted.map((d) => d.id);
    if (ids.length > 0) {
      this.onSessionsRevoked?.(ids);
    }
    return ids;
  }

  async sweepExpiredSessions(idleMs: number, nowMs = Date.now()): Promise<string[]> {
    const nowDate = new Date(nowMs);
    const idleCutoff = new Date(nowMs - idleMs);
    const deleted = await this.db
      .delete(sessions)
      .where(or(lte(sessions.expiresAt, nowDate), lte(sessions.lastSeenAt, idleCutoff)))
      .returning({ id: sessions.id });
    const ids = deleted.map((d) => d.id);
    if (ids.length > 0) {
      this.onSessionsRevoked?.(ids);
    }
    return ids;
  }

  async ensureDemoCredentials(hashPasswordFn: (password: string) => Promise<string>) {
    const demoUsers = await this.db
      .select()
      .from(users)
      .where(inArray(users.id, Array.from(DEMO_USER_IDS)));
    const existingCreds = await this.db.select({ userId: userCredentials.userId }).from(userCredentials);
    const hasCred = new Set(existingCreds.map((c) => c.userId));
    const created: Array<{ phone: string; role: string; password: string }> = [];

    for (const u of demoUsers) {
      if (hasCred.has(u.id)) continue;
      const password = crypto.randomBytes(12).toString('base64url');
      await this.db
        .insert(userCredentials)
        .values({
          userId: u.id,
          passwordHash: await hashPasswordFn(password),
          updatedAt: new Date(),
        })
        .onConflictDoNothing();
      created.push({ phone: u.phone || u.email, role: u.role, password });
    }
    return created;
  }

  async hasNonDemoAdminWithCredentials(): Promise<boolean> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .innerJoin(userCredentials, eq(userCredentials.userId, users.id))
      .where(and(eq(users.role, 'admin'), eq(users.isDemo, false)))
      .limit(1);
    return Boolean(row);
  }

  // ---- Bootstrap & notifications ----

  async getBootstrap(viewer: any | null, csrfToken: string | null) {
    const [
      sellerRows,
      userStatusRows,
      categoryRows,
      breedRows,
      regionRows,
      priceRows,
      articleRows,
      faqRows,
    ] = await Promise.all([
      this.db.select().from(sellerProfiles),
      this.db.select({ id: users.id, status: users.status, phone: users.phone }).from(users),
      this.db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id)),
      this.db.select().from(breeds),
      this.db.select().from(regions).orderBy(asc(regions.sortOrder), asc(regions.id)),
      this.db.select().from(indicativePrices),
      this.db.select().from(articles).orderBy(desc(articles.publishedAt)),
      this.db.select().from(faqs).orderBy(asc(faqs.sortOrder), asc(faqs.id)),
    ]);

    const userStatusMap = new Map(userStatusRows.map((u) => [u.id, u]));
    const visibleSellers = !viewer
      ? sellerRows.filter((s) => userStatusMap.get(s.userId)?.status === 'active')
      : sellerRows;

    const activity = viewer ? await this.getUserActivity(viewer) : null;
    const publicCommissionSettings =
      activity?.commissionSettings ?? (await this.getOrCreateCommissionSettingsTx(this.db));

    return {
      sellers: visibleSellers.map((s) => {
        const u = userStatusMap.get(s.userId);
        const contactAvailable = Boolean(
          u && u.status === 'active' && (s.phone || s.whatsapp || u.phone)
        );
        return toPublicSeller(mapDbSeller(s), contactAvailable);
      }),
      categories: categoryRows.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        parentId: c.parentId ?? null,
        ...(c.description ? { description: c.description } : {}),
        ...(c.keywords && c.keywords.length > 0 ? { keywords: c.keywords } : {}),
      })),
      breeds: breedRows,
      regions: regionRows.map((r) => ({ id: r.id, name: r.name, parentId: r.parentId ?? null })),
      indicativePrices: priceRows.map((p) => ({
        ...p,
        minPrice: Number(p.minPrice),
        maxPrice: Number(p.maxPrice),
        avgPrice: Number(p.avgPrice),
        updatedAt: toIsoRequired(p.updatedAt),
      })),
      articles: articleRows.map((a) => ({ ...a, publishedAt: toIsoRequired(a.publishedAt) })),
      faqs: faqRows.map((f) => ({ id: f.id, question: f.question, answer: f.answer })),
      currentUser: viewer ? toSelfUser(viewer, await this.getUserAuthMeta(viewer.id)) : null,
      csrfToken: csrfToken ?? null,
      favoriteIds: activity?.favoriteIds ?? [],
      likedListingIds: activity?.likedListingIds ?? [],
      conversations: activity?.conversations ?? [],
      priceOffers: activity?.priceOffers ?? [],
      notifications: activity?.notifications ?? [],
      reports: activity?.reports ?? [],
      auditLogs: activity?.auditLogs ?? [],
      commissionSettings: publicCommissionSettings,
      commissionEligibility: activity?.commissionEligibility ?? null,
      myCommissionRecords: activity?.myCommissionRecords ?? [],
    };
  }

  private async getOrCreateCommissionSettingsTx(executor: DbExecutor): Promise<CommissionSettings> {
    const [row] = await executor
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.id, 'default'))
      .limit(1);
    if (row) return mapDbCommissionSettings(row);
    const defaults = createDefaultCommissionSettings();
    try {
      const [inserted] = await executor
        .insert(platformSettings)
        .values({
          id: 'default',
          commissionRatePercent: String(defaults.commissionRatePercent),
          promoEnabled: defaults.promoEnabled,
          promoFreeDays: defaults.promoFreeDays,
          promoFreeListingsCount: defaults.promoFreeListingsCount,
          featuredWeeklyPriceSar: String(defaults.featuredWeeklyPriceSar),
          bankName: defaults.bankName,
          accountHolderName: defaults.accountHolderName,
          iban: defaults.iban,
          updatedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();
      if (inserted) return mapDbCommissionSettings(inserted);
      const [refetched] = await executor
        .select()
        .from(platformSettings)
        .where(eq(platformSettings.id, 'default'))
        .limit(1);
      return mapDbCommissionSettings(refetched);
    } catch {
      return defaults;
    }
  }

  private async getSellerPlatformSalesCountTx(executor: DbExecutor, sellerId: string): Promise<number> {
    const [{ count }] = await executor
      .select({ count: sql<number>`count(*)::int` })
      .from(commissionRecords)
      .where(
        and(
          eq(commissionRecords.sellerId, sellerId),
          eq(commissionRecords.kind, 'sale_commission'),
          eq(commissionRecords.soldViaPlatform, true)
        )
      );
    return Number(count || 0);
  }

  private async notifyActiveAdminsTx(
    tx: DbExecutor,
    excludeUserId: string | null,
    input: Omit<CreateNotificationInput, 'userId'>
  ): Promise<Array<{ userId: string; notification: any }>> {
    const adminRows = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, 'admin'), eq(users.status, 'active')));
    const created: Array<{ userId: string; notification: any }> = [];
    for (const adm of adminRows) {
      if (adm.id === excludeUserId) continue;
      const ntf = await this.insertNotificationTx(tx, { ...input, userId: adm.id });
      created.push({ userId: adm.id, notification: ntf });
    }
    return created;
  }

  async getUserActivity(viewer: any) {
    const viewerIsAdmin = isAdmin(viewer);

    const [
      favRows,
      likeRows,
      convRows,
      offerRows,
      notifRows,
      reportRows,
      auditRows,
      myCommissionRows,
      commissionSettings,
    ] = await Promise.all([
      this.db
        .select({ listingId: listingFavorites.listingId })
        .from(listingFavorites)
        .where(eq(listingFavorites.userId, viewer.id)),
      this.db
        .select({ listingId: listingLikes.listingId })
        .from(listingLikes)
        .innerJoin(listings, eq(listingLikes.listingId, listings.id))
        .where(and(eq(listingLikes.userId, viewer.id), eq(listings.status, 'Published'))),
      this.db
        .select()
        .from(conversations)
        .where(or(eq(conversations.buyerId, viewer.id), eq(conversations.sellerId, viewer.id)))
        .orderBy(desc(conversations.updatedAt)),
      viewerIsAdmin
        ? this.db.select().from(priceOffers).orderBy(desc(priceOffers.createdAt))
        : this.db
            .select()
            .from(priceOffers)
            .where(or(eq(priceOffers.buyerId, viewer.id), eq(priceOffers.sellerId, viewer.id)))
            .orderBy(desc(priceOffers.createdAt)),
      this.db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, viewer.id))
        .orderBy(desc(notifications.createdAt)),
      viewerIsAdmin
        ? this.db.select().from(reports).orderBy(desc(reports.createdAt)).limit(50)
        : Promise.resolve([]),
      viewerIsAdmin
        ? this.db
            .select()
            .from(auditLogs)
            .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
            .limit(50)
        : Promise.resolve([]),
      this.db
        .select()
        .from(commissionRecords)
        .where(eq(commissionRecords.sellerId, viewer.id))
        .orderBy(desc(commissionRecords.createdAt)),
      this.getOrCreateCommissionSettingsTx(this.db),
    ]);

    const serializedConvs = await this.serializeConversationsForUser(this.db, convRows, viewer.id);
    const mappedMyCommissions = myCommissionRows.map(mapDbCommissionRecord);
    const priorPlatformSalesCount = mappedMyCommissions.filter(
      (r) => r.kind === 'sale_commission' && r.soldViaPlatform
    ).length;
    const commissionEligibility = evaluateSellerCommissionEligibility({
      settings: commissionSettings,
      userCreatedAt: viewer.createdAt,
      priorPlatformSalesCount,
    });

    return {
      favoriteIds: favRows.map((r) => r.listingId),
      likedListingIds: likeRows.map((r) => r.listingId),
      conversations: serializedConvs,
      priceOffers: offerRows.map(mapDbPriceOffer),
      notifications: notifRows.map(mapDbNotification),
      reports: reportRows.map(mapDbReport),
      auditLogs: auditRows.map(mapDbAuditLog),
      commissionSettings,
      commissionEligibility,
      myCommissionRecords: mappedMyCommissions,
    };
  }

  async getNotificationsForUser(userId: string) {
    const rows = await this.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
    return rows.map(mapDbNotification);
  }

  async markNotificationRead(userId: string, notificationId: string) {
    const updated = await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
      .returning({ id: notifications.id });
    if (updated.length === 0) return null;
    return this.getNotificationsForUser(userId);
  }

  async markAllNotificationsRead(userId: string) {
    const updated = await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
      .returning({ id: notifications.id });
    return {
      changed: updated.length > 0,
      notifications: await this.getNotificationsForUser(userId),
    };
  }

  // ---- Listings & Media ----

  async queryListings(
    params: ValidatedListingQuery,
    currentUser: any | null
  ): Promise<PaginatedListingsResult> {
    const conds: any[] = [];

    if (params.status) {
      if (params.status === 'Published') {
        conds.push(eq(listings.status, 'Published'));
        if (params.sellerId) conds.push(eq(listings.sellerId, params.sellerId));
      } else if (isAdmin(currentUser)) {
        conds.push(eq(listings.status, params.status));
        if (params.sellerId) conds.push(eq(listings.sellerId, params.sellerId));
      } else if (currentUser && params.sellerId && params.sellerId === currentUser.id) {
        conds.push(eq(listings.sellerId, currentUser.id), eq(listings.status, params.status));
      } else if (currentUser && !params.sellerId && params.status === 'Sold') {
        conds.push(eq(listings.sellerId, currentUser.id), eq(listings.status, 'Sold'));
      } else {
        conds.push(eq(listings.status, 'Published'));
        if (params.sellerId) conds.push(eq(listings.sellerId, params.sellerId));
      }
    } else if (params.sellerId) {
      if ((currentUser && params.sellerId === currentUser.id) || isAdmin(currentUser)) {
        conds.push(eq(listings.sellerId, params.sellerId));
      } else {
        conds.push(eq(listings.sellerId, params.sellerId), eq(listings.status, 'Published'));
      }
    } else if (params.availability === 'sold') {
      conds.push(eq(listings.status, 'Sold'));
      if (!isAdmin(currentUser)) {
        if (!currentUser) {
          conds.push(sql`FALSE`);
        } else {
          conds.push(eq(listings.sellerId, currentUser.id));
        }
      }
    } else if (params.includeAllStatuses && isAdmin(currentUser)) {
      // All statuses visible to admin
    } else {
      conds.push(eq(listings.status, 'Published'));
    }

    if (!isAdmin(currentUser)) {
      conds.push(
        sql`EXISTS (SELECT 1 FROM users u WHERE u.id = ${listings.sellerId} AND u.status = 'active')`
      );
    }

    if (params.availability === 'available') {
      conds.push(gte(listings.quantity, 1));
    } else if (params.availability === 'accepts_offers') {
      conds.push(eq(listings.allowPriceOffers, true));
    } else if (params.availability === 'negotiable') {
      conds.push(eq(listings.isNegotiable, true));
    }

    if (params.q) {
      const tokens = tokenizeNormalizedQuery(params.q);
      if (tokens.length === 0) {
        // Query had only ignored characters -> treat as matches all (consistent with listingMatchesSearchQuery)
      } else {
        for (const token of tokens) {
          conds.push(sql`${listings.searchDoc} LIKE ${`%${escapeSqlLike(token)}%`} ESCAPE '\\'`);
        }
      }
    }

    if (params.categoryId) conds.push(eq(listings.categoryId, params.categoryId));
    if (params.subCategoryId) conds.push(eq(listings.subCategoryId, params.subCategoryId));
    if (params.breedId) conds.push(eq(listings.breedId, params.breedId));
    if (params.regionId) conds.push(eq(listings.regionId, params.regionId));
    if (params.city) {
      const cityTokens = tokenizeNormalizedQuery(params.city);
      const cityNormQuery = cityTokens.join(' ');
      if (cityNormQuery) {
        conds.push(
          sql`${listings.cityNorm} LIKE ${`%${escapeSqlLike(cityNormQuery)}%`} ESCAPE '\\'`
        );
      }
    }
    if (params.minPrice !== undefined) {
      conds.push(gte(listings.priceAmount, String(params.minPrice)));
    }
    if (params.maxPrice !== undefined) {
      conds.push(lte(listings.priceAmount, String(params.maxPrice)));
    }
    if (params.minQty !== undefined) conds.push(gte(listings.quantity, params.minQty));
    if (params.maxQty !== undefined) conds.push(lte(listings.quantity, params.maxQty));
    if (params.sex) conds.push(eq(listings.sex, params.sex));
    if (params.minAge !== undefined) conds.push(gte(listings.ageMonths, params.minAge));
    if (params.maxAge !== undefined) conds.push(lte(listings.ageMonths, params.maxAge));
    if (params.verifiedOnly) {
      conds.push(
        sql`EXISTS (SELECT 1 FROM seller_profiles sp WHERE sp.user_id = ${listings.sellerId} AND sp.verification_status = 'Verified')`
      );
    }
    if (params.vaccinatedOnly) conds.push(eq(listings.vaccinated, true));
    if (params.hasVideoOnly) {
      conds.push(
        sql`EXISTS (SELECT 1 FROM listing_videos lv WHERE lv.listing_id = ${listings.id})`
      );
    }
    if (params.negotiableOnly) conds.push(eq(listings.isNegotiable, true));
    if (params.acceptsOffersOnly) conds.push(eq(listings.allowPriceOffers, true));

    const whereClause = conds.length > 0 ? and(...conds) : undefined;
    const pubExpr = sql`COALESCE(${listings.publishedAt}, ${listings.createdAt})`;

    let orderByClauses: any[];
    if (params.sort === 'oldest') {
      orderByClauses = [asc(pubExpr), asc(listings.id)];
    } else if (params.sort === 'price_asc') {
      orderByClauses = [asc(listings.priceAmount), desc(pubExpr), asc(listings.id)];
    } else if (params.sort === 'price_desc') {
      orderByClauses = [desc(listings.priceAmount), desc(pubExpr), asc(listings.id)];
    } else if (params.sort === 'most_liked') {
      orderByClauses = [desc(listings.likesCount), desc(pubExpr), desc(listings.id)];
    } else {
      orderByClauses = [desc(pubExpr), desc(listings.id)];
    }

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(listings)
      .where(whereClause);

    const rows = await this.db
      .select()
      .from(listings)
      .where(whereClause)
      .orderBy(...orderByClauses)
      .limit(params.limit)
      .offset(params.offset);

    const hydrated = await this.hydrateListingsBatch(this.db, rows);
    const totalCount = Number(count || 0);
    const hasMore = params.offset + hydrated.length < totalCount;
    const nextOffset = hasMore ? params.offset + hydrated.length : null;
    const page = Math.floor(params.offset / params.limit) + 1;
    const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / params.limit);

    return {
      listings: hydrated,
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
    const [row] = await this.db.select().from(listings).where(eq(listings.id, listingId)).limit(1);
    if (!row || !canViewListing(viewer, row)) return null;
    if (!isAdmin(viewer)) {
      const [sellerUser] = await this.db
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, row.sellerId))
        .limit(1);
      if (!sellerUser || sellerUser.status === 'suspended') return null;
    }
    const [hydrated] = await this.hydrateListingsBatch(this.db, [row]);
    return hydrated || null;
  }

  async revealListingContact(listingId: string, currentUser: any) {
    const [listing] = await this.db
      .select()
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);
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

    const [sellerUser] = await this.db
      .select({ id: users.id, status: users.status, phone: users.phone })
      .from(users)
      .where(eq(users.id, listing.sellerId))
      .limit(1);
    if (!sellerUser || sellerUser.status === 'suspended') {
      throw new RepositoryError(403, 'لا تتوفر بيانات التواصل لهذا الحساب حالياً', 'seller_suspended');
    }

    const [seller] = await this.db
      .select({ phone: sellerProfiles.phone, whatsapp: sellerProfiles.whatsapp })
      .from(sellerProfiles)
      .where(eq(sellerProfiles.userId, listing.sellerId))
      .limit(1);

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
    const cleanRegionId = typeof regionId === 'string' ? regionId.trim() : '';

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

    const allowedSexes = new Set(['ذكر', 'أنثى', 'قطيع مختلط']);
    const resolvedSex = sex === undefined || sex === null || sex === '' ? 'ذكر' : sex;
    if (typeof resolvedSex !== 'string' || !allowedSexes.has(resolvedSex)) {
      throw new RepositoryError(400, 'قيمة الجنس غير صالحة', 'invalid_sex');
    }

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

    const candidateImageInputs = images !== undefined ? images : imageUrls;
    const candidateVideoInput = video !== undefined ? video : videoMediaId;
    const candidateMediaIds = collectCandidateMediaIds(candidateImageInputs, candidateVideoInput);
    hooks?.onCandidateMediaIds?.(candidateMediaIds);

    try {
      return await this.db.transaction(async (tx) => {
        const [breed] = await tx
          .select()
          .from(breeds)
          .where(eq(breeds.id, cleanBreedId))
          .limit(1);
        if (!breed) {
          throw new RepositoryError(400, 'السلالة المحددة غير صالحة', 'invalid_breed');
        }

        const [region] = await tx
          .select()
          .from(regions)
          .where(eq(regions.id, cleanRegionId))
          .limit(1);
        if (!region) {
          throw new RepositoryError(400, 'المنطقة المحددة غير صالحة', 'invalid_region');
        }

        const allCats = await tx.select().from(categories);
        const resolvedCategoryId =
          typeof categoryId === 'string' && categoryId.trim() ? categoryId.trim() : breed.categoryId;
        if (!allCats.some((c) => c.id === resolvedCategoryId && c.parentId === null)) {
          throw new RepositoryError(400, 'التصنيف الرئيسي المحدد غير صالح', 'invalid_category');
        }

        let explicitSubCategoryId: string | null = null;
        if (
          subCategoryId !== undefined &&
          subCategoryId !== null &&
          subCategoryId !== '' &&
          subCategoryId !== 'auto'
        ) {
          if (
            typeof subCategoryId !== 'string' ||
            !allCats.some((c) => c.id === subCategoryId.trim() && c.parentId !== null)
          ) {
            throw new RepositoryError(400, 'الفئة الفرعية المحددة غير صالحة', 'invalid_subcategory');
          }
          explicitSubCategoryId = subCategoryId.trim();
        }

        const listingId = `lst_${crypto.randomUUID().slice(0, 6)}`;
        const fallbackUrl = breed.imageUrl || IMG.naimi;

        const resolvedMedia = await this.resolveListingMediaTx({
          tx,
          actorId: currentUser.id,
          actorIsAdmin: isAdmin(currentUser),
          targetListingId: listingId,
          imageInputs: candidateImageInputs,
          videoInput: candidateVideoInput,
          fallbackImageUrl: fallbackUrl,
        });

        const now = new Date();
        const [existingSeller] = await tx
          .select()
          .from(sellerProfiles)
          .where(eq(sellerProfiles.userId, currentUser.id))
          .limit(1);

        let sellerDisplayName = existingSeller?.displayName;
        if (!existingSeller) {
          sellerDisplayName = `مراح ${currentUser.name}`;
          await tx.insert(sellerProfiles).values({
            userId: currentUser.id,
            displayName: sellerDisplayName,
            bio: 'مربٍ وبائع مواشٍ مسجل في منصة سوق الغنم.',
            regionId: cleanRegionId,
            city: cleanCity,
            phone: currentUser.phone,
            whatsapp: `966${currentUser.phone.replace(/^0/, '')}`,
            verificationStatus: 'Pending',
            verifiedAt: null,
            verificationNote: null,
            verificationRequestedAt: now,
            verificationReviewedAt: null,
            yearsExperience: 2,
            specialty: 'أغنام وماعز',
            rating: '0',
            ratingCount: 0,
            totalSales: 0,
            createdAt: now,
            updatedAt: now,
          });
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
            allCats
          );

        const allowOffers =
          allowPriceOffers !== undefined ? Boolean(allowPriceOffers) : Boolean(isNegotiable);
        const initialStatus =
          requestedStatus === 'Draft'
            ? 'Draft'
            : isAdmin(currentUser)
            ? 'Published'
            : 'Pending';

        const subCatName = resolvedSubCategoryId
          ? allCats.find((c) => c.id === resolvedSubCategoryId)?.name || ''
          : '';
        const catName = allCats.find((c) => c.id === resolvedCategoryId)?.name || '';
        const { cityNorm, searchDoc } = buildListingNormalizedColumns(
          { title: cleanTitle, description: cleanDescription, city: cleanCity },
          {
            breedName: breed.name,
            categoryName: catName,
            subCategoryName: subCatName,
            regionName: region.name,
            sellerDisplayName: sellerDisplayName || '',
          }
        );

        const pledgeAccepted = Boolean(commissionPledgeAccepted);
        const wantFeatured = Boolean(featuredRequested);

        const [inserted] = await tx
          .insert(listings)
          .values({
            id: listingId,
            sellerId: currentUser.id,
            categoryId: resolvedCategoryId,
            subCategoryId: resolvedSubCategoryId,
            breedId: cleanBreedId,
            regionId: cleanRegionId,
            city: cleanCity,
            cityNorm,
            title: cleanTitle,
            slug: `listing-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
            description: cleanDescription,
            searchDoc,
            priceAmount: String(parsedPrice),
            expectedPrice: parsedExpected !== null ? String(parsedExpected) : null,
            currency: 'SAR',
            sex: resolvedSex,
            ageMonths: parsedAgeMonths,
            weightKg: String(parsedWeightKg),
            quantity: parsedQuantity,
            isNegotiable: Boolean(isNegotiable) || allowOffers,
            allowPriceOffers: allowOffers,
            vaccinated: Boolean(vaccinated),
            status: initialStatus,
            isFeatured: false,
            commissionPledgeAccepted: pledgeAccepted,
            featuredRequested: wantFeatured,
            likesCount: 0,
            publishedAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        const insertedImages = await tx
          .insert(listingImages)
          .values(
            resolvedMedia.images.map((img) => ({
              id: img.id,
              listingId,
              mediaId: img.mediaId ?? null,
              url: img.url,
              position: img.position,
            }))
          )
          .returning();

        let insertedVideo: typeof listingVideos.$inferSelect | undefined;
        if (resolvedMedia.video) {
          const [v] = await tx
            .insert(listingVideos)
            .values({
              id: resolvedMedia.video.id,
              listingId,
              mediaId: resolvedMedia.video.mediaId,
              url: resolvedMedia.video.url,
              mimeType: resolvedMedia.video.mimeType,
              sizeBytes: resolvedMedia.video.sizeBytes,
              originalName: resolvedMedia.video.originalName ?? null,
            })
            .returning();
          insertedVideo = v;
        }

        if (resolvedMedia.boundMediaIds.size > 0) {
          await tx
            .update(mediaAssets)
            .set({ listingId })
            .where(inArray(mediaAssets.id, Array.from(resolvedMedia.boundMediaIds)));
        }

        if (wantFeatured && initialStatus !== 'Draft') {
          const settings = await this.getOrCreateCommissionSettingsTx(tx);
          const feeSar = roundCurrencySar(Number(settings.featuredWeeklyPriceSar || 35));
          await tx.insert(commissionRecords).values({
            id: `cmr_${crypto.randomUUID().slice(0, 8)}`,
            kind: 'featured_listing',
            listingId,
            listingTitle: cleanTitle.slice(0, 180),
            sellerId: currentUser.id,
            sellerName: String(currentUser.name || '').slice(0, 120),
            soldViaPlatform: true,
            saleAmountSar: '0',
            ratePercent: '0',
            commissionAmountSar: String(feeSar),
            isExempt: feeSar <= 0,
            exemptionReason: 'none',
            status: feeSar > 0 ? 'pending_payment' : 'approved',
            transferNote: 'طلب تمييز وتثبيت الإعلان في الصفحة الرئيسية لمدة أسبوع',
            createdAt: now,
            updatedAt: now,
          });
        }

        return mapDbListing(inserted, insertedImages, insertedVideo);
      });
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

    const hasMediaPayload =
      images !== undefined ||
      imageUrls !== undefined ||
      video !== undefined ||
      videoMediaId !== undefined;
    const candidateMediaIds = hasMediaPayload
      ? collectCandidateMediaIds(images !== undefined ? images : imageUrls, video !== undefined ? video : videoMediaId)
      : [];
    hooks?.onCandidateMediaIds?.(candidateMediaIds);

    try {
      return await this.db.transaction(async (tx) => {
        const [existingRow] = await tx
          .select()
          .from(listings)
          .where(eq(listings.id, listingId))
          .for('update');
        if (!existingRow) throw new RepositoryError(404, 'الإعلان غير موجود');
        if (!canEditListing(currentUser, existingRow)) {
          throw new RepositoryError(403, 'غير مصرح لك بتعديل هذا الإعلان');
        }

        const [existingHydrated] = await this.hydrateListingsBatch(tx, [existingRow]);

        let nextStatus = existingRow.status;
        if (status !== undefined) {
          if (isAdmin(currentUser)) {
            if (
              ['Published', 'Pending', 'Rejected', 'Sold', 'Draft', 'Expired'].includes(
                String(status)
              )
            ) {
              nextStatus = String(status);
            } else {
              throw new RepositoryError(400, 'حالة الإعلان المطلوبة غير صالحة', 'invalid_status');
            }
          } else if (status === 'Sold') {
            if (existingRow.status !== 'Published' && existingRow.status !== 'Sold') {
              throw new RepositoryError(
                400,
                'يمكن تحديد الإعلان كمباع بعد اعتماده ونشره فقط',
                'invalid_status'
              );
            }
            nextStatus = 'Sold';
          } else if (status === 'Draft' || status === 'Pending') {
            nextStatus = String(status);
          } else if (status === 'Published' && existingRow.status !== 'Published') {
            throw new RepositoryError(
              403,
              'لا يمكن نشر الإعلان أو إعادة نشر إعلان مرفوض دون موافقة المشرف',
              'moderation_required'
            );
          } else if (status === 'Rejected') {
            throw new RepositoryError(403, 'صلاحيات المشرف مطلوبة لهذا الإجراء', 'forbidden');
          } else if (status !== existingRow.status) {
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
            : existingRow.title;
        const nextDescription =
          description !== undefined
            ? validateOptionalText(description, {
                label: 'وصف الإعلان',
                maxLength: INPUT_LIMITS.listingDescriptionMax,
                allowNewlines: true,
                defaultValue: '',
                code: 'invalid_description',
              })
            : existingRow.description;
        const nextCity =
          city !== undefined
            ? validateRequiredText(city, {
                label: 'المدينة',
                minLength: INPUT_LIMITS.listingCityMin,
                maxLength: INPUT_LIMITS.listingCityMax,
                code: 'invalid_city',
              })
            : existingRow.city;

        let nextBreedId = existingRow.breedId;
        if (breedId !== undefined) {
          if (typeof breedId !== 'string') {
            throw new RepositoryError(400, 'السلالة المحددة غير صالحة', 'invalid_breed');
          }
          const [b] = await tx
            .select()
            .from(breeds)
            .where(eq(breeds.id, breedId.trim()))
            .limit(1);
          if (!b) throw new RepositoryError(400, 'السلالة المحددة غير صالحة', 'invalid_breed');
          nextBreedId = b.id;
        }

        let nextRegionId = existingRow.regionId;
        if (regionId !== undefined) {
          if (typeof regionId !== 'string') {
            throw new RepositoryError(400, 'المنطقة المحددة غير صالحة', 'invalid_region');
          }
          const [r] = await tx
            .select()
            .from(regions)
            .where(eq(regions.id, regionId.trim()))
            .limit(1);
          if (!r) throw new RepositoryError(400, 'المنطقة المحددة غير صالحة', 'invalid_region');
          nextRegionId = r.id;
        }

        const allCats = await tx.select().from(categories);
        let nextCategoryId = existingRow.categoryId;
        if (categoryId !== undefined) {
          if (
            typeof categoryId !== 'string' ||
            !allCats.some((c) => c.id === categoryId.trim() && c.parentId === null)
          ) {
            throw new RepositoryError(400, 'التصنيف الرئيسي المحدد غير صالح', 'invalid_category');
          }
          nextCategoryId = categoryId.trim();
        }

        let nextSex = existingRow.sex;
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
            : Number(existingRow.priceAmount);

        let nextExpectedPrice =
          existingRow.expectedPrice !== null ? Number(existingRow.expectedPrice) : null;
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
          nextExpectedPrice !== null &&
          nextExpectedPrice > nextPriceAmount
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
            : existingRow.ageMonths;
        const nextWeightKg =
          weightKg !== undefined
            ? parseFinitePositiveNumber(weightKg, {
                label: 'الوزن التقريبي',
                minInclusive: INPUT_LIMITS.listingWeightMin,
                max: INPUT_LIMITS.listingWeightMax,
                code: 'invalid_weight',
              })
            : Number(existingRow.weightKg);
        const nextQuantity =
          quantity !== undefined
            ? parsePositiveInteger(quantity, {
                label: 'الكمية',
                min: 1,
                max: INPUT_LIMITS.listingQuantityMax,
                code: 'invalid_quantity',
              })
            : existingRow.quantity;

        let nextSubCategoryId = existingRow.subCategoryId;
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
              allCats
            );
          } else if (subCategoryId === null || subCategoryId === '') {
            nextSubCategoryId = null;
          } else if (
            typeof subCategoryId === 'string' &&
            allCats.some((c) => c.id === subCategoryId.trim() && c.parentId !== null)
          ) {
            nextSubCategoryId = subCategoryId.trim();
          } else {
            throw new RepositoryError(400, 'الفئة الفرعية المحددة غير صالحة', 'invalid_subcategory');
          }
        }

        const nextVaccinated =
          vaccinated !== undefined ? Boolean(vaccinated) : existingRow.vaccinated;

        let nextImages: ListingImageRecord[] = existingHydrated.images;
        let nextVideo: ListingVideoRecord | null = existingHydrated.video ?? null;

        if (hasMediaPayload) {
          const [breed] = await tx
            .select()
            .from(breeds)
            .where(eq(breeds.id, nextBreedId))
            .limit(1);
          const fallbackUrl = breed?.imageUrl || IMG.naimi;

          const incomingImages =
            images !== undefined
              ? images
              : imageUrls !== undefined
              ? imageUrls
              : existingHydrated.images;
          const incomingVideo =
            video !== undefined
              ? video
              : videoMediaId !== undefined
              ? videoMediaId
              : existingHydrated.video;

          const resolvedMedia = await this.resolveListingMediaTx({
            tx,
            actorId: currentUser.id,
            actorIsAdmin: isAdmin(currentUser),
            targetListingId: existingRow.id,
            imageInputs: incomingImages,
            videoInput: incomingVideo,
            fallbackImageUrl: fallbackUrl,
          });

          // Unbind any media previously bound to this listing that are no longer referenced
          const boundArr = Array.from(resolvedMedia.boundMediaIds);
          if (boundArr.length > 0) {
            await tx
              .update(mediaAssets)
              .set({ listingId: null })
              .where(
                and(
                  eq(mediaAssets.listingId, existingRow.id),
                  sql`${mediaAssets.id} NOT IN (${sql.join(
                    boundArr.map((id) => sql`${id}`),
                    sql`, `
                  )})`
                )
              );
            await tx
              .update(mediaAssets)
              .set({ listingId: existingRow.id })
              .where(inArray(mediaAssets.id, boundArr));
          } else {
            await tx
              .update(mediaAssets)
              .set({ listingId: null })
              .where(eq(mediaAssets.listingId, existingRow.id));
          }

          await tx.delete(listingImages).where(eq(listingImages.listingId, existingRow.id));
          await tx.insert(listingImages).values(
            resolvedMedia.images.map((img) => ({
              id: img.id,
              listingId: existingRow.id,
              mediaId: img.mediaId ?? null,
              url: img.url,
              position: img.position,
            }))
          );

          await tx.delete(listingVideos).where(eq(listingVideos.listingId, existingRow.id));
          if (resolvedMedia.video) {
            await tx.insert(listingVideos).values({
              id: resolvedMedia.video.id,
              listingId: existingRow.id,
              mediaId: resolvedMedia.video.mediaId,
              url: resolvedMedia.video.url,
              mimeType: resolvedMedia.video.mimeType,
              sizeBytes: resolvedMedia.video.sizeBytes,
              originalName: resolvedMedia.video.originalName ?? null,
            });
          }

          nextImages = resolvedMedia.images;
          nextVideo = resolvedMedia.video;
        }

        const materialChanged = hasMaterialListingChanges(existingHydrated, {
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

        let nextRejectionReason = existingRow.rejectionReason ?? null;
        if (!isAdmin(currentUser)) {
          if (existingRow.status === 'Published' && materialChanged && nextStatus === 'Published') {
            nextStatus = 'Pending';
            nextRejectionReason = null;
          } else if (
            (existingRow.status === 'Rejected' || existingRow.status === 'Expired') &&
            status !== 'Draft'
          ) {
            nextStatus = 'Pending';
            nextRejectionReason = null;
          } else if (nextStatus === 'Pending') {
            nextRejectionReason = null;
          }
        } else if (nextStatus !== 'Rejected') {
          nextRejectionReason = null;
        }

        const { cityNorm, searchDoc } = await this.buildListingSearchColsTx(tx, {
          title: nextTitle,
          description: nextDescription,
          city: nextCity,
          breedId: nextBreedId,
          categoryId: nextCategoryId,
          subCategoryId: nextSubCategoryId,
          regionId: nextRegionId,
          sellerId: existingRow.sellerId,
        });

        const [updatedRow] = await tx
          .update(listings)
          .set({
            categoryId: nextCategoryId,
            subCategoryId: nextSubCategoryId,
            breedId: nextBreedId,
            regionId: nextRegionId,
            city: nextCity,
            cityNorm,
            title: nextTitle,
            description: nextDescription,
            searchDoc,
            priceAmount: String(nextPriceAmount),
            expectedPrice: nextExpectedPrice !== null ? String(nextExpectedPrice) : null,
            sex: nextSex,
            ageMonths: nextAgeMonths,
            weightKg: String(nextWeightKg),
            quantity: nextQuantity,
            isNegotiable:
              isNegotiable !== undefined ? Boolean(isNegotiable) : existingRow.isNegotiable,
            allowPriceOffers:
              allowPriceOffers !== undefined
                ? Boolean(allowPriceOffers)
                : existingRow.allowPriceOffers,
            vaccinated: nextVaccinated,
            status: nextStatus,
            rejectionReason: nextRejectionReason,
            updatedAt: new Date(),
          })
          .where(eq(listings.id, existingRow.id))
          .returning();

        const [hydrated] = await this.hydrateListingsBatch(tx, [updatedRow]);
        return {
          ...hydrated,
          ...(hasMediaPayload && nextVideo === null ? { video: null } : {}),
        };
      });
    } finally {
      hooks?.onDoneMediaIds?.(candidateMediaIds);
    }
  }

  async countUnboundMedia(uploaderId: string): Promise<number> {
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.uploaderId, uploaderId), isNull(mediaAssets.listingId)));
    return Number(count || 0);
  }

  async insertMediaAsset(asset: MediaAsset): Promise<void> {
    await this.db.insert(mediaAssets).values({
      id: asset.id,
      storageProvider: asset.storageProvider ?? 'local',
      bucket: asset.bucket ?? null,
      objectKey: asset.objectKey ?? asset.filename,
      filename: asset.filename,
      url: asset.url,
      kind: asset.kind,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      sha256Hex: asset.sha256Hex ?? null,
      originalName: asset.originalName,
      uploaderId: asset.uploaderId,
      listingId: asset.listingId ?? null,
      createdAt: new Date(asset.createdAt),
    });
  }

  async getMediaAssetForViewer(mediaId: string, viewer: any | null) {
    const [assetRow] = await this.db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, mediaId))
      .limit(1);
    if (!assetRow) return null;

    let isPublished = false;
    if (assetRow.listingId) {
      const [listing] = await this.db
        .select()
        .from(listings)
        .where(eq(listings.id, assetRow.listingId))
        .limit(1);
      if (!listing || !canViewListing(viewer, listing)) return null;
      if (!isAdmin(viewer)) {
        const [sellerUser] = await this.db
          .select({ status: users.status })
          .from(users)
          .where(eq(users.id, listing.sellerId))
          .limit(1);
        if (!sellerUser || sellerUser.status === 'suspended') return null;
      }
      isPublished = listing.status === 'Published';
    } else if (!viewer || (assetRow.uploaderId !== viewer.id && !isAdmin(viewer))) {
      return null;
    }

    return { asset: mapDbMediaAsset(assetRow), isPublished };
  }

  async deleteMediaAsset(
    currentUser: any,
    mediaId: string,
    mediaTarget: string | MediaStorageAdapter
  ): Promise<void> {
    const deletedRef = await this.db.transaction(async (tx) => {
      const [asset] = await tx
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.id, mediaId))
        .for('update');
      if (!asset) {
        throw new RepositoryError(404, 'الملف غير موجود');
      }
      if (asset.uploaderId !== currentUser.id && !isAdmin(currentUser)) {
        throw new RepositoryError(403, 'غير مصرح لك بحذف هذا الملف');
      }

      if (asset.listingId) {
        const [listing] = await tx
          .select()
          .from(listings)
          .where(eq(listings.id, asset.listingId))
          .for('update');
        if (listing) {
          if (!canEditListing(currentUser, listing)) {
            throw new RepositoryError(403, 'غير مصرح لك بتعديل وسائط هذا الإعلان');
          }

          const currentImgs = await tx
            .select()
            .from(listingImages)
            .where(eq(listingImages.listingId, listing.id))
            .orderBy(asc(listingImages.position));
          const remaining = currentImgs.filter(
            (img) => img.mediaId !== asset.id && img.url !== asset.url
          );

          await tx.delete(listingImages).where(eq(listingImages.listingId, listing.id));
          if (remaining.length > 0) {
            await tx.insert(listingImages).values(
              remaining.map((img, i) => ({
                id: img.id,
                listingId: listing.id,
                mediaId: img.mediaId,
                url: img.url,
                position: i + 1,
              }))
            );
          } else {
            const [breed] = await tx
              .select({ imageUrl: breeds.imageUrl })
              .from(breeds)
              .where(eq(breeds.id, listing.breedId))
              .limit(1);
            await tx.insert(listingImages).values({
              id: `img_${crypto.randomUUID().slice(0, 6)}`,
              listingId: listing.id,
              mediaId: null,
              url: breed?.imageUrl || IMG.naimi,
              position: 1,
            });
          }

          await tx
            .delete(listingVideos)
            .where(and(eq(listingVideos.listingId, listing.id), eq(listingVideos.mediaId, asset.id)));

          const shouldRevert =
            !isAdmin(currentUser) &&
            (listing.status === 'Published' ||
              listing.status === 'Rejected' ||
              listing.status === 'Expired');
          await tx
            .update(listings)
            .set({
              status: shouldRevert ? 'Pending' : listing.status,
              rejectionReason: shouldRevert ? null : listing.rejectionReason,
              updatedAt: new Date(),
            })
            .where(eq(listings.id, listing.id));
        }
      }

      await tx.delete(mediaAssets).where(eq(mediaAssets.id, asset.id));
      return {
        filename: asset.filename,
        storageProvider: (asset.storageProvider as MediaStorageProvider) || 'local',
        bucket: asset.bucket ?? null,
        objectKey: asset.objectKey || asset.filename,
      };
    });

    const storage = resolveAdapterFromTarget(mediaTarget);
    try {
      await storage.deleteObject(resolveAssetObjectRef(deletedRef));
    } catch (err) {
      console.error(`[media] Failed to delete object for media ${mediaId}:`, err);
    }
  }

  async cleanupOrphanedMedia(
    mediaTarget: string | MediaStorageAdapter,
    ttlMs: number,
    nowMs = Date.now(),
    protectedMediaIds?: Set<string>
  ): Promise<string[]> {
    const storage = resolveAdapterFromTarget(mediaTarget);
    const cutoff = new Date(nowMs - ttlMs);
    const expiredCandidates = await this.db
      .select()
      .from(mediaAssets)
      .where(and(isNull(mediaAssets.listingId), lte(mediaAssets.createdAt, cutoff)));

    const removedIds: string[] = [];
    for (const asset of expiredCandidates) {
      if (protectedMediaIds?.has(asset.id)) continue;
      const [imgRef] = await this.db
        .select({ id: listingImages.id })
        .from(listingImages)
        .where(eq(listingImages.mediaId, asset.id))
        .limit(1);
      if (imgRef) continue;
      const [vidRef] = await this.db
        .select({ id: listingVideos.id })
        .from(listingVideos)
        .where(eq(listingVideos.mediaId, asset.id))
        .limit(1);
      if (vidRef) continue;

      const deleted = await this.db
        .delete(mediaAssets)
        .where(and(eq(mediaAssets.id, asset.id), isNull(mediaAssets.listingId)))
        .returning({
          filename: mediaAssets.filename,
          storageProvider: mediaAssets.storageProvider,
          bucket: mediaAssets.bucket,
          objectKey: mediaAssets.objectKey,
        });
      if (deleted.length > 0) {
        const ref = resolveAssetObjectRef({
          filename: deleted[0].filename,
          storageProvider: (deleted[0].storageProvider as MediaStorageProvider) || 'local',
          bucket: deleted[0].bucket ?? null,
          objectKey: deleted[0].objectKey || deleted[0].filename,
        });
        try {
          await storage.deleteObject(ref);
        } catch (err) {
          console.error(`[media] Failed to delete orphaned media object ${asset.id}:`, err);
        }
        removedIds.push(asset.id);
      }
    }
    return removedIds;
  }

  // ---- Favorites & Likes ----

  async toggleFavorite(currentUser: any, listingId: string) {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(listingFavorites)
        .where(
          and(eq(listingFavorites.userId, currentUser.id), eq(listingFavorites.listingId, listingId))
        )
        .limit(1);

      if (existing) {
        await tx
          .delete(listingFavorites)
          .where(
            and(
              eq(listingFavorites.userId, currentUser.id),
              eq(listingFavorites.listingId, listingId)
            )
          );
      } else {
        const [listing] = await tx
          .select()
          .from(listings)
          .where(eq(listings.id, listingId))
          .limit(1);
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
        const [sellerUser] = await tx
          .select({ status: users.status })
          .from(users)
          .where(eq(users.id, listing.sellerId))
          .limit(1);
        if (!sellerUser || sellerUser.status === 'suspended') {
          throw new RepositoryError(
            403,
            'هذا الحساب موقوف حالياً ولا يمكن حفظ إعلانه في المفضلة',
            'seller_suspended'
          );
        }
        await tx
          .insert(listingFavorites)
          .values({ userId: currentUser.id, listingId, createdAt: new Date() })
          .onConflictDoNothing();
      }

      const favRows = await tx
        .select({ listingId: listingFavorites.listingId })
        .from(listingFavorites)
        .where(eq(listingFavorites.userId, currentUser.id))
        .orderBy(asc(listingFavorites.createdAt));

      return {
        favoriteIds: favRows.map((r) => r.listingId),
        isFavorite: !existing,
      };
    });
  }

  async getListingLikes(listingId: string, viewer: any | null) {
    const [listing] = await this.db
      .select()
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);
    if (!listing || !canViewListing(viewer, listing)) return null;
    if (!isAdmin(viewer)) {
      const [sellerUser] = await this.db
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, listing.sellerId))
        .limit(1);
      if (!sellerUser || sellerUser.status === 'suspended') return null;
    }

    const likesEnabled = listing.status === 'Published';
    let isLiked = false;
    if (likesEnabled && viewer) {
      const [liked] = await this.db
        .select({ userId: listingLikes.userId })
        .from(listingLikes)
        .where(and(eq(listingLikes.listingId, listing.id), eq(listingLikes.userId, viewer.id)))
        .limit(1);
      isLiked = Boolean(liked);
    }

    return {
      listingId: listing.id,
      likesCount: likesEnabled ? listing.likesCount : 0,
      isLiked,
      likesEnabled,
    };
  }

  async mutateListingLike(currentUser: any, listingId: string, action: LikeAction) {
    return this.db.transaction(async (tx) => {
      const [listing] = await tx
        .select()
        .from(listings)
        .where(eq(listings.id, listingId))
        .for('update');
      if (!listing || !canViewListing(currentUser, listing)) {
        throw new RepositoryError(404, 'الإعلان غير موجود');
      }
      if (!canLikeListing(currentUser, listing)) {
        throw new RepositoryError(403, 'الإعجاب متاح فقط للإعلانات المنشورة');
      }
      const [sellerUser] = await tx
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, listing.sellerId))
        .limit(1);
      if (!sellerUser || sellerUser.status === 'suspended') {
        throw new RepositoryError(
          403,
          'هذا الحساب موقوف حالياً ولا يمكن التفاعل مع إعلاناته',
          'seller_suspended'
        );
      }

      const [existingLike] = await tx
        .select()
        .from(listingLikes)
        .where(and(eq(listingLikes.listingId, listing.id), eq(listingLikes.userId, currentUser.id)))
        .limit(1);

      const currentlyLiked = Boolean(existingLike);
      const shouldLike =
        action === 'like' ? true : action === 'unlike' ? false : !currentlyLiked;
      const changed = shouldLike !== currentlyLiked;

      let likesCount = listing.likesCount;
      let sellerNotification: { userId: string; notification: any } | undefined;

      if (changed) {
        if (shouldLike) {
          await tx
            .insert(listingLikes)
            .values({ listingId: listing.id, userId: currentUser.id, createdAt: new Date() })
            .onConflictDoNothing();
        } else {
          await tx
            .delete(listingLikes)
            .where(
              and(eq(listingLikes.listingId, listing.id), eq(listingLikes.userId, currentUser.id))
            );
        }

        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(listingLikes)
          .where(eq(listingLikes.listingId, listing.id));
        likesCount = Number(count || 0);
        await tx
          .update(listings)
          .set({ likesCount })
          .where(eq(listings.id, listing.id));

        if (shouldLike && listing.sellerId !== currentUser.id) {
          const [cooldown] = await tx
            .select()
            .from(likeNotificationCooldowns)
            .where(
              and(
                eq(likeNotificationCooldowns.listingId, listing.id),
                eq(likeNotificationCooldowns.actorId, currentUser.id)
              )
            )
            .limit(1);

          const nowMs = Date.now();
          const shouldNotify =
            !cooldown || nowMs - cooldown.lastNotifiedAt.getTime() >= LIKE_NOTIFICATION_COOLDOWN_MS;
          if (shouldNotify) {
            const nowDate = new Date(nowMs);
            await tx
              .insert(likeNotificationCooldowns)
              .values({
                listingId: listing.id,
                actorId: currentUser.id,
                lastNotifiedAt: nowDate,
              })
              .onConflictDoUpdate({
                target: [likeNotificationCooldowns.listingId, likeNotificationCooldowns.actorId],
                set: { lastNotifiedAt: nowDate },
              });

            const notification = await this.insertNotificationTx(tx, {
              userId: listing.sellerId,
              type: 'listing_liked',
              title: `إعجاب جديد من ${currentUser.name}`,
              body: `أعجب ${currentUser.name} بإعلانك «${listing.title}» (إجمالي الإعجابات: ${likesCount})`,
              listingId: listing.id,
            });
            sellerNotification = { userId: listing.sellerId, notification };
          }
        }
      }

      const likedRows = await tx
        .select({ listingId: listingLikes.listingId })
        .from(listingLikes)
        .innerJoin(listings, eq(listingLikes.listingId, listings.id))
        .where(and(eq(listingLikes.userId, currentUser.id), eq(listings.status, 'Published')));

      return {
        listingId: listing.id,
        likesCount,
        isLiked: shouldLike,
        likedListingIds: likedRows.map((r) => r.listingId),
        changed,
        sellerNotification,
      };
    });
  }

  // ---- Comments ----

  async getListingComments(
    listingId: string,
    viewer: any | null,
    opts: { limit?: number; offset?: number }
  ) {
    const [listing] = await this.db
      .select()
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);
    if (!listing || !canViewListing(viewer, listing)) return null;
    if (!isAdmin(viewer)) {
      const [sellerUser] = await this.db
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, listing.sellerId))
        .limit(1);
      if (!sellerUser || sellerUser.status === 'suspended') return null;
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

    const commentRows = await this.db
      .select()
      .from(listingComments)
      .where(eq(listingComments.listingId, listing.id));
    const authorIds = Array.from(new Set(commentRows.map((c) => c.authorId)));
    const [authorUsers, sellerRow] = await Promise.all([
      authorIds.length > 0
        ? this.db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(inArray(users.id, authorIds))
        : Promise.resolve([]),
      this.db
        .select()
        .from(sellerProfiles)
        .where(eq(sellerProfiles.userId, listing.sellerId))
        .limit(1),
    ]);

    const result = paginateListingThreads({
      comments: commentRows.map(mapDbComment),
      listing,
      users: authorUsers,
      sellers: sellerRow.map(mapDbSeller),
      limit: opts.limit,
      offset: opts.offset,
    });

    return {
      ...result,
      commentsEnabled: true,
    };
  }

  async createComment(currentUser: any, listingId: string, bodyRaw: unknown, parentIdRaw: unknown) {
    const cleanBody = normalizeAndValidateCommentBody(bodyRaw);
    const parentId =
      typeof parentIdRaw === 'string' && parentIdRaw.trim() ? parentIdRaw.trim() : null;

    return this.db.transaction(async (tx) => {
      const [listing] = await tx
        .select()
        .from(listings)
        .where(eq(listings.id, listingId))
        .limit(1);
      if (!listing || !canViewListing(currentUser, listing)) {
        throw new RepositoryError(404, 'الإعلان غير موجود');
      }
      if (!canViewListingComments(listing)) {
        throw new RepositoryError(403, 'الأسئلة والتعليقات متاحة فقط على الإعلانات المنشورة');
      }
      const [sellerUser] = await tx
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, listing.sellerId))
        .limit(1);
      if (!sellerUser || sellerUser.status === 'suspended') {
        throw new RepositoryError(
          403,
          'هذا الحساب موقوف حالياً ولا يمكن التعليق على إعلاناته',
          'seller_suspended'
        );
      }

      let parentComment: typeof listingComments.$inferSelect | undefined;
      if (parentId !== null) {
        if (!canReplyToListingComment(currentUser, listing)) {
          throw new RepositoryError(403, 'فقط صاحب الإعلان يمكنه الرد مباشرة على الأسئلة', 'forbidden');
        }
        const [p] = await tx
          .select()
          .from(listingComments)
          .where(and(eq(listingComments.id, parentId), eq(listingComments.listingId, listing.id)))
          .limit(1);
        if (!p) throw new RepositoryError(404, 'التعليق الأساسي غير موجود');
        if (p.parentId !== null) {
          throw new RepositoryError(400, 'لا يمكن الرد على رد؛ يرجى الرد على السؤال الأساسي');
        }
        parentComment = p;
      }

      const cooldownCutoff = new Date(Date.now() - DUPLICATE_COMMENT_COOLDOWN_MS);
      const recentSame = await tx
        .select({ body: listingComments.body })
        .from(listingComments)
        .where(
          and(
            eq(listingComments.listingId, listing.id),
            eq(listingComments.authorId, currentUser.id),
            parentId === null
              ? isNull(listingComments.parentId)
              : eq(listingComments.parentId, parentId),
            gte(listingComments.createdAt, cooldownCutoff)
          )
        );
      const targetBody = cleanBody.trim().toLowerCase();
      if (recentSame.some((r) => r.body.trim().toLowerCase() === targetBody)) {
        throw new RepositoryError(400, 'تم إرسال هذا التعليق بالفعل قبل قليل');
      }

      const now = new Date();
      const [inserted] = await tx
        .insert(listingComments)
        .values({
          id: `cmt_${crypto.randomUUID().slice(0, 8)}`,
          listingId: listing.id,
          parentId,
          authorId: currentUser.id,
          authorName: currentUser.name,
          body: cleanBody,
          isEdited: false,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      let notifyUserId: string | undefined;
      let notification: any;
      const sellerRows = await tx
        .select()
        .from(sellerProfiles)
        .where(eq(sellerProfiles.userId, listing.sellerId))
        .limit(1);

      if (parentId === null && currentUser.id !== listing.sellerId) {
        notification = await this.insertNotificationTx(tx, {
          userId: listing.sellerId,
          type: 'new_comment',
          title: `سؤال جديد من ${currentUser.name}`,
          body: `على إعلان «${listing.title}»: ${cleanBody.slice(0, 90)}`,
          listingId: listing.id,
          commentId: inserted.id,
        });
        notifyUserId = listing.sellerId;
      } else if (parentComment && parentComment.authorId !== currentUser.id) {
        const sellerLabel = sellerRows[0]?.displayName || currentUser.name;
        notification = await this.insertNotificationTx(tx, {
          userId: parentComment.authorId,
          type: 'comment_reply',
          title: `رد ${sellerLabel} على سؤالك`,
          body: `على إعلان «${listing.title}»: ${cleanBody.slice(0, 90)}`,
          listingId: listing.id,
          commentId: inserted.id,
        });
        notifyUserId = parentComment.authorId;
      }

      return {
        comment: toPublicComment(
          mapDbComment(inserted),
          listing,
          [{ id: currentUser.id, name: currentUser.name }],
          sellerRows.map(mapDbSeller)
        ),
        notifyUserId,
        notification,
      };
    });
  }

  async updateComment(currentUser: any, commentId: string, bodyRaw: unknown) {
    const cleanBody = normalizeAndValidateCommentBody(bodyRaw);
    return this.db.transaction(async (tx) => {
      const [comment] = await tx
        .select()
        .from(listingComments)
        .where(eq(listingComments.id, commentId))
        .for('update');
      if (!comment) throw new RepositoryError(404, 'التعليق غير موجود');

      const [listing] = await tx
        .select()
        .from(listings)
        .where(eq(listings.id, comment.listingId))
        .limit(1);
      if (!listing || !canViewListing(currentUser, listing)) {
        throw new RepositoryError(404, 'التعليق غير موجود');
      }
      if (!canViewListingComments(listing)) {
        throw new RepositoryError(403, 'لا يمكن تعديل تعليقات إعلان غير منشور');
      }
      if (!canEditComment(currentUser, comment, listing)) {
        throw new RepositoryError(403, 'غير مصرح لك بتعديل هذا التعليق');
      }

      const [updated] = await tx
        .update(listingComments)
        .set({ body: cleanBody, isEdited: true, updatedAt: new Date() })
        .where(eq(listingComments.id, comment.id))
        .returning();

      const authorUser = await tx
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.id, updated.authorId))
        .limit(1);
      const sellerRows = await tx
        .select()
        .from(sellerProfiles)
        .where(eq(sellerProfiles.userId, listing.sellerId))
        .limit(1);

      return {
        comment: toPublicComment(
          mapDbComment(updated),
          listing,
          authorUser,
          sellerRows.map(mapDbSeller)
        ),
      };
    });
  }

  async deleteComment(currentUser: any, commentId: string, reasonRaw: unknown) {
    const reason = validateOptionalText(reasonRaw, {
      label: 'سبب الحذف',
      maxLength: 300,
      defaultValue: '',
    });

    return this.db.transaction(async (tx) => {
      const [comment] = await tx
        .select()
        .from(listingComments)
        .where(eq(listingComments.id, commentId))
        .for('update');
      if (!comment) throw new RepositoryError(404, 'التعليق غير موجود');

      const [listing] = await tx
        .select()
        .from(listings)
        .where(eq(listings.id, comment.listingId))
        .limit(1);
      if (!listing || !canViewListing(currentUser, listing)) {
        throw new RepositoryError(404, 'التعليق غير موجود');
      }
      if (!canDeleteComment(currentUser, comment)) {
        throw new RepositoryError(403, 'غير مصرح لك بحذف هذا التعليق');
      }

      const replyRows = await tx
        .select({ id: listingComments.id })
        .from(listingComments)
        .where(eq(listingComments.parentId, comment.id));
      const deletedIds = [comment.id, ...replyRows.map((r) => r.id)];

      if (isAdmin(currentUser) && comment.authorId !== currentUser.id) {
        const now = new Date();
        await tx
          .update(reports)
          .set({
            status: 'resolved',
            resolvedAt: now,
            resolvedBy: currentUser.id,
            resolutionNote: reason || 'تمت إزالة التعليق المخالف',
          })
          .where(and(eq(reports.status, 'open'), inArray(reports.commentId, deletedIds)));

        const auditEntry = createAuditLogEntry({
          actorId: currentUser.id,
          actorName: currentUser.name,
          action: 'إزالة تعليق مخالف',
          targetType: 'comment',
          targetId: comment.id,
          note: reason || comment.body.slice(0, 90),
          createdAt: now.toISOString(),
        });
        await tx.insert(auditLogs).values({
          id: auditEntry.id,
          actorId: auditEntry.actorId,
          actorName: auditEntry.actorName,
          action: auditEntry.action,
          targetType: auditEntry.targetType,
          targetId: auditEntry.targetId,
          note: auditEntry.note ?? null,
          createdAt: now,
        });
      }

      await tx.delete(listingComments).where(inArray(listingComments.id, deletedIds));
      return { ok: true as const, deletedIds };
    });
  }

  // ---- Conversations & messages ----

  async startConversation(currentUser: any, rawListingId: unknown, initialMessage: unknown) {
    if (typeof rawListingId !== 'string' || !rawListingId.trim()) {
      throw new RepositoryError(400, 'معرف الإعلان مطلوب');
    }
    const listingId = rawListingId.trim();
    const cleanInitial = validateOptionalText(initialMessage, {
      label: 'نص الرسالة',
      maxLength: INPUT_LIMITS.messageBodyMax,
      allowNewlines: true,
      defaultValue: '',
      code: 'invalid_message_body',
    });

    return this.db.transaction(async (tx) => {
      const [listing] = await tx
        .select()
        .from(listings)
        .where(eq(listings.id, listingId))
        .limit(1);
      if (!listing || !canViewListing(currentUser, listing)) {
        throw new RepositoryError(404, 'الإعلان غير موجود');
      }
      if (listing.sellerId === currentUser.id) {
        throw new RepositoryError(400, 'لا يمكنك بدء محادثة على إعلانك الخاص');
      }
      if (listing.status !== 'Published') {
        throw new RepositoryError(
          400,
          'لا يمكن بدء محادثة على إعلان غير منشور',
          'listing_not_published'
        );
      }
      const [sellerUser] = await tx
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, listing.sellerId))
        .limit(1);
      if (!sellerUser || sellerUser.status === 'suspended') {
        throw new RepositoryError(403, 'لا يمكن التواصل مع هذا الحساب حالياً', 'seller_suspended');
      }

      const now = new Date();
      await tx
        .insert(conversations)
        .values({
          id: `conv_${crypto.randomUUID().slice(0, 6)}`,
          listingId,
          buyerId: currentUser.id,
          sellerId: listing.sellerId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: [conversations.listingId, conversations.buyerId] });

      const [conv] = await tx
        .select()
        .from(conversations)
        .where(and(eq(conversations.listingId, listingId), eq(conversations.buyerId, currentUser.id)))
        .for('update');

      await tx
        .insert(conversationReadStates)
        .values({ conversationId: conv.id, userId: currentUser.id, lastReadAt: now })
        .onConflictDoUpdate({
          target: [conversationReadStates.conversationId, conversationReadStates.userId],
          set: { lastReadAt: now },
        });

      let recipientId: string | undefined;
      let recipientConversation: any;
      let notification: any;

      if (cleanInitial) {
        const msgNow = new Date();
        await tx.insert(messages).values({
          id: `msg_${crypto.randomUUID().slice(0, 6)}`,
          conversationId: conv.id,
          senderId: currentUser.id,
          body: cleanInitial,
          createdAt: msgNow,
        });
        await tx
          .update(conversations)
          .set({ updatedAt: msgNow })
          .where(eq(conversations.id, conv.id));
        conv.updatedAt = msgNow;

        await tx
          .insert(conversationReadStates)
          .values({ conversationId: conv.id, userId: currentUser.id, lastReadAt: msgNow })
          .onConflictDoUpdate({
            target: [conversationReadStates.conversationId, conversationReadStates.userId],
            set: { lastReadAt: msgNow },
          });

        await tx
          .update(notifications)
          .set({ isRead: true })
          .where(
            and(
              eq(notifications.userId, currentUser.id),
              eq(notifications.type, 'new_message'),
              eq(notifications.conversationId, conv.id),
              eq(notifications.isRead, false)
            )
          );

        const otherId = currentUser.id === conv.buyerId ? conv.sellerId : conv.buyerId;
        if (otherId && otherId !== currentUser.id) {
          recipientId = otherId;
          notification = await this.insertNotificationTx(tx, {
            userId: otherId,
            type: 'new_message',
            title: `رسالة جديدة من ${currentUser.name}`,
            body: cleanInitial.slice(0, 90),
            listingId: conv.listingId,
            conversationId: conv.id,
          });
          const [recConv] = await this.serializeConversationsForUser(tx, [conv], otherId);
          recipientConversation = recConv;
        }
      }

      const [viewerConv] = await this.serializeConversationsForUser(tx, [conv], currentUser.id);
      return {
        conversation: viewerConv,
        recipientId,
        recipientConversation,
        notification,
      };
    });
  }

  async sendMessage(currentUser: any, conversationId: string, bodyRaw: unknown) {
    const cleanBody = validateRequiredText(bodyRaw, {
      label: 'نص الرسالة',
      minLength: INPUT_LIMITS.messageBodyMin,
      maxLength: INPUT_LIMITS.messageBodyMax,
      allowNewlines: true,
      code: 'invalid_message_body',
    });

    return this.db.transaction(async (tx) => {
      const [conv] = await tx
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .for('update');
      if (!conv) throw new RepositoryError(404, 'المحادثة غير موجودة');
      if (!canAccessConversation(currentUser, conv)) {
        throw new RepositoryError(403, 'غير مصرح لك بالوصول لهذه المحادثة');
      }

      const otherId = currentUser.id === conv.buyerId ? conv.sellerId : conv.buyerId;
      if (otherId) {
        const [otherUser] = await tx
          .select({ status: users.status })
          .from(users)
          .where(eq(users.id, otherId))
          .limit(1);
        if (!otherUser || otherUser.status === 'suspended') {
          throw new RepositoryError(
            403,
            'لا يمكن إرسال رسائل لهذا الحساب لأنه موقوف حالياً',
            'seller_suspended'
          );
        }
      }

      const now = new Date();
      const [insertedMsg] = await tx
        .insert(messages)
        .values({
          id: `msg_${crypto.randomUUID().slice(0, 6)}`,
          conversationId: conv.id,
          senderId: currentUser.id,
          body: cleanBody,
          createdAt: now,
        })
        .returning();

      await tx.update(conversations).set({ updatedAt: now }).where(eq(conversations.id, conv.id));
      conv.updatedAt = now;

      await tx
        .insert(conversationReadStates)
        .values({ conversationId: conv.id, userId: currentUser.id, lastReadAt: now })
        .onConflictDoUpdate({
          target: [conversationReadStates.conversationId, conversationReadStates.userId],
          set: { lastReadAt: now },
        });

      await tx
        .update(notifications)
        .set({ isRead: true })
        .where(
          and(
            eq(notifications.userId, currentUser.id),
            eq(notifications.type, 'new_message'),
            eq(notifications.conversationId, conv.id),
            eq(notifications.isRead, false)
          )
        );

      let recipientId: string | undefined;
      let recipientConversation: any;
      let notification: any;
      if (otherId && otherId !== currentUser.id) {
        recipientId = otherId;
        notification = await this.insertNotificationTx(tx, {
          userId: otherId,
          type: 'new_message',
          title: `رسالة جديدة من ${currentUser.name}`,
          body: cleanBody.slice(0, 90),
          listingId: conv.listingId,
          conversationId: conv.id,
        });
        const [recConv] = await this.serializeConversationsForUser(tx, [conv], otherId);
        recipientConversation = recConv;
      }

      const [viewerConv] = await this.serializeConversationsForUser(tx, [conv], currentUser.id);
      return {
        message: {
          id: insertedMsg.id,
          conversationId: insertedMsg.conversationId,
          senderId: insertedMsg.senderId,
          body: insertedMsg.body,
          createdAt: toIsoRequired(insertedMsg.createdAt),
        },
        conversation: viewerConv,
        recipientId,
        recipientConversation,
        notification,
      };
    });
  }

  async markConversationRead(currentUser: any, conversationId: string) {
    return this.db.transaction(async (tx) => {
      const [conv] = await tx
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);
      if (!conv) throw new RepositoryError(404, 'المحادثة غير موجودة');
      if (!canAccessConversation(currentUser, conv)) {
        throw new RepositoryError(403, 'غير مصرح لك بالوصول لهذه المحادثة');
      }

      const now = new Date();
      await tx
        .insert(conversationReadStates)
        .values({ conversationId: conv.id, userId: currentUser.id, lastReadAt: now })
        .onConflictDoUpdate({
          target: [conversationReadStates.conversationId, conversationReadStates.userId],
          set: { lastReadAt: now },
        });

      const marked = await tx
        .update(notifications)
        .set({ isRead: true })
        .where(
          and(
            eq(notifications.userId, currentUser.id),
            eq(notifications.type, 'new_message'),
            eq(notifications.conversationId, conv.id),
            eq(notifications.isRead, false)
          )
        )
        .returning({ id: notifications.id });

      const [viewerConv] = await this.serializeConversationsForUser(tx, [conv], currentUser.id);
      let userNotifs: any[] | undefined;
      if (marked.length > 0) {
        const rows = await tx
          .select()
          .from(notifications)
          .where(eq(notifications.userId, currentUser.id))
          .orderBy(desc(notifications.createdAt));
        userNotifs = rows.map(mapDbNotification);
      }

      return {
        conversation: viewerConv,
        notificationsUpdatedUserId: marked.length > 0 ? currentUser.id : undefined,
        notifications: userNotifs,
      };
    });
  }

  // ---- Price offers ----

  async createOffer(currentUser: any, listingId: string, body: any) {
    return this.db.transaction(async (tx) => {
      const [listing] = await tx
        .select()
        .from(listings)
        .where(eq(listings.id, listingId))
        .limit(1);
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
      const [sellerUser] = await tx
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, listing.sellerId))
        .limit(1);
      if (!sellerUser || sellerUser.status === 'suspended') {
        throw new RepositoryError(403, 'لا يمكن تقديم عروض لهذا الحساب حالياً', 'seller_suspended');
      }

      const offersAllowed = listing.allowPriceOffers;
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

      const now = new Date();
      const [insertedOffer] = await tx
        .insert(priceOffers)
        .values({
          id: `off_${crypto.randomUUID().slice(0, 6)}`,
          listingId: listing.id,
          buyerId: currentUser.id,
          buyerName: currentUser.name,
          sellerId: listing.sellerId,
          offeredPrice: String(offeredPrice),
          quantity,
          note,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await tx
        .insert(conversations)
        .values({
          id: `conv_${crypto.randomUUID().slice(0, 6)}`,
          listingId: listing.id,
          buyerId: currentUser.id,
          sellerId: listing.sellerId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: [conversations.listingId, conversations.buyerId] });

      const [conv] = await tx
        .select()
        .from(conversations)
        .where(and(eq(conversations.listingId, listing.id), eq(conversations.buyerId, currentUser.id)))
        .for('update');

      const offerMsgBody = `تقديم عرض سعر جديد: ${offeredPrice.toLocaleString('en-US')} ر.س للرأس (الكمية: ${quantity})${note ? ` — ${note}` : ''}`;
      await tx.insert(messages).values({
        id: `msg_${crypto.randomUUID().slice(0, 6)}`,
        conversationId: conv.id,
        senderId: currentUser.id,
        body: offerMsgBody,
        createdAt: now,
      });
      await tx.update(conversations).set({ updatedAt: now }).where(eq(conversations.id, conv.id));
      conv.updatedAt = now;

      await tx
        .insert(conversationReadStates)
        .values({ conversationId: conv.id, userId: currentUser.id, lastReadAt: now })
        .onConflictDoUpdate({
          target: [conversationReadStates.conversationId, conversationReadStates.userId],
          set: { lastReadAt: now },
        });

      let recipientId: string | undefined;
      let recipientConversation: any;
      let notification: any;
      if (listing.sellerId !== currentUser.id) {
        recipientId = listing.sellerId;
        notification = await this.insertNotificationTx(tx, {
          userId: listing.sellerId,
          type: 'new_message',
          title: `عرض سعر ورسالة جديدة من ${currentUser.name}`,
          body: offerMsgBody,
          listingId: listing.id,
          conversationId: conv.id,
        });
        const [recConv] = await this.serializeConversationsForUser(tx, [conv], listing.sellerId);
        recipientConversation = recConv;
      }

      return {
        offer: mapDbPriceOffer(insertedOffer),
        recipientId,
        recipientConversation,
        notification,
      };
    });
  }

  async respondToOffer(currentUser: any, offerId: string, rawStatus: unknown) {
    return this.db.transaction(async (tx) => {
      const [offer] = await tx
        .select()
        .from(priceOffers)
        .where(eq(priceOffers.id, offerId))
        .for('update');
      if (!offer) throw new RepositoryError(404, 'عرض السعر غير موجود');
      if (!canRespondToOffer(currentUser, offer)) {
        throw new RepositoryError(403, 'صلاحية البائع مطلوبة للرد على عرض السعر');
      }
      if (rawStatus !== 'accepted' && rawStatus !== 'rejected') {
        throw new RepositoryError(400, 'حالة الرد على العرض يجب أن تكون accepted أو rejected');
      }

      const now = new Date();
      const [updatedOffer] = await tx
        .update(priceOffers)
        .set({ status: rawStatus, updatedAt: now })
        .where(eq(priceOffers.id, offer.id))
        .returning();

      const [listing] = await tx
        .select({ title: listings.title })
        .from(listings)
        .where(eq(listings.id, offer.listingId))
        .limit(1);
      const listingTitle = listing?.title || 'الإعلان';

      const notification =
        rawStatus === 'accepted'
          ? await this.insertNotificationTx(tx, {
              userId: offer.buyerId,
              type: 'offer_accepted',
              title: 'تم قبول عرض السعر الخاص بك',
              body: `وافق المربي على عرضك بقيمة ${Number(offer.offeredPrice).toLocaleString('en-US')} ر.س على إعلان «${listingTitle}».`,
              listingId: offer.listingId,
            })
          : await this.insertNotificationTx(tx, {
              userId: offer.buyerId,
              type: 'offer_rejected',
              title: 'تحديث على عرض السعر',
              body: `تم الاعتذار عن عرضك على إعلان «${listingTitle}». يمكنك تقديم عرض جديد أو التواصل مع المربي.`,
              listingId: offer.listingId,
            });

      if (isAdmin(currentUser)) {
        await tx.insert(auditLogs).values({
          id: `aud_${crypto.randomUUID().slice(0, 6)}`,
          actorId: currentUser.id,
          actorName: currentUser.name,
          action: rawStatus === 'accepted' ? 'قبول عرض سعر' : 'رفض عرض سعر',
          targetType: 'offer',
          targetId: offer.id,
          note: `${Number(offer.offeredPrice)} ر.س`,
          createdAt: now,
        });
      }

      return {
        offer: mapDbPriceOffer(updatedOffer),
        buyerNotification: { userId: offer.buyerId, notification },
      };
    });
  }

  // ---- Seller reviews, verification & reports ----

  async getSellerReviews(
    sellerId: string,
    viewer: any | null,
    opts: { limit: number; offset: number }
  ) {
    const [sellerRow] = await this.db
      .select()
      .from(sellerProfiles)
      .where(eq(sellerProfiles.userId, sellerId))
      .limit(1);
    if (!sellerRow) return null;

    if (!isAdmin(viewer)) {
      const [sellerUser] = await this.db
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, sellerId))
        .limit(1);
      if (!sellerUser || sellerUser.status === 'suspended') return null;
    }

    const allReviews = await this.db
      .select()
      .from(sellerReviews)
      .where(eq(sellerReviews.sellerId, sellerId))
      .orderBy(desc(sellerReviews.updatedAt), desc(sellerReviews.createdAt));

    const ratingBreakdown: Record<1 | 2 | 3 | 4 | 5, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let ratingSum = 0;
    for (const rev of allReviews) {
      const stars = Number(rev.rating) as 1 | 2 | 3 | 4 | 5;
      if (stars >= 1 && stars <= 5) {
        ratingBreakdown[stars] += 1;
        ratingSum += stars;
      }
    }

    const mapped = allReviews.map(mapDbReview);
    const totalCount = mapped.length;
    const averageRating =
      totalCount > 0 ? Math.round((ratingSum / totalCount) * 10) / 10 : Number(sellerRow.rating) || 0;
    const paged = mapped.slice(opts.offset, opts.offset + opts.limit);
    const hasMore = opts.offset + paged.length < totalCount;
    const nextOffset = hasMore ? opts.offset + paged.length : null;
    const myReview = viewer ? mapped.find((r) => r.reviewerId === viewer.id) || null : null;

    let canReview = false;
    let reviewEligibilityReason: 'unauthenticated' | 'self_review' | 'no_interaction' | null = null;
    if (!viewer) {
      reviewEligibilityReason = 'unauthenticated';
    } else if (viewer.id === sellerId) {
      reviewEligibilityReason = 'self_review';
    } else if (await this.hasSellerInteractionTx(this.db, viewer.id, sellerId)) {
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

    return this.db.transaction(async (tx) => {
      const [seller] = await tx
        .select()
        .from(sellerProfiles)
        .where(eq(sellerProfiles.userId, sellerId))
        .for('update');
      if (!seller) throw new RepositoryError(404, 'ملف المربي غير موجود');

      const [sellerUser] = await tx
        .select({ status: users.status, phone: users.phone })
        .from(users)
        .where(eq(users.id, sellerId))
        .limit(1);
      if (!sellerUser || sellerUser.status === 'suspended') {
        throw new RepositoryError(403, 'لا يمكن إرسال تقييم لحساب موقوف حالياً', 'seller_suspended');
      }
      if (currentUser.id === sellerId) {
        throw new RepositoryError(400, 'لا يمكنك تقييم مراحك أو حسابك الشخصي');
      }
      if (!(await this.hasSellerInteractionTx(tx, currentUser.id, sellerId))) {
        throw new RepositoryError(
          403,
          'يتاح التقييم بعد بدء محادثة أو تقديم عرض سعر مع المربي لضمان مصداقية التقييمات',
          'review_requires_interaction'
        );
      }

      const [existing] = await tx
        .select()
        .from(sellerReviews)
        .where(and(eq(sellerReviews.sellerId, sellerId), eq(sellerReviews.reviewerId, currentUser.id)))
        .limit(1);

      const now = new Date();
      let savedRow: typeof sellerReviews.$inferSelect;
      if (existing) {
        const [updated] = await tx
          .update(sellerReviews)
          .set({
            reviewerName: currentUser.name,
            rating: parsedRating,
            comment,
            updatedAt: now,
          })
          .where(eq(sellerReviews.id, existing.id))
          .returning();
        savedRow = updated;
      } else {
        const [inserted] = await tx
          .insert(sellerReviews)
          .values({
            id: `rev_${crypto.randomUUID().slice(0, 6)}`,
            sellerId,
            reviewerId: currentUser.id,
            reviewerName: currentUser.name,
            rating: parsedRating,
            comment,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        savedRow = inserted;
      }

      const allReviews = await tx
        .select()
        .from(sellerReviews)
        .where(eq(sellerReviews.sellerId, sellerId))
        .orderBy(desc(sellerReviews.updatedAt), desc(sellerReviews.createdAt));
      const sum = allReviews.reduce((acc, r) => acc + Number(r.rating || 0), 0);
      const avg = allReviews.length > 0 ? Math.round((sum / allReviews.length) * 10) / 10 : 0;

      const [updatedSeller] = await tx
        .update(sellerProfiles)
        .set({
          rating: String(avg),
          ratingCount: allReviews.length,
          updatedAt: now,
        })
        .where(eq(sellerProfiles.userId, sellerId))
        .returning();

      const contactAvailable = Boolean(
        sellerUser.status === 'active' &&
          (updatedSeller.phone || updatedSeller.whatsapp || sellerUser.phone)
      );

      return {
        created: !existing,
        review: mapDbReview(savedRow),
        seller: toPublicSeller(mapDbSeller(updatedSeller), contactAvailable),
        reviews: allReviews.slice(0, 10).map(mapDbReview),
      };
    });
  }

  async getSellerVerification(currentUser: any) {
    const [seller] = await this.db
      .select()
      .from(sellerProfiles)
      .where(eq(sellerProfiles.userId, currentUser.id))
      .limit(1);
    if (!seller) return { seller: null };
    const mapped = mapDbSeller(seller);
    const status = resolveSellerVerificationStatus(mapped);
    return {
      seller: {
        userId: mapped.userId,
        displayName: mapped.displayName,
        verificationStatus: status,
        verifiedAt: status === 'Verified' ? mapped.verifiedAt : null,
        verificationNote: mapped.verificationNote,
        verificationRequestedAt: mapped.verificationRequestedAt,
        verificationReviewedAt: mapped.verificationReviewedAt,
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
    return this.db.transaction(async (tx) => {
      const [seller] = await tx
        .select()
        .from(sellerProfiles)
        .where(eq(sellerProfiles.userId, currentUser.id))
        .for('update');
      const now = new Date();
      let resultRow: typeof sellerProfiles.$inferSelect;

      if (!seller) {
        const [hasListing] = await tx
          .select({ id: listings.id })
          .from(listings)
          .where(eq(listings.sellerId, currentUser.id))
          .limit(1);
        if (currentUser.role !== 'seller' && !hasListing) {
          throw new RepositoryError(403, 'طلب التوثيق متاح لحسابات البائعين والمربين فقط');
        }
        const [inserted] = await tx
          .insert(sellerProfiles)
          .values({
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
            verificationRequestedAt: now,
            verificationReviewedAt: null,
            yearsExperience: 2,
            specialty: 'أغنام وماعز',
            rating: '0',
            ratingCount: 0,
            totalSales: 0,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        resultRow = inserted;
      } else {
        const currentStatus = resolveSellerVerificationStatus(mapDbSeller(seller));
        if (currentStatus === 'Verified') {
          throw new RepositoryError(400, 'حساب المربي موثق بالفعل');
        }
        const nextPhone = !seller.phone && currentUser.phone ? currentUser.phone : seller.phone;
        const nextWhatsapp =
          !seller.whatsapp && currentUser.phone
            ? `966${currentUser.phone.replace(/^0/, '')}`
            : seller.whatsapp;
        const [updated] = await tx
          .update(sellerProfiles)
          .set({
            phone: nextPhone,
            whatsapp: nextWhatsapp,
            verificationStatus: 'Pending',
            verifiedAt: null,
            verificationNote: null,
            verificationRequestedAt: now,
            updatedAt: now,
          })
          .where(eq(sellerProfiles.userId, currentUser.id))
          .returning();
        resultRow = updated;
      }

      const mapped = mapDbSeller(resultRow);
      return {
        seller: {
          userId: mapped.userId,
          displayName: mapped.displayName,
          verificationStatus: mapped.verificationStatus,
          verifiedAt: mapped.verifiedAt,
          verificationNote: mapped.verificationNote,
          verificationRequestedAt: mapped.verificationRequestedAt,
          verificationReviewedAt: mapped.verificationReviewedAt,
        },
      };
    });
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

    const cleanCommentId =
      typeof commentId === 'string' && commentId.trim() ? commentId.trim() : null;
    const targetType: 'listing' | 'comment' = cleanCommentId ? 'comment' : 'listing';

    try {
      return await this.db.transaction(async (tx) => {
        const [listing] = await tx
          .select()
          .from(listings)
          .where(eq(listings.id, listingId))
          .limit(1);
        if (!listing || !canViewListing(currentUser, listing)) {
          throw new RepositoryError(404, 'الإعلان غير موجود');
        }

        if (cleanCommentId) {
          if (listing.status !== 'Published') {
            throw new RepositoryError(404, 'التعليق غير موجود');
          }
          const [targetComment] = await tx
            .select()
            .from(listingComments)
            .where(
              and(eq(listingComments.id, cleanCommentId), eq(listingComments.listingId, listing.id))
            )
            .limit(1);
          if (!targetComment) throw new RepositoryError(404, 'التعليق غير موجود');
          if (targetComment.authorId === currentUser.id) {
            throw new RepositoryError(400, 'لا يمكنك الإبلاغ عن تعليقك الشخصي');
          }
        }

        const [inserted] = await tx
          .insert(reports)
          .values({
            id: `rep_${crypto.randomUUID().slice(0, 6)}`,
            targetType,
            reporterId: currentUser.id,
            listingId: listing.id,
            commentId: cleanCommentId,
            reason: cleanReason,
            details: cleanDetails,
            status: 'open',
            createdAt: new Date(),
            resolvedAt: null,
            resolvedBy: null,
            resolutionNote: null,
          })
          .returning();

        return { report: mapDbReport(inserted) };
      });
    } catch (err: any) {
      if (isPgUniqueViolation(err)) {
        throw new RepositoryError(409, 'تم إرسال بلاغ مماثل مسبقاً وهو قيد المراجعة');
      }
      throw err;
    }
  }

  // ---- Admin ----

  async getAdminOverview(): Promise<AdminOverviewStats> {
    const [
      [userStats],
      [sellerStats],
      [listingStats],
      [reportStats],
      [{ commentsTotal }],
      auditRows,
    ] = await Promise.all([
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${users.status} = 'active')::int`,
          suspended: sql<number>`count(*) filter (where ${users.status} = 'suspended')::int`,
          buyers: sql<number>`count(*) filter (where ${users.role} = 'buyer')::int`,
          sellers: sql<number>`count(*) filter (where ${users.role} = 'seller')::int`,
          admins: sql<number>`count(*) filter (where ${users.role} = 'admin')::int`,
        })
        .from(users),
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          verified: sql<number>`count(*) filter (where ${sellerProfiles.verificationStatus} = 'Verified' or (coalesce(${sellerProfiles.verificationStatus}, '') not in ('Rejected', 'Pending') and ${sellerProfiles.verifiedAt} is not null))::int`,
          rejected: sql<number>`count(*) filter (where ${sellerProfiles.verificationStatus} = 'Rejected')::int`,
        })
        .from(sellerProfiles),
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          published: sql<number>`count(*) filter (where ${listings.status} = 'Published')::int`,
          pending: sql<number>`count(*) filter (where ${listings.status} = 'Pending')::int`,
          rejected: sql<number>`count(*) filter (where ${listings.status} = 'Rejected')::int`,
          sold: sql<number>`count(*) filter (where ${listings.status} = 'Sold')::int`,
          draft: sql<number>`count(*) filter (where ${listings.status} = 'Draft')::int`,
          expired: sql<number>`count(*) filter (where ${listings.status} = 'Expired')::int`,
        })
        .from(listings),
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          open: sql<number>`count(*) filter (where ${reports.status} = 'open')::int`,
          resolved: sql<number>`count(*) filter (where ${reports.status} = 'resolved')::int`,
          dismissed: sql<number>`count(*) filter (where ${reports.status} = 'dismissed')::int`,
          listingReportsOpen: sql<number>`count(*) filter (where ${reports.status} = 'open' and ${reports.targetType} = 'listing')::int`,
          commentReportsOpen: sql<number>`count(*) filter (where ${reports.status} = 'open' and ${reports.targetType} = 'comment')::int`,
        })
        .from(reports),
      this.db.select({ commentsTotal: sql<number>`count(*)::int` }).from(listingComments),
      this.db
        .select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(12),
    ]);

    const sellerTotal = Number(sellerStats?.total || 0);
    const sellerVerified = Number(sellerStats?.verified || 0);
    const sellerRejected = Number(sellerStats?.rejected || 0);
    const sellerPending = Math.max(0, sellerTotal - sellerVerified - sellerRejected);

    return {
      users: {
        total: Number(userStats?.total || 0),
        active: Number(userStats?.active || 0),
        suspended: Number(userStats?.suspended || 0),
        buyers: Number(userStats?.buyers || 0),
        sellers: Number(userStats?.sellers || 0),
        admins: Number(userStats?.admins || 0),
      },
      sellers: {
        total: sellerTotal,
        verified: sellerVerified,
        pending: sellerPending,
        rejected: sellerRejected,
      },
      listings: {
        total: Number(listingStats?.total || 0),
        published: Number(listingStats?.published || 0),
        pending: Number(listingStats?.pending || 0),
        rejected: Number(listingStats?.rejected || 0),
        sold: Number(listingStats?.sold || 0),
        draft: Number(listingStats?.draft || 0),
        expired: Number(listingStats?.expired || 0),
      },
      reports: {
        total: Number(reportStats?.total || 0),
        open: Number(reportStats?.open || 0),
        resolved: Number(reportStats?.resolved || 0),
        dismissed: Number(reportStats?.dismissed || 0),
        listingReportsOpen: Number(reportStats?.listingReportsOpen || 0),
        commentReportsOpen: Number(reportStats?.commentReportsOpen || 0),
      },
      comments: {
        total: Number(commentsTotal || 0),
      },
      recentActivity: auditRows.map(mapDbAuditLog),
    };
  }

  async listAdminUsers(query: {
    q?: string;
    role?: string;
    status?: string;
    verificationStatus?: string;
    limit?: unknown;
    offset?: unknown;
  }) {
    const [allUsers, allSellers, allListings] = await Promise.all([
      this.db.select().from(users).orderBy(desc(users.createdAt)),
      this.db.select().from(sellerProfiles),
      this.db.select({ sellerId: listings.sellerId, status: listings.status }).from(listings),
    ]);
    const sellerMap = new Map(allSellers.map((s) => [s.userId, mapDbSeller(s)]));
    const summaries = allUsers.map((u) =>
      toAdminUserSummary(mapDbUser(u), sellerMap.get(u.id), allListings)
    );
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
    const cleanReason = validateAdminNote(reason, {
      required: true,
      label: 'سبب إيقاف الحساب',
      minLength: 3,
      maxLength: 300,
    });

    const result = await this.db.transaction(async (tx) => {
      const adminAndTargetRows = await tx
        .select()
        .from(users)
        .where(or(eq(users.role, 'admin'), eq(users.id, targetUserId)))
        .for('update');
      const targetRow = adminAndTargetRows.find((u) => u.id === targetUserId);
      const mappedAll = adminAndTargetRows.map(mapDbUser);
      const mappedTarget = targetRow ? mapDbUser(targetRow) : undefined;

      const decision = canSuspendUser(currentUser, mappedTarget, mappedAll);
      if (!decision.ok) {
        throw new AdminValidationError(decision.status, decision.error, decision.code);
      }

      const now = new Date();
      const [updatedTarget] = await tx
        .update(users)
        .set({
          status: 'suspended',
          suspendedAt: now,
          suspendedBy: currentUser.id,
          suspensionReason: cleanReason,
          updatedAt: now,
        })
        .where(eq(users.id, targetUserId))
        .returning();

      const deletedSessions = await tx
        .delete(sessions)
        .where(eq(sessions.userId, targetUserId))
        .returning({ id: sessions.id });

      const targetContact = updatedTarget.phone || updatedTarget.email || 'بدون جوال';
      const auditEntry = createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'إيقاف حساب مستخدم',
        targetType: 'user',
        targetId: updatedTarget.id,
        note: `${updatedTarget.name} (${targetContact}) — السبب: ${cleanReason}`,
        createdAt: now.toISOString(),
      });
      await tx.insert(auditLogs).values({
        id: auditEntry.id,
        actorId: auditEntry.actorId,
        actorName: auditEntry.actorName,
        action: auditEntry.action,
        targetType: auditEntry.targetType,
        targetId: auditEntry.targetId,
        note: auditEntry.note ?? null,
        createdAt: now,
      });

      const sellerRow = await tx
        .select()
        .from(sellerProfiles)
        .where(eq(sellerProfiles.userId, updatedTarget.id))
        .limit(1);
      const userListings = await tx
        .select({ sellerId: listings.sellerId, status: listings.status })
        .from(listings)
        .where(eq(listings.sellerId, updatedTarget.id));

      return {
        user: toAdminUserSummary(
          mapDbUser(updatedTarget),
          sellerRow[0] ? mapDbSeller(sellerRow[0]) : undefined,
          userListings
        ),
        auditEntry,
        revokedSessionIds: deletedSessions.map((s) => s.id),
      };
    });

    if (result.revokedSessionIds.length > 0) {
      this.onSessionsRevoked?.(result.revokedSessionIds);
    }
    return result;
  }

  async reactivateUser(currentUser: any, targetUserId: string, reason: unknown) {
    const cleanNote = validateAdminNote(reason, {
      required: false,
      label: 'ملاحظة إعادة التفعيل',
      minLength: 2,
      maxLength: 300,
    });

    return this.db.transaction(async (tx) => {
      const [targetRow] = await tx
        .select()
        .from(users)
        .where(eq(users.id, targetUserId))
        .for('update');
      const mappedTarget = targetRow ? mapDbUser(targetRow) : undefined;
      const decision = canReactivateUser(currentUser, mappedTarget);
      if (!decision.ok) {
        throw new AdminValidationError(decision.status, decision.error, decision.code);
      }

      const now = new Date();
      const [updatedTarget] = await tx
        .update(users)
        .set({
          status: 'active',
          reactivatedAt: now,
          reactivatedBy: currentUser.id,
          suspendedAt: null,
          suspendedBy: null,
          suspensionReason: null,
          updatedAt: now,
        })
        .where(eq(users.id, targetUserId))
        .returning();

      const targetContact = updatedTarget.phone || updatedTarget.email || 'بدون جوال';
      const auditEntry = createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'إعادة تفعيل حساب مستخدم',
        targetType: 'user',
        targetId: updatedTarget.id,
        note: cleanNote
          ? `${updatedTarget.name} (${targetContact}) — ${cleanNote}`
          : `${updatedTarget.name} (${targetContact})`,
        createdAt: now.toISOString(),
      });
      await tx.insert(auditLogs).values({
        id: auditEntry.id,
        actorId: auditEntry.actorId,
        actorName: auditEntry.actorName,
        action: auditEntry.action,
        targetType: auditEntry.targetType,
        targetId: auditEntry.targetId,
        note: auditEntry.note ?? null,
        createdAt: now,
      });

      const sellerRow = await tx
        .select()
        .from(sellerProfiles)
        .where(eq(sellerProfiles.userId, updatedTarget.id))
        .limit(1);
      const userListings = await tx
        .select({ sellerId: listings.sellerId, status: listings.status })
        .from(listings)
        .where(eq(listings.sellerId, updatedTarget.id));

      return {
        user: toAdminUserSummary(
          mapDbUser(updatedTarget),
          sellerRow[0] ? mapDbSeller(sellerRow[0]) : undefined,
          userListings
        ),
        auditEntry,
      };
    });
  }

  async listAdminSellers(query: {
    status?: string;
    q?: string;
    limit?: unknown;
    offset?: unknown;
  }) {
    const statusFilter = query.status || 'all';
    const q = typeof query.q === 'string' ? query.q.trim().toLowerCase() : '';

    const [allSellers, allUsers, allListings] = await Promise.all([
      this.db.select().from(sellerProfiles),
      this.db.select().from(users),
      this.db.select({ sellerId: listings.sellerId, status: listings.status }).from(listings),
    ]);
    const userMap = new Map(allUsers.map((u) => [u.id, mapDbUser(u)]));

    const items = allSellers
      .map((s) => {
        const u = userMap.get(s.userId);
        return u ? toAdminUserSummary(u, mapDbSeller(s), allListings) : null;
      })
      .filter((summary): summary is NonNullable<typeof summary> => Boolean(summary?.sellerProfile))
      .filter((summary) => {
        if (
          statusFilter &&
          statusFilter !== 'all' &&
          summary.sellerProfile!.verificationStatus !== statusFilter
        ) {
          return false;
        }
        if (!q) return true;
        return (
          summary.name.toLowerCase().includes(q) ||
          summary.phone.toLowerCase().includes(q) ||
          summary.sellerProfile!.displayName.toLowerCase().includes(q) ||
          summary.sellerProfile!.city.toLowerCase().includes(q)
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
    if (!canReviewSellerVerification(currentUser)) {
      throw new AdminValidationError(403, 'صلاحيات المشرف مطلوبة لهذا الإجراء', 'forbidden');
    }
    if (status !== 'Verified' && status !== 'Rejected' && status !== 'Pending') {
      throw new AdminValidationError(
        400,
        'حالة التوثيق غير صالحة؛ يجب أن تكون Pending أو Verified أو Rejected'
      );
    }
    const cleanReason = validateAdminNote(reason, {
      required: status === 'Rejected',
      label: status === 'Rejected' ? 'سبب رفض التوثيق' : 'ملاحظة المراجعة',
      minLength: 3,
      maxLength: 300,
    });

    return this.db.transaction(async (tx) => {
      const [targetUser] = await tx
        .select()
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);
      const [seller] = await tx
        .select()
        .from(sellerProfiles)
        .where(eq(sellerProfiles.userId, targetUserId))
        .for('update');
      if (!targetUser || !seller) {
        throw new RepositoryError(404, 'ملف المربي غير موجود');
      }

      const now = new Date();
      const [updatedSeller] = await tx
        .update(sellerProfiles)
        .set({
          verificationStatus: status,
          verifiedAt: status === 'Verified' ? now : null,
          verificationNote: cleanReason,
          verificationReviewedAt: now,
          verificationReviewedBy: currentUser.id,
          updatedAt: now,
        })
        .where(eq(sellerProfiles.userId, targetUserId))
        .returning();

      const actionLabel =
        status === 'Verified'
          ? 'توثيق حساب مربي'
          : status === 'Rejected'
          ? 'رفض توثيق مربي'
          : 'إعادة توثيق مربي للمراجعة';
      const sellerLabel = updatedSeller.displayName || targetUser.name || updatedSeller.userId;

      const auditEntry = createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: actionLabel,
        targetType: 'seller',
        targetId: updatedSeller.userId,
        note: cleanReason ? `${sellerLabel} — ${cleanReason}` : sellerLabel,
        createdAt: now.toISOString(),
      });
      await tx.insert(auditLogs).values({
        id: auditEntry.id,
        actorId: auditEntry.actorId,
        actorName: auditEntry.actorName,
        action: auditEntry.action,
        targetType: auditEntry.targetType,
        targetId: auditEntry.targetId,
        note: auditEntry.note ?? null,
        createdAt: now,
      });

      let notification: { userId: string; notification: any } | undefined;
      if (status === 'Verified') {
        notification = {
          userId: updatedSeller.userId,
          notification: await this.insertNotificationTx(tx, {
            userId: updatedSeller.userId,
            type: 'seller_verified',
            title: 'تم توثيق حسابك كمربي معتمد',
            body: `أصبح حساب «${updatedSeller.displayName}» يحمل شارة المربي الموثق في السوق.`,
          }),
        };
      } else if (status === 'Rejected') {
        notification = {
          userId: updatedSeller.userId,
          notification: await this.insertNotificationTx(tx, {
            userId: updatedSeller.userId,
            type: 'seller_verification_rejected',
            title: 'تحديث حول طلب توثيق المربي',
            body: updatedSeller.verificationNote
              ? `لم يتم اعتماد التوثيق حالياً: ${updatedSeller.verificationNote}`
              : 'لم يتم اعتماد طلب التوثيق حالياً، يرجى مراجعة بيانات المراح.',
          }),
        };
      }

      const userListings = await tx
        .select({ sellerId: listings.sellerId, status: listings.status })
        .from(listings)
        .where(eq(listings.sellerId, targetUser.id));

      const mappedSeller = mapDbSeller(updatedSeller);
      const contactAvailable = Boolean(
        targetUser.status === 'active' &&
          (updatedSeller.phone || updatedSeller.whatsapp || targetUser.phone)
      );

      return {
        user: toAdminUserSummary(mapDbUser(targetUser), mappedSeller, userListings),
        seller: toPublicSeller(mappedSeller, contactAvailable),
        auditEntry,
        notification,
      };
    });
  }

  private async serializeAdminReports(
    executor: DbExecutor,
    reportRows: Array<typeof reports.$inferSelect>
  ) {
    if (reportRows.length === 0) return [];
    const listingIds = Array.from(new Set(reportRows.map((r) => r.listingId)));
    const commentIds = Array.from(
      new Set(reportRows.map((r) => r.commentId).filter((id): id is string => Boolean(id)))
    );

    const listingRows = await executor
      .select({ id: listings.id, title: listings.title, status: listings.status })
      .from(listings)
      .where(inArray(listings.id, listingIds));
    const commentRows =
      commentIds.length > 0
        ? await executor
            .select({
              id: listingComments.id,
              body: listingComments.body,
              authorId: listingComments.authorId,
              authorName: listingComments.authorName,
            })
            .from(listingComments)
            .where(inArray(listingComments.id, commentIds))
        : [];

    const userIds = Array.from(
      new Set([
        ...reportRows.map((r) => r.reporterId),
        ...commentRows.map((c) => c.authorId),
      ])
    );
    const userRows =
      userIds.length > 0
        ? await executor
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(inArray(users.id, userIds))
        : [];

    const userMap = new Map(userRows.map((u) => [u.id, u]));
    const listingMap = new Map(listingRows.map((l) => [l.id, l]));
    const commentMap = new Map(commentRows.map((c) => [c.id, c]));

    return reportRows.map((r) => {
      const reporter = userMap.get(r.reporterId);
      const listing = listingMap.get(r.listingId);
      const comment = r.commentId ? commentMap.get(r.commentId) : undefined;
      const commentAuthor = comment ? userMap.get(comment.authorId) : undefined;

      return {
        id: r.id,
        targetType: r.targetType as 'listing' | 'comment',
        listingId: r.listingId,
        commentId: r.commentId ?? null,
        reporterId: r.reporterId,
        reporterName: reporter?.name || 'مستخدم',
        reason: r.reason,
        details: r.details,
        status: r.status as 'open' | 'resolved' | 'dismissed',
        createdAt: toIsoRequired(r.createdAt),
        resolvedAt: toIso(r.resolvedAt),
        resolutionNote: r.resolutionNote ?? null,
        listingTitle: listing?.title || null,
        listingStatus: listing?.status || null,
        commentBody: comment?.body || null,
        commentAuthorName: commentAuthor?.name || comment?.authorName || null,
      };
    });
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
    const conditions: any[] = [];
    if (statusFilter !== 'all') {
      conditions.push(eq(reports.status, statusFilter));
    }
    if (targetTypeFilter !== 'all') {
      conditions.push(eq(reports.targetType, targetTypeFilter));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    if (!q) {
      const { limit, offset } = resolveAdminPagination(query, { defaultLimit: 50, maxLimit: 100 });
      const [[{ totalCount }], pagedRows] = await Promise.all([
        this.db.select({ totalCount: sql<number>`count(*)::int` }).from(reports).where(whereClause),
        this.db
          .select()
          .from(reports)
          .where(whereClause)
          .orderBy(desc(reports.createdAt))
          .limit(limit)
          .offset(offset),
      ]);
      const serialized = await this.serializeAdminReports(this.db, pagedRows);
      const total = Number(totalCount || 0);
      const hasMore = offset + serialized.length < total;
      return {
        reports: serialized,
        totalCount: total,
        limit,
        offset,
        hasMore,
        nextOffset: hasMore ? offset + serialized.length : null,
      };
    }

    const reportRows = await this.db
      .select()
      .from(reports)
      .where(whereClause)
      .orderBy(desc(reports.createdAt));
    const items = (await this.serializeAdminReports(this.db, reportRows)).filter((item) => {
      return (
        item.reason.toLowerCase().includes(q) ||
        item.details.toLowerCase().includes(q) ||
        item.reporterName.toLowerCase().includes(q) ||
        (item.listingTitle || '').toLowerCase().includes(q) ||
        (item.commentBody || '').toLowerCase().includes(q)
      );
    });

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
    const resolutionNote = validateAdminNote(noteRaw, {
      required: false,
      label: 'ملاحظة الإجراء',
      minLength: 2,
      maxLength: 300,
    });

    return this.db.transaction(async (tx) => {
      const [report] = await tx
        .select()
        .from(reports)
        .where(eq(reports.id, reportId))
        .for('update');
      if (!report) throw new RepositoryError(404, 'البلاغ غير موجود');

      const nextStatus = statusRaw === 'dismissed' ? 'dismissed' : 'resolved';
      const now = new Date();
      const [updated] = await tx
        .update(reports)
        .set({
          targetType: report.targetType === 'comment' || report.commentId ? 'comment' : 'listing',
          status: nextStatus,
          resolvedAt: now,
          resolvedBy: currentUser.id,
          resolutionNote,
        })
        .where(eq(reports.id, report.id))
        .returning();

      const auditEntry = createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: nextStatus === 'resolved' ? 'معالجة بلاغ' : 'إغلاق بلاغ',
        targetType: 'report',
        targetId: report.id,
        note: resolutionNote ? `${report.reason} — ${resolutionNote}` : report.reason,
        createdAt: now.toISOString(),
      });
      await tx.insert(auditLogs).values({
        id: auditEntry.id,
        actorId: auditEntry.actorId,
        actorName: auditEntry.actorName,
        action: auditEntry.action,
        targetType: auditEntry.targetType,
        targetId: auditEntry.targetId,
        note: auditEntry.note ?? null,
        createdAt: now,
      });

      const [item] = await this.serializeAdminReports(tx, [updated]);
      return { report: item };
    });
  }

  async listAdminAuditLogs(query: {
    targetType?: string;
    q?: string;
    limit?: unknown;
    offset?: unknown;
  }) {
    const targetTypeFilter = query.targetType || 'all';
    const q = typeof query.q === 'string' ? query.q.trim() : '';
    const { limit, offset } = resolveAdminPagination(query, { defaultLimit: 50, maxLimit: 200 });

    const conditions: any[] = [];
    if (targetTypeFilter !== 'all') {
      conditions.push(eq(auditLogs.targetType, targetTypeFilter));
    }
    if (q) {
      const pattern = `%${q.replace(/[!%_]/g, '!$&')}%`;
      conditions.push(
        or(
          sql`${auditLogs.action} ilike ${pattern} escape '!'`,
          sql`${auditLogs.actorName} ilike ${pattern} escape '!'`,
          sql`coalesce(${auditLogs.note}, '') ilike ${pattern} escape '!'`,
          sql`${auditLogs.targetId} ilike ${pattern} escape '!'`
        )
      );
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [[{ totalCount }], rows] = await Promise.all([
      this.db.select({ totalCount: sql<number>`count(*)::int` }).from(auditLogs).where(whereClause),
      this.db
        .select()
        .from(auditLogs)
        .where(whereClause)
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(limit)
        .offset(offset),
    ]);

    const items = rows.map(mapDbAuditLog);
    const total = Number(totalCount || 0);
    const hasMore = offset + items.length < total;
    return {
      auditLogs: items,
      totalCount: total,
      limit,
      offset,
      hasMore,
      nextOffset: hasMore ? offset + items.length : null,
    };
  }

  async approveListing(currentUser: any, listingId: string) {
    return this.db.transaction(async (tx) => {
      const [listing] = await tx
        .select()
        .from(listings)
        .where(eq(listings.id, listingId))
        .for('update');
      if (!listing) throw new RepositoryError(404, 'الإعلان غير موجود');

      const now = new Date();
      const [updated] = await tx
        .update(listings)
        .set({
          status: 'Published',
          rejectionReason: null,
          publishedAt: now,
          updatedAt: now,
        })
        .where(eq(listings.id, listing.id))
        .returning();

      let notification: { userId: string; notification: any } | undefined;
      if (listing.sellerId !== currentUser.id) {
        notification = {
          userId: listing.sellerId,
          notification: await this.insertNotificationTx(tx, {
            userId: listing.sellerId,
            type: 'listing_approved',
            title: 'تم اعتماد ونشر إعلانك',
            body: `تمت الموافقة على إعلان «${listing.title}» ونشره في السوق.`,
            listingId: listing.id,
          }),
        };
      }

      const auditEntry = createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'اعتماد ونشر إعلان',
        targetType: 'listing',
        targetId: listing.id,
        note: listing.title,
        createdAt: now.toISOString(),
      });
      await tx.insert(auditLogs).values({
        id: auditEntry.id,
        actorId: auditEntry.actorId,
        actorName: auditEntry.actorName,
        action: auditEntry.action,
        targetType: auditEntry.targetType,
        targetId: auditEntry.targetId,
        note: auditEntry.note ?? null,
        createdAt: now,
      });

      const [hydrated] = await this.hydrateListingsBatch(tx, [updated]);
      return { listing: hydrated, notification };
    });
  }

  async rejectListing(currentUser: any, listingId: string, reason: unknown) {
    const cleanReason = validateAdminNote(reason, {
      required: true,
      label: 'سبب رفض الإعلان',
      minLength: 3,
      maxLength: 400,
    });

    return this.db.transaction(async (tx) => {
      const [listing] = await tx
        .select()
        .from(listings)
        .where(eq(listings.id, listingId))
        .for('update');
      if (!listing) throw new RepositoryError(404, 'الإعلان غير موجود');

      const now = new Date();
      const [updated] = await tx
        .update(listings)
        .set({
          status: 'Rejected',
          rejectionReason: cleanReason!,
          updatedAt: now,
        })
        .where(eq(listings.id, listing.id))
        .returning();

      let notification: { userId: string; notification: any } | undefined;
      if (listing.sellerId !== currentUser.id) {
        notification = {
          userId: listing.sellerId,
          notification: await this.insertNotificationTx(tx, {
            userId: listing.sellerId,
            type: 'listing_rejected',
            title: 'تحديث على حالة إعلانك',
            body: `لم يُعتمد إعلان «${listing.title}» — السبب: ${cleanReason!}`,
            listingId: listing.id,
          }),
        };
      }

      const auditEntry = createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'رفض إعلان',
        targetType: 'listing',
        targetId: listing.id,
        note: `${listing.title} — ${cleanReason!}`,
        createdAt: now.toISOString(),
      });
      await tx.insert(auditLogs).values({
        id: auditEntry.id,
        actorId: auditEntry.actorId,
        actorName: auditEntry.actorName,
        action: auditEntry.action,
        targetType: auditEntry.targetType,
        targetId: auditEntry.targetId,
        note: auditEntry.note ?? null,
        createdAt: now,
      });

      const [hydrated] = await this.hydrateListingsBatch(tx, [updated]);
      return { listing: hydrated, notification };
    });
  }

  async createBreed(currentUser: any, body: any) {
    const { name, categoryId, origin, summary, avgWeightKg, priceRangeSar } = body || {};
    const cleanName = validateRequiredText(name, {
      label: 'اسم السلالة',
      minLength: INPUT_LIMITS.breedNameMin,
      maxLength: INPUT_LIMITS.breedNameMax,
      code: 'invalid_breed_name',
    });
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

    return this.db.transaction(async (tx) => {
      if (typeof categoryId !== 'string') {
        throw new RepositoryError(400, 'التصنيف الرئيسي المحدد غير صالح', 'invalid_category');
      }
      const [rootCat] = await tx
        .select()
        .from(categories)
        .where(and(eq(categories.id, categoryId.trim()), isNull(categories.parentId)))
        .limit(1);
      if (!rootCat) {
        throw new RepositoryError(400, 'التصنيف الرئيسي المحدد غير صالح', 'invalid_category');
      }

      const [newBreed] = await tx
        .insert(breeds)
        .values({
          id: `brd_${crypto.randomUUID().slice(0, 6)}`,
          categoryId: rootCat.id,
          name: cleanName,
          slug: `breed-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
          origin: cleanOrigin || 'المملكة العربية السعودية',
          summary: cleanSummary || 'سلالة مضافة عبر إدارة المنصة.',
          avgWeightKg: cleanAvgWeight || '35 – 55 كجم',
          priceRangeSar: cleanPriceRange || '1,200 – 2,000 ر.س',
          imageUrl: IMG.naimi,
          characteristics: ['سلالة معتمدة في المنصة'],
        })
        .returning();

      const now = new Date();
      const auditEntry = createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'إضافة سلالة جديدة',
        targetType: 'breed',
        targetId: newBreed.id,
        note: newBreed.name,
        createdAt: now.toISOString(),
      });
      await tx.insert(auditLogs).values({
        id: auditEntry.id,
        actorId: auditEntry.actorId,
        actorName: auditEntry.actorName,
        action: auditEntry.action,
        targetType: auditEntry.targetType,
        targetId: auditEntry.targetId,
        note: auditEntry.note ?? null,
        createdAt: now,
      });

      return { breed: newBreed };
    });
  }

  async createCategory(currentUser: any, body: any) {
    const { name, parentId, description, keywords } = body || {};
    const cleanName = validateRequiredText(name, {
      label: 'اسم الفئة الفرعية',
      minLength: INPUT_LIMITS.categoryNameMin,
      maxLength: INPUT_LIMITS.categoryNameMax,
      code: 'invalid_category_name',
    });
    const cleanDescription = validateOptionalText(description, {
      label: 'وصف الفئة',
      maxLength: INPUT_LIMITS.categoryDescriptionMax,
      allowNewlines: true,
      defaultValue: '',
    });
    const parsedKeywords = parseAndValidateKeywords(keywords);

    return this.db.transaction(async (tx) => {
      const allCats = await tx.select().from(categories);
      const validatedParentId = validateCategoryParentAssignment({
        categories: allCats,
        requestedParentId: parentId,
        isCreate: true,
      });

      const [newCat] = await tx
        .insert(categories)
        .values({
          id: `sub_${crypto.randomUUID().slice(0, 6)}`,
          name: cleanName,
          slug: `sub-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
          parentId: validatedParentId,
          description: cleanDescription,
          keywords: parsedKeywords,
          sortOrder: allCats.length,
        })
        .returning();

      const now = new Date();
      const auditEntry = createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'إنشاء فئة فرعية ذكية',
        targetType: 'category',
        targetId: newCat.id,
        note: newCat.name,
        createdAt: now.toISOString(),
      });
      await tx.insert(auditLogs).values({
        id: auditEntry.id,
        actorId: auditEntry.actorId,
        actorName: auditEntry.actorName,
        action: auditEntry.action,
        targetType: auditEntry.targetType,
        targetId: auditEntry.targetId,
        note: auditEntry.note ?? null,
        createdAt: now,
      });

      return {
        category: {
          id: newCat.id,
          name: newCat.name,
          slug: newCat.slug,
          parentId: newCat.parentId,
          description: newCat.description,
          keywords: newCat.keywords,
        },
      };
    });
  }

  async updateCategory(currentUser: any, categoryId: string, body: any) {
    return this.db.transaction(async (tx) => {
      const allCats = await tx.select().from(categories);
      const existing = allCats.find((c) => c.id === categoryId);
      if (!existing) throw new RepositoryError(404, 'الفئة غير موجودة');

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
          categories: allCats,
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

      const [updated] = await tx
        .update(categories)
        .set({
          name: cleanName,
          parentId: nextParentId,
          description: cleanDescription,
          keywords: parsedKeywords,
        })
        .where(eq(categories.id, existing.id))
        .returning();

      if (cleanName !== existing.name) {
        const affectedListings = await tx
          .select()
          .from(listings)
          .where(or(eq(listings.categoryId, updated.id), eq(listings.subCategoryId, updated.id)));
        for (const l of affectedListings) {
          const { searchDoc } = await this.buildListingSearchColsTx(tx, l);
          await tx.update(listings).set({ searchDoc }).where(eq(listings.id, l.id));
        }
      }

      const now = new Date();
      const auditEntry = createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'تعديل فئة فرعية',
        targetType: 'category',
        targetId: updated.id,
        note: updated.name,
        createdAt: now.toISOString(),
      });
      await tx.insert(auditLogs).values({
        id: auditEntry.id,
        actorId: auditEntry.actorId,
        actorName: auditEntry.actorName,
        action: auditEntry.action,
        targetType: auditEntry.targetType,
        targetId: auditEntry.targetId,
        note: auditEntry.note ?? null,
        createdAt: now,
      });

      return {
        category: {
          id: updated.id,
          name: updated.name,
          slug: updated.slug,
          parentId: updated.parentId,
          description: updated.description,
          keywords: updated.keywords,
        },
      };
    });
  }

  async deleteCategory(currentUser: any, categoryId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const allCats = await tx.select().from(categories);
      const target = allCats.find((c) => c.id === categoryId);
      if (!target) throw new RepositoryError(404, 'الفئة غير موجودة');
      if (target.parentId === null) {
        throw new RepositoryError(400, 'لا يمكن حذف التصنيف الرئيسي');
      }

      const remainingCats = allCats.filter((c) => c.id !== categoryId);
      const affectedListings = await tx
        .select()
        .from(listings)
        .where(eq(listings.subCategoryId, categoryId));

      for (const l of affectedListings) {
        const nextSubId = inferSubCategoryId(l, remainingCats);
        const { searchDoc } = await this.buildListingSearchColsTx(tx, {
          ...l,
          subCategoryId: nextSubId,
        });
        await tx
          .update(listings)
          .set({ subCategoryId: nextSubId, searchDoc, updatedAt: new Date() })
          .where(eq(listings.id, l.id));
      }

      await tx.delete(categories).where(eq(categories.id, categoryId));

      const now = new Date();
      const auditEntry = createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'حذف فئة فرعية',
        targetType: 'category',
        targetId: target.id,
        note: target.name,
        createdAt: now.toISOString(),
      });
      await tx.insert(auditLogs).values({
        id: auditEntry.id,
        actorId: auditEntry.actorId,
        actorName: auditEntry.actorName,
        action: auditEntry.action,
        targetType: auditEntry.targetType,
        targetId: auditEntry.targetId,
        note: auditEntry.note ?? null,
        createdAt: now,
      });
    });
  }

  async autoCategorizeListings(
    currentUser: any,
    body: { listingId?: string; subCategoryId?: string | null }
  ) {
    const { listingId, subCategoryId } = body || {};
    return this.db.transaction(async (tx) => {
      const allCats = await tx.select().from(categories);
      let updatedCount = 0;

      if (listingId) {
        const [listing] = await tx
          .select()
          .from(listings)
          .where(eq(listings.id, listingId))
          .for('update');
        if (!listing) throw new RepositoryError(404, 'الإعلان غير موجود');
        const nextSubId =
          subCategoryId === undefined
            ? inferSubCategoryId(listing, allCats)
            : subCategoryId || null;
        const { searchDoc } = await this.buildListingSearchColsTx(tx, {
          ...listing,
          subCategoryId: nextSubId,
        });
        await tx
          .update(listings)
          .set({ subCategoryId: nextSubId, searchDoc, updatedAt: new Date() })
          .where(eq(listings.id, listing.id));
        updatedCount = 1;
      } else {
        const allListings = await tx.select().from(listings);
        for (const l of allListings) {
          const nextSub = inferSubCategoryId(l, allCats);
          if (nextSub && nextSub !== l.subCategoryId) {
            updatedCount += 1;
            const { searchDoc } = await this.buildListingSearchColsTx(tx, {
              ...l,
              subCategoryId: nextSub,
            });
            await tx
              .update(listings)
              .set({ subCategoryId: nextSub, searchDoc, updatedAt: new Date() })
              .where(eq(listings.id, l.id));
          }
        }
      }

      const now = new Date();
      const auditEntry = createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'تشغيل التصنيف الذكي للإعلانات',
        targetType: 'listing',
        targetId: listingId || 'all',
        note: `تم تحديث تصنيف ${updatedCount} إعلان`,
        createdAt: now.toISOString(),
      });
      await tx.insert(auditLogs).values({
        id: auditEntry.id,
        actorId: auditEntry.actorId,
        actorName: auditEntry.actorName,
        action: auditEntry.action,
        targetType: auditEntry.targetType,
        targetId: auditEntry.targetId,
        note: auditEntry.note ?? null,
        createdAt: now,
      });

      return { updatedCount };
    });
  }

  async listAdminComments(query: {
    q?: string;
    listingId?: string;
    limit?: unknown;
    offset?: unknown;
  }) {
    const q = typeof query.q === 'string' ? query.q.trim().toLowerCase() : '';
    const listingIdFilter = typeof query.listingId === 'string' ? query.listingId.trim() : '';

    const commentRows = await this.db
      .select()
      .from(listingComments)
      .where(listingIdFilter ? eq(listingComments.listingId, listingIdFilter) : undefined)
      .orderBy(desc(listingComments.createdAt));

    if (commentRows.length === 0) {
      const paged = paginateAdminItems([], query, { defaultLimit: 50, maxLimit: 100 });
      return {
        comments: [],
        totalCount: paged.totalCount,
        limit: paged.limit,
        offset: paged.offset,
        hasMore: paged.hasMore,
        nextOffset: paged.nextOffset,
      };
    }

    const listingIds = Array.from(new Set(commentRows.map((c) => c.listingId)));
    const authorIds = Array.from(new Set(commentRows.map((c) => c.authorId)));
    const [listingRows, authorRows, sellerRows] = await Promise.all([
      this.db
        .select({
          id: listings.id,
          sellerId: listings.sellerId,
          title: listings.title,
          status: listings.status,
        })
        .from(listings)
        .where(inArray(listings.id, listingIds)),
      this.db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, authorIds)),
      this.db.select().from(sellerProfiles),
    ]);

    const listingMap = new Map(listingRows.map((l) => [l.id, l]));
    const mappedSellers = sellerRows.map(mapDbSeller);

    const items = commentRows
      .map((comment) => {
        const listing = listingMap.get(comment.listingId);
        if (!listing) return null;
        return {
          ...toPublicComment(mapDbComment(comment), listing, authorRows, mappedSellers),
          listingTitle: listing.title,
          listingStatus: listing.status,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .filter((item) => {
        if (!q) return true;
        return (
          String(item.body || '').toLowerCase().includes(q) ||
          String(item.authorName || '').toLowerCase().includes(q) ||
          String(item.listingTitle || '').toLowerCase().includes(q)
        );
      });

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
    const settings = await this.getOrCreateCommissionSettingsTx(this.db);
    if (!viewer) {
      return { settings, eligibility: null };
    }
    const priorPlatformSalesCount = await this.getSellerPlatformSalesCountTx(this.db, viewer.id);
    const eligibility = evaluateSellerCommissionEligibility({
      settings,
      userCreatedAt: viewer.createdAt,
      priorPlatformSalesCount,
    });
    return { settings, eligibility };
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
    if (typeof body?.soldViaPlatform !== 'boolean') {
      throw new RepositoryError(
        400,
        'يرجى تحديد هل تم البيع عن طريق المنصة أم خارجها',
        'sold_via_platform_required'
      );
    }
    const soldViaPlatform = body.soldViaPlatform;

    return this.db.transaction(async (tx) => {
      const [listingRow] = await tx
        .select()
        .from(listings)
        .where(eq(listings.id, listingId))
        .for('update');
      if (!listingRow) throw new RepositoryError(404, 'الإعلان غير موجود');
      if (!canEditListing(currentUser, listingRow)) {
        throw new RepositoryError(403, 'غير مصرح لك بتعديل حالة هذا الإعلان');
      }
      if (listingRow.status === 'Sold') {
        throw new RepositoryError(400, 'تم تحديد هذا الإعلان كمباع مسبقاً', 'already_sold');
      }
      if (listingRow.status !== 'Published' && !isAdmin(currentUser)) {
        throw new RepositoryError(
          400,
          'يمكن تحديد الإعلان كمباع بعد اعتماده ونشره فقط',
          'invalid_status'
        );
      }

      const settings = await this.getOrCreateCommissionSettingsTx(tx);
      const [sellerUser] = await tx
        .select()
        .from(users)
        .where(eq(users.id, listingRow.sellerId))
        .limit(1);
      const sellerName = sellerUser?.name || currentUser.name;
      const now = new Date();

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
        const priorPlatformSalesCount = await this.getSellerPlatformSalesCountTx(
          tx,
          listingRow.sellerId
        );
        const eligibility = evaluateSellerCommissionEligibility({
          settings,
          userCreatedAt: sellerUser?.createdAt ?? currentUser.createdAt,
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
          payerName = validateRequiredText(body.payerName ?? sellerName, {
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

      const [updatedListingRow] = await tx
        .update(listings)
        .set({ status: 'Sold', updatedAt: now })
        .where(eq(listings.id, listingRow.id))
        .returning();

      await tx
        .update(sellerProfiles)
        .set({ totalSales: sql`${sellerProfiles.totalSales} + 1`, updatedAt: now })
        .where(eq(sellerProfiles.userId, listingRow.sellerId));

      const [insertedRecord] = await tx
        .insert(commissionRecords)
        .values({
          id: `cmr_${crypto.randomUUID().slice(0, 8)}`,
          kind: 'sale_commission',
          listingId: listingRow.id,
          listingTitle: listingRow.title.slice(0, 180),
          sellerId: listingRow.sellerId,
          sellerName: sellerName.slice(0, 120),
          soldViaPlatform,
          saleAmountSar: String(saleAmountSar),
          ratePercent: String(ratePercent),
          commissionAmountSar: String(commissionAmountSar),
          isExempt,
          exemptionReason,
          status,
          transferReference,
          payerName,
          transferAmountSar: transferAmountSar !== null ? String(transferAmountSar) : null,
          transferNote: transferNote || null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const adminNotifications = soldViaPlatform
        ? await this.notifyActiveAdminsTx(tx, isAdmin(currentUser) ? currentUser.id : null, {
            type: status === 'pending_review' ? 'commission_submitted' : 'commission_due',
            title:
              status === 'exempt'
                ? 'تم بيع إعلان عبر المنصة (معفى بعرض الإطلاق)'
                : status === 'pending_review'
                ? 'بيع إعلان وتأكيد حوالة عمولة بانتظار المراجعة'
                : 'إشعار إتمام بيع وعمولة مستحقة',
            body: isExempt
              ? `أغلق ${sellerName} الإعلان «${listingRow.title}» كمباع عبر المنصة بمبلغ ${saleAmountSar.toLocaleString('en-US')} ر.س (معفى من العمولة ضمن عرض الإطلاق).`
              : `أغلق ${sellerName} الإعلان «${listingRow.title}» كمباع عبر المنصة بمبلغ ${saleAmountSar.toLocaleString('en-US')} ر.س — العمولة المستحقة: ${commissionAmountSar.toLocaleString('en-US')} ر.س (${ratePercent}%).`,
            listingId: listingRow.id,
          })
        : [];

      const [hydrated] = await this.hydrateListingsBatch(tx, [updatedListingRow]);
      const nextPriorCount = await this.getSellerPlatformSalesCountTx(tx, listingRow.sellerId);
      const updatedEligibility = evaluateSellerCommissionEligibility({
        settings,
        userCreatedAt: sellerUser?.createdAt ?? currentUser.createdAt,
        priorPlatformSalesCount: nextPriorCount,
      });

      return {
        listing: hydrated,
        commissionRecord: mapDbCommissionRecord(insertedRecord),
        eligibility: updatedEligibility,
        adminNotifications,
      };
    });
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

    return this.db.transaction(async (tx) => {
      const now = new Date();
      const settings = await this.getOrCreateCommissionSettingsTx(tx);
      let mappedRecord: CommissionRecord;

      if (typeof body?.recordId === 'string' && body.recordId.trim()) {
        const [existing] = await tx
          .select()
          .from(commissionRecords)
          .where(eq(commissionRecords.id, body.recordId.trim()))
          .for('update');
        if (!existing) throw new RepositoryError(404, 'سجل العمولة غير موجود');
        if (existing.sellerId !== currentUser.id && !isAdmin(currentUser)) {
          throw new RepositoryError(403, 'غير مصرح لك بتأكيد حوالة هذا السجل');
        }
        if (existing.status === 'approved' || existing.status === 'exempt') {
          throw new RepositoryError(400, 'هذا السجل مكتمل ولا يتطلب سداداً إضافياً');
        }

        const transferAmountSar =
          body?.commissionAmountSar !== undefined &&
          body?.commissionAmountSar !== null &&
          body?.commissionAmountSar !== ''
            ? parseFinitePositiveNumber(body.commissionAmountSar, {
                label: 'المبلغ المحول',
                max: INPUT_LIMITS.listingPriceMax * 10,
                code: 'invalid_transfer_amount',
              })
            : Number(existing.commissionAmountSar || 0);

        const [updated] = await tx
          .update(commissionRecords)
          .set({
            transferReference,
            payerName,
            transferAmountSar: String(roundCurrencySar(transferAmountSar)),
            transferNote: transferNote || null,
            status: 'pending_review',
            reviewNote: null,
            updatedAt: now,
          })
          .where(eq(commissionRecords.id, existing.id))
          .returning();
        mappedRecord = mapDbCommissionRecord(updated);
      } else {
        const listingId =
          typeof body?.listingId === 'string' && body.listingId.trim()
            ? body.listingId.trim()
            : null;
        let listingTitle = 'سداد عمولة مباشرة';
        if (listingId) {
          const [listing] = await tx
            .select()
            .from(listings)
            .where(eq(listings.id, listingId))
            .limit(1);
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
          body?.commissionAmountSar !== undefined &&
          body?.commissionAmountSar !== null &&
          body?.commissionAmountSar !== ''
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

        const [inserted] = await tx
          .insert(commissionRecords)
          .values({
            id: `cmr_${crypto.randomUUID().slice(0, 8)}`,
            kind: 'sale_commission',
            listingId,
            listingTitle: listingTitle.slice(0, 180),
            sellerId: currentUser.id,
            sellerName: String(currentUser.name || '').slice(0, 120),
            soldViaPlatform: true,
            saleAmountSar: String(roundCurrencySar(saleAmountSar)),
            ratePercent: String(settings.commissionRatePercent),
            commissionAmountSar: String(roundCurrencySar(computedCommission)),
            isExempt: false,
            exemptionReason: 'none',
            status: 'pending_review',
            transferReference,
            payerName,
            transferAmountSar: String(roundCurrencySar(computedCommission)),
            transferNote: transferNote || null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        mappedRecord = mapDbCommissionRecord(inserted);
      }

      const adminNotifications = await this.notifyActiveAdminsTx(
        tx,
        isAdmin(currentUser) ? currentUser.id : null,
        {
          type: 'commission_submitted',
          title:
            mappedRecord.kind === 'featured_listing'
              ? 'تأكيد حوالة تمييز إعلان بانتظار المراجعة'
              : 'تأكيد حوالة عمولة بانتظار المراجعة',
          body: `أرسل ${currentUser.name} تأكيد حوالة بمبلغ ${Number(
            mappedRecord.transferAmountSar ?? mappedRecord.commissionAmountSar
          ).toLocaleString('en-US')} ر.س (مرجع: ${transferReference}) لـ «${mappedRecord.listingTitle}».`,
          ...(mappedRecord.listingId ? { listingId: mappedRecord.listingId } : {}),
        }
      );

      return { commissionRecord: mappedRecord, adminNotifications };
    });
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
    return this.db.transaction(async (tx) => {
      const [listingRow] = await tx
        .select()
        .from(listings)
        .where(eq(listings.id, listingId))
        .for('update');
      if (!listingRow) throw new RepositoryError(404, 'الإعلان غير موجود');
      if (!canEditListing(currentUser, listingRow)) {
        throw new RepositoryError(403, 'غير مصرح لك بطلب تمييز هذا الإعلان');
      }
      if (listingRow.isFeatured) {
        throw new RepositoryError(400, 'هذا الإعلان مميز ومثبت بالفعل في الصفحة الرئيسية');
      }
      if (
        listingRow.status === 'Sold' ||
        listingRow.status === 'Rejected' ||
        listingRow.status === 'Expired'
      ) {
        throw new RepositoryError(400, 'يمكن طلب التمييز للإعلانات النشطة أو قيد المراجعة فقط');
      }

      const settings = await this.getOrCreateCommissionSettingsTx(tx);
      const feeSar = roundCurrencySar(Number(settings.featuredWeeklyPriceSar || 35));
      const now = new Date();

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

      const nextStatus: CommissionRecord['status'] =
        feeSar <= 0 ? 'approved' : hasTransfer ? 'pending_review' : 'pending_payment';

      const [updatedListingRow] = await tx
        .update(listings)
        .set({
          featuredRequested: feeSar > 0,
          isFeatured: feeSar <= 0 ? true : listingRow.isFeatured,
          updatedAt: now,
        })
        .where(eq(listings.id, listingRow.id))
        .returning();

      const [existingRecord] = await tx
        .select()
        .from(commissionRecords)
        .where(
          and(
            eq(commissionRecords.listingId, listingRow.id),
            eq(commissionRecords.kind, 'featured_listing'),
            inArray(commissionRecords.status, ['pending_payment', 'rejected'])
          )
        )
        .limit(1);

      let savedRecord: typeof commissionRecords.$inferSelect;
      if (existingRecord) {
        const [updated] = await tx
          .update(commissionRecords)
          .set({
            commissionAmountSar: String(feeSar),
            status: nextStatus,
            transferReference,
            payerName,
            transferAmountSar: hasTransfer ? String(feeSar) : existingRecord.transferAmountSar,
            transferNote: transferNote || null,
            updatedAt: now,
          })
          .where(eq(commissionRecords.id, existingRecord.id))
          .returning();
        savedRecord = updated;
      } else {
        const [inserted] = await tx
          .insert(commissionRecords)
          .values({
            id: `cmr_${crypto.randomUUID().slice(0, 8)}`,
            kind: 'featured_listing',
            listingId: listingRow.id,
            listingTitle: listingRow.title.slice(0, 180),
            sellerId: listingRow.sellerId,
            sellerName: String(currentUser.name || '').slice(0, 120),
            soldViaPlatform: true,
            saleAmountSar: '0',
            ratePercent: '0',
            commissionAmountSar: String(feeSar),
            isExempt: feeSar <= 0,
            exemptionReason: 'none',
            status: nextStatus,
            transferReference,
            payerName,
            transferAmountSar: hasTransfer ? String(feeSar) : null,
            transferNote: transferNote || null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        savedRecord = inserted;
      }

      const adminNotifications =
        nextStatus === 'pending_review' || nextStatus === 'pending_payment'
          ? await this.notifyActiveAdminsTx(tx, isAdmin(currentUser) ? currentUser.id : null, {
              type: nextStatus === 'pending_review' ? 'commission_submitted' : 'commission_due',
              title:
                nextStatus === 'pending_review'
                  ? 'حوالة تمييز إعلان بانتظار الاعتماد'
                  : 'طلب تمييز إعلان جديد',
              body:
                nextStatus === 'pending_review'
                  ? `أرسل ${currentUser.name} حوالة تمييز إعلان «${listingRow.title}» بمبلغ ${feeSar} ر.س (مرجع: ${transferReference}).`
                  : `طلب ${currentUser.name} تمييز إعلان «${listingRow.title}» برسوم أسبوعية ${feeSar} ر.س.`,
              listingId: listingRow.id,
            })
          : [];

      const [hydrated] = await this.hydrateListingsBatch(tx, [updatedListingRow]);
      return {
        listing: hydrated,
        commissionRecord: mapDbCommissionRecord(savedRecord),
        adminNotifications,
      };
    });
  }

  async getAdminCommissions(query: {
    status?: string;
    kind?: string;
    q?: string;
    limit?: unknown;
    offset?: unknown;
  }) {
    const [settings, rows] = await Promise.all([
      this.getOrCreateCommissionSettingsTx(this.db),
      this.db.select().from(commissionRecords).orderBy(desc(commissionRecords.createdAt)),
    ]);

    const allRecords = rows.map(mapDbCommissionRecord);
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
      settings,
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
    return this.db.transaction(async (tx) => {
      const current = await this.getOrCreateCommissionSettingsTx(tx);

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
          throw new RepositoryError(
            400,
            'رسوم تمييز الإعلان الأسبوعية يجب أن تكون بين 0 و 5000 ر.س'
          );
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
      const iban = body?.iban !== undefined ? normalizeSaudiIban(body.iban) : current.iban;
      if (!isValidSaudiIban(iban)) {
        throw new RepositoryError(
          400,
          'صيغة الآيبان السعودي غير صالحة (يجب أن يبدأ بـ SA ويليه 22 رقماً)',
          'invalid_iban'
        );
      }

      const now = new Date();
      const [updatedRow] = await tx
        .update(platformSettings)
        .set({
          commissionRatePercent: String(commissionRatePercent),
          promoEnabled,
          promoFreeDays,
          promoFreeListingsCount,
          featuredWeeklyPriceSar: String(featuredWeeklyPriceSar),
          bankName,
          accountHolderName,
          iban,
          updatedAt: now,
        })
        .where(eq(platformSettings.id, 'default'))
        .returning();

      const auditEntry = createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'تحديث إعدادات العمولة والحساب البنكي',
        targetType: 'commission',
        targetId: 'default',
        note: `العمولة: ${commissionRatePercent}% | الإعفاء: ${
          promoEnabled ? `${promoFreeDays} يوم / ${promoFreeListingsCount} بيعات` : 'موقف'
        } | التمييز: ${featuredWeeklyPriceSar} ر.س`,
        createdAt: now.toISOString(),
      });
      await tx.insert(auditLogs).values({
        id: auditEntry.id,
        actorId: auditEntry.actorId,
        actorName: auditEntry.actorName,
        action: auditEntry.action,
        targetType: auditEntry.targetType,
        targetId: auditEntry.targetId,
        note: auditEntry.note ?? null,
        createdAt: now,
      });

      return { settings: mapDbCommissionSettings(updatedRow), auditEntry };
    });
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

    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(commissionRecords)
        .where(eq(commissionRecords.id, recordId))
        .for('update');
      if (!existing) throw new RepositoryError(404, 'سجل العمولة غير موجود');

      const now = new Date();
      const [updatedRecord] = await tx
        .update(commissionRecords)
        .set({
          status: nextStatus,
          reviewedBy: currentUser.id,
          reviewedAt: now,
          reviewNote,
          updatedAt: now,
        })
        .where(eq(commissionRecords.id, existing.id))
        .returning();

      let updatedListing: any | undefined;
      if (existing.kind === 'featured_listing' && existing.listingId) {
        const [listingRow] = await tx
          .update(listings)
          .set({
            isFeatured: nextStatus === 'approved',
            featuredRequested: nextStatus === 'approved' ? false : true,
            updatedAt: now,
          })
          .where(eq(listings.id, existing.listingId))
          .returning();
        if (listingRow) {
          const [hydrated] = await this.hydrateListingsBatch(tx, [listingRow]);
          updatedListing = hydrated;
        }
      }

      const notificationType =
        nextStatus === 'approved'
          ? existing.kind === 'featured_listing'
            ? 'featured_approved'
            : 'commission_approved'
          : 'commission_rejected';

      const notification = await this.insertNotificationTx(tx, {
        userId: existing.sellerId,
        type: notificationType,
        title:
          nextStatus === 'approved'
            ? existing.kind === 'featured_listing'
              ? 'تم تفعيل تمييز إعلانك في الصفحة الرئيسية'
              : 'تم اعتماد حوالة العمولة بنجاح'
            : 'مراجعة حوالة العمولة / التمييز',
        body:
          nextStatus === 'approved'
            ? existing.kind === 'featured_listing'
              ? `تم اعتماد حوالة التمييز وتثبيت إعلانك «${existing.listingTitle}» في الصفحة الرئيسية.`
              : `تم استلام واعتماد حوالة العمولة لـ «${existing.listingTitle}» — جزاك الله خيراً على أمانتك.`
            : `تعذر اعتماد تأكيد الحوالة لـ «${existing.listingTitle}»${
                reviewNote ? `: ${reviewNote}` : ''
              }. يمكنك إعادة إرسال بيانات الحوالة من لوحة التحكم.`,
        ...(existing.listingId ? { listingId: existing.listingId } : {}),
      });

      const auditEntry = createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action:
          nextStatus === 'approved'
            ? existing.kind === 'featured_listing'
              ? 'اعتماد حوالة تمييز إعلان'
              : 'اعتماد حوالة عمولة بيع'
            : 'رفض تأكيد حوالة عمولة/تمييز',
        targetType: 'commission',
        targetId: existing.id,
        note: `${existing.listingTitle} — ${existing.sellerName}${
          reviewNote ? ` (${reviewNote})` : ''
        }`,
        createdAt: now.toISOString(),
      });
      await tx.insert(auditLogs).values({
        id: auditEntry.id,
        actorId: auditEntry.actorId,
        actorName: auditEntry.actorName,
        action: auditEntry.action,
        targetType: auditEntry.targetType,
        targetId: auditEntry.targetId,
        note: auditEntry.note ?? null,
        createdAt: now,
      });

      return {
        commissionRecord: mapDbCommissionRecord(updatedRecord),
        ...(updatedListing ? { listing: updatedListing } : {}),
        auditEntry,
        sellerNotification: { userId: existing.sellerId, notification },
      };
    });
  }
}
