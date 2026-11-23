export const LIKE_NOTIFICATION_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export type LikeAction = 'like' | 'unlike' | 'toggle';

export type LikesMap = Record<string, string[]>;
export type LikeNotificationHistory = Record<string, string>;

export class LikeValidationError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function parseLikeAction(raw: unknown): LikeAction {
  if (raw === undefined || raw === null || raw === '') {
    return 'toggle';
  }
  if (raw === 'like' || raw === 'unlike' || raw === 'toggle') {
    return raw;
  }
  throw new LikeValidationError(400, 'invalid_action', 'إجراء الإعجاب غير صالح');
}

export function normalizeLikesStore(raw: unknown): LikesMap {
  const normalized: LikesMap = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return normalized;
  }
  for (const [listingId, users] of Object.entries(raw as Record<string, unknown>)) {
    if (!listingId || !Array.isArray(users)) continue;
    const unique = Array.from(
      new Set(
        users
          .filter((id): id is string => typeof id === 'string')
          .map((id) => id.trim())
          .filter(Boolean)
      )
    );
    if (unique.length > 0) {
      normalized[listingId] = unique;
    }
  }
  return normalized;
}

export function normalizeLikeNotificationHistory(raw: unknown): LikeNotificationHistory {
  const normalized: LikeNotificationHistory = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return normalized;
  }
  for (const [key, ts] of Object.entries(raw as Record<string, unknown>)) {
    if (!key || typeof ts !== 'string') continue;
    if (Number.isFinite(Date.parse(ts))) {
      normalized[key] = ts;
    }
  }
  return normalized;
}

export function getListingLikesCount(likes: LikesMap | undefined, listingId: string): number {
  if (!likes) return 0;
  const arr = likes[listingId];
  return Array.isArray(arr) ? arr.length : 0;
}

export function hasUserLikedListing(
  likes: LikesMap | undefined,
  listingId: string,
  userId: string
): boolean {
  if (!likes || !userId) return false;
  const arr = likes[listingId];
  return Array.isArray(arr) && arr.includes(userId);
}

export function getUserLikedListingIds(
  likes: LikesMap | undefined,
  userId: string,
  listings?: Array<{ id: string; status: string }>
): string[] {
  if (!likes || !userId) return [];
  const publishedIds = listings
    ? new Set(listings.filter((l) => l.status === 'Published').map((l) => l.id))
    : null;

  const result: string[] = [];
  for (const [listingId, userIds] of Object.entries(likes)) {
    if (!Array.isArray(userIds) || !userIds.includes(userId)) continue;
    if (publishedIds && !publishedIds.has(listingId)) continue;
    result.push(listingId);
  }
  return result;
}

export function applyListingLikeMutation(input: {
  likes: LikesMap;
  listingId: string;
  userId: string;
  action: LikeAction;
}): { isLiked: boolean; likesCount: number; changed: boolean } {
  const currentSet = new Set<string>(
    Array.isArray(input.likes[input.listingId]) ? input.likes[input.listingId] : []
  );
  const currentlyLiked = currentSet.has(input.userId);

  const shouldLike =
    input.action === 'like'
      ? true
      : input.action === 'unlike'
      ? false
      : !currentlyLiked;

  if (shouldLike) {
    currentSet.add(input.userId);
  } else {
    currentSet.delete(input.userId);
  }

  if (currentSet.size === 0) {
    delete input.likes[input.listingId];
  } else {
    input.likes[input.listingId] = Array.from(currentSet);
  }

  return {
    isLiked: shouldLike,
    likesCount: currentSet.size,
    changed: shouldLike !== currentlyLiked,
  };
}

export function likeNotificationKey(listingId: string, actorId: string): string {
  return `${listingId}:${actorId}`;
}

export function shouldSendLikeNotification(input: {
  history: LikeNotificationHistory | undefined;
  listingId: string;
  actorId: string;
  sellerId: string;
  nowMs?: number;
  cooldownMs?: number;
}): boolean {
  if (!input.actorId || !input.sellerId || input.actorId === input.sellerId) {
    return false;
  }
  const history = input.history || {};
  const key = likeNotificationKey(input.listingId, input.actorId);
  const lastIso = history[key];
  if (!lastIso) return true;

  const lastMs = Date.parse(lastIso);
  if (!Number.isFinite(lastMs)) return true;

  const nowMs = input.nowMs ?? Date.now();
  const cooldownMs = input.cooldownMs ?? LIKE_NOTIFICATION_COOLDOWN_MS;
  return nowMs - lastMs >= cooldownMs;
}

export function recordLikeNotification(input: {
  history: LikeNotificationHistory;
  listingId: string;
  actorId: string;
  nowMs?: number;
}): void {
  const key = likeNotificationKey(input.listingId, input.actorId);
  input.history[key] = new Date(input.nowMs ?? Date.now()).toISOString();
}

export function attachLikesCountToListing<T extends { id: string }>(
  listing: T,
  likes: LikesMap | undefined
): T & { likesCount: number } {
  return {
    ...listing,
    likesCount: getListingLikesCount(likes, listing.id),
  };
}
