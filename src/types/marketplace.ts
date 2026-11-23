export type UserRole = 'buyer' | 'seller' | 'admin';

export type ListingStatus = 'Draft' | 'Pending' | 'Published' | 'Rejected' | 'Sold' | 'Expired';

export type LivestockSex = 'ذكر' | 'أنثى' | 'قطيع مختلط';

export interface User {
  id: string;
  phone: string | null;
  email: string;
  name: string;
  role: UserRole;
  status: 'active' | 'suspended';
  createdAt: string;
  phoneVerified?: boolean;
  needsPhoneCompletion?: boolean;
  googleLinked?: boolean;
  hasPassword?: boolean;
}

export interface GoogleAuthConfig {
  enabled: boolean;
  clientId: string | null;
  codeFlowEnabled: boolean;
}

export type SellerVerificationStatus = 'Pending' | 'Verified' | 'Rejected';

export interface SellerProfile {
  userId: string;
  displayName: string;
  bio: string;
  regionId: string;
  city: string;
  /** Contact details are only returned on demand via POST /api/v1/listings/:id/contact. */
  phone?: string;
  whatsapp?: string;
  contactAvailable?: boolean;
  verificationStatus?: SellerVerificationStatus;
  verifiedAt: string | null;
  yearsExperience: number;
  specialty: string;
  rating: number;
  ratingCount?: number;
  totalSales: number;
}

export interface SellerVerificationState {
  userId: string;
  displayName: string;
  verificationStatus: SellerVerificationStatus;
  verifiedAt: string | null;
  verificationNote: string | null;
  verificationRequestedAt: string | null;
  verificationReviewedAt: string | null;
}

export interface SellerReview {
  id: string;
  sellerId: string;
  reviewerId: string;
  reviewerName: string;
  rating: number;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

export interface SellerReviewsPageResponse {
  sellerId: string;
  reviews: SellerReview[];
  totalCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number | null;
  averageRating: number;
  ratingBreakdown: Record<1 | 2 | 3 | 4 | 5, number>;
  myReview: SellerReview | null;
  canReview: boolean;
  reviewEligibilityReason: 'unauthenticated' | 'self_review' | 'no_interaction' | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  description?: string;
  keywords?: string[];
}

export interface Breed {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  origin: string;
  summary: string;
  avgWeightKg: string;
  priceRangeSar: string;
  imageUrl: string;
  characteristics: string[];
}

export interface Region {
  id: string;
  name: string;
  parentId: string | null;
}

export interface ListingImage {
  id: string;
  url: string;
  position: number;
  mediaId?: string;
}

export interface ListingVideo {
  id: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  mediaId: string;
  originalName?: string;
}

export interface UploadedMedia {
  id: string;
  url: string;
  kind: 'image' | 'video';
  mimeType: string;
  sizeBytes: number;
  originalName: string;
  createdAt: string;
}

export interface Listing {
  id: string;
  sellerId: string;
  categoryId: string;
  subCategoryId?: string | null;
  breedId: string;
  regionId: string;
  city: string;
  title: string;
  slug: string;
  description: string;
  priceAmount: number;
  expectedPrice?: number | null;
  currency: 'SAR';
  sex: LivestockSex;
  ageMonths: number;
  weightKg: number;
  quantity: number;
  isNegotiable: boolean;
  allowPriceOffers?: boolean;
  vaccinated: boolean;
  status: ListingStatus;
  rejectionReason?: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  images: ListingImage[];
  video?: ListingVideo | null;
  isFeatured?: boolean;
  commissionPledgeAccepted?: boolean;
  featuredRequested?: boolean;
  likesCount?: number;
}

export type PriceOfferStatus = 'pending' | 'accepted' | 'rejected';

export interface PriceOffer {
  id: string;
  listingId: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  offeredPrice: number;
  quantity: number;
  note: string;
  status: PriceOfferStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  listingId: string;
  listingTitle?: string;
  buyerId: string;
  sellerId: string;
  otherParticipantId?: string;
  otherParticipantName?: string;
  unreadCount?: number;
  lastReadAt?: string | null;
  updatedAt: string;
  messages: Message[];
}

export interface Report {
  id: string;
  targetType?: 'listing' | 'comment';
  reporterId: string;
  listingId: string;
  commentId?: string | null;
  reason: string;
  details: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: string;
  resolvedAt?: string | null;
  resolutionNote?: string | null;
}

export interface IndicativePrice {
  id: string;
  breedId: string;
  breedName: string;
  categoryName: string;
  ageGroup: string;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  trend: 'up' | 'stable' | 'down';
  regionNote: string;
  updatedAt: string;
}

export interface Article {
  id: string;
  title: string;
  category: string;
  readTimeMinutes: number;
  publishedAt: string;
  excerpt: string;
  content: string;
  imageUrl: string;
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetType:
    | 'listing'
    | 'report'
    | 'breed'
    | 'category'
    | 'offer'
    | 'comment'
    | 'user'
    | 'seller'
    | 'commission';
  targetId: string;
  note?: string;
  createdAt: string;
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

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  listingId?: string;
  conversationId?: string;
  commentId?: string;
  read: boolean;
  createdAt: string;
}

export interface ListingComment {
  id: string;
  listingId: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  isSeller: boolean;
  isVerifiedSeller: boolean;
  body: string;
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListingCommentThread extends ListingComment {
  replies: ListingComment[];
}

export interface PaginatedCommentsResponse {
  threads: ListingCommentThread[];
  totalThreads: number;
  totalCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number | null;
  commentsEnabled: boolean;
}

export interface PaginatedListingsResponse {
  listings: Listing[];
  total: number;
  totalCount: number;
  limit: number;
  offset: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
  nextOffset: number | null;
}

export interface AdminCommentItem extends ListingComment {
  listingTitle: string;
  listingStatus: ListingStatus;
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
  phone: string | null;
  role: UserRole;
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
  listingStatus: ListingStatus | null;
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
  recentActivity: AuditLog[];
}

export interface AdminPaginationMeta {
  totalCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number | null;
}

export interface BootstrapPayload {
  sellers: SellerProfile[];
  categories: Category[];
  breeds: Breed[];
  regions: Region[];
  indicativePrices: IndicativePrice[];
  articles: Article[];
  faqs: FAQ[];
  /** null for visitors who are not signed in. */
  currentUser: User | null;
  /** Session-bound CSRF token to send as X-CSRF-Token on state-changing requests. */
  csrfToken: string | null;
  /** Public Google OAuth / GIS client configuration (never contains secrets). */
  googleAuth?: GoogleAuthConfig;
  /** Platform commission rate, launch exemption policy, featured fee & bank info. */
  commissionSettings?: import('../lib/commission').CommissionSettings;
  /** Live launch-promo / rate eligibility for the signed-in seller. */
  commissionEligibility?: import('../lib/commission').CommissionEligibility | null;
  /** Seller's own commission & featured-listing payment records. */
  myCommissionRecords?: import('../lib/commission').CommissionRecord[];
  favoriteIds: string[];
  likedListingIds: string[];
  conversations: Conversation[];
  priceOffers: PriceOffer[];
  notifications: AppNotification[];
  reports: Report[];
  auditLogs: AuditLog[];
}

export interface ActivitySnapshotPayload {
  favoriteIds: string[];
  likedListingIds: string[];
  conversations: Conversation[];
  priceOffers: PriceOffer[];
  notifications: AppNotification[];
  reports: Report[];
  auditLogs: AuditLog[];
  commissionSettings?: import('../lib/commission').CommissionSettings;
  commissionEligibility?: import('../lib/commission').CommissionEligibility | null;
  myCommissionRecords?: import('../lib/commission').CommissionRecord[];
}

export interface AiListingCard {
  id: string;
  title: string;
  priceAmount: number;
  currency: 'SAR';
  city: string;
  regionName: string;
  breedName: string;
  categoryName: string;
  ageMonths: number;
  weightKg: number;
  quantity: number;
  vaccinated: boolean;
  isNegotiable: boolean;
  allowPriceOffers: boolean;
  imageUrl: string | null;
  sellerDisplayName: string;
  sellerVerified: boolean;
  likesCount: number;
}

export interface AiChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiUsageSnapshot {
  remainingToday: number;
  dailyLimit: number;
  usedToday: number;
  resetAtIso: string;
}

export interface AiChatResponse {
  reply: string;
  intent:
    | 'marketplace_search'
    | 'breed_prices'
    | 'marketplace_help'
    | 'general_livestock'
    | 'casual_chat'
    | 'greeting';
  cards: AiListingCard[];
  suggestedFollowUps: string[];
  provider: 'gemini' | 'mock';
  usage: AiUsageSnapshot;
}

export interface AiStatusResponse {
  enabled: boolean;
  mode: 'gemini' | 'fallback';
  geminiConfigured: boolean;
  model: string;
  maxMessageLength: number;
  usage: AiUsageSnapshot;
}

export type InquiryStatus = 'new' | 'in_progress' | 'resolved';

export interface AdminInquiryItem {
  kind: 'contact' | 'service_request';
  referenceId: string;
  userId: string | null;
  name: string | null;
  email: string | null;
  contact: string | null;
  category: string | null;
  topic: string | null;
  region: string | null;
  preferredReply: string | null;
  message: string | null;
  serviceType?: string | null;
  phone?: string | null;
  details?: string | null;
  status: InquiryStatus;
  adminNote: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  receivedAt: string;
}


