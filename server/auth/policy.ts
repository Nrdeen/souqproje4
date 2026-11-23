/** Pure authorization rules. Routes call these; they never trust anything the client says about identity. */

export interface Actor {
  id: string;
  role: 'buyer' | 'seller' | 'admin';
  status?: string;
}

export const isAdmin = (u: Actor | null | undefined) => !!u && u.role === 'admin';

export function canViewListing(u: Actor | null, listing: { sellerId: string; status: string }): boolean {
  if (listing.status === 'Published') return true;
  if (!u) return false;
  return u.id === listing.sellerId || isAdmin(u);
}

export function canEditListing(u: Actor | null, listing: { sellerId: string }): boolean {
  return !!u && (u.id === listing.sellerId || isAdmin(u));
}

export function canAccessConversation(u: Actor | null, conv: { buyerId: string; sellerId: string }): boolean {
  return !!u && (u.id === conv.buyerId || u.id === conv.sellerId);
}

export function canRespondToOffer(u: Actor | null, offer: { sellerId: string }): boolean {
  return !!u && (u.id === offer.sellerId || isAdmin(u));
}

export function visibleOffers<T extends { buyerId: string; sellerId: string }>(u: Actor | null, offers: T[]): T[] {
  if (!u) return [];
  if (isAdmin(u)) return offers;
  return offers.filter((o) => o.buyerId === u.id || o.sellerId === u.id);
}

export function visibleConversations<T extends { buyerId: string; sellerId: string }>(u: Actor | null, convs: T[]): T[] {
  if (!u) return [];
  return convs.filter((c) => canAccessConversation(u, c));
}

export function canViewListingComments(listing: { status: string }): boolean {
  return listing.status === 'Published';
}

export function canReplyToListingComment(
  u: Actor | null,
  listing: { sellerId: string; status: string }
): boolean {
  return !!u && listing.status === 'Published' && u.id === listing.sellerId;
}

export function canEditComment(
  u: Actor | null,
  comment: { authorId: string },
  listing: { status: string }
): boolean {
  return !!u && listing.status === 'Published' && u.id === comment.authorId;
}

export function canDeleteComment(u: Actor | null, comment: { authorId: string }): boolean {
  return !!u && (u.id === comment.authorId || isAdmin(u));
}

export function canLikeListing(u: Actor | null, listing: { status: string }): boolean {
  return !!u && listing.status === 'Published';
}

export function countActiveAdmins(users: Actor[]): number {
  return users.filter((u) => u.role === 'admin' && (u.status ?? 'active') === 'active').length;
}

export type PolicyDecision =
  | { ok: true }
  | { ok: false; status: number; code: string; error: string };

export function canSuspendUser(
  actor: Actor | null | undefined,
  target: Actor | null | undefined,
  allUsers: Actor[]
): PolicyDecision {
  if (!isAdmin(actor)) {
    return { ok: false, status: 403, code: 'forbidden', error: 'صلاحيات المشرف مطلوبة لهذا الإجراء' };
  }
  if (!target) {
    return { ok: false, status: 404, code: 'not_found', error: 'المستخدم غير موجود' };
  }
  if (actor!.id === target.id) {
    return {
      ok: false,
      status: 400,
      code: 'cannot_suspend_self',
      error: 'لا يمكنك إيقاف حسابك الإداري الشخصي',
    };
  }
  if ((target.status ?? 'active') === 'suspended') {
    return {
      ok: false,
      status: 400,
      code: 'already_suspended',
      error: 'هذا الحساب موقوف بالفعل',
    };
  }
  if (target.role === 'admin' && countActiveAdmins(allUsers) <= 1) {
    return {
      ok: false,
      status: 409,
      code: 'last_admin',
      error: 'لا يمكن إيقاف آخر مشرف نشط في المنصة',
    };
  }
  return { ok: true };
}

export function canReactivateUser(
  actor: Actor | null | undefined,
  target: Actor | null | undefined
): PolicyDecision {
  if (!isAdmin(actor)) {
    return { ok: false, status: 403, code: 'forbidden', error: 'صلاحيات المشرف مطلوبة لهذا الإجراء' };
  }
  if (!target) {
    return { ok: false, status: 404, code: 'not_found', error: 'المستخدم غير موجود' };
  }
  if ((target.status ?? 'active') === 'active') {
    return {
      ok: false,
      status: 400,
      code: 'already_active',
      error: 'هذا الحساب نشط بالفعل',
    };
  }
  return { ok: true };
}

export function canReviewSellerVerification(actor: Actor | null | undefined): boolean {
  return isAdmin(actor);
}

export function canChangeUserRole(
  actor: Actor | null | undefined,
  target: Actor | null | undefined,
  nextRole: 'buyer' | 'seller' | 'admin',
  allUsers: Actor[]
): PolicyDecision {
  if (!isAdmin(actor)) {
    return { ok: false, status: 403, code: 'forbidden', error: 'صلاحيات المشرف مطلوبة لهذا الإجراء' };
  }
  if (!target) {
    return { ok: false, status: 404, code: 'not_found', error: 'المستخدم غير موجود' };
  }
  if (actor!.id === target.id && nextRole !== 'admin') {
    return {
      ok: false,
      status: 400,
      code: 'cannot_demote_self',
      error: 'لا يمكنك إزالة صلاحية المشرف عن حسابك الشخصي',
    };
  }
  if (
    target.role === 'admin' &&
    nextRole !== 'admin' &&
    (target.status ?? 'active') === 'active' &&
    countActiveAdmins(allUsers) <= 1
  ) {
    return {
      ok: false,
      status: 409,
      code: 'last_admin',
      error: 'لا يمكن إزالة صلاحية آخر مشرف نشط في المنصة',
    };
  }
  return { ok: true };
}

