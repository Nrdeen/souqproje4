import { useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  Calculator,
  CheckCircle2,
  Gift,
  Headphones,
  Layers,
  MapPin,
  MessageSquare,
  PlusCircle,
  Send,
  ShieldCheck,
  TrendingUp,
  Truck,
  Wheat,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  isValidSaudiMobile,
  normalizeSaudiPhoneDigits,
  SAUDI_REGIONS_13,
  SERVICE_PARTNER_TYPES,
} from '../lib/marketplace-tools';
import type { PageView } from '../lib/router';
import { DynamicHeroBanner } from './DynamicHeroBanner';

interface ServicesViewProps {
  onNavigate: (page: PageView) => void;
  onContactSupport: () => void;
  onNotify: (msg: string) => void;
}

type AudienceFilter = 'all' | 'buy' | 'sell' | 'breed';

interface ServiceItem {
  id: string;
  title: string;
  subtitle: string;
  points: string[];
  audiences: Array<'buy' | 'sell' | 'breed'>;
  ctaLabel: string;
  targetPage: PageView;
  icon: typeof PlusCircle;
}

const SERVICES_CATALOG: ServiceItem[] = [
  {
    id: 'srv-add',
    title: 'أضف إعلانك مجاناً',
    subtitle: 'انشر عرضك خلال دقائق ووصّل قطيعك مباشرة إلى المشترين المهتمين بدون وسطاء.',
    points: ['نشر مجاني بلا عمولة', 'تواصل مباشر مع المشتري عبر الرسائل والجوال'],
    audiences: ['sell'],
    ctaLabel: 'أضف إعلانك الآن',
    targetPage: 'add',
    icon: PlusCircle,
  },
  {
    id: 'srv-breeders',
    title: 'المزارع والمربون المعتمدون',
    subtitle: 'تعرّف على أصحاب المراحات الموثقين وتصفح تقييمات المشترين السابقين قبل الشراء.',
    points: ['شارة «مربي موثق» بعد التحقق', 'عرض تاريخ الخبرة وتفاصيل السلالات'],
    audiences: ['buy', 'breed'],
    ctaLabel: 'استعراض المربين',
    targetPage: 'breeders',
    icon: BadgeCheck,
  },
  {
    id: 'srv-prices',
    title: 'مؤشر الأسعار الموسمي',
    subtitle: 'تابع متوسطات الأسعار الاسترشادية واتجاهات السوق خلال العام لمختلف السلالات.',
    points: ['منحنى موسمي تفاعلي لـ 12 شهراً', 'مقارنة النطاقات السعرية بين السلالات'],
    audiences: ['buy', 'sell'],
    ctaLabel: 'عرض مؤشر الأسعار',
    targetPage: 'breeds',
    icon: TrendingUp,
  },
  {
    id: 'srv-feast',
    title: 'حاسبة الولائم الذكية',
    subtitle: 'احسب العدد التقديري للذبائح وكمية الأرز والتكلفة المتوقعة حسب عدد الضيوف.',
    points: ['تقدير فوري ودقيق للحصة والتكلفة', 'ملائمة لحفلات الزواج والعزائم والعقيقة'],
    audiences: ['buy'],
    ctaLabel: 'افتح حاسبة الولائم',
    targetPage: 'feast',
    icon: Calculator,
  },
  {
    id: 'srv-occasions',
    title: 'توصيات حسب المناسبة',
    subtitle: 'اختر المناسبة لتحصل على ترشيحات السلالة والوزن والسن والميزانية الأنسب.',
    points: ['باقات جاهزة للعقيقة والزواج والتربية', 'إرشادات فحص قبل إتمام الشراء'],
    audiences: ['buy'],
    ctaLabel: 'تصفح المناسبات',
    targetPage: 'occasions',
    icon: Gift,
  },
  {
    id: 'srv-breeds',
    title: 'دليل السلالات السعودية',
    subtitle: 'موسوعة مرجعية لخصائص النعيمي والنجدي والحري والعارضي والسواكني وأوزانها الشائعة.',
    points: ['مواصفات وموطن كل سلالة', 'ربط مباشر مع الإعلانات المتاحة'],
    audiences: ['buy', 'breed'],
    ctaLabel: 'استعرض الدليل',
    targetPage: 'breeds',
    icon: BookOpen,
  },
  {
    id: 'srv-transport',
    title: 'حاسبة تكلفة نقل المواشي',
    subtitle: 'قدّر تكلفة الشحن بين مدن ومناطق المملكة حسب المسافة وعدد الرؤوس وفئة الناقلة.',
    points: ['تشمل خيارات الرعاية البيطرية ومحطة الأعلاف', 'توصية تلقائية بسعة الناقلة المناسبة'],
    audiences: ['buy', 'sell', 'breed'],
    ctaLabel: 'افتح حاسبة النقل',
    targetPage: 'transport',
    icon: Truck,
  },
  {
    id: 'srv-feed',
    title: 'مخطط الأعلاف والتسمين',
    subtitle: 'احسب الكمية الشهرية من أكياس الشعير وبالات البرسيم وميزانية التغذية للقطيع بالريال.',
    points: ['مخصص للأغنام والماعز (صيانة / تسمين / إنتاج)', 'تعديل مرن لأسعار الأعلاف حسب منطقتك'],
    audiences: ['sell', 'breed'],
    ctaLabel: 'افتح مخطط الأعلاف',
    targetPage: 'feed',
    icon: Wheat,
  },
];

const JOURNEY_STEPS = [
  {
    num: '01',
    title: 'ابحث وقارن',
    body: 'حدّد السلالة والمنطقة والغرض وقارن بين الإعلانات والمواصفات ومؤشر الأسعار.',
  },
  {
    num: '02',
    title: 'عاين وتأكد',
    body: 'راجع الصور والفيديو، اطّلع على حالة التحصين، وتواصل مباشرة مع المربي للاستفسار.',
  },
  {
    num: '03',
    title: 'اتفق وأتمّ',
    body: 'قدّم عرض السعر أو اطلب خدمة النقل والفحص البيطري المرافقة لإتمام صفقتك باطمئنان.',
  },
];

export function ServicesView({ onNavigate, onContactSupport, onNotify }: ServicesViewProps) {
  const [audience, setAudience] = useState<AudienceFilter>('all');

  const [serviceType, setServiceType] = useState<string>(SERVICE_PARTNER_TYPES[0]);
  const [region, setRegion] = useState<string>(SAUDI_REGIONS_13[0]);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [submittedRef, setSubmittedRef] = useState<{
    referenceId: string;
    serviceType: string;
    region: string;
  } | null>(null);

  const visibleServices =
    audience === 'all'
      ? SERVICES_CATALOG
      : SERVICES_CATALOG.filter((s) => s.audiences.includes(audience));

  const filterTabs: Array<{ id: AudienceFilter; label: string; count: number }> = [
    { id: 'all', label: 'الكل', count: SERVICES_CATALOG.length },
    {
      id: 'buy',
      label: 'للمشتري',
      count: SERVICES_CATALOG.filter((s) => s.audiences.includes('buy')).length,
    },
    {
      id: 'sell',
      label: 'للبائع',
      count: SERVICES_CATALOG.filter((s) => s.audiences.includes('sell')).length,
    },
    {
      id: 'breed',
      label: 'للمربي',
      count: SERVICES_CATALOG.filter((s) => s.audiences.includes('breed')).length,
    },
  ];

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const cleanPhone = normalizeSaudiPhoneDigits(phone);
    if (!isValidSaudiMobile(cleanPhone)) {
      setFormError('أدخل رقم جوال سعودي صحيح يبدأ بـ 05 ويتكون من 10 أرقام');
      return;
    }
    if (details.trim().length < 6) {
      setFormError('يرجى كتابة تفاصيل الطلب (6 أحرف على الأقل)');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.submitServiceRequest({
        serviceType,
        region,
        phone: cleanPhone,
        name: name.trim() || undefined,
        details: details.trim(),
      });
      setSubmittedRef({
        referenceId: res.referenceId,
        serviceType: res.serviceType,
        region: res.region,
      });
      setPhone('');
      setName('');
      setDetails('');
      onNotify(`تم تسجيل طلب الخدمة برقم مرجعي ${res.referenceId}`);
    } catch (err: any) {
      setFormError(err?.message || 'تعذر إرسال الطلب، حاول مرة أخرى');
    } finally {
      setSubmitting(false);
    }
  };

  const selectServiceAndScroll = (targetType: string) => {
    setServiceType(targetType);
    const el = document.getElementById('service-request');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="bg-[var(--color-canvas)] transition-colors">
      <DynamicHeroBanner
        pageKey="services"
        variant="emerald-royal"
          breadcrumbs={[
            { label: 'الرئيسية', onClick: () => onNavigate('home') },
            { label: 'الخدمات والأدوات' },
          ]}
          contextLabel="تغطية 13 منطقة إدارية"
          stats={[
            {
              label: 'أدوات وخدمات',
              value: SERVICES_CATALOG.length.toLocaleString('en-US'),
              accent: true,
            },
            {
              label: 'مناطق التغطية',
              value: SAUDI_REGIONS_13.length.toLocaleString('en-US'),
            },
            {
              label: 'مسارات الطلب',
              value: SERVICE_PARTNER_TYPES.length.toLocaleString('en-US'),
            },
          ]}
          actions={
            <>
              <a
                href="#service-request"
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#F4C569] hover:bg-[#ffd582] text-[#0B231A] text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 whitespace-nowrap transition-colors shadow-sm"
              >
                <span>اطلب خدمة نقل أو فحص</span>
                <ArrowLeft size={15} aria-hidden="true" />
              </a>
              <button
                type="button"
                onClick={() => onNavigate('pricing')}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-white/25 bg-white/[0.08] hover:border-[#F4C569] text-white text-xs sm:text-sm font-bold whitespace-nowrap transition-colors cursor-pointer"
              >
                عرض الباقات والأسعار
              </button>
            </>
          }
          visual={
            <div className="flex flex-col justify-between h-full gap-3">
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/15">
                <span className="text-xs font-extrabold text-white">
                  مجهّز مسار الخدمة الميدانية
                </span>
                <select
                  aria-label="اختيار منطقة الخدمة"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="px-2 py-1 rounded-lg bg-white/[0.08] border border-white/20 text-[11px] font-bold text-[#F4C569] focus:outline-none focus:border-[#F4C569] cursor-pointer"
                >
                  {SAUDI_REGIONS_13.map((r) => (
                    <option key={r} value={r} className="bg-[#0B231A] text-white">
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                {SERVICE_PARTNER_TYPES.slice(0, 3).map((srvType, idx) => {
                  const selected = serviceType === srvType;
                  const NodeIcon = idx === 0 ? Truck : idx === 1 ? ShieldCheck : Layers;
                  return (
                    <button
                      key={srvType}
                      type="button"
                      onClick={() => selectServiceAndScroll(srvType)}
                      className={`w-full p-2.5 rounded-xl border text-start flex items-center justify-between gap-2.5 transition-colors cursor-pointer ${
                        selected
                          ? 'bg-[#F4C569] text-[#0B231A] border-[#F4C569]'
                          : 'bg-white/[0.06] border-white/15 text-white hover:border-[#F4C569]/65'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            selected
                              ? 'bg-[#0B231A]/15 text-[#0B231A]'
                              : 'bg-white/[0.08] border border-white/15 text-[#F4C569]'
                          }`}
                        >
                          <NodeIcon size={16} aria-hidden="true" />
                        </span>
                        <span className="text-xs font-bold truncate">{srvType}</span>
                      </span>
                      <ArrowLeft
                        size={14}
                        className={selected ? 'text-[#0B231A] shrink-0' : 'text-[#F4C569] shrink-0'}
                        aria-hidden="true"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          }
          interactiveDock={
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 sm:pb-0 sm:flex-wrap">
                {filterTabs.map((tab) => {
                  const active = audience === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setAudience(tab.id)}
                      className={`min-h-[32px] px-3 py-1 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer tabular-nums ${
                        active
                          ? 'bg-[#F4C569] text-[#0B231A] border-[#F4C569]'
                          : 'bg-white/[0.07] border-white/15 text-white hover:border-[#F4C569]/60'
                      }`}
                    >
                      {tab.label} ({tab.count})
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px] font-semibold text-emerald-100/80">
                المسار المحدد: <strong className="text-[#F4C569]">{serviceType}</strong> · {region}
              </span>
            </div>
          }
        />

      {/* Catalog Section with Audience Filter Tabs */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-extrabold text-[var(--color-ink)]">
              قائمة خدمات وأدوات المنصة
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              صفّ الخدمات حسب دورك للوصول السريع للأداة المطلوبة
            </p>
          </div>

          <div
            role="tablist"
            aria-label="تصفية الخدمات حسب الفئة"
            className="inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-x-auto no-scrollbar max-w-full"
          >
            {filterTabs.map((tab) => {
              const active = audience === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setAudience(tab.id)}
                  className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer tabular-nums ${
                    active
                      ? 'bg-[var(--color-green)] text-white'
                      : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                  }`}
                >
                  {tab.label} ({tab.count})
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {visibleServices.map((item) => {
            const Icon = item.icon;
            return (
              <article
                key={item.id}
                className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 flex flex-col justify-between gap-5 shadow-[0_2px_12px_-8px_rgba(16,60,44,0.14)] hover:border-[var(--color-gold)] transition-colors"
              >
                <div className="space-y-3">
                  <div className="w-11 h-11 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)] text-[var(--color-green-ink)] flex items-center justify-center">
                    <Icon size={21} aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-extrabold text-[var(--color-ink)]">
                      {item.title}
                    </h3>
                    <p className="mt-1.5 text-sm text-[var(--color-muted)] leading-relaxed">
                      {item.subtitle}
                    </p>
                  </div>
                  <ul className="space-y-1.5 pt-1 text-xs font-medium text-[var(--color-ink)]">
                    {item.points.map((pt) => (
                      <li key={pt} className="flex items-start gap-2">
                        <CheckCircle2
                          size={15}
                          className="text-[var(--color-green-ink)] shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigate(item.targetPage)}
                  className="min-h-[42px] w-full px-4 py-2 rounded-xl border border-[var(--color-green-ink)]/30 bg-[var(--color-cream)]/60 hover:bg-[var(--color-green)] hover:text-white hover:border-[var(--color-green)] text-[var(--color-green-ink)] text-xs sm:text-sm font-bold inline-flex items-center justify-between gap-2 transition-colors cursor-pointer"
                >
                  <span>{item.ctaLabel}</span>
                  <ArrowLeft size={15} aria-hidden="true" />
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {/* 3-Step Journey + 4 Service Highlights */}
      <section className="bg-[var(--color-cream)]/60 border-y border-[var(--color-border)] py-10 sm:py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-extrabold text-[var(--color-ink)]">
                كيف نخدمك خطوة بخطوة؟
              </h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                مسار واضح من البحث والمقارنة حتى الاستلام الآمن
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('how')}
              className="text-sm font-bold text-[var(--color-green-ink)] hover:underline inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>اقرأ الدليل الكامل لكيفية عمل السوق</span>
              <ArrowLeft size={15} aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {JOURNEY_STEPS.map((step) => (
              <div
                key={step.num}
                className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 space-y-2.5"
              >
                <span className="font-display text-2xl font-extrabold text-[var(--color-gold)] tabular-nums block">
                  {step.num}
                </span>
                <h3 className="font-display text-lg font-bold text-[var(--color-ink)]">
                  {step.title}
                </h3>
                <p className="text-sm text-[var(--color-muted)] leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                icon: ShieldCheck,
                title: 'بيانات موثّقة',
                desc: 'مراجعة إدارية للبيانات والشهادات قبل الاعتماد.',
              },
              {
                icon: MessageSquare,
                title: 'تواصل مباشر',
                desc: 'تفاوض فوري بدون عمولات وساطة خفية.',
              },
              {
                icon: MapPin,
                title: 'كل مناطق المملكة',
                desc: 'تغطية لـ 13 منطقة سعودية ومزودي خدمات محليين.',
              },
              {
                icon: Headphones,
                title: 'دعم واستفسارات',
                desc: 'فريق مساندة لمتابعة طلبات الخدمات والاستفسارات.',
              },
            ].map((pill) => {
              const PillIcon = pill.icon;
              return (
                <div
                  key={pill.title}
                  className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 flex items-start gap-3"
                >
                  <span className="w-9 h-9 rounded-lg bg-[var(--color-cream)] border border-[var(--color-border)] text-[var(--color-green-ink)] flex items-center justify-center shrink-0">
                    <PillIcon size={17} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="font-display text-sm font-bold text-[var(--color-ink)]">
                      {pill.title}
                    </h3>
                    <p className="mt-0.5 text-xs text-[var(--color-muted)] leading-relaxed">
                      {pill.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Partner Service Request Form */}
      <section
        id="service-request"
        aria-labelledby="service-request-heading"
        className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-14"
      >
        <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-[var(--color-border)]">
            <div>
              <h2
                id="service-request-heading"
                className="font-display text-2xl font-extrabold text-[var(--color-ink)]"
              >
                طلب خدمة مساندة (نقل / أعلاف / بيطرة / تجهيز ولائم)
              </h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                أرسل تفاصيل احتياجك ليتم ربطك بأقرب مزود خدمة معتمد في منطقتك.
              </p>
            </div>
            <Layers size={24} className="text-[var(--color-gold)] shrink-0" aria-hidden="true" />
          </div>

          {submittedRef ? (
            <div className="mt-6 rounded-xl bg-[var(--color-cream)] border border-[var(--color-green-ink)]/25 p-6 text-center space-y-3">
              <CheckCircle2
                size={34}
                className="mx-auto text-[var(--color-green-ink)]"
                aria-hidden="true"
              />
              <h3 className="font-display text-lg font-extrabold text-[var(--color-ink)]">
                تم استلام طلب الخدمة بنجاح
              </h3>
              <p className="text-sm text-[var(--color-muted)]">
                الخدمة: <strong className="text-[var(--color-ink)]">{submittedRef.serviceType}</strong> ·
                المنطقة: <strong className="text-[var(--color-ink)]">{submittedRef.region}</strong>
              </p>
              <p className="text-xs font-bold text-[var(--color-green-ink)] tabular-nums">
                الرقم المرجعي للطلب: {submittedRef.referenceId}
              </p>
              <button
                type="button"
                onClick={() => setSubmittedRef(null)}
                className="mt-2 min-h-[40px] px-5 py-2 rounded-xl border border-[var(--color-green-ink)] text-[var(--color-green-ink)] hover:bg-[var(--color-green)] hover:text-white text-xs font-bold transition-colors cursor-pointer"
              >
                إرسال طلب خدمة آخر
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmitRequest} noValidate className="mt-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="srv-type"
                    className="block text-xs font-bold text-[var(--color-ink)] mb-1.5"
                  >
                    نوع الخدمة المطلوبة *
                  </label>
                  <select
                    id="srv-type"
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] px-3.5 text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                  >
                    {SERVICE_PARTNER_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="srv-region"
                    className="block text-xs font-bold text-[var(--color-ink)] mb-1.5"
                  >
                    المنطقة *
                  </label>
                  <select
                    id="srv-region"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] px-3.5 text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                  >
                    {SAUDI_REGIONS_13.map((reg) => (
                      <option key={reg} value={reg}>
                        {reg}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="srv-phone"
                    className="block text-xs font-bold text-[var(--color-ink)] mb-1.5"
                  >
                    رقم الجوال للتواصل *
                  </label>
                  <input
                    id="srv-phone"
                    type="tel"
                    inputMode="numeric"
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="05XXXXXXXX"
                    className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] px-3.5 text-sm text-[var(--color-ink)] text-right placeholder:text-[var(--color-muted)]/60 focus:outline-none focus:border-[var(--color-green-ink)]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="srv-name"
                    className="block text-xs font-bold text-[var(--color-ink)] mb-1.5"
                  >
                    الاسم أو اسم المراح (اختياري)
                  </label>
                  <input
                    id="srv-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مثال: مراح النخبة — الرياض"
                    className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] px-3.5 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/60 focus:outline-none focus:border-[var(--color-green-ink)]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="srv-details"
                  className="block text-xs font-bold text-[var(--color-ink)] mb-1.5"
                >
                  تفاصيل الطلب (عدد الرؤوس، مسار النقل أو موعد المناسبة) *
                </label>
                <textarea
                  id="srv-details"
                  rows={3}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="اذكر خط السير أو نوع العلف أو عدد الذبائح المطلوبة..."
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] px-3.5 py-2.5 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/60 focus:outline-none focus:border-[var(--color-green-ink)]"
                />
              </div>

              {formError && (
                <p role="alert" className="text-xs font-semibold text-red-700 dark:text-red-400">
                  {formError}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] disabled:opacity-60 text-white text-sm font-bold inline-flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Send size={15} aria-hidden="true" />
                  <span>{submitting ? 'جاري الإرسال...' : 'إرسال طلب الخدمة'}</span>
                </button>

                <button
                  type="button"
                  onClick={onContactSupport}
                  className="text-xs font-bold text-[var(--color-green-ink)] hover:underline cursor-pointer"
                >
                  أو تواصل مباشرة مع فريق الدعم
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
