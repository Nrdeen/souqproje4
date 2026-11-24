import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  char,
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    phone: varchar('phone', { length: 20 }).unique(),
    email: varchar('email', { length: 255 }).notNull(),
    name: varchar('name', { length: 80 }).notNull(),
    role: varchar('role', { length: 16 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    isDemo: boolean('is_demo').notNull().default(false),
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true, mode: 'date' }),
    suspendedAt: timestamp('suspended_at', { withTimezone: true, mode: 'date' }),
    suspendedBy: text('suspended_by').references((): AnyPgColumn => users.id, {
      onDelete: 'set null',
    }),
    suspensionReason: text('suspension_reason'),
    reactivatedAt: timestamp('reactivated_at', { withTimezone: true, mode: 'date' }),
    reactivatedBy: text('reactivated_by').references((): AnyPgColumn => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    check('users_role_chk', sql`${table.role} IN ('buyer', 'seller', 'admin')`),
    check('users_status_chk', sql`${table.status} IN ('active', 'suspended')`),
    check('users_phone_sa_chk', sql`${table.phone} IS NULL OR ${table.phone} ~ '^05[0-9]{8}$'`),
    index('users_role_status_created_idx').on(table.role, table.status, table.createdAt),
    index('users_email_lower_idx').on(sql`lower(${table.email})`),
  ]
);

export const userCredentials = pgTable('user_credentials', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const googleIdentities = pgTable(
  'google_identities',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 32 }).notNull().default('google'),
    subject: varchar('subject', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    name: varchar('name', { length: 120 }).notNull(),
    pictureUrl: text('picture_url'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    check('google_identities_provider_chk', sql`${table.provider} IN ('google', 'facebook')`),
    uniqueIndex('google_identities_provider_subject_uidx').on(table.provider, table.subject),
    uniqueIndex('google_identities_user_provider_uidx').on(table.userId, table.provider),
    index('google_identities_email_lower_idx').on(sql`lower(${table.email})`),
  ]
);

export const sessions = pgTable(
  'sessions',
  {
    id: char('id', { length: 64 }).primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    ip: varchar('ip', { length: 64 }),
    userAgent: varchar('user_agent', { length: 200 }),
  },
  (table) => [
    index('sessions_user_last_seen_idx').on(table.userId, table.lastSeenAt),
    index('sessions_expiry_idx').on(table.expiresAt, table.lastSeenAt),
  ]
);

export const regions = pgTable('regions', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  parentId: text('parent_id').references((): AnyPgColumn => regions.id, {
    onDelete: 'restrict',
  }),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const sellerProfiles = pgTable(
  'seller_profiles',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    displayName: varchar('display_name', { length: 120 }).notNull(),
    bio: text('bio').notNull().default(''),
    regionId: text('region_id')
      .notNull()
      .references(() => regions.id, { onDelete: 'restrict' }),
    city: varchar('city', { length: 80 }).notNull(),
    phone: varchar('phone', { length: 20 }).notNull(),
    whatsapp: varchar('whatsapp', { length: 25 }).notNull(),
    verificationStatus: varchar('verification_status', { length: 16 })
      .notNull()
      .default('Pending'),
    verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'date' }),
    verificationNote: text('verification_note'),
    verificationRequestedAt: timestamp('verification_requested_at', {
      withTimezone: true,
      mode: 'date',
    }),
    verificationReviewedAt: timestamp('verification_reviewed_at', {
      withTimezone: true,
      mode: 'date',
    }),
    verificationReviewedBy: text('verification_reviewed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    yearsExperience: integer('years_experience').notNull().default(0),
    specialty: varchar('specialty', { length: 120 }).notNull().default(''),
    rating: numeric('rating', { precision: 3, scale: 1 }).notNull().default('0'),
    ratingCount: integer('rating_count').notNull().default(0),
    totalSales: integer('total_sales').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'seller_profiles_verification_status_chk',
      sql`${table.verificationStatus} IN ('Pending', 'Verified', 'Rejected')`
    ),
    check(
      'seller_profiles_years_exp_chk',
      sql`${table.yearsExperience} >= 0 AND ${table.yearsExperience} <= 100`
    ),
    check('seller_profiles_rating_chk', sql`${table.rating} >= 0 AND ${table.rating} <= 5`),
    check('seller_profiles_rating_count_chk', sql`${table.ratingCount} >= 0`),
    check('seller_profiles_total_sales_chk', sql`${table.totalSales} >= 0`),
    index('seller_profiles_verification_idx').on(table.verificationStatus),
  ]
);

export const categories = pgTable('categories', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 80 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  parentId: text('parent_id').references((): AnyPgColumn => categories.id, {
    onDelete: 'restrict',
  }),
  description: text('description').notNull().default(''),
  keywords: text('keywords')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const breeds = pgTable('breeds', {
  id: text('id').primaryKey(),
  categoryId: text('category_id')
    .notNull()
    .references(() => categories.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 80 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  origin: varchar('origin', { length: 120 }).notNull(),
  summary: text('summary').notNull(),
  avgWeightKg: varchar('avg_weight_kg', { length: 60 }).notNull(),
  priceRangeSar: varchar('price_range_sar', { length: 60 }).notNull(),
  imageUrl: text('image_url').notNull(),
  characteristics: text('characteristics')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
});

export const indicativePrices = pgTable(
  'indicative_prices',
  {
    id: text('id').primaryKey(),
    breedId: text('breed_id')
      .notNull()
      .references(() => breeds.id, { onDelete: 'cascade' }),
    breedName: varchar('breed_name', { length: 100 }).notNull(),
    categoryName: varchar('category_name', { length: 80 }).notNull(),
    ageGroup: varchar('age_group', { length: 100 }).notNull(),
    minPrice: numeric('min_price', { precision: 12, scale: 2 }).notNull(),
    maxPrice: numeric('max_price', { precision: 12, scale: 2 }).notNull(),
    avgPrice: numeric('avg_price', { precision: 12, scale: 2 }).notNull(),
    trend: varchar('trend', { length: 16 }).notNull(),
    regionNote: varchar('region_note', { length: 160 }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    check('indicative_prices_min_chk', sql`${table.minPrice} >= 0`),
    check('indicative_prices_max_chk', sql`${table.maxPrice} >= ${table.minPrice}`),
    check(
      'indicative_prices_avg_chk',
      sql`${table.avgPrice} >= ${table.minPrice} AND ${table.avgPrice} <= ${table.maxPrice}`
    ),
    check('indicative_prices_trend_chk', sql`${table.trend} IN ('up', 'down', 'stable')`),
  ]
);

export const articles = pgTable(
  'articles',
  {
    id: text('id').primaryKey(),
    title: varchar('title', { length: 200 }).notNull(),
    category: varchar('category', { length: 80 }).notNull(),
    readTimeMinutes: integer('read_time_minutes').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }).notNull(),
    excerpt: text('excerpt').notNull(),
    content: text('content').notNull(),
    imageUrl: text('image_url').notNull(),
  },
  (table) => [check('articles_read_time_chk', sql`${table.readTimeMinutes} > 0`)]
);

export const faqs = pgTable('faqs', {
  id: text('id').primaryKey(),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const listings = pgTable(
  'listings',
  {
    id: text('id').primaryKey(),
    sellerId: text('seller_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    subCategoryId: text('sub_category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    breedId: text('breed_id')
      .notNull()
      .references(() => breeds.id, { onDelete: 'restrict' }),
    regionId: text('region_id')
      .notNull()
      .references(() => regions.id, { onDelete: 'restrict' }),
    city: varchar('city', { length: 80 }).notNull(),
    cityNorm: text('city_norm').notNull().default(''),
    title: varchar('title', { length: 160 }).notNull(),
    slug: varchar('slug', { length: 180 }).notNull().unique(),
    description: text('description').notNull().default(''),
    searchDoc: text('search_doc').notNull().default(''),
    priceAmount: numeric('price_amount', { precision: 12, scale: 2 }).notNull(),
    expectedPrice: numeric('expected_price', { precision: 12, scale: 2 }),
    currency: char('currency', { length: 3 }).notNull().default('SAR'),
    sex: varchar('sex', { length: 32 }).notNull(),
    ageMonths: integer('age_months').notNull(),
    weightKg: numeric('weight_kg', { precision: 8, scale: 2 }).notNull(),
    quantity: integer('quantity').notNull().default(1),
    isNegotiable: boolean('is_negotiable').notNull().default(false),
    allowPriceOffers: boolean('allow_price_offers').notNull().default(false),
    vaccinated: boolean('vaccinated').notNull().default(false),
    status: varchar('status', { length: 16 }).notNull().default('Pending'),
    rejectionReason: text('rejection_reason'),
    isFeatured: boolean('is_featured').notNull().default(false),
    commissionPledgeAccepted: boolean('commission_pledge_accepted').notNull().default(false),
    featuredRequested: boolean('featured_requested').notNull().default(false),
    likesCount: integer('likes_count').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'listings_price_chk',
      sql`${table.priceAmount} > 0 AND ${table.priceAmount} <= 10000000`
    ),
    check(
      'listings_expected_price_chk',
      sql`${table.expectedPrice} IS NULL OR (${table.expectedPrice} > 0 AND ${table.expectedPrice} <= ${table.priceAmount})`
    ),
    check('listings_currency_chk', sql`${table.currency} = 'SAR'`),
    check('listings_sex_chk', sql`${table.sex} IN ('ذكر', 'أنثى', 'قطيع مختلط')`),
    check('listings_age_months_chk', sql`${table.ageMonths} >= 0 AND ${table.ageMonths} <= 360`),
    check('listings_weight_kg_chk', sql`${table.weightKg} > 0 AND ${table.weightKg} <= 2000`),
    check('listings_quantity_chk', sql`${table.quantity} >= 1 AND ${table.quantity} <= 100000`),
    check(
      'listings_status_chk',
      sql`${table.status} IN ('Draft', 'Pending', 'Published', 'Rejected', 'Sold', 'Expired')`
    ),
    check('listings_likes_count_chk', sql`${table.likesCount} >= 0`),
    index('listings_published_newest_idx')
      .on(table.publishedAt, table.id)
      .where(sql`${table.status} = 'Published'`),
    index('listings_published_price_idx')
      .on(table.priceAmount, table.publishedAt, table.id)
      .where(sql`${table.status} = 'Published'`),
    index('listings_published_likes_idx')
      .on(table.likesCount, table.publishedAt, table.id)
      .where(sql`${table.status} = 'Published'`),
    index('listings_filters_idx')
      .on(table.categoryId, table.subCategoryId, table.breedId, table.regionId)
      .where(sql`${table.status} = 'Published'`),
    index('listings_seller_status_idx').on(table.sellerId, table.status, table.updatedAt),
    index('listings_status_created_idx').on(table.status, table.createdAt),
  ]
);

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: text('id').primaryKey(),
    storageProvider: varchar('storage_provider', { length: 16 }).notNull().default('local'),
    bucket: varchar('bucket', { length: 128 }),
    objectKey: text('object_key').notNull(),
    filename: varchar('filename', { length: 128 }).notNull(),
    url: text('url').notNull(),
    kind: varchar('kind', { length: 16 }).notNull(),
    mimeType: varchar('mime_type', { length: 64 }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256Hex: char('sha256_hex', { length: 64 }),
    originalName: varchar('original_name', { length: 120 }).notNull(),
    uploaderId: text('uploader_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    listingId: text('listing_id').references(() => listings.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    check('media_assets_provider_chk', sql`${table.storageProvider} IN ('local', 'gcs', 's3', 'r2')`),
    check('media_assets_kind_chk', sql`${table.kind} IN ('image', 'video')`),
    check(
      'media_assets_size_kind_chk',
      sql`(${table.kind} = 'image' AND ${table.sizeBytes} > 0 AND ${table.sizeBytes} <= 5242880) OR (${table.kind} = 'video' AND ${table.sizeBytes} > 0 AND ${table.sizeBytes} <= 26214400)`
    ),
    uniqueIndex('media_assets_one_video_per_listing_uidx')
      .on(table.listingId)
      .where(sql`${table.listingId} IS NOT NULL AND ${table.kind} = 'video'`),
    index('media_assets_uploader_unbound_idx').on(table.uploaderId, table.listingId, table.createdAt),
    index('media_assets_listing_idx').on(table.listingId),
  ]
);

export const listingImages = pgTable(
  'listing_images',
  {
    id: text('id').primaryKey(),
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    mediaId: text('media_id').references(() => mediaAssets.id, { onDelete: 'set null' }),
    url: text('url').notNull(),
    position: integer('position').notNull(),
  },
  (table) => [
    check('listing_images_pos_chk', sql`${table.position} >= 1 AND ${table.position} <= 8`),
    uniqueIndex('listing_images_listing_pos_uidx').on(table.listingId, table.position),
    index('listing_images_media_idx').on(table.mediaId),
  ]
);

export const listingVideos = pgTable(
  'listing_videos',
  {
    id: text('id').primaryKey(),
    listingId: text('listing_id')
      .notNull()
      .unique()
      .references(() => listings.id, { onDelete: 'cascade' }),
    mediaId: text('media_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    mimeType: varchar('mime_type', { length: 64 }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    originalName: varchar('original_name', { length: 120 }),
  },
  (table) => [index('listing_videos_media_idx').on(table.mediaId)]
);

export const listingFavorites = pgTable(
  'listing_favorites',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.listingId] }),
    index('listing_favorites_listing_idx').on(table.listingId),
  ]
);

export const listingLikes = pgTable(
  'listing_likes',
  {
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.listingId, table.userId] }),
    index('listing_likes_user_idx').on(table.userId),
  ]
);

export const likeNotificationCooldowns = pgTable(
  'like_notification_cooldowns',
  {
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastNotifiedAt: timestamp('last_notified_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.listingId, table.actorId] })]
);

export const conversations = pgTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    buyerId: text('buyer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    sellerId: text('seller_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('conversations_listing_buyer_uidx').on(table.listingId, table.buyerId),
    check('conversations_distinct_parties_chk', sql`${table.buyerId} <> ${table.sellerId}`),
    index('conversations_buyer_updated_idx').on(table.buyerId, table.updatedAt),
    index('conversations_seller_updated_idx').on(table.sellerId, table.updatedAt),
  ]
);

export const conversationReadStates = pgTable(
  'conversation_read_states',
  {
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.conversationId, table.userId] })]
);

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: text('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    check('messages_body_len_chk', sql`char_length(${table.body}) BETWEEN 1 AND 2000`),
    index('messages_conv_created_idx').on(table.conversationId, table.createdAt),
  ]
);

export const priceOffers = pgTable(
  'price_offers',
  {
    id: text('id').primaryKey(),
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    buyerId: text('buyer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    buyerName: varchar('buyer_name', { length: 80 }).notNull(),
    sellerId: text('seller_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    offeredPrice: numeric('offered_price', { precision: 12, scale: 2 }).notNull(),
    quantity: integer('quantity').notNull().default(1),
    note: text('note').notNull().default(''),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'price_offers_amount_chk',
      sql`${table.offeredPrice} > 0 AND ${table.offeredPrice} <= 10000000`
    ),
    check('price_offers_quantity_chk', sql`${table.quantity} >= 1`),
    check('price_offers_status_chk', sql`${table.status} IN ('pending', 'accepted', 'rejected')`),
    check('price_offers_distinct_parties_chk', sql`${table.buyerId} <> ${table.sellerId}`),
    index('price_offers_buyer_idx').on(table.buyerId, table.createdAt),
    index('price_offers_seller_idx').on(table.sellerId, table.createdAt),
    index('price_offers_listing_idx').on(table.listingId, table.createdAt),
  ]
);

export const listingComments = pgTable(
  'listing_comments',
  {
    id: text('id').primaryKey(),
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    parentId: text('parent_id').references((): AnyPgColumn => listingComments.id, {
      onDelete: 'cascade',
    }),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    authorName: varchar('author_name', { length: 120 }).notNull(),
    body: text('body').notNull(),
    isEdited: boolean('is_edited').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    check('listing_comments_body_len_chk', sql`char_length(${table.body}) BETWEEN 2 AND 600`),
    index('comments_listing_parent_created_idx').on(
      table.listingId,
      table.parentId,
      table.createdAt
    ),
    index('comments_author_idx').on(table.authorId),
  ]
);

export const sellerReviews = pgTable(
  'seller_reviews',
  {
    id: text('id').primaryKey(),
    sellerId: text('seller_id')
      .notNull()
      .references(() => sellerProfiles.userId, { onDelete: 'cascade' }),
    reviewerId: text('reviewer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    reviewerName: varchar('reviewer_name', { length: 80 }).notNull(),
    rating: smallint('rating').notNull(),
    comment: text('comment').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    check('seller_reviews_rating_chk', sql`${table.rating} BETWEEN 1 AND 5`),
    check('seller_reviews_no_self_chk', sql`${table.sellerId} <> ${table.reviewerId}`),
    uniqueIndex('seller_reviews_seller_reviewer_uidx').on(table.sellerId, table.reviewerId),
    index('reviews_seller_updated_idx').on(table.sellerId, table.updatedAt),
  ]
);

export const reports = pgTable(
  'reports',
  {
    id: text('id').primaryKey(),
    targetType: varchar('target_type', { length: 16 }).notNull(),
    reporterId: text('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    commentId: text('comment_id').references(() => listingComments.id, {
      onDelete: 'set null',
    }),
    reason: varchar('reason', { length: 160 }).notNull(),
    details: text('details').notNull().default(''),
    status: varchar('status', { length: 16 }).notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
    resolvedBy: text('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolutionNote: text('resolution_note'),
  },
  (table) => [
    check('reports_target_type_chk', sql`${table.targetType} IN ('listing', 'comment')`),
    check('reports_status_chk', sql`${table.status} IN ('open', 'resolved', 'dismissed')`),
    uniqueIndex('reports_unique_open_listing_uidx')
      .on(table.reporterId, table.listingId)
      .where(sql`${table.status} = 'open' AND ${table.targetType} = 'listing'`),
    uniqueIndex('reports_unique_open_comment_uidx')
      .on(table.reporterId, table.listingId, table.commentId)
      .where(sql`${table.status} = 'open' AND ${table.targetType} = 'comment' AND ${table.commentId} IS NOT NULL`),
    index('reports_status_type_created_idx').on(table.status, table.targetType, table.createdAt),
  ]
);

export const notifications = pgTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 40 }).notNull(),
    title: varchar('title', { length: 160 }).notNull(),
    body: text('body').notNull(),
    listingId: text('listing_id').references(() => listings.id, { onDelete: 'set null' }),
    conversationId: text('conversation_id').references(() => conversations.id, {
      onDelete: 'set null',
    }),
    commentId: text('comment_id').references(() => listingComments.id, {
      onDelete: 'set null',
    }),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'notifications_type_chk',
      sql`${table.type} IN ('offer_accepted', 'offer_rejected', 'new_message', 'new_comment', 'comment_reply', 'listing_liked', 'listing_approved', 'listing_rejected', 'seller_verified', 'seller_verification_rejected', 'commission_due', 'commission_submitted', 'commission_approved', 'commission_rejected', 'featured_approved')`
    ),
    index('notifications_user_created_idx').on(table.userId, table.isRead, table.createdAt),
  ]
);

export const platformSettings = pgTable(
  'platform_settings',
  {
    id: text('id').primaryKey(),
    commissionRatePercent: numeric('commission_rate_percent', { precision: 5, scale: 2 })
      .notNull()
      .default('1'),
    promoEnabled: boolean('promo_enabled').notNull().default(true),
    promoFreeDays: integer('promo_free_days').notNull().default(30),
    promoFreeListingsCount: integer('promo_free_listings_count').notNull().default(2),
    featuredWeeklyPriceSar: numeric('featured_weekly_price_sar', { precision: 10, scale: 2 })
      .notNull()
      .default('35'),
    bankName: varchar('bank_name', { length: 120 }).notNull().default(''),
    accountHolderName: varchar('account_holder_name', { length: 160 }).notNull().default(''),
    iban: varchar('iban', { length: 34 }).notNull().default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'platform_settings_rate_chk',
      sql`${table.commissionRatePercent} >= 0 AND ${table.commissionRatePercent} <= 25`
    ),
    check('platform_settings_promo_days_chk', sql`${table.promoFreeDays} >= 0 AND ${table.promoFreeDays} <= 365`),
    check(
      'platform_settings_promo_count_chk',
      sql`${table.promoFreeListingsCount} >= 0 AND ${table.promoFreeListingsCount} <= 100`
    ),
    check('platform_settings_featured_price_chk', sql`${table.featuredWeeklyPriceSar} >= 0`),
  ]
);

export const commissionRecords = pgTable(
  'commission_records',
  {
    id: text('id').primaryKey(),
    kind: varchar('kind', { length: 24 }).notNull().default('sale_commission'),
    listingId: text('listing_id').references(() => listings.id, { onDelete: 'set null' }),
    listingTitle: varchar('listing_title', { length: 180 }).notNull().default(''),
    sellerId: text('seller_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sellerName: varchar('seller_name', { length: 120 }).notNull().default(''),
    soldViaPlatform: boolean('sold_via_platform').notNull().default(true),
    saleAmountSar: numeric('sale_amount_sar', { precision: 12, scale: 2 }).notNull().default('0'),
    ratePercent: numeric('rate_percent', { precision: 5, scale: 2 }).notNull().default('1'),
    commissionAmountSar: numeric('commission_amount_sar', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    isExempt: boolean('is_exempt').notNull().default(false),
    exemptionReason: varchar('exemption_reason', { length: 32 }).notNull().default('none'),
    status: varchar('status', { length: 24 }).notNull().default('pending_payment'),
    transferReference: varchar('transfer_reference', { length: 120 }),
    payerName: varchar('payer_name', { length: 120 }),
    transferAmountSar: numeric('transfer_amount_sar', { precision: 12, scale: 2 }),
    transferNote: text('transfer_note'),
    reviewedBy: text('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    reviewNote: text('review_note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'commission_records_kind_chk',
      sql`${table.kind} IN ('sale_commission', 'featured_listing')`
    ),
    check(
      'commission_records_status_chk',
      sql`${table.status} IN ('exempt', 'pending_payment', 'pending_review', 'approved', 'rejected', 'not_applicable')`
    ),
    check(
      'commission_records_exemption_chk',
      sql`${table.exemptionReason} IN ('none', 'promo_days', 'promo_free_listings', 'not_sold_via_platform')`
    ),
    check(
      'commission_records_amounts_chk',
      sql`${table.saleAmountSar} >= 0 AND ${table.commissionAmountSar} >= 0`
    ),
    index('commission_records_seller_created_idx').on(table.sellerId, table.createdAt),
    index('commission_records_status_created_idx').on(table.status, table.createdAt),
    index('commission_records_listing_idx').on(table.listingId),
  ]
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id'),
    actorName: varchar('actor_name', { length: 80 }).notNull(),
    action: varchar('action', { length: 120 }).notNull(),
    targetType: varchar('target_type', { length: 32 }).notNull(),
    targetId: text('target_id').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_created_idx').on(table.createdAt, table.id),
    index('audit_logs_target_idx').on(table.targetType, table.createdAt),
  ]
);
