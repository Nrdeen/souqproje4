import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  Calculator,
  Check,
  ClipboardCheck,
  Clock,
  Crown,
  FileText,
  Flag,
  Gift,
  HelpCircle,
  Mail,
  MapPin,
  Phone,
  Scale,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Truck,
  User as UserIcon,
  Users,
  Wheat,
} from 'lucide-react';
import type { Article, Breed, Listing, Region, SellerProfile } from '../types/marketplace';
import { useI18n } from '../lib/i18n';
import {
  trBreedName,
  trBreedOrigin,
  trCityName,
  trRegionName,
  trSellerSpecialty,
  trUnitString,
} from '../lib/bilingual';
import { getPricingPlans } from '../lib/marketplace-tools';
import type { PageView } from '../lib/router';
import {
  HomeCategoriesSection as HomeCategoriesSectionImpl,
  type HomeCategoriesSectionProps,
} from './HomeCategoriesSection';
import { SafeImage } from './SafeImage';
import { VerifiedSellerBadge } from './VerifiedSellerBadge';

export type { HomeCategoriesSectionProps };

export function HomeCategoriesSection(props: HomeCategoriesSectionProps) {
  return <HomeCategoriesSectionImpl {...props} />;
}

interface HomeStatsStripProps {
  publishedCount: number;
  verifiedBreedersCount: number;
  breedsCount: number;
  activeRegionsCount: number;
  onNavigate: (page: PageView) => void;
}

export function HomeStatsStrip({
  publishedCount,
  verifiedBreedersCount,
  breedsCount,
  activeRegionsCount,
  onNavigate,
}: HomeStatsStripProps) {
  const { isEn } = useI18n();
  const items: Array<{
    label: string;
    value: string;
    note: string;
    page: PageView;
    icon: typeof TrendingUp;
  }> = [
    {
      label: isEn ? 'Active Listings' : 'إعلانات حية متاحة',
      value: publishedCount.toLocaleString('en-US'),
      note: isEn ? 'Reviewed daily' : 'مراجعة مستمرة للصور والمواصفات',
      page: 'listings',
      icon: TrendingUp,
    },
    {
      label: isEn ? 'Verified Breeders' : 'مربون موثقون',
      value: verifiedBreedersCount.toLocaleString('en-US'),
      note: isEn ? 'Screened ranches' : 'تحقق من المراح ورقم الجوال',
      page: 'breeders',
      icon: ShieldCheck,
    },
    {
      label: isEn ? 'Pure Breeds' : 'سلالات سعودية موثقة',
      value: breedsCount.toLocaleString('en-US'),
      note: isEn ? 'Indicative SAR prices' : 'بمتوسط أسعار ومواصفات واضحة',
      page: 'breeds',
      icon: Award,
    },
    {
      label: isEn ? 'Active Regions' : 'مناطق المملكة المغطاة',
      value: activeRegionsCount.toLocaleString('en-US'),
      note: isEn ? 'Direct regional filter' : 'تواصل مباشر بدون وسطاء',
      page: 'listings',
      icon: MapPin,
    },
  ];

  return (
    <section
      aria-label={isEn ? 'Live marketplace indicators' : 'مؤشرات السوق المباشرة'}
      className="bg-[var(--color-canvas)] pb-6 sm:pb-8 border-b border-[var(--color-border)]/70"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => onNavigate(item.page)}
                className="group text-start rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-gold)]/70 p-3.5 sm:p-4 flex items-center gap-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm cursor-pointer"
              >
                <span className="w-10 h-10 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)] text-[var(--color-green-ink)] group-hover:bg-[var(--color-green)] group-hover:text-[#F4C569] flex items-center justify-center shrink-0 transition-colors">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-lg sm:text-xl font-extrabold text-[var(--color-ink)] tabular-nums leading-none">
                    {item.value}
                  </span>
                  <span className="mt-1 block text-xs font-bold text-[var(--color-green-ink)] truncate">
                    {item.label}
                  </span>
                  <span className="hidden sm:block mt-0.5 text-[11px] text-[var(--color-muted)] truncate">
                    {item.note}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

interface HomeBreedsSectionProps {
  breeds: Breed[];
  onFilterByBreed: (breedId: string) => void;
  onOpenBreedsDirectory: () => void;
}

export function HomeBreedsSection({
  breeds,
  onFilterByBreed,
  onOpenBreedsDirectory,
}: HomeBreedsSectionProps) {
  const { lang, isEn } = useI18n();
  const DirArrow = isEn ? ArrowRight : ArrowLeft;

  return (
    <section
      aria-labelledby="home-breeds-heading"
      className="bg-[var(--color-cream)]/60 border-y border-[var(--color-border)] py-12 lg:py-14 transition-colors"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7">
          <div>
            <h2
              id="home-breeds-heading"
              className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--color-ink)]"
            >
              {isEn
                ? 'Breeds Guide & Indicative Market Prices'
                : 'دليل السلالات والأسعار الاسترشادية'}
            </h2>
            <p className="mt-1.5 text-sm text-[var(--color-muted)]">
              {isEn
                ? 'Explore the characteristics of top Saudi livestock breeds and their indicative SAR price ranges'
                : 'تعرّف على خصائص أشهر السلالات السعودية ومتوسطات أسعارها الاسترشادية في السوق'}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenBreedsDirectory}
            className="text-sm font-semibold text-[var(--color-green-ink)] hover:underline whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <span>
              {isEn ? 'Explore Full Guide & Price Index' : 'استعراض الدليل والأسعار كاملة'}
            </span>
            <DirArrow size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar -mx-4 px-4 pb-2 gap-3 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 lg:grid-cols-5 sm:gap-4 sm:overflow-visible">
          {breeds.slice(0, 5).map((breed) => {
            const bName = trBreedName(breed.name, lang);
            return (
              <article
                key={breed.id}
                className="w-[232px] shrink-0 snap-start sm:w-auto group bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-gold)]/70 hover:shadow-md"
              >
                <div className="aspect-[4/3] bg-[var(--color-cream)] overflow-hidden">
                  <SafeImage
                    src={breed.imageUrl}
                    alt={bName}
                    width={800}
                    height={597}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                  <div>
                    <p className="text-[11px] text-[var(--color-muted)]">
                      {trBreedOrigin(breed.origin, lang)} · {trUnitString(breed.avgWeightKg, lang)}
                    </p>
                    <h3 className="font-display text-base font-extrabold text-[var(--color-ink)] mt-0.5">
                      {bName}
                    </h3>
                    <p className="mt-1.5 font-display text-sm font-extrabold text-[var(--color-green-ink)] tabular-nums">
                      {trUnitString(breed.priceRangeSar, lang)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onFilterByBreed(breed.id)}
                    className="min-h-[44px] sm:min-h-[36px] pt-2.5 border-t border-[var(--color-border)]/70 text-xs font-semibold text-[var(--color-green-ink)] hover:underline text-start inline-flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span>
                      {isEn ? `Browse ${bName} Listings` : `تصفح عروض ${breed.name}`}
                    </span>
                    <DirArrow size={13} aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

interface HomeBreedersSectionProps {
  verifiedSellers: SellerProfile[];
  otherSellers: SellerProfile[];
  onSelectSeller: (sellerId: string) => void;
  onOpenBreedersDirectory: () => void;
  onOpenPricing?: () => void;
  onOpenBreedsGuide?: () => void;
  showOtherSellers?: boolean;
}

export function HomeBreedersSection({
  verifiedSellers,
  otherSellers,
  onSelectSeller,
  onOpenBreedersDirectory,
  onOpenPricing,
  onOpenBreedsGuide,
  showOtherSellers = true,
}: HomeBreedersSectionProps) {
  const { lang, isEn } = useI18n();
  const DirArrow = isEn ? ArrowRight : ArrowLeft;
  const totalBreedersCount = showOtherSellers
    ? verifiedSellers.length + otherSellers.length
    : verifiedSellers.length;

  return (
    <section
      aria-labelledby="home-breeders-heading"
      className="bg-[var(--color-cream)]/45 border-y border-[var(--color-border)] py-12 lg:py-16 transition-colors"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Modern Editorial Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 pb-6 border-b border-[var(--color-border)]">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-[var(--color-green-ink)] mb-2">
              <Award size={15} className="text-[var(--color-gold)]" aria-hidden="true" />
              <span>{isEn ? 'Verified Ranches & Breeders' : 'مراحات ومربّون معتمدون'}</span>
            </div>
            <h2
              id="home-breeders-heading"
              className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--color-ink)] tracking-tight"
            >
              {isEn ? 'Trusted Breeders Across Saudi Arabia' : 'نخبة المربين الموثقين في المملكة'}
            </h2>
            <p className="mt-1.5 text-sm text-[var(--color-muted)] leading-relaxed">
              {isEn
                ? 'Explore verified ranches, authentic buyer ratings, and livestock specializations directly.'
                : 'مراحات وحسابات موثقة بتقييمات حقيقية وخبرة ميدانية في تربية السلالات السعودية الأصيلة.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onOpenBreedersDirectory}
              className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-gold)] hover:bg-[var(--color-surface-warm)] text-[var(--color-ink)] text-xs sm:text-sm font-bold whitespace-nowrap transition-colors cursor-pointer shadow-2xs"
            >
              <span>
                {isEn
                  ? `All Breeders (${totalBreedersCount})`
                  : `دليل المربين (${totalBreedersCount})`}
              </span>
              <DirArrow size={15} aria-hidden="true" />
            </button>

            {onOpenBreedsGuide ? (
              <button
                type="button"
                onClick={onOpenBreedsGuide}
                className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs sm:text-sm font-bold whitespace-nowrap transition-colors cursor-pointer shadow-xs"
              >
                <TrendingUp size={15} className="text-[var(--color-gold)]" aria-hidden="true" />
                <span>{isEn ? 'Breeds & Price Guide' : 'دليل السلالات والأسعار'}</span>
              </button>
            ) : (
              onOpenPricing && (
                <button
                  type="button"
                  onClick={onOpenPricing}
                  className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs sm:text-sm font-bold whitespace-nowrap transition-colors cursor-pointer shadow-xs"
                >
                  <span>{isEn ? 'Breeder Plans & Pricing' : 'باقات المربين والأسعار'}</span>
                </button>
              )
            )}
          </div>
        </div>

        {/* Verified Breeder Cards */}
        {verifiedSellers.length === 0 ? (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-8 text-center">
            <p className="text-sm font-semibold text-[var(--color-ink)]">
              {isEn
                ? 'No verified breeders are currently displayed.'
                : 'لا يوجد مربون موثقون معروضون حالياً.'}
            </p>
            <button
              type="button"
              onClick={onOpenBreedersDirectory}
              className="mt-3 text-xs font-bold text-[var(--color-green-ink)] hover:underline cursor-pointer"
            >
              {isEn ? 'Browse Breeders Directory' : 'استعراض دليل المربين'}
            </button>
          </div>
        ) : (
          <div className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar -mx-4 px-4 pb-2 gap-4 md:mx-0 md:px-0 md:pb-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-6 md:overflow-visible">
            {verifiedSellers.slice(0, 6).map((seller) => {
              const starPct = Math.min(100, Math.max(0, (seller.rating / 5) * 100));
              const monogram = seller.displayName.trim().charAt(0) || 'م';
              return (
                <article
                  key={seller.userId}
                  className="w-[84vw] max-w-[340px] shrink-0 snap-start md:w-auto md:max-w-none group bg-[var(--color-surface)] text-[var(--color-ink)] rounded-2xl p-5 sm:p-6 shadow-[0_6px_22px_-16px_rgba(16,60,44,0.18)] border border-[var(--color-border)] hover:border-[var(--color-gold)]/75 flex flex-col justify-between gap-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_18px_36px_-18px_rgba(16,60,44,0.22)]"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div
                          aria-hidden="true"
                          className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#103C2C] to-[#1A5841] text-[#F4C569] font-display text-lg font-extrabold flex items-center justify-center shrink-0 ring-1 ring-[var(--color-gold)]/35"
                        >
                          {monogram}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h3 className="font-display text-base sm:text-lg font-extrabold text-[var(--color-ink)] leading-snug truncate">
                              {seller.displayName}
                            </h3>
                            <VerifiedSellerBadge variant="badge" />
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="font-bold text-[var(--color-gold-hover)] dark:text-[var(--color-gold)] tabular-nums">
                              {seller.rating.toFixed(1)}
                            </span>
                            <span
                              className="relative inline-block text-xs leading-none tracking-wider text-[#ddd6c4] dark:text-[#2a3c34] select-none"
                              aria-hidden="true"
                            >
                              ★★★★★
                              <span
                                className="absolute inset-0 overflow-hidden text-[var(--color-gold)]"
                                style={{ width: `${starPct}%` }}
                              >
                                ★★★★★
                              </span>
                            </span>
                            <span className="text-[var(--color-muted)] font-semibold">
                              · {trCityName(seller.city, lang)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3.5 border-t border-[var(--color-border)]/70 space-y-1.5">
                      <p className="text-xs font-bold text-[var(--color-green-ink)]">
                        {isEn ? 'Specialty: ' : 'التخصص: '}
                        <span className="text-[var(--color-ink)] font-semibold">
                          {trSellerSpecialty(seller.specialty, lang)}
                        </span>
                      </p>
                      <p className="text-xs sm:text-[13px] text-[var(--color-muted)] leading-relaxed line-clamp-2">
                        {seller.bio}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3.5 border-t border-[var(--color-border)]/80 flex items-center justify-between gap-3 text-xs font-semibold">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 text-[var(--color-ink)] tabular-nums">
                        <FileText size={14} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                        <span>
                          {isEn ? `${seller.totalSales} sales` : `${seller.totalSales} بيعة`}
                        </span>
                      </span>

                      <span className="w-px h-3.5 bg-[var(--color-border)]" aria-hidden="true" />

                      <span className="inline-flex items-center gap-1.5 text-[var(--color-ink)] tabular-nums">
                        <Users size={14} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                        <span>
                          {isEn
                            ? `${seller.yearsExperience} yrs${
                                seller.ratingCount !== undefined ? ` (${seller.ratingCount})` : ''
                              }`
                            : `خبرة ${seller.yearsExperience} سنة${
                                seller.ratingCount !== undefined ? ` (${seller.ratingCount} تقييم)` : ''
                              }`}
                        </span>
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectSeller(seller.userId)}
                      className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg bg-[var(--color-cream)] group-hover:bg-[var(--color-green)] group-hover:text-white text-[var(--color-green-ink)] text-xs font-bold transition-colors shrink-0 cursor-pointer"
                    >
                      <span>{isEn ? 'Profile' : 'المراح'}</span>
                      <DirArrow size={14} aria-hidden="true" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Other (Unverified / Pending) Sellers — hidden on streamlined homepage when showOtherSellers is false */}
        {showOtherSellers && otherSellers.length > 0 && (
          <div className="pt-7 border-t border-[var(--color-border)]">
            <div className="mb-4">
              <h3 className="font-display text-lg font-bold text-[var(--color-ink)]">
                {isEn ? 'Other Breeders & Sellers in the Market' : 'مربون وبائعون آخرون في السوق'}
              </h3>
              <p className="mt-0.5 text-xs sm:text-sm text-[var(--color-muted)]">
                {isEn
                  ? 'Registered seller accounts you can browse while their official verification is not yet completed'
                  : 'حسابات مسجلة يمكنك تصفح مراحاتها وإعلاناتها، ولم تُستكمل إجراءات توثيقها المعتمدة بعد'}
              </p>
            </div>

            <div className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar -mx-4 px-4 pb-2 gap-3.5 md:mx-0 md:px-0 md:pb-0 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible">
              {otherSellers.map((seller) => (
                <article
                  key={seller.userId}
                  className="w-[82vw] max-w-[320px] shrink-0 snap-start md:w-auto md:max-w-none bg-[var(--color-surface-warm)] text-[var(--color-ink)] rounded-xl border border-[var(--color-border)] p-4 sm:p-5 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
                      <span>{trCityName(seller.city, lang)}</span>
                      <span className="text-[11px] font-medium text-[var(--color-muted)]">
                        {seller.verificationStatus === 'Pending'
                          ? isEn
                            ? 'Verification Pending'
                            : 'قيد مراجعة التوثيق'
                          : isEn
                          ? 'Not verified yet'
                          : 'حساب غير موثق بعد'}
                      </span>
                    </div>
                    <h4 className="mt-2 font-display text-base sm:text-lg font-bold text-[var(--color-ink)]">
                      {seller.displayName}
                    </h4>
                    <p className="mt-1.5 text-xs sm:text-sm text-[var(--color-muted)] line-clamp-2">
                      {seller.bio}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-[var(--color-border)] flex items-center justify-between text-xs gap-2">
                    <span className="text-[var(--color-muted)] tabular-nums inline-flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 font-bold text-[var(--color-ink)]">
                        <Star
                          size={13}
                          className="text-[var(--color-gold)] fill-[var(--color-gold)]"
                          aria-hidden="true"
                        />
                        <span>{seller.rating.toFixed(1)}</span>
                        {seller.ratingCount !== undefined && (
                          <span className="font-normal text-[var(--color-muted)]">
                            ({seller.ratingCount})
                          </span>
                        )}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {isEn
                          ? `${seller.yearsExperience} yrs · ${seller.totalSales} sales`
                          : `خبرة ${seller.yearsExperience} سنة · ${seller.totalSales} بيعة`}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectSeller(seller.userId)}
                      className="min-h-[40px] sm:min-h-[34px] px-2 font-semibold text-[var(--color-green-ink)] hover:underline shrink-0 cursor-pointer"
                    >
                      {isEn ? 'Profile' : 'ملف المربي'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

interface HomeTrustSectionProps {
  onOpenBreedersDirectory: () => void;
  onAddListing: () => void;
}

export function HomeTrustSection({
  onOpenBreedersDirectory,
  onAddListing,
}: HomeTrustSectionProps) {
  const { isEn } = useI18n();
  const [roleTrack, setRoleTrack] = useState<'buyer' | 'seller'>('buyer');

  const steps =
    roleTrack === 'buyer'
      ? [
          {
            num: '01',
            title: isEn ? 'Filter by Breed, Region & Budget' : 'اختر السلالة والمنطقة والميزانية',
            body: isEn
              ? 'Compare listings by age in months, weight, vaccination status, and seasonal SAR index.'
              : 'قارن الإعلانات حسب العمر بالأشهر، الوزن التقريبي، حالة التحصين، ومؤشر الأسعار الموسمي.',
          },
          {
            num: '02',
            title: isEn ? 'Inspect Photos & Ask Directly' : 'تواصل مباشر مع المربي والمعاينة',
            body: isEn
              ? 'Message verified breeders in-app, inspect herd videos, or ask public spec questions.'
              : 'راسل المربي مباشرة عبر الرسائل الفورية أو التعليقات وشاهد الصور والفيديو قبل الاتفاق.',
          },
          {
            num: '03',
            title: isEn ? 'Submit Price Offer or Request Transport' : 'أرسل عرض سعر أو اطلب النقل',
            body: isEn
              ? 'Lock your agreed SAR price and coordinate safe delivery across 13 Saudi regions.'
              : 'قدّم عرض سعرك المنظّم، ونسّق الاستلام أو اطلب ناقلة مواشي مجهزة إلى مدينتك.',
          },
        ]
      : [
          {
            num: '01',
            title: isEn ? 'Add Structured Livestock Specs' : 'أضف إعلانك بمواصفات واضحة',
            body: isEn
              ? 'Enter breed, head count, age, weight, vaccination, and clear real photos in minutes.'
              : 'سجّل السلالة والعدد والعمر والوزن وحالة التحصين مع صور حقيقية واضحة خلال دقائق.',
          },
          {
            num: '02',
            title: isEn ? 'Moderation & Verification Badge' : 'المراجعة الإدارية وتوثيق المراح',
            body: isEn
              ? 'Listings undergo quality review; verified ranches earn the trusted green badge.'
              : 'يمر الإعلان بمراجعة لضمان المصداقية، وتمنح شارة «مربي موثق» للمراحات المعتمدة.',
          },
          {
            num: '03',
            title: isEn ? 'Receive Offers & Settle 1% Upon Sale' : 'استقبل السومات وسدّد 1% بعد البيع',
            body: isEn
              ? 'Review serious buyer offers in your dashboard with zero upfront posting fees.'
              : 'أدر السومات والمحادثات من لوحتك؛ النشر مجاني والعمولة 1% تُستحق بعد إتمام البيع فقط.',
          },
        ];

  const pillars = [
    {
      icon: ClipboardCheck,
      title: isEn
        ? 'Listing Moderation & Complete Specs'
        : 'مراجعة الإعلانات واكتمال المواصفات',
      body: isEn
        ? 'Every new listing undergoes moderation to verify photo clarity and accurate core details: breed, age in months, approximate weight, vaccination status, and SAR price.'
        : 'يمر كل إعلان جديد بمراجعة إدارية للتأكد من وضوح الصور ومطابقة البيانات الأساسية: السلالة، العمر بالأشهر، الوزن التقريبي، حالة التحصين، والسعر بالريال السعودي.',
    },
    {
      icon: ShieldCheck,
      title: isEn
        ? 'Verified Breeder Account Screening'
        : 'توثيق حسابات المربين المعتمدين',
      body: isEn
        ? 'The "Verified Breeder" badge is granted only after platform administrators verify ranch details and mobile number, separating verified ranches from unverified accounts.'
        : 'يُمنح شعار «مربي موثق» فقط بعد تحقق إدارة المنصة من طلب التوثيق وبيانات المراح ورقم الجوال، مع فصل واضح بين الحسابات الموثقة والحسابات قيد المراجعة.',
    },
    {
      icon: Flag,
      title: isEn
        ? 'Direct Communication & Reporting System'
        : 'تواصل مباشر ونظام إبلاغ فعّال',
      body: isEn
        ? 'Chat directly, submit price offers, or ask public questions with the breeder—backed by instant moderation reporting on any suspicious or non-compliant listing.'
        : 'أجرِ محادثاتك وقدّم عروض السعر أو استفسر في التعليقات مباشرة مع المربي، مع إمكانية الإبلاغ الفوري عن أي إعلان أو تعليق مخالف لمراجعته.',
    },
  ];

  return (
    <section
      aria-labelledby="home-trust-heading"
      className="bg-[var(--color-surface)] border-y border-[var(--color-border)] py-11 lg:py-14 transition-colors"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-bold text-[var(--color-green-ink)] mb-1">
              {isEn ? 'How It Works & Safety Standards' : 'كيف يعمل السوق ومعايير الموثوقية'}
            </p>
            <h2
              id="home-trust-heading"
              className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--color-ink)]"
            >
              {isEn
                ? 'Clear Steps & Trust Standards on SouqAlGhanam'
                : 'رحلة واضحة ومعايير أمان موثوقة في سوق الغنم'}
            </h2>
            <p className="mt-1.5 text-sm text-[var(--color-muted)] leading-relaxed">
              {isEn
                ? 'Structured procedures connecting Saudi livestock breeders and buyers directly with full spec transparency'
                : 'إجراءات منظمة تربط المربين والمشترين داخل المملكة مباشرة مع شفافية كاملة في المواصفات والأسعار'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div
              role="tablist"
              aria-label={isEn ? 'Marketplace journey mode' : 'اختيار رحلة المشتري أو البائع'}
              className="inline-flex items-center p-1 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-border)]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={roleTrack === 'buyer'}
                onClick={() => setRoleTrack('buyer')}
                className={`min-h-[36px] px-3.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                  roleTrack === 'buyer'
                    ? 'bg-[var(--color-green)] text-white'
                    : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                }`}
              >
                {isEn ? 'For Buyers' : 'رحلة المشتري'}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={roleTrack === 'seller'}
                onClick={() => setRoleTrack('seller')}
                className={`min-h-[36px] px-3.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                  roleTrack === 'seller'
                    ? 'bg-[var(--color-green)] text-white'
                    : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                }`}
              >
                {isEn ? 'For Breeders' : 'رحلة المربي والبائع'}
              </button>
            </div>
            <button
              type="button"
              onClick={onAddListing}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
            >
              {isEn ? 'Post Your Listing' : 'انشر إعلانك الآن'}
            </button>
          </div>
        </div>

        {/* 3 Interactive Buyer/Seller Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {steps.map((step) => (
            <div
              key={step.num}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-cream)]/45 p-5 space-y-2"
            >
              <span className="font-display text-xl font-extrabold text-[var(--color-gold)] tabular-nums block">
                {step.num}
              </span>
              <h3 className="font-display text-base font-extrabold text-[var(--color-ink)]">
                {step.title}
              </h3>
              <p className="text-xs sm:text-sm text-[var(--color-muted)] leading-relaxed">
                {step.body}
              </p>
            </div>
          ))}
        </div>

        {/* 3 Core Trust Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
          {pillars.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.title}
                className="bg-[var(--color-canvas)] rounded-xl border border-[var(--color-border)] p-5 space-y-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-green-ink)] shrink-0">
                    <Icon size={18} aria-hidden="true" />
                  </div>
                  <h3 className="font-display text-base font-bold text-[var(--color-ink)]">
                    {pillar.title}
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-[var(--color-muted)] leading-relaxed">
                  {pillar.body}
                </p>
              </div>
            );
          })}
        </div>

        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={onOpenBreedersDirectory}
            className="min-h-[42px] px-5 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] hover:border-[var(--color-gold)] text-xs font-bold text-[var(--color-green-ink)] transition-colors cursor-pointer"
          >
            {isEn ? 'Explore Verified Breeders & FAQ' : 'استعراض المربين الموثقين والأسئلة الشائعة'}
          </button>
        </div>
      </div>
    </section>
  );
}

interface HomeRegionsSectionProps {
  regions: Region[];
  publishedListings: Listing[];
  onFilterByRegion: (regionId: string) => void;
  onBrowseAll: () => void;
}

export function HomeRegionsSection({
  regions,
  publishedListings,
  onFilterByRegion,
  onBrowseAll,
}: HomeRegionsSectionProps) {
  const { lang, isEn } = useI18n();
  const DirArrow = isEn ? ArrowRight : ArrowLeft;

  const regionCards = useMemo(() => {
    return regions
      .map((reg) => {
        const matching = publishedListings.filter((l) => l.regionId === reg.id);
        const cities = Array.from(
          new Set(matching.map((l) => l.city.trim()).filter(Boolean))
        ).slice(0, 3);
        return {
          reg,
          count: matching.length,
          cities,
        };
      })
      .sort((a, b) => b.count - a.count || a.reg.name.localeCompare(b.reg.name, 'ar'))
      .slice(0, 8);
  }, [regions, publishedListings]);

  if (regionCards.length === 0) return null;

  return (
    <section
      aria-labelledby="home-regions-heading"
      className="bg-[var(--color-surface)] border-b border-[var(--color-border)] py-11 lg:py-14 transition-colors"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--color-green-ink)] mb-1">
              <MapPin size={14} className="text-[var(--color-gold)]" aria-hidden="true" />
              <span>{isEn ? 'Regional Coverage Across the Kingdom' : 'التوزيع الجغرافي في مناطق المملكة'}</span>
            </p>
            <h2
              id="home-regions-heading"
              className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--color-ink)]"
            >
              {isEn ? 'Browse Livestock by Saudi Region' : 'استكشف المواشي حسب المنطقة'}
            </h2>
            <p className="mt-1.5 text-sm text-[var(--color-muted)]">
              {isEn
                ? 'Jump straight to active livestock listings nearest to your city or ranch route'
                : 'انتقل مباشرة إلى العروض النشطة في منطقتك وتعرّف على المدن والمراحات المتوفرة'}
            </p>
          </div>
          <button
            type="button"
            onClick={onBrowseAll}
            className="text-xs sm:text-sm font-bold text-[var(--color-green-ink)] hover:underline inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <span>{isEn ? 'Browse All Regions' : 'عرض كافة المناطق والإعلانات'}</span>
            <DirArrow size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-4">
          {regionCards.map(({ reg, count, cities }) => (
            <button
              key={reg.id}
              type="button"
              onClick={() => onFilterByRegion(reg.id)}
              className="group text-start rounded-2xl border border-[var(--color-border)] bg-[var(--color-canvas)] hover:bg-[var(--color-cream)]/70 hover:border-[var(--color-gold)] p-4 flex flex-col justify-between gap-3 transition-all duration-150 hover:-translate-y-0.5 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-display text-base font-extrabold text-[var(--color-ink)] group-hover:text-[var(--color-green-ink)] truncate">
                    {trRegionName(reg.name, lang)}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-[var(--color-muted)] truncate">
                    {cities.length > 0
                      ? cities.map((c) => trCityName(c, lang)).join(' · ')
                      : isEn
                      ? 'All cities in region'
                      : 'كافة مدن ومحافظات المنطقة'}
                  </p>
                </div>
                <span className="w-8 h-8 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-green-ink)] group-hover:bg-[var(--color-green)] group-hover:text-[#F4C569] flex items-center justify-center shrink-0 transition-colors">
                  <MapPin size={15} aria-hidden="true" />
                </span>
              </div>

              <div className="pt-2.5 border-t border-[var(--color-border)]/70 flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-[var(--color-green-ink)] tabular-nums">
                  {count > 0
                    ? isEn
                      ? `${count} active`
                      : `${count} عرض نشط`
                    : isEn
                    ? 'Browse region'
                    : 'تصفح المنطقة'}
                </span>
                <DirArrow
                  size={13}
                  className="text-[var(--color-muted)] group-hover:text-[var(--color-green-ink)] transition-colors"
                  aria-hidden="true"
                />
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

interface HomeServicesSectionProps {
  onNavigate: (page: PageView) => void;
}

export function HomeServicesSection({ onNavigate }: HomeServicesSectionProps) {
  const { isEn } = useI18n();
  const DirArrow = isEn ? ArrowRight : ArrowLeft;
  const services = [
    {
      icon: Truck,
      kicker: isEn ? 'Logistics & Estimate' : 'لوجستيات وتقدير التكلفة',
      title: isEn ? 'Transport Cost Calculator' : 'حاسبة تكلفة نقل المواشي',
      desc: isEn
        ? 'Estimate carrier fees between Saudi regions by distance, head count, truck class, and vet care.'
        : 'احسب التكلفة التقديرية لشحن المواشي بين مدن المملكة حسب المسافة وعدد الرؤوس ونوع الناقلة.',
      cta: isEn ? 'Calculate Transport' : 'احسب تكلفة النقل',
      target: 'transport' as PageView,
    },
    {
      icon: Wheat,
      kicker: isEn ? 'Herd Nutrition' : 'اقتصاديات القطيع',
      title: isEn ? 'Feed & Fattening Planner' : 'مخطط الأعلاف والتسمين',
      desc: isEn
        ? 'Calculate daily & monthly barley sacks, alfalfa bales, and per-head monthly feed budget in SAR.'
        : 'قدّر استهلاك القطيع الشهري من أكياس الشعير وبالات البرسيم والتكلفة الشهرية لكل رأس.',
      cta: isEn ? 'Plan Feed Budget' : 'احسب تكلفة الأعلاف',
      target: 'feed' as PageView,
    },
    {
      icon: Calculator,
      kicker: isEn ? 'Instant Calculator' : 'أداة حساب فورية',
      title: isEn ? 'Smart Feast Calculator' : 'حاسبة الولائم الذكية',
      desc: isEn
        ? 'Estimate ideal head count, clean meat weight, rice kg, and SAR budget based on guest count.'
        : 'قدّر عدد الرؤوس المناسب وكمية اللحم والأرز والتكلفة التقديرية حسب عدد ضيوفك.',
      cta: isEn ? 'Open Calculator' : 'افتح الحاسبة',
      target: 'feast' as PageView,
    },
    {
      icon: Scale,
      kicker: isEn ? 'Carcass Yield' : 'التصافي والأوزان',
      title: isEn ? 'Weights & Yield Tool' : 'حاسبة الأوزان والتصافي',
      desc: isEn
        ? 'Compare dressed carcass yield and boneless clean meat percentages across Saudi breeds.'
        : 'احسب نسبة التصافي وصافي اللحم المتوقع مقارنة بالوزن الحي وسعر الكيلو في السوق.',
      cta: isEn ? 'Calculate Yield' : 'احسب الأوزان',
      target: 'weights' as PageView,
    },
    {
      icon: Gift,
      kicker: isEn ? 'Quick Picks' : 'ترشيحات سريعة',
      title: isEn ? 'Livestock by Occasion' : 'اختيار الماشية حسب المناسبة',
      desc: isEn
        ? 'Tailored recommendations for Aqiqa, weddings, family gatherings, and breeding farms.'
        : 'توصيات جاهزة للعقيقة والزواج والعزائم والتربية من حيث السلالة والوزن والميزانية.',
      cta: isEn ? 'Browse Occasions' : 'تصفح المناسبات',
      target: 'occasions' as PageView,
    },
    {
      icon: ShieldCheck,
      kicker: isEn ? 'Field Services' : 'الخدمات الميدانية',
      title: isEn ? 'Request Transport & Vet Care' : 'طلب نقل أو فحص بيطري',
      desc: isEn
        ? 'Submit direct requests for equipped livestock trucks, veterinary checks, and event preparation.'
        : 'أرسل طلباً مباشراً لمزودي خدمات النقل المجهز أو الفحص البيطري أو تجهيز الولائم.',
      cta: isEn ? 'Request Service' : 'عرض وطلب الخدمات',
      target: 'services' as PageView,
    },
  ];

  return (
    <section
      aria-labelledby="home-services-heading"
      className="bg-[var(--color-canvas)] border-b border-[var(--color-border)] py-11 lg:py-14 transition-colors"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-7">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--color-green-ink)] mb-1">
              <Sparkles size={14} className="text-[var(--color-gold)]" aria-hidden="true" />
              <span>{isEn ? 'Smart Calculators & Field Services' : 'حاسبات ذكية وخدمات مساندة'}</span>
            </p>
            <h2
              id="home-services-heading"
              className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--color-ink)]"
            >
              {isEn ? 'SouqAlGhanam Services & Tools' : 'أدوات وخدمات سوق الغنم'}
            </h2>
            <p className="mt-1.5 text-sm text-[var(--color-muted)]">
              {isEn
                ? 'Practical calculators and logistics tools simplifying pricing, feed planning, selection, and delivery'
                : 'حاسبات عملية وخدمات ميدانية تسهّل عليك التسعير والأعلاف والنقل في كافة مناطق المملكة'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('services')}
            className="min-h-[40px] text-xs sm:text-sm font-bold text-[var(--color-green-ink)] hover:underline whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <span>{isEn ? 'View All Services & Request One' : 'عرض كافة الخدمات وطلب خدمة'}</span>
            <DirArrow size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {services.map((srv) => {
            const Icon = srv.icon;
            return (
              <article
                key={srv.title}
                className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] hover:border-[var(--color-gold)] p-5 flex flex-col justify-between gap-4 shadow-[0_2px_10px_-6px_rgba(16,60,44,0.1)] transition-all duration-150 hover:-translate-y-0.5"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="w-10 h-10 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)] text-[var(--color-green-ink)] flex items-center justify-center shrink-0">
                      <Icon size={19} aria-hidden="true" />
                    </span>
                    <span className="text-[11px] font-semibold text-[var(--color-muted)]">
                      {srv.kicker}
                    </span>
                  </div>
                  <h3 className="font-display text-base sm:text-lg font-extrabold text-[var(--color-ink)]">
                    {srv.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[var(--color-muted)] leading-relaxed">
                    {srv.desc}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigate(srv.target)}
                  className="min-h-[40px] pt-3 border-t border-[var(--color-border)]/75 text-xs font-bold text-[var(--color-green-ink)] hover:underline flex items-center justify-between gap-2 cursor-pointer"
                >
                  <span>{srv.cta}</span>
                  <DirArrow size={14} aria-hidden="true" />
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

interface HomeGuidesPreviewSectionProps {
  articles: Article[];
  onOpenGuides: () => void;
}

export function HomeGuidesPreviewSection({
  articles,
  onOpenGuides,
}: HomeGuidesPreviewSectionProps) {
  const { isEn } = useI18n();
  const DirArrow = isEn ? ArrowRight : ArrowLeft;

  if (!articles || articles.length === 0) return null;

  return (
    <section
      aria-labelledby="home-knowledge-heading"
      className="bg-[var(--color-canvas)] border-b border-[var(--color-border)] py-11 lg:py-14 transition-colors"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--color-green-ink)] mb-1">
              <BookOpen size={14} className="text-[var(--color-gold)]" aria-hidden="true" />
              <span>{isEn ? 'Field Guides & Market Advice' : 'المعرفة والإرشاد العملي'}</span>
            </p>
            <h2
              id="home-knowledge-heading"
              className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--color-ink)]"
            >
              {isEn ? 'Guides for Saudi Livestock Buyers & Breeders' : 'مقالات وإرشادات السوق والمراح'}
            </h2>
            <p className="mt-1.5 text-sm text-[var(--color-muted)]">
              {isEn
                ? 'Practical checklists covering health checks, seasonal buying, and ranch nutrition'
                : 'ملخصات عملية حول الفحص قبل الشراء، تغذية الأغنام، واختيار السلالات المناسبة لموسمك'}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenGuides}
            className="text-xs sm:text-sm font-bold text-[var(--color-green-ink)] hover:underline inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <span>{isEn ? 'View All Articles & Guides' : 'تصفح جميع الأدلة والمقالات'}</span>
            <DirArrow size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {articles.slice(0, 3).map((article) => (
            <article
              key={article.id}
              className="group bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] hover:border-[var(--color-gold)]/75 overflow-hidden flex flex-col justify-between transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm"
            >
              <div>
                <div className="aspect-[16/9] bg-[var(--color-cream)] overflow-hidden">
                  <SafeImage
                    src={article.imageUrl}
                    alt={article.title}
                    width={800}
                    height={450}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="p-5 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--color-muted)]">
                    <span className="font-bold text-[var(--color-green-ink)]">{article.category}</span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Clock size={12} aria-hidden="true" />
                      <span>
                        {isEn
                          ? `${article.readTimeMinutes} min`
                          : `${article.readTimeMinutes} دقائق قراءة`}
                      </span>
                    </span>
                  </div>
                  <h3 className="font-display text-base sm:text-lg font-extrabold text-[var(--color-ink)] leading-snug line-clamp-2">
                    {article.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[var(--color-muted)] leading-relaxed line-clamp-2">
                    {article.excerpt}
                  </p>
                </div>
              </div>

              <div className="px-5 pb-4 pt-2 border-t border-[var(--color-border)]/70">
                <button
                  type="button"
                  onClick={onOpenGuides}
                  className="min-h-[36px] w-full text-xs font-bold text-[var(--color-green-ink)] hover:underline inline-flex items-center justify-between gap-2 cursor-pointer"
                >
                  <span>{isEn ? 'Read Full Guide' : 'قراءة الدليل كاملاً'}</span>
                  <DirArrow size={14} aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

interface HomePricingSectionProps {
  onNavigate: (page: PageView) => void;
  onContactSupport: () => void;
}

export function HomePricingSection({ onNavigate, onContactSupport }: HomePricingSectionProps) {
  const { lang, isEn } = useI18n();
  const DirArrow = isEn ? ArrowRight : ArrowLeft;
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const plans = getPricingPlans(lang);

  return (
    <section
      id="home-pricing-section"
      aria-labelledby="home-pricing-heading"
      className="bg-[var(--color-cream)]/60 border-b border-[var(--color-border)] py-12 lg:py-14 transition-colors"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-bold text-[var(--color-green-ink)] mb-1">
              {isEn
                ? 'Transparent Plans for Individuals & Professional Breeders'
                : 'باقات واضحة للأفراد والمربين المحترفين'}
            </p>
            <h2
              id="home-pricing-heading"
              className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--color-ink)]"
            >
              {isEn ? 'Plans & Pricing on SouqAlGhanam' : 'الباقات والأسعار في سوق الغنم'}
            </h2>
            <p className="mt-1.5 text-sm text-[var(--color-muted)]">
              {isEn
                ? 'Start free or activate featured promotion to boost your listings across every Saudi region'
                : 'ابدأ مجاناً أو فعّل باقة التمييز والانتشار لزيادة ظهور عروضك أمام المشترين في جميع مناطق المملكة'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div
              role="tablist"
              aria-label={isEn ? 'Select billing cycle' : 'اختيار دورة الدفع'}
              className="inline-flex items-center p-1 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={billing === 'monthly'}
                onClick={() => setBilling('monthly')}
                className={`min-h-[36px] px-4 py-1 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                  billing === 'monthly'
                    ? 'bg-[var(--color-green)] text-white'
                    : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                }`}
              >
                {isEn ? 'Monthly' : 'شهري'}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={billing === 'annual'}
                onClick={() => setBilling('annual')}
                className={`min-h-[36px] px-4 py-1 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                  billing === 'annual'
                    ? 'bg-[var(--color-green)] text-white'
                    : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                }`}
              >
                {isEn ? 'Annual (Save up to 20%)' : 'سنوي (وفر حتى 20%)'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('pricing')}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream-hover)] text-xs font-bold text-[var(--color-green-ink)] inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <span>{isEn ? 'Detailed Plan Comparison' : 'المقارنة التفصيلية للباقات'}</span>
              <DirArrow size={14} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          {plans.map((plan) => {
            const price = billing === 'monthly' ? plan.monthlyPrice : plan.annualPrice;
            const periodText =
              price === 0
                ? isEn
                  ? 'Free · Always'
                  : 'مجاناً · دائماً'
                : billing === 'monthly'
                ? isEn
                  ? 'SAR / month'
                  : 'ريال / شهرياً'
                : isEn
                ? 'SAR / month (billed annually)'
                : 'ريال / شهرياً (تُدفع سنوياً)';

            const Icon =
              plan.id === 'featured' ? Star : plan.id === 'merchant' ? Crown : UserIcon;

            return (
              <article
                key={plan.id}
                className={`rounded-2xl p-6 flex flex-col justify-between gap-6 ${
                  plan.highlighted
                    ? 'bg-[#103C2C] text-white border border-[#103C2C] shadow-lg'
                    : 'bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-border)] shadow-xs'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          plan.highlighted
                            ? 'bg-[#F4C569] text-[#103C2C]'
                            : 'bg-[var(--color-cream)] border border-[var(--color-border)] text-[var(--color-green-ink)]'
                        }`}
                      >
                        <Icon size={19} aria-hidden="true" />
                      </span>
                      <div>
                        <h3
                          className={`font-display text-lg font-extrabold ${
                            plan.highlighted ? 'text-white' : 'text-[var(--color-ink)]'
                          }`}
                        >
                          {plan.title}
                        </h3>
                        {plan.badge && (
                          <p className="text-[11px] font-bold text-[#F4C569] mt-0.5">
                            {plan.badge}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <p
                    className={`mt-2.5 text-xs leading-relaxed ${
                      plan.highlighted ? 'text-white/80' : 'text-[var(--color-muted)]'
                    }`}
                  >
                    {plan.subtitle}
                  </p>

                  <div
                    className={`mt-5 pb-4 border-b flex items-baseline gap-2 ${
                      plan.highlighted ? 'border-white/15' : 'border-[var(--color-border)]'
                    }`}
                  >
                    <strong
                      className={`font-display text-3xl font-extrabold tabular-nums ${
                        plan.highlighted ? 'text-white' : 'text-[var(--color-green-ink)]'
                      }`}
                    >
                      {price === 0 ? (isEn ? 'Free' : 'مجاناً') : price}
                    </strong>
                    <span
                      className={`text-xs font-semibold ${
                        plan.highlighted ? 'text-[#F4C569]' : 'text-[var(--color-muted)]'
                      }`}
                    >
                      {periodText}
                    </span>
                  </div>

                  <ul className="mt-5 space-y-2.5 text-xs sm:text-sm">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <Check
                          size={15}
                          strokeWidth={2.5}
                          className={`shrink-0 mt-0.5 ${
                            plan.highlighted ? 'text-[#F4C569]' : 'text-[var(--color-green-ink)]'
                          }`}
                          aria-hidden="true"
                        />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => onNavigate(plan.id === 'free' ? 'add' : 'pricing')}
                    className={`w-full min-h-[44px] rounded-xl font-bold text-sm transition-colors cursor-pointer ${
                      plan.highlighted
                        ? 'bg-[#F4C569] hover:bg-[#ffd582] text-[#103C2C]'
                        : 'border-2 border-[var(--color-green-ink)] text-[var(--color-green-ink)] hover:bg-[var(--color-green)] hover:text-white hover:border-[var(--color-green)]'
                    }`}
                  >
                    {plan.ctaLabel}
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs sm:text-sm text-[var(--color-muted)]">
          <span>
            {isEn
              ? 'Need a tailored plan for a large ranch or multiple branches?'
              : 'تحتاج باقة مخصصة لمراح كبير أو عدة فروع؟'}
          </span>
          <button
            type="button"
            onClick={onContactSupport}
            className="font-bold text-[var(--color-green-ink)] hover:underline inline-flex items-center gap-1.5 cursor-pointer"
          >
            <span>
              {isEn ? 'Contact Us to Customize Your Ranch Plan' : 'تواصل معنا لتخصيص باقة مراحك'}
            </span>
            <DirArrow size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}

interface HomeQuickContactSectionProps {
  onNavigate: (page: PageView) => void;
}

export function HomeQuickContactSection({ onNavigate }: HomeQuickContactSectionProps) {
  const { isEn } = useI18n();
  const DirArrow = isEn ? ArrowRight : ArrowLeft;

  return (
    <section
      aria-labelledby="home-quick-contact-heading"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16"
    >
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0D3124] via-[#103C2C] to-[#081F17] text-white border border-[#E0A84B]/25 p-6 sm:p-10 lg:p-12 shadow-[0_24px_60px_-28px_rgba(10,32,24,0.65)]">
        {/* Subtle Architectural Glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-28 -end-20 w-72 h-72 rounded-full bg-[radial-gradient(circle,rgba(224,168,75,0.18)_0%,transparent_70%)]"
        />

        <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          {/* Concise Headline & Primary Actions */}
          <div className="lg:col-span-6 space-y-4">
            <div className="inline-flex items-center gap-2 text-xs font-bold tracking-wide text-[#F4C569]">
              <ShieldCheck size={15} aria-hidden="true" />
              <span>{isEn ? 'Direct Support & Quick Access' : 'تواصل مباشر وخدمات مساندة'}</span>
            </div>

            <h2
              id="home-quick-contact-heading"
              className="font-display text-2xl sm:text-3xl font-extrabold text-white leading-tight"
            >
              {isEn
                ? 'Need Assistance or Ready to List Your Livestock?'
                : 'هل لديك استفسار أو ترغب بعرض حلالك؟'}
            </h2>

            <p className="text-sm sm:text-[15px] text-white/80 leading-relaxed max-w-xl">
              {isEn
                ? 'Reach our team directly via phone or email, post your listing in minutes, or jump to our pricing guides and smart calculators.'
                : 'تواصل معنا مباشرة أو أضف إعلانك خلال دقائق، مع وصول فوري لدليل الأسعار والخدمات المساندة.'}
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('contact')}
                className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#E0A84B] hover:bg-[#eab862] text-[#0D2B20] text-sm font-extrabold transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
              >
                <span>{isEn ? 'Contact Us' : 'تواصل معنا'}</span>
                <DirArrow size={16} aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => onNavigate('add')}
                className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/25 bg-white/8 hover:bg-white/15 text-white text-sm font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>{isEn ? 'Post a Listing' : 'أضف إعلانك الآن'}</span>
              </button>
            </div>
          </div>

          {/* Compact 2x2 Direct Contact & Quick Tools Grid */}
          <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <a
              href="tel:+966564419966"
              className="group rounded-2xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/12 hover:border-[#F4C569]/45 p-4 flex items-center gap-3.5 transition-colors"
            >
              <span className="w-10 h-10 rounded-xl bg-[#F4C569]/15 text-[#F4C569] flex items-center justify-center shrink-0">
                <Phone size={18} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold text-white/65">
                  {isEn ? 'Direct Call' : 'اتصال مباشر'}
                </span>
                <span
                  dir="ltr"
                  className="block mt-0.5 font-display text-sm font-bold text-white tabular-nums group-hover:text-[#F4C569] transition-colors"
                >
                  +966 56 441 9966
                </span>
              </span>
            </a>

            <a
              href="mailto:kkfjahdali@icloud.com"
              className="group rounded-2xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/12 hover:border-[#F4C569]/45 p-4 flex items-center gap-3.5 transition-colors"
            >
              <span className="w-10 h-10 rounded-xl bg-[#F4C569]/15 text-[#F4C569] flex items-center justify-center shrink-0">
                <Mail size={18} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold text-white/65">
                  {isEn ? 'Email Support' : 'البريد الإلكتروني'}
                </span>
                <span
                  dir="ltr"
                  className="block mt-0.5 text-sm font-bold text-white truncate group-hover:text-[#F4C569] transition-colors"
                >
                  kkfjahdali@icloud.com
                </span>
              </span>
            </a>

            <button
              type="button"
              onClick={() => onNavigate('breeds')}
              className="group text-start rounded-2xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/12 hover:border-[#F4C569]/45 p-4 flex items-center gap-3.5 transition-colors cursor-pointer"
            >
              <span className="w-10 h-10 rounded-xl bg-white/10 text-[#F4C569] flex items-center justify-center shrink-0">
                <TrendingUp size={18} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-sm font-bold text-white group-hover:text-[#F4C569] transition-colors">
                  {isEn ? 'Breeds & Prices' : 'دليل السلالات والأسعار'}
                </span>
                <span className="block mt-0.5 text-[11px] text-white/65">
                  {isEn ? 'Seasonal SAR price index' : 'الأسعار الاسترشادية والمؤشر'}
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('services')}
              className="group text-start rounded-2xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/12 hover:border-[#F4C569]/45 p-4 flex items-center gap-3.5 transition-colors cursor-pointer"
            >
              <span className="w-10 h-10 rounded-xl bg-white/10 text-[#F4C569] flex items-center justify-center shrink-0">
                <Calculator size={18} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-sm font-bold text-white group-hover:text-[#F4C569] transition-colors">
                  {isEn ? 'Services & Tools' : 'الخدمات والحاسبات'}
                </span>
                <span className="block mt-0.5 text-[11px] text-white/65">
                  {isEn ? 'Transport, vet & feast calc' : 'نقل، بيطرة، وحاسبة الولائم'}
                </span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
