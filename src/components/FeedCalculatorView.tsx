import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Minus,
  Plus,
  RotateCcw,
  Wheat,
} from 'lucide-react';
import {
  calculateHerdFeedEstimate,
  FEED_PROGRAM_PROFILES,
  type FeedHerdSpecies,
  type FeedProgramGoal,
} from '../lib/marketplace-tools';
import { formatPriceSar } from '../lib/format';
import { useI18n } from '../lib/i18n';
import type { PageView } from '../lib/router';
import { DynamicHeroBanner } from './DynamicHeroBanner';

interface FeedCalculatorViewProps {
  onNavigate: (page: PageView) => void;
}

export function FeedCalculatorView({ onNavigate }: FeedCalculatorViewProps) {
  const { dir, isEn } = useI18n();
  const DirArrow = isEn ? ArrowRight : ArrowLeft;

  const [species, setSpecies] = useState<FeedHerdSpecies>('sheep');
  const [goal, setGoal] = useState<FeedProgramGoal>('fattening');
  const [headCount, setHeadCount] = useState<number>(50);
  const [days, setDays] = useState<number>(30);
  const [barleySackPriceSar, setBarleySackPriceSar] = useState<number>(68);
  const [alfalfaBalePriceSar, setAlfalfaBalePriceSar] = useState<number>(28);

  const result = useMemo(
    () =>
      calculateHerdFeedEstimate({
        species,
        goal,
        headCount,
        days,
        barleySackPriceSar,
        alfalfaBalePriceSar,
      }),
    [species, goal, headCount, days, barleySackPriceSar, alfalfaBalePriceSar]
  );

  const activeProfile = FEED_PROGRAM_PROFILES[species][goal];

  const handleReset = () => {
    setSpecies('sheep');
    setGoal('fattening');
    setHeadCount(50);
    setDays(30);
    setBarleySackPriceSar(68);
    setAlfalfaBalePriceSar(28);
  };

  return (
    <section dir={dir} className="bg-[var(--color-canvas)] transition-colors">
      <DynamicHeroBanner
        pageKey="feed"
        breadcrumbs={[
          { label: isEn ? 'Home' : 'الرئيسية', onClick: () => onNavigate('home') },
          { label: isEn ? 'Services & Tools' : 'الخدمات والأدوات', onClick: () => onNavigate('services') },
          { label: isEn ? 'Feed & Herd Planner' : 'مخطط الأعلاف والتسمين' },
        ]}
        contextLabel={
          isEn
            ? `${result.headCount} heads · ${result.days} days`
            : `${result.headCount} رأس · ${result.days} يوماً`
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => onNavigate('services')}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#E6B85C] hover:bg-[#F0C670] text-[#0C261B] text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Wheat size={15} aria-hidden="true" />
              <span>{isEn ? 'Request Feed Supply Quote' : 'طلب توريد أعلاف من المزودين'}</span>
              <DirArrow size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-white/35 bg-[#0B2A1E]/80 hover:bg-[#123D2D]/90 text-xs sm:text-sm font-bold text-white inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <RotateCcw size={14} className="text-[#E8BC63]" aria-hidden="true" />
              <span>{isEn ? 'Reset' : 'إعادة التعيين'}</span>
            </button>
          </>
        }
        visual={
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/15">
              <span className="text-xs font-extrabold text-white">
                {isEn ? 'Estimated Period Cost' : 'إجمالي تكلفة الأعلاف'}
              </span>
              <span className="font-display text-lg font-extrabold text-[#F4C569] tabular-nums">
                {formatPriceSar(result.totalCostSar)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-xl bg-white/[0.06] border border-white/15">
                <p className="text-[10px] text-emerald-100/75">
                  {isEn ? 'Monthly Cost / Head' : 'تكلفة الرأس شهرياً'}
                </p>
                <p className="mt-0.5 font-display text-base font-extrabold text-[#F4C569] tabular-nums">
                  {formatPriceSar(result.costPerHeadPerMonthSar)}
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-white/[0.06] border border-white/15">
                <p className="text-[10px] text-emerald-100/75">
                  {isEn ? '50kg Barley Sacks' : 'أكياس الشعير (50 كجم)'}
                </p>
                <p className="mt-0.5 font-display text-base font-extrabold text-white tabular-nums">
                  {result.barleySacksNeeded.toLocaleString('en-US')}
                </p>
              </div>
            </div>
          </div>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Inputs Panel */}
          <div className="lg:col-span-7 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-7 space-y-6">
            <div>
              <h2 className="font-display text-xl font-extrabold text-[var(--color-ink)]">
                {isEn ? 'Herd Size & Nutrition Program' : 'بيانات القطيع وبرنامج التغذية'}
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-[var(--color-muted)]">
                {isEn
                  ? 'Choose species, feeding goal, head count, and adjust local SAR sack & bale rates.'
                  : 'اختر نوع القطيع وهدف التربية واضبط أسعار الشعير والبرسيم السائدة في منطقتك.'}
              </p>
            </div>

            {/* Species Toggle */}
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { id: 'sheep' as const, labelAr: 'أغنام (ضأن: نعيمي / نجدي / حري)', labelEn: 'Sheep Herd' },
                  { id: 'goat' as const, labelAr: 'ماعز (عارضي / شامي)', labelEn: 'Goat Herd' },
                ]
              ).map((sp) => {
                const active = species === sp.id;
                return (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => setSpecies(sp.id)}
                    className={`min-h-[44px] px-4 py-2.5 rounded-xl border text-xs sm:text-sm font-extrabold transition-colors cursor-pointer ${
                      active
                        ? 'bg-[var(--color-green)] text-white border-[var(--color-green)]'
                        : 'bg-[var(--color-canvas)] text-[var(--color-ink)] border-[var(--color-border)] hover:border-[var(--color-gold)]'
                    }`}
                  >
                    {isEn ? sp.labelEn : sp.labelAr}
                  </button>
                );
              })}
            </div>

            {/* Program Goal */}
            <div className="space-y-2">
              <span className="block text-xs font-bold text-[var(--color-ink)]">
                {isEn ? 'Feeding Program Goal' : 'برنامج العلف المطلوب'}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {(Object.keys(FEED_PROGRAM_PROFILES[species]) as FeedProgramGoal[]).map((gKey) => {
                  const prof = FEED_PROGRAM_PROFILES[species][gKey];
                  const active = goal === gKey;
                  return (
                    <button
                      key={gKey}
                      type="button"
                      onClick={() => setGoal(gKey)}
                      className={`p-3 rounded-xl border text-start transition-colors cursor-pointer space-y-1 ${
                        active
                          ? 'bg-[var(--color-green)] text-white border-[var(--color-green)]'
                          : 'bg-[var(--color-canvas)] text-[var(--color-ink)] border-[var(--color-border)] hover:border-[var(--color-gold)]'
                      }`}
                    >
                      <span className="block text-xs font-extrabold">
                        {isEn ? prof.labelEn : prof.labelAr}
                      </span>
                      <span
                        className={`block text-[11px] tabular-nums ${
                          active ? 'text-[#F4C569]' : 'text-[var(--color-muted)]'
                        }`}
                      >
                        {prof.grainKgPerDay} {isEn ? 'kg grain' : 'كجم حبوب'} + {prof.forageKgPerDay}{' '}
                        {isEn ? 'kg hay/day' : 'كجم برسيم'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Head Count + Duration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2 border-t border-[var(--color-border)]">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="feed-heads" className="text-xs font-bold text-[var(--color-ink)]">
                    {isEn ? 'Herd Size (Heads)' : 'عدد الرؤوس'}
                  </label>
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={isEn ? 'Decrease heads' : 'إنقاص الرؤوس'}
                      onClick={() => setHeadCount((h) => Math.max(1, h - 5))}
                      className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] flex items-center justify-center cursor-pointer"
                    >
                      <Minus size={14} aria-hidden="true" />
                    </button>
                    <span className="min-w-[44px] text-center font-display text-sm font-extrabold text-[var(--color-green-ink)] tabular-nums">
                      {headCount}
                    </span>
                    <button
                      type="button"
                      aria-label={isEn ? 'Increase heads' : 'زيادة الرؤوس'}
                      onClick={() => setHeadCount((h) => Math.min(1000, h + 5))}
                      className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] flex items-center justify-center cursor-pointer"
                    >
                      <Plus size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <input
                  id="feed-heads"
                  type="range"
                  min={5}
                  max={500}
                  step={5}
                  value={headCount}
                  onChange={(e) => setHeadCount(Number(e.target.value))}
                  className="w-full accent-[var(--color-green)] cursor-pointer"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="feed-days" className="text-xs font-bold text-[var(--color-ink)]">
                    {isEn ? 'Feeding Period (Days)' : 'مدة الحساب (بالأيام)'}
                  </label>
                  <span className="font-display text-sm font-extrabold text-[var(--color-green-ink)] tabular-nums">
                    {days} {isEn ? 'days' : 'يوماً'}
                  </span>
                </div>
                <input
                  id="feed-days"
                  type="range"
                  min={7}
                  max={180}
                  step={1}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  className="w-full accent-[var(--color-green)] cursor-pointer"
                />
              </div>
            </div>

            {/* Editable Local Prices */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[var(--color-border)]">
              <div>
                <label
                  htmlFor="barley-price"
                  className="block text-xs font-bold text-[var(--color-ink)] mb-1.5"
                >
                  {isEn ? '50kg Barley Sack Price (SAR)' : 'سعر كيس الشعير (50 كجم) بالريال'}
                </label>
                <input
                  id="barley-price"
                  type="number"
                  min={20}
                  max={300}
                  value={barleySackPriceSar}
                  onChange={(e) => setBarleySackPriceSar(Number(e.target.value) || 68)}
                  className="w-full min-h-[42px] px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] text-sm font-bold text-[var(--color-ink)] tabular-nums focus:outline-none focus:border-[var(--color-green-ink)]"
                />
              </div>
              <div>
                <label
                  htmlFor="alfalfa-price"
                  className="block text-xs font-bold text-[var(--color-ink)] mb-1.5"
                >
                  {isEn ? 'Alfalfa Hay Bale Price ~20kg (SAR)' : 'سعر بالة البرسيم (~20 كجم) بالريال'}
                </label>
                <input
                  id="alfalfa-price"
                  type="number"
                  min={10}
                  max={200}
                  value={alfalfaBalePriceSar}
                  onChange={(e) => setAlfalfaBalePriceSar(Number(e.target.value) || 28)}
                  className="w-full min-h-[42px] px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] text-sm font-bold text-[var(--color-ink)] tabular-nums focus:outline-none focus:border-[var(--color-green-ink)]"
                />
              </div>
            </div>
          </div>

          {/* Breakdown Panel */}
          <aside className="lg:col-span-5 space-y-5">
            <div className="rounded-2xl bg-[#103C2C] text-white p-6 sm:p-7 space-y-5 shadow-md">
              <div className="flex items-start justify-between gap-3 pb-4 border-b border-white/15">
                <div>
                  <p className="text-xs font-bold text-[#F4C569]">
                    {isEn ? activeProfile.labelEn : activeProfile.labelAr}
                  </p>
                  <p className="mt-1 font-display text-3xl font-extrabold tabular-nums">
                    {formatPriceSar(result.totalCostSar)}
                  </p>
                  <p className="mt-1 text-xs text-emerald-100/80 tabular-nums">
                    {isEn
                      ? `For ${result.headCount} heads over ${result.days} days`
                      : `لعدد ${result.headCount} رأس لمدة ${result.days} يوماً`}
                  </p>
                </div>
                <span className="w-11 h-11 rounded-xl bg-[#F4C569]/15 text-[#F4C569] flex items-center justify-center shrink-0">
                  <Wheat size={22} aria-hidden="true" />
                </span>
              </div>

              <dl className="space-y-3 text-sm tabular-nums">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-emerald-100/80">
                    {isEn ? 'Total grain needed' : 'كمية الشعير / الحبوب الكلية'}
                  </dt>
                  <dd className="font-bold">
                    {result.totalGrainKg.toLocaleString('en-US')} {isEn ? 'kg' : 'كجم'} (
                    {result.barleySacksNeeded} {isEn ? 'sacks' : 'كيس'})
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-emerald-100/80">
                    {isEn ? 'Total forage / alfalfa hay' : 'كمية البرسيم والأعلاف المالئة'}
                  </dt>
                  <dd className="font-bold">
                    {result.totalForageKg.toLocaleString('en-US')} {isEn ? 'kg' : 'كجم'} (
                    {result.alfalfaBalesNeeded} {isEn ? 'bales' : 'بالة'})
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-emerald-100/80">
                    {isEn ? 'Minerals, salt & supplements' : 'أملاح وفيتامينات ومكملات'}
                  </dt>
                  <dd className="font-bold">{formatPriceSar(result.mineralsAndWaterCostSar)}</dd>
                </div>
                <div className="pt-3 border-t border-white/15 flex items-center justify-between gap-2">
                  <dt className="font-bold text-[#F4C569]">
                    {isEn ? 'Cost / Head (30-Day Rate)' : 'تكلفة الرأس الواحد شهرياً (30 يوم)'}
                  </dt>
                  <dd className="font-display text-lg font-extrabold text-[#F4C569]">
                    {formatPriceSar(result.costPerHeadPerMonthSar)}
                  </dd>
                </div>
              </dl>

              <button
                type="button"
                onClick={() => onNavigate('services')}
                className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-[#F4C569] hover:bg-[#ffd582] text-[#0C261B] font-extrabold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>{isEn ? 'Order Feed & Farm Supplies' : 'اطلب خدمة توريد أعلاف لمراحك'}</span>
                <DirArrow size={15} aria-hidden="true" />
              </button>
            </div>

            <div className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] p-5 space-y-2.5 text-xs text-[var(--color-muted)]">
              <p className="font-display text-sm font-extrabold text-[var(--color-ink)]">
                {isEn ? 'Herd Nutrition Notes' : 'إرشادات تغذية القطيع'}
              </p>
              {[
                isEn
                  ? 'Introduce grain increases gradually over 10–14 days to prevent digestive upset.'
                  : 'تدرّج في رفع كمية الشعير خلال 10–14 يوماً عند بدء التسمين لتفادي التلبك المعوي.',
                isEn
                  ? 'Always keep clean water and mineral salt blocks accessible in shaded pens.'
                  : 'احرص على توفر الماء النظيف وقوالب الأملاح المعدنية باستمرار في مظلات المراح.',
              ].map((tip) => (
                <p key={tip} className="flex items-start gap-2 leading-relaxed">
                  <CheckCircle2
                    size={14}
                    className="text-[var(--color-green-ink)] shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span>{tip}</span>
                </p>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
