/**
 * Non-destructive JSON-to-PostgreSQL migration script for SouqAlGhanam 2.0.
 *
 * Preserves: users, credentials (Argon2id hashes), sessions, seller profiles,
 * regions, categories, breeds, indicative prices, articles, FAQs, listings,
 * media assets & attachments, favorites, likes & like cooldowns, conversations,
 * read states, messages, price offers, comments, seller reviews, reports,
 * notifications, and audit logs.
 *
 * Usage:
 *   npx tsx scripts/migrate-json-to-pg.ts --dry-run
 *   npx tsx scripts/migrate-json-to-pg.ts --preflight-only
 *   npx tsx scripts/migrate-json-to-pg.ts [--json-path data/store.json] [--truncate]
 *
 * Safety guarantees:
 * - Never writes to, truncates, or deletes the source store.json file.
 * - Refuses to overwrite non-empty PostgreSQL tables unless --truncate is passed.
 * - Executes inside a single PostgreSQL transaction; --dry-run rolls back at the end.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { resolvePostgresConfigFromEnv } from '../server/config';
import { buildListingNormalizedColumns } from '../server/db/arabicSearch';
import { createDb, createPgPool, verifyDatabaseStartup, type AppDatabase } from '../server/db/client';
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
} from '../server/db/schema';
import { hydrateStore, type StoreData } from '../server/domain/marketplace';
import { loadEnvForEntryPoint } from '../server/env';
import { resolveDataDir, STORE_FILE_NAME } from '../server/storage';
import { createDefaultCommissionSettings } from '../src/lib/commission';

const __filename = fileURLToPath(import.meta.url);

class DryRunRollbackSignal extends Error {
  constructor() {
    super('DRY_RUN_ROLLBACK');
  }
}

export interface PreparedMigrationSnapshot {
  counts: Record<string, number>;
  warnings: string[];
  usersRows: Array<typeof users.$inferInsert>;
  userAdminRefs: Array<{ id: string; suspendedBy: string | null; reactivatedBy: string | null }>;
  credentialRows: Array<typeof userCredentials.$inferInsert>;
  googleIdentityRows: Array<typeof googleIdentities.$inferInsert>;
  sessionRows: Array<typeof sessions.$inferInsert>;
  regionRows: Array<typeof regions.$inferInsert>;
  categoryRows: Array<typeof categories.$inferInsert>;
  breedRows: Array<typeof breeds.$inferInsert>;
  indicativePriceRows: Array<typeof indicativePrices.$inferInsert>;
  articleRows: Array<typeof articles.$inferInsert>;
  faqRows: Array<typeof faqs.$inferInsert>;
  sellerProfileRows: Array<typeof sellerProfiles.$inferInsert>;
  listingRows: Array<typeof listings.$inferInsert>;
  mediaAssetRows: Array<typeof mediaAssets.$inferInsert>;
  listingImageRows: Array<typeof listingImages.$inferInsert>;
  listingVideoRows: Array<typeof listingVideos.$inferInsert>;
  favoriteRows: Array<typeof listingFavorites.$inferInsert>;
  likeRows: Array<typeof listingLikes.$inferInsert>;
  likeCooldownRows: Array<typeof likeNotificationCooldowns.$inferInsert>;
  conversationRows: Array<typeof conversations.$inferInsert>;
  conversationReadStateRows: Array<typeof conversationReadStates.$inferInsert>;
  messageRows: Array<typeof messages.$inferInsert>;
  priceOfferRows: Array<typeof priceOffers.$inferInsert>;
  commentRows: Array<typeof listingComments.$inferInsert>;
  sellerReviewRows: Array<typeof sellerReviews.$inferInsert>;
  reportRows: Array<typeof reports.$inferInsert>;
  notificationRows: Array<typeof notifications.$inferInsert>;
  auditLogRows: Array<typeof auditLogs.$inferInsert>;
  platformSettingsRow: typeof platformSettings.$inferInsert;
  commissionRecordRows: Array<typeof commissionRecords.$inferInsert>;
}

function toDate(value: string | number | Date | null | undefined, fallback = new Date()): Date {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed);
  }
  return fallback;
}

function toNullableDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed);
  }
  return null;
}

function topologicalSortParentFirst<T extends { id: string; parentId?: string | null }>(
  items: T[],
  warnings: string[],
  label: string
): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const sorted: T[] = [];
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (item: T) => {
    const current = state.get(item.id);
    if (current === 'done') return;
    if (current === 'visiting') {
      warnings.push(`${label}: cycle detected at id="${item.id}"; breaking parent reference.`);
      return;
    }
    state.set(item.id, 'visiting');
    if (item.parentId) {
      const parent = byId.get(item.parentId);
      if (parent) {
        visit(parent);
      } else {
        warnings.push(`${label}: record "${item.id}" references missing parent "${item.parentId}"; clearing parentId.`);
      }
    }
    state.set(item.id, 'done');
    sorted.push(item);
  };

  for (const item of items) visit(item);
  return sorted;
}

/**
 * Pure transformation & FK-validation planner. Reads an in-memory clone of JSON store data
 * without ever writing back to disk.
 */
export function prepareMigrationSnapshot(rawStore: StoreData): PreparedMigrationSnapshot {
  const store = hydrateStore(structuredClone(rawStore));
  const warnings: string[] = [];

  const usersList = Array.isArray(store.users) ? store.users : [];
  const userIds = new Set(usersList.map((u) => String(u.id)));

  const usersRows: Array<typeof users.$inferInsert> = usersList.map((u) => ({
    id: String(u.id),
    phone: typeof u.phone === 'string' && u.phone.trim() ? u.phone.trim().slice(0, 20) : null,
    email: String(u.email || `${u.phone || u.id}@souqalghanam.sa`).slice(0, 255),
    name: String(u.name || 'مستخدم').slice(0, 80),
    role: u.role === 'admin' || u.role === 'seller' ? u.role : 'buyer',
    status: u.status === 'suspended' ? 'suspended' : 'active',
    isDemo: Boolean(u.isDemo),
    phoneVerifiedAt: toNullableDate(u.phoneVerifiedAt),
    suspendedAt: toNullableDate(u.suspendedAt),
    suspendedBy: null,
    suspensionReason: u.suspensionReason ?? null,
    reactivatedAt: toNullableDate(u.reactivatedAt),
    reactivatedBy: null,
    createdAt: toDate(u.createdAt),
    updatedAt: toDate(u.updatedAt || u.createdAt),
  }));

  const userAdminRefs = usersList
    .filter((u) => Boolean(u.suspendedBy) || Boolean(u.reactivatedBy))
    .map((u) => {
      const suspendedBy = u.suspendedBy && userIds.has(u.suspendedBy) ? String(u.suspendedBy) : null;
      const reactivatedBy =
        u.reactivatedBy && userIds.has(u.reactivatedBy) ? String(u.reactivatedBy) : null;
      if (u.suspendedBy && !suspendedBy) {
        warnings.push(`users: suspendedBy="${u.suspendedBy}" missing for user "${u.id}"; nulled.`);
      }
      if (u.reactivatedBy && !reactivatedBy) {
        warnings.push(`users: reactivatedBy="${u.reactivatedBy}" missing for user "${u.id}"; nulled.`);
      }
      return { id: String(u.id), suspendedBy, reactivatedBy };
    })
    .filter((r) => r.suspendedBy !== null || r.reactivatedBy !== null);

  const credentialRows: Array<typeof userCredentials.$inferInsert> = [];
  for (const c of store.credentials || []) {
    if (!userIds.has(c.userId)) {
      warnings.push(`user_credentials: skipped orphan credential for missing user "${c.userId}".`);
      continue;
    }
    credentialRows.push({
      userId: String(c.userId),
      passwordHash: String(c.passwordHash),
      updatedAt: toDate(c.updatedAt),
    });
  }

  const googleIdentityRows: Array<typeof googleIdentities.$inferInsert> = [];
  const seenGoogleSubjects = new Set<string>();
  const seenGoogleUsers = new Set<string>();
  for (const g of store.googleIdentities || []) {
    if (!userIds.has(g.userId)) {
      warnings.push(`google_identities: skipped orphan identity "${g.id}" for missing user "${g.userId}".`);
      continue;
    }
    const subject = String(g.subject || '').trim();
    if (!subject || seenGoogleSubjects.has(subject) || seenGoogleUsers.has(g.userId)) {
      warnings.push(`google_identities: skipped duplicate/invalid identity "${g.id}".`);
      continue;
    }
    seenGoogleSubjects.add(subject);
    seenGoogleUsers.add(g.userId);
    googleIdentityRows.push({
      id: String(g.id),
      userId: String(g.userId),
      provider: 'google',
      subject: subject.slice(0, 255),
      email: String(g.email || '').trim().toLowerCase().slice(0, 255),
      emailVerified: Boolean(g.emailVerified),
      name: String(g.name || 'مستخدم').slice(0, 120),
      pictureUrl: g.pictureUrl ? String(g.pictureUrl) : null,
      createdAt: toDate(g.createdAt),
      updatedAt: toDate(g.updatedAt || g.createdAt),
    });
  }

  const sessionRows: Array<typeof sessions.$inferInsert> = [];
  for (const s of store.sessions || []) {
    if (!userIds.has(s.userId)) {
      warnings.push(`sessions: skipped orphan session "${s.id}" for missing user "${s.userId}".`);
      continue;
    }
    sessionRows.push({
      id: String(s.id),
      userId: String(s.userId),
      createdAt: toDate(s.createdAt),
      lastSeenAt: toDate(s.lastSeenAt),
      expiresAt: toDate(s.expiresAt),
      ip: s.ip ? String(s.ip).slice(0, 64) : null,
      userAgent: s.userAgent ? String(s.userAgent).slice(0, 200) : null,
    });
  }

  const orderedRegions = topologicalSortParentFirst(store.regions || [], warnings, 'regions');
  const regionIds = new Set(orderedRegions.map((r) => r.id));
  const regionRows: Array<typeof regions.$inferInsert> = orderedRegions.map((r, index) => ({
    id: String(r.id),
    name: String(r.name).slice(0, 100),
    parentId: r.parentId && regionIds.has(r.parentId) ? String(r.parentId) : null,
    sortOrder: typeof r.sortOrder === 'number' ? r.sortOrder : index,
  }));

  const orderedCategories = topologicalSortParentFirst(
    store.categories || [],
    warnings,
    'categories'
  );
  const categoryIds = new Set(orderedCategories.map((c) => c.id));
  const categoryRows: Array<typeof categories.$inferInsert> = orderedCategories.map((c, index) => ({
    id: String(c.id),
    name: String(c.name).slice(0, 80),
    slug: String(c.slug || c.id).slice(0, 100),
    parentId: c.parentId && categoryIds.has(c.parentId) ? String(c.parentId) : null,
    description: String(c.description || ''),
    keywords: Array.isArray(c.keywords) ? c.keywords.map(String) : [],
    sortOrder: typeof c.sortOrder === 'number' ? c.sortOrder : index,
  }));

  const breedRows: Array<typeof breeds.$inferInsert> = [];
  const breedIds = new Set<string>();
  const categoryMap = new Map(categoryRows.map((c) => [c.id, c]));
  const regionMap = new Map(regionRows.map((r) => [r.id, r]));

  for (const b of store.breeds || []) {
    if (!categoryIds.has(b.categoryId)) {
      warnings.push(`breeds: skipped breed "${b.id}" referencing missing category "${b.categoryId}".`);
      continue;
    }
    breedIds.add(String(b.id));
    breedRows.push({
      id: String(b.id),
      categoryId: String(b.categoryId),
      name: String(b.name).slice(0, 80),
      slug: String(b.slug || b.id).slice(0, 100),
      origin: String(b.origin || 'المملكة العربية السعودية').slice(0, 120),
      summary: String(b.summary || ''),
      avgWeightKg: String(b.avgWeightKg || '').slice(0, 60),
      priceRangeSar: String(b.priceRangeSar || '').slice(0, 60),
      imageUrl: String(b.imageUrl || ''),
      characteristics: Array.isArray(b.characteristics) ? b.characteristics.map(String) : [],
    });
  }
  const breedMap = new Map(breedRows.map((b) => [b.id, b]));

  const indicativePriceRows: Array<typeof indicativePrices.$inferInsert> = [];
  for (const p of store.indicativePrices || []) {
    if (!breedIds.has(p.breedId)) {
      warnings.push(`indicative_prices: skipped "${p.id}" referencing missing breed "${p.breedId}".`);
      continue;
    }
    indicativePriceRows.push({
      id: String(p.id),
      breedId: String(p.breedId),
      breedName: String(p.breedName).slice(0, 100),
      categoryName: String(p.categoryName).slice(0, 80),
      ageGroup: String(p.ageGroup).slice(0, 100),
      minPrice: String(Number(p.minPrice || 0)),
      maxPrice: String(Number(p.maxPrice || 0)),
      avgPrice: String(Number(p.avgPrice || 0)),
      trend: p.trend === 'up' || p.trend === 'down' ? p.trend : 'stable',
      regionNote: String(p.regionNote || '').slice(0, 160),
      updatedAt: toDate(p.updatedAt),
    });
  }

  const articleRows: Array<typeof articles.$inferInsert> = (store.articles || []).map((a) => ({
    id: String(a.id),
    title: String(a.title).slice(0, 200),
    category: String(a.category).slice(0, 80),
    readTimeMinutes: Math.max(1, Number(a.readTimeMinutes || 1)),
    publishedAt: toDate(a.publishedAt),
    excerpt: String(a.excerpt || ''),
    content: String(a.content || ''),
    imageUrl: String(a.imageUrl || ''),
  }));

  const faqRows: Array<typeof faqs.$inferInsert> = (store.faqs || []).map((f, index) => ({
    id: String(f.id),
    question: String(f.question),
    answer: String(f.answer),
    sortOrder: typeof f.sortOrder === 'number' ? f.sortOrder : index,
  }));

  const sellerProfileRows: Array<typeof sellerProfiles.$inferInsert> = [];
  const sellerIds = new Set<string>();
  const defaultRegionId = regionRows[0]?.id;

  for (const s of store.sellers || []) {
    if (!userIds.has(s.userId)) {
      warnings.push(`seller_profiles: skipped profile for missing user "${s.userId}".`);
      continue;
    }
    const regionId = regionIds.has(s.regionId) ? String(s.regionId) : defaultRegionId;
    if (!regionId) {
      warnings.push(`seller_profiles: skipped "${s.userId}" because no regions exist.`);
      continue;
    }
    if (!regionIds.has(s.regionId)) {
      warnings.push(`seller_profiles: seller "${s.userId}" referenced missing region "${s.regionId}"; mapped to "${regionId}".`);
    }
    const reviewedBy =
      s.verificationReviewedBy && userIds.has(s.verificationReviewedBy)
        ? String(s.verificationReviewedBy)
        : null;
    sellerIds.add(String(s.userId));
    sellerProfileRows.push({
      userId: String(s.userId),
      displayName: String(s.displayName || '').slice(0, 120),
      bio: String(s.bio || ''),
      regionId,
      city: String(s.city || '').slice(0, 80),
      phone: String(s.phone || '').slice(0, 20),
      whatsapp: String(s.whatsapp || '').slice(0, 25),
      verificationStatus:
        s.verificationStatus === 'Verified' || s.verificationStatus === 'Rejected'
          ? s.verificationStatus
          : 'Pending',
      verifiedAt: toNullableDate(s.verifiedAt),
      verificationNote: s.verificationNote ?? null,
      verificationRequestedAt: toNullableDate(s.verificationRequestedAt),
      verificationReviewedAt: toNullableDate(s.verificationReviewedAt),
      verificationReviewedBy: reviewedBy,
      yearsExperience: Math.min(100, Math.max(0, Number(s.yearsExperience || 0))),
      specialty: String(s.specialty || '').slice(0, 120),
      rating: String(Number(s.rating || 0).toFixed(1)),
      ratingCount: Math.max(0, Number(s.ratingCount || 0)),
      totalSales: Math.max(0, Number(s.totalSales || 0)),
      createdAt: toDate(s.createdAt),
      updatedAt: toDate(s.updatedAt || s.createdAt),
    });
  }
  const sellerMap = new Map(sellerProfileRows.map((s) => [s.userId, s]));

  // Pre-compute deduplicated likes per listing so listings.likesCount matches listing_likes rows exactly.
  const likesMap = store.likes || {};
  const listingIdsRaw = new Set((store.listings || []).map((l) => String(l.id)));
  const likesByListing = new Map<string, string[]>();
  for (const [listingId, likers] of Object.entries(likesMap)) {
    if (!listingIdsRaw.has(listingId) || !Array.isArray(likers)) continue;
    const validLikers = Array.from(new Set(likers.filter((uid) => userIds.has(uid))));
    if (validLikers.length > 0) {
      likesByListing.set(listingId, validLikers);
    }
  }

  const listingRows: Array<typeof listings.$inferInsert> = [];
  const listingIds = new Set<string>();
  const usedSlugs = new Set<string>();

  for (const l of store.listings || []) {
    if (!userIds.has(l.sellerId) || !breedIds.has(l.breedId) || !categoryIds.has(l.categoryId) || !regionIds.has(l.regionId)) {
      warnings.push(`listings: skipped listing "${l.id}" due to missing foreign key reference.`);
      continue;
    }
    const subCatId =
      l.subCategoryId && categoryIds.has(l.subCategoryId) ? String(l.subCategoryId) : null;
    const breed = breedMap.get(String(l.breedId));
    const cat = categoryMap.get(String(l.categoryId));
    const subCat = subCatId ? categoryMap.get(subCatId) : undefined;
    const reg = regionMap.get(String(l.regionId));
    const seller = sellerMap.get(String(l.sellerId));

    const { cityNorm, searchDoc } = buildListingNormalizedColumns(
      {
        title: String(l.title || ''),
        description: String(l.description || ''),
        city: String(l.city || ''),
      },
      {
        breedName: breed?.name || '',
        categoryName: cat?.name || '',
        subCategoryName: subCat?.name || '',
        regionName: reg?.name || '',
        sellerDisplayName: seller?.displayName || '',
      }
    );

    let slug = String(l.slug || l.id).slice(0, 180);
    if (usedSlugs.has(slug)) {
      slug = `${slug.slice(0, 160)}-${String(l.id).slice(-8)}`;
    }
    usedSlugs.add(slug);

    const priceAmountNum = Math.max(0.01, Number(l.priceAmount || 0));
    const expectedPriceNum =
      l.expectedPrice !== null &&
      l.expectedPrice !== undefined &&
      Number(l.expectedPrice) > 0 &&
      Number(l.expectedPrice) <= priceAmountNum
        ? Number(l.expectedPrice)
        : null;

    const likesCount = (likesByListing.get(String(l.id)) || []).length;
    listingIds.add(String(l.id));
    listingRows.push({
      id: String(l.id),
      sellerId: String(l.sellerId),
      categoryId: String(l.categoryId),
      subCategoryId: subCatId,
      breedId: String(l.breedId),
      regionId: String(l.regionId),
      city: String(l.city || 'الرياض').slice(0, 80),
      cityNorm,
      title: String(l.title || '').slice(0, 160),
      slug,
      description: String(l.description || ''),
      searchDoc,
      priceAmount: String(priceAmountNum),
      expectedPrice: expectedPriceNum !== null ? String(expectedPriceNum) : null,
      currency: 'SAR',
      sex:
        l.sex === 'أنثى' || l.sex === 'قطيع مختلط' || l.sex === 'ذكر' ? l.sex : 'ذكر',
      ageMonths: Math.min(360, Math.max(0, Math.round(Number(l.ageMonths ?? 8)))),
      weightKg: String(Math.min(2000, Math.max(0.1, Number(l.weightKg ?? 40)))),
      quantity: Math.min(100_000, Math.max(1, Math.round(Number(l.quantity ?? 1)))),
      isNegotiable: Boolean(l.isNegotiable),
      allowPriceOffers: Boolean(l.allowPriceOffers),
      vaccinated: Boolean(l.vaccinated),
      status: ['Draft', 'Pending', 'Published', 'Rejected', 'Sold', 'Expired'].includes(l.status)
        ? l.status
        : 'Pending',
      rejectionReason: l.rejectionReason ?? null,
      isFeatured: Boolean(l.isFeatured),
      commissionPledgeAccepted: Boolean(l.commissionPledgeAccepted),
      featuredRequested: Boolean(l.featuredRequested),
      likesCount,
      publishedAt: toNullableDate(l.publishedAt),
      createdAt: toDate(l.createdAt),
      updatedAt: toDate(l.updatedAt || l.createdAt),
    });
  }

  const mediaAssetRows: Array<typeof mediaAssets.$inferInsert> = [];
  const mediaIds = new Set<string>();
  const videoListingsSeen = new Set<string>();

  for (const m of store.media || []) {
    if (!userIds.has(m.uploaderId)) {
      warnings.push(`media_assets: skipped "${m.id}" for missing uploader "${m.uploaderId}".`);
      continue;
    }
    const lid = m.listingId && listingIds.has(m.listingId) ? String(m.listingId) : null;
    if (m.listingId && !lid) {
      warnings.push(`media_assets: asset "${m.id}" pointed to missing listing "${m.listingId}"; unbound.`);
    }
    if (lid && m.kind === 'video') {
      if (videoListingsSeen.has(lid)) {
        warnings.push(`media_assets: duplicate video asset "${m.id}" for listing "${lid}"; unbound.`);
        continue;
      }
      videoListingsSeen.add(lid);
    }
    mediaIds.add(String(m.id));
    const provider =
      m.storageProvider === 's3' || m.storageProvider === 'r2' || m.storageProvider === 'gcs'
        ? m.storageProvider
        : 'local';
    mediaAssetRows.push({
      id: String(m.id),
      storageProvider: provider,
      bucket: m.bucket ? String(m.bucket).slice(0, 128) : null,
      objectKey: String(m.objectKey || m.filename),
      filename: String(m.filename).slice(0, 128),
      url: String(m.url),
      kind: m.kind === 'video' ? 'video' : 'image',
      mimeType: String(m.mimeType).slice(0, 64),
      sizeBytes: Math.max(1, Number(m.sizeBytes || 1)),
      sha256Hex: typeof m.sha256Hex === 'string' && /^[a-f0-9]{64}$/i.test(m.sha256Hex) ? m.sha256Hex.toLowerCase() : null,
      originalName: String(m.originalName || m.filename).slice(0, 120),
      uploaderId: String(m.uploaderId),
      listingId: lid,
      createdAt: toDate(m.createdAt),
    });
  }

  const listingImageRows: Array<typeof listingImages.$inferInsert> = [];
  const listingVideoRows: Array<typeof listingVideos.$inferInsert> = [];
  const seenImageIds = new Set<string>();

  for (const l of store.listings || []) {
    if (!listingIds.has(l.id)) continue;
    const rawImgs = Array.isArray(l.images) ? l.images.slice(0, 8) : [];
    rawImgs.forEach((img: any, index: number) => {
      const pos = index + 1;
      const mediaId = img.mediaId && mediaIds.has(img.mediaId) ? String(img.mediaId) : null;
      let rowId = String(img.id || `img_${l.id}_${pos}`);
      if (seenImageIds.has(rowId)) {
        rowId = `${rowId}_${l.id}_${pos}`;
      }
      seenImageIds.add(rowId);
      listingImageRows.push({
        id: rowId,
        listingId: String(l.id),
        mediaId,
        url: String(img.url || ''),
        position: pos,
      });
    });

    if (l.video && l.video.url && l.video.mediaId && mediaIds.has(l.video.mediaId)) {
      listingVideoRows.push({
        id: String(l.video.id || `vid_${l.id}`),
        listingId: String(l.id),
        mediaId: String(l.video.mediaId),
        url: String(l.video.url),
        mimeType: String(l.video.mimeType || 'video/mp4').slice(0, 64),
        sizeBytes: Math.max(1, Number(l.video.sizeBytes || 1)),
        originalName: l.video.originalName ? String(l.video.originalName).slice(0, 120) : null,
      });
    } else if (l.video && (!l.video.mediaId || !mediaIds.has(l.video.mediaId))) {
      warnings.push(`listing_videos: skipped video for listing "${l.id}" because media_asset is missing.`);
    }
  }

  const favoriteRows: Array<typeof listingFavorites.$inferInsert> = [];
  const seenFavs = new Set<string>();
  for (const [uid, favListingIds] of Object.entries(store.favorites || {})) {
    if (!userIds.has(uid) || !Array.isArray(favListingIds)) continue;
    for (const lid of favListingIds) {
      if (!listingIds.has(lid)) continue;
      const key = `${uid}::${lid}`;
      if (seenFavs.has(key)) continue;
      seenFavs.add(key);
      favoriteRows.push({ userId: uid, listingId: lid, createdAt: new Date() });
    }
  }

  const likeRows: Array<typeof listingLikes.$inferInsert> = [];
  for (const [lid, likerIds] of likesByListing.entries()) {
    for (const uid of likerIds) {
      likeRows.push({ listingId: lid, userId: uid, createdAt: new Date() });
    }
  }

  const likeCooldownRows: Array<typeof likeNotificationCooldowns.$inferInsert> = [];
  for (const [key, ts] of Object.entries(store.likeNotificationHistory || {})) {
    const sep = key.lastIndexOf(':');
    if (sep <= 0) continue;
    const lid = key.slice(0, sep);
    const actorId = key.slice(sep + 1);
    if (!listingIds.has(lid) || !userIds.has(actorId)) continue;
    const dt = toNullableDate(ts);
    if (!dt) continue;
    likeCooldownRows.push({ listingId: lid, actorId, lastNotifiedAt: dt });
  }

  const conversationRows: Array<typeof conversations.$inferInsert> = [];
  const conversationIds = new Set<string>();
  const seenConvPair = new Set<string>();
  const conversationReadStateRows: Array<typeof conversationReadStates.$inferInsert> = [];
  const messageRows: Array<typeof messages.$inferInsert> = [];

  for (const c of store.conversations || []) {
    if (
      !listingIds.has(c.listingId) ||
      !userIds.has(c.buyerId) ||
      !userIds.has(c.sellerId) ||
      c.buyerId === c.sellerId
    ) {
      warnings.push(`conversations: skipped invalid/orphan conversation "${c.id}".`);
      continue;
    }
    const pairKey = `${c.listingId}::${c.buyerId}`;
    if (seenConvPair.has(pairKey)) {
      warnings.push(`conversations: skipped duplicate listing+buyer pair "${c.id}".`);
      continue;
    }
    seenConvPair.add(pairKey);
    conversationIds.add(String(c.id));

    const firstMsgDate =
      Array.isArray(c.messages) && c.messages[0]?.createdAt ? c.messages[0].createdAt : c.updatedAt;
    conversationRows.push({
      id: String(c.id),
      listingId: String(c.listingId),
      buyerId: String(c.buyerId),
      sellerId: String(c.sellerId),
      createdAt: toDate(firstMsgDate),
      updatedAt: toDate(c.updatedAt),
    });

    if (c.readAtByUserId && typeof c.readAtByUserId === 'object') {
      for (const [uid, iso] of Object.entries(c.readAtByUserId as Record<string, string>)) {
        if (!userIds.has(uid)) continue;
        const dt = toNullableDate(iso);
        if (!dt) continue;
        conversationReadStateRows.push({
          conversationId: String(c.id),
          userId: uid,
          lastReadAt: dt,
        });
      }
    }

    for (const m of c.messages || []) {
      if (!userIds.has(m.senderId)) {
        warnings.push(`messages: skipped message "${m.id}" from missing user "${m.senderId}".`);
        continue;
      }
      const body = String(m.body || '').slice(0, 2000);
      if (!body) continue;
      messageRows.push({
        id: String(m.id),
        conversationId: String(c.id),
        senderId: String(m.senderId),
        body,
        createdAt: toDate(m.createdAt),
      });
    }
  }

  const priceOfferRows: Array<typeof priceOffers.$inferInsert> = [];
  for (const o of store.priceOffers || []) {
    if (
      !listingIds.has(o.listingId) ||
      !userIds.has(o.buyerId) ||
      !userIds.has(o.sellerId) ||
      o.buyerId === o.sellerId
    ) {
      warnings.push(`price_offers: skipped invalid/orphan offer "${o.id}".`);
      continue;
    }
    priceOfferRows.push({
      id: String(o.id),
      listingId: String(o.listingId),
      buyerId: String(o.buyerId),
      buyerName: String(o.buyerName || 'مشتري').slice(0, 80),
      sellerId: String(o.sellerId),
      offeredPrice: String(Math.max(1, Number(o.offeredPrice || 1))),
      quantity: Math.max(1, Math.round(Number(o.quantity || 1))),
      note: String(o.note || ''),
      status: o.status === 'accepted' || o.status === 'rejected' ? o.status : 'pending',
      createdAt: toDate(o.createdAt),
      updatedAt: toDate(o.updatedAt || o.createdAt),
    });
  }

  const orderedComments = topologicalSortParentFirst(
    (store.comments || []).filter((c) => listingIds.has(c.listingId) && userIds.has(c.authorId)),
    warnings,
    'listing_comments'
  );
  const commentIds = new Set(orderedComments.map((c) => c.id));
  const commentRows: Array<typeof listingComments.$inferInsert> = orderedComments.map((c) => ({
    id: String(c.id),
    listingId: String(c.listingId),
    parentId: c.parentId && commentIds.has(c.parentId) ? String(c.parentId) : null,
    authorId: String(c.authorId),
    authorName: String(c.authorName || 'مستخدم').slice(0, 120),
    body: String(c.body),
    isEdited: Boolean(c.isEdited),
    createdAt: toDate(c.createdAt),
    updatedAt: toDate(c.updatedAt || c.createdAt),
  }));

  const sellerReviewRows: Array<typeof sellerReviews.$inferInsert> = [];
  const seenReviews = new Set<string>();
  for (const r of store.sellerReviews || []) {
    if (!sellerIds.has(r.sellerId) || !userIds.has(r.reviewerId) || r.sellerId === r.reviewerId) {
      warnings.push(`seller_reviews: skipped invalid/orphan review "${r.id}".`);
      continue;
    }
    const pairKey = `${r.sellerId}::${r.reviewerId}`;
    if (seenReviews.has(pairKey)) continue;
    seenReviews.add(pairKey);
    const rating = Math.min(5, Math.max(1, Math.round(Number(r.rating || 5))));
    sellerReviewRows.push({
      id: String(r.id),
      sellerId: String(r.sellerId),
      reviewerId: String(r.reviewerId),
      reviewerName: String(r.reviewerName || 'مستخدم').slice(0, 80),
      rating,
      comment: String(r.comment || ''),
      createdAt: toDate(r.createdAt),
      updatedAt: toDate(r.updatedAt || r.createdAt),
    });
  }

  const reportRows: Array<typeof reports.$inferInsert> = [];
  for (const rep of store.reports || []) {
    if (!userIds.has(rep.reporterId) || !listingIds.has(rep.listingId)) {
      warnings.push(`reports: skipped orphan report "${rep.id}".`);
      continue;
    }
    const commentId =
      rep.commentId && commentIds.has(rep.commentId) ? String(rep.commentId) : null;
    const resolvedBy =
      rep.resolvedBy && userIds.has(rep.resolvedBy) ? String(rep.resolvedBy) : null;
    reportRows.push({
      id: String(rep.id),
      targetType: rep.targetType === 'comment' && commentId ? 'comment' : 'listing',
      reporterId: String(rep.reporterId),
      listingId: String(rep.listingId),
      commentId,
      reason: String(rep.reason || '').slice(0, 160),
      details: String(rep.details || ''),
      status:
        rep.status === 'resolved' || rep.status === 'dismissed' ? rep.status : 'open',
      createdAt: toDate(rep.createdAt),
      resolvedAt: toNullableDate(rep.resolvedAt),
      resolvedBy,
      resolutionNote: rep.resolutionNote ?? null,
    });
  }

  const notificationRows: Array<typeof notifications.$inferInsert> = [];
  for (const n of store.notifications || []) {
    if (!userIds.has(n.userId)) {
      warnings.push(`notifications: skipped orphan notification "${n.id}".`);
      continue;
    }
    notificationRows.push({
      id: String(n.id),
      userId: String(n.userId),
      type: String(n.type),
      title: String(n.title).slice(0, 160),
      body: String(n.body),
      listingId: n.listingId && listingIds.has(n.listingId) ? String(n.listingId) : null,
      conversationId:
        n.conversationId && conversationIds.has(n.conversationId) ? String(n.conversationId) : null,
      commentId: n.commentId && commentIds.has(n.commentId) ? String(n.commentId) : null,
      isRead: Boolean(n.read),
      createdAt: toDate(n.createdAt),
    });
  }

  const auditLogRows: Array<typeof auditLogs.$inferInsert> = (store.auditLogs || []).map((a) => ({
    id: String(a.id),
    actorId: a.actorId ? String(a.actorId) : null,
    actorName: String(a.actorName || 'system').slice(0, 80),
    action: String(a.action).slice(0, 120),
    targetType: String(a.targetType).slice(0, 32),
    targetId: String(a.targetId),
    note: a.note ?? null,
    createdAt: toDate(a.createdAt),
  }));

  const rawSettings = store.commissionSettings || createDefaultCommissionSettings();
  const platformSettingsRow: typeof platformSettings.$inferInsert = {
    id: 'default',
    commissionRatePercent: String(Number(rawSettings.commissionRatePercent ?? 1)),
    promoEnabled: Boolean(rawSettings.promoEnabled),
    promoFreeDays: Math.max(0, Math.min(365, Math.round(Number(rawSettings.promoFreeDays ?? 30)))),
    promoFreeListingsCount: Math.max(
      0,
      Math.min(100, Math.round(Number(rawSettings.promoFreeListingsCount ?? 2)))
    ),
    featuredWeeklyPriceSar: String(Math.max(0, Number(rawSettings.featuredWeeklyPriceSar ?? 35))),
    bankName: String(rawSettings.bankName || '').slice(0, 120),
    accountHolderName: String(rawSettings.accountHolderName || '').slice(0, 160),
    iban: String(rawSettings.iban || '').slice(0, 34),
    updatedAt: toDate(rawSettings.updatedAt),
  };

  const commissionRecordRows: Array<typeof commissionRecords.$inferInsert> = [];
  for (const cr of store.commissionRecords || []) {
    if (!userIds.has(cr.sellerId)) {
      warnings.push(`commission_records: skipped orphan record "${cr.id}" for missing seller "${cr.sellerId}".`);
      continue;
    }
    commissionRecordRows.push({
      id: String(cr.id),
      kind: cr.kind === 'featured_listing' ? 'featured_listing' : 'sale_commission',
      listingId: cr.listingId && listingIds.has(cr.listingId) ? String(cr.listingId) : null,
      listingTitle: String(cr.listingTitle || '').slice(0, 180),
      sellerId: String(cr.sellerId),
      sellerName: String(cr.sellerName || '').slice(0, 120),
      soldViaPlatform: Boolean(cr.soldViaPlatform),
      saleAmountSar: String(Math.max(0, Number(cr.saleAmountSar || 0))),
      ratePercent: String(Math.max(0, Number(cr.ratePercent || 0))),
      commissionAmountSar: String(Math.max(0, Number(cr.commissionAmountSar || 0))),
      isExempt: Boolean(cr.isExempt),
      exemptionReason: ['none', 'promo_days', 'promo_free_listings', 'not_sold_via_platform'].includes(
        String(cr.exemptionReason)
      )
        ? String(cr.exemptionReason)
        : 'none',
      status: [
        'exempt',
        'pending_payment',
        'pending_review',
        'approved',
        'rejected',
        'not_applicable',
      ].includes(String(cr.status))
        ? String(cr.status)
        : 'pending_payment',
      transferReference: cr.transferReference ? String(cr.transferReference).slice(0, 120) : null,
      payerName: cr.payerName ? String(cr.payerName).slice(0, 120) : null,
      transferAmountSar:
        cr.transferAmountSar !== null && cr.transferAmountSar !== undefined
          ? String(Math.max(0, Number(cr.transferAmountSar)))
          : null,
      transferNote: cr.transferNote ? String(cr.transferNote) : null,
      reviewedBy: cr.reviewedBy && userIds.has(cr.reviewedBy) ? String(cr.reviewedBy) : null,
      reviewedAt: toNullableDate(cr.reviewedAt),
      reviewNote: cr.reviewNote ? String(cr.reviewNote) : null,
      createdAt: toDate(cr.createdAt),
      updatedAt: toDate(cr.updatedAt || cr.createdAt),
    });
  }

  const counts: Record<string, number> = {
    users: usersRows.length,
    user_credentials: credentialRows.length,
    google_identities: googleIdentityRows.length,
    sessions: sessionRows.length,
    regions: regionRows.length,
    categories: categoryRows.length,
    breeds: breedRows.length,
    indicative_prices: indicativePriceRows.length,
    articles: articleRows.length,
    faqs: faqRows.length,
    seller_profiles: sellerProfileRows.length,
    listings: listingRows.length,
    media_assets: mediaAssetRows.length,
    listing_images: listingImageRows.length,
    listing_videos: listingVideoRows.length,
    listing_favorites: favoriteRows.length,
    listing_likes: likeRows.length,
    like_notification_cooldowns: likeCooldownRows.length,
    conversations: conversationRows.length,
    conversation_read_states: conversationReadStateRows.length,
    messages: messageRows.length,
    price_offers: priceOfferRows.length,
    listing_comments: commentRows.length,
    seller_reviews: sellerReviewRows.length,
    reports: reportRows.length,
    notifications: notificationRows.length,
    audit_logs: auditLogRows.length,
    platform_settings: 1,
    commission_records: commissionRecordRows.length,
  };

  return {
    counts,
    warnings,
    usersRows,
    userAdminRefs,
    credentialRows,
    googleIdentityRows,
    sessionRows,
    regionRows,
    categoryRows,
    breedRows,
    indicativePriceRows,
    articleRows,
    faqRows,
    sellerProfileRows,
    listingRows,
    mediaAssetRows,
    listingImageRows,
    listingVideoRows,
    favoriteRows,
    likeRows,
    likeCooldownRows,
    conversationRows,
    conversationReadStateRows,
    messageRows,
    priceOfferRows,
    commentRows,
    sellerReviewRows,
    reportRows,
    notificationRows,
    auditLogRows,
    platformSettingsRow,
    commissionRecordRows,
  };
}

async function insertInChunks<T>(rows: T[], fn: (chunk: T[]) => Promise<void>, chunkSize = 250) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    await fn(rows.slice(i, i + chunkSize));
  }
}

export async function executeMigration(
  db: AppDatabase,
  snapshot: PreparedMigrationSnapshot,
  opts: { dryRun: boolean; truncate: boolean }
): Promise<{ committed: boolean; counts: Record<string, number> }> {
  let committed = false;

  try {
    await db.transaction(async (tx) => {
      const existingCheck = await tx.execute<{ total: string }>(
        sql`SELECT (
          (SELECT count(*) FROM users) +
          (SELECT count(*) FROM listings) +
          (SELECT count(*) FROM categories) +
          (SELECT count(*) FROM breeds) +
          (SELECT count(*) FROM regions)
        )::text AS total`
      );
      const existingRows = Number(existingCheck.rows[0]?.total || 0);

      if (existingRows > 0 && !opts.truncate) {
        throw new Error(
          `Target PostgreSQL database is not empty (${existingRows} core rows detected). Refusing to overwrite without --truncate.`
        );
      }

      if (opts.truncate) {
        await tx.execute(
          sql`TRUNCATE TABLE
            commission_records,
            platform_settings,
            audit_logs,
            notifications,
            reports,
            seller_reviews,
            listing_comments,
            price_offers,
            messages,
            conversation_read_states,
            conversations,
            like_notification_cooldowns,
            listing_likes,
            listing_favorites,
            listing_videos,
            listing_images,
            media_assets,
            listings,
            seller_profiles,
            indicative_prices,
            breeds,
            categories,
            regions,
            articles,
            faqs,
            sessions,
            google_identities,
            user_credentials,
            users
          CASCADE`
        );
      }

      // 1. Users & self-referential suspension/reactivation references
      await insertInChunks(snapshot.usersRows, async (chunk) => {
        await tx.insert(users).values(chunk);
      });
      for (const ref of snapshot.userAdminRefs) {
        await tx
          .update(users)
          .set({ suspendedBy: ref.suspendedBy, reactivatedBy: ref.reactivatedBy })
          .where(eq(users.id, ref.id));
      }

      // 2. Credentials, external identities & sessions
      await insertInChunks(snapshot.credentialRows, async (chunk) => {
        await tx.insert(userCredentials).values(chunk);
      });
      await insertInChunks(snapshot.googleIdentityRows, async (chunk) => {
        await tx.insert(googleIdentities).values(chunk);
      });
      await insertInChunks(snapshot.sessionRows, async (chunk) => {
        await tx.insert(sessions).values(chunk);
      });

      // 3. Reference taxonomy & editorial tables (parent-first order)
      for (const row of snapshot.regionRows) {
        await tx.insert(regions).values(row);
      }
      for (const row of snapshot.categoryRows) {
        await tx.insert(categories).values(row);
      }
      await insertInChunks(snapshot.breedRows, async (chunk) => {
        await tx.insert(breeds).values(chunk);
      });
      await insertInChunks(snapshot.indicativePriceRows, async (chunk) => {
        await tx.insert(indicativePrices).values(chunk);
      });
      await insertInChunks(snapshot.articleRows, async (chunk) => {
        await tx.insert(articles).values(chunk);
      });
      await insertInChunks(snapshot.faqRows, async (chunk) => {
        await tx.insert(faqs).values(chunk);
      });

      // 4. Seller profiles & listings
      await insertInChunks(snapshot.sellerProfileRows, async (chunk) => {
        await tx.insert(sellerProfiles).values(chunk);
      });
      await insertInChunks(snapshot.listingRows, async (chunk) => {
        await tx.insert(listings).values(chunk);
      });

      // 5. Media assets, listing images & videos
      await insertInChunks(snapshot.mediaAssetRows, async (chunk) => {
        await tx.insert(mediaAssets).values(chunk);
      });
      await insertInChunks(snapshot.listingImageRows, async (chunk) => {
        await tx.insert(listingImages).values(chunk);
      });
      await insertInChunks(snapshot.listingVideoRows, async (chunk) => {
        await tx.insert(listingVideos).values(chunk);
      });

      // 6. Favorites, likes & cooldowns
      await insertInChunks(snapshot.favoriteRows, async (chunk) => {
        await tx.insert(listingFavorites).values(chunk);
      });
      await insertInChunks(snapshot.likeRows, async (chunk) => {
        await tx.insert(listingLikes).values(chunk);
      });
      await insertInChunks(snapshot.likeCooldownRows, async (chunk) => {
        await tx.insert(likeNotificationCooldowns).values(chunk);
      });

      // 7. Conversations, read states, messages & price offers
      await insertInChunks(snapshot.conversationRows, async (chunk) => {
        await tx.insert(conversations).values(chunk);
      });
      await insertInChunks(snapshot.conversationReadStateRows, async (chunk) => {
        await tx.insert(conversationReadStates).values(chunk);
      });
      await insertInChunks(snapshot.messageRows, async (chunk) => {
        await tx.insert(messages).values(chunk);
      });
      await insertInChunks(snapshot.priceOfferRows, async (chunk) => {
        await tx.insert(priceOffers).values(chunk);
      });

      // 8. Threaded comments (parent-first order), reviews, reports, notifications, audit logs
      for (const row of snapshot.commentRows) {
        await tx.insert(listingComments).values(row);
      }
      await insertInChunks(snapshot.sellerReviewRows, async (chunk) => {
        await tx.insert(sellerReviews).values(chunk);
      });
      await insertInChunks(snapshot.reportRows, async (chunk) => {
        await tx.insert(reports).values(chunk);
      });
      await insertInChunks(snapshot.notificationRows, async (chunk) => {
        await tx.insert(notifications).values(chunk);
      });
      await insertInChunks(snapshot.auditLogRows, async (chunk) => {
        await tx.insert(auditLogs).values(chunk);
      });
      await tx.insert(platformSettings).values(snapshot.platformSettingsRow);
      await insertInChunks(snapshot.commissionRecordRows, async (chunk) => {
        await tx.insert(commissionRecords).values(chunk);
      });

      if (opts.dryRun) {
        throw new DryRunRollbackSignal();
      }
      committed = true;
    });
  } catch (err) {
    if (err instanceof DryRunRollbackSignal) {
      return { committed: false, counts: snapshot.counts };
    }
    throw err;
  }

  return { committed, counts: snapshot.counts };
}

function getArgValue(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function main() {
  loadEnvForEntryPoint();

  const dryRun = process.argv.includes('--dry-run');
  const preflightOnly = process.argv.includes('--preflight-only');
  const truncate = process.argv.includes('--truncate');
  const dataDirArg = getArgValue('data-dir');
  const jsonPathArg = getArgValue('json-path');

  const resolvedDir = resolveDataDir(dataDirArg ?? process.env.DATA_DIR);
  const jsonPath = jsonPathArg ? path.resolve(jsonPathArg) : path.join(resolvedDir, STORE_FILE_NAME);

  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Source JSON store not found at: ${jsonPath}`);
  }

  const rawText = fs.readFileSync(jsonPath, 'utf-8');
  const parsed = JSON.parse(rawText) as StoreData;
  const snapshot = prepareMigrationSnapshot(parsed);

  console.log(`[migrate-json-to-pg] Read-only snapshot loaded from ${jsonPath}`);
  if (snapshot.warnings.length > 0) {
    console.warn(`[migrate-json-to-pg] Warnings (${snapshot.warnings.length}):`);
    for (const w of snapshot.warnings) {
      console.warn(`  - ${w}`);
    }
  }
  console.log('[migrate-json-to-pg] Planned row counts:');
  for (const [table, count] of Object.entries(snapshot.counts)) {
    console.log(`  ${table}: ${count}`);
  }

  if (preflightOnly) {
    console.log('[migrate-json-to-pg] --preflight-only complete. No PostgreSQL connection opened.');
    return;
  }

  const pgCfg = resolvePostgresConfigFromEnv(process.env, process.env.NODE_ENV === 'production');
  if (!pgCfg || (!pgCfg.connectionString && !(pgCfg.host && pgCfg.database && pgCfg.user))) {
    throw new Error(
      'PostgreSQL connection configuration is missing (set DATABASE_URL or PGHOST/PGDATABASE/PGUSER). Pass --preflight-only for offline JSON validation.'
    );
  }

  const pool = createPgPool(pgCfg);
  try {
    await verifyDatabaseStartup(pool);
    const db = createDb(pool);
    const result = await executeMigration(db, snapshot, { dryRun, truncate });
    if (dryRun) {
      console.log('[migrate-json-to-pg] --dry-run succeeded inside transaction and rolled back cleanly. Zero rows committed.');
    } else if (result.committed) {
      console.log('[migrate-json-to-pg] Migration committed cleanly. Original JSON file untouched.');
    }
  } finally {
    await pool.end().catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((err) => {
    console.error('[migrate-json-to-pg] Failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
