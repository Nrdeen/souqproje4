import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canChangeUserRole,
  canReactivateUser,
  canSuspendUser,
  type Actor,
} from '../../server/auth/policy';
import {
  AdminValidationError,
  applySellerVerificationDecision,
  applyUserReactivation,
  applyUserSuspension,
  buildAdminOverview,
  filterAdminUsers,
  toAdminReportItem,
  toAdminUserSummary,
} from '../../server/admin';

const admin1: Actor = { id: 'adm_1', role: 'admin', status: 'active' };
const admin2: Actor = { id: 'adm_2', role: 'admin', status: 'active' };
const suspendedAdmin: Actor = { id: 'adm_3', role: 'admin', status: 'suspended' };
const seller1: Actor = { id: 'sel_1', role: 'seller', status: 'active' };
const buyer1: Actor = { id: 'buy_1', role: 'buyer', status: 'active' };

test('admin policy: guards suspension against non-admins, self, already suspended, and last active admin', () => {
  const all = [admin1, suspendedAdmin, seller1, buyer1];

  assert.equal(canSuspendUser(buyer1, seller1, all).ok, false);
  assert.equal(canSuspendUser(seller1, buyer1, all).ok, false);
  assert.equal(canSuspendUser(null, buyer1, all).ok, false);

  const notFound = canSuspendUser(admin1, undefined, all);
  assert.equal(notFound.ok, false);
  if (!notFound.ok) assert.equal(notFound.status, 404);

  const selfSuspend = canSuspendUser(admin1, admin1, all);
  assert.equal(selfSuspend.ok, false);
  if (!selfSuspend.ok) {
    assert.equal(selfSuspend.status, 400);
    assert.equal(selfSuspend.code, 'cannot_suspend_self');
  }

  const alreadySuspended = canSuspendUser(admin1, suspendedAdmin, all);
  assert.equal(alreadySuspended.ok, false);
  if (!alreadySuspended.ok) {
    assert.equal(alreadySuspended.status, 400);
    assert.equal(alreadySuspended.code, 'already_suspended');
  }

  // Only admin1 is active admin; admin2 is added as another active admin in the second check.
  assert.equal(canSuspendUser(admin2, admin1, [admin1, suspendedAdmin]).ok, false);
  const lastAdmin = canSuspendUser(admin2, admin1, [admin1, suspendedAdmin]);
  if (!lastAdmin.ok) {
    assert.equal(lastAdmin.status, 409);
    assert.equal(lastAdmin.code, 'last_admin');
  }

  // With two active admins, suspending one is permitted.
  assert.deepEqual(canSuspendUser(admin1, admin2, [admin1, admin2, suspendedAdmin]), { ok: true });
  assert.deepEqual(canSuspendUser(admin1, seller1, all), { ok: true });
});

test('admin policy: reactivation & role change guards', () => {
  assert.equal(canReactivateUser(buyer1, suspendedAdmin).ok, false);
  assert.equal(canReactivateUser(admin1, seller1).ok, false);
  assert.deepEqual(canReactivateUser(admin1, suspendedAdmin), { ok: true });

  const selfDemote = canChangeUserRole(admin1, admin1, 'seller', [admin1, admin2]);
  assert.equal(selfDemote.ok, false);
  if (!selfDemote.ok) assert.equal(selfDemote.code, 'cannot_demote_self');

  const lastAdminDemote = canChangeUserRole(admin2, admin1, 'buyer', [admin1]);
  assert.equal(lastAdminDemote.ok, false);
  if (!lastAdminDemote.ok) assert.equal(lastAdminDemote.code, 'last_admin');

  assert.deepEqual(canChangeUserRole(admin1, admin2, 'seller', [admin1, admin2]), { ok: true });
});

test('applyUserSuspension and applyUserReactivation validate reasons, update records, and emit audit logs', () => {
  const target: any = {
    id: 'usr_target',
    name: 'سالم الدوسري',
    phone: '0551234567',
    role: 'seller',
    status: 'active',
  };
  const allUsers = [admin1, target];

  assert.throws(
    () =>
      applyUserSuspension({
        actor: admin1,
        actorName: 'مشرف النظام',
        targetUser: target,
        allUsers,
        reason: 'لا',
      }),
    (err: unknown) => err instanceof AdminValidationError && err.status === 400
  );

  assert.throws(
    () =>
      applyUserSuspension({
        actor: admin1,
        actorName: 'مشرف النظام',
        targetUser: target,
        allUsers,
        reason: 'مخالفة\u0007',
      }),
    (err: unknown) => err instanceof AdminValidationError && err.status === 400
  );

  const suspendRes = applyUserSuspension({
    actor: admin1,
    actorName: 'مشرف النظام',
    targetUser: target,
    allUsers,
    reason: 'تكرار نشر إعلانات مخالفة',
    nowIso: '2026-11-10T10:00:00.000Z',
  });

  assert.equal(target.status, 'suspended');
  assert.equal(target.suspendedAt, '2026-11-10T10:00:00.000Z');
  assert.equal(target.suspendedBy, admin1.id);
  assert.equal(target.suspensionReason, 'تكرار نشر إعلانات مخالفة');
  assert.equal(suspendRes.auditEntry.targetType, 'user');
  assert.equal(suspendRes.auditEntry.targetId, target.id);
  assert.match(suspendRes.auditEntry.note || '', /تكرار نشر إعلانات مخالفة/);

  const reactivateRes = applyUserReactivation({
    actor: admin1,
    actorName: 'مشرف النظام',
    targetUser: target,
    reason: 'تمت معالجة المخالفة والتعهد بالالتزام',
    nowIso: '2026-11-11T10:00:00.000Z',
  });

  assert.equal(target.status, 'active');
  assert.equal(target.suspendedAt, null);
  assert.equal(target.suspensionReason, null);
  assert.equal(target.reactivatedAt, '2026-11-11T10:00:00.000Z');
  assert.equal(reactivateRes.auditEntry.targetType, 'user');
  assert.match(reactivateRes.auditEntry.note || '', /تمت معالجة المخالفة/);
});

test('applySellerVerificationDecision enforces admin permission, validation rules, and audit trail', () => {
  const seller: any = {
    userId: 'usr_seller_9',
    displayName: 'مراح العتيبي',
    verificationStatus: 'Pending',
    verifiedAt: null,
  };

  assert.throws(
    () =>
      applySellerVerificationDecision({
        actor: buyer1,
        actorName: 'مشتري',
        seller,
        status: 'Verified',
      }),
    (err: unknown) => err instanceof AdminValidationError && err.status === 403
  );

  assert.throws(
    () =>
      applySellerVerificationDecision({
        actor: admin1,
        actorName: 'مشرف',
        seller,
        status: 'InvalidStatus',
      }),
    (err: unknown) => err instanceof AdminValidationError && err.status === 400
  );

  // Rejection requires a reason >= 3 chars
  assert.throws(
    () =>
      applySellerVerificationDecision({
        actor: admin1,
        actorName: 'مشرف',
        seller,
        status: 'Rejected',
        reason: '',
      }),
    (err: unknown) => err instanceof AdminValidationError && err.status === 400
  );

  const rejected = applySellerVerificationDecision({
    actor: admin1,
    actorName: 'مشرف',
    seller,
    status: 'Rejected',
    reason: 'يرجى إرفاق اسم المراح والمدينة بشكل واضح',
    nowIso: '2026-11-10T11:00:00.000Z',
  });
  assert.equal(rejected.verificationStatus, 'Rejected');
  assert.equal(seller.verificationStatus, 'Rejected');
  assert.equal(seller.verifiedAt, null);
  assert.equal(seller.verificationNote, 'يرجى إرفاق اسم المراح والمدينة بشكل واضح');
  assert.equal(rejected.auditEntry.targetType, 'seller');

  const verified = applySellerVerificationDecision({
    actor: admin1,
    actorName: 'مشرف',
    seller,
    status: 'Verified',
    reason: 'تم التحقق من بيانات المراح',
    nowIso: '2026-11-10T12:00:00.000Z',
  });
  assert.equal(verified.verificationStatus, 'Verified');
  assert.equal(seller.verificationStatus, 'Verified');
  assert.equal(seller.verifiedAt, '2026-11-10T12:00:00.000Z');
  assert.equal(verified.auditEntry.targetType, 'seller');

  const backToPending = applySellerVerificationDecision({
    actor: admin1,
    actorName: 'مشرف',
    seller,
    status: 'Pending',
  });
  assert.equal(backToPending.verificationStatus, 'Pending');
  assert.equal(seller.verifiedAt, null);
});

test('toAdminUserSummary strictly whitelists fields and never leaks credentials or private tokens', () => {
  const dirtyUser: any = {
    id: 'usr_x',
    name: 'فهد المطيري',
    phone: '0501112233',
    email: 'private@example.com',
    role: 'seller',
    status: 'active',
    phoneVerifiedAt: '2026-11-01T00:00:00.000Z',
    createdAt: '2026-11-01T00:00:00.000Z',
    passwordHash: '$argon2id$secret',
    credentials: [{ passwordHash: 'secret' }],
    sessions: [{ tokenHash: 'secret-token' }],
    favorites: ['lst_1'],
    isDemo: true,
    internalSecret: 'never-expose',
  };
  const seller: any = {
    userId: 'usr_x',
    displayName: 'مراح المطيري',
    city: 'الرياض',
    regionId: 'reg_riyadh',
    verificationStatus: 'Pending',
    verifiedAt: '2026-01-01T00:00:00.000Z', // stale timestamp must be nulled unless Verified
    internalNote: 'hidden-note',
  };
  const listings = [
    { id: 'l1', sellerId: 'usr_x', status: 'Published' },
    { id: 'l2', sellerId: 'usr_x', status: 'Pending' },
    { id: 'l3', sellerId: 'usr_other', status: 'Published' },
  ];

  const summary = toAdminUserSummary(dirtyUser, seller, listings) as unknown as Record<string, unknown>;
  assert.equal(summary.id, 'usr_x');
  assert.equal(summary.phoneVerified, true);
  assert.equal(summary.listingsCount, 2);
  assert.equal(summary.publishedListingsCount, 1);
  assert.equal(summary.pendingListingsCount, 1);
  assert.equal((summary.sellerProfile as any).verifiedAt, null);

  for (const forbidden of [
    'passwordHash',
    'credentials',
    'sessions',
    'email',
    'favorites',
    'isDemo',
    'internalSecret',
  ]) {
    assert.ok(!(forbidden in summary), `forbidden key leaked: ${forbidden}`);
  }
  assert.ok(!('internalNote' in (summary.sellerProfile as Record<string, unknown>)));
});

test('filterAdminUsers, toAdminReportItem, and buildAdminOverview aggregate accurately', () => {
  const u1 = toAdminUserSummary(
    { id: 'u1', name: 'بائع الرياض', phone: '0500000011', role: 'seller', status: 'active', createdAt: '2026-11-01T00:00:00.000Z' },
    { userId: 'u1', displayName: 'مراح النخبة', city: 'الرياض', regionId: 'r1', verificationStatus: 'Verified', verifiedAt: '2026-11-02T00:00:00.000Z' },
    [{ id: 'l1', sellerId: 'u1', status: 'Published' }]
  );
  const u2 = toAdminUserSummary(
    { id: 'u2', name: 'مشتري موقوف', phone: '0500000022', role: 'buyer', status: 'suspended', createdAt: '2026-11-02T00:00:00.000Z' },
    undefined,
    []
  );

  assert.equal(filterAdminUsers([u1, u2], { role: 'seller', verificationStatus: 'Verified' }).length, 1);
  assert.equal(filterAdminUsers([u1, u2], { status: 'suspended' })[0].id, 'u2');
  assert.equal(filterAdminUsers([u1, u2], { q: 'النخبة' })[0].id, 'u1');

  const commentReport = toAdminReportItem(
    {
      id: 'rep_c1',
      targetType: 'comment',
      listingId: 'l1',
      commentId: 'c1',
      reporterId: 'u2',
      reason: 'تعليق مسيء',
      details: 'تفاصيل',
      status: 'open',
      createdAt: '2026-11-03T00:00:00.000Z',
    },
    {
      users: [
        { id: 'u1', name: 'بائع الرياض' },
        { id: 'u2', name: 'مشتري' },
      ],
      listings: [{ id: 'l1', title: 'جذعان نعيمي', status: 'Published' }],
      comments: [{ id: 'c1', authorId: 'u1', authorName: 'بائع الرياض', body: 'نص التعليق المبلغ عنه' }],
    }
  );
  assert.equal(commentReport.targetType, 'comment');
  assert.equal(commentReport.commentBody, 'نص التعليق المبلغ عنه');
  assert.equal(commentReport.listingTitle, 'جذعان نعيمي');
  assert.equal(commentReport.reporterName, 'مشتري');

  const overview = buildAdminOverview({
    users: [
      { id: 'u1', role: 'seller', status: 'active' },
      { id: 'u2', role: 'buyer', status: 'suspended' },
      { id: 'a1', role: 'admin', status: 'active' },
    ],
    sellers: [
      { userId: 'u1', verificationStatus: 'Verified', verifiedAt: '2026-11-02T00:00:00.000Z' },
      { userId: 'u3', verificationStatus: 'Pending' },
      { userId: 'u4', verificationStatus: 'Rejected' },
    ],
    listings: [
      { id: 'l1', status: 'Published' },
      { id: 'l2', status: 'Pending' },
      { id: 'l3', status: 'Rejected' },
      { id: 'l4', status: 'Sold' },
    ],
    reports: [
      { id: 'r1', status: 'open', listingId: 'l1' },
      { id: 'r2', status: 'open', listingId: 'l1', commentId: 'c1', targetType: 'comment' },
      { id: 'r3', status: 'resolved', listingId: 'l1' },
    ],
    comments: [{ id: 'c1' }, { id: 'c2' }],
    auditLogs: Array.from({ length: 15 }, (_, idx) => ({
      id: `aud_${idx}`,
      actorId: 'a1',
      actorName: 'مشرف',
      action: 'اختبار',
      targetType: 'listing',
      targetId: `l_${idx}`,
      createdAt: '2026-11-03T00:00:00.000Z',
    })),
  });

  assert.deepEqual(overview.users, {
    total: 3,
    active: 2,
    suspended: 1,
    buyers: 1,
    sellers: 1,
    admins: 1,
  });
  assert.deepEqual(overview.sellers, {
    total: 3,
    verified: 1,
    pending: 1,
    rejected: 1,
  });
  assert.deepEqual(overview.reports, {
    total: 3,
    open: 2,
    resolved: 1,
    dismissed: 0,
    listingReportsOpen: 1,
    commentReportsOpen: 1,
  });
  assert.equal(overview.comments.total, 2);
  assert.equal(overview.recentActivity.length, 12);
});
