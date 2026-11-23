import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Calculator, Scale, Sparkles } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { formatPriceSar } from '../lib/format';
import type { PageView } from '../lib/router';
import { DynamicHeroBanner } from './DynamicHeroBanner';

interface WeightsCalculatorViewProps {
  onNavigate: (page: PageView) => void;
}

interface WeightBreedPreset {
  id: string;
  labelAr: string;
  labelEn: string;
  defaultLiveKg: number;
  minKg: number;
  maxKg: number;
  carcassYieldRatio: number;
  cleanMeatRatio: number;
  defaultPricePerKgSar: number;
}

const WEIGHT_PRESETS: WeightBreedPreset[] = [
  {
    id: 'naimi',
    labelAr: 'نعيمي',
    labelEn: 'Naimi Sheep',
    defaultLiveKg: 50,
    minKg: 25,
    maxKg: 95,
    carcassYieldRatio: 0.48,
    cleanMeatRatio: 0.38,
    defaultPricePerKgSar: 39,
  },
  {
    id: 'najdi',
    labelAr: 'نجدي',
    labelEn: 'Najdi Sheep',
    defaultLiveKg: 55,
    minKg: 28,
    maxKg: 105,
    carcassYieldRatio: 0.47,
    cleanMeatRatio: 0.37,
    defaultPricePerKgSar: 41,
  },
  {
    id: 'harri',
    labelAr: 'حري',
    labelEn: 'Harri Sheep',
    defaultLiveKg: 45,
    minKg: 22,
    maxKg: 85,
    carcassYieldRatio: 0.49,
    cleanMeatRatio: 0.39,
    defaultPricePerKgSar: 38,
  },
  {
    id: 'ardhi',
    labelAr: 'ماعز عارضي',
    labelEn: 'Ardhi Goat',
    defaultLiveKg: 32,
    minKg: 18,
    maxKg: 70,
    carcassYieldRatio: 0.46,
    cleanMeatRatio: 0.36,
    defaultPricePerKgSar: 45,
  },
  {
    id: 'sawakni',
    labelAr: 'سواكني',
    labelEn: 'Sawakni Sheep',
    defaultLiveKg: 48,
    minKg: 25,
    maxKg: 90,
    carcassYieldRatio: 0.47,
    cleanMeatRatio: 0.37,
    defaultPricePerKgSar: 34,
  },
];

export function WeightsCalculatorView({ onNavigate }: WeightsCalculatorViewProps) {
  const { lang, dir, t } = useI18n();
  const [presetId, setPresetId] = useState<string>('naimi');
  const [liveWeightKg, setLiveWeightKg] = useState<number>(50);
  const [headCount, setHeadCount] = useState<number>(2);
  const [pricePerKgSar, setPricePerKgSar] = useState<number>(39);

  const preset = useMemo(
    () => WEIGHT_PRESETS.find((p) => p.id === presetId) ?? WEIGHT_PRESETS[0],
    [presetId]
  );

  const handleSelectPreset = (nextPreset: WeightBreedPreset) => {
    setPresetId(nextPreset.id);
    setLiveWeightKg(nextPreset.defaultLiveKg);
    setPricePerKgSar(nextPreset.defaultPricePerKgSar);
  };

  const results = useMemo(() => {
    const safeWeight = Math.min(200, Math.max(10, Number(liveWeightKg) || preset.defaultLiveKg));
    const safeCount = Math.min(500, Math.max(1, Math.round(Number(headCount) || 1)));
    const safePriceKg = Math.min(500, Math.max(5, Number(pricePerKgSar) || preset.defaultPricePerKgSar));

    const totalLiveKg = safeWeight * safeCount;
    const carcassWeightKg = Math.round(totalLiveKg * preset.carcassYieldRatio * 10) / 10;
    const cleanMeatKg = Math.round(totalLiveKg * preset.cleanMeatRatio * 10) / 10;
    const estValueSar = Math.round(totalLiveKg * safePriceKg);

    return {
      totalLiveKg,
      carcassWeightKg,
      cleanMeatKg,
      estValueSar,
    };
  }, [liveWeightKg, headCount, pricePerKgSar, preset]);

  const getPresetLabel = (item: WeightBreedPreset) => {
    return lang === 'en' ? item.labelEn : item.labelAr;
  };

  const carcassPct = Math.round(preset.carcassYieldRatio * 100);
  const cleanPct = Math.round(preset.cleanMeatRatio * 100);

  return (
    <section
      dir={dir}
      className="bg-[var(--color-canvas)] transition-colors"
      aria-labelledby="weights-calculator-heading"
    >
      <DynamicHeroBanner
        pageKey="weights"
        variant="oasis-horizon"
        headingId="weights-calculator-heading"
        eyebrow={t.toolWeights}
        title={t.weightsTitle}
        subHeadline={t.weightsSubtitle}
        breadcrumbs={[
          { label: lang === 'en' ? 'Home' : 'الرئيسية', onClick: () => onNavigate('home') },
          { label: t.toolWeights },
        ]}
        contextLabel={`${getPresetLabel(preset)} · ${headCount} ${lang === 'en' ? 'heads' : 'رؤوس'}`}
        actions={
          <button
            type="button"
            onClick={() => onNavigate('listings')}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[#F4C569] hover:bg-[#ffd582] text-[#0B231A] text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <span>{lang === 'en' ? 'Browse Listings' : 'تصفح العروض المتاحة'}</span>
            {dir === 'rtl' ? (
              <ArrowLeft size={15} aria-hidden="true" />
            ) : (
              <ArrowRight size={15} aria-hidden="true" />
            )}
          </button>
        }
        visual={
          <div className="flex flex-col justify-between h-full gap-3">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/15">
              <span className="text-xs font-extrabold text-white">
                {lang === 'en' ? 'Live Yield Gauge' : 'مؤشر التصافي والوزن المباشر'}
              </span>
              <span className="font-display text-sm font-extrabold text-[#F4C569] tabular-nums">
                {formatPriceSar(results.estValueSar, lang)}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {WEIGHT_PRESETS.map((item) => {
                const active = item.id === presetId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectPreset(item)}
                    className={`min-h-[28px] px-2 py-0.5 rounded-lg border text-[10px] font-bold transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#F4C569] text-[#0B231A] border-[#F4C569]'
                        : 'bg-white/[0.06] border-white/15 text-emerald-100/85 hover:border-[#F4C569]/60'
                    }`}
                  >
                    {getPresetLabel(item)}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-4">
              {/* SVG Yield Gauge Ring */}
              <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
                <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90" aria-hidden="true">
                  <circle
                    cx="40"
                    cy="40"
                    r="32"
                    fill="none"
                    stroke="rgba(255,255,255,0.12)"
                    strokeWidth="7"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r="32"
                    fill="none"
                    stroke="#F4C569"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={`${Math.round((carcassPct / 100) * 201)} 201`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="font-display text-sm font-extrabold text-[#F4C569] tabular-nums leading-none">
                    {carcassPct}%
                  </span>
                  <span className="text-[9px] text-emerald-100/75 mt-0.5">
                    {lang === 'en' ? 'Yield' : 'تصافي'}
                  </span>
                </div>
              </div>

              <div className="flex-1 min-w-0 space-y-2">
                <div>
                  <div className="flex justify-between text-[11px] font-semibold mb-1 tabular-nums">
                    <span className="text-emerald-100/80">
                      {lang === 'en' ? 'Carcass' : 'وزن الذبيحة'}
                    </span>
                    <span className="font-bold text-white">
                      {results.carcassWeightKg} kg
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/15 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#34D399] transition-all duration-300"
                      style={{ width: `${carcassPct}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] font-semibold mb-1 tabular-nums">
                    <span className="text-emerald-100/80">
                      {lang === 'en' ? 'Clean Meat' : 'اللحم الصافي'}
                    </span>
                    <span className="font-bold text-[#F4C569]">
                      {results.cleanMeatKg} kg ({cleanPct}%)
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/15 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#F4C569] transition-all duration-300"
                      style={{ width: `${cleanPct}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-white/15 flex items-center justify-between text-[11px] tabular-nums">
              <span className="text-emerald-100/75">
                {lang === 'en' ? 'Total Live Weight' : 'إجمالي الوزن الحي'}
              </span>
              <span className="font-extrabold text-white">
                {results.totalLiveKg} kg
              </span>
            </div>
          </div>
        }
        interactiveDock={
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-emerald-100/80 font-semibold">
                {lang === 'en' ? 'Live Weight:' : 'تعديل سريع للوزن:'}
              </span>
              <button
                type="button"
                onClick={() => setLiveWeightKg((w) => Math.max(preset.minKg, w - 5))}
                className="min-h-[32px] px-2.5 py-1 rounded-lg bg-white/[0.08] border border-white/20 hover:border-[#F4C569] text-white font-bold tabular-nums cursor-pointer"
              >
                -5 kg
              </button>
              <span className="px-2 font-display font-extrabold text-[#F4C569] tabular-nums">
                {liveWeightKg} kg
              </span>
              <button
                type="button"
                onClick={() => setLiveWeightKg((w) => Math.min(preset.maxKg, w + 5))}
                className="min-h-[32px] px-2.5 py-1 rounded-lg bg-white/[0.08] border border-white/20 hover:border-[#F4C569] text-white font-bold tabular-nums cursor-pointer"
              >
                +5 kg
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-100/80 font-semibold">
                {lang === 'en' ? 'Heads:' : 'العدد:'}
              </span>
              {[1, 2, 5, 10].map((qty) => (
                <button
                  key={qty}
                  type="button"
                  onClick={() => setHeadCount(qty)}
                  className={`min-h-[30px] px-2.5 py-0.5 rounded-lg border font-bold tabular-nums cursor-pointer transition-colors ${
                    headCount === qty
                      ? 'bg-[#F4C569] text-[#0B231A] border-[#F4C569]'
                      : 'bg-white/[0.06] border-white/15 text-emerald-100/85 hover:border-[#F4C569]/60'
                  }`}
                >
                  {qty}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Controls Card */}
        <div className="lg:col-span-7 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-7 space-y-6">
          <div className="space-y-2.5">
            <span className="block text-xs font-bold text-[var(--color-ink)]">
              {t.weightsSpeciesLabel}
            </span>
            <div className="flex flex-wrap gap-2">
              {WEIGHT_PRESETS.map((item) => {
                const active = item.id === presetId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectPreset(item)}
                    className={`min-h-[40px] px-3.5 py-2 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                      active
                        ? 'bg-[var(--color-green)] text-white border-[var(--color-green)]'
                        : 'bg-[var(--color-canvas)] text-[var(--color-ink)] border-[var(--color-border)] hover:border-[var(--color-gold)]'
                    }`}
                  >
                    {getPresetLabel(item)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="weight-live-kg"
                  className="text-xs font-bold text-[var(--color-ink)]"
                >
                  {t.weightsLiveWeightLabel}
                </label>
                <span className="text-xs font-extrabold text-[var(--color-green-ink)] tabular-nums">
                  {liveWeightKg} kg
                </span>
              </div>
              <input
                id="weight-live-kg"
                type="range"
                min={preset.minKg}
                max={preset.maxKg}
                value={liveWeightKg}
                onChange={(e) => setLiveWeightKg(Number(e.target.value))}
                className="w-full accent-[var(--color-green)] cursor-pointer"
              />
              <input
                type="number"
                min={10}
                max={200}
                value={liveWeightKg}
                onChange={(e) => setLiveWeightKg(Number(e.target.value))}
                aria-label={t.weightsLiveWeightLabel}
                className="w-full h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] text-sm font-bold text-[var(--color-ink)] tabular-nums focus:outline-none focus:border-[var(--color-green-ink)]"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="weight-head-count"
                className="block text-xs font-bold text-[var(--color-ink)]"
              >
                {t.weightsCountLabel}
              </label>
              <input
                id="weight-head-count"
                type="number"
                min={1}
                max={500}
                value={headCount}
                onChange={(e) => setHeadCount(Math.max(1, Number(e.target.value) || 1))}
                className="w-full h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] text-sm font-bold text-[var(--color-ink)] tabular-nums focus:outline-none focus:border-[var(--color-green-ink)]"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label
                htmlFor="weight-price-kg"
                className="block text-xs font-bold text-[var(--color-ink)]"
              >
                {t.weightsPricePerKgLabel}
              </label>
              <input
                id="weight-price-kg"
                type="number"
                min={5}
                max={500}
                value={pricePerKgSar}
                onChange={(e) => setPricePerKgSar(Math.max(5, Number(e.target.value) || 5))}
                className="w-full h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] text-sm font-bold text-[var(--color-ink)] tabular-nums focus:outline-none focus:border-[var(--color-green-ink)]"
              />
            </div>
          </div>
        </div>

        {/* Summary Card */}
        <div className="lg:col-span-5 bg-[var(--color-cream)]/80 rounded-2xl border border-[var(--color-border)] p-5 sm:p-7 space-y-5">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-green-ink)]">
            <Sparkles size={15} className="text-[var(--color-gold)]" aria-hidden="true" />
            <span>{t.weightsResultYieldTitle}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3.5 space-y-1">
              <p className="text-[11px] text-[var(--color-muted)]">{t.weightsResultTotalLiveLabel}</p>
              <p className="font-display text-lg font-extrabold text-[var(--color-ink)] tabular-nums">
                {results.totalLiveKg} kg
              </p>
            </div>
            <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3.5 space-y-1">
              <p className="text-[11px] text-[var(--color-muted)]">{t.weightsResultCarcassLabel}</p>
              <p className="font-display text-lg font-extrabold text-[var(--color-green-ink)] tabular-nums">
                {results.carcassWeightKg} kg
              </p>
            </div>
            <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3.5 space-y-1">
              <p className="text-[11px] text-[var(--color-muted)]">{t.weightsResultCleanMeatLabel}</p>
              <p className="font-display text-lg font-extrabold text-[var(--color-ink)] tabular-nums">
                {results.cleanMeatKg} kg
              </p>
            </div>
            <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-gold)]/50 p-3.5 space-y-1">
              <p className="text-[11px] text-[var(--color-muted)]">{t.weightsResultEstValueLabel}</p>
              <p className="font-display text-lg font-extrabold text-[var(--color-gold-hover)] dark:text-[var(--color-gold)] tabular-nums">
                {formatPriceSar(results.estValueSar, lang)}
              </p>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('feast')}
              className="min-h-[42px] flex-1 px-4 py-2 rounded-xl border border-[var(--color-green-ink)] text-[var(--color-green-ink)] hover:bg-[var(--color-green)] hover:text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Calculator size={15} aria-hidden="true" />
              <span>{t.weightsToFeastBtn}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('listings')}
              className="min-h-[42px] flex-1 px-4 py-2 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>{t.weightsToListingsBtn}</span>
              {dir === 'ltr' ? <ArrowRight size={14} aria-hidden="true" /> : <ArrowLeft size={14} aria-hidden="true" />}
            </button>
          </div>
        </div>
        </div>
      </div>
    </section>
  );
}
