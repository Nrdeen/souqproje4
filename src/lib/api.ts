import type {
  ActivitySnapshotPayload,
  AdminCommentItem,
  AdminInquiryItem,
  AdminOverviewStats,
  AdminPaginationMeta,
  AdminReportItem,
  AdminUserSummary,
  AiChatHistoryItem,
  AiChatResponse,
  AiStatusResponse,
  AuditLog,
  BootstrapPayload,
  Breed,
  Conversation,
  FacebookAuthConfig,
  GoogleAuthConfig,
  InquiryStatus,
  Listing,
  ListingComment,
  Message,
  PaginatedCommentsResponse,
  PaginatedListingsResponse,
  PriceOffer,
  Report,
  SellerProfile,
  SellerReview,
  SellerReviewsPageResponse,
  SellerVerificationState,
  SellerVerificationStatus,
  UploadedMedia,
  User,
} from '../types/marketplace';
import type {
  CommissionAdminSummary,
  CommissionEligibility,
  CommissionRecord,
  CommissionSettings,
} from './commission';

import { fetchAllPaginatedListings } from './listing-search';
export { fetchAllPaginatedListings };

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let csrfToken: string | null = null;

/** Called whenever the server hands out a (new) CSRF token: bootstrap, login, register. */
export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

async function apiFetch<T>(url: string, options: RequestInit = {}, isRetry = false): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = isFormData
    ? {}
    : { 'Content-Type': 'application/json' };
  if (method !== 'GET' && method !== 'HEAD' && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }
  // Identity comes only from the HttpOnly session cookie; the client never states who it is.
  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      credentials: 'same-origin',
      headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
    });
  } catch {
    // Offline / server down / blocked request: show a clear Arabic message instead of the browser's raw "Failed to fetch".
    throw new ApiError('تعذر الاتصال بالخادم، تحقق من اتصالك بالإنترنت وحاول مرة أخرى', 0, 'network_error');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Stale CSRF token (e.g. server restarted): fetch a fresh one once and retry.
    if (res.status === 403 && data?.code === 'bad_csrf' && !isRetry) {
      const me = await fetch('/api/v1/auth/me', { credentials: 'same-origin' })
        .then((r) => r.json())
        .catch(() => null);
      if (me?.csrfToken) {
        csrfToken = me.csrfToken;
        return apiFetch<T>(url, options, true);
      }
    }
    // Session ended (expired / revoked): let the app return to the signed-out state.
    if (res.status === 401 && data?.code === 'unauthenticated') {
      window.dispatchEvent(new CustomEvent('souq:unauthenticated'));
    }
    throw new ApiError(
      data?.error || 'حدث خطأ أثناء الاتصال بالخادم',
      res.status,
      typeof data?.code === 'string' ? data.code : undefined
    );
  }
  return data;
}

export const api = {
  bootstrap: () => apiFetch<BootstrapPayload>('/api/v1/bootstrap'),

  getActivitySnapshot: () => apiFetch<ActivitySnapshotPayload>('/api/v1/me/activity'),

  login: (payload: { phone?: string; email?: string; password: string }) =>
    apiFetch<{ user: User; csrfToken: string }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  register: (payload: {
    name: string;
    phone: string;
    email?: string;
    password: string;
    role: 'buyer' | 'seller';
  }) =>
    apiFetch<{ user: User; csrfToken: string }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getGoogleAuthConfig: () => apiFetch<GoogleAuthConfig>('/api/v1/auth/google/config'),

  getGoogleOAuthUrl: (params: { role?: 'buyer' | 'seller'; mode?: 'login' | 'register' } = {}) => {
    const search = new URLSearchParams();
    if (params.role) search.set('role', params.role);
    if (params.mode) search.set('mode', params.mode);
    const qs = search.toString();
    return apiFetch<{ url: string }>(`/api/v1/auth/google/url${qs ? `?${qs}` : ''}`);
  },

  loginWithGoogle: (payload: {
    credential: string;
    role?: 'buyer' | 'seller';
    mode?: 'login' | 'register';
  }) =>
    apiFetch<{
      user: User;
      csrfToken: string;
      isNewUser: boolean;
      needsProfileCompletion: boolean;
    }>('/api/v1/auth/google', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  linkGoogleWithPassword: (payload: {
    phone: string;
    password: string;
    credential: string;
  }) =>
    apiFetch<{
      user: User;
      csrfToken: string;
      linked: boolean;
      needsProfileCompletion: boolean;
    }>('/api/v1/auth/google/link-with-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  linkGoogleIdentity: (payload: { credential: string; password?: string }) =>
    apiFetch<{ user: User; linked: boolean }>('/api/v1/auth/google/link', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getFacebookAuthConfig: () => apiFetch<FacebookAuthConfig>('/api/v1/auth/facebook/config'),

  getFacebookOAuthUrl: (
    params: { role?: 'buyer' | 'seller'; mode?: 'login' | 'register'; intent?: 'auth' | 'link' } = {}
  ) => {
    const search = new URLSearchParams();
    if (params.role) search.set('role', params.role);
    if (params.mode) search.set('mode', params.mode);
    if (params.intent) search.set('intent', params.intent);
    const qs = search.toString();
    return apiFetch<{ url: string }>(`/api/v1/auth/facebook/url${qs ? `?${qs}` : ''}`);
  },

  linkFacebookWithPassword: (payload: {
    phone?: string;
    email?: string;
    password: string;
    linkToken: string;
  }) =>
    apiFetch<{
      user: User;
      csrfToken: string;
      linked: boolean;
      needsProfileCompletion: boolean;
    }>('/api/v1/auth/facebook/link-with-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  linkFacebookIdentity: (payload: { linkToken: string; password?: string }) =>
    apiFetch<{ user: User; linked: boolean }>('/api/v1/auth/facebook/link', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  completeProfile: (payload: {
    phone: string;
    name?: string;
    role?: 'buyer' | 'seller';
  }) =>
    apiFetch<{ user: User; needsProfileCompletion: boolean }>('/api/v1/auth/complete-profile', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () => apiFetch<{ ok: boolean }>('/api/v1/auth/logout', { method: 'POST' }),

  logoutAll: () => apiFetch<{ ok: boolean }>('/api/v1/auth/logout-all', { method: 'POST' }),

  getListings: (
    params: Record<string, string | number | boolean | undefined> = {},
    options: { signal?: AbortSignal } = {}
  ) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '' && v !== 'all' && v !== false) {
        search.set(k, String(v));
      }
    });
    const qs = search.toString();
    return apiFetch<PaginatedListingsResponse>(`/api/v1/listings${qs ? `?${qs}` : ''}`, {
      signal: options.signal,
    });
  },

  getAllListingsPaginated: (
    params: Record<string, string | number | boolean | undefined> = {},
    options: { signal?: AbortSignal } = {}
  ) => fetchAllPaginatedListings(api.getListings, params, options),

  createListing: (payload: Record<string, unknown>) =>
    apiFetch<{ listing: Listing }>('/api/v1/listings', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateListing: (id: string, payload: Record<string, unknown>) =>
    apiFetch<{ listing: Listing }>(`/api/v1/listings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getCommissionSettings: () =>
    apiFetch<{ settings: CommissionSettings; eligibility: CommissionEligibility | null }>(
      '/api/v1/commission/settings'
    ),

  markListingSold: (
    id: string,
    payload: {
      soldViaPlatform: boolean;
      saleAmountSar?: number;
      transferReference?: string;
      payerName?: string;
      transferNote?: string;
    }
  ) =>
    apiFetch<{
      listing: Listing;
      commissionRecord: CommissionRecord;
      eligibility: CommissionEligibility;
    }>(`/api/v1/listings/${encodeURIComponent(id)}/mark-sold`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  requestListingFeatured: (
    id: string,
    payload: {
      transferReference?: string;
      payerName?: string;
      transferNote?: string;
    } = {}
  ) =>
    apiFetch<{ listing: Listing; commissionRecord: CommissionRecord }>(
      `/api/v1/listings/${encodeURIComponent(id)}/request-featured`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  submitCommissionPayment: (payload: {
    recordId?: string;
    listingId?: string;
    saleAmountSar?: number;
    commissionAmountSar?: number;
    transferReference: string;
    payerName: string;
    transferNote?: string;
  }) =>
    apiFetch<{ commissionRecord: CommissionRecord }>('/api/v1/commissions/submit', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  revealListingContact: (listingId: string) =>
    apiFetch<{ listingId: string; sellerId: string; phone: string | null; whatsapp: string | null }>(
      `/api/v1/listings/${encodeURIComponent(listingId)}/contact`,
      {
        method: 'POST',
      }
    ),

  uploadMedia: (file: File, kind: 'image' | 'video') => {
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', file, file.name);
    return apiFetch<{
      media: UploadedMedia;
      limits: { maxImageBytes: number; maxVideoBytes: number };
    }>('/api/v1/media/upload', {
      method: 'POST',
      body: form,
    });
  },

  deleteMedia: (mediaId: string) =>
    apiFetch<{ ok: boolean }>(`/api/v1/media/${encodeURIComponent(mediaId)}`, {
      method: 'DELETE',
    }),

  toggleFavorite: (listingId: string) =>
    apiFetch<{ favoriteIds: string[]; isFavorite: boolean }>('/api/v1/favorites/toggle', {
      method: 'POST',
      body: JSON.stringify({ listingId }),
    }),

  getListingLikes: (listingId: string) =>
    apiFetch<{
      listingId: string;
      likesCount: number;
      isLiked: boolean;
      likesEnabled: boolean;
    }>(`/api/v1/listings/${encodeURIComponent(listingId)}/likes`),

  setListingLike: (listingId: string, action: 'like' | 'unlike' | 'toggle' = 'toggle') => {
    const encodedId = encodeURIComponent(listingId);
    if (action === 'like') {
      return apiFetch<{
        listingId: string;
        likesCount: number;
        isLiked: boolean;
        likedListingIds: string[];
      }>(`/api/v1/listings/${encodedId}/like`, { method: 'PUT' });
    }
    if (action === 'unlike') {
      return apiFetch<{
        listingId: string;
        likesCount: number;
        isLiked: boolean;
        likedListingIds: string[];
      }>(`/api/v1/listings/${encodedId}/like`, { method: 'DELETE' });
    }
    return apiFetch<{
      listingId: string;
      likesCount: number;
      isLiked: boolean;
      likedListingIds: string[];
    }>(`/api/v1/listings/${encodedId}/like`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  },

  startConversation: (listingId: string, initialMessage?: string) =>
    apiFetch<{ conversation: Conversation }>('/api/v1/conversations', {
      method: 'POST',
      body: JSON.stringify({ listingId, initialMessage }),
    }),

  sendMessage: (conversationId: string, body: string) =>
    apiFetch<{ message: Message; conversation: Conversation }>(
      `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({ body }),
      }
    ),

  markConversationRead: (conversationId: string) =>
    apiFetch<{ conversation: Conversation }>(
      `/api/v1/conversations/${encodeURIComponent(conversationId)}/read`,
      {
        method: 'POST',
      }
    ),

  submitPriceOffer: (
    listingId: string,
    payload: { offeredPrice: number; quantity: number; note: string }
  ) =>
    apiFetch<{ offer: PriceOffer }>(`/api/v1/listings/${listingId}/offers`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  respondToOffer: (offerId: string, status: 'accepted' | 'rejected') =>
    apiFetch<{ offer: PriceOffer }>(`/api/v1/offers/${offerId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),

  createReport: (listingId: string, reason: string, details: string, commentId?: string) =>
    apiFetch<{ report: Report }>('/api/v1/reports', {
      method: 'POST',
      body: JSON.stringify({
        listingId,
        reason,
        details,
        ...(commentId ? { commentId } : {}),
      }),
    }),

  getMySellerVerification: () =>
    apiFetch<{ seller: SellerVerificationState | null }>('/api/v1/seller/verification'),

  requestSellerVerification: () =>
    apiFetch<{ seller: SellerVerificationState }>('/api/v1/seller/verification/request', {
      method: 'POST',
    }),

  getAdminOverview: () =>
    apiFetch<{ overview: AdminOverviewStats }>('/api/v1/admin/overview'),

  getAdminUsers: (
    params: {
      q?: string;
      role?: string;
      status?: string;
      verificationStatus?: string;
      limit?: number;
      offset?: number;
    } = {}
  ) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '' && v !== 'all') search.set(k, String(v));
    });
    const qs = search.toString();
    return apiFetch<{ users: AdminUserSummary[]; total: number } & AdminPaginationMeta>(
      `/api/v1/admin/users${qs ? `?${qs}` : ''}`
    );
  },

  suspendAdminUser: (userId: string, reason: string) =>
    apiFetch<{ user: AdminUserSummary; auditEntry: AuditLog }>(
      `/api/v1/admin/users/${encodeURIComponent(userId)}/suspend`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }
    ),

  reactivateAdminUser: (userId: string, reason?: string) =>
    apiFetch<{ user: AdminUserSummary; auditEntry: AuditLog }>(
      `/api/v1/admin/users/${encodeURIComponent(userId)}/reactivate`,
      {
        method: 'POST',
        body: JSON.stringify(reason ? { reason } : {}),
      }
    ),

  getAdminSellers: (
    params: { status?: string; q?: string; limit?: number; offset?: number } = {}
  ) => {
    const search = new URLSearchParams();
    if (params.status && params.status !== 'all') search.set('status', params.status);
    if (params.q?.trim()) search.set('q', params.q.trim());
    if (params.limit !== undefined) search.set('limit', String(params.limit));
    if (params.offset !== undefined) search.set('offset', String(params.offset));
    const qs = search.toString();
    return apiFetch<{ sellers: AdminUserSummary[] } & AdminPaginationMeta>(
      `/api/v1/admin/sellers${qs ? `?${qs}` : ''}`
    );
  },

  reviewSellerVerification: (
    userId: string,
    payload: { status: SellerVerificationStatus; reason?: string }
  ) =>
    apiFetch<{ user: AdminUserSummary; seller: SellerProfile; auditEntry: AuditLog }>(
      `/api/v1/admin/sellers/${encodeURIComponent(userId)}/verification`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  getAdminReports: (
    params: { status?: string; targetType?: string; q?: string; limit?: number; offset?: number } = {}
  ) => {
    const search = new URLSearchParams();
    if (params.status && params.status !== 'all') search.set('status', params.status);
    if (params.targetType && params.targetType !== 'all') search.set('targetType', params.targetType);
    if (params.q?.trim()) search.set('q', params.q.trim());
    if (params.limit !== undefined) search.set('limit', String(params.limit));
    if (params.offset !== undefined) search.set('offset', String(params.offset));
    const qs = search.toString();
    return apiFetch<{ reports: AdminReportItem[] } & AdminPaginationMeta>(
      `/api/v1/admin/reports${qs ? `?${qs}` : ''}`
    );
  },

  getAdminAuditLogs: (
    params: { targetType?: string; q?: string; limit?: number; offset?: number } = {}
  ) => {
    const search = new URLSearchParams();
    if (params.targetType && params.targetType !== 'all') search.set('targetType', params.targetType);
    if (params.q?.trim()) search.set('q', params.q.trim());
    if (params.limit !== undefined) search.set('limit', String(params.limit));
    if (params.offset !== undefined) search.set('offset', String(params.offset));
    const qs = search.toString();
    return apiFetch<{ auditLogs: AuditLog[] } & AdminPaginationMeta>(
      `/api/v1/admin/audit-logs${qs ? `?${qs}` : ''}`
    );
  },

  approveListing: (id: string) =>
    apiFetch<{ listing: Listing }>(`/api/v1/admin/listings/${id}/approve`, {
      method: 'POST',
    }),

  rejectListing: (id: string, reason: string) =>
    apiFetch<{ listing: Listing }>(`/api/v1/admin/listings/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  resolveReport: (id: string, status: 'resolved' | 'dismissed', note?: string) =>
    apiFetch<{ report: AdminReportItem }>(`/api/v1/admin/reports/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ status, ...(note?.trim() ? { note: note.trim() } : {}) }),
    }),

  createBreed: (payload: {
    name: string;
    categoryId: string;
    origin: string;
    summary: string;
    avgWeightKg: string;
    priceRangeSar: string;
  }) =>
    apiFetch<{ breed: Breed }>('/api/v1/admin/breeds', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createSubCategory: (payload: {
    name: string;
    parentId: string;
    description: string;
    keywords: string;
  }) =>
    apiFetch<{ category: import('../types/marketplace').Category }>('/api/v1/admin/categories', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateSubCategory: (
    id: string,
    payload: {
      name: string;
      parentId: string;
      description: string;
      keywords: string;
    }
  ) =>
    apiFetch<{ category: import('../types/marketplace').Category }>(
      `/api/v1/admin/categories/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    ),

  deleteSubCategory: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/v1/admin/categories/${id}`, {
      method: 'DELETE',
    }),

  autoCategorizeListings: (payload: { listingId?: string; subCategoryId?: string } = {}) =>
    apiFetch<{ updatedCount: number }>('/api/v1/admin/listings/auto-categorize', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  markNotificationRead: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/v1/notifications/${id}/read`, {
      method: 'POST',
    }),

  markAllNotificationsRead: () =>
    apiFetch<{ ok: boolean }>('/api/v1/notifications/read-all', {
      method: 'POST',
    }),

  getSellerReviews: (sellerId: string, params: { limit?: number; offset?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.limit !== undefined) search.set('limit', String(params.limit));
    if (params.offset !== undefined) search.set('offset', String(params.offset));
    const qs = search.toString();
    return apiFetch<SellerReviewsPageResponse>(
      `/api/v1/sellers/${encodeURIComponent(sellerId)}/reviews${qs ? `?${qs}` : ''}`
    );
  },

  submitSellerReview: (sellerId: string, payload: { rating: number; comment: string }) =>
    apiFetch<{ review: SellerReview; seller: SellerProfile; reviews: SellerReview[] }>(
      `/api/v1/sellers/${encodeURIComponent(sellerId)}/reviews`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  getListingComments: (listingId: string, params: { limit?: number; offset?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.limit !== undefined) search.set('limit', String(params.limit));
    if (params.offset !== undefined) search.set('offset', String(params.offset));
    const qs = search.toString();
    return apiFetch<PaginatedCommentsResponse>(
      `/api/v1/listings/${encodeURIComponent(listingId)}/comments${qs ? `?${qs}` : ''}`
    );
  },

  postListingComment: (
    listingId: string,
    payload: { body: string; parentId?: string | null }
  ) =>
    apiFetch<{ comment: ListingComment }>(
      `/api/v1/listings/${encodeURIComponent(listingId)}/comments`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  updateListingComment: (commentId: string, body: string) =>
    apiFetch<{ comment: ListingComment }>(`/api/v1/comments/${encodeURIComponent(commentId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    }),

  deleteListingComment: (commentId: string, reason?: string) =>
    apiFetch<{ ok: boolean; deletedIds: string[] }>(
      `/api/v1/comments/${encodeURIComponent(commentId)}`,
      {
        method: 'DELETE',
        ...(reason ? { body: JSON.stringify({ reason }) } : {}),
      }
    ),

  getAdminComments: (
    params: { q?: string; listingId?: string; limit?: number; offset?: number } = {}
  ) => {
    const search = new URLSearchParams();
    if (params.q?.trim()) search.set('q', params.q.trim());
    if (params.listingId?.trim()) search.set('listingId', params.listingId.trim());
    if (params.limit !== undefined) search.set('limit', String(params.limit));
    if (params.offset !== undefined) search.set('offset', String(params.offset));
    const qs = search.toString();
    return apiFetch<{ comments: AdminCommentItem[] } & AdminPaginationMeta>(
      `/api/v1/admin/comments${qs ? `?${qs}` : ''}`
    );
  },

  getAiStatus: () => apiFetch<AiStatusResponse>('/api/v1/ai/status'),

  sendAiChat: (payload: { message: string; history?: AiChatHistoryItem[] }) =>
    apiFetch<AiChatResponse>('/api/v1/ai/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  submitContactMessage: (payload: {
    name: string;
    email?: string;
    contact?: string;
    category?: string;
    topic: string;
    message: string;
    region?: string;
    preferredReply?: 'whatsapp' | 'phone' | 'email';
    website?: string;
  }) =>
    apiFetch<{
      ok: boolean;
      referenceId: string;
      receivedAt: string;
      preferredReply?: string;
      status?: string;
    }>('/api/v1/contact', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  submitServiceRequest: (payload: {
    serviceType: string;
    region: string;
    phone: string;
    name?: string;
    details: string;
  }) =>
    apiFetch<{
      ok: boolean;
      referenceId: string;
      serviceType: string;
      region: string;
      receivedAt: string;
    }>('/api/v1/service-requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getAdminCommissions: (
    params: { status?: string; kind?: string; q?: string; limit?: number; offset?: number } = {}
  ) => {
    const search = new URLSearchParams();
    if (params.status && params.status !== 'all') search.set('status', params.status);
    if (params.kind && params.kind !== 'all') search.set('kind', params.kind);
    if (params.q?.trim()) search.set('q', params.q.trim());
    if (params.limit !== undefined) search.set('limit', String(params.limit));
    if (params.offset !== undefined) search.set('offset', String(params.offset));
    const qs = search.toString();
    return apiFetch<
      {
        settings: CommissionSettings;
        summary: CommissionAdminSummary;
        records: CommissionRecord[];
      } & AdminPaginationMeta
    >(`/api/v1/admin/commissions${qs ? `?${qs}` : ''}`);
  },

  updateCommissionSettings: (payload: Partial<CommissionSettings>) =>
    apiFetch<{ settings: CommissionSettings; auditEntry: AuditLog }>(
      '/api/v1/admin/commission-settings',
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    ),

  reviewCommissionRecord: (id: string, status: 'approved' | 'rejected', note?: string) =>
    apiFetch<{
      commissionRecord: CommissionRecord;
      listing?: Listing;
      auditEntry: AuditLog;
    }>(`/api/v1/admin/commissions/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      body: JSON.stringify({ status, ...(note?.trim() ? { note: note.trim() } : {}) }),
    }),

  getAdminInquiries: (
    params: { status?: string; kind?: string; q?: string; limit?: number; offset?: number } = {}
  ) => {
    const search = new URLSearchParams();
    if (params.status && params.status !== 'all') search.set('status', params.status);
    if (params.kind && params.kind !== 'all') search.set('kind', params.kind);
    if (params.q?.trim()) search.set('q', params.q.trim());
    if (params.limit !== undefined) search.set('limit', String(params.limit));
    if (params.offset !== undefined) search.set('offset', String(params.offset));
    const qs = search.toString();
    return apiFetch<
      {
        inquiries: AdminInquiryItem[];
        summary: {
          total: number;
          newCount: number;
          inProgressCount: number;
          resolvedCount: number;
        };
      } & AdminPaginationMeta
    >(`/api/v1/admin/inquiries${qs ? `?${qs}` : ''}`);
  },

  updateAdminInquiry: (
    referenceId: string,
    payload: { status: InquiryStatus; adminNote?: string }
  ) =>
    apiFetch<{ ok: boolean; inquiry: AdminInquiryItem }>(
      `/api/v1/admin/inquiries/${encodeURIComponent(referenceId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    ),
};
