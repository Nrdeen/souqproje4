import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canDeleteComment,
  canEditComment,
  canReplyToListingComment,
  canViewListingComments,
  type Actor,
} from '../../server/auth/policy';
import {
  CommentValidationError,
  MAX_COMMENT_LENGTH,
  isDuplicateRecentComment,
  normalizeAndValidateCommentBody,
  paginateListingThreads,
  toPublicComment,
  type CommentRecord,
} from '../../server/comments';

const buyer: Actor = { id: 'usr_b1', role: 'buyer' };
const sellerOwner: Actor = { id: 'usr_s1', role: 'seller' };
const otherSeller: Actor = { id: 'usr_s2', role: 'seller' };
const admin: Actor = { id: 'usr_adm', role: 'admin' };

test('comment policy enforces published status, seller-only replies, author-only edits, and owner/admin deletion', () => {
  const pubListing = { sellerId: 'usr_s1', status: 'Published' };
  const pendingListing = { sellerId: 'usr_s1', status: 'Pending' };

  assert.equal(canViewListingComments(pubListing), true);
  assert.equal(canViewListingComments(pendingListing), false);

  assert.equal(canReplyToListingComment(sellerOwner, pubListing), true);
  assert.equal(canReplyToListingComment(sellerOwner, pendingListing), false);
  assert.equal(canReplyToListingComment(buyer, pubListing), false);
  assert.equal(canReplyToListingComment(otherSeller, pubListing), false);
  assert.equal(canReplyToListingComment(admin, pubListing), false);
  assert.equal(canReplyToListingComment(null, pubListing), false);

  const comment = { authorId: 'usr_b1' };
  assert.equal(canEditComment(buyer, comment, pubListing), true);
  assert.equal(canEditComment(buyer, comment, pendingListing), false);
  assert.equal(canEditComment(sellerOwner, comment, pubListing), false);
  assert.equal(canEditComment(admin, comment, pubListing), false);
  assert.equal(canEditComment(null, comment, pubListing), false);

  assert.equal(canDeleteComment(buyer, comment), true);
  assert.equal(canDeleteComment(admin, comment), true);
  assert.equal(canDeleteComment(sellerOwner, comment), false);
  assert.equal(canDeleteComment(null, comment), false);
});

test('normalizeAndValidateCommentBody trims, enforces length limits, and blocks control chars or link spam', () => {
  assert.equal(normalizeAndValidateCommentBody('  مرحباً\r\n\r\n\r\nهل التوصيل متاح؟  '), 'مرحباً\n\nهل التوصيل متاح؟');

  assert.throws(() => normalizeAndValidateCommentBody(''), CommentValidationError);
  assert.throws(() => normalizeAndValidateCommentBody('؟'), CommentValidationError);
  assert.throws(
    () => normalizeAndValidateCommentBody('أ'.repeat(MAX_COMMENT_LENGTH + 1)),
    CommentValidationError
  );
  assert.throws(() => normalizeAndValidateCommentBody('abc\u0000def'), CommentValidationError);
  assert.throws(
    () =>
      normalizeAndValidateCommentBody(
        'https://a.test https://b.test https://c.test إعلان سبام'
      ),
    CommentValidationError
  );
});

test('toPublicComment omits private fields and resolves seller badge accurately', () => {
  const users = [
    { id: 'usr_s1', name: 'فهد', phone: '0500000000', email: 'secret@sa', passwordHash: 'HASH' },
    { id: 'usr_b1', name: 'خالد', phone: '0555555555', email: 'k@sa', passwordHash: 'HASH' },
  ];
  const sellers = [
    { userId: 'usr_s1', displayName: 'مراح القحطاني', verifiedAt: '2026-01-01T00:00:00Z' },
    { userId: 'usr_s2', displayName: 'مراح آخر', verifiedAt: '2026-01-01T00:00:00Z' },
  ];
  const listing = { sellerId: 'usr_s1' };

  const sellerReply = toPublicComment(
    {
      id: 'c2',
      listingId: 'l1',
      parentId: 'c1',
      authorId: 'usr_s1',
      authorName: 'فهد',
      body: 'متاح التوصيل',
      isEdited: false,
      createdAt: '2026-11-14T10:00:00Z',
      updatedAt: '2026-11-14T10:00:00Z',
    },
    listing,
    users,
    sellers
  ) as unknown as Record<string, unknown>;

  assert.equal(sellerReply.authorName, 'مراح القحطاني');
  assert.equal(sellerReply.isSeller, true);
  assert.equal(sellerReply.isVerifiedSeller, true);
  assert.equal('phone' in sellerReply, false);
  assert.equal('email' in sellerReply, false);
  assert.equal('passwordHash' in sellerReply, false);

  const buyerQuestion = toPublicComment(
    {
      id: 'c1',
      listingId: 'l1',
      parentId: null,
      authorId: 'usr_b1',
      authorName: 'خالد',
      body: 'هل السعر شامل التوصيل؟',
      isEdited: false,
      createdAt: '2026-11-14T09:00:00Z',
      updatedAt: '2026-11-14T09:00:00Z',
    },
    listing,
    users,
    sellers
  );

  assert.equal(buyerQuestion.authorName, 'خالد');
  assert.equal(buyerQuestion.isSeller, false);
  assert.equal(buyerQuestion.isVerifiedSeller, false);
});

test('paginateListingThreads paginates newest-first questions with chronological replies and duplicate check', () => {
  const comments: CommentRecord[] = [
    {
      id: 'q1',
      listingId: 'l1',
      parentId: null,
      authorId: 'b1',
      authorName: 'أحمد',
      body: 'سؤال أول',
      isEdited: false,
      createdAt: '2026-11-14T08:00:00Z',
      updatedAt: '2026-11-14T08:00:00Z',
    },
    {
      id: 'r1',
      listingId: 'l1',
      parentId: 'q1',
      authorId: 's1',
      authorName: 'المربي',
      body: 'رد أول',
      isEdited: false,
      createdAt: '2026-11-14T08:05:00Z',
      updatedAt: '2026-11-14T08:05:00Z',
    },
    {
      id: 'q2',
      listingId: 'l1',
      parentId: null,
      authorId: 'b2',
      authorName: 'سعد',
      body: 'سؤال ثانٍ',
      isEdited: false,
      createdAt: '2026-11-14T09:00:00Z',
      updatedAt: '2026-11-14T09:00:00Z',
    },
    {
      id: 'q3',
      listingId: 'l1',
      parentId: null,
      authorId: 'b3',
      authorName: 'عمر',
      body: 'سؤال ثالث',
      isEdited: false,
      createdAt: '2026-11-14T10:00:00Z',
      updatedAt: '2026-11-14T10:00:00Z',
    },
  ];

  const page1 = paginateListingThreads({
    comments,
    listing: { id: 'l1', sellerId: 's1' },
    users: [],
    sellers: [],
    limit: 2,
    offset: 0,
  });
  assert.equal(page1.totalThreads, 3);
  assert.equal(page1.totalCount, 4);
  assert.equal(page1.hasMore, true);
  assert.equal(page1.nextOffset, 2);
  assert.deepEqual(
    page1.threads.map((t) => t.id),
    ['q3', 'q2']
  );

  const page2 = paginateListingThreads({
    comments,
    listing: { id: 'l1', sellerId: 's1' },
    users: [],
    sellers: [],
    limit: 2,
    offset: 2,
  });
  assert.equal(page2.hasMore, false);
  assert.equal(page2.nextOffset, null);
  assert.equal(page2.threads[0].id, 'q1');
  assert.equal(page2.threads[0].replies[0].id, 'r1');

  assert.equal(
    isDuplicateRecentComment({
      comments,
      listingId: 'l1',
      parentId: null,
      authorId: 'b3',
      body: '  سؤال ثالث ',
      nowMs: Date.parse('2026-11-14T10:00:30Z'),
    }),
    true
  );
  assert.equal(
    isDuplicateRecentComment({
      comments,
      listingId: 'l1',
      parentId: null,
      authorId: 'b3',
      body: 'سؤال ثالث',
      nowMs: Date.parse('2026-11-14T10:05:00Z'),
    }),
    false
  );
});
