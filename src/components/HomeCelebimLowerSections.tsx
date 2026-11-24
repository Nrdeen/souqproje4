import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  MapPin,
  Plus,
  Search,
  Star,
  Zap,
} from 'lucide-react';
import type { CommissionSettings } from '../lib/commission';
import { formatPriceSar } from '../lib/format';
import { trRegionName } from '../lib/bilingual';
import { useI18n } from '../lib/i18n';
import type { PageView } from '../lib/router';
import type { Listing, Region } from '../types/marketplace';

interface HomeCelebimLowerSectionsProps {
  publishedListings: Listing[];
  regions: Region[];
  commissionSettings?: CommissionSettings | null;
  onOpenListing: (listingId: string) => void;
  onNavigate: (page: PageView) => void;
}

export function HomeCelebimLowerSections({
  publishedListings,
  regions,
  commissionSettings,
  onOpenListing,
  onNavigate,
}: HomeCelebimLowerSectionsProps) {
  return (
    <>
      <HomeCelebimActivityTicker
        publishedListings={publishedListings}
        regions={regions}
        onOpenListing={onOpenListing}
      />

      <HomeCelebimHowItWorks />

      <HomeCelebimBoostSpotlight
        publishedListings={publishedListings}
        regions={regions}
        commissionSettings={commissionSettings}
        onNavigate={onNavigate}
      />

      <HomeCelebimDualAction onNavigate={onNavigate} />

      <HomeCelebimPackages
        commissionSettings={commissionSettings}
        onNavigate={onNavigate}
      />

      <HomeCelebimSellerCta onNavigate={onNavigate} />

      <HomeCelebimTestimonials />

      <HomeCelebimFaq onNavigate={onNavigate} />
    </>
  );
}

/* =========================================================================
   SECTION 1 (Celebim Section 0): Live Activity Ticker (Son İşlemler)
   ========================================================================= */
function HomeCelebimActivityTicker({
  publishedListings,
  regions,
  onOpenListing,
}: {
  publishedListings: Listing[];
  regions: Region[];
  onOpenListing: (listingId: string) => void;
}) {
  const { dir, lang, isEn } = useI18n();
  const regionMap = useMemo(() => new Map(regions.map((r) => [r.id, r.name])), [regions]);

  const tickerItems = useMemo(() => {
    return publishedListings.slice(0, 12).map((listing, idx) => ({
      id: listing.id,
      num: String(idx + 1).padStart(2, '0'),
      region: trRegionName(regionMap.get(listing.regionId) || 'السعودية', lang),
      title: listing.title,
    }));
  }, [publishedListings, regionMap, lang]);

  if (tickerItems.length === 0) return null;

  return (
    <section
      className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8"
      aria-label={isEn ? 'Latest activity: newly published listings' : 'أحدث العمليات: الإعلانات المضافة حديثاً'}
    >
      <div className="flex min-h-[72px] items-center overflow-hidden border-y border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="relative z-10 flex w-[132px] shrink-0 flex-col justify-center bg-[var(--color-surface)] py-3 ps-2 pe-3 sm:w-[190px]">
          <p className="text-[10px] font-bold tracking-[0.12em] text-[var(--color-green-ink)]">
            {isEn ? 'NEW LISTINGS' : 'إعلانات حديثة'}
          </p>
          <p className="mt-0.5 whitespace-nowrap text-[15px] font-black tracking-tight text-[var(--color-ink)] sm:text-[17px]">
            {isEn ? 'Latest Activity' : 'أحدث العمليات'}
          </p>
        </div>

        <div
          className={`min-w-0 flex-1 overflow-hidden ${
            dir === 'rtl'
              ? '[mask-image:linear-gradient(to_left,black_95%,transparent)]'
              : '[mask-image:linear-gradient(to_right,black_95%,transparent)]'
          }`}
        >
          <div className="souq-activity-track flex w-max items-center">
            <div className="flex shrink-0 items-center">
              {tickerItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenListing(item.id)}
                  className="group/item inline-flex max-w-[360px] shrink-0 items-baseline gap-3 border-e border-[var(--color-border)] px-5 py-2 text-[13px] text-[var(--color-ink)] hover:bg-[var(--color-cream)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-green)] cursor-pointer transition-colors"
                >
                  <span
                    className="shrink-0 font-mono text-[11px] font-bold text-[var(--color-gold-hover)] dark:text-[var(--color-gold)]"
                    aria-hidden="true"
                  >
                    {item.num}
                  </span>
                  <span className="shrink-0 text-[11px] font-bold tracking-wide text-[var(--color-muted)]">
                    {item.region}
                  </span>
                  <span className="max-w-[190px] truncate font-semibold group-hover/item:underline group-hover/item:decoration-[var(--color-green)] group-hover/item:underline-offset-4">
                    {item.title}
                  </span>
                </button>
              ))}
            </div>

            <div className="souq-activity-copy flex shrink-0 items-center" aria-hidden="true">
              {tickerItems.map((item) => (
                <button
                  key={`copy-${item.id}`}
                  type="button"
                  tabIndex={-1}
                  onClick={() => onOpenListing(item.id)}
                  className="group/item inline-flex max-w-[360px] shrink-0 items-baseline gap-3 border-e border-[var(--color-border)] px-5 py-2 text-[13px] text-[var(--color-ink)] hover:bg-[var(--color-cream)]/40 cursor-pointer transition-colors"
                >
                  <span className="shrink-0 font-mono text-[11px] font-bold text-[var(--color-gold-hover)] dark:text-[var(--color-gold)]">
                    {item.num}
                  </span>
                  <span className="shrink-0 text-[11px] font-bold tracking-wide text-[var(--color-muted)]">
                    {item.region}
                  </span>
                  <span className="max-w-[190px] truncate font-semibold group-hover/item:underline group-hover/item:decoration-[var(--color-green)] group-hover/item:underline-offset-4">
                    {item.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   SECTION 2 (Celebim Section 1): How It Works (Nasıl Çalışır)
   ========================================================================= */
function HomeCelebimHowItWorks() {
  const { dir, isEn } = useI18n();
  const sectionRef = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [selectedStep, setSelectedStep] = useState<number | null>(null);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window)
    ) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  const steps = useMemo(
    () =>
      isEn
        ? [
            {
              title: 'Create Account',
              description: 'Create your free personal or ranch breeder account in under a minute.',
              tag: 'FREE',
            },
            {
              title: 'Browse or List',
              description: 'Filter listings by breed, category, and region or publish your own.',
              tag: 'EASY',
            },
            {
              title: 'Direct Contact',
              description: 'Reach the seller directly using phone, WhatsApp, or platform messages.',
              tag: 'FAST',
            },
            {
              title: 'Close the Deal',
              description: 'Inspect the livestock and finalize agreement, payment, and transport directly.',
              tag: 'TRUSTED',
            },
          ]
        : [
            {
              title: 'سجّل حسابك',
              description: 'أنشئ حسابك الشخصي أو حساب المراح مجاناً خلال دقيقة واحدة.',
              tag: 'مجاناً',
            },
            {
              title: 'تصفح أو أضف إعلانك',
              description: 'استعرض الإعلانات حسب السلالة والمنطقة أو اعرض حلالك للبيع بوضوح.',
              tag: 'بسهولة',
            },
            {
              title: 'تواصل مباشرة',
              description: 'تواصل مع البائع عبر الواتساب أو الاتصال أو رسائل المنصة مباشرة.',
              tag: 'بسرعة',
            },
            {
              title: 'أتمم الاتفاق',
              description: 'عاين الحلال وتحقق من المواصفات؛ الاتفاق والدفع والتسليم يتم بين الطرفين.',
              tag: 'بموثوقية',
            },
          ],
    [isEn]
  );

  return (
    <section
      ref={sectionRef}
      className="py-10 sm:py-20"
      aria-labelledby="celebim-how-it-works-heading"
    >
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-7 max-w-[900px] text-center sm:mb-12 sm:ms-0 sm:text-start">
          <span className="text-[11px] font-extrabold tracking-[0.14em] text-[var(--color-gold-hover)] dark:text-[var(--color-gold)]">
            {isEn ? 'HOW IT WORKS' : 'كيف يعمل السوق'}
          </span>
          <h2
            id="celebim-how-it-works-heading"
            className="mt-2 font-display text-[26px] font-black leading-[1.18] tracking-tight text-[var(--color-ink)] sm:mt-3 sm:text-[40px]"
          >
            {isEn
              ? 'Souq Al-Ghanam connects buyers and sellers directly; sales and payment decisions stay between you.'
              : 'سوق الغنم يجمع البائع والمشتري مباشرة؛ وقرارات البيع والدفع بين الطرفين.'}
          </h2>
        </div>

        <div className="relative">
          <span
            className="absolute left-[12.5%] right-[12.5%] top-8 hidden h-px bg-[var(--color-border)] md:block"
            aria-hidden="true"
          />
          <span
            className={`absolute left-[12.5%] right-[12.5%] top-8 hidden h-px ${
              dir === 'rtl' ? 'origin-right' : 'origin-left'
            } bg-[var(--color-green)] motion-safe:transition-transform motion-safe:duration-1000 md:block ${
              visible ? 'scale-x-100' : 'scale-x-0'
            }`}
            aria-hidden="true"
          />

          <ol className="grid grid-cols-2 gap-x-4 gap-y-7 sm:gap-y-10 md:grid-cols-4 md:gap-y-0">
            {steps.map((step, idx) => {
              const isSelected = selectedStep === idx;
              return (
                <li
                  key={step.title}
                  className={`relative z-10 px-2 text-center motion-safe:transition-all motion-safe:duration-500 sm:px-4 ${
                    visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
                  }`}
                  style={{ transitionDelay: visible ? `${idx * 160}ms` : '0ms' }}
                >
                  <button
                    type="button"
                    aria-label={`${isEn ? `Step ${idx + 1}` : `الخطوة ${idx + 1}`}: ${step.title}`}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedStep(isSelected ? null : idx)}
                    className={`relative mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-green)] text-[20px] font-black text-white ring-8 ring-[var(--color-canvas)] shadow-[0_6px_18px_rgba(16,60,44,0.2)] motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-gold)]/50 sm:mb-5 sm:h-16 sm:w-16 sm:text-[22px] cursor-pointer ${
                      isSelected ? 'scale-110 ring-[var(--color-gold)]/40' : 'scale-100'
                    }`}
                  >
                    <span
                      className="pointer-events-none absolute inset-[5px] rounded-full border border-[#F4C569]/45"
                      aria-hidden="true"
                    />
                    <span className="relative tabular-nums">{idx + 1}</span>
                  </button>

                  <h3 className="font-display text-[15px] font-extrabold text-[var(--color-ink)] sm:text-[16px]">
                    {step.title}
                  </h3>
                  <p className="mx-auto mt-2 max-w-[230px] text-[12px] leading-5 text-[var(--color-muted)] sm:text-[13px] sm:leading-6">
                    {step.description}
                  </p>
                  <span className="mt-3 inline-block rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-[10px] font-bold tracking-wider text-[var(--color-green-ink)]">
                    {step.tag}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   SECTION 3 (Celebim Section 2): Interactive Boost Spotlight
   ========================================================================= */
function HomeCelebimBoostSpotlight({
  publishedListings,
  regions,
  commissionSettings,
  onNavigate,
}: {
  publishedListings: Listing[];
  regions: Region[];
  commissionSettings?: CommissionSettings | null;
  onNavigate: (page: PageView) => void;
}) {
  const { dir, lang, isEn } = useI18n();
  const [step, setStep] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const weeklyFeaturedPrice = commissionSettings?.featuredWeeklyPriceSar ?? 35;

  useEffect(() => {
    if (
      hovered ||
      focused ||
      (typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      setStep((prev) => (prev + 1) % 3);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [hovered, focused]);

  const sampleListing = useMemo(() => {
    const featured = publishedListings.find((l) => l.isFeatured && l.images?.[0]?.url);
    const withPhoto = publishedListings.find((l) => l.images?.[0]?.url);
    return featured || withPhoto || publishedListings[0] || null;
  }, [publishedListings]);

  const regionMap = useMemo(() => new Map(regions.map((r) => [r.id, r.name])), [regions]);
  const sampleRegion = sampleListing
    ? trRegionName(regionMap.get(sampleListing.regionId) || 'الرياض', lang)
    : isEn
      ? 'Riyadh'
      : 'الرياض';

  const boostSteps = useMemo(
    () =>
      isEn
        ? [
            { title: 'Choose boost option' },
            { title: 'Apply to your active listing' },
            { title: 'Appear in featured top slots' },
          ]
        : [
            { title: 'اختر باقة التمييز' },
            { title: 'طبّقه على إعلانك النشط' },
            { title: 'تصدّر الإعلانات المميزة' },
          ],
    [isEn]
  );

  const DirArrow = dir === 'rtl' ? ArrowLeft : ArrowRight;

  return (
    <section
      aria-labelledby="celebim-boost-spotlight-heading"
      className="py-10 sm:py-20"
    >
      <div className="mx-auto grid max-w-[1280px] items-center gap-7 px-4 sm:gap-10 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:px-8">
        {/* Copy Column */}
        <div className="text-center sm:text-start">
          <div className="mb-3 text-[11px] font-extrabold tracking-[0.14em] text-[var(--color-gold-hover)] dark:text-[var(--color-gold)]">
            {isEn ? 'LISTING BOOST' : 'تمييز الإعلانات'}
          </div>

          <h2
            id="celebim-boost-spotlight-heading"
            className="mx-auto max-w-[530px] font-display text-[26px] font-black leading-[1.16] tracking-tight text-[var(--color-ink)] sm:mx-0 sm:text-[42px]"
          >
            {isEn ? (
              <>
                Boost your listing, stand{' '}
                <span className="text-[var(--color-green-ink)]">out in front.</span>
              </>
            ) : (
              <>
                فعّل التمييز، واجعل إعلانك{' '}
                <span className="text-[var(--color-green-ink)]">في الصدارة.</span>
              </>
            )}
          </h2>

          <p className="mx-auto mt-3 max-w-[530px] text-[13px] leading-6 text-[var(--color-muted)] sm:mx-0 sm:mt-5 sm:text-[15px] sm:leading-7">
            {isEn
              ? 'When you activate featuring on an active listing, it moves to the top of search results and displays a priority badge for faster buyer reach.'
              : 'عند تفعيل التمييز على إعلانك النشط، يظهر في أعلى نتائج البحث وقائمة الإعلانات طوال مدة التمييز مع شارة خاصة تزيد من سرعة الوصول للمشترين.'}
          </p>

          <div className="mt-5 flex flex-col items-center gap-2 text-[12px] font-semibold text-[var(--color-ink)] sm:mt-7 sm:flex-row sm:items-start sm:gap-6 sm:text-[13px]">
            <span className="flex items-center gap-2">
              <Check
                className="h-4 w-4 shrink-0 text-[var(--color-green-ink)]"
                aria-hidden="true"
              />
              {isEn ? 'Applied directly to active listings' : 'يُطبّق على الإعلان النشط'}
            </span>
            <span className="flex items-center gap-2">
              <Check
                className="h-4 w-4 shrink-0 text-[var(--color-green-ink)]"
                aria-hidden="true"
              />
              {isEn
                ? 'Flexible weekly boost or package tiers'
                : 'تمييز أسبوعي مرن أو ضمن الباقات'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('pricing')}
            className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-[10px] bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] px-6 text-[14px] font-extrabold text-white transition-all hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)] focus-visible:ring-offset-2 sm:mt-9 cursor-pointer"
          >
            <span>{isEn ? 'Explore Boost Options' : 'استكشف خيارات التمييز'}</span>
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Interactive Boost Showcase Card */}
        <div
          className="overflow-hidden rounded-[24px] border border-[var(--color-green)]/45 dark:border-[var(--color-gold)]/55 bg-[var(--color-surface)] p-4 shadow-[0_18px_45px_rgba(16,60,44,0.08)] sm:p-6"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocusCapture={() => setFocused(true)}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setFocused(false);
            }
          }}
        >
          <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] text-[var(--color-ink)]">
            <Zap className="h-4 w-4 text-[var(--color-gold)]" aria-hidden="true" />
            <span>{isEn ? 'HOW BOOST WORKS' : 'كيف يُستخدم التمييز؟'}</span>
          </div>

          <div className="mt-4 h-[235px] sm:h-[270px]">
            {step === 0 ? (
              <div className="flex h-full flex-col justify-center rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:p-5">
                <div className="mb-3 text-center">
                  <p className="text-[10px] font-extrabold tracking-[0.13em] text-[var(--color-gold-hover)] dark:text-[var(--color-gold)]">
                    {isEn ? 'LISTING BOOST' : 'تمييز الإعلان'}
                  </p>
                  <p className="mt-1 font-display text-[15px] font-black text-[var(--color-ink)] sm:text-[17px]">
                    {isEn ? 'Make your livestock listing stand out' : 'اجعل إعلانك أكثر ظهوراً أمام المشترين'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div className="flex min-h-[155px] flex-col rounded-xl border border-[var(--color-green)]/45 dark:border-[var(--color-gold)]/55 bg-[var(--color-surface-warm)] p-2.5 sm:p-3">
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-[11px] font-extrabold leading-4 text-[var(--color-ink)] sm:text-[13px]">
                        {isEn ? 'Weekly Boost · 7 Days' : 'تمييز أسبوعي ٧ أيام'}
                      </p>
                      <Zap
                        className="h-4 w-4 shrink-0 text-[var(--color-gold)]"
                        aria-hidden="true"
                      />
                    </div>
                    <p className="mt-2 font-display text-[20px] font-black text-[var(--color-green-ink)] tabular-nums sm:text-[24px]">
                      {formatPriceSar(weeklyFeaturedPrice)}
                    </p>
                    <p className="mt-1 text-[10px] text-[var(--color-muted)] sm:text-[11px]">
                      {isEn ? '7 days priority placement' : '٧ أيام في مقدمة الإعلانات'}
                    </p>
                    <span className="mt-auto flex h-8 items-center justify-center rounded-md bg-[var(--color-green)] text-[10px] font-extrabold text-white">
                      {isEn ? 'Select Boost' : 'طلب التمييز'}
                    </span>
                  </div>

                  <div className="flex min-h-[155px] flex-col rounded-xl border border-[var(--color-gold)]/70 bg-[var(--color-surface-warm)] p-2.5 sm:p-3">
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-[11px] font-extrabold leading-4 text-[var(--color-ink)] sm:text-[13px]">
                        {isEn ? 'Featured Plan · 30 Days' : 'باقة المميز ٣٠ يوماً'}
                      </p>
                      <Zap
                        className="h-4 w-4 shrink-0 text-[var(--color-gold)]"
                        aria-hidden="true"
                      />
                    </div>
                    <p className="mt-2 font-display text-[20px] font-black text-[var(--color-green-ink)] tabular-nums sm:text-[24px]">
                      {formatPriceSar(99)}
                    </p>
                    <p className="mt-1 text-[10px] text-[var(--color-muted)] sm:text-[11px]">
                      {isEn ? '30 days top search visibility' : '٣٠ يوماً أولوية قصوى بالبحث'}
                    </p>
                    <span className="mt-auto flex h-8 items-center justify-center rounded-md bg-[var(--color-gold)] text-[10px] font-extrabold text-[#10261D]">
                      {isEn ? 'Featured Plan' : 'اختيار الباقة'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className={`flex h-full flex-col rounded-[14px] border p-3 sm:p-5 ${
                  step === 2
                    ? 'border-[var(--color-gold)] bg-[var(--color-gold-soft)]/45 dark:bg-[var(--color-gold-soft)]/25'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                }`}
              >
                <div className="mb-3 flex items-center justify-between border-b border-[var(--color-border)] pb-3">
                  <p className="flex items-center gap-1.5 font-display text-[13px] font-black text-[var(--color-ink)] sm:text-[15px]">
                    {step === 2 && (
                      <Zap className="h-4 w-4 text-[var(--color-gold)]" aria-hidden="true" />
                    )}
                    <span>
                      {step === 2
                        ? isEn
                          ? 'Featured Listings'
                          : 'الإعلانات المميزة'
                        : isEn
                          ? 'My Listings'
                          : 'إعلاناتي'}
                    </span>
                  </p>
                  <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--color-muted)]">
                    {step === 2
                      ? isEn
                        ? 'Priority View'
                        : 'نموذج عرض مميز'
                      : isEn
                        ? 'Active Listing'
                        : 'إعلان نشط'}
                  </span>
                </div>

                {sampleListing ? (
                  <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
                    <div className="relative w-[42%] shrink-0 bg-[var(--color-cream)]">
                      {sampleListing.images?.[0]?.url ? (
                        <img
                          src={sampleListing.images[0].url}
                          alt={sampleListing.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[var(--color-green-ink)]">
                          <Zap className="h-8 w-8 opacity-40" aria-hidden="true" />
                        </div>
                      )}
                      {step === 2 && (
                        <span className="absolute bottom-2 start-2 inline-flex items-center gap-1 rounded-md bg-[var(--color-green)] px-2 py-1 text-[9px] font-extrabold text-[#F4C569] shadow-xs sm:text-[10px]">
                          <Zap className="h-3 w-3 fill-current" aria-hidden="true" />
                          <span>{isEn ? 'Featured' : 'مميز'}</span>
                        </span>
                      )}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col p-2.5 sm:p-4">
                      {step === 2 ? (
                        <p className="flex items-center gap-1 text-[10px] font-semibold text-[var(--color-muted)]">
                          <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">{sampleRegion}</span>
                        </p>
                      ) : (
                        <span className="w-fit rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-green-ink)]">
                          {isEn ? 'Published' : 'منشور'}
                        </span>
                      )}

                      <p className="mt-2 line-clamp-2 font-display text-[12px] font-extrabold leading-4 text-[var(--color-ink)] sm:text-[15px] sm:leading-5">
                        {sampleListing.title}
                      </p>

                      <p className="mt-1 font-display text-[12px] font-black text-[var(--color-green-ink)] tabular-nums sm:text-[15px]">
                        {formatPriceSar(sampleListing.priceAmount)}
                      </p>

                      {step === 2 ? (
                        <span className="mt-auto inline-flex items-center gap-1 border-t border-[var(--color-border)] pt-2 text-[10px] font-bold text-[var(--color-ink)]">
                          <span>{isEn ? 'View Listing' : 'معاينة الإعلان'}</span>
                          <DirArrow className="h-3 w-3" aria-hidden="true" />
                        </span>
                      ) : (
                        <span className="mt-auto inline-flex w-fit items-center gap-1 rounded-full border border-[var(--color-green)]/50 bg-[var(--color-green)]/5 px-2.5 py-1 text-[10px] font-bold text-[var(--color-green-ink)]">
                          <Zap className="h-3 w-3" aria-hidden="true" />
                          <span>{isEn ? 'Boost' : 'ميّز إعلانك'}</span>
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] px-4 text-center text-[13px] text-[var(--color-muted)]">
                    {isEn
                      ? 'Your active listing will appear here ready for priority boosting.'
                      : 'يظهر إعلانك النشط هنا جاهزاً لتفعيل شارة التمييز والظهور في الصدارة.'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3-Step Selector Buttons */}
          <ol
            className="mt-4 grid gap-2 sm:grid-cols-3"
            aria-label={isEn ? 'Steps to boost your listing' : 'خطوات استخدام التمييز'}
          >
            {boostSteps.map((s, idx) => {
              const active = step === idx;
              return (
                <li key={s.title}>
                  <button
                    type="button"
                    aria-current={active ? 'step' : undefined}
                    onClick={() => setStep(idx)}
                    className={`flex h-full w-full items-center gap-2 rounded-[10px] border px-3 py-3 text-start text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)] cursor-pointer ${
                      active
                        ? 'border-[var(--color-green)] dark:border-[var(--color-gold)] bg-[var(--color-surface)] text-[var(--color-ink)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:border-[var(--color-green)] dark:hover:border-[var(--color-gold)]'
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-extrabold tabular-nums ${
                        active
                          ? 'border-[var(--color-green)] bg-[var(--color-green)] text-white'
                          : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)]'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span>{s.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   SECTION 4 (Celebim Section 3): Dual Buy / Sell Action Cards
   ========================================================================= */
function HomeCelebimDualAction({ onNavigate }: { onNavigate: (page: PageView) => void }) {
  const { isEn } = useI18n();

  return (
    <section
      aria-label={isEn ? 'Buy and sell on Souq Al-Ghanam' : 'البيع والشراء في سوق الغنم'}
      className="py-8 sm:py-12"
    >
      <div className="mx-auto grid max-w-[1280px] gap-3 px-4 sm:grid-cols-2 sm:gap-4 sm:px-6 lg:px-8">
        <a
          href="#ilan-vitrini"
          className="group flex min-h-24 items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 transition-colors hover:border-[var(--color-green)] dark:hover:border-[var(--color-gold)] hover:bg-[var(--color-green)]/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)] focus-visible:ring-offset-2 sm:min-h-32 sm:px-7"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-green)]/10 text-[var(--color-green-ink)] sm:h-12 sm:w-12">
            <Search className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[15px] font-extrabold text-[var(--color-ink)] sm:text-[18px]">
              {isEn ? 'I want to buy livestock' : 'أرغب في شراء حلال'}
            </span>
            <span className="mt-1 block text-[12px] leading-5 text-[var(--color-muted)] sm:text-[13px]">
              {isEn
                ? 'Browse live listings and find the right livestock for your needs.'
                : 'تصفح الإعلانات المحدثة واعثر على الحلال المناسب لك.'}
            </span>
          </span>
          <ArrowUpRight
            className="h-5 w-5 shrink-0 text-[var(--color-green-ink)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </a>

        <button
          type="button"
          onClick={() => onNavigate('add')}
          className="group flex min-h-24 w-full items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 text-start transition-colors hover:border-[var(--color-green)] dark:hover:border-[var(--color-gold)] hover:bg-[var(--color-green)]/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)] focus-visible:ring-offset-2 sm:min-h-32 sm:px-7 cursor-pointer"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-gold)]/15 text-[var(--color-gold-hover)] dark:text-[var(--color-gold)] sm:h-12 sm:w-12">
            <Plus className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[15px] font-extrabold text-[var(--color-ink)] sm:text-[18px]">
              {isEn ? 'I want to sell livestock' : 'أرغب في بيع حلالي'}
            </span>
            <span className="mt-1 block text-[12px] leading-5 text-[var(--color-muted)] sm:text-[13px]">
              {isEn
                ? 'Publish your listing in minutes and connect directly with buyers.'
                : 'انشر إعلانك بالصور والمواصفات وتواصل مباشرة مع المشترين.'}
            </span>
          </span>
          <ArrowUpRight
            className="h-5 w-5 shrink-0 text-[var(--color-green-ink)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </button>
      </div>
    </section>
  );
}

/* =========================================================================
   SECTION 5 (Celebim Section 4): Packages & Pricing Comparison Cards
   ========================================================================= */
interface PackageSpec {
  id: 'start' | 'featured' | 'merchant';
  name: string;
  highlighted?: boolean;
  badgeText?: string;
  monthlyPriceSar: number;
  yearlyPriceSar: number;
  features: string[];
}

function HomeCelebimPackageCard({
  pkg,
  isYearly,
  onNavigate,
}: {
  pkg: PackageSpec;
  isYearly: boolean;
  onNavigate: (page: PageView) => void;
}) {
  const { dir, isEn } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const visibleFeatures = expanded ? pkg.features : pkg.features.slice(0, 4);
  const isFree = pkg.monthlyPriceSar === 0;
  const displayPrice = isYearly ? pkg.yearlyPriceSar : pkg.monthlyPriceSar;
  const DirArrow = dir === 'rtl' ? ArrowLeft : ArrowRight;

  return (
    <article
      className={`flex flex-col rounded-[18px] border p-4 sm:p-6 transition-colors ${
        pkg.highlighted
          ? 'border-[var(--color-green)] bg-[var(--color-green)] text-white shadow-[0_18px_40px_rgba(16,60,44,0.18)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)]'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3
          className={`font-display text-[18px] font-black sm:text-[21px] ${
            pkg.highlighted ? 'text-white' : 'text-[var(--color-ink)]'
          }`}
        >
          {pkg.name}
        </h3>
        {pkg.badgeText && (
          <span className="rounded-full border border-[#F4C569]/70 bg-[#F4C569]/15 px-2.5 py-1 text-[10px] font-extrabold text-[#F4C569]">
            {pkg.badgeText}
          </span>
        )}
      </div>

      <p
        className={`mt-3 font-display text-[24px] font-black tabular-nums sm:mt-4 sm:text-[28px] ${
          pkg.highlighted ? 'text-white' : 'text-[var(--color-ink)]'
        }`}
      >
        {isFree ? (
          isEn ? (
            'Free'
          ) : (
            'مجاناً'
          )
        ) : (
          <>
            {formatPriceSar(displayPrice)}
            <span
              className={`ms-1.5 text-[12px] font-semibold ${
                pkg.highlighted ? 'text-white/85' : 'text-[var(--color-muted)]'
              }`}
            >
              {isYearly
                ? isEn
                  ? '/mo · billed yearly'
                  : '/شهر · سنوياً'
                : isEn
                  ? '/mo'
                  : '/شهر'}
            </span>
          </>
        )}
      </p>

      <ul
        id={listId}
        className={`mt-4 space-y-2 border-t pt-4 sm:mt-6 sm:space-y-3 sm:pt-5 ${
          pkg.highlighted ? 'border-white/25' : 'border-[var(--color-border)]'
        }`}
      >
        {visibleFeatures.map((feat) => (
          <li
            key={feat}
            className={`flex items-start gap-2 text-[12px] font-medium sm:text-[13px] ${
              pkg.highlighted ? 'text-white' : 'text-[var(--color-ink)]'
            }`}
          >
            <Check
              className={`mt-0.5 h-4 w-4 shrink-0 ${
                pkg.highlighted ? 'text-[#F4C569]' : 'text-[var(--color-green-ink)]'
              }`}
              aria-hidden="true"
            />
            <span>{feat}</span>
          </li>
        ))}
      </ul>

      {pkg.features.length > 4 && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-controls={listId}
          className={`mt-4 inline-flex items-center justify-center gap-2 rounded-lg py-2 text-[12px] font-bold hover:underline focus-visible:outline-none focus-visible:ring-2 sm:mt-5 cursor-pointer ${
            pkg.highlighted
              ? 'text-[#F4C569] focus-visible:ring-white'
              : 'text-[var(--color-green-ink)] focus-visible:ring-[var(--color-green)]'
          }`}
        >
          <span>
            {expanded
              ? isEn
                ? 'Show less'
                : 'عرض أقل'
              : isEn
                ? `See all features (${pkg.features.length})`
                : `عرض جميع المميزات (${pkg.features.length})`}
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      )}

      <button
        type="button"
        onClick={() => onNavigate('pricing')}
        className={`mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border text-[12px] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:mt-6 sm:h-11 sm:text-[13px] cursor-pointer ${
          pkg.highlighted
            ? 'border-[#F4C569]/70 bg-white/10 text-white hover:bg-white/20 focus-visible:ring-white'
            : 'border-[var(--color-green)] dark:border-[var(--color-gold)] text-[var(--color-green-ink)] hover:bg-[var(--color-green)] hover:text-white focus-visible:ring-[var(--color-green)]'
        }`}
      >
        <span>{isEn ? 'Explore package' : 'استعرض الباقة'}</span>
        <DirArrow className="h-4 w-4" aria-hidden="true" />
      </button>
    </article>
  );
}

function HomeCelebimPackages({
  commissionSettings,
  onNavigate,
}: {
  commissionSettings?: CommissionSettings | null;
  onNavigate: (page: PageView) => void;
}) {
  const { dir, isEn } = useI18n();
  const [isYearly, setIsYearly] = useState(false);
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const DirArrow = dir === 'rtl' ? ArrowLeft : ArrowRight;
  const commissionPct = commissionSettings?.commissionRatePercent ?? 1;

  const packages = useMemo<PackageSpec[]>(
    () =>
      isEn
        ? [
            {
              id: 'start',
              name: 'Basic Plan',
              monthlyPriceSar: 0,
              yearlyPriceSar: 0,
              features: [
                'Unlimited standard livestock listings',
                'Add photos & videos per listing',
                'Direct WhatsApp, phone & in-app messaging',
                'Full dashboard & listing management',
                `${commissionPct}% commission only upon completed sale`,
                'Standard search & filter visibility',
              ],
            },
            {
              id: 'featured',
              name: 'Featured Listing Plan',
              highlighted: true,
              badgeText: 'POPULAR',
              monthlyPriceSar: 99,
              yearlyPriceSar: 79,
              features: [
                'Priority top placement in search results',
                'Distinct Featured badge on listings',
                'Expanded gallery & video showcase',
                'Listing views & buyer interest analytics',
                'Priority moderation review & dedicated support',
                'Instant visibility boost across categories',
              ],
            },
            {
              id: 'merchant',
              name: 'Breeder & Ranch Plan',
              monthlyPriceSar: 299,
              yearlyPriceSar: 239,
              features: [
                'Verified Breeder & Ranch trust badge',
                'Full priority across search & home showcase',
                'Comprehensive ranch performance analytics',
                'Multi-lot & seasonal flock management',
                'Dedicated 24/7 support & fast settlement tracking',
                'Direct buyer alerts for new herd drops',
              ],
            },
          ]
        : [
            {
              id: 'start',
              name: 'الباقة الأساسية',
              monthlyPriceSar: 0,
              yearlyPriceSar: 0,
              features: [
                'نشر غير محدود للإعلانات الأساسية',
                'إضافة صور وفيديو توضيحي للحلال',
                'تواصل مباشر عبر الواتساب والاتصال والرسائل',
                'لوحة تحكم كاملة لإدارة الإعلانات والعروض',
                `عمولة ${commissionPct}% فقط عند إتمام البيع الفعلي`,
                'ظهور قياسي في نتائج البحث والتصنيفات',
              ],
            },
            {
              id: 'featured',
              name: 'باقة الإعلان المميز',
              highlighted: true,
              badgeText: 'الأكثر طلباً',
              monthlyPriceSar: 99,
              yearlyPriceSar: 79,
              features: [
                'ظهور في مقدمة نتائج البحث والقوائم',
                'شارة التمييز الخاصة لجذب المشترين أسرع',
                'مساحة أكبر للصور والفيديوهات التوضيحية',
                'إحصائيات المشاهدات ومؤشرات الاهتمام',
                'أولوية في المراجعة ودعم فني مخصص',
                'وصول مضاعف للمهتمين بنفس السلالة والمنطقة',
              ],
            },
            {
              id: 'merchant',
              name: 'باقة التاجر والمربي',
              monthlyPriceSar: 299,
              yearlyPriceSar: 239,
              features: [
                'توثيق وإبراز المراح بشارة المربي الموثق',
                'أولوية شاملة في البحث والصفحة الرئيسية',
                'تحليلات أداء متقدمة للقطيع والمبيعات',
                'إدارة منظمة للدفعات والعروض المتعددة',
                'دعم مخصص 24/7 ومتابعة سريعة للطلبات',
                'وصول أسرع لتجار الجملة والمشترين الدائمين',
              ],
            },
          ],
    [isEn, commissionPct]
  );

  useEffect(() => {
    const container = sliderRef.current;
    const target = container?.querySelector('[data-package-type="featured"]') as HTMLElement | null;
    if (!container || !target) return;
    const raf = requestAnimationFrame(() => {
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      container.scrollLeft +=
        targetRect.left - containerRect.left - (containerRect.width - targetRect.width) / 2;
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section
      className="py-10 sm:py-20"
      aria-labelledby="celebim-packages-heading"
    >
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-col items-center gap-3 text-center sm:mb-9 sm:flex-row sm:items-end sm:justify-between sm:gap-4 sm:text-start">
          <div>
            <p className="text-[11px] font-extrabold tracking-[0.14em] text-[var(--color-gold-hover)] dark:text-[var(--color-gold)]">
              {isEn ? 'SOUQ AL-GHANAM PACKAGES' : 'باقات سوق الغنم'}
            </p>
            <h2
              id="celebim-packages-heading"
              className="mt-2 font-display text-[26px] font-black leading-[1.14] tracking-tight text-[var(--color-ink)] sm:mt-3 sm:text-[42px]"
            >
              {isEn ? 'Choose the right plan for your listings.' : 'اختر الباقة المناسبة لإعلاناتك.'}
            </h2>
            <p className="mx-auto mt-2 max-w-[620px] text-[13px] leading-6 text-[var(--color-muted)] sm:mx-0 sm:text-[14px]">
              {isEn
                ? 'From free individual listings to verified ranches, choose the visibility capacity that fits your herd.'
                : 'من البداية المجانية إلى أصحاب المراحات والمزارع، حدّد مستوى الظهور والمزايا حسب احتياجك.'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('pricing')}
            className="inline-flex shrink-0 items-center gap-2 text-[13px] font-extrabold text-[var(--color-green-ink)] hover:underline cursor-pointer"
          >
            <span>{isEn ? 'Compare all plan features' : 'مقارنة جميع الباقات والمزايا'}</span>
            <DirArrow className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Billing Period Pill */}
        <div
          className="mx-auto mb-5 flex w-fit rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1 sm:mx-0 sm:mb-8"
          role="group"
          aria-label={isEn ? 'Billing cycle' : 'دورة الدفع'}
        >
          <button
            type="button"
            aria-pressed={!isYearly}
            onClick={() => setIsYearly(false)}
            className={`rounded-full px-5 py-2 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)] cursor-pointer ${
              !isYearly
                ? 'bg-[var(--color-green)] text-white'
                : 'text-[var(--color-muted)] hover:text-[var(--color-green-ink)]'
            }`}
          >
            {isEn ? 'Monthly' : 'شهري'}
          </button>
          <button
            type="button"
            aria-pressed={isYearly}
            onClick={() => setIsYearly(true)}
            className={`rounded-full px-5 py-2 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)] cursor-pointer ${
              isYearly
                ? 'bg-[var(--color-green)] text-white'
                : 'text-[var(--color-muted)] hover:text-[var(--color-green-ink)]'
            }`}
          >
            {isEn ? 'Yearly (Save 20%)' : 'سنوي (وفر ٢٠%)'}
          </button>
        </div>

        {/* Mobile Snap Slider */}
        <div
          ref={sliderRef}
          tabIndex={0}
          role="region"
          aria-label={isEn ? 'Swipe to compare packages' : 'اسحب للمقارنة بين الباقات'}
          className="-mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-[9vw] pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:hidden"
        >
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              data-package-type={pkg.id}
              className="w-[82vw] min-w-[280px] max-w-[340px] shrink-0 snap-center"
            >
              <HomeCelebimPackageCard pkg={pkg} isYearly={isYearly} onNavigate={onNavigate} />
            </div>
          ))}
        </div>

        {/* Desktop 3-Column Grid */}
        <div className="hidden items-start gap-4 sm:grid lg:grid-cols-3">
          {packages.map((pkg) => (
            <HomeCelebimPackageCard
              key={pkg.id}
              pkg={pkg}
              isYearly={isYearly}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   SECTION 6 (Celebim Section 5): Seller CTA Strip (Satıcılar için)
   ========================================================================= */
function HomeCelebimSellerCta({ onNavigate }: { onNavigate: (page: PageView) => void }) {
  const { dir, isEn } = useI18n();
  const DirArrow = dir === 'rtl' ? ArrowLeft : ArrowRight;

  return (
    <section className="py-10 sm:py-14">
      <div className="mx-auto flex max-w-[1280px] flex-col items-center gap-4 px-4 text-center sm:items-stretch sm:gap-6 sm:px-6 sm:text-start lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>
          <span className="text-[11px] font-extrabold tracking-[0.14em] text-[var(--color-gold-hover)] dark:text-[var(--color-gold)]">
            {isEn ? 'FOR SELLERS & BREEDERS' : 'للمربين والبائعين'}
          </span>
          <h2 className="mt-2 font-display text-[26px] font-black leading-[1.14] tracking-tight text-[var(--color-ink)] sm:mt-3 sm:text-[42px]">
            {isEn ? 'Ready to list your livestock for sale?' : 'هل ترغب في عرض حلالك للبيع؟'}
          </h2>
          <p className="mx-auto mt-2 max-w-[590px] text-[13px] leading-6 text-[var(--color-muted)] sm:mx-0 sm:text-[14px]">
            {isEn
              ? 'Add your livestock details and photos in minutes so interested buyers can review your listing and contact you directly.'
              : 'أضف تفاصيل الحلال وصوره خلال دقائق، ليتصفح المشترون المهتمون إعلانك ويتواصلوا معك مباشرة.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('add')}
          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-[10px] bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] px-6 text-[14px] font-bold text-white transition-all hover:shadow-lg cursor-pointer"
        >
          <span>{isEn ? 'Post Listing' : 'أضف إعلانك'}</span>
          <DirArrow className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

/* =========================================================================
   SECTION 7 (Celebim Section 6): Testimonials Carousel / Grid
   ========================================================================= */
interface TestimonialItem {
  id: number;
  resultNum: string;
  resultDesc: ReactNode;
  quote: ReactNode;
  initials: string;
  name: string;
  meta: string;
}

function HomeCelebimTestimonials() {
  const { dir, isEn } = useI18n();
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);

  const items = useMemo<TestimonialItem[]>(
    () =>
      isEn
        ? [
            {
              id: 1,
              resultNum: '12 Heads',
              resultDesc: (
                <>
                  Sold Naimi sheep within 4 days through{' '}
                  <strong className="font-bold text-[var(--color-ink)]">direct negotiation</strong>
                </>
              ),
              quote: (
                <>
                  “I checked breeders from Al-Qassim directly from Riyadh.{' '}
                  <strong className="font-bold not-italic text-[var(--color-ink)]">
                    Clear photos, weights, and vaccination records
                  </strong>{' '}
                  made buying stress-free and the flock arrived just as described.”
                </>
              ),
              initials: 'FC',
              name: 'Fahad Al-Otaibi',
              meta: 'Livestock Breeder · Riyadh · Member for 1 year',
            },
            {
              id: 2,
              resultNum: '7 Offers',
              resultDesc: (
                <>
                  Received inquiries in the first week and{' '}
                  <strong className="font-bold text-[var(--color-ink)]">closed at top price</strong>
                </>
              ),
              quote: (
                <>
                  “Instead of hauling Najdi rams to the weekend market, I listed them here.{' '}
                  <strong className="font-bold not-italic text-[var(--color-ink)]">
                    7 serious offers came in 10 days
                  </strong>{' '}
                  and I sold directly from the ranch.”
                </>
              ),
              initials: 'SQ',
              name: 'Saud Al-Qahtani',
              meta: 'Sheep Producer · Al-Qassim · Member for 9 months',
            },
            {
              id: 3,
              resultNum: '+18%',
              resultDesc: (
                <>
                  Better margin achieved compared to{' '}
                  <strong className="font-bold text-[var(--color-ink)]">traditional middlemen</strong>
                </>
              ),
              quote: (
                <>
                  “Shipped Harri lambs from Taif to Jeddah.{' '}
                  <strong className="font-bold not-italic text-[var(--color-ink)]">
                    Direct buyer contact saved time and hauling costs
                  </strong>{' '}
                  and gave me better value per head.”
                </>
              ),
              initials: 'MH',
              name: 'Majed Al-Harbi',
              meta: 'Herd Owner · Taif · Member for 2 years',
            },
          ]
        : [
            {
              id: 1,
              resultNum: '١٢ رأس نعيمي',
              resultDesc: (
                <>
                  تم شراؤها من القصيم خلال ٤ أيام عبر{' '}
                  <strong className="font-bold text-[var(--color-ink)]">تواصل مباشر</strong> وواضح
                </>
              ),
              quote: (
                <>
                  «كنت متردداً في الشراء من منطقة أخرى، لكن{' '}
                  <strong className="font-bold not-italic text-[var(--color-ink)]">
                    تواصلت مع المربي وشاهدت الصور والأوزان
                  </strong>{' '}
                  بالتفصيل، ووصل الحلال مطابقاً تماماً للوصف.»
                </>
              ),
              initials: 'فع',
              name: 'فهد العتيبي',
              meta: 'مربي أغنام · الرياض · عضو منذ سنة',
            },
            {
              id: 2,
              resultNum: '٧ عروض',
              resultDesc: (
                <>
                  وصلت للإعلان خلال ١٠ أيام وتم البيع{' '}
                  <strong className="font-bold text-[var(--color-ink)]">بأفضل سعر</strong> من المراح
                </>
              ),
              quote: (
                <>
                  «بدل تحميل النجديات ونقلها للسوق، عرضتها في سوق الغنم كتجربة.{' '}
                  <strong className="font-bold not-italic text-[var(--color-ink)]">
                    وصلني ٧ عروض جادة خلال ١٠ أيام
                  </strong>{' '}
                  وبعت بسعر أفضل من السوق.»
                </>
              ),
              initials: 'سق',
              name: 'سعود القحطاني',
              meta: 'منتج حلال · القصيم · عضو منذ ٩ أشهر',
            },
            {
              id: 3,
              resultNum: '+١٨%',
              resultDesc: (
                <>
                  عائد أفضل مقارنة بالبيع{' '}
                  <strong className="font-bold text-[var(--color-ink)]">عبر الوسطاء التقليديين</strong>
                </>
              ),
              quote: (
                <>
                  «بعت طليان حري من الطائف لمشترٍ في جدة.{' '}
                  <strong className="font-bold not-italic text-[var(--color-ink)]">
                    المشتري نسّق النقل بنفسه
                  </strong>{' '}
                  وأنا اكتفيت بنشر الإعلان، والنتيجة عائد أعلى وتعب أقل.»
                </>
              ),
              initials: 'مح',
              name: 'ماجد الحربي',
              meta: 'صاحب مراح · الطائف · عضو منذ سنتين',
            },
          ],
    [isEn]
  );

  const handleScroll = () => {
    const el = sliderRef.current;
    if (!el || el.clientWidth === 0) return;
    const cardWidth = el.scrollWidth / items.length;
    if (cardWidth <= 0) return;
    const rawIndex = Math.round(Math.abs(el.scrollLeft) / cardWidth);
    setActiveSlide(Math.max(0, Math.min(items.length - 1, rawIndex)));
  };

  const scrollToSlide = (nextIdx: number) => {
    const el = sliderRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(items.length - 1, nextIdx));
    const card = el.children[clamped] as HTMLElement | undefined;
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    }
    setActiveSlide(clamped);
  };

  return (
    <section
      aria-labelledby="celebim-testimonials-heading"
      className="py-10 sm:py-20"
    >
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <div className="mb-7 text-center sm:mb-9 sm:text-start">
          <span className="text-[11px] font-extrabold tracking-[0.14em] text-[var(--color-gold-hover)] dark:text-[var(--color-gold)]">
            {isEn ? 'USER REVIEWS' : 'تجارب المستخدمين'}
          </span>
          <h2
            id="celebim-testimonials-heading"
            className="mt-2 font-display text-[26px] font-black leading-[1.14] tracking-tight text-[var(--color-ink)] sm:mt-3 sm:text-[42px]"
          >
            {isEn ? 'Real Results from Real Breeders' : 'نتائج حقيقية من مربي الحلال'}
          </h2>
          <p className="mt-2 text-[13px] leading-6 text-[var(--color-muted)] sm:text-[14px]">
            {isEn
              ? 'Experiences from breeders and buyers using Souq Al-Ghanam'
              : 'تجارب المربين والمشترين في منصة سوق الغنم 2.0'}
          </p>
        </div>

        <div
          ref={sliderRef}
          id="celebim-testimonials-slider"
          role="region"
          aria-roledescription="carousel"
          aria-label={
            isEn ? 'User testimonials; swipeable on mobile' : 'آراء المستخدمين؛ قابلة للتمرير على الجوال'
          }
          tabIndex={0}
          onScroll={handleScroll}
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3"
        >
          {items.map((item) => (
            <article
              key={item.id}
              className="flex min-w-[84vw] snap-start flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-colors duration-200 hover:border-[var(--color-green)] dark:hover:border-[var(--color-gold)] sm:min-w-0 sm:p-6"
            >
              <div className="mb-4 flex items-center gap-1" aria-label="5 / 5">
                {[0, 1, 2, 3, 4].map((star) => (
                  <Star
                    key={star}
                    className="h-4 w-4 fill-[var(--color-gold)] text-[var(--color-gold)]"
                    aria-hidden="true"
                  />
                ))}
              </div>

              <div className="mb-5 flex items-center gap-3 rounded-xl border border-[var(--color-green)]/20 dark:border-[var(--color-gold)]/25 bg-[var(--color-green)]/[0.04] dark:bg-[var(--color-gold)]/[0.06] p-3">
                <div className="shrink-0 font-display text-[19px] font-black text-[var(--color-green-ink)] tabular-nums">
                  {item.resultNum}
                </div>
                <div className="text-[12px] leading-[1.35] text-[var(--color-muted)]">
                  {item.resultDesc}
                </div>
              </div>

              <p className="mb-5 text-[14px] italic leading-[1.7] text-[var(--color-ink)]/90">
                {item.quote}
              </p>

              <div className="mt-auto flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-green)]/12 text-[13px] font-extrabold text-[var(--color-green-ink)]">
                  {item.initials}
                </div>
                <div>
                  <div className="text-[14px] font-bold text-[var(--color-ink)]">{item.name}</div>
                  <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">{item.meta}</div>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* Mobile Slider Controls */}
        <div
          className="mt-4 flex items-center justify-center gap-4 sm:hidden"
          role="group"
          aria-label={isEn ? 'Testimonials navigation' : 'التنقل بين الآراء'}
        >
          <button
            type="button"
            disabled={activeSlide === 0}
            onClick={() => scrollToSlide(activeSlide - 1)}
            aria-label={isEn ? 'Previous review' : 'الرأي السابق'}
            aria-controls="celebim-testimonials-slider"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] transition-colors hover:border-[var(--color-green)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)] cursor-pointer"
          >
            {dir === 'rtl' ? (
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            )}
          </button>

          <span
            className="min-w-12 text-center text-[13px] font-bold text-[var(--color-ink)] tabular-nums"
            aria-live="polite"
          >
            {activeSlide + 1} / {items.length}
          </span>

          <button
            type="button"
            disabled={activeSlide === items.length - 1}
            onClick={() => scrollToSlide(activeSlide + 1)}
            aria-label={isEn ? 'Next review' : 'الرأي التالي'}
            aria-controls="celebim-testimonials-slider"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] transition-colors hover:border-[var(--color-green)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)] cursor-pointer"
          >
            {dir === 'rtl' ? (
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   SECTION 8 (Celebim Section 7): Editorial 2-Column Numbered FAQ
   ========================================================================= */
function HomeCelebimFaq({ onNavigate }: { onNavigate: (page: PageView) => void }) {
  const { isEn } = useI18n();

  const faqs = useMemo(
    () =>
      isEn
        ? [
            {
              num: '01',
              q: 'What is Souq Al-Ghanam 2.0?',
              a: 'Souq Al-Ghanam 2.0 is a dedicated Saudi digital marketplace connecting livestock buyers with individual breeders and verified ranches. Users can filter listings by breed and region, publish listings, and communicate directly.',
            },
            {
              num: '02',
              q: 'What types of livestock can be listed?',
              a: 'You can list Naimi, Najdi, Harri, Ardhi, Sawakni, and other approved sheep and goat breeds. Adding accurate breed, age, weight, head count, and region details helps serious buyers find your livestock quickly.',
            },
            {
              num: '03',
              q: 'Do I need an account to browse listings?',
              a: 'Published listings can be browsed freely without registering. Creating a free account unlocks posting listings, saving favorites, sending direct offers, and managing inquiries.',
            },
            {
              num: '04',
              q: 'How can I contact a seller?',
              a: 'On any listing detail page, you can use the seller’s available contact options including direct phone, WhatsApp, or platform messaging. Always verify livestock records and details before finalizing.',
            },
            {
              num: '05',
              q: 'Does Souq Al-Ghanam handle payment or transport?',
              a: 'Souq Al-Ghanam is a direct marketplace platform; inspection, negotiation, payment, and transport take place directly between buyer and seller, with a transparent 1% fee settled upon completed sale.',
            },
            {
              num: '06',
              q: 'How can I compare livestock prices?',
              a: 'You can compare listings by region, breed, age, and estimated weight, and review indicative seasonal price ranges in the Breeds & Prices guide.',
            },
          ]
        : [
            {
              num: '01',
              q: 'ما هو سوق الغنم 2.0؟',
              a: 'سوق الغنم 2.0 هو منصة سعودية متخصصة تربط مشتري المواشي والأغنام بالمربين والأفراد والمنشآت مباشرة؛ حيث يمكنك تصفية الإعلانات حسب السلالة والمنطقة، نشر إعلانك، والتواصل مع البائعين بكل وضوح.',
            },
            {
              num: '02',
              q: 'ما أنواع الحلال التي يمكن عرضها في المنصة؟',
              a: 'يمكن عرض أغنام وماعز السلالات المعتمدة مثل النعيمي، النجدي، الحري، العارضي، والسواكني وغيرها. كلما كانت بيانات السلالة والعمر والوزن والمنطقة دقيقة، وصل إعلانك للمشترين الجادين أسرع.',
            },
            {
              num: '03',
              q: 'هل يلزم إنشاء حساب لتصفح الإعلانات؟',
              a: 'يمكنك تصفح جميع الإعلانات المنشورة ومشاهدة التفاصيل مجاناً دون تسجيل. أما إضافة الإعلانات وحفظ المفضلة وإرسال الرسائل أو العروض فتتطلب تسجيل الدخول.',
            },
            {
              num: '04',
              q: 'كيف يمكنني التواصل مع البائع أو المربي؟',
              a: 'من خلال صفحة الإعلان ستجد خيارات التواصل المتاحة مثل الاتصال المباشر، واتساب، أو الرسائل الفورية داخل المنصة، ويُنصح بمعاينة الحلال والتحقق من بياناته قبل إتمام الشراء.',
            },
            {
              num: '05',
              q: 'هل يتدخل سوق الغنم في الدفع أو تسليم الحلال؟',
              a: 'سوق الغنم منصة وساطة وإعلانات رقمية؛ تتم المعاينة والاتفاق والدفع والنقل مباشرة بين المشتري والبائع، وتُحتسب عمولة المنصة البالغة ١% بعد إتمام البيع الفعلي فقط.',
            },
            {
              num: '06',
              q: 'كيف أقارن أسعار الحلال حسب السلالة والمنطقة؟',
              a: 'يمكنك فلترة الإعلانات حسب المنطقة والسلالة والعمر والوزن والاطلاع على الأسعار الاسترشادية للسلالات لمقارنة متوسط الأسعار واتخاذ قرار شراء مدروس.',
            },
          ],
    [isEn]
  );

  return (
    <section
      id="sikca-sorulan-sorular"
      aria-labelledby="celebim-faq-heading"
      className="py-10 sm:py-20"
    >
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-16 xl:gap-24">
          {/* Left / Start Editorial Heading Column */}
          <div className="lg:pt-1">
            <div className="mb-3 flex items-center justify-center gap-3 sm:justify-start">
              <span className="text-[11px] font-extrabold tracking-[0.16em] text-[var(--color-gold-hover)] dark:text-[var(--color-gold)]">
                {isEn ? 'FREQUENTLY ASKED' : 'استفسارات متكررة'}
              </span>
            </div>

            <h2
              id="celebim-faq-heading"
              className="mx-auto max-w-md text-center font-display text-[26px] font-black leading-[1.14] tracking-tight text-[var(--color-ink)] sm:mx-0 sm:text-start sm:text-[42px]"
            >
              {isEn ? 'Frequently Asked Questions' : 'الأسئلة الشائعة حول سوق الغنم'}
            </h2>

            <p className="mx-auto mt-5 max-w-md text-center text-[13px] leading-6 text-[var(--color-muted)] sm:mx-0 sm:text-start sm:text-[15px] sm:leading-7">
              {isEn
                ? 'Clear answers on browsing livestock listings, posting your herd, and contacting breeders directly.'
                : 'إجابات واضحة حول تصفح إعلانات المواشي، نشر إعلانك، والتواصل المباشر مع المربين والبائعين.'}
            </p>

            <div className="mt-8 border-s-2 border-[var(--color-green)] dark:border-[var(--color-gold)] ps-4">
              <p className="text-[13px] leading-6 text-[var(--color-muted)]">
                {isEn ? 'Didn’t find your answer here?' : 'لم تجد الإجابة التي تبحث عنها؟'}
              </p>
              <button
                type="button"
                onClick={() => onNavigate('contact')}
                className="mt-1 inline-flex items-center gap-1.5 text-[14px] font-bold text-[var(--color-green-ink)] underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-green)] cursor-pointer"
              >
                <span>{isEn ? 'Contact us' : 'تواصل معنا'}</span>
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Right / End Accordion Column */}
          <div className="border-t border-[var(--color-border)]">
            {faqs.map((faq) => (
              <details key={faq.num} className="group border-b border-[var(--color-border)]">
                <summary className="flex cursor-pointer list-none items-start gap-4 py-5 text-start marker:hidden focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-green)] sm:gap-5 sm:py-6 [&::-webkit-details-marker]:hidden">
                  <span
                    aria-hidden="true"
                    className="mt-1 shrink-0 font-mono text-[12px] font-bold tabular-nums tracking-wide text-[var(--color-gold-hover)] dark:text-[var(--color-gold)]"
                  >
                    {faq.num}
                  </span>
                  <span className="flex-1 font-display text-[15px] font-bold leading-6 text-[var(--color-ink)] transition-colors group-hover:text-[var(--color-green-ink)] sm:text-[17px]">
                    {faq.q}
                  </span>
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-green-ink)] transition-colors group-open:border-[var(--color-green)] group-open:bg-[var(--color-green)] group-open:text-white"
                  >
                    <span className="relative block h-3 w-3 transition-transform duration-200 group-open:rotate-45">
                      <span className="absolute inset-x-0 top-1/2 h-[1.5px] -translate-y-1/2 bg-current" />
                      <span className="absolute inset-y-0 left-1/2 w-[1.5px] -translate-x-1/2 bg-current" />
                    </span>
                  </span>
                </summary>
                <p className="pb-6 ps-9 pe-10 text-[14px] leading-7 text-[var(--color-muted)] sm:ps-10 sm:pe-14">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
