import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  CornerDownLeft,
  Flag,
  Loader2,
  LogIn,
  MessageCircle,
  Pencil,
  Send,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import type {
  Listing,
  ListingComment,
  ListingCommentThread,
  User,
} from '../types/marketplace';
import { api } from '../lib/api';
import { formatRelativeArabicTime } from '../lib/format';
import { VerifiedSellerBadge } from './VerifiedSellerBadge';

const PAGE_SIZE = 5;
const MAX_COMMENT_CHARS = 600;

interface ListingCommentsSectionProps {
  listing: Listing;
  currentUser: User | null;
  refreshSignal?: number;
  targetCommentId?: string | null;
  onRequireAuth: () => void;
  onNotify?: (message: string) => void;
}

export function ListingCommentsSection({
  listing,
  currentUser,
  refreshSignal = 0,
  targetCommentId = null,
  onRequireAuth,
  onNotify,
}: ListingCommentsSectionProps) {
  const isPublished = listing.status === 'Published';
  const isListingOwner = Boolean(currentUser && currentUser.id === listing.sellerId);
  const isAdminUser = currentUser?.role === 'admin';

  const [threads, setThreads] = useState<ListingCommentThread[]>([]);
  const [totalThreads, setTotalThreads] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(isPublished);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const scrolledCommentKeyRef = useRef<string | null>(null);
  const autoPageFetchesRef = useRef(0);

  // Top-level question composer
  const [questionBody, setQuestionBody] = useState('');
  const [submittingQuestion, setSubmittingQuestion] = useState(false);
  const [questionError, setQuestionError] = useState('');

  // Seller reply composer
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [replyError, setReplyError] = useState('');

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  // Inline deletion / admin moderation confirm
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [moderationReason, setModerationReason] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  // Inline comment report
  const [reportTargetId, setReportTargetId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('محتوى مسيء أو غير لائق');
  const [reportDetails, setReportDetails] = useState('');
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportError, setReportError] = useState('');
  const [reportedIds, setReportedIds] = useState<string[]>([]);

  const activeListingIdRef = useRef(listing.id);
  activeListingIdRef.current = listing.id;
  const fetchSeqRef = useRef(0);

  const fetchFirstPage = useCallback(
    async (keepCount?: number) => {
      const targetListingId = listing.id;
      const seq = ++fetchSeqRef.current;
      if (!isPublished) {
        setThreads([]);
        setTotalThreads(0);
        setTotalCount(0);
        setHasMore(false);
        setNextOffset(null);
        setLoadingInitial(false);
        return;
      }

      const limit = Math.max(PAGE_SIZE, Math.min(50, keepCount || PAGE_SIZE));
      try {
        const res = await api.getListingComments(targetListingId, { limit, offset: 0 });
        if (activeListingIdRef.current !== targetListingId || fetchSeqRef.current !== seq) {
          return;
        }
        setThreads(res.threads);
        setTotalThreads(res.totalThreads);
        setTotalCount(res.totalCount);
        setHasMore(res.hasMore);
        setNextOffset(res.nextOffset);
        setLoadError('');
      } catch (err: any) {
        if (activeListingIdRef.current !== targetListingId || fetchSeqRef.current !== seq) {
          return;
        }
        setLoadError(err?.message || 'تعذر تحميل الأسئلة والتعليقات');
      } finally {
        if (activeListingIdRef.current === targetListingId && fetchSeqRef.current === seq) {
          setLoadingInitial(false);
        }
      }
    },
    [isPublished, listing.id]
  );

  useEffect(() => {
    setLoadingInitial(isPublished);
    setLoadingMore(false);
    setThreads([]);
    setTotalThreads(0);
    setTotalCount(0);
    setHasMore(false);
    setNextOffset(null);
    setLoadError('');
    setHighlightedCommentId(null);
    setQuestionBody('');
    setSubmittingQuestion(false);
    setReplyTargetId(null);
    setReplyBody('');
    setSubmittingReply(false);
    setEditingId(null);
    setEditingBody('');
    setSavingEdit(false);
    setDeleteTargetId(null);
    setModerationReason('');
    setDeletingId(null);
    setReportTargetId(null);
    setReportReason('محتوى مسيء أو غير لائق');
    setReportDetails('');
    setReportingId(null);
    setReportedIds([]);
    setQuestionError('');
    setReplyError('');
    setEditError('');
    setActionError('');
    setReportError('');
    fetchFirstPage(PAGE_SIZE);
  }, [fetchFirstPage, isPublished, listing.id]);

  useEffect(() => {
    if (refreshSignal > 0 && isPublished) {
      fetchFirstPage(Math.max(PAGE_SIZE, threads.length));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  const handleLoadMore = async () => {
    if (!hasMore || nextOffset === null || loadingMore) return;
    const targetListingId = listing.id;
    setLoadingMore(true);
    setLoadError('');
    try {
      const res = await api.getListingComments(targetListingId, {
        limit: PAGE_SIZE,
        offset: nextOffset,
      });
      if (activeListingIdRef.current !== targetListingId) return;
      setThreads((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        const appended = res.threads.filter((t) => !seen.has(t.id));
        return [...prev, ...appended];
      });
      setTotalThreads(res.totalThreads);
      setTotalCount(res.totalCount);
      setHasMore(res.hasMore);
      setNextOffset(res.nextOffset);
    } catch (err: any) {
      if (activeListingIdRef.current !== targetListingId) return;
      setLoadError(err?.message || 'تعذر تحميل المزيد من التعليقات');
    } finally {
      if (activeListingIdRef.current === targetListingId) {
        setLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    autoPageFetchesRef.current = 0;
    scrolledCommentKeyRef.current = null;
  }, [listing.id, targetCommentId]);

  useEffect(() => {
    if (!targetCommentId || !isPublished || loadingInitial) return;
    const key = `${listing.id}:${targetCommentId}`;
    if (scrolledCommentKeyRef.current === key) return;

    const found = threads.some(
      (t) => t.id === targetCommentId || t.replies.some((r) => r.id === targetCommentId)
    );

    if (found) {
      scrolledCommentKeyRef.current = key;
      setHighlightedCommentId(targetCommentId);
      const timer = window.setTimeout(() => {
        document
          .getElementById(`comment-${targetCommentId}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 60);
      const clearTimer = window.setTimeout(() => {
        setHighlightedCommentId((cur) => (cur === targetCommentId ? null : cur));
      }, 5000);
      return () => {
        window.clearTimeout(timer);
        window.clearTimeout(clearTimer);
      };
    }

    if (hasMore && !loadingMore && autoPageFetchesRef.current < 5) {
      autoPageFetchesRef.current += 1;
      handleLoadMore();
      return;
    }

    if (!hasMore) {
      scrolledCommentKeyRef.current = key;
      document
        .getElementById('listing-comments-section')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [targetCommentId, isPublished, loadingInitial, threads, hasMore, loadingMore, listing.id]);

  const handlePostQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuestionError('');
    const trimmed = questionBody.trim();
    if (trimmed.length < 2) {
      setQuestionError('يرجى كتابة سؤال أو تعليق لا يقل عن حرفين');
      return;
    }
    if (trimmed.length > MAX_COMMENT_CHARS) {
      setQuestionError(`الحد الأقصى للتعليق هو ${MAX_COMMENT_CHARS} حرف`);
      return;
    }

    const targetListingId = listing.id;
    setSubmittingQuestion(true);
    try {
      const res = await api.postListingComment(targetListingId, { body: trimmed });
      if (activeListingIdRef.current !== targetListingId) return;
      const newThread: ListingCommentThread = { ...res.comment, replies: [] };
      setThreads((prev) => [newThread, ...prev.filter((t) => t.id !== newThread.id)]);
      setTotalThreads((n) => n + 1);
      setTotalCount((n) => n + 1);
      setQuestionBody('');
      onNotify?.('تم نشر سؤالك في التعليقات العامة');
    } catch (err: any) {
      if (activeListingIdRef.current !== targetListingId) return;
      setQuestionError(err?.message || 'تعذر إرسال التعليق، حاول مرة أخرى');
    } finally {
      if (activeListingIdRef.current === targetListingId) {
        setSubmittingQuestion(false);
      }
    }
  };

  const handlePostReply = async (e: React.FormEvent, parentId: string) => {
    e.preventDefault();
    setReplyError('');
    const trimmed = replyBody.trim();
    if (trimmed.length < 2) {
      setReplyError('يرجى كتابة رد لا يقل عن حرفين');
      return;
    }
    if (trimmed.length > MAX_COMMENT_CHARS) {
      setReplyError(`الحد الأقصى للرد هو ${MAX_COMMENT_CHARS} حرف`);
      return;
    }

    const targetListingId = listing.id;
    setSubmittingReply(true);
    try {
      const res = await api.postListingComment(targetListingId, { body: trimmed, parentId });
      if (activeListingIdRef.current !== targetListingId) return;
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === parentId
            ? {
                ...thread,
                replies: [
                  ...thread.replies.filter((r) => r.id !== res.comment.id),
                  res.comment,
                ],
              }
            : thread
        )
      );
      setTotalCount((n) => n + 1);
      setReplyTargetId(null);
      setReplyBody('');
      onNotify?.('تم إرسال ردك وإشعار السائل');
    } catch (err: any) {
      if (activeListingIdRef.current !== targetListingId) return;
      setReplyError(err?.message || 'تعذر إرسال الرد، حاول مرة أخرى');
    } finally {
      if (activeListingIdRef.current === targetListingId) {
        setSubmittingReply(false);
      }
    }
  };

  const handleSaveEdit = async (e: React.FormEvent, commentId: string) => {
    e.preventDefault();
    setEditError('');
    const trimmed = editingBody.trim();
    if (trimmed.length < 2) {
      setEditError('يرجى كتابة نص لا يقل عن حرفين');
      return;
    }
    if (trimmed.length > MAX_COMMENT_CHARS) {
      setEditError(`الحد الأقصى للنص هو ${MAX_COMMENT_CHARS} حرف`);
      return;
    }

    const targetListingId = listing.id;
    setSavingEdit(true);
    try {
      const res = await api.updateListingComment(commentId, trimmed);
      if (activeListingIdRef.current !== targetListingId) return;
      setThreads((prev) =>
        prev.map((thread) => {
          if (thread.id === commentId) {
            return { ...thread, ...res.comment, replies: thread.replies };
          }
          return {
            ...thread,
            replies: thread.replies.map((rep) => (rep.id === commentId ? res.comment : rep)),
          };
        })
      );
      setEditingId(null);
      setEditingBody('');
      onNotify?.('تم تحديث التعليق');
    } catch (err: any) {
      if (activeListingIdRef.current !== targetListingId) return;
      setEditError(err?.message || 'تعذر تعديل التعليق');
    } finally {
      if (activeListingIdRef.current === targetListingId) {
        setSavingEdit(false);
      }
    }
  };

  const handleConfirmDelete = async (target: ListingComment) => {
    const targetListingId = listing.id;
    setDeletingId(target.id);
    setActionError('');
    try {
      const isModeratingOther = Boolean(isAdminUser && target.authorId !== currentUser?.id);
      const res = await api.deleteListingComment(
        target.id,
        isModeratingOther ? moderationReason.trim() || undefined : undefined
      );
      if (activeListingIdRef.current !== targetListingId) return;
      const removedCount = Math.max(1, res.deletedIds?.length || 1);
      if (target.parentId === null) {
        setThreads((prev) => prev.filter((t) => t.id !== target.id));
        setTotalThreads((n) => Math.max(0, n - 1));
      } else {
        setThreads((prev) =>
          prev.map((t) =>
            t.id === target.parentId
              ? { ...t, replies: t.replies.filter((r) => r.id !== target.id) }
              : t
          )
        );
      }
      setTotalCount((n) => Math.max(0, n - removedCount));
      setDeleteTargetId(null);
      setModerationReason('');
      onNotify?.(isModeratingOther ? 'تمت إزالة التعليق إدارياً' : 'تم حذف التعليق');
    } catch (err: any) {
      if (activeListingIdRef.current !== targetListingId) return;
      setActionError(err?.message || 'تعذر حذف التعليق');
    } finally {
      if (activeListingIdRef.current === targetListingId) {
        setDeletingId(null);
      }
    }
  };

  const handleSubmitCommentReport = async (e: React.FormEvent, target: ListingComment) => {
    e.preventDefault();
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    const targetListingId = listing.id;
    setReportingId(target.id);
    setReportError('');
    try {
      await api.createReport(targetListingId, reportReason, reportDetails.trim(), target.id);
      if (activeListingIdRef.current !== targetListingId) return;
      setReportedIds((prev) => (prev.includes(target.id) ? prev : [...prev, target.id]));
      setReportTargetId(null);
      setReportDetails('');
      onNotify?.('تم إرسال بلاغ التعليق إلى فريق الإشراف للمراجعة');
    } catch (err: any) {
      if (activeListingIdRef.current !== targetListingId) return;
      setReportError(err?.message || 'تعذر إرسال البلاغ، حاول مرة أخرى');
    } finally {
      if (activeListingIdRef.current === targetListingId) {
        setReportingId(null);
      }
    }
  };

  const renderCommentHeader = (item: ListingComment) => (
    <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs min-w-0">
        <span className="font-display text-sm font-bold text-[var(--color-ink)]">
          {item.authorName}
        </span>
        {item.isSeller && (
          <span className="inline-flex items-center px-2 py-0.5 rounded bg-[var(--color-green)] text-white text-[11px] font-semibold">
            صاحب الإعلان
          </span>
        )}
        {item.isVerifiedSeller && <VerifiedSellerBadge variant="compact" />}
        <span aria-hidden="true" className="text-[var(--color-muted)]">
          ·
        </span>
        <span className="text-[var(--color-muted)] tabular-nums">
          {formatRelativeArabicTime(item.createdAt)}
        </span>
        {item.isEdited && (
          <>
            <span aria-hidden="true" className="text-[var(--color-muted)]">
              ·
            </span>
            <span className="text-[11px] text-[var(--color-muted)]">(تم التعديل)</span>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {item.parentId === null && isListingOwner && (
          <button
            type="button"
            onClick={() => {
              setReplyError('');
              if (replyTargetId === item.id) {
                setReplyTargetId(null);
                setReplyBody('');
              } else {
                setReplyTargetId(item.id);
                setReplyBody('');
              }
            }}
            className="min-h-[44px] sm:min-h-[34px] px-2.5 sm:px-2 rounded-md text-xs font-semibold text-[var(--color-green-ink)] hover:bg-[var(--color-cream)] inline-flex items-center gap-1 transition-colors cursor-pointer"
          >
            <CornerDownLeft size={13} aria-hidden="true" />
            <span>{replyTargetId === item.id ? 'إغلاق الرد' : 'رد على السؤال'}</span>
          </button>
        )}

        {currentUser && currentUser.id === item.authorId && (
          <button
            type="button"
            onClick={() => {
              setEditError('');
              setDeleteTargetId(null);
              if (editingId === item.id) {
                setEditingId(null);
                setEditingBody('');
              } else {
                setEditingId(item.id);
                setEditingBody(item.body);
              }
            }}
            className="min-h-[44px] sm:min-h-[34px] px-2.5 sm:px-2 rounded-md text-xs font-medium text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-cream)] inline-flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Pencil size={12} aria-hidden="true" />
            <span>تعديل</span>
          </button>
        )}

        {currentUser && (currentUser.id === item.authorId || isAdminUser) && (
          <button
            type="button"
            onClick={() => {
              setActionError('');
              setEditingId(null);
              setModerationReason('');
              setDeleteTargetId(deleteTargetId === item.id ? null : item.id);
            }}
            className="min-h-[44px] sm:min-h-[34px] px-2.5 sm:px-2 rounded-md text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50/70 dark:hover:bg-red-950/30 inline-flex items-center gap-1 transition-colors cursor-pointer"
          >
            {isAdminUser && currentUser.id !== item.authorId ? (
              <>
                <ShieldAlert size={12} aria-hidden="true" />
                <span>إزالة إدارية</span>
              </>
            ) : (
              <>
                <Trash2 size={12} aria-hidden="true" />
                <span>حذف</span>
              </>
            )}
          </button>
        )}

        {(!currentUser || currentUser.id !== item.authorId) && (
          <button
            type="button"
            disabled={reportedIds.includes(item.id)}
            onClick={() => {
              if (!currentUser) {
                onRequireAuth();
                return;
              }
              setReportError('');
              setDeleteTargetId(null);
              setReportTargetId(reportTargetId === item.id ? null : item.id);
            }}
            className="min-h-[44px] sm:min-h-[34px] px-2.5 sm:px-2 rounded-md text-xs font-medium text-[var(--color-muted)] hover:text-red-700 dark:hover:text-red-400 hover:bg-[var(--color-cream)] inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-default"
          >
            <Flag size={12} aria-hidden="true" />
            <span>{reportedIds.includes(item.id) ? 'تم الإبلاغ' : 'إبلاغ'}</span>
          </button>
        )}
      </div>
    </div>
  );

  const renderDeleteConfirm = (item: ListingComment) => {
    if (deleteTargetId !== item.id) return null;
    const isAdminAction = Boolean(isAdminUser && currentUser?.id !== item.authorId);

    return (
      <div className="mt-3 p-3.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/30 space-y-2.5">
        <p className="text-xs font-semibold text-red-800 dark:text-red-300">
          {isAdminAction
            ? 'إزالة التعليق إدارياً وتوثيقه في سجل التدقيق:'
            : item.parentId === null
            ? 'هل أنت متأكد من حذف هذا السؤال (سيتم حذف الردود المرتبطة به أيضاً)؟'
            : 'هل أنت متأكد من حذف هذا الرد؟'}
        </p>
        {isAdminAction && (
          <input
            type="text"
            value={moderationReason}
            onChange={(e) => setModerationReason(e.target.value)}
            placeholder="سبب الإزالة (اختياري، مثال: محتوى مخالف أو رسالة دعائية)"
            className="w-full h-10 px-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-[var(--color-surface)] text-xs text-[var(--color-ink)]"
          />
        )}
        {actionError && (
          <p role="alert" className="text-xs text-red-700 dark:text-red-300">
            {actionError}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={deletingId === item.id}
            onClick={() => handleConfirmDelete(item)}
            className="min-h-[38px] px-4 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
          >
            {deletingId === item.id ? 'جاري الحذف...' : 'تأكيد الحذف'}
          </button>
          <button
            type="button"
            onClick={() => {
              setDeleteTargetId(null);
              setModerationReason('');
              setActionError('');
            }}
            className="min-h-[38px] px-4 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-ink)] cursor-pointer"
          >
            إلغاء
          </button>
        </div>
      </div>
    );
  };

  const renderReportForm = (item: ListingComment) => {
    if (reportTargetId !== item.id) return null;
    return (
      <form
        onSubmit={(e) => handleSubmitCommentReport(e, item)}
        className="mt-3 p-3.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)]/60 space-y-2.5"
      >
        <p className="text-xs font-semibold text-[var(--color-ink)]">
          الإبلاغ عن تعليق مخالف لمراجعته من قِبل المشرفين:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select
            aria-label="سبب الإبلاغ عن التعليق"
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            className="h-10 px-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-ink)]"
          >
            <option value="محتوى مسيء أو غير لائق">محتوى مسيء أو غير لائق</option>
            <option value="معلومات مضللة">معلومات مضللة</option>
            <option value="رسالة دعائية أو سبام">رسالة دعائية أو سبام</option>
            <option value="مخالفة شروط المنصة">مخالفة شروط المنصة</option>
          </select>
          <input
            type="text"
            value={reportDetails}
            onChange={(e) => setReportDetails(e.target.value)}
            placeholder="تفاصيل إضافية (اختياري)..."
            className="h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-ink)]"
          />
        </div>
        {reportError && (
          <p role="alert" className="text-xs text-red-700 dark:text-red-300">
            {reportError}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={reportingId === item.id}
            className="min-h-[38px] px-4 py-1.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
          >
            {reportingId === item.id ? 'جاري الإرسال...' : 'إرسال البلاغ'}
          </button>
          <button
            type="button"
            onClick={() => {
              setReportTargetId(null);
              setReportDetails('');
              setReportError('');
            }}
            className="min-h-[38px] px-4 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-ink)] cursor-pointer"
          >
            إلغاء
          </button>
        </div>
      </form>
    );
  };

  const renderBodyOrEditor = (item: ListingComment) => {
    if (editingId === item.id) {
      return (
        <form onSubmit={(e) => handleSaveEdit(e, item.id)} className="mt-2.5 space-y-2">
          <textarea
            rows={3}
            maxLength={MAX_COMMENT_CHARS}
            value={editingBody}
            onChange={(e) => {
              setEditingBody(e.target.value);
              if (editError) setEditError('');
            }}
            aria-label="تعديل نص التعليق"
            className="w-full p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
          />
          {editError && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-300">
              {editError}
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-[var(--color-muted)] tabular-nums">
              {editingBody.trim().length} / {MAX_COMMENT_CHARS}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setEditingBody('');
                  setEditError('');
                }}
                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-muted)] hover:bg-[var(--color-cream)] cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="min-h-[36px] px-4 py-1.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {savingEdit ? 'جاري الحفظ...' : 'حفظ التعديل'}
              </button>
            </div>
          </div>
        </form>
      );
    }

    return (
      <p className="mt-2 text-sm text-[var(--color-ink)] leading-relaxed whitespace-pre-line break-words">
        {item.body}
      </p>
    );
  };

  return (
    <section
      id="listing-comments-section"
      aria-labelledby="listing-comments-heading"
      className="mt-8 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-4 sm:p-6 space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--color-border)]">
        <div>
          <div className="flex items-center gap-2 text-[var(--color-green-ink)]">
            <MessageCircle size={18} aria-hidden="true" />
            <h2
              id="listing-comments-heading"
              className="font-display text-lg sm:text-xl font-bold text-[var(--color-ink)]"
            >
              الأسئلة والتعليقات العامة ({totalCount.toLocaleString('en-US')})
            </h2>
          </div>
          <p className="mt-1 text-xs text-[var(--color-muted)] leading-relaxed">
            اطرح استفسارك للمربي حول المواصفات أو التحصين أو التوصيل ليستفيد جميع المشترين من الإجابة.
          </p>
        </div>
      </div>

      {!isPublished ? (
        <div className="p-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/50 text-center">
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            الأسئلة والتعليقات العامة غير مفعّلة لهذا الإعلان حالياً
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            تُفتح الأسئلة والتعليقات تلقائياً بعد اعتماد الإعلان ونشره في السوق.
          </p>
        </div>
      ) : (
        <>
          {/* New Question Composer */}
          {currentUser ? (
            <form
              onSubmit={handlePostQuestion}
              className="p-4 rounded-xl bg-[var(--color-cream)]/45 border border-[var(--color-border)] space-y-3"
            >
              <label
                htmlFor="new-listing-comment"
                className="block text-xs font-semibold text-[var(--color-ink)]"
              >
                إضافة سؤال أو تعليق عام
              </label>
              <textarea
                id="new-listing-comment"
                rows={3}
                maxLength={MAX_COMMENT_CHARS}
                value={questionBody}
                onChange={(e) => {
                  setQuestionBody(e.target.value);
                  if (questionError) setQuestionError('');
                }}
                placeholder="مثال: هل يوجد شهادة تحصين بيطري، وما إمكانية الشحن إلى مدينتي؟"
                className="w-full p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/75 focus:outline-none focus:border-[var(--color-green-ink)]"
              />

              {questionError && (
                <p
                  role="alert"
                  className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
                >
                  {questionError}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-[var(--color-muted)] tabular-nums">
                  {questionBody.trim().length} / {MAX_COMMENT_CHARS} حرف
                </span>
                <button
                  type="submit"
                  disabled={submittingQuestion}
                  className="min-h-[42px] px-5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                >
                  {submittingQuestion ? (
                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Send size={14} aria-hidden="true" />
                  )}
                  <span>{submittingQuestion ? 'جاري النشر...' : 'نشر السؤال'}</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/55 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--color-ink)]">
                  هل لديك استفسار عن هذا العرض؟
                </p>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">
                  سجّل الدخول لطرح سؤالك على المربي ومتابعة رده مباشرة.
                </p>
              </div>
              <button
                type="button"
                onClick={onRequireAuth}
                className="min-h-[42px] px-4 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn size={14} aria-hidden="true" />
                <span>تسجيل الدخول للمشاركة</span>
              </button>
            </div>
          )}

          {/* Comments List */}
          {loadError && (
            <p
              role="alert"
              className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
            >
              {loadError}
            </p>
          )}

          {loadingInitial ? (
            <div className="py-8 text-center text-xs text-[var(--color-muted)] flex items-center justify-center gap-2">
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              <span>جاري تحميل الأسئلة والتعليقات...</span>
            </div>
          ) : threads.length === 0 ? (
            <div className="py-8 px-4 text-center rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/30">
              <p className="text-sm font-semibold text-[var(--color-ink)]">
                لا توجد أسئلة أو تعليقات على هذا الإعلان بعد
              </p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                كن أول من يطرح سؤالاً واضحاً للمربي حول المواصفات أو السعر.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {threads.map((thread) => (
                <article
                  key={thread.id}
                  id={`comment-${thread.id}`}
                  className={`py-5 first:pt-2 last:pb-1 space-y-3 transition-colors ${
                    highlightedCommentId === thread.id
                      ? 'ring-2 ring-[var(--color-gold)] bg-[var(--color-gold-soft)]/30 rounded-xl px-3 -mx-3'
                      : ''
                  }`}
                >
                  <div>
                    {renderCommentHeader(thread)}
                    {renderBodyOrEditor(thread)}
                    {renderDeleteConfirm(thread)}
                    {renderReportForm(thread)}
                  </div>

                  {/* Direct Replies from Listing Owner */}
                  {thread.replies.length > 0 && (
                    <div className="mr-3 sm:mr-7 pr-3 border-r border-[var(--color-border)] space-y-2.5">
                      {thread.replies.map((reply) => (
                        <div
                          key={reply.id}
                          id={`comment-${reply.id}`}
                          className={`p-3.5 sm:p-4 rounded-xl border transition-colors ${
                            highlightedCommentId === reply.id
                              ? 'border-[var(--color-gold)] ring-2 ring-[var(--color-gold)] bg-[var(--color-gold-soft)]/40'
                              : 'border-[var(--color-border)] bg-[var(--color-cream)]/55'
                          }`}
                        >
                          {renderCommentHeader(reply)}
                          {renderBodyOrEditor(reply)}
                          {renderDeleteConfirm(reply)}
                          {renderReportForm(reply)}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Inline Reply Composer for Listing Owner */}
                  {isListingOwner && replyTargetId === thread.id && (
                    <form
                      onSubmit={(e) => handlePostReply(e, thread.id)}
                      className="mr-3 sm:mr-7 p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/45 space-y-2.5"
                    >
                      <label
                        htmlFor={`reply-input-${thread.id}`}
                        className="block text-xs font-semibold text-[var(--color-green-ink)]"
                      >
                        الرد المباشر بصفتك صاحب الإعلان على «{thread.authorName}»
                      </label>
                      <textarea
                        id={`reply-input-${thread.id}`}
                        rows={2}
                        maxLength={MAX_COMMENT_CHARS}
                        value={replyBody}
                        onChange={(e) => {
                          setReplyBody(e.target.value);
                          if (replyError) setReplyError('');
                        }}
                        placeholder="اكتب ردك الواضح للمشتري..."
                        className="w-full p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                      />
                      {replyError && (
                        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
                          {replyError}
                        </p>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[var(--color-muted)] tabular-nums">
                          {replyBody.trim().length} / {MAX_COMMENT_CHARS}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setReplyTargetId(null);
                              setReplyBody('');
                              setReplyError('');
                            }}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-muted)] hover:bg-[var(--color-surface)] cursor-pointer"
                          >
                            إلغاء
                          </button>
                          <button
                            type="submit"
                            disabled={submittingReply}
                            className="min-h-[36px] px-4 py-1.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                          >
                            <Send size={12} aria-hidden="true" />
                            <span>{submittingReply ? 'جاري الإرسال...' : 'إرسال الرد'}</span>
                          </button>
                        </div>
                      </div>
                    </form>
                  )}
                </article>
              ))}
            </div>
          )}

          {/* Incremental Pagination Button */}
          {hasMore && (
            <div className="pt-2 flex justify-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={handleLoadMore}
                className="min-h-[44px] px-5 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)]/60 hover:bg-[var(--color-cream)] text-xs font-semibold text-[var(--color-ink)] inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
              >
                {loadingMore ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                ) : (
                  <ChevronDown size={14} aria-hidden="true" />
                )}
                <span>
                  {loadingMore
                    ? 'جاري التحميل...'
                    : `عرض المزيد من الأسئلة (${Math.max(0, totalThreads - threads.length).toLocaleString('en-US')} متبقي)`}
                </span>
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
