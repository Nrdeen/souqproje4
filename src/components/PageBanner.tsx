import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type TouchEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChevronLeft, ChevronRight, Home, Pause, Play } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import {
  HERO_AUTOPLAY_INTERVAL_MS,
  resolveHeroKeyAction,
  resolveHeroSwipeDirection,
  stepHeroSlide,
} from '../lib/hero-slider';
import {
  resolveBannerSlides,
  type PageBannerSlide,
  type PageBannerTheme,
} from '../lib/banner-themes';
import { SafeImage } from './SafeImage';

export type PageBannerVariant =
  | 'emerald-royal'
  | 'night-vault'
  | 'sand-ivory'
  | 'oasis-horizon';

export interface PageBannerBreadcrumb {
  label: string;
  onClick?: () => void;
}

export interface PageBannerStat {
  label: string;
  value: string;
  accent?: boolean;
}

interface PageBannerProps {
  eyebrow: string;
  title: string;
  titleAccent?: string;
  description: string;
  variant?: PageBannerVariant;
  theme?: PageBannerTheme;
  slides?: PageBannerSlide[];
  breadcrumbs?: PageBannerBreadcrumb[];
  contextLabel?: string;
  stats?: PageBannerStat[];
  actions?: ReactNode;
  visual?: ReactNode;
  interactiveDock?: ReactNode;
  headingId?: string;
  headingAs?: 'h1' | 'h2';
  className?: string;
  compact?: boolean;
}

function detectReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function PageBanner({
  eyebrow,
  title,
  titleAccent,
  description,
  variant = 'emerald-royal',
  theme,
  slides: customSlides,
  breadcrumbs,
  contextLabel,
  stats,
  actions,
  visual,
  interactiveDock,
  headingId,
  headingAs = 'h1',
  className = '',
  compact = false,
}: PageBannerProps) {
  const { isEn, dir } = useI18n();
  const CrumbSeparator = isEn ? ChevronRight : ChevronLeft;
  const HeadingTag = headingAs;

  const slides = useMemo(
    () => resolveBannerSlides(theme, variant, customSlides),
    [theme, variant, customSlides]
  );
  const totalSlides = slides.length;

  const [activeIndex, setActiveIndex] = useState(0);
  const [cycleNonce, setCycleNonce] = useState(0);
  const [reducedMotion, setReducedMotion] = useState<boolean>(detectReducedMotion);
  const [manualPaused, setManualPaused] = useState<boolean>(detectReducedMotion);
  const [hoverPaused, setHoverPaused] = useState<boolean>(false);
  const [focusPaused, setFocusPaused] = useState<boolean>(false);
  const [tabHidden, setTabHidden] = useState<boolean>(
    typeof document !== 'undefined' ? document.visibilityState === 'hidden' : false
  );
  const [loadedSlides, setLoadedSlides] = useState<Set<number>>(() => new Set([0]));

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const remainingMsRef = useRef<number>(HERO_AUTOPLAY_INTERVAL_MS);
  const timerStartRef = useRef<number | null>(null);

  const safeActiveIndex = totalSlides > 0 ? activeIndex % totalSlides : 0;
  const effectivePaused = manualPaused || hoverPaused || focusPaused || tabHidden;
  const activeSlide = slides[safeActiveIndex] || slides[0];

  // Reset to slide 0 smoothly when slide deck switches
  useEffect(() => {
    setActiveIndex(0);
    setLoadedSlides(new Set([0]));
    remainingMsRef.current = HERO_AUTOPLAY_INTERVAL_MS;
    timerStartRef.current = null;
  }, [slides]);

  // Listen to prefers-reduced-motion changes
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
      if (e.matches) setManualPaused(true);
    };
    setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Pause autoplay when tab is backgrounded
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibilityChange = () => {
      setTabHidden(document.visibilityState === 'hidden');
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // Progressively warm adjacent slides after initial paint
  useEffect(() => {
    if (totalSlides <= 1) return;
    const nextIdx = stepHeroSlide(safeActiveIndex, totalSlides, 'next');
    const prevIdx = stepHeroSlide(safeActiveIndex, totalSlides, 'prev');
    if (loadedSlides.has(safeActiveIndex) && loadedSlides.has(nextIdx) && loadedSlides.has(prevIdx)) {
      return;
    }

    const timers: number[] = [];
    if (!loadedSlides.has(nextIdx)) {
      timers.push(
        window.setTimeout(() => {
          setLoadedSlides((prev) => {
            if (prev.has(nextIdx) && prev.has(safeActiveIndex)) return prev;
            const nextSet = new Set(prev);
            nextSet.add(safeActiveIndex);
            nextSet.add(nextIdx);
            return nextSet;
          });
        }, safeActiveIndex === 0 ? 700 : 120)
      );
    }
    if (!loadedSlides.has(prevIdx)) {
      timers.push(
        window.setTimeout(() => {
          setLoadedSlides((prev) => {
            if (prev.has(prevIdx)) return prev;
            const nextSet = new Set(prev);
            nextSet.add(prevIdx);
            return nextSet;
          });
        }, safeActiveIndex === 0 ? 1200 : 240)
      );
    }

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [loadedSlides, safeActiveIndex, totalSlides]);

  const goToSlide = useCallback(
    (targetIdx: number) => {
      if (totalSlides <= 1) return;
      const normalized = ((targetIdx % totalSlides) + totalSlides) % totalSlides;
      const upcoming = stepHeroSlide(normalized, totalSlides, 'next');
      const previous = stepHeroSlide(normalized, totalSlides, 'prev');
      remainingMsRef.current = HERO_AUTOPLAY_INTERVAL_MS;
      timerStartRef.current = null;
      setLoadedSlides((prev) => {
        if (prev.has(normalized) && prev.has(upcoming) && prev.has(previous)) return prev;
        const nextSet = new Set(prev);
        nextSet.add(normalized);
        nextSet.add(upcoming);
        nextSet.add(previous);
        return nextSet;
      });
      setActiveIndex(normalized);
      setCycleNonce((n) => n + 1);
    },
    [totalSlides]
  );

  const stepSlide = useCallback(
    (direction: 'next' | 'prev') => {
      goToSlide(stepHeroSlide(safeActiveIndex, totalSlides, direction));
    },
    [goToSlide, safeActiveIndex, totalSlides]
  );

  // Synced 7s autoplay timer
  useEffect(() => {
    if (totalSlides <= 1) return;

    if (effectivePaused) {
      if (timerStartRef.current !== null) {
        const elapsed = performance.now() - timerStartRef.current;
        remainingMsRef.current = Math.max(250, remainingMsRef.current - elapsed);
        timerStartRef.current = null;
      }
      return;
    }

    timerStartRef.current = performance.now();
    const timeoutId = window.setTimeout(() => {
      goToSlide(stepHeroSlide(safeActiveIndex, totalSlides, 'next'));
    }, remainingMsRef.current);

    return () => window.clearTimeout(timeoutId);
  }, [cycleNonce, effectivePaused, goToSlide, safeActiveIndex, totalSlides]);

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const targetTag = (e.target as HTMLElement | null)?.tagName;
    if (targetTag === 'INPUT' || targetTag === 'SELECT' || targetTag === 'TEXTAREA') return;
    const action = resolveHeroKeyAction(e.key, dir);
    if (!action) return;
    e.preventDefault();
    if (action === 'first') goToSlide(0);
    else if (action === 'last') goToSlide(totalSlides - 1);
    else stepSlide(action);
  };

  const handleTouchStart = (e: TouchEvent<HTMLElement>) => {
    if (e.touches.length !== 1) return;
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e: TouchEvent<HTMLElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || e.changedTouches.length === 0) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    const swipeDir = resolveHeroSwipeDirection(dx, dy);
    if (swipeDir) stepSlide(swipeDir);
  };

  const hasInteractiveDock = Boolean(interactiveDock);

  // Scrim gradients matched to HeroSearch.tsx: crisp contrast behind text, translucent open view for photography
  const desktopScrimClass = visual
    ? isEn
      ? 'bg-[linear-gradient(to_right,rgba(5,24,16,0.92)_0%,rgba(6,27,18,0.84)_34%,rgba(7,30,20,0.52)_56%,rgba(8,32,22,0.22)_78%,rgba(5,24,16,0.40)_100%)]'
      : 'bg-[linear-gradient(to_left,rgba(5,24,16,0.92)_0%,rgba(6,27,18,0.84)_34%,rgba(7,30,20,0.52)_56%,rgba(8,32,22,0.22)_78%,rgba(5,24,16,0.40)_100%)]'
    : isEn
    ? 'bg-[linear-gradient(to_right,rgba(5,24,16,0.92)_0%,rgba(6,27,18,0.84)_26%,rgba(7,30,20,0.56)_46%,rgba(8,32,22,0.18)_66%,transparent_84%)]'
    : 'bg-[linear-gradient(to_left,rgba(5,24,16,0.92)_0%,rgba(6,27,18,0.84)_26%,rgba(7,30,20,0.56)_46%,rgba(8,32,22,0.18)_66%,transparent_84%)]';

  return (
    <div dir={dir} className={`w-full ${className}`}>
      {/* Full-Width Rectangular Edge-to-Edge Cinematic Saudi Hero Stage (Matches HeroSearch) */}
      <section
        aria-roledescription={totalSlides > 1 ? 'carousel' : undefined}
        aria-label={title}
        onMouseEnter={() => setHoverPaused(true)}
        onMouseLeave={() => setHoverPaused(false)}
        onFocusCapture={(e) => {
          if (e.target instanceof HTMLElement && e.target.matches(':focus-visible')) {
            setFocusPaused(true);
          }
        }}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setFocusPaused(false);
          }
        }}
        onKeyDown={handleKeyDown}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={`relative w-full overflow-hidden bg-[#0E261C] flex flex-col justify-center ${
          compact
            ? 'min-h-[340px] sm:min-h-[385px] lg:min-h-[415px]'
            : 'min-h-[400px] sm:min-h-[445px] lg:min-h-[480px]'
        }`}
      >
        {/* Multi-Slide Full-Bleed Photography Layer with 900ms Crossfade & Ken Burns */}
        <div className="absolute inset-0">
          {slides.map((slide, idx) => {
            const isActive = idx === safeActiveIndex;
            const shouldLoad = loadedSlides.has(idx);
            const kenBurnsActive = isActive && !reducedMotion;

            return (
              <div
                key={slide.id}
                aria-hidden={!isActive}
                className={`absolute inset-0 transition-opacity duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isActive ? 'opacity-100 z-[1]' : 'opacity-0 z-0 pointer-events-none'
                }`}
              >
                {shouldLoad && (
                  <SafeImage
                    src={slide.imageSrc}
                    alt={isEn ? slide.imageAltEn : slide.imageAltAr}
                    width={slide.imageWidth}
                    height={slide.imageHeight}
                    loading="eager"
                    decoding={idx === 0 ? 'sync' : 'async'}
                    fetchPriority={idx === 0 ? 'high' : 'low'}
                    className={`w-full h-full object-cover ${slide.objectPositionClass} ${
                      kenBurnsActive ? 'hero-ken-burns-active' : ''
                    }`}
                  />
                )}
              </div>
            );
          })}

          {/* Localized Directional Dark-Emerald Scrim Overlay */}
          <div
            aria-hidden="true"
            className={`hidden sm:block absolute inset-0 z-[2] pointer-events-none ${desktopScrimClass}`}
          />
          <div
            aria-hidden="true"
            className="hidden sm:block absolute inset-x-0 bottom-0 h-20 z-[2] pointer-events-none bg-gradient-to-t from-[#061B12]/55 to-transparent"
          />
          <div
            aria-hidden="true"
            className="sm:hidden absolute inset-0 z-[2] pointer-events-none bg-[linear-gradient(to_top,rgba(5,24,16,0.96)_0%,rgba(6,27,18,0.88)_44%,rgba(7,30,20,0.52)_72%,rgba(5,24,16,0.40)_100%)]"
          />
        </div>

        {/* Top Gold Precision Hairline Accent */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[2px] z-[3] bg-gradient-to-l from-[#E8BC63]/80 via-[#C79A43]/35 to-transparent pointer-events-none"
        />

        {/* Centered Responsive Container Inside Full-Width Hero Stage */}
        <div
          className={`relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${
            compact
              ? hasInteractiveDock
                ? 'pt-7 pb-12 sm:pt-8 sm:pb-14'
                : 'py-7 sm:py-9'
              : hasInteractiveDock
              ? 'pt-8 pb-12 sm:pt-10 sm:pb-16'
              : 'py-9 sm:py-12'
          }`}
        >
          {/* Breadcrumbs & Regional Context Strip */}
          {(breadcrumbs?.length || contextLabel) && (
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 mb-4 sm:mb-5 border-b border-white/15 text-xs">
              {breadcrumbs && breadcrumbs.length > 0 ? (
                <nav aria-label={isEn ? 'Breadcrumb' : 'مسار الصفحة'}>
                  <ol className="flex flex-wrap items-center gap-1.5 text-emerald-100/80">
                    {breadcrumbs.map((crumb, idx) => {
                      const isLast = idx === breadcrumbs.length - 1;
                      return (
                        <li key={`${crumb.label}-${idx}`} className="inline-flex items-center gap-1.5">
                          {idx > 0 && (
                            <CrumbSeparator
                              size={13}
                              className="text-[#E8BC63]/75 shrink-0"
                              aria-hidden="true"
                            />
                          )}
                          {crumb.onClick && !isLast ? (
                            <button
                              type="button"
                              onClick={crumb.onClick}
                              className="inline-flex items-center gap-1 font-semibold text-emerald-100/85 hover:text-[#E8BC63] transition-colors cursor-pointer"
                            >
                              {idx === 0 && <Home size={12} aria-hidden="true" />}
                              <span>{crumb.label}</span>
                            </button>
                          ) : (
                            <span
                              aria-current={isLast ? 'page' : undefined}
                              className={`inline-flex items-center gap-1 ${
                                isLast ? 'font-bold text-white' : 'font-semibold text-emerald-100/80'
                              }`}
                            >
                              {idx === 0 && <Home size={12} aria-hidden="true" />}
                              <span>{crumb.label}</span>
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </nav>
              ) : (
                <span />
              )}

              {contextLabel && (
                <span className="text-[11px] font-semibold text-[#E8BC63] tabular-nums drop-shadow-[0_1px_6px_rgba(4,18,12,0.85)]">
                  {contextLabel}
                </span>
              )}
            </div>
          )}

          {/* Main Asymmetric Hero Split Stage */}
          <div
            className={
              visual
                ? 'grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center'
                : 'max-w-[34rem]'
            }
          >
            {/* Directional Hero Typography + Actions + Carousel Controls */}
            <div
              className={`${
                visual ? 'lg:col-span-7' : ''
              } flex flex-col justify-between gap-4 sm:gap-5 min-w-0`}
            >
              <div className="space-y-2.5 sm:space-y-3">
                {/* Editorial Eyebrow Rule Matching HeroSearch */}
                <div className="inline-flex items-center gap-2 text-xs sm:text-[13px] font-bold text-[#E8BC63] tracking-wide drop-shadow-[0_1px_8px_rgba(4,18,12,0.9)]">
                  <span className="w-6 h-[2px] bg-[#E8BC63] rounded-full shrink-0" aria-hidden="true" />
                  <span>{eyebrow}</span>
                </div>

                {/* Bold Display Heading */}
                <HeadingTag
                  id={headingId}
                  className="font-display text-2xl sm:text-4xl lg:text-[2.6rem] font-extrabold text-white leading-[1.15] tracking-tight text-start drop-shadow-[0_3px_16px_rgba(4,18,12,0.9)]"
                >
                  <span>{title}</span>
                  {titleAccent && (
                    <>
                      {' '}
                      <span className="text-[#E8BC63]">{titleAccent}</span>
                    </>
                  )}
                </HeadingTag>

                <p className="text-xs sm:text-sm lg:text-[15px] text-white/92 leading-relaxed max-w-xl font-medium drop-shadow-[0_2px_12px_rgba(4,18,12,0.9)]">
                  {description}
                </p>

                {actions && (
                  <div className="pt-1.5 flex flex-wrap items-center gap-2 sm:gap-2.5">
                    {actions}
                  </div>
                )}
              </div>

              {/* Clean Metric Strip */}
              {stats && stats.length > 0 && (
                <dl
                  className={`grid grid-cols-2 ${
                    stats.length >= 4
                      ? 'sm:grid-cols-4'
                      : stats.length === 3
                      ? 'sm:grid-cols-3'
                      : 'sm:grid-cols-2'
                  } gap-3.5 pt-3.5 border-t border-white/15`}
                >
                  {stats.map((stat, idx) => (
                    <div
                      key={`${stat.label}-${idx}`}
                      className={idx > 0 ? 'sm:border-s sm:border-white/15 sm:ps-3.5' : ''}
                    >
                      <dt className="text-[11px] font-semibold text-emerald-100/75 drop-shadow-[0_1px_6px_rgba(4,18,12,0.9)]">
                        {stat.label}
                      </dt>
                      <dd
                        className={`mt-0.5 font-display text-base sm:text-lg font-extrabold tabular-nums drop-shadow-[0_2px_8px_rgba(4,18,12,0.9)] ${
                          stat.accent ? 'text-[#E8BC63]' : 'text-white'
                        }`}
                      >
                        {stat.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {/* Integrated Hero Controls Bar + Thin Gold Progress Line (Matches HeroSearch) */}
              {totalSlides > 1 && (
                <div className="pt-3 border-t border-white/15 flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 max-w-lg">
                  {/* Circular Previous / Next Controls */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => stepSlide('prev')}
                      aria-label={isEn ? 'Previous slide' : 'الشريحة السابقة'}
                      className="w-9 h-9 rounded-full bg-[#082017]/80 hover:bg-[#103C2C] backdrop-blur-xs border border-white/25 hover:border-[#E8BC63]/75 text-white flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8BC63]"
                    >
                      {isEn ? (
                        <ChevronLeft size={16} aria-hidden="true" />
                      ) : (
                        <ChevronRight size={16} aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => stepSlide('next')}
                      aria-label={isEn ? 'Next slide' : 'الشريحة التالية'}
                      className="w-9 h-9 rounded-full bg-[#082017]/80 hover:bg-[#103C2C] backdrop-blur-xs border border-white/25 hover:border-[#E8BC63]/75 text-white flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8BC63]"
                    >
                      {isEn ? (
                        <ChevronRight size={16} aria-hidden="true" />
                      ) : (
                        <ChevronLeft size={16} aria-hidden="true" />
                      )}
                    </button>
                  </div>

                  {/* Clickable Slide Dashes */}
                  <div
                    role="tablist"
                    aria-label={isEn ? 'Select banner slide' : 'اختيار شريحة البانر'}
                    className="flex items-center gap-1 shrink-0"
                  >
                    {slides.map((slide, idx) => {
                      const selected = idx === safeActiveIndex;
                      return (
                        <button
                          key={slide.id}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          aria-label={
                            isEn
                              ? `Slide ${idx + 1}: ${slide.captionEn}`
                              : `الشريحة ${idx + 1}: ${slide.captionAr}`
                          }
                          onClick={() => goToSlide(idx)}
                          className="min-h-[36px] px-0.5 flex items-center cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8BC63] rounded-sm"
                        >
                          <span
                            className={`block h-[3px] rounded-full transition-[width,background-color] duration-300 ${
                              selected ? 'w-7 bg-[#E8BC63]' : 'w-3 bg-white/40 hover:bg-white/75'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>

                  {/* Tabular Slide Counter */}
                  <span
                    aria-hidden="true"
                    dir="ltr"
                    className="hidden min-[380px]:inline-block text-[11px] font-semibold text-white/85 tabular-nums tracking-wider shrink-0"
                  >
                    0{safeActiveIndex + 1} / 0{totalSlides}
                  </span>

                  {/* Subtle Scene Caption */}
                  <span className="hidden md:inline-block text-[11px] font-medium text-emerald-100/80 truncate max-w-[140px]">
                    {isEn ? activeSlide.captionEn : activeSlide.captionAr}
                  </span>

                  {/* Autoplay Gold Progress Line */}
                  <div
                    aria-hidden="true"
                    className="flex-1 min-w-[36px] h-[2px] bg-white/20 rounded-full overflow-hidden"
                  >
                    {reducedMotion && effectivePaused ? (
                      <div className="h-full w-0 bg-[#E8BC63] rounded-full" />
                    ) : (
                      <div
                        key={`${safeActiveIndex}-${cycleNonce}`}
                        style={
                          {
                            '--hero-autoplay-ms': `${HERO_AUTOPLAY_INTERVAL_MS}ms`,
                            animationPlayState: effectivePaused ? 'paused' : 'running',
                          } as CSSProperties
                        }
                        className="h-full w-full bg-[#E8BC63] rounded-full hero-progress-bar"
                      />
                    )}
                  </div>

                  {/* Pause / Play Control */}
                  <button
                    type="button"
                    onClick={() => setManualPaused((prev) => !prev)}
                    aria-pressed={manualPaused}
                    aria-label={
                      manualPaused
                        ? isEn
                          ? 'Resume slide autoplay'
                          : 'تشغيل العرض التلقائي للشرائح'
                        : isEn
                        ? 'Pause slide autoplay'
                        : 'إيقاف العرض التلقائي للشرائح مؤقتاً'
                    }
                    className="w-9 h-9 rounded-full bg-[#082017]/80 hover:bg-[#103C2C] backdrop-blur-xs border border-white/25 hover:border-[#E8BC63]/75 text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8BC63]"
                  >
                    {effectivePaused ? (
                      <Play size={13} aria-hidden="true" />
                    ) : (
                      <Pause size={13} aria-hidden="true" />
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Frosted Emerald Glass Interactive Instrument Stage Floating Over Photography */}
            {visual && (
              <div className="lg:col-span-5 flex flex-col justify-center min-w-0">
                <div className="relative h-full rounded-2xl border border-[#E8BC63]/35 bg-[#061811]/76 hover:border-[#E8BC63]/55 backdrop-blur-md p-4 sm:p-5 flex flex-col justify-between gap-3.5 text-white shadow-[0_22px_50px_-18px_rgba(3,14,10,0.85)] transition-colors duration-300">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-2.5 end-2.5 w-2.5 h-2.5 border-t border-e border-[#E8BC63]/55"
                  />
                  {visual}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* HeroSearch-Style Overlapping Bottom Command Dock */}
      {interactiveDock && (
        <div className="relative z-20 -mt-5 sm:-mt-6 pb-3 sm:pb-4">
          <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8">
            <div className="bg-[#0B261C]/95 backdrop-blur-md rounded-2xl p-3 sm:p-4 border border-[#E8BC63]/35 shadow-[0_18px_40px_-14px_rgba(5,24,16,0.65)] text-white">
              {interactiveDock}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
