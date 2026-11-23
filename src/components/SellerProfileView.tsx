import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Award,
  Lock,
  MessageCircle,
  PackageOpen,
  Phone,
  Star,
} from 'lucide-react';
import type {
  Breed,
  Category,
  Listing,
  Region,
  SellerProfile,
  SellerReview,
  SellerReviewsPageResponse,
  User,
} from '../types/marketplace';
import { formatRelativeArabicTime } from '../lib/format';
import { buildSellerContactLinks } from '../lib/marketplace-helpers';
import { api } from '../lib/api';
import type { AuthMode } from '../lib/router';
import { ListingCard } from './ListingCard';
import { DynamicHeroBanner } from './DynamicHeroBanner';
import { isSellerVerified, VerifiedSellerBadge } from './VerifiedSellerBadge';

interface SellerProfileViewProps {
  seller: SellerProfile;
  currentUser: User | null;
  listings: Listing[];
  categories?: Category[];
  breeds: Breed[];
  regions: Region[];
  favoriteIds: string[];
  likedListingIds?: string[];
  reviews?: SellerReview[];
  onBack: () => void;
  onGoHome?: () => void;
  onSelectListing: (listing: Listing) => void;
  onToggleFavorite: (listingId: string) => void;
  onToggleLike?: (listingId: string) => void;
  onRequireAuth?: (mode?: AuthMode) => void;
  onSubmitReview: (
    sellerId: string,
    payload: { rating: number; comment: string }
  ) => Promise<void>;
}

const RATING_LABELS: Record<number, string> = {
  1: 'ضعيف',
  2: 'مقبول',
  3: 'جيد',
  4: 'جيد جداً',
  5: 'ممتاز',
};

function StarDisplay({ value, size = 15 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= Math.round(value);
        return (
          <Star
            key={star}
            size={size}
            className={
              filled
                ? 'text-[var(--color-gold)] fill-[var(--color-gold)]'
                : 'text-[var(--color-border)]'
            }
          />
        );
      })}
    </span>
  );
}

export function SellerProfileView({
  seller,
  currentUser,
  listings,
  categories = [],
  breeds,
  regions,
  favoriteIds,
  likedListingIds = [],
  reviews = [],
  onBack,
  onGoHome,
  onSelectListing,
  onToggleFavorite,
  onToggleLike,
  onRequireAuth,
  onSubmitReview,
}: SellerProfileViewProps) {
  const sellerListings = listings.filter(
    (l) => l.sellerId === seller.userId && l.status === 'Published'
  );

  // Scoped paginated seller reviews state
  const [reviewsPage, setReviewsPage] = useState<SellerReviewsPageResponse | null>(null);
  const [loadedReviews, setLoadedReviews] = useState<SellerReview[]>(() =>
    reviews.filter((r) => r.sellerId === seller.userId)
  );
  const [loadingReviews, setLoadingReviews] = useState<boolean>(true);
  const [loadingMoreReviews, setLoadingMoreReviews] = useState<boolean>(false);
  const [reviewsError, setReviewsError] = useState<string>('');
  const reviewFetchSeq = useRef(0);

  // On-demand seller contact reveal state
  const [revealedContact, setRevealedContact] = useState<{
    phone?: string;
    whatsapp?: string;
  } | null>(null);
  const [revealingContact, setRevealingContact] = useState(false);
  const [contactError, setContactError] = useState('');

  useEffect(() => {
    setRevealedContact(null);
    setRevealingContact(false);
    setContactError('');
  }, [seller.userId, currentUser?.id]);

  const fetchReviewsPage = useCallback(
    async (offset = 0, append = false) => {
      const seq = ++reviewFetchSeq.current;
      if (append) {
        setLoadingMoreReviews(true);
      } else {
        setLoadingReviews(true);
      }
      setReviewsError('');
      try {
        const res = await api.getSellerReviews(seller.userId, { limit: 10, offset });
        if (seq !== reviewFetchSeq.current) return;
        setReviewsPage(res);
        setLoadedReviews((prev) => {
          if (!append) return res.reviews;
          const seen = new Set(prev.map((item) => item.id));
          return [...prev, ...res.reviews.filter((item) => !seen.has(item.id))];
        });
      } catch (err: any) {
        if (seq !== reviewFetchSeq.current) return;
        setReviewsError(err?.message || 'تعذر تحميل تقييمات المربي');
      } finally {
        if (seq === reviewFetchSeq.current) {
          setLoadingReviews(false);
          setLoadingMoreReviews(false);
        }
      }
    },
    [seller.userId]
  );

  useEffect(() => {
    setLoadedReviews([]);
    setReviewsPage(null);
    fetchReviewsPage(0, false);
  }, [fetchReviewsPage, currentUser?.id]);

  const existingMyReview = useMemo(() => {
    if (reviewsPage?.myReview) return reviewsPage.myReview;
    return currentUser ? loadedReviews.find((r) => r.reviewerId === currentUser.id) || null : null;
  }, [reviewsPage?.myReview, loadedReviews, currentUser]);

  const [selectedRating, setSelectedRating] = useState<number>(existingMyReview?.rating || 5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [comment, setComment] = useState<string>(existingMyReview?.comment || '');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [savedBanner, setSavedBanner] = useState(false);

  useEffect(() => {
    setSelectedRating(existingMyReview?.rating || 5);
    setComment(existingMyReview?.comment || '');
    setFormError('');
    setSavedBanner(false);
  }, [seller.userId, existingMyReview?.id, existingMyReview?.rating, existingMyReview?.comment]);

  const isOwnProfile = !!currentUser && currentUser.id === seller.userId;
  const reviewCount = reviewsPage?.totalCount ?? seller.ratingCount ?? loadedReviews.length;
  const averageRating =
    reviewsPage?.averageRating !== undefined
      ? reviewsPage.averageRating
      : loadedReviews.length > 0
      ? Math.round(
          (loadedReviews.reduce((acc, r) => acc + r.rating, 0) / loadedReviews.length) * 10
        ) / 10
      : seller.rating;

  const breakdown = useMemo(() => {
    const serverBreakdown = reviewsPage?.ratingBreakdown;
    const total = reviewsPage?.totalCount ?? loadedReviews.length;
    return ([5, 4, 3, 2, 1] as const).map((stars) => {
      const count = serverBreakdown
        ? serverBreakdown[stars] || 0
        : loadedReviews.filter((r) => r.rating === stars).length;
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      return { stars, count, pct };
    });
  }, [reviewsPage?.ratingBreakdown, reviewsPage?.totalCount, loadedReviews]);

  const activeStarValue = hoverRating || selectedRating;
  const sellerRegion = regions.find((r) => r.id === seller.regionId);

  const handleRevealSellerContact = async () => {
    if (!currentUser || isOwnProfile || revealingContact) return;
    const targetListing = sellerListings[0];
    if (!targetListing) {
      setContactError('لا توجد إعلانات منشورة حالياً لإظهار رقم التواصل المباشر');
      return;
    }
    setRevealingContact(true);
    setContactError('');
    try {
      const res = await api.revealListingContact(targetListing.id);
      const next = {
        phone: res.phone || undefined,
        whatsapp: res.whatsapp || undefined,
      };
      if (!next.phone && !next.whatsapp) {
        setContactError('لا تتوفر أرقام اتصال مباشر لهذا المربي حالياً.');
      } else {
        setRevealedContact(next);
      }
    } catch (err: any) {
      setContactError(err?.message || 'تعذر إظهار بيانات التواصل حالياً');
    } finally {
      setRevealingContact(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSavedBanner(false);
    if (!Number.isInteger(selectedRating) || selectedRating < 1 || selectedRating > 5) {
      setFormError('يرجى اختيار عدد النجوم من 1 إلى 5');
      return;
    }
    if (comment.trim().length > 1000) {
      setFormError('التعليق يجب ألا يتجاوز 1000 حرف');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmitReview(seller.userId, {
        rating: selectedRating,
        comment: comment.trim(),
      });
      setSavedBanner(true);
      await fetchReviewsPage(0, false);
    } catch (err: any) {
      setFormError(err?.message || 'تعذر حفظ التقييم');
    } finally {
      setSubmitting(false);
    }
  };

  const sellerStats = [
    { label: 'متوسط التقييم', value: `${averageRating.toFixed(1)} / 5`, accent: true },
    { label: 'عدد التقييمات', value: String(reviewCount) },
    { label: 'الإعلانات النشطة', value: String(sellerListings.length) },
    ...(typeof seller.yearsExperience === 'number' && seller.yearsExperience > 0
      ? [{ label: 'الخبرة الميدانية', value: `${seller.yearsExperience} سنوات` }]
      : []),
  ];

  return (
    <section className="bg-[var(--color-canvas)] transition-colors overflow-x-hidden">
      <DynamicHeroBanner
        pageKey="seller"
        variant="oasis-horizon"
        breadcrumbs={[
          ...(onGoHome ? [{ label: 'الرئيسية', onClick: onGoHome }] : []),
          { label: 'دليل المربين', onClick: onBack },
          { label: seller.displayName },
        ]}
        contextLabel={sellerRegion ? `${sellerRegion.name} · ${seller.city}` : seller.city}
        eyebrow={isSellerVerified(seller) ? 'مراح ومربي موثق في المنصة' : 'ملف المربي والمراح'}
        title={seller.displayName}
        subHeadline={
          seller.bio ||
          'مراح متخصص في عرض وتربية الحلال وفق المواصفات المنظمة في منصة سوق الغنم.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onBack}
              className="min-h-[44px] sm:min-h-[40px] inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-white/40 bg-[#0B2A1E]/80 hover:bg-[#123D2D]/90 hover:border-[#F4C569] text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              <ArrowRight size={15} aria-hidden="true" />
              <span>العودة</span>
            </button>
            {isSellerVerified(seller) && (
              <VerifiedSellerBadge variant="badge" tone="on-dark" label="مربي موثق في المنصة" />
            )}
            {seller.specialty && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white px-2.5 py-1 rounded-lg bg-[#0B2A1E]/75 border border-white/25 backdrop-blur-xs">
                <Award size={13} className="text-[#F4C569]" aria-hidden="true" />
                <span>تخصص: {seller.specialty}</span>
              </span>
            )}
          </div>
        }
        stats={sellerStats}
        interactiveDock={
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3 text-white font-semibold">
              <div className="inline-flex items-center gap-2">
                <StarDisplay value={averageRating} size={14} />
                <span className="tabular-nums">
                  {averageRating.toFixed(1)} من 5 ({reviewCount} تقييم)
                </span>
              </div>
              <span className="text-white/25 hidden sm:inline" aria-hidden="true">|</span>
              <span className="text-[11px] font-semibold text-[#F4C569] tabular-nums">
                {sellerListings.length} عروض متاحة من هذا المراح
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(() => {
                if (!currentUser) {
                  return (
                    <>
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-100/80">
                        <Lock size={12} className="text-[#F4C569]" aria-hidden="true" />
                        <span>بيانات التواصل متاحة للأعضاء المسجلين</span>
                      </span>
                      {onRequireAuth && (
                        <button
                          type="button"
                          onClick={() => onRequireAuth('login')}
                          className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[#F4C569] hover:bg-[#ffd582] text-[#0B231A] text-xs font-extrabold cursor-pointer transition-colors"
                        >
                          تسجيل الدخول لعرض الرقم
                        </button>
                      )}
                    </>
                  );
                }
                if (isOwnProfile) {
                  return (
                    <span className="inline-flex items-center gap-2 font-display text-sm font-bold text-[#F4C569] tabular-nums">
                      <Phone size={14} aria-hidden="true" />
                      <span dir="ltr">{currentUser.phone || 'غير متوفر'}</span>
                    </span>
                  );
                }
                if (seller.contactAvailable === false) {
                  return (
                    <span className="text-[11px] text-emerald-100/75">
                      بيانات الاتصال المباشر غير متاحة لهذا الحساب حالياً.
                    </span>
                  );
                }
                if (!revealedContact) {
                  return (
                    <div className="flex flex-wrap items-center gap-2">
                      {sellerListings.length === 0 ? (
                        <span className="text-[11px] text-emerald-100/75">
                          لا توجد إعلانات منشورة حالياً لإظهار رقم التواصل المباشر.
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={revealingContact}
                          onClick={handleRevealSellerContact}
                          className="min-h-[36px] px-4 py-1.5 rounded-lg bg-[#F4C569] hover:bg-[#ffd582] text-[#0B231A] text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 transition-colors"
                        >
                          <Phone size={13} aria-hidden="true" />
                          <span>{revealingContact ? 'جاري التحقق...' : 'إظهار بيانات التواصل'}</span>
                        </button>
                      )}
                      {contactError && (
                        <span role="alert" className="text-[11px] text-red-200 font-semibold">
                          {contactError}
                        </span>
                      )}
                    </div>
                  );
                }
                const contact = buildSellerContactLinks({
                  isSignedIn: true,
                  isOwner: false,
                  seller: revealedContact,
                  listingTitle: seller.displayName,
                });
                return (
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-display text-sm font-bold text-[#F4C569] tabular-nums inline-flex items-center gap-1.5">
                      <Phone size={14} aria-hidden="true" />
                      <span dir="ltr">{contact.phoneDisplay || 'غير متوفر'}</span>
                    </span>
                    {contact.telHref && (
                      <a
                        href={contact.telHref}
                        aria-label={`اتصال هاتفي بالمربي ${seller.displayName}`}
                        className="min-h-[36px] px-3.5 rounded-lg bg-[#F4C569] hover:bg-[#ffd582] text-[#0B231A] text-xs font-extrabold inline-flex items-center gap-1.5"
                      >
                        <Phone size={13} aria-hidden="true" />
                        <span>اتصال</span>
                      </a>
                    )}
                    {contact.whatsappHref && (
                      <a
                        href={contact.whatsappHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`مراسلة المربي ${seller.displayName} عبر واتساب`}
                        className="min-h-[36px] px-3.5 rounded-lg border border-white/25 bg-white/[0.08] hover:border-[#F4C569] text-white text-xs font-bold inline-flex items-center gap-1.5"
                      >
                        <MessageCircle size={13} aria-hidden="true" />
                        <span>واتساب</span>
                      </a>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        }
      />

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-10">
        {/* Seller Listings */}
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--color-border)]">
          <h2 className="font-display text-xl font-bold text-[var(--color-ink)]">
            إعلانات {seller.displayName} ({sellerListings.length})
          </h2>
        </div>

        {sellerListings.length === 0 ? (
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-8 text-center space-y-2.5">
            <div className="w-11 h-11 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)] text-[var(--color-muted)] flex items-center justify-center mx-auto">
              <PackageOpen size={20} aria-hidden="true" />
            </div>
            <p className="font-display text-base font-bold text-[var(--color-ink)]">
              لا توجد إعلانات نشطة حالياً لهذا المربي
            </p>
            <p className="text-xs text-[var(--color-muted)]">
              ستظهر عروض الحلال الخاصة بهذا المراح فور نشر إعلانات جديدة.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sellerListings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                category={categories.find((c) => c.id === listing.categoryId)}
                subCategory={categories.find((c) => c.id === listing.subCategoryId)}
                breed={breeds.find((b) => b.id === listing.breedId)}
                region={regions.find((r) => r.id === listing.regionId)}
                seller={seller}
                isFavorite={favoriteIds.includes(listing.id)}
                isLiked={likedListingIds.includes(listing.id)}
                onSelect={onSelectListing}
                onToggleFavorite={onToggleFavorite}
                onToggleLike={onToggleLike}
              />
            ))}
          </div>
        )}
      </div>

      {/* Star Rating & Buyer Reviews Section */}
      <div className="pt-8 border-t border-[var(--color-border)] grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Summary + Rating Submission Form */}
        <div className="lg:col-span-5 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6 space-y-6">
          <div>
            <h2 className="font-display text-xl font-bold text-[var(--color-ink)]">
              تقييم المربي وآراء المشترين
            </h2>
            <p className="mt-1 text-xs text-[var(--color-muted)] leading-relaxed">
              شارك تجربتك في التعامل وجودة الحلال لمساعدة المشترين الآخرين.
            </p>
          </div>

          {/* Aggregate Rating Score & Bars */}
          <div className="flex items-center gap-5 pb-5 border-b border-[var(--color-border)]">
            <div className="text-center shrink-0 px-3 py-2 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)]">
              <p className="font-display text-3xl sm:text-4xl font-extrabold text-[var(--color-green-ink)] tabular-nums">
                {averageRating.toFixed(1)}
              </p>
              <div className="mt-1 flex justify-center">
                <StarDisplay value={averageRating} size={14} />
              </div>
              <p className="text-[11px] text-[var(--color-muted)] tabular-nums mt-1">
                من أصل {reviewCount} {reviewCount === 1 ? 'تقييم' : 'تقييمات'}
              </p>
            </div>

            <div className="flex-1 space-y-1.5">
              {breakdown.map((row) => (
                <div key={row.stars} className="flex items-center gap-2 text-xs">
                  <span className="w-8 text-[var(--color-muted)] tabular-nums shrink-0">
                    {row.stars} ★
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-[var(--color-cream)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--color-gold)] rounded-full transition-all"
                      style={{ width: `${row.pct}%` }}
                    />
                  </div>
                  <span className="w-6 text-left text-[var(--color-muted)] tabular-nums shrink-0">
                    {row.count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Interactive Star Rating Form */}
          {isOwnProfile ? (
            <p className="text-xs text-[var(--color-muted)] bg-[var(--color-cream)] border border-[var(--color-border)] rounded-xl p-3.5 leading-relaxed">
              أنت تشاهد ملف مراحك الشخصي، ولا يمكنك تقييم نفسك.
            </p>
          ) : !currentUser ? (
            <div className="bg-[var(--color-cream)] border border-[var(--color-border)] rounded-xl p-4 space-y-2.5">
              <p className="text-xs text-[var(--color-muted)] leading-relaxed">
                سجّل الدخول لإضافة تقييم لهذا المربي ومشاركة تجربتك.
              </p>
              {onRequireAuth && (
                <button
                  type="button"
                  onClick={() => onRequireAuth('login')}
                  className="min-h-[44px] sm:min-h-[38px] px-4 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold cursor-pointer"
                >
                  تسجيل الدخول للتقييم
                </button>
              )}
            </div>
          ) : reviewsPage && reviewsPage.reviewEligibilityReason === 'no_interaction' ? (
            <p className="text-xs text-[var(--color-muted)] bg-[var(--color-cream)] border border-[var(--color-border)] rounded-xl p-3.5 leading-relaxed">
              يتاح تقييم المربي بعد بدء محادثة أو تقديم عرض سعر على أحد إعلاناته لضمان مصداقية التقييمات.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <p
                  role="alert"
                  className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
                >
                  {formError}
                </p>
              )}
              {savedBanner && (
                <p
                  role="status"
                  className="p-3 rounded-xl bg-[var(--color-cream)] border border-[var(--color-green-ink)]/30 text-xs font-medium text-[var(--color-green-ink)]"
                >
                  تم حفظ تقييمك وتحديث متوسط تقييم المربي بنجاح.
                </p>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-[var(--color-ink)]">
                    تقييمك ({currentUser.name})
                  </span>
                  <span className="text-xs font-semibold text-[var(--color-gold)] tabular-nums">
                    {activeStarValue} / 5 — {RATING_LABELS[activeStarValue]}
                  </span>
                </div>

                <div
                  className="flex items-center gap-1"
                  role="radiogroup"
                  aria-label="اختيار التقييم بالنجوم"
                  onMouseLeave={() => setHoverRating(0)}
                >
                  {[1, 2, 3, 4, 5].map((star) => {
                    const active = star <= activeStarValue;
                    return (
                      <button
                        key={star}
                        type="button"
                        role="radio"
                        aria-checked={selectedRating === star}
                        aria-label={`${star} ${star === 1 ? 'نجمة' : 'نجوم'} - ${RATING_LABELS[star]}`}
                        onMouseEnter={() => setHoverRating(star)}
                        onClick={() => setSelectedRating(star)}
                        className="min-w-[44px] min-h-[44px] rounded-xl hover:bg-[var(--color-cream)] transition-colors flex items-center justify-center cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--color-gold)]"
                      >
                        <Star
                          size={22}
                          className={
                            active
                              ? 'text-[var(--color-gold)] fill-[var(--color-gold)] transition-transform scale-105'
                              : 'text-[var(--color-border)] transition-colors'
                          }
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label
                  htmlFor="seller-review-comment"
                  className="block text-xs font-medium text-[var(--color-muted)] mb-1.5"
                >
                  تعليقك على التجربة (اختياري)
                </label>
                <textarea
                  id="seller-review-comment"
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="اكتب رأيك حول جودة الحلال، دقة المواصفات، وسرعة التواصل..."
                  className="w-full p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/40 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/75 focus:outline-none focus:border-[var(--color-green-ink)]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[44px] h-11 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60"
              >
                {submitting
                  ? 'جاري الحفظ...'
                  : existingMyReview
                  ? 'تحديث تقييمك'
                  : 'إرسال التقييم'}
              </button>
            </form>
          )}
        </div>

        {/* Buyer Reviews Feed */}
        <div className="lg:col-span-7 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6">
          <h3 className="font-display text-lg font-bold text-[var(--color-ink)] pb-4 border-b border-[var(--color-border)]">
            سجل تقييمات المشترين ({reviewCount})
          </h3>

          {reviewsError && (
            <div
              role="alert"
              className="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-2"
            >
              <span>{reviewsError}</span>
              <button
                type="button"
                onClick={() => fetchReviewsPage(0, false)}
                className="font-semibold underline cursor-pointer shrink-0"
              >
                إعادة المحاولة
              </button>
            </div>
          )}

          {loadingReviews && loadedReviews.length === 0 ? (
            <p className="py-10 text-sm text-[var(--color-muted)] text-center">
              جاري تحميل تقييمات المشترين...
            </p>
          ) : loadedReviews.length === 0 ? (
            <p className="py-10 text-sm text-[var(--color-muted)] text-center">
              لا توجد تقييمات مسجلة لهذا المربي حتى الآن. كن أول من يشارك تجربته.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="divide-y divide-[var(--color-border)]">
                {loadedReviews.map((review) => {
                  const reviewerInitial = (review.reviewerName || 'م').trim().slice(0, 1);
                  return (
                    <article key={review.id} className="py-4 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            aria-hidden="true"
                            className="w-8 h-8 rounded-full bg-[var(--color-cream)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-green-ink)] flex items-center justify-center shrink-0"
                          >
                            {reviewerInitial}
                          </span>
                          <div className="min-w-0">
                            <p className="font-display text-sm font-bold text-[var(--color-ink)] truncate">
                              {review.reviewerName}
                            </p>
                            <p className="text-[11px] text-[var(--color-muted)]">
                              {formatRelativeArabicTime(review.updatedAt || review.createdAt)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-cream)] border border-[var(--color-border)]">
                          <StarDisplay value={review.rating} size={13} />
                          <span className="text-xs font-bold text-[var(--color-ink)] tabular-nums">
                            {review.rating.toFixed(1)}
                          </span>
                        </div>
                      </div>

                      {review.comment && (
                        <p className="text-sm text-[var(--color-ink)]/90 leading-relaxed pr-10">
                          {review.comment}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>

              {reviewsPage?.hasMore && reviewsPage.nextOffset !== null && (
                <div className="pt-2 flex justify-center">
                  <button
                    type="button"
                    disabled={loadingMoreReviews}
                    onClick={() => fetchReviewsPage(reviewsPage.nextOffset!, true)}
                    className="min-h-[44px] px-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)] hover:bg-[var(--color-cream-hover)] text-xs font-semibold text-[var(--color-green-ink)] cursor-pointer disabled:opacity-60"
                  >
                    {loadingMoreReviews ? 'جاري التحميل...' : 'عرض المزيد من التقييمات'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </div>
    </section>
  );
}

