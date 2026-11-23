export const MIN_COMMENT_LENGTH = 2;
export const MAX_COMMENT_LENGTH = 600;
export const DEFAULT_COMMENTS_PAGE_LIMIT = 5;
export const MAX_COMMENTS_PAGE_LIMIT = 50;
export const DUPLICATE_COMMENT_COOLDOWN_MS = 60_000;

export interface CommentRecord {
  id: string;
  listingId: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  body: string;
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicListingComment {
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

export interface PublicCommentThread extends PublicListingComment {
  replies: PublicListingComment[];
}

export class CommentValidationError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'invalid_comment'
  ) {
    super(message);
    this.name = 'CommentValidationError';
  }
}

export function normalizeAndValidateCommentBody(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new CommentValidationError(400, 'يرجى كتابة نص السؤال أو التعليق');
  }

  // Reject unsafe ASCII control characters (except newline and tab)
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(raw)) {
    throw new CommentValidationError(400, 'يحتوي التعليق على أحرف غير صالحة');
  }

  const normalized = raw
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (normalized.length < MIN_COMMENT_LENGTH) {
    throw new CommentValidationError(
      400,
      `يرجى كتابة تعليق لا يقل عن ${MIN_COMMENT_LENGTH} أحرف`
    );
  }

  if (normalized.length > MAX_COMMENT_LENGTH) {
    throw new CommentValidationError(
      400,
      `نص التعليق يتجاوز الحد الأقصى المسموح (${MAX_COMMENT_LENGTH} حرف)`
    );
  }

  const urlMatches = normalized.match(/https?:\/\/\S+/gi);
  if (urlMatches && urlMatches.length > 2) {
    throw new CommentValidationError(
      400,
      'لا يُسمح بإدراج أكثر من رابطين في التعليق الواحد'
    );
  }

  return normalized;
}

export function isDuplicateRecentComment(params: {
  comments: CommentRecord[];
  listingId: string;
  parentId: string | null;
  authorId: string;
  body: string;
  nowMs?: number;
}): boolean {
  const { comments, listingId, parentId, authorId, body, nowMs = Date.now() } = params;
  const target = body.trim().toLowerCase();
  return comments.some((c) => {
    if (
      c.listingId !== listingId ||
      c.parentId !== parentId ||
      c.authorId !== authorId ||
      c.body.trim().toLowerCase() !== target
    ) {
      return false;
    }
    const createdMs = Date.parse(c.createdAt);
    return Number.isFinite(createdMs) && nowMs - createdMs < DUPLICATE_COMMENT_COOLDOWN_MS;
  });
}

export function toPublicComment(
  comment: CommentRecord,
  listing: { sellerId: string },
  users: Array<{ id: string; name?: string }>,
  sellers: Array<{
    userId: string;
    displayName?: string;
    verifiedAt?: string | null;
    verificationStatus?: string;
  }>
): PublicListingComment {
  const isSeller = comment.authorId === listing.sellerId;
  const sellerProfile = isSeller ? sellers.find((s) => s.userId === comment.authorId) : undefined;
  const user = users.find((u) => u.id === comment.authorId);
  const authorName =
    (isSeller && sellerProfile?.displayName) || user?.name || comment.authorName || 'مستخدم';
  const sellerIsVerified = Boolean(
    sellerProfile &&
      (sellerProfile.verificationStatus === 'Verified' ||
        (!sellerProfile.verificationStatus && Boolean(sellerProfile.verifiedAt)))
  );

  return {
    id: comment.id,
    listingId: comment.listingId,
    parentId: comment.parentId,
    authorId: comment.authorId,
    authorName,
    isSeller,
    isVerifiedSeller: Boolean(isSeller && sellerIsVerified),
    body: comment.body,
    isEdited: Boolean(comment.isEdited),
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
}

export function paginateListingThreads(params: {
  comments: CommentRecord[];
  listing: { id: string; sellerId: string };
  users: Array<{ id: string; name?: string }>;
  sellers: Array<{
    userId: string;
    displayName?: string;
    verifiedAt?: string | null;
    verificationStatus?: string;
  }>;
  limit?: number;
  offset?: number;
}) {
  const { comments, listing, users, sellers } = params;
  const rawLimit = Number(params.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(MAX_COMMENTS_PAGE_LIMIT, Math.trunc(rawLimit)))
    : DEFAULT_COMMENTS_PAGE_LIMIT;
  const rawOffset = Number(params.offset);
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.trunc(rawOffset)) : 0;

  const listingComments = comments.filter((c) => c.listingId === listing.id);
  const topLevel = listingComments
    .filter((c) => c.parentId === null)
    .sort((a, b) => {
      const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return diff !== 0 ? diff : b.id.localeCompare(a.id);
    });

  const repliesByParent = new Map<string, CommentRecord[]>();
  for (const c of listingComments) {
    if (!c.parentId) continue;
    const list = repliesByParent.get(c.parentId) || [];
    list.push(c);
    repliesByParent.set(c.parentId, list);
  }
  for (const list of repliesByParent.values()) {
    list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  const pageTopLevel = topLevel.slice(offset, offset + limit);
  const threads: PublicCommentThread[] = pageTopLevel.map((top) => {
    const pub = toPublicComment(top, listing, users, sellers);
    const replies = (repliesByParent.get(top.id) || []).map((r) =>
      toPublicComment(r, listing, users, sellers)
    );
    return { ...pub, replies };
  });

  const totalThreads = topLevel.length;
  const totalCount = listingComments.length;
  const hasMore = offset + pageTopLevel.length < totalThreads;
  const nextOffset = hasMore ? offset + pageTopLevel.length : null;

  return {
    threads,
    totalThreads,
    totalCount,
    limit,
    offset,
    hasMore,
    nextOffset,
  };
}
