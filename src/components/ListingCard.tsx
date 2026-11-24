import {
  ArrowLeft,
  ArrowRight,
  Award,
  Check,
  CheckCircle2,
  Clock,
  Heart,
  MapPin,
  Phone,
  Play,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  ThumbsUp,
  User as UserIcon,
  XCircle,
  Zap,
} from 'lucide-react';
import type { Breed, Category, Listing, Region, SellerProfile } from '../types/marketplace';
import { formatPriceSar, formatRelativeArabicTime } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { trBreedName, trCategoryName, trCityName, trRegionName } from '../lib/bilingual';
import {
  buildSellerContactLinks,
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
  currentUserId?: string | null;
  variant?: 'default' | 'showcase';
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
  currentUserId = null,
  variant = 'default',
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

  if (variant === 'showcase') {
    const isFeaturedShowcase = listing.isFeatured && !isSold;
    const isNewShowcase = statusBadge?.kind === 'new';
    const categoryLabel = category
      ? trCategoryName(category.name, lang)
      : isEn
      ? 'Livestock'
      : 'مواشي';
    const breedLabel = breed
      ? trBreedName(breed.name, lang)
      : isEn
      ? 'Saudi Sheep'
      : 'أغنام سعودية';
    const regionLabel = trRegionName(region?.name, lang);
    const cityLabel = trCityName(listing.city, lang);
    const compactLocation = [regionLabel, cityLabel].filter(Boolean).join(' / ');
    const sellerName = seller?.displayName || (isEn ? 'Seller' : 'مربٍّ');
    const sellerInitials = sellerName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase();
    const sellerVerified = seller ? isSellerVerified(seller) : false;
    const contactLinks = buildSellerContactLinks({
      isSignedIn: Boolean(currentUserId),
      isOwner: Boolean(currentUserId && currentUserId === listing.sellerId),
      seller,
      listingTitle: listing.title,
      lang,
    });
    const DirArrow = isEn ? ArrowRight : ArrowLeft;

    return (
      <>
        {/* Mobile Compact Horizontal Card */}
        <div className="sm:hidden">
          <article
            className={`relative overflow-hidden rounded-xl border bg-[var(--color-surface)] transition-colors ${
              isFeaturedShowcase
                ? 'border-[var(--color-gold)] shadow-[0_6px_18px_-10px_rgba(199,154,67,0.28)]'
                : 'border-[var(--color-border)]'
            } ${isSold ? 'opacity-90' : ''}`}
          >
            {isFeaturedShowcase && (
              <div className="flex h-6 items-center gap-1.5 bg-[var(--color-green)] px-2.5 text-[10px] font-extrabold text-white">
                <Zap size={13} className="text-[#F4C569] shrink-0" aria-hidden="true" />
                <span>{isEn ? 'Featured Listing' : 'إعلان مميز'}</span>
              </div>
            )}

            <div className="flex min-h-[120px]">
              <div className="relative w-[34%] max-w-[120px] shrink-0 bg-[var(--color-cream)]/70 overflow-hidden">
                <button
                  type="button"
                  onClick={() => onSelect(listing)}
                  aria-label={
                    isEn ? `View details for ${listing.title}` : `عرض تفاصيل ${listing.title}`
                  }
                  className="w-full h-full block cursor-pointer"
                >
                  <SafeImage
                    src={coverImage}
                    alt={listing.title}
                    width={320}
                    height={240}
                    loading="lazy"
                    decoding="async"
                    className={`w-full h-full object-cover ${isSold ? 'grayscale-[30%]' : ''}`}
                  />
                </button>
                <span className="pointer-events-none absolute bottom-1.5 start-1.5 max-w-[calc(100%-0.75rem)] truncate rounded bg-[var(--color-green)]/92 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  {isSold ? (isEn ? 'Sold' : 'مباع') : categoryLabel}
                </span>
              </div>

              <div className="flex min-w-0 flex-1 flex-col px-2.5 py-2">
                <div className="flex min-w-0 items-start justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSelect(listing)}
                    className="line-clamp-2 min-w-0 text-start text-[12px] font-bold leading-[1.35] text-[var(--color-ink)] hover:text-[var(--color-green-ink)] cursor-pointer"
                  >
                    {listing.title}
                  </button>

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
                    aria-pressed={isFavorite}
                    className={`relative z-20 -mt-0.5 -me-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                      isFavorite
                        ? 'bg-red-50 dark:bg-red-950/50 text-red-500'
                        : 'bg-[var(--color-cream)]/80 text-[var(--color-muted)] hover:text-red-500'
                    }`}
                  >
                    <Heart size={15} fill={isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
                  </button>
                </div>

                <span className="mt-0.5 truncate text-[10px] text-[var(--color-muted)] tabular-nums">
                  {breedLabel}
                  {listing.weightKg > 0
                    ? ` · ${listing.weightKg} ${isEn ? 'kg' : 'كجم'}`
                    : ` · ${listing.ageMonths} ${isEn ? 'mo' : 'أشهر'}`}
                </span>

                <div className="mt-auto min-w-0 space-y-0.5 pt-1.5">
                  <span className="flex min-w-0 items-center gap-1 text-[10px] text-[var(--color-muted)]">
                    <MapPin size={11} className="shrink-0" aria-hidden="true" />
                    <span className="truncate">{compactLocation || locationText}</span>
                  </span>
                  <strong className="block whitespace-nowrap text-[14px] font-black leading-5 text-[var(--color-ink)] tabular-nums">
                    {formatPriceSar(listing.priceAmount, lang)}
                  </strong>
                </div>
              </div>
            </div>
          </article>
        </div>

        {/* Desktop & Tablet Celebim Showcase Card */}
        <div
          className={
            isFeaturedShowcase
              ? 'hidden h-full flex-col overflow-hidden rounded-[14px] border-2 border-[var(--color-gold)] bg-[var(--color-surface)] shadow-[0_8px_24px_rgba(199,154,67,0.18)] sm:flex'
              : 'hidden h-full flex-col sm:flex'
          }
        >
          {isFeaturedShowcase && (
            <div className="flex min-h-9 items-center gap-2 bg-[var(--color-green)] px-3 text-[11px] font-extrabold text-white">
              <Zap size={15} className="shrink-0 text-[#F4C569]" aria-hidden="true" />
              <span>{isEn ? 'Featured Listing' : 'إعلان مميز'}</span>
            </div>
          )}

          <article
            className={`relative flex flex-col flex-1 bg-[var(--color-surface)] overflow-hidden transition-all duration-200 group min-w-0 ${
              isFeaturedShowcase
                ? 'rounded-none border-0'
                : 'rounded-[14px] border-[1.5px] border-[var(--color-border)] hover:border-[var(--color-gold)] hover:shadow-[0_6px_24px_rgba(199,154,67,0.16)] hover:-translate-y-[2px]'
            } ${isSold ? 'opacity-90' : ''}`}
          >
            {/* 16:10 Media Container */}
            <div className="relative aspect-[16/10] bg-[var(--color-cream)]/65 overflow-hidden shrink-0">
              <button
                type="button"
                onClick={() => onSelect(listing)}
                aria-label={
                  isEn ? `View details for ${listing.title}` : `عرض تفاصيل ${listing.title}`
                }
                className="w-full h-full block text-start cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-gold)]"
              >
                <SafeImage
                  src={coverImage}
                  alt={listing.title}
                  width={800}
                  height={500}
                  loading="lazy"
                  decoding="async"
                  className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03] ${
                    isSold ? 'grayscale-[30%]' : ''
                  }`}
                />
              </button>

              {/* Top-Start Category / Sold Badge */}
              <span
                data-status-badge={statusBadge?.kind || 'category'}
                className={`pointer-events-none absolute top-[9px] start-[9px] text-[10px] font-bold px-2 py-[3px] rounded-md shadow-2xs whitespace-nowrap ${
                  isSold
                    ? 'bg-[#14261D]/92 text-white'
                    : 'bg-[var(--color-green)] text-white'
                }`}
              >
                {isSold ? (isEn ? 'Sold' : 'مباع') : categoryLabel}
              </span>

              {/* Top-End Circular Favorite Button */}
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
                className="absolute end-[9px] top-[9px] z-20 p-2 rounded-full bg-white/95 dark:bg-[#121D18]/92 shadow-sm transition-transform hover:scale-105 cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--color-gold)]"
              >
                <Heart
                  size={18}
                  className={`transition-all duration-200 ${
                    isFavorite
                      ? 'fill-red-500 text-red-500 scale-110'
                      : 'text-[#6B6B6B] dark:text-[#9CB0A5] hover:text-red-500'
                  }`}
                  aria-hidden="true"
                />
              </button>

              {/* Bottom-Start Featured Pill & Video Indicator */}
              {isFeaturedShowcase && (
                <span className="pointer-events-none absolute bottom-[9px] start-[9px] text-[10px] font-extrabold px-2 py-[4px] rounded-md bg-[var(--color-gold)] text-[#10241B] inline-flex items-center gap-1 shadow-2xs">
                  <Zap size={10} className="fill-current" aria-hidden="true" />
                  <span>{isEn ? 'Featured' : 'مميز'}</span>
                </span>
              )}

              {listing.video?.url && (
                <span
                  className={`pointer-events-none absolute bottom-[9px] ${
                    isFeaturedShowcase ? 'end-[9px]' : 'start-[9px]'
                  } px-2 py-0.5 rounded bg-black/65 backdrop-blur-xs text-white text-[10px] font-semibold inline-flex items-center gap-1`}
                >
                  <Play
                    size={10}
                    className="fill-[var(--color-gold)] text-[var(--color-gold)]"
                    aria-hidden="true"
                  />
                  <span>{isEn ? 'Video' : 'فيديو'}</span>
                </span>
              )}
            </div>

            {/* Signature 3px Horizontal Accent Divider */}
            <div className="h-[3px] w-full shrink-0 bg-[var(--color-gold)]" aria-hidden="true" />

            {/* Card Body */}
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex flex-col flex-1 p-3.5 min-w-0">
                {/* Location & New Indicator */}
                <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)] mb-1">
                  <div className="flex items-center gap-1 truncate min-w-0">
                    <MapPin size={11} className="shrink-0" aria-hidden="true" />
                    <span className="truncate">{compactLocation || locationText}</span>
                  </div>
                  {isNewShowcase && (
                    <span className="shrink-0 ms-2 font-bold text-[var(--color-gold-hover)] dark:text-[var(--color-gold)]">
                      {isEn ? 'New' : 'جديد'}
                    </span>
                  )}
                </div>

                {/* Price + Weight */}
                <div className="flex items-baseline flex-wrap gap-1.5 mb-2">
                  <span className="text-[20px] font-black text-[var(--color-ink)] tabular-nums leading-tight">
                    {formatPriceSar(listing.priceAmount, lang)}
                  </span>
                  {listing.weightKg > 0 && (
                    <span className="text-[11px] text-[var(--color-muted)] font-semibold tabular-nums">
                      ({listing.weightKg} {isEn ? 'kg' : 'كجم'})
                    </span>
                  )}
                  {listing.quantity > 1 && (
                    <span className="text-[10.5px] text-[var(--color-muted)] font-semibold tabular-nums">
                      · {listing.quantity} {isEn ? 'head' : 'رأس'}
                    </span>
                  )}
                </div>

                {/* Colored Listing Title + Green Veterinary Check */}
                <div className="flex items-start gap-1.5 mb-2.5 min-h-[2.35rem]">
                  <button
                    type="button"
                    onClick={() => onSelect(listing)}
                    className="text-start text-[13px] font-extrabold text-[var(--color-green-ink)] hover:underline leading-[1.35] line-clamp-2 cursor-pointer flex-1 min-w-0 focus-visible:outline-2 focus-visible:outline-[var(--color-gold)] rounded-sm"
                  >
                    {listing.title}
                  </button>
                  {listing.vaccinated && (
                    <span
                      title={isEn ? 'Veterinary vaccinated' : 'محصّن بيطرياً'}
                      className="shrink-0 mt-0.5"
                    >
                      <ShieldCheck size={16} className="text-[#16A34A]" aria-hidden="true" />
                    </span>
                  )}
                </div>

                {/* Spec Chips: Type & Breed */}
                <div className="mb-2 flex min-w-0 flex-wrap gap-1.5">
                  <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-warm)] dark:bg-[var(--color-cream)]/45 px-2 py-1 text-[10px] leading-4 transition-colors hover:border-[var(--color-gold)] hover:bg-[var(--color-surface)]">
                    <Tag
                      className="h-3 w-3 shrink-0 text-[var(--color-gold-hover)] dark:text-[var(--color-gold)]"
                      aria-hidden="true"
                    />
                    <span className="text-[var(--color-muted)]">
                      {isEn ? 'Type:' : 'النوع:'}
                    </span>
                    <strong className="truncate font-bold text-[var(--color-ink)]">
                      {categoryLabel}
                    </strong>
                  </span>

                  <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-warm)] dark:bg-[var(--color-cream)]/45 px-2 py-1 text-[10px] leading-4 transition-colors hover:border-[var(--color-gold)] hover:bg-[var(--color-surface)]">
                    <Award
                      className="h-3 w-3 shrink-0 text-[var(--color-gold-hover)] dark:text-[var(--color-gold)]"
                      aria-hidden="true"
                    />
                    <span className="text-[var(--color-muted)]">
                      {isEn ? 'Breed:' : 'السلالة:'}
                    </span>
                    <strong className="max-w-[92px] truncate font-bold text-[var(--color-ink)]">
                      {subCategory ? trCategoryName(subCategory.name, lang) : breedLabel}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Seller Row, Quick Contact & Bottom Inspect CTA */}
              <div className="flex flex-wrap items-center justify-between gap-2 mt-auto px-3.5 py-2 border-t border-[var(--color-border)]/65">
                <div className="flex items-center justify-between gap-2 w-full min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <div
                      aria-hidden="true"
                      className="w-6 h-6 rounded-full bg-[var(--color-gold-soft)] flex items-center justify-center text-[9px] font-extrabold text-[var(--color-green-ink)] shrink-0"
                    >
                      {sellerInitials || 'U'}
                    </div>
                    <span className="min-w-0 max-w-[125px]">
                      {onSelectSeller && seller ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectSeller(seller.userId);
                          }}
                          title={sellerName}
                          className="block truncate text-[11px] font-bold text-[var(--color-ink)] hover:text-[var(--color-green-ink)] hover:underline cursor-pointer max-w-full"
                        >
                          {sellerName}
                        </button>
                      ) : (
                        <span
                          title={sellerName}
                          className="block truncate text-[11px] font-bold text-[var(--color-ink)]"
                        >
                          {sellerName}
                        </span>
                      )}
                      {seller?.city && (
                        <span className="block truncate text-[9px] font-semibold text-[var(--color-muted)]">
                          {trCityName(seller.city, lang)}
                        </span>
                      )}
                    </span>

                    {sellerVerified && (
                      <span
                        title={isEn ? 'Verified Breeder' : 'مربٍّ موثق'}
                        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#DCFCE7] text-[#15803D]"
                      >
                        <Check className="h-3 w-3" aria-hidden="true" />
                        <span className="sr-only">
                          {isEn ? 'Verified Breeder' : 'مربٍّ موثق'}
                        </span>
                      </span>
                    )}
                  </div>

                  {/* Quick Contact Icons (only when signed-in viewer & seller phone/WhatsApp exposed) */}
                  {(contactLinks.whatsappHref || contactLinks.telHref) && (
                    <div className="relative z-20 flex items-center gap-1.5 shrink-0">
                      {contactLinks.whatsappHref && (
                        <a
                          href={contactLinks.whatsappHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          aria-label={isEn ? 'Message seller on WhatsApp' : 'مراسلة البائع عبر واتساب'}
                          className="w-[26px] h-[26px] rounded-md bg-[#E8F5EB] flex items-center justify-center hover:bg-[#c3e6cb] transition-colors"
                        >
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            className="w-[14px] h-[14px] fill-[#1B7A3A]"
                          >
                            <path d="M16.6 14c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.3-.6.8-.8 1-.1.2-.3.2-.6.1-.3-.1-1.1-.4-2.1-1.2-.8-.7-1.3-1.5-1.5-1.8-.2-.3 0-.4.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.2-.6-1.5-.8-2-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.1 3c.2.2 2 3.1 4.9 4.3.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2.1-1.5.3-.8.3-1.5.2-1.7-.1-.1-.3-.2-.6-.3zM12 20.3c-1.4 0-2.8-.4-4-1.1l-.3-.2-3 1 1-2.9-.2-.3c-.8-1.2-1.2-2.7-1.2-4.2 0-4.3 3.5-7.8 7.8-7.8s7.8 3.5 7.8 7.8-3.5 7.8-7.8 7.8zM12 2C6.5 2 2 6.5 2 12c0 1.7.4 3.4 1.3 4.9L2 22l5.2-1.3C8.6 21.6 10.3 22 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2z" />
                          </svg>
                        </a>
                      )}
                      {contactLinks.telHref && (
                        <a
                          href={contactLinks.telHref}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={isEn ? 'Call seller' : 'الاتصال بالبائع'}
                          className="w-[26px] h-[26px] rounded-md bg-[var(--color-cream)] flex items-center justify-center hover:bg-[var(--color-cream-hover)] transition-colors text-[var(--color-muted)]"
                        >
                          <Phone size={12} aria-hidden="true" />
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {/* Full-Width Bottom View Listing Link */}
                <button
                  type="button"
                  onClick={() => onSelect(listing)}
                  className="w-full pt-2 border-t border-[var(--color-border)]/65 mt-0.5 flex items-center gap-1.5 text-[12px] font-bold text-[var(--color-ink)] transition-colors group-hover:text-[var(--color-gold-hover)] dark:group-hover:text-[var(--color-gold)] cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--color-gold)] rounded-sm"
                >
                  <span>{isEn ? 'View Listing' : 'معاينة الإعلان'}</span>
                  <DirArrow size={13} aria-hidden="true" />
                </button>
              </div>
            </div>
          </article>
        </div>
      </>
    );
  }

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
