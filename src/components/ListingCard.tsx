import {
  CheckCircle2,
  Clock,
  Heart,
  MapPin,
  Play,
  ShieldCheck,
  Sparkles,
  Star,
  ThumbsUp,
  User as UserIcon,
  XCircle,
} from 'lucide-react';
import type { Breed, Category, Listing, Region, SellerProfile } from '../types/marketplace';
import { formatPriceSar, formatRelativeArabicTime } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { trBreedName, trCategoryName, trCityName, trRegionName } from '../lib/bilingual';
import {
  resolveListingStatusBadge,
  type ListingStatusBadgeKind,
} from '../lib/marketplace-helpers';
import { SafeImage } from './SafeImage';
import { isSellerVerified, VerifiedSellerBadge } from './VerifiedSellerBadge';

interface ListingCardProps {
  listing: Listing;
  category?: Category;
  breed?: Breed;
  subCategory?: Category;
  region?: Region;
  seller?: SellerProfile;
  isFavorite: boolean;
  isLiked?: boolean;
  onSelect: (listing: Listing) => void;
  onSelectSeller?: (sellerId: string) => void;
  onToggleFavorite: (listingId: string) => void;
  onToggleLike?: (listingId: string) => void;
}

const STATUS_BADGE_STYLES: Record<ListingStatusBadgeKind, string> = {
  sold: 'bg-[#14261D]/92 text-white border-white/20',
  featured: 'bg-[#C79A43] text-[#10241B] border-[#F4C569]/75',
  new: 'bg-[#103C2C]/92 text-white border-[#F4C569]/40',
  pending: 'bg-[#F4C569] text-[#14261D] border-[#C79A43]/60',
  rejected: 'bg-red-800/95 text-white border-red-200/30',
  draft: 'bg-slate-800/90 text-white border-white/15',
  expired: 'bg-slate-800/90 text-white border-white/15',
};

function StatusBadgeIcon({ kind }: { kind: ListingStatusBadgeKind }) {
  switch (kind) {
    case 'sold':
      return <CheckCircle2 size={12} aria-hidden="true" />;
    case 'featured':
      return <Star size={12} className="fill-current" aria-hidden="true" />;
    case 'new':
      return <Sparkles size={12} className="text-[#F4C569]" aria-hidden="true" />;
    case 'rejected':
      return <XCircle size={12} aria-hidden="true" />;
    default:
      return <Clock size={12} aria-hidden="true" />;
  }
}

export function ListingCard({
  listing,
  category,
  breed,
  subCategory,
  region,
  seller,
  isFavorite,
  isLiked = false,
  onSelect,
  onSelectSeller,
  onToggleFavorite,
  onToggleLike,
}: ListingCardProps) {
  const { lang, isEn } = useI18n();
  const coverImage = listing.images[0]?.url || breed?.imageUrl;
  const likesCount = listing.likesCount ?? 0;
  const canLike = listing.status === 'Published' && Boolean(onToggleLike);
  const totalHerdValue =
    listing.quantity > 1 ? listing.priceAmount * listing.quantity : null;
  const isSold = listing.status === 'Sold';

  const allowsOffers =
    listing.allowPriceOffers !== undefined ? listing.allowPriceOffers : listing.isNegotiable;

  const negotiationLabel = allowsOffers
    ? isEn
      ? 'Accepts Offers'
      : 'يقبل عروض السعر'
    : listing.isNegotiable
    ? isEn
      ? 'Negotiable'
      : 'قابل للتفاوض'
    : isEn
    ? 'Fixed Price'
    : 'سعر نهائي';

  const locationText = [trRegionName(region?.name, lang), trCityName(listing.city, lang)]
    .filter(Boolean)
    .join(' — ');

  const statusBadge = resolveListingStatusBadge(listing, { lang });

  return (
    <article
      className={`group h-full bg-[var(--color-surface)] rounded-xl border overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-gold)]/70 hover:shadow-[0_12px_28px_-14px_rgba(16,60,44,0.18)] flex flex-col min-w-0 ${
        statusBadge?.kind === 'featured'
          ? 'border-[var(--color-gold)]/55'
          : 'border-[var(--color-border)]'
      } ${isSold ? 'opacity-90' : ''}`}
    >
      {/* Uniform 4:3 Image Container */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--color-cream)] border-b border-[var(--color-border)]/70">
        <button
          type="button"
          onClick={() => onSelect(listing)}
          className="w-full h-full block text-start cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-gold)]"
          aria-label={
            isEn ? `View details for ${listing.title}` : `عرض تفاصيل ${listing.title}`
          }
        >
          <SafeImage
            src={coverImage}
            alt={listing.title}
            width={800}
            height={597}
            loading="lazy"
            decoding="async"
            className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03] ${
              isSold ? 'grayscale-[30%]' : ''
            }`}
          />
        </button>

        {/* Top-Start Visual Status Badge (single clear state indicator) */}
        {statusBadge && (
          <div className="pointer-events-none absolute top-2.5 start-2.5">
            <span
              data-status-badge={statusBadge.kind}
              className={`px-2.5 py-1 rounded-md border backdrop-blur-xs text-[11px] font-extrabold tracking-tight inline-flex items-center gap-1.5 shadow-sm whitespace-nowrap ${STATUS_BADGE_STYLES[statusBadge.kind]}`}
            >
              <StatusBadgeIcon kind={statusBadge.kind} />
              <span>{statusBadge.label}</span>
            </span>
          </div>
        )}

        {/* Private Favorite Toggle (44x44 touch target, separate from public Likes) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(listing.id);
          }}
          aria-label={
            isFavorite
              ? isEn
                ? 'Remove from favorites'
                : 'إزالة من المفضلة'
              : isEn
              ? 'Add to favorites'
              : 'إضافة إلى المفضلة'
          }
          title={
            isFavorite
              ? isEn
                ? 'Remove from favorites'
                : 'إزالة من المفضلة'
              : isEn
              ? 'Save to favorites'
              : 'حفظ في المفضلة'
          }
          aria-pressed={isFavorite}
          className={`absolute top-2.5 end-2.5 w-11 h-11 rounded-lg flex items-center justify-center transition-colors cursor-pointer shadow-xs focus-visible:outline-2 focus-visible:outline-[var(--color-gold)] ${
            isFavorite
              ? 'bg-[var(--color-green)] text-[var(--color-gold)]'
              : 'bg-[var(--color-surface)]/92 text-[var(--color-ink)] hover:bg-[var(--color-surface)]'
          }`}
        >
          <Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>

        {/* Bottom Media Metadata: Video Indicator (start) & Photo Count (end) */}
        {listing.video?.url && (
          <span className="pointer-events-none absolute bottom-2.5 start-2.5 px-2 py-0.5 rounded bg-black/65 backdrop-blur-xs text-white text-[10px] font-semibold inline-flex items-center gap-1">
            <Play
              size={10}
              className="fill-[var(--color-gold)] text-[var(--color-gold)]"
              aria-hidden="true"
            />
            <span>{isEn ? 'Video' : 'فيديو'}</span>
          </span>
        )}
        {listing.images.length > 1 && (
          <span className="pointer-events-none absolute bottom-2.5 end-2.5 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-semibold tabular-nums">
            {isEn ? `${listing.images.length} photos` : `${listing.images.length} صور`}
          </span>
        )}
      </div>

      {/* Card Body */}
      <div className="p-3.5 sm:p-4 flex flex-col flex-1 justify-between gap-2.5 sm:gap-3.5 min-w-0">
        <div className="min-w-0 space-y-1.5 sm:space-y-2">
          {/* Unboxed Category / Breed / Specs Line */}
          <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-[11.5px] sm:text-xs text-[var(--color-muted)]">
            {category && (
              <>
                <span className="font-medium text-[var(--color-ink)]">
                  {trCategoryName(category.name, lang)}
                </span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span className="font-bold text-[var(--color-green-ink)]">
              {breed ? trBreedName(breed.name, lang) : isEn ? 'Sheep' : 'أغنام'}
            </span>
            {subCategory && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[var(--color-ink)] font-medium">
                  {trCategoryName(subCategory.name, lang)}
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {isEn ? `${listing.ageMonths} mo` : `${listing.ageMonths} أشهر`}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {isEn ? `${listing.weightKg} kg` : `${listing.weightKg} كجم`}
            </span>
            {listing.vaccinated && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-0.5 text-[var(--color-green-ink)] font-semibold">
                  <ShieldCheck size={12} aria-hidden="true" />
                  <span>{isEn ? 'Vaccinated' : 'محصّن'}</span>
                </span>
              </>
            )}
          </div>

          {/* Listing Title */}
          <h3 className="font-display text-[15px] sm:text-base font-bold text-[var(--color-ink)] leading-snug line-clamp-2 min-h-[2.6rem] sm:min-h-[2.75rem]">
            <button
              type="button"
              onClick={() => onSelect(listing)}
              className="text-start hover:text-[var(--color-green-ink)] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--color-gold)] rounded-sm"
            >
              {listing.title}
            </button>
          </h3>

          {/* Seller Row */}
          {seller && (
            <div className="flex items-center flex-wrap gap-1.5 text-xs min-w-0">
              <UserIcon
                size={13}
                className="text-[var(--color-muted)] shrink-0"
                aria-hidden="true"
              />
              {onSelectSeller ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectSeller(seller.userId);
                  }}
                  title={seller.displayName}
                  className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-green-ink)] hover:underline transition-colors cursor-pointer truncate min-w-0 max-w-full"
                >
                  {seller.displayName}
                </button>
              ) : (
                <span title={seller.displayName} className="font-semibold text-[var(--color-ink)] truncate min-w-0 max-w-full">
                  {seller.displayName}
                </span>
              )}
              {isSellerVerified(seller) && <VerifiedSellerBadge variant="inline" />}
            </div>
          )}
        </div>

        {/* Pricing, Herd Value, Location & Engagement Footer */}
        <div className="pt-2.5 sm:pt-3 border-t border-[var(--color-border)]/80 space-y-2 sm:space-y-2.5 min-w-0">
          {/* Unit Price vs Herd Value & Location */}
          <div className="flex items-start justify-between gap-2.5 min-w-0">
            <div className="min-w-0">
              <p className="font-display text-lg sm:text-[1.18rem] font-extrabold text-[var(--color-green-ink)] tabular-nums leading-tight">
                {formatPriceSar(listing.priceAmount, lang)}
                <span className="text-[11px] font-semibold text-[var(--color-muted)] ms-1">
                  {isEn ? '/ head' : '/ للرأس'}
                </span>
              </p>
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                {negotiationLabel}
                <span aria-hidden="true"> · </span>
                <span className="font-semibold text-[var(--color-ink)] tabular-nums">
                  {isEn ? `${listing.quantity} head` : `${listing.quantity} رأس`}
                </span>
              </p>
            </div>

            <div className="text-end text-xs text-[var(--color-muted)] shrink-0 max-w-[46%]">
              <p className="font-medium text-[var(--color-ink)] inline-flex items-center gap-1 justify-end max-w-full">
                <MapPin size={12} className="text-[var(--color-muted)] shrink-0" aria-hidden="true" />
                <span className="truncate">{locationText || trCityName(listing.city, lang)}</span>
              </p>
              <p className="text-[11px] mt-0.5 tabular-nums">
                {formatRelativeArabicTime(listing.publishedAt, undefined, lang)}
              </p>
            </div>
          </div>

          {/* Explicit Total Herd Value Row for multi-head listings */}
          {totalHerdValue !== null && (
            <div className="px-2.5 py-1.5 rounded-lg bg-[var(--color-cream)]/80 border border-[var(--color-border)]/70 flex items-center justify-between gap-2 text-[11px]">
              <span className="text-[var(--color-muted)] font-medium">
                {isEn
                  ? `Total Herd Value (${listing.quantity} head)`
                  : `إجمالي قيمة القطيع (${listing.quantity} رأس)`}
              </span>
              <span className="font-display font-bold text-[var(--color-ink)] tabular-nums shrink-0">
                {formatPriceSar(totalHerdValue, lang)}
              </span>
            </div>
          )}

          {/* Public Likes (separate from Favorites) & Details CTA */}
          <div className="pt-2 border-t border-[var(--color-border)]/60 flex items-center justify-between gap-2">
            {canLike ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLike?.(listing.id);
                }}
                aria-pressed={isLiked}
                aria-label={
                  isLiked
                    ? isEn
                      ? `Unlike listing (${likesCount})`
                      : `إلغاء الإعجاب بالإعلان (${likesCount})`
                    : isEn
                    ? `Like listing (${likesCount})`
                    : `الإعجاب بالإعلان (${likesCount})`
                }
                className={`min-h-[44px] px-3.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-all duration-150 cursor-pointer active:scale-95 focus-visible:outline-2 focus-visible:outline-[var(--color-gold)] ${
                  isLiked
                    ? 'bg-[var(--color-cream)] border-[var(--color-green-ink)] text-[var(--color-green-ink)]'
                    : 'bg-transparent border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-cream)]/60'
                }`}
              >
                <ThumbsUp
                  size={14}
                  aria-hidden="true"
                  className={isLiked ? 'fill-[var(--color-gold)] text-[var(--color-green-ink)]' : ''}
                />
                <span>{isLiked ? (isEn ? 'Liked' : 'أعجبني') : isEn ? 'Like' : 'إعجاب'}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums font-bold">{likesCount}</span>
              </button>
            ) : (
              <span className="min-h-[44px] inline-flex items-center gap-1.5 text-xs text-[var(--color-muted)] tabular-nums">
                <ThumbsUp size={13} aria-hidden="true" />
                <span>{isEn ? `${likesCount} likes` : `${likesCount} إعجاب`}</span>
              </span>
            )}

            <button
              type="button"
              onClick={() => onSelect(listing)}
              className="min-h-[44px] px-3.5 rounded-lg text-xs font-semibold text-[var(--color-green-ink)] hover:bg-[var(--color-cream)] transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[var(--color-gold)]"
            >
              {isEn ? 'Details & Q&A' : 'التفاصيل والأسئلة'}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
