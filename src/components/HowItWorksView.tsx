import { useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ClipboardCheck,
  Headphones,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type { PageView } from '../lib/router';
import { DynamicHeroBanner } from './DynamicHeroBanner';

interface HowItWorksViewProps {
  onNavigate: (page: PageView) => void;
  onContactSupport: () => void;
}

const BUYER_STEPS = [
  {
    num: '01',
    title: 'ابحث بالسلالة والمنطقة',
    body: 'استخدم فلاتر السوق للوصول إلى النعيمي أو النجدي أو الحري أو العارضي حسب مدينتك ونطاق ميزانيتك.',
    actionLabel: 'تصفح الإعلانات',
    target: 'listings' as PageView,
  },
  {
    num: '02',
    title: 'قارن بالسعر الاسترشادي',
    body: 'راجع مؤشر الأسعار الموسمي ومواصفات العمر والوزن وحالة التحصين الظاهرة داخل بطاقة العرض.',
    actionLabel: 'مؤشر الأسعار',
    target: 'breeds' as PageView,
  },
  {
    num: '03',
    title: 'تواصل وقدّم عرضك',
    body: 'راسل المربي مباشرة أو أرسل عرض سعر منظماً مع الكمية المطلوبة وتابع رده الفوري.',
    actionLabel: 'المربون المعتمدون',
    target: 'breeders' as PageView,
  },
  {
    num: '04',
    title: 'عاين واستلم بأمان',
    body: 'نسّق المعاينة المباشرة أو اطلب خدمة النقل المجهز والفحص البيطري عبر قائمة الخدمات.',
    actionLabel: 'خدمات النقل والفحص',
    target: 'services' as PageView,
  },
];

const SELLER_STEPS = [
  {
    num: '01',
    title: 'أنشئ حسابك ووثّق مراحك',
    body: 'سجّل حساب بائع وارفع طلب توثيق المراح للحصول على شارة «مربي موثق» وتعزيز ثقة المشترين.',
    actionLabel: 'حسابي والتوثيق',
    target: 'dashboard' as PageView,
  },
  {
    num: '02',
    title: 'انشر إعلاناً واضح المواصفات',
    body: 'أضف صوراً وفيديو واضحاً، وحدد السلالة والعمر والوزن والكمية وحالة التحصين والسعر بشفافية.',
    actionLabel: 'أضف إعلانك مجاناً',
    target: 'add' as PageView,
  },
  {
    num: '03',
    title: 'استقبل المحادثات وعروض السعر',
    body: 'تابع الأسئلة والتعليقات وعروض السعر الواردة من المشترين واقبل أو ارفض بضغطة واحدة.',
    actionLabel: 'لوحة العروض',
    target: 'dashboard' as PageView,
  },
  {
    num: '04',
    title: 'ميّز عروضك لانتشار أوسع',
    body: 'اختر باقة الإعلان المميز أو باقة التاجر والمربي لتصدر نتائج البحث ومضاعفة الوصول.',
    actionLabel: 'الباقات والأسعار',
    target: 'pricing' as PageView,
  },
];

const SAFE_BUYING_RULES = [
  'تأكد من مطابقة وصف السلالة والعمر والوزن مع الصور والفيديو قبل الاتفاق النهائي.',
  'احرص على المعاينة أو فحص الشهادة الصحية قبل التحويل المالي، واحفظ المحادثة داخل المنصة.',
  'أبلغ فوراً عبر زر الإبلاغ في أي إعلان إذا لاحظت بيانات مضللة أو تعاملاً غير منضبط.',
];

export function HowItWorksView({ onNavigate, onContactSupport }: HowItWorksViewProps) {
  const [roleTab, setRoleTab] = useState<'buyer' | 'seller'>('buyer');
  const [activeStepIdx, setActiveStepIdx] = useState<number>(0);
  const steps = roleTab === 'buyer' ? BUYER_STEPS : SELLER_STEPS;
  const activeStep = steps[activeStepIdx] || steps[0];

  return (
    <section className="bg-[var(--color-canvas)] transition-colors">
      <DynamicHeroBanner
        pageKey="how-it-works"
        variant="oasis-horizon"
        breadcrumbs={[
          { label: 'الرئيسية', onClick: () => onNavigate('home') },
          { label: 'كيف يعمل السوق' },
        ]}
        contextLabel={roleTab === 'buyer' ? 'مسار المشتري · 4 خطوات' : 'مسار البائع والمربي · 4 خطوات'}
        actions={
          <div
            role="tablist"
            aria-label="اختر دورك في السوق"
            className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/[0.08] border border-white/20 shrink-0"
          >
            <button
              type="button"
              role="tab"
              aria-selected={roleTab === 'buyer'}
              onClick={() => {
                setRoleTab('buyer');
                setActiveStepIdx(0);
              }}
              className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors cursor-pointer ${
                roleTab === 'buyer'
                  ? 'bg-[#F4C569] text-[#0B231A]'
                  : 'text-emerald-100/85 hover:text-white'
              }`}
            >
              أنا مشترٍ
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={roleTab === 'seller'}
              onClick={() => {
                setRoleTab('seller');
                setActiveStepIdx(0);
              }}
              className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors cursor-pointer ${
                roleTab === 'seller'
                  ? 'bg-[#F4C569] text-[#0B231A]'
                  : 'text-emerald-100/85 hover:text-white'
              }`}
            >
              أنا بائع / مربٍّ
            </button>
          </div>
        }
        visual={
          <div className="flex flex-col justify-between h-full gap-2.5">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/15">
              <span className="text-xs font-extrabold text-white">
                {roleTab === 'buyer' ? 'مراحل الشراء الآمن' : 'مراحل النشر والبيع المباشر'}
              </span>
              <span className="text-[11px] font-bold text-[#F4C569] tabular-nums">
                خطوة {activeStep.num} / 04
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {steps.map((s, idx) => {
                const selected = idx === activeStepIdx;
                return (
                  <button
                    key={s.num}
                    type="button"
                    onClick={() => setActiveStepIdx(idx)}
                    className={`p-2 rounded-xl border text-start transition-colors cursor-pointer space-y-0.5 ${
                      selected
                        ? 'bg-[#F4C569]/15 border-[#F4C569] text-white'
                        : 'bg-white/[0.06] border-white/15 text-emerald-100/85 hover:border-[#F4C569]/60'
                    }`}
                  >
                    <span className="font-display text-[11px] font-extrabold text-[#F4C569] tabular-nums block">
                      {s.num}
                    </span>
                    <span className="block text-[11px] font-bold text-white line-clamp-1">
                      {s.title}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="p-2.5 rounded-xl bg-white/[0.06] border border-white/15 space-y-2">
              <p className="text-[11px] text-emerald-100/85 leading-relaxed line-clamp-2">
                {activeStep.body}
              </p>
              <button
                type="button"
                onClick={() => onNavigate(activeStep.target)}
                className="w-full min-h-[34px] px-3 py-1 rounded-lg bg-[#F4C569] hover:bg-[#ffd582] text-[#0B231A] text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>{activeStep.actionLabel}</span>
                <ArrowLeft size={13} aria-hidden="true" />
              </button>
            </div>
          </div>
        }
        interactiveDock={
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-emerald-100/85">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1 font-bold text-[#F4C569]">
                <ShieldCheck size={14} aria-hidden="true" />
                <span>ضمانات الأمان:</span>
              </span>
              <span>✓ مطابقة المواصفات والصور</span>
              <span>✓ تفاوض موثق داخل المنصة</span>
              <span>✓ مراجعة فورية للبلاغات</span>
            </div>
            <button
              type="button"
              onClick={onContactSupport}
              className="min-h-[32px] px-3 py-1 rounded-lg bg-white/[0.08] border border-white/20 hover:border-[#F4C569] text-white font-bold cursor-pointer"
            >
              تواصل مع الدعم
            </button>
          </div>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-10">
        {/* 4 Interactive Steps */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {steps.map((step) => (
          <article
            key={step.num}
            className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 flex flex-col justify-between gap-5 shadow-2xs"
          >
            <div className="space-y-2.5">
              <span className="font-display text-2xl font-extrabold text-[var(--color-gold)] tabular-nums block">
                {step.num}
              </span>
              <h2 className="font-display text-lg font-extrabold text-[var(--color-ink)]">
                {step.title}
              </h2>
              <p className="text-sm text-[var(--color-muted)] leading-relaxed">{step.body}</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate(step.target)}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/60 hover:bg-[var(--color-green)] hover:text-white hover:border-[var(--color-green)] text-xs font-bold text-[var(--color-green-ink)] inline-flex items-center justify-between gap-2 transition-colors cursor-pointer"
            >
              <span>{step.actionLabel}</span>
              <ArrowLeft size={14} aria-hidden="true" />
            </button>
          </article>
        ))}
      </div>

      {/* 4 Guarantees Grid + 3 Safe Buying Rules */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-[var(--color-cream)]/60 rounded-2xl border border-[var(--color-border)] p-6 space-y-4">
          <h2 className="font-display text-xl font-extrabold text-[var(--color-ink)]">
            ركائز الموثوقية في السوق
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                icon: BadgeCheck,
                title: 'مزارع معتمدة',
                desc: 'فصل واضح بين الحسابات الموثقة إدارياً والحسابات الجديدة.',
              },
              {
                icon: ClipboardCheck,
                title: 'مواصفات وتحصين واضح',
                desc: 'حقول إلزامية للعمر والوزن والكمية والتحصين قبل نشر الإعلان.',
              },
              {
                icon: MessageSquare,
                title: 'تفاوض داخل المنصة',
                desc: 'محادثات موثقة وعروض أسعار رسمية بين المشتري والبائع.',
              },
              {
                icon: Headphones,
                title: 'دعم ومراجعة مستمرة',
                desc: 'مراجعة للبلاغات والإعلانات لضمان سلامة البيئة التجارية.',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 flex items-start gap-3"
                >
                  <span className="w-9 h-9 rounded-lg bg-[var(--color-cream)] border border-[var(--color-border)] text-[var(--color-green-ink)] flex items-center justify-center shrink-0">
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="font-display text-sm font-bold text-[var(--color-ink)]">
                      {item.title}
                    </h3>
                    <p className="mt-0.5 text-xs text-[var(--color-muted)] leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[var(--color-green-ink)]">
              <ShieldCheck size={20} aria-hidden="true" />
              <h2 className="font-display text-xl font-extrabold text-[var(--color-ink)]">
                قواعد الشراء الآمن
              </h2>
            </div>

            <ul className="space-y-3 text-sm text-[var(--color-ink)] leading-relaxed">
              {SAFE_BUYING_RULES.map((rule) => (
                <li key={rule} className="flex items-start gap-2.5">
                  <CheckCircle2
                    size={16}
                    className="text-[var(--color-green-ink)] shrink-0 mt-1"
                    aria-hidden="true"
                  />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-4 border-t border-[var(--color-border)] flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-[var(--color-muted)] inline-flex items-center gap-1.5">
              <ShieldAlert size={14} className="text-[var(--color-gold)]" aria-hidden="true" />
              <span>هل لديك استفسار إضافي؟</span>
            </span>
            <button
              type="button"
              onClick={onContactSupport}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-bold cursor-pointer"
            >
              تواصل معنا
            </button>
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}
