import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BadgePercent,
  Calculator,
  Minus,
  Plus,
  Scale,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Truck,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { formatPriceSar } from '../lib/format';
import { calculateFeastEstimate } from '../lib/marketplace-tools';
import type { PageView } from '../lib/router';
import type { DirectoryFilters } from '../lib/listing-search';
import { PageBanner } from './PageBanner';

interface HomeCommandBannerProps {
  publishedCount: number;
  verifiedBreedersCount: number;
  breedsCount: number;
  commissionRatePercent?: number;
  onNavigate: (page: PageView, opts?: { listingFilters?: Partial<DirectoryFilters> }) => void;
}

type HomeToolTab = 'feast' | 'weights' | 'commission';

export function HomeCommandBanner({
  publishedCount,
  verifiedBreedersCount,
  breedsCount,
  commissionRatePercent = 1,
  onNavigate,
}: HomeCommandBannerProps) {
  const { isEn, dir } = useI18n();
  const DirArrow = isEn ? ArrowRight : ArrowLeft;

  const [activeTool, setActiveTool] = useState<HomeToolTab>('feast');
  const [guests, setGuests] = useState<number>(40);
  const [liveWeightKg, setLiveWeightKg] = useState<number>(52);
  const [dealAmountSar, setDealAmountSar] = useState<number>(4000);

  const feastEstimate = useMemo(
    () =>
      calculateFeastEstimate({
        guests,
        occasion: guests >= 60 ? 'wedding' : 'family',
        portionGrams: 500,
        animalType: 'sheep',
        weightKg: 50,
        headPriceSar: 1950,
        includeSpare: guests >= 15,
      }),
    [guests]
  );

  const carcassKg = Math.round(liveWeightKg * 0.48 * 10) / 10;
  const cleanMeatKg = Math.round(liveWeightKg * 0.38 * 10) / 10;
  const commissionFee = Math.round(((dealAmountSar * commissionRatePercent) / 100) * 100) / 100;
  const kgUnit = isEn ? 'kg' : 'كجم';

  return (
    <section
      aria-labelledby="home-command-banner-heading"
      className="py-4 sm:py-6"
    >
      <PageBanner
        headingId="home-command-banner-heading"
        headingAs="h2"
        variant="emerald-royal"
        theme="home-studio"
        eyebrow={isEn ? 'Interactive Smart Tools Suite' : 'منظومة الأدوات التفاعلية الذكية'}
        title={isEn ? 'Plan Your Purchase With' : 'خطّط لشرائك بدقة مع'}
        titleAccent={isEn ? 'Instant Market Calculators' : 'حاسبات السوق الفورية'}
        description={
          isEn
            ? 'Test live feast quantities, carcass yield percentages, or the transparent 1% seller commission directly from here before exploring listings.'
            : 'جرّب تقدير الذبائح لضيوفك، أو احسب نسبة اللحم الصافي من الوزن الحي، أو راجع عمولة البيع الميسّرة مباشرة قبل تصفح العروض.'
        }
        contextLabel={
          isEn
            ? 'Live Interactive Studio · Updated Daily'
            : 'استوديو حساب فوري · تفاعل مباشر'
        }
        stats={[
          {
            label: isEn ? 'Active Listings' : 'عروض منشورة الآن',
            value: publishedCount.toLocaleString('en-US'),
            accent: true,
          },
          {
            label: isEn ? 'Verified Ranches' : 'مراحات موثقة',
            value: verifiedBreedersCount.toLocaleString('en-US'),
          },
          {
            label: isEn ? 'Pure Breeds' : 'سلالات معتمدة',
            value: breedsCount.toLocaleString('en-US'),
          },
        ]}
        actions={
          <>
            <button
              type="button"
              onClick={() => onNavigate('feast')}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#F4C569] hover:bg-[#ffd582] text-[#0B231A] text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer shadow-sm"
            >
              <Calculator size={15} aria-hidden="true" />
              <span>{isEn ? 'Open Full Feast Planner' : 'حاسبة الولائم الكاملة'}</span>
              <DirArrow size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('breeds')}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-white/25 bg-white/[0.08] hover:bg-white/[0.15] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
            >
              <TrendingUp size={15} className="text-[#F4C569]" aria-hidden="true" />
              <span>{isEn ? '12-Month Price Index' : 'مؤشر الأسعار الموسمي'}</span>
            </button>
          </>
        }
        visual={
          <div className="flex flex-col justify-between h-full gap-3.5" dir={dir}>
            {/* Interactive Mini-App Mode Tabs */}
            <div
              role="tablist"
              aria-label={isEn ? 'Select interactive calculator preview' : 'اختيار الحاسبة الفورية'}
              className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/[0.06] border border-white/15"
            >
              {[
                {
                  id: 'feast' as HomeToolTab,
                  label: isEn ? 'Feast' : 'الولائم',
                  Icon: Calculator,
                },
                {
                  id: 'weights' as HomeToolTab,
                  label: isEn ? 'Yield' : 'التصافي',
                  Icon: Scale,
                },
                {
                  id: 'commission' as HomeToolTab,
                  label: isEn ? '1% Fee' : 'العمولة',
                  Icon: BadgePercent,
                },
              ].map(({ id, label, Icon }) => {
                const selected = activeTool === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveTool(id)}
                    className={`min-h-[34px] px-2 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                      selected
                        ? 'bg-[#F4C569] text-[#0B231A] shadow-xs'
                        : 'text-emerald-100/80 hover:text-white hover:bg-white/[0.06]'
                    }`}
                  >
                    <Icon size={13} aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Live Interactive Body */}
            {activeTool === 'feast' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-emerald-100/85">
                    {isEn ? 'Expected Guests' : 'عدد الضيوف'}
                  </span>
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={isEn ? 'Decrease guests' : 'إنقاص الضيوف'}
                      onClick={() => setGuests((g) => Math.max(10, g - 10))}
                      className="w-9 h-9 rounded-lg border border-white/20 bg-white/[0.07] hover:border-[#F4C569] text-white flex items-center justify-center cursor-pointer"
                    >
                      <Minus size={14} aria-hidden="true" />
                    </button>
                    <span className="min-w-[54px] text-center font-display text-sm font-extrabold text-[#F4C569] tabular-nums">
                      {guests}
                    </span>
                    <button
                      type="button"
                      aria-label={isEn ? 'Increase guests' : 'زيادة الضيوف'}
                      onClick={() => setGuests((g) => Math.min(300, g + 10))}
                      className="w-9 h-9 rounded-lg border border-white/20 bg-white/[0.07] hover:border-[#F4C569] text-white flex items-center justify-center cursor-pointer"
                    >
                      <Plus size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <input
                  type="range"
                  min={10}
                  max={250}
                  step={5}
                  value={guests}
                  aria-label={isEn ? 'Guests slider' : 'شريط عدد الضيوف'}
                  onChange={(e) => setGuests(Number(e.target.value))}
                  className="w-full accent-[#F4C569] cursor-pointer"
                />

                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="p-2.5 rounded-xl bg-white/[0.06] border border-white/12">
                    <p className="text-[10px] text-emerald-100/70">
                      {isEn ? 'Heads' : 'العدد المقترح'}
                    </p>
                    <p className="mt-0.5 font-display text-base font-extrabold text-[#F4C569] tabular-nums">
                      {feastEstimate.totalHeads}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/[0.06] border border-white/12">
                    <p className="text-[10px] text-emerald-100/70">
                      {isEn ? 'Clean Meat' : 'اللحم الصافي'}
                    </p>
                    <p className="mt-0.5 font-display text-sm font-extrabold text-white tabular-nums">
                      {feastEstimate.meatKg.toFixed(1)} {kgUnit}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/[0.06] border border-white/12">
                    <p className="text-[10px] text-emerald-100/70">
                      {isEn ? 'Est. Budget' : 'الميزانية'}
                    </p>
                    <p className="mt-0.5 font-display text-xs sm:text-sm font-extrabold text-white tabular-nums">
                      {formatPriceSar(feastEstimate.totalCostSar)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTool === 'weights' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-emerald-100/85">
                    {isEn ? 'Live Weight (Sheep)' : 'الوزن الحي التقديري'}
                  </span>
                  <span className="font-display text-sm font-extrabold text-[#F4C569] tabular-nums">
                    {liveWeightKg} {kgUnit}
                  </span>
                </div>

                <input
                  type="range"
                  min={25}
                  max={95}
                  step={1}
                  value={liveWeightKg}
                  aria-label={isEn ? 'Live weight slider' : 'شريط الوزن الحي'}
                  onChange={(e) => setLiveWeightKg(Number(e.target.value))}
                  className="w-full accent-[#F4C569] cursor-pointer"
                />

                <div className="space-y-2 pt-1">
                  <div>
                    <div className="flex justify-between text-[11px] tabular-nums mb-1">
                      <span className="text-emerald-100/75">
                        {isEn ? 'Carcass (48%)' : 'الذبيحة المعلّقة (48%)'}
                      </span>
                      <span className="font-bold text-white">{carcassKg} {kgUnit}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full bg-[#3BB285] w-[48%]" />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] tabular-nums mb-1">
                      <span className="text-emerald-100/75">
                        {isEn ? 'Clean Boneless Meat (38%)' : 'اللحم الصافي دون عظم (38%)'}
                      </span>
                      <span className="font-bold text-[#F4C569]">{cleanMeatKg} {kgUnit}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full bg-[#F4C569] w-[38%]" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTool === 'commission' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-emerald-100/85">
                    {isEn ? 'Completed Deal Value' : 'قيمة البيع الإجمالية'}
                  </span>
                  <span className="font-display text-sm font-extrabold text-[#F4C569] tabular-nums">
                    {formatPriceSar(dealAmountSar)}
                  </span>
                </div>

                <input
                  type="range"
                  min={500}
                  max={30000}
                  step={500}
                  value={dealAmountSar}
                  aria-label={isEn ? 'Deal amount slider' : 'شريط قيمة الصفقة'}
                  onChange={(e) => setDealAmountSar(Number(e.target.value))}
                  className="w-full accent-[#F4C569] cursor-pointer"
                />

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="p-2.5 rounded-xl bg-white/[0.06] border border-white/12">
                    <p className="text-[10px] text-emerald-100/70">
                      {isEn ? `Commission (${commissionRatePercent}%)` : `عمولة المنصة (${commissionRatePercent}%)`}
                    </p>
                    <p className="mt-0.5 font-display text-base font-extrabold text-[#F4C569] tabular-nums">
                      {formatPriceSar(commissionFee)}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/[0.06] border border-white/12">
                    <p className="text-[10px] text-emerald-100/70">
                      {isEn ? 'Net to Seller' : 'صافي مبلغ البائع'}
                    </p>
                    <p className="mt-0.5 font-display text-base font-extrabold text-white tabular-nums">
                      {formatPriceSar(dealAmountSar - commissionFee)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() =>
                onNavigate(
                  activeTool === 'feast'
                    ? 'feast'
                    : activeTool === 'weights'
                    ? 'weights'
                    : 'commission'
                )
              }
              className="w-full min-h-[38px] px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/15 hover:border-[#F4C569]/60 text-xs font-bold text-[#F4C569] inline-flex items-center justify-between gap-2 transition-colors cursor-pointer"
            >
              <span>
                {activeTool === 'feast'
                  ? isEn
                    ? 'Customize Portions & Sheep vs Goat'
                    : 'تخصيص الحصة والغنم أو الماعز في الحاسبة'
                  : activeTool === 'weights'
                  ? isEn
                    ? 'Compare Naimi, Najdi, Harri & Ardhi'
                    : 'مقارنة النعيمي والنجدي والحري والعارضي'
                  : isEn
                  ? 'View Bank Details & Transfer Receipt'
                  : 'عرض الحساب البنكي وإرسال إيصال الحوالة'}
              </span>
              <DirArrow size={14} aria-hidden="true" />
            </button>
          </div>
        }
        interactiveDock={
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate('transport')}
                className="min-h-[34px] px-3 py-1 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/15 hover:border-[#F4C569]/55 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Truck size={13} className="text-[#F4C569]" aria-hidden="true" />
                <span>{isEn ? 'Transport Estimator' : 'حاسبة النقل'}</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('feed')}
                className="min-h-[34px] px-3 py-1 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/15 hover:border-[#F4C569]/55 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Calculator size={13} className="text-[#F4C569]" aria-hidden="true" />
                <span>{isEn ? 'Feed Planner' : 'مخطط الأعلاف'}</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('occasions')}
                className="min-h-[34px] px-3 py-1 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/15 hover:border-[#F4C569]/55 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Sparkles size={13} className="text-[#F4C569]" aria-hidden="true" />
                <span>{isEn ? 'By Occasion' : 'حسب المناسبة'}</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('how')}
                className="min-h-[34px] px-3 py-1 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/15 hover:border-[#F4C569]/55 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <ShieldCheck size={13} className="text-[#F4C569]" aria-hidden="true" />
                <span>{isEn ? 'Safe Buying' : 'كيف يعمل السوق؟'}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() =>
                onNavigate('listings', {
                  listingFilters: { subCategoryId: 'sub_slaughter', verifiedOnly: true },
                })
              }
              className="text-xs font-bold text-[#F4C569] hover:underline inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <span>{isEn ? 'Verified Slaughter Ready Listings' : 'عروض الذبائح من المربين الموثقين'}</span>
              <DirArrow size={13} aria-hidden="true" />
            </button>
          </div>
        }
      />
    </section>
  );
}
