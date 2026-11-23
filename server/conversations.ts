export interface ConversationMessageLike {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export interface ConversationLike {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  updatedAt: string;
  readAtByUserId?: Record<string, string>;
  messages: ConversationMessageLike[];
}

export interface SerializedConversation extends ConversationLike {
  listingTitle: string;
  otherParticipantId: string;
  otherParticipantName: string;
  unreadCount: number;
  lastReadAt: string | null;
}

function toTimestampMs(iso?: string | null): number {
  if (!iso) return 0;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Counts incoming messages from the other participant created after the viewer's
 * latest recorded read timestamp (or latest message sent by the viewer, which implies
 * the viewer saw prior messages).
 */
export function computeConversationUnreadCount(
  conv: Pick<ConversationLike, 'readAtByUserId' | 'messages'>,
  viewerId: string
): number {
  if (!viewerId) return 0;
  const messages = Array.isArray(conv.messages) ? conv.messages : [];
  if (messages.length === 0) return 0;

  const explicitReadMs = toTimestampMs(conv.readAtByUserId?.[viewerId] ?? null);
  let latestOwnSentMs = 0;
  for (const msg of messages) {
    if (msg.senderId === viewerId) {
      const ts = toTimestampMs(msg.createdAt);
      if (ts > latestOwnSentMs) latestOwnSentMs = ts;
    }
  }
  const effectiveReadMs = Math.max(explicitReadMs, latestOwnSentMs);

  let unread = 0;
  for (const msg of messages) {
    if (msg.senderId === viewerId) continue;
    const msgMs = toTimestampMs(msg.createdAt);
    if (effectiveReadMs === 0 || msgMs > effectiveReadMs) {
      unread += 1;
    }
  }
  return unread;
}

/**
 * Serializes a conversation strictly for one authorized participant without
 * exposing private user directory fields (emails, phones, credentials) or
 * the other party's read receipts.
 */
export function toUserConversation(
  conv: ConversationLike,
  viewerId: string,
  context: {
    users: Array<{ id: string; name: string }>;
    sellers: Array<{ userId: string; displayName: string }>;
    listings: Array<{ id: string; title: string }>;
  }
): SerializedConversation {
  const otherParticipantId = conv.buyerId === viewerId ? conv.sellerId : conv.buyerId;
  const otherUser = context.users.find((u) => u.id === otherParticipantId);
  const otherSeller = context.sellers.find((s) => s.userId === otherParticipantId);
  const listing = context.listings.find((l) => l.id === conv.listingId);

  const unreadCount = computeConversationUnreadCount(conv, viewerId);
  const lastReadAt = conv.readAtByUserId?.[viewerId] || null;

  return {
    id: conv.id,
    listingId: conv.listingId,
    listingTitle: listing?.title || 'استفسار عن إعلان',
    buyerId: conv.buyerId,
    sellerId: conv.sellerId,
    otherParticipantId,
    otherParticipantName: otherUser?.name || otherSeller?.displayName || 'مستخدم',
    unreadCount,
    lastReadAt,
    updatedAt: conv.updatedAt,
    messages: Array.isArray(conv.messages) ? conv.messages : [],
  };
}
