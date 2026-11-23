import test from 'node:test';
import assert from 'node:assert/strict';
import { canLikeListing, type Actor } from '../../server/auth/policy';
import {
  applyListingLikeMutation,
  attachLikesCountToListing,
  getUserLikedListingIds,
  LIKE_NOTIFICATION_COOLDOWN_MS,
  LikeValidationError,
  normalizeLikesStore,
  parseLikeAction,
  recordLikeNotification,
  shouldSendLikeNotification,
  type LikeNotificationHistory,
  type LikesMap,
} from '../../server/likes';

const buyer: Actor = { id: 'usr_buyer', role: 'buyer' };
const seller: Actor = { id: 'usr_seller', role: 'seller' };
const admin: Actor = { id: 'usr_admin', role: 'admin' };

test('canLikeListing restricts likes to authenticated users on Published listings', () => {
  assert.equal(canLikeListing(null, { status: 'Published' }), false);
  assert.equal(canLikeListing(buyer, { status: 'Published' }), true);
  assert.equal(canLikeListing(seller, { status: 'Published' }), true);
  assert.equal(canLikeListing(admin, { status: 'Published' }), true);

  for (const status of ['Pending', 'Draft', 'Rejected', 'Sold']) {
    assert.equal(canLikeListing(buyer, { status }), false);
    assert.equal(canLikeListing(seller, { status }), false);
    assert.equal(canLikeListing(admin, { status }), false);
  }
});

test('applyListingLikeMutation prevents duplicate likes and tracks changes accurately', () => {
  const likes: LikesMap = {};

  const first = applyListingLikeMutation({
    likes,
    listingId: 'lst_1',
    userId: 'usr_1',
    action: 'like',
  });
  assert.deepEqual(first, { isLiked: true, likesCount: 1, changed: true });
  assert.deepEqual(likes.lst_1, ['usr_1']);

  // Duplicate like is idempotent and reports changed: false
  const duplicate = applyListingLikeMutation({
    likes,
    listingId: 'lst_1',
    userId: 'usr_1',
    action: 'like',
  });
  assert.deepEqual(duplicate, { isLiked: true, likesCount: 1, changed: false });
  assert.deepEqual(likes.lst_1, ['usr_1']);

  const secondUser = applyListingLikeMutation({
    likes,
    listingId: 'lst_1',
    userId: 'usr_2',
    action: 'toggle',
  });
  assert.deepEqual(secondUser, { isLiked: true, likesCount: 2, changed: true });

  // Unlike removes user and cleans empty array when last like removed
  const unlike1 = applyListingLikeMutation({
    likes,
    listingId: 'lst_1',
    userId: 'usr_1',
    action: 'unlike',
  });
  assert.deepEqual(unlike1, { isLiked: false, likesCount: 1, changed: true });

  const unlike2 = applyListingLikeMutation({
    likes,
    listingId: 'lst_1',
    userId: 'usr_2',
    action: 'toggle',
  });
  assert.deepEqual(unlike2, { isLiked: false, likesCount: 0, changed: true });
  assert.equal('lst_1' in likes, false);
});

test('like notification anti-spam suppresses self-likes and repeats within cooldown', () => {
  const history: LikeNotificationHistory = {};
  const t0 = Date.UTC(2026, 10, 14, 10, 0, 0);

  // Self-like never notifies
  assert.equal(
    shouldSendLikeNotification({
      history,
      listingId: 'lst_1',
      actorId: 'usr_seller',
      sellerId: 'usr_seller',
      nowMs: t0,
    }),
    false
  );

  // First like from another user notifies
  assert.equal(
    shouldSendLikeNotification({
      history,
      listingId: 'lst_1',
      actorId: 'usr_buyer',
      sellerId: 'usr_seller',
      nowMs: t0,
    }),
    true
  );
  recordLikeNotification({ history, listingId: 'lst_1', actorId: 'usr_buyer', nowMs: t0 });

  // Repeated unlike + re-like 5 minutes later does not spam
  assert.equal(
    shouldSendLikeNotification({
      history,
      listingId: 'lst_1',
      actorId: 'usr_buyer',
      sellerId: 'usr_seller',
      nowMs: t0 + 5 * 60_000,
    }),
    false
  );

  // After cooldown window passes, notifications are allowed again
  assert.equal(
    shouldSendLikeNotification({
      history,
      listingId: 'lst_1',
      actorId: 'usr_buyer',
      sellerId: 'usr_seller',
      nowMs: t0 + LIKE_NOTIFICATION_COOLDOWN_MS + 1,
    }),
    true
  );
});

test('normalizeLikesStore, parseLikeAction, and getUserLikedListingIds enforce clean state', () => {
  assert.equal(parseLikeAction(undefined), 'toggle');
  assert.equal(parseLikeAction('like'), 'like');
  assert.equal(parseLikeAction('unlike'), 'unlike');
  assert.throws(() => parseLikeAction('invalid'), LikeValidationError);

  const normalized = normalizeLikesStore({
    lst_pub: ['usr_1', 'usr_1', '  usr_2 ', '', 123],
    lst_pending: ['usr_1'],
    lst_empty: [],
  });
  assert.deepEqual(normalized, {
    lst_pub: ['usr_1', 'usr_2'],
    lst_pending: ['usr_1'],
  });

  const likedIds = getUserLikedListingIds(normalized, 'usr_1', [
    { id: 'lst_pub', status: 'Published' },
    { id: 'lst_pending', status: 'Pending' },
  ]);
  assert.deepEqual(likedIds, ['lst_pub']);

  const withCount = attachLikesCountToListing({ id: 'lst_pub', title: 'نعيمي' }, normalized);
  assert.equal(withCount.likesCount, 2);
});
