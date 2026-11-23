import { useState } from 'react';
import { ArrowLeft, Calculator, CheckCircle2, ShieldCheck } from 'lucide-react';
import type { DirectoryFilters } from '../lib/listing-search';
import type { PageView } from '../lib/router';
import { DynamicHeroBanner } from './DynamicHeroBanner';
import { MedallionLivestockIcon, type MedallionEmblemKind } from './HomeCategoriesSection';
import { SafeImage } from './SafeImage';

interface OccasionsViewProps {
  onNavigate: (page: PageView, opts?: { listingFilters?: Partial<DirectoryFilters> }) => void;
}

type OccasionId = 'aqiqa' | 'wedding' | 'family' | 'farm';

interface OccasionGuide {
  id: OccasionId;
  tabLabel: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  facts: Array<{ label: string; value: string }>;
  tips: string[];
  listingFilters: Partial<DirectoryFilters>;
  ctaLabel: string;
}

const OCCASIONS: OccasionGuide[] = [
  {
    id: 'aqiqa',
    tabLabel: 'العقيقة',
    title: 'العقيقة ومناسبات المولود الجديد',
    subtitle: 'التزام تام بالمواصفات الشرعية للعمر والخلو من العيوب مع توصيات جاهزة للتوزيع والتقديم.',
    imageUrl: '/src/assets/images/breed_harri_sheep_1794608169989.jpg',
    facts: [
      { label: 'العدد الشرعي', value: 'رأس للأنثى · رأسان للذكر' },
      { label: 'السلالة المقترحة', value: 'حري أو نعيمي جذع مكتمل' },
      { label: 'السن والوزن', value: '6 أشهر فأكثر · 42 – 52 كجم' },
      { label: 'الميزانية التقديرية', value: '1,650 – 2,250 ر.س للرأس' },
    ],
    tips: [
      'التأكد من بلوغ الجذع للضأن أو ثني الماعز حسب الضوابط الشرعية.',
      'معاينة الأسنان والظهر وسلامة القوائم والعيون قبل إتمام الاتفاق.',
      'الاستفادة من المربين الموثقين الذين يذكرون تاريخ التحصين والعمر بدقة.',
    ],
    listingFilters: { categoryId: 'cat_sheep', subCategoryId: 'sub_slaughter' },
    ctaLabel: 'تصفح ذبائح العقيقة المتاحة',
  },
  {
    id: 'wedding',
    tabLabel: 'الزواج والولائم الكبرى',
    title: 'ولائم الزواج والمناسبات الكبرى',
    subtitle: 'اختيارات متوازنة لعدد كبير من الضيوف تضمن جودة التقديم وثبات النكهة السعودية الأصيلة.',
    imageUrl: '/src/assets/images/breed_naimi_sheep_1794608169331.jpg',
    facts: [
      { label: 'العدد التقديري', value: 'رأس واحد لكل 22 – 28 ضيفاً' },
      { label: 'السلالة المقترحة', value: 'نعيمي بلدي أو نجدي فاخر' },
      { label: 'السن والوزن', value: '7 – 10 أشهر · 50 – 65 كجم' },
      { label: 'التوفير بالتجهيز', value: 'تواصل مباشر بدون وسطاء مع المربي' },
    ],
    tips: [
      'استخدم حاسبة الولائم لتحديد العدد الدقيق وإضافة رأس احتياط للضيافة.',
      'رتّب موعد التوصيل والنقل قبل المناسبة بـ 48 ساعة على الأقل.',
      'فضّل توحيد القطيع من مراح واحد لتجانس الوزن وجودة اللحم.',
    ],
    listingFilters: { breedId: 'brd_naimi' },
    ctaLabel: 'عرض عروض النعيمي للولائم',
  },
  {
    id: 'family',
    tabLabel: 'العزائم والضيافة',
    title: 'العزائم العائلية وضيافة نهاية الأسبوع',
    subtitle: 'خيارات مرنة من الحري والعارضي والنعيمي الصغير المناسبة للطبخ المنزلي أو المندي.',
    imageUrl: '/src/assets/images/breed_ardhi_goat_1794608169786.jpg',
    facts: [
      { label: 'العدد المناسب', value: '1 – 2 رأس لـ 15 – 40 ضيفاً' },
      { label: 'السلالة المقترحة', value: 'حري جذع أو تيس عارضي' },
      { label: 'السن والوزن', value: '4 – 7 أشهر · 28 – 42 كجم' },
      { label: 'الميزانية التقديرية', value: '1,300 – 1,900 ر.س للرأس' },
    ],
    tips: [
      'التيس العارضي الصغير ممتاز للشواء والمندي بينما الحري يتميز بطراوة اللحم.',
      'قارن سعر الكيلو التقريبي مع متوسطات مؤشر الأسعار قبل الشراء.',
      'تحقق من إمكانية الشراء بالتقسيط أو التفاوض على سعر المجموعة داخل المنصة.',
    ],
    listingFilters: { categoryId: 'cat_goats' },
    ctaLabel: 'تصفح عروض العارضي والماعز',
  },
  {
    id: 'farm',
    tabLabel: 'التربية والتسمين',
    title: 'مشاريع التربية وتأسيس المراح',
    subtitle: 'اختيار الرخال والدفيع وفحول الإنتاج الموثقة لبناء قطيع متماسك وعالي الخصوبة.',
    imageUrl: '/src/assets/images/breed_najdi_sheep_1794608169810.jpg',
    facts: [
      { label: 'بداية المشروع', value: 'فحل واحد لكل 20 – 30 رأساً' },
      { label: 'السلالات الأنسب', value: 'نجدي · نعيمي · عارضي أصيل' },
      { label: 'السن المقترح', value: 'ثنية أو رباع أو رخال 5 – 9 أشهر' },
      { label: 'نقطة الفحص الأهم', value: 'شهادة التحصين وسجل الإنتاج' },
    ],
    tips: [
      'افحص السجل الصحي وتحصين الدموي والمعوي وطلب العزل 14 يوماً للقطيع الجديد.',
      'اختر المربين المعتمدين واطلع على تقييمات المشترين السابقين من نفس المراح.',
      'ابدأ بفئة التربية والقنية أو فحول الإنتاج المعتمدة في السوق.',
    ],
    listingFilters: { categoryId: 'cat_breeding' },
    ctaLabel: 'تصفح فحول ومواشي التربية',
  },
];

export function OccasionsView({ onNavigate }: OccasionsViewProps) {
  const [selectedId, setSelectedId] = useState<OccasionId>('aqiqa');
  const active = OCCASIONS.find((o) => o.id === selectedId) || OCCASIONS[0];

  const occasionEmblemMap: Record<OccasionId, MedallionEmblemKind> = {
    aqiqa: 'harri',
    wedding: 'naimi',
    family: 'ardhi',
    farm: 'najdi',
  };

  return (
    <section className="bg-[var(--color-canvas)] transition-colors">
      <DynamicHeroBanner
        pageKey="occasions"
        variant="emerald-royal"
        breadcrumbs={[
          { label: 'الرئيسية', onClick: () => onNavigate('home') },
          { label: 'المناسبات' },
        ]}
        contextLabel="ترشيحات دقيقة · عقيقة · زواج · عزائم · تربية"
        actions={
          <>
            <button
              type="button"
              onClick={() => onNavigate('feast')}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#F4C569] hover:bg-[#ffd582] text-[#0B231A] text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <Calculator size={15} aria-hidden="true" />
              <span>احسب عدد الذبائح لضيوفك</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('listings', { listingFilters: active.listingFilters })}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-white/25 bg-white/[0.08] hover:border-[#F4C569] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <span>{active.ctaLabel}</span>
              <ArrowLeft size={14} aria-hidden="true" />
            </button>
          </>
        }
        visual={
          <div className="flex flex-col justify-between h-full gap-3">
            <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-white/15">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-10 h-10 rounded-xl bg-white/[0.1] border border-[#F4C569]/40 text-[#F4C569] flex items-center justify-center shrink-0">
                  <MedallionLivestockIcon
                    kind={occasionEmblemMap[active.id]}
                    className="w-8 h-8"
                  />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-[#F4C569]">
                    التوصية النشطة
                  </p>
                  <p className="font-display text-sm font-extrabold text-white truncate">
                    {active.tabLabel}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {OCCASIONS.map((item) => {
                const isSelected = item.id === active.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`min-h-[32px] px-2.5 py-1 rounded-lg border text-[11px] font-bold text-start truncate transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#F4C569] text-[#0B231A] border-[#F4C569]'
                        : 'bg-white/[0.06] border-white/15 text-emerald-100/85 hover:border-[#F4C569]/60'
                    }`}
                  >
                    {item.tabLabel}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {active.facts.slice(0, 2).map((fact) => (
                <div
                  key={fact.label}
                  className="p-2.5 rounded-lg bg-white/[0.06] border border-white/15"
                >
                  <p className="text-[10px] font-semibold text-emerald-100/75">
                    {fact.label}
                  </p>
                  <p className="mt-0.5 text-xs font-extrabold text-white tabular-nums line-clamp-1">
                    {fact.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        }
        interactiveDock={
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-emerald-100/85 font-semibold">
              السلالة المقترحة لـ {active.tabLabel}:{' '}
              <strong className="text-[#F4C569]">{active.facts[1]?.value}</strong>
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate('breeders')}
                className="min-h-[34px] px-3 py-1 rounded-lg bg-white/[0.08] border border-white/20 hover:border-[#F4C569] text-white font-bold cursor-pointer"
              >
                المربون المعتمدون
              </button>
              <button
                type="button"
                onClick={() => onNavigate('listings', { listingFilters: active.listingFilters })}
                className="min-h-[34px] px-3 py-1 rounded-lg bg-[#F4C569] hover:bg-[#ffd582] text-[#0B231A] font-extrabold inline-flex items-center gap-1 cursor-pointer"
              >
                <span>عرض العروض المطابقة</span>
                <ArrowLeft size={13} aria-hidden="true" />
              </button>
            </div>
          </div>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8">
        {/* Occasion Selector Tabs */}
      <div
        role="tablist"
        aria-label="اختيار المناسبة"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      >
        {OCCASIONS.map((item) => {
          const selected = item.id === active.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setSelectedId(item.id)}
              className={`min-h-[56px] p-3.5 rounded-xl border text-right transition-colors cursor-pointer ${
                selected
                  ? 'bg-[var(--color-green)] text-white border-[var(--color-green)] shadow-sm'
                  : 'bg-[var(--color-surface)] text-[var(--color-ink)] border-[var(--color-border)] hover:border-[var(--color-gold)]'
              }`}
            >
              <span className="block font-display text-sm sm:text-base font-extrabold">
                {item.tabLabel}
              </span>
              <span
                className={`block text-[11px] mt-0.5 line-clamp-1 ${
                  selected ? 'text-white/80' : 'text-[var(--color-muted)]'
                }`}
              >
                {item.facts[1].value}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected Occasion Detailed Card */}
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch shadow-xs">
        <div className="lg:col-span-5 aspect-[4/3] lg:aspect-auto bg-[var(--color-cream)]">
          <SafeImage
            src={active.imageUrl}
            alt={active.title}
            width={900}
            height={680}
            loading="eager"
            className="w-full h-full object-cover"
          />
        </div>

        <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between gap-6">
          <div className="space-y-5">
            <div>
              <h2 className="font-display text-2xl font-extrabold text-[var(--color-ink)]">
                {active.title}
              </h2>
              <p className="mt-1.5 text-sm text-[var(--color-muted)] leading-relaxed">
                {active.subtitle}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {active.facts.map((fact) => (
                <div
                  key={fact.label}
                  className="rounded-xl bg-[var(--color-cream)]/65 border border-[var(--color-border)] p-3.5"
                >
                  <p className="text-[11px] font-semibold text-[var(--color-muted)]">
                    {fact.label}
                  </p>
                  <p className="mt-1 font-display text-sm font-extrabold text-[var(--color-ink)] tabular-nums">
                    {fact.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-bold text-[var(--color-green-ink)] inline-flex items-center gap-1.5">
                <ShieldCheck size={15} aria-hidden="true" />
                <span>نصائح عملية قبل إتمام الشراء</span>
              </h3>
              <ul className="space-y-2 text-xs sm:text-sm text-[var(--color-ink)]">
                {active.tips.map((tip) => (
                  <li key={tip} className="flex items-start gap-2">
                    <CheckCircle2
                      size={15}
                      className="text-[var(--color-green-ink)] shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--color-border)] flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('listings', { listingFilters: active.listingFilters })}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-bold inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              <span>{active.ctaLabel}</span>
              <ArrowLeft size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('breeders')}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)] text-sm font-bold text-[var(--color-ink)] transition-colors cursor-pointer"
            >
              تصفح المربين المعتمدين
            </button>
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}
