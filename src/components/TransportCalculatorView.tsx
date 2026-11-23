import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  MapPin,
  Minus,
  Plus,
  RotateCcw,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import {
  calculateTransportEstimate,
  TRANSPORT_VEHICLE_SPECS,
  type TransportVehicleType,
} from '../lib/marketplace-tools';
import { formatPriceSar } from '../lib/format';
import { useI18n } from '../lib/i18n';
import type { PageView } from '../lib/router';
import { DynamicHeroBanner } from './DynamicHeroBanner';

interface TransportCalculatorViewProps {
  onNavigate: (page: PageView) => void;
}

const SAUDI_ROUTE_PRESETS: Array<{
  id: string;
  labelAr: string;
  labelEn: string;
  km: number;
}> = [
  { id: 'riyadh-qassim', labelAr: 'الرياض ↔ القصيم (بريدة)', labelEn: 'Riyadh ↔ Al-Qassim (Buraidah)', km: 360 },
  { id: 'riyadh-hafr', labelAr: 'الرياض ↔ حفر الباطن', labelEn: 'Riyadh ↔ Hafar Al-Batin', km: 490 },
  { id: 'jeddah-taif', labelAr: 'جدة ↔ الطائف', labelEn: 'Jeddah ↔ Taif', km: 170 },
  { id: 'riyadh-dammam', labelAr: 'الرياض ↔ الدمام (الشرقية)', labelEn: 'Riyadh ↔ Dammam (Eastern)', km: 410 },
  { id: 'makkah-madinah', labelAr: 'مكة المكرمة ↔ المدينة المنورة', labelEn: 'Makkah ↔ Madinah', km: 440 },
  { id: 'hail-riyadh', labelAr: 'حائل ↔ الرياض', labelEn: 'Hail ↔ Riyadh', km: 640 },
];

export function TransportCalculatorView({ onNavigate }: TransportCalculatorViewProps) {
  const { dir, isEn } = useI18n();
  const DirArrow = isEn ? ArrowRight : ArrowLeft;

  const [distanceKm, setDistanceKm] = useState<number>(360);
  const [headCount, setHeadCount] = useState<number>(15);
  const [vehicleType, setVehicleType] = useState<TransportVehicleType>('medium_truck');
  const [includeVetCare, setIncludeVetCare] = useState<boolean>(false);
  const [includeFeedWaterStop, setIncludeFeedWaterStop] = useState<boolean>(true);

  const result = useMemo(
    () =>
      calculateTransportEstimate({
        distanceKm,
        headCount,
        vehicleType,
        includeVetCare,
        includeFeedWaterStop,
      }),
    [distanceKm, headCount, vehicleType, includeVetCare, includeFeedWaterStop]
  );

  const vehicleSpec = TRANSPORT_VEHICLE_SPECS[vehicleType];
  const recommendedSpec = TRANSPORT_VEHICLE_SPECS[result.recommendedVehicle];

  const handleReset = () => {
    setDistanceKm(360);
    setHeadCount(15);
    setVehicleType('medium_truck');
    setIncludeVetCare(false);
    setIncludeFeedWaterStop(true);
  };

  return (
    <section dir={dir} className="bg-[var(--color-canvas)] transition-colors">
      <DynamicHeroBanner
        pageKey="transport"
        breadcrumbs={[
          { label: isEn ? 'Home' : 'الرئيسية', onClick: () => onNavigate('home') },
          { label: isEn ? 'Services & Tools' : 'الخدمات والأدوات', onClick: () => onNavigate('services') },
          { label: isEn ? 'Transport Estimator' : 'حاسبة تكلفة النقل' },
        ]}
        contextLabel={
          isEn
            ? `${result.distanceKm} km · ${result.headCount} heads`
            : `${result.distanceKm} كم · ${result.headCount} رأس`
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => onNavigate('services')}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#E6B85C] hover:bg-[#F0C670] text-[#0C261B] text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Truck size={15} aria-hidden="true" />
              <span>{isEn ? 'Book Transport Service' : 'طلب خدمة نقل مجهزة'}</span>
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
                {isEn ? 'Estimated Total Cost' : 'التكلفة التقديرية للنقل'}
              </span>
              <span className="font-display text-lg font-extrabold text-[#F4C569] tabular-nums">
                {formatPriceSar(result.totalEstimatedSar)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-xl bg-white/[0.06] border border-white/15">
                <p className="text-[10px] text-emerald-100/75">
                  {isEn ? 'Cost Per Head' : 'التكلفة على الرأس'}
                </p>
                <p className="mt-0.5 font-display text-base font-extrabold text-white tabular-nums">
                  {formatPriceSar(result.perHeadSar)}
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-white/[0.06] border border-white/15">
                <p className="text-[10px] text-emerald-100/75">
                  {isEn ? 'Selected Carrier' : 'الناقلة المختارة'}
                </p>
                <p className="mt-0.5 text-xs font-bold text-[#F4C569] truncate">
                  {isEn ? vehicleSpec.labelEn : vehicleSpec.labelAr}
                </p>
              </div>
            </div>
          </div>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Controls Column */}
          <div className="lg:col-span-7 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-7 space-y-6">
            <div>
              <h2 className="font-display text-xl font-extrabold text-[var(--color-ink)]">
                {isEn ? 'Route & Herd Details' : 'تفاصيل المسار والقطيع'}
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-[var(--color-muted)]">
                {isEn
                  ? 'Select a common Saudi route or enter exact distance and head count.'
                  : 'اختر خط سير شائع بين مدن المملكة أو حدد المسافة وعدد الرؤوس يدوياً.'}
              </p>
            </div>

            {/* Saudi City Presets */}
            <div className="space-y-2">
              <span className="block text-xs font-bold text-[var(--color-ink)]">
                {isEn ? 'Common Saudi Livestock Routes' : 'مسارات نقل شائعة في المملكة'}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SAUDI_ROUTE_PRESETS.map((preset) => {
                  const active = distanceKm === preset.km;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setDistanceKm(preset.km)}
                      className={`min-h-[40px] px-3 py-2 rounded-xl border text-start text-xs font-bold flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        active
                          ? 'bg-[var(--color-green)] text-white border-[var(--color-green)]'
                          : 'bg-[var(--color-canvas)] text-[var(--color-ink)] border-[var(--color-border)] hover:border-[var(--color-gold)]'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5 truncate">
                        <MapPin size={13} className="shrink-0" aria-hidden="true" />
                        <span className="truncate">{isEn ? preset.labelEn : preset.labelAr}</span>
                      </span>
                      <span className="tabular-nums text-[11px] shrink-0 opacity-85">
                        {preset.km} {isEn ? 'km' : 'كم'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Distance Slider */}
            <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="transport-distance" className="text-xs font-bold text-[var(--color-ink)]">
                  {isEn ? 'Route Distance (km)' : 'مسافة النقل التقديرية (كم)'}
                </label>
                <span className="font-display text-base font-extrabold text-[var(--color-green-ink)] tabular-nums">
                  {distanceKm.toLocaleString('en-US')} {isEn ? 'km' : 'كم'}
                </span>
              </div>
              <input
                id="transport-distance"
                type="range"
                min={20}
                max={1600}
                step={10}
                value={distanceKm}
                onChange={(e) => setDistanceKm(Number(e.target.value))}
                className="w-full accent-[var(--color-green)] cursor-pointer"
              />
            </div>

            {/* Head Count Stepper + Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="transport-heads" className="text-xs font-bold text-[var(--color-ink)]">
                  {isEn ? 'Number of Livestock Heads' : 'عدد الرؤوس المنقولة'}
                </label>
                <div className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={isEn ? 'Decrease heads' : 'إنقاص العدد'}
                    onClick={() => setHeadCount((h) => Math.max(1, h - 1))}
                    className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] flex items-center justify-center cursor-pointer"
                  >
                    <Minus size={14} aria-hidden="true" />
                  </button>
                  <span className="min-w-[44px] text-center font-display text-base font-extrabold text-[var(--color-green-ink)] tabular-nums">
                    {headCount}
                  </span>
                  <button
                    type="button"
                    aria-label={isEn ? 'Increase heads' : 'زيادة العدد'}
                    onClick={() => setHeadCount((h) => Math.min(250, h + 1))}
                    className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] flex items-center justify-center cursor-pointer"
                  >
                    <Plus size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <input
                id="transport-heads"
                type="range"
                min={1}
                max={200}
                step={1}
                value={headCount}
                onChange={(e) => setHeadCount(Number(e.target.value))}
                className="w-full accent-[var(--color-green)] cursor-pointer"
              />
            </div>

            {/* Carrier Type */}
            <div className="space-y-2">
              <span className="block text-xs font-bold text-[var(--color-ink)]">
                {isEn ? 'Livestock Carrier Class' : 'فئة الناقلة المجهزة'}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {(Object.keys(TRANSPORT_VEHICLE_SPECS) as TransportVehicleType[]).map((key) => {
                  const spec = TRANSPORT_VEHICLE_SPECS[key];
                  const active = vehicleType === key;
                  const isSuggested = result.recommendedVehicle === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setVehicleType(key)}
                      className={`p-3 rounded-xl border text-start transition-colors cursor-pointer space-y-1 ${
                        active
                          ? 'bg-[var(--color-green)] text-white border-[var(--color-green)]'
                          : 'bg-[var(--color-canvas)] text-[var(--color-ink)] border-[var(--color-border)] hover:border-[var(--color-gold)]'
                      }`}
                    >
                      <span className="block text-xs font-extrabold">
                        {isEn ? spec.labelEn : spec.labelAr}
                      </span>
                      <span
                        className={`block text-[11px] tabular-nums ${
                          active ? 'text-[#F4C569]' : 'text-[var(--color-muted)]'
                        }`}
                      >
                        {isSuggested
                          ? isEn
                            ? 'Recommended for herd size'
                            : 'موصى بها لهذا العدد'
                          : isEn
                          ? `Base ${formatPriceSar(spec.baseDispatchSar)}`
                          : `انطلاق ${formatPriceSar(spec.baseDispatchSar)}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Care Options */}
            <div className="pt-2 border-t border-[var(--color-border)] space-y-2.5">
              <label className="flex items-start gap-3 p-3 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-border)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeFeedWaterStop}
                  onChange={(e) => setIncludeFeedWaterStop(e.target.checked)}
                  className="mt-1 accent-[var(--color-green)]"
                />
                <span>
                  <span className="block text-xs font-bold text-[var(--color-ink)]">
                    {isEn
                      ? 'Scheduled Feed & Water Rest Stop (routes 180+ km)'
                      : 'توقف علف وسقاية أثناء الرحلة (للمسافات 180 كم فأكثر)'}
                  </span>
                  <span className="block text-[11px] text-[var(--color-muted)]">
                    {isEn
                      ? 'Helps maintain livestock comfort on long inter-region trips'
                      : 'يحافظ على راحة المواشي وسلامتها في التنقلات الطويلة بين المناطق'}
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-border)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeVetCare}
                  onChange={(e) => setIncludeVetCare(e.target.checked)}
                  className="mt-1 accent-[var(--color-green)]"
                />
                <span>
                  <span className="block text-xs font-bold text-[var(--color-ink)]">
                    {isEn
                      ? 'Pre-Loading Veterinary Visual Inspection'
                      : 'فحص بيطري ظاهري قبل التحميل'}
                  </span>
                  <span className="block text-[11px] text-[var(--color-muted)]">
                    {isEn
                      ? 'Includes basic health check before transport dispatch'
                      : 'تحقق من الحالة الظاهرية قبل تحميل القطيع وانطلاق الناقلة'}
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* Results Summary Column */}
          <aside className="lg:col-span-5 space-y-5">
            <div className="rounded-2xl bg-[#103C2C] text-white p-6 sm:p-7 space-y-5 shadow-md">
              <div className="flex items-start justify-between gap-3 pb-4 border-b border-white/15">
                <div>
                  <p className="text-xs font-bold text-[#F4C569]">
                    {isEn ? 'Estimated Transport Summary' : 'ملخص التكلفة التقديرية'}
                  </p>
                  <p className="mt-1 font-display text-3xl font-extrabold tabular-nums">
                    {formatPriceSar(result.totalEstimatedSar)}
                  </p>
                </div>
                <span className="w-11 h-11 rounded-xl bg-[#F4C569]/15 text-[#F4C569] flex items-center justify-center shrink-0">
                  <Truck size={22} aria-hidden="true" />
                </span>
              </div>

              <dl className="space-y-3 text-sm tabular-nums">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-emerald-100/80">
                    {isEn ? 'Carrier dispatch base' : 'رسوم انطلاق وتجهيز الناقلة'}
                  </dt>
                  <dd className="font-bold">{formatPriceSar(result.baseDispatchSar)}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-emerald-100/80">
                    {isEn ? `Distance charge (${result.distanceKm} km)` : `تكلفة المسافة (${result.distanceKm} كم)`}
                  </dt>
                  <dd className="font-bold">{formatPriceSar(result.distanceChargeSar)}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-emerald-100/80">
                    {isEn ? 'Vet & rest-stop care add-ons' : 'خدمات الفحص البيطري والرعاية'}
                  </dt>
                  <dd className="font-bold">{formatPriceSar(result.careAddonsSar)}</dd>
                </div>
                <div className="pt-3 border-t border-white/15 flex items-center justify-between gap-2">
                  <dt className="font-bold text-[#F4C569]">
                    {isEn ? 'Average Cost Per Head' : 'متوسط التكلفة للرأس الواحد'}
                  </dt>
                  <dd className="font-display text-lg font-extrabold text-[#F4C569]">
                    {formatPriceSar(result.perHeadSar)}
                  </dd>
                </div>
              </dl>

              <div className="rounded-xl bg-white/[0.08] border border-white/15 p-3.5 text-xs text-emerald-100/85 space-y-1.5">
                <p className="font-bold text-white inline-flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-[#F4C569]" aria-hidden="true" />
                  <span>
                    {isEn ? 'Suggested Carrier Size' : 'الناقلة الأنسب لعدد الرؤوس'}
                  </span>
                </p>
                <p>{isEn ? recommendedSpec.labelEn : recommendedSpec.labelAr}</p>
              </div>

              <button
                type="button"
                onClick={() => onNavigate('services')}
                className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-[#F4C569] hover:bg-[#ffd582] text-[#0C261B] font-extrabold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>{isEn ? 'Submit Official Transport Request' : 'أرسل طلب النقل الآن عبر الخدمات'}</span>
                <DirArrow size={15} aria-hidden="true" />
              </button>
            </div>

            <div className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] p-5 space-y-2.5 text-xs text-[var(--color-muted)]">
              <p className="font-display text-sm font-extrabold text-[var(--color-ink)]">
                {isEn ? 'Safe Transport Checklist' : 'نصائح مهمة قبل شحن المواشي'}
              </p>
              {[
                isEn
                  ? 'Confirm truck ventilation and non-slip flooring before loading.'
                  : 'تأكد من توفر التهوية الجيدة وأرضية مانعة للانزلاق داخل الناقلة.',
                isEn
                  ? 'Avoid transporting during midday summer peaks across open highways.'
                  : 'يُفضل النقل في ساعات الصباح الباكر أو المساء خلال أشهر الصيف.',
                isEn
                  ? 'Final pricing may vary slightly by road accessibility and exact loading time.'
                  : 'الأرقام تقديرية؛ يتم تأكيد السعر النهائي مع مزود النقل حسب موقع المراح الفعلي.',
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
