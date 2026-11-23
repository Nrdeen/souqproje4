import { useState } from 'react';
import {
  ArrowLeft,
  BadgePercent,
  Bell,
  Check,
  Crown,
  ShieldCheck,
  Star,
  User,
} from 'lucide-react';
import type { CommissionSettings } from '../lib/commission';
import type { PageView } from '../lib/router';
import { formatPriceSar } from '../lib/format';
import { Modal } from './Modal';
import { DynamicHeroBanner } from './DynamicHeroBanner';

interface PricingViewProps {
  isSignedIn: boolean;
  commissionSettings?: CommissionSettings | null;
  onNavigate: (page: PageView) => void;
  onNotify: (msg: string) => void;
}

type BillingCycle = 'monthly' | 'annual';

interface SelectedPlanInfo {
  id: 'featured' | 'merchant';
  title: string;
  priceMonthly: number;
  priceAnnual: number;
}

const COMPARISON_ROWS: Array<{
  feature: string;
  free: 'yes' | 'no' | string;
  featured: 'yes' | 'no' | string;
  merchant: 'yes' | 'no' | string;
}> = [
  { feature: 'نشر الإعلانات الأساسية', free: 'yes', featured: 'yes', merchant: 'yes' },
  { feature: 'الإعلانات المميزة في مقدمة النتائج', free: 'no', featured: 'yes', merchant: 'yes' },
  { feature: 'عدد الإعلانات المسموح بها', free: 'غير محدود', featured: 'غير محدود', merchant: 'غير محدود' },
  { feature: 'إحصائيات المشاهدات والاهتمام', free: 'no', featured: 'yes', merchant: 'yes' },
  { feature: 'توثيق وإبراز المراح والعلامة', free: 'no', featured: 'تمييز الإعلان', merchant: 'yes' },
  { feature: 'الدعم الفني', free: 'دعم عام', featured: 'دعم مخصص', merchant: 'دعم مخصص 24/7' },
];

export function PricingView({
  isSignedIn,
  commissionSettings,
  onNavigate,
  onNotify,
}: PricingViewProps) {
  const [billing, setBilling] = useState<BillingCycle>('monthly');
  const [selectedPlan, setSelectedPlan] = useState<SelectedPlanInfo | null>(null);
  const [requestNote, setRequestNote] = useState('');
  const [inspectedTierIdx, setInspectedTierIdx] = useState<number>(1);

  const featuredPrice = billing === 'monthly' ? 99 : 79;
  const merchantPrice = billing === 'monthly' ? 299 : 239;
  const periodLabel = billing === 'monthly' ? 'شهرياً' : 'شهرياً · تُدفع سنوياً';
  const bannerTiers = [
    {
      id: 'free',
      name: 'الباقة الأساسية',
      desc: 'نشر مجاني غير محدود لحسابات المربين والأفراد',
      price: '0 ر.س',
      highlight: 'مناسبة للبداية والنشر اليومي',
      featured: false,
    },
    {
      id: 'featured',
      name: 'باقة الإعلان المميز',
      desc: 'أولوية قصوى في البحث والصفحة الرئيسية',
      price: formatPriceSar(featuredPrice),
      highlight: 'مضاعفة المشاهدات وسرعة البيع',
      featured: true,
    },
    {
      id: 'merchant',
      name: 'باقة التاجر والمربي',
      desc: 'توثيق المراح وإحصائيات أداء متقدمة 24/7',
      price: formatPriceSar(merchantPrice),
      highlight: 'إدارة كاملة للمزارع والقطيع الكبير',
      featured: false,
    },
  ];
  const inspectedTier = bannerTiers[inspectedTierIdx] || bannerTiers[1];

  const handleConfirmPlanRequest = (e: React.FormEvent) => {
    e.preventDefault();
    const chosenTitle = selectedPlan?.title || 'الباقة المختارة';
    setSelectedPlan(null);
    setRequestNote('');
    onNotify(`تم تسجيل رغبتك في ${chosenTitle} (${periodLabel}). يمكنك المتابعة من حسابك.`);
    onNavigate(isSignedIn ? 'dashboard' : 'login');
  };

  const renderCell = (val: string) => {
    if (val === 'yes') {
      return (
        <span
          className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--color-green)]/12 text-[var(--color-green-ink)]"
          aria-label="متاح"
        >
          <Check size={15} strokeWidth={2.5} aria-hidden="true" />
        </span>
      );
    }
    if (val === 'no') {
      return (
        <span className="text-[var(--color-muted)]" aria-label="غير مشمول">
          —
        </span>
      );
    }
    return <span className="font-semibold text-[var(--color-ink)]">{val}</span>;
  };

  return (
    <div className="bg-[var(--color-canvas)] transition-colors">
      <DynamicHeroBanner
        pageKey="pricing"
        variant="night-vault"
          breadcrumbs={[
            { label: 'الرئيسية', onClick: () => onNavigate('home') },
            { label: 'الباقات والأسعار' },
          ]}
          contextLabel={billing === 'monthly' ? 'الفوترة الشهرية' : 'الفوترة السنوية (وفر 20%)'}
          stats={[
            { label: 'النشر الأساسي', value: 'مجاني' },
            {
              label: 'الإعلان المميز',
              value: formatPriceSar(featuredPrice),
              accent: true,
            },
            {
              label: 'باقة التاجر',
              value: formatPriceSar(merchantPrice),
            },
          ]}
          actions={
            <div
              role="tablist"
              aria-label="تبديل دورة الفوترة"
              className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/[0.08] border border-white/20"
            >
              <button
                type="button"
                role="tab"
                aria-selected={billing === 'monthly'}
                onClick={() => setBilling('monthly')}
                className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  billing === 'monthly'
                    ? 'bg-[#F4C569] text-[#0B231A]'
                    : 'text-emerald-100/85 hover:text-white'
                }`}
              >
                اشتراك شهري
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={billing === 'annual'}
                onClick={() => setBilling('annual')}
                className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  billing === 'annual'
                    ? 'bg-[#F4C569] text-[#0B231A]'
                    : 'text-emerald-100/85 hover:text-white'
                }`}
              >
                اشتراك سنوي (وفر 20%)
              </button>
            </div>
          }
          visual={
            <div className="flex flex-col justify-between h-full gap-2.5">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/15">
                <span className="text-xs font-extrabold text-white">
                  مقارنة تفاعلية للباقات ({billing === 'monthly' ? 'شهري' : 'سنوي'})
                </span>
                <span className="text-[11px] font-bold text-[#F4C569] tabular-nums">
                  عمولة البيع {commissionSettings?.commissionRatePercent ?? 1}%
                </span>
              </div>

              <div className="space-y-1.5">
                {bannerTiers.map((tier, idx) => {
                  const active = inspectedTierIdx === idx;
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => setInspectedTierIdx(idx)}
                      className={`w-full text-start p-2.5 rounded-xl border flex items-center justify-between gap-3 transition-all cursor-pointer ${
                        active
                          ? 'bg-[#F4C569]/15 border-[#F4C569] text-white'
                          : 'bg-white/[0.06] border-white/15 text-emerald-100/90 hover:border-[#F4C569]/55'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-display text-xs font-extrabold truncate text-white">
                          {tier.name}
                        </p>
                        <p className="text-[10px] truncate text-emerald-100/75">
                          {tier.desc}
                        </p>
                      </div>
                      <span className="font-display text-xs sm:text-sm font-extrabold tabular-nums shrink-0 text-[#F4C569]">
                        {tier.price}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-white/15 flex items-center justify-between gap-2 text-[11px]">
                <span className="text-emerald-100/80 truncate">{inspectedTier.highlight}</span>
                <button
                  type="button"
                  onClick={() => {
                    if (inspectedTier.id === 'free') {
                      onNavigate('add');
                    } else if (inspectedTier.id === 'featured') {
                      setSelectedPlan({
                        id: 'featured',
                        title: 'باقة الإعلان المميز',
                        priceMonthly: 99,
                        priceAnnual: 79,
                      });
                    } else {
                      setSelectedPlan({
                        id: 'merchant',
                        title: 'باقة التاجر / المربي',
                        priceMonthly: 299,
                        priceAnnual: 239,
                      });
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[#F4C569] hover:bg-[#ffd582] text-[#0B231A] font-extrabold shrink-0 cursor-pointer"
                >
                  {inspectedTier.id === 'free' ? 'ابدأ مجاناً' : 'اطلب التفعيل'}
                </button>
              </div>
            </div>
          }
          interactiveDock={
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2 text-emerald-100/85">
                <BadgePercent size={15} className="text-[#F4C569] shrink-0" aria-hidden="true" />
                <span>
                  عمولة {commissionSettings?.commissionRatePercent ?? 1}% فقط عند إتمام البيع
                  {commissionSettings?.promoEnabled !== false
                    ? ` · إعفاء أول ${commissionSettings?.promoFreeDays ?? 30} يوماً`
                    : ''}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href="#pricing-comparison-heading"
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-white/[0.08] border border-white/20 hover:border-[#F4C569] text-white font-bold inline-flex items-center gap-1"
                >
                  <span>جدول المقارنة</span>
                </a>
                <button
                  type="button"
                  onClick={() => onNavigate('commission')}
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-[#F4C569] hover:bg-[#ffd582] text-[#0B231A] font-extrabold inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>حاسبة العمولة</span>
                  <ArrowLeft size={13} aria-hidden="true" />
                </button>
              </div>
            </div>
          }
        />

      {/* Main Pricing Body */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-10">
        {/* Commission 1% + Launch Promo + Weekly Optional Featuring Banner */}
        <div className="rounded-2xl border border-[var(--color-green-ink)]/25 bg-[var(--color-cream)] p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-[var(--color-green-ink)]">
              <BadgePercent size={16} aria-hidden="true" />
              <span>نظام عمولة المنصة المعتمد</span>
            </div>
            <h2 className="font-display text-lg sm:text-xl font-extrabold text-[var(--color-ink)]">
              عمولة {commissionSettings?.commissionRatePercent ?? 1}% فقط على البائع بعد إتمام البيع عبر الموقع
            </h2>
            <p className="text-xs sm:text-sm text-[var(--color-muted)] leading-relaxed max-w-2xl">
              {commissionSettings?.promoEnabled !== false
                ? `إعفاء تشجيعي وقت الإطلاق لأول ${commissionSettings?.promoFreeDays ?? 30} يوماً أو أول ${commissionSettings?.promoFreeListingsCount ?? 2} بيعات مجانية، كما يمكنك طلب تمييز الإعلان في الرئيسية أسبوعياً بتكلفة اختيارية (${formatPriceSar(commissionSettings?.featuredWeeklyPriceSar ?? 35)} / أسبوع).`
                : `يمكنك أيضاً طلب تمييز وتثبيت إعلانك أسبوعياً بتكلفة اختيارية (${formatPriceSar(commissionSettings?.featuredWeeklyPriceSar ?? 35)} / أسبوع).`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('commission')}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            <span>حاسبة العمولة وسداد الحوالة</span>
            <ArrowLeft size={15} aria-hidden="true" />
          </button>
        </div>

        {/* Monthly / Annual Billing Toggle */}
        <div className="flex justify-center">
          <div
            role="tablist"
            aria-label="مدة الاشتراك"
            className="relative inline-flex items-center w-full max-w-[320px] p-1 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] shadow-md"
          >
            <button
              type="button"
              role="tab"
              aria-selected={billing === 'monthly'}
              onClick={() => setBilling('monthly')}
              className={`flex-1 h-10 rounded-full text-sm font-bold transition-colors cursor-pointer ${
                billing === 'monthly'
                  ? 'bg-[#0B3A29] text-white'
                  : 'text-[var(--color-ink)] hover:text-[var(--color-green-ink)]'
              }`}
            >
              شهري
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={billing === 'annual'}
              onClick={() => setBilling('annual')}
              className={`flex-1 h-10 rounded-full text-sm font-bold transition-colors cursor-pointer pl-6 ${
                billing === 'annual'
                  ? 'bg-[#0B3A29] text-white'
                  : 'text-[var(--color-ink)] hover:text-[var(--color-green-ink)]'
              }`}
            >
              سنوي
            </button>
            <span className="pointer-events-none absolute -top-2.5 left-3 px-2.5 py-0.5 rounded-full bg-[#f4c569] text-[#4a3410] text-[11px] font-extrabold shadow-xs">
              وفر أكثر
            </span>
          </div>
        </div>

        {/* 3 Plan Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          {/* Free Plan */}
          <article className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 flex flex-col shadow-sm">
            <div className="flex items-start gap-3.5">
              <span className="w-11 h-11 rounded-full bg-[#e3f1ea] dark:bg-[#145C42]/30 text-[#0B3A29] dark:text-[#5ED1A1] flex items-center justify-center shrink-0">
                <User size={21} aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-display text-lg font-extrabold text-[var(--color-ink)]">
                  الباقة المجانية
                </h2>
                <p className="mt-1 text-xs text-[var(--color-muted)] leading-relaxed">
                  مثالية للأفراد والمربين الراغبين في عرض مواشيهم مجاناً
                </p>
              </div>
            </div>

            <div className="mt-5 pb-4 border-b border-[var(--color-border)] min-h-[86px] flex items-baseline gap-2.5">
              <strong className="font-display text-3xl font-extrabold text-[var(--color-green-ink)]">
                مجاناً
              </strong>
              <small className="text-sm font-medium text-[var(--color-muted)]">دائماً</small>
            </div>

            <ul className="mt-5 mb-7 space-y-3 flex-1 text-sm text-[var(--color-ink)]">
              {[
                'إنشاء حساب وتفعيل الملف الشخصي',
                'نشر إعلانات أساسية في السوق',
                'إضافة الصور والفيديوهات التوضيحية',
                'التواصل والمفاوضة مع المشترين والبائعين',
                'إدارة الإعلانات من لوحة حسابي',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <Check
                    size={16}
                    strokeWidth={2.5}
                    className="text-[var(--color-green-ink)] shrink-0"
                    aria-hidden="true"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => onNavigate('add')}
              className="w-full min-h-[44px] rounded-full border-2 border-[var(--color-green-ink)] text-[var(--color-green-ink)] hover:bg-[var(--color-green)] hover:text-white hover:border-[var(--color-green)] font-bold text-sm transition-colors cursor-pointer"
            >
              ابدأ الآن
            </button>
          </article>

          {/* Featured Listing Plan (Highlighted) */}
          <article className="relative overflow-hidden bg-[#123b2c] dark:bg-[#0D2E22] border border-[#123b2c] text-white rounded-2xl p-6 flex flex-col shadow-xl">
            <span className="absolute top-5 -left-10 w-36 py-1 bg-[#f4c569] text-[#14392a] text-center text-[11px] font-extrabold -rotate-45 shadow-sm">
              الأكثر طلباً
            </span>

            <div className="flex items-start gap-3.5">
              <span className="w-11 h-11 rounded-full bg-[#f4c569] text-[#14392a] flex items-center justify-center shrink-0">
                <Star size={20} className="fill-current" aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-display text-lg font-extrabold text-white">
                  باقة الإعلان المميز
                </h2>
                <p className="mt-1 text-xs text-white/80 leading-relaxed">
                  لزيادة ظهور إعلانك والوصول إلى عدد أكبر من المهتمين
                </p>
              </div>
            </div>

            <div className="mt-5 pb-4 border-b border-white/15 min-h-[86px]">
              <div className="flex items-baseline gap-2">
                <strong className="font-display text-4xl font-extrabold text-white tabular-nums">
                  {featuredPrice}
                </strong>
                <span className="text-sm font-bold text-[#f4c569]">ريال</span>
              </div>
              <small className="block mt-1 text-xs text-white/80">{periodLabel}</small>
            </div>

            <ul className="mt-5 mb-7 space-y-3 flex-1 text-sm text-white/95">
              {[
                'ظهور الإعلان في مقدمة نتائج البحث',
                'تمييز الإعلان بتصميم وأولوية خاصة',
                'إضافة عدد أكبر من الصور والفيديوهات',
                'إحصائيات المشاهدات ومؤشرات الاهتمام',
                'دعم فني مخصص وأولوية في المراجعة',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <Check
                    size={16}
                    strokeWidth={2.5}
                    className="text-[#f4c569] shrink-0"
                    aria-hidden="true"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() =>
                setSelectedPlan({
                  id: 'featured',
                  title: 'باقة الإعلان المميز',
                  priceMonthly: 99,
                  priceAnnual: 79,
                })
              }
              className="w-full min-h-[44px] rounded-full bg-[#f4c569] hover:bg-[#ffd582] text-[#14392a] font-extrabold text-sm transition-colors cursor-pointer"
            >
              اختر الباقة
            </button>
          </article>

          {/* Breeder / Merchant Plan */}
          <article className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 flex flex-col shadow-sm">
            <div className="flex items-start gap-3.5">
              <span className="w-11 h-11 rounded-full bg-[#fbebc7] dark:bg-[#3A2D13] text-[#c4862b] dark:text-[#E0A84B] flex items-center justify-center shrink-0">
                <Crown size={21} className="fill-current" aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-display text-lg font-extrabold text-[var(--color-ink)]">
                  باقة التاجر / المربي
                </h2>
                <p className="mt-1 text-xs text-[var(--color-muted)] leading-relaxed">
                  مخصصة للتجار والمربين وأصحاب المزارع والمراحات الكبيرة
                </p>
              </div>
            </div>

            <div className="mt-5 pb-4 border-b border-[var(--color-border)] min-h-[86px]">
              <div className="flex items-baseline gap-2">
                <strong className="font-display text-4xl font-extrabold text-[var(--color-green-ink)] tabular-nums">
                  {merchantPrice}
                </strong>
                <span className="text-sm font-bold text-[var(--color-green-ink)]">ريال</span>
              </div>
              <small className="block mt-1 text-xs text-[var(--color-muted)]">{periodLabel}</small>
            </div>

            <ul className="mt-5 mb-7 space-y-3 flex-1 text-sm text-[var(--color-ink)]">
              {[
                'عدد غير محدود من الإعلانات النشطة',
                'إدارة احترافية ومتكاملة للمراح',
                'تحليلات تفصيلية للأداء والمشاهدات',
                'إبراز العلامة التجارية وشارة الموثوقية',
                'دعم فني مخصص على مدار الساعة',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <Check
                    size={16}
                    strokeWidth={2.5}
                    className="text-[var(--color-green-ink)] shrink-0"
                    aria-hidden="true"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() =>
                setSelectedPlan({
                  id: 'merchant',
                  title: 'باقة التاجر / المربي',
                  priceMonthly: 299,
                  priceAnnual: 239,
                })
              }
              className="w-full min-h-[44px] rounded-full border-2 border-[var(--color-green-ink)] text-[var(--color-green-ink)] hover:bg-[var(--color-green)] hover:text-white hover:border-[var(--color-green)] font-bold text-sm transition-colors cursor-pointer"
            >
              اختر الباقة
            </button>
          </article>
        </div>

        {/* Comparison Table */}
        <section
          aria-labelledby="pricing-comparison-heading"
          className="bg-[var(--color-cream)]/60 border border-[var(--color-border)] rounded-2xl p-5 sm:p-7"
        >
          <h2
            id="pricing-comparison-heading"
            className="font-display text-xl font-extrabold text-[var(--color-ink)] mb-5"
          >
            مقارنة بين الباقات
          </h2>
          <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <table className="w-full min-w-[600px] border-collapse text-sm">
              <thead>
                <tr className="bg-[var(--color-cream)] text-[var(--color-ink)] border-b border-[var(--color-border)]">
                  <th scope="col" className="text-right font-bold px-4 py-3.5 w-[34%]">
                    الميزة
                  </th>
                  <th scope="col" className="text-center font-bold px-4 py-3.5">
                    المجانية
                  </th>
                  <th scope="col" className="text-center font-bold px-4 py-3.5 text-[var(--color-green-ink)]">
                    المميزة
                  </th>
                  <th scope="col" className="text-center font-bold px-4 py-3.5">
                    التاجر / المربي
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.feature} className="hover:bg-[var(--color-cream)]/40 transition-colors">
                    <th scope="row" className="text-right font-semibold text-[var(--color-ink)] px-4 py-3">
                      {row.feature}
                    </th>
                    <td className="text-center px-4 py-3">{renderCell(row.free)}</td>
                    <td className="text-center px-4 py-3">{renderCell(row.featured)}</td>
                    <td className="text-center px-4 py-3">{renderCell(row.merchant)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Bottom CTA Strip */}
        <section className="rounded-2xl bg-[#165038] dark:bg-[#103828] text-white px-6 py-5 sm:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md">
          <div className="flex items-start sm:items-center gap-3.5">
            <span className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
              <Bell size={20} aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-display text-base sm:text-lg font-extrabold">
                استمر في ظهور إعلانك وكن أقرب إلى عملائك
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm text-white/80">
                الباقات الاحترافية تمنحك أدوات إبراز إضافية لتوسيع انتشار مراحك وزيادة المبيعات
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('contact')}
            className="min-h-[42px] px-6 rounded-full bg-white hover:bg-[#f4c569] text-[#0B3A29] font-extrabold text-sm inline-flex items-center gap-2 transition-colors shrink-0 cursor-pointer"
          >
            <span>تواصل معنا</span>
            <ArrowLeft size={15} aria-hidden="true" />
          </button>
        </section>
      </section>

      {/* Plan Inquiry Modal */}
      <Modal
        open={Boolean(selectedPlan)}
        onClose={() => setSelectedPlan(null)}
        title={selectedPlan ? `طلب تفعيل ${selectedPlan.title}` : ''}
        subtitle={
          selectedPlan
            ? `${billing === 'monthly' ? selectedPlan.priceMonthly : selectedPlan.priceAnnual} ريال (${periodLabel})`
            : undefined
        }
      >
        {selectedPlan && (
          <form onSubmit={handleConfirmPlanRequest} className="space-y-4">
            <p className="text-sm text-[var(--color-muted)] leading-relaxed">
              تُفعّل الباقات المدفوعة بعد مراجعة حساب المربي وتوثيق بيانات المراح عبر لوحة حسابي لضمان موثوقية الإعلانات في السوق.
            </p>
            <div>
              <label
                htmlFor="plan-request-note"
                className="block text-xs font-bold text-[var(--color-ink)] mb-1.5"
              >
                ملاحظات إضافية (اختياري)
              </label>
              <textarea
                id="plan-request-note"
                rows={3}
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
                placeholder="مثال: اسم المراح، عدد الرؤوس المتوقعة شهرياً..."
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/50 px-3.5 py-2.5 text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
              />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setSelectedPlan(null)}
                className="min-h-[42px] px-4 rounded-lg border border-[var(--color-border)] text-sm font-semibold text-[var(--color-muted)] hover:text-[var(--color-ink)] cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="min-h-[42px] px-5 rounded-lg bg-[#0B3A29] hover:bg-[#145C42] text-white text-sm font-bold cursor-pointer"
              >
                {isSignedIn ? 'متابعة إلى لوحة حسابي' : 'تسجيل الدخول للمتابعة'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
