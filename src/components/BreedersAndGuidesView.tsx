import { useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, HelpCircle, ShieldCheck, Star } from 'lucide-react';
import type { FAQ, IndicativePrice, SellerProfile } from '../types/marketplace';
import { formatPriceSar } from '../lib/format';
import { partitionSellersByVerification } from '../lib/marketplace-helpers';
import { DynamicHeroBanner } from './DynamicHeroBanner';
import { VerifiedSellerBadge } from './VerifiedSellerBadge';

interface BreedersAndGuidesViewProps {
  sellers: SellerProfile[];
  faqs: FAQ[];
  indicativePrices: IndicativePrice[];
  onOpenSeller: (sellerId: string) => void;
  onOpenPricing?: () => void;
  onGoHome?: () => void;
}

export function BreedersAndGuidesView({
  sellers,
  faqs,
  indicativePrices,
  onOpenSeller,
  onOpenPricing,
  onGoHome,
}: BreedersAndGuidesViewProps) {
  const [openFaqId, setOpenFaqId] = useState<string | null>(faqs[0]?.id || null);
  const [spotlightIdx, setSpotlightIdx] = useState(0);
  const { verifiedSellers, otherSellers } = partitionSellersByVerification(sellers);

  const spotlightSeller =
    verifiedSellers[spotlightIdx % Math.max(1, verifiedSellers.length)] ||
    sellers[0] ||
    null;

  const totalVerifiedSales = verifiedSellers.reduce((sum, s) => sum + (s.totalSales || 0), 0);
  const avgVerifiedRating = verifiedSellers.length
    ? (
        verifiedSellers.reduce((sum, s) => sum + (s.rating || 5), 0) / verifiedSellers.length
      ).toFixed(1)
    : '5.0';

  const renderSellerCard = (seller: SellerProfile, verified: boolean) => (
    <article
      key={seller.userId}
      className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 flex flex-col justify-between gap-4"
    >
      <div>
        <div className="flex items-center justify-between gap-2 text-xs text-[var(--color-muted)]">
          <span>{seller.city}</span>
          {verified ? (
            <VerifiedSellerBadge variant="badge" />
          ) : (
            <span className="text-[11px] font-medium text-[var(--color-muted)]">
              {seller.verificationStatus === 'Pending' ? 'قيد مراجعة التوثيق' : 'حساب غير موثق بعد'}
            </span>
          )}
        </div>

        <h2 className="mt-2 font-display text-lg font-bold text-[var(--color-ink)]">
          {seller.displayName}
        </h2>
        <p className="mt-2 text-sm text-[var(--color-muted)] leading-relaxed">{seller.bio}</p>
      </div>

      <div className="pt-4 border-t border-[var(--color-border)] flex items-center justify-between gap-3">
        <div className="text-xs text-[var(--color-muted)] tabular-nums min-w-0">
          <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-ink)] flex-wrap">
            <Star
              size={13}
              className="text-[var(--color-gold)] fill-[var(--color-gold)]"
              aria-hidden="true"
            />
            <span>{seller.rating.toFixed(1)}</span>
            {seller.ratingCount !== undefined && (
              <span className="font-normal text-[var(--color-muted)]">({seller.ratingCount})</span>
            )}
            <span aria-hidden="true">·</span>
            <span className="font-normal text-[var(--color-muted)]">{seller.specialty}</span>
          </span>
          <span className="block mt-0.5">
            خبرة {seller.yearsExperience} سنة · {seller.totalSales} عملية بيع
          </span>
        </div>
        <button
          type="button"
          onClick={() => onOpenSeller(seller.userId)}
          className="min-h-[44px] px-4 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold shrink-0 cursor-pointer"
        >
          عرض المراح
        </button>
      </div>
    </article>
  );

  return (
    <section className="bg-[var(--color-canvas)] transition-colors">
      <DynamicHeroBanner
        pageKey="breeders"
        variant="oasis-horizon"
        breadcrumbs={[
          { label: 'الرئيسية', onClick: onGoHome },
          { label: 'المربون الموثقون' },
        ]}
        contextLabel="معايير توثيق وإشراف مباشر"
        stats={[
          {
            label: 'مربون موثقون',
            value: verifiedSellers.length.toLocaleString('en-US'),
            accent: true,
          },
          {
            label: 'متوسط التقييم',
            value: `${avgVerifiedRating} / 5`,
          },
          {
            label: 'مبيعات موثقة',
            value: totalVerifiedSales.toLocaleString('en-US'),
          },
        ]}
        actions={
          <>
            {onOpenPricing && (
              <button
                type="button"
                onClick={onOpenPricing}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#F4C569] hover:bg-[#ffd582] text-[#0B231A] text-xs sm:text-sm font-extrabold transition-colors cursor-pointer whitespace-nowrap shadow-sm"
              >
                باقات المربين والأسعار
              </button>
            )}
            <a
              href="#faq"
              className="min-h-[42px] px-4 py-2 rounded-xl border border-white/25 bg-white/[0.08] hover:border-[#F4C569] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <HelpCircle size={15} className="text-[#F4C569]" aria-hidden="true" />
              <span>الأسئلة الشائعة ({faqs.length})</span>
            </a>
          </>
        }
        visual={
          spotlightSeller ? (
            <div className="flex flex-col justify-between h-full gap-3.5">
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/15">
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldCheck size={16} className="text-[#F4C569] shrink-0" aria-hidden="true" />
                  <span className="text-xs font-extrabold text-white truncate">
                    جولة تفاعلية في المراحات الموثقة
                  </span>
                </div>
                {verifiedSellers.length > 1 && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      aria-label="المراح السابق"
                      onClick={() =>
                        setSpotlightIdx((prev) => (prev - 1 + verifiedSellers.length) % verifiedSellers.length)
                      }
                      className="w-7 h-7 rounded-lg border border-white/20 bg-white/[0.07] hover:border-[#F4C569] text-white flex items-center justify-center cursor-pointer"
                    >
                      <ChevronRight size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="المراح التالي"
                      onClick={() => setSpotlightIdx((prev) => (prev + 1) % verifiedSellers.length)}
                      className="w-7 h-7 rounded-lg border border-white/20 bg-white/[0.07] hover:border-[#F4C569] text-white flex items-center justify-center cursor-pointer"
                    >
                      <ChevronLeft size={14} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>

              <div className="p-3 rounded-xl bg-white/[0.06] border border-white/15 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-10 h-10 rounded-xl bg-[#F4C569] text-[#0B231A] font-display text-base font-extrabold flex items-center justify-center shrink-0">
                      {(spotlightSeller.displayName || 'م').trim().charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <p className="font-display text-sm font-extrabold text-white truncate">
                        {spotlightSeller.displayName}
                      </p>
                      <p className="text-[11px] text-emerald-100/75 truncate">
                        {spotlightSeller.city} · {spotlightSeller.specialty}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-extrabold text-[#F4C569] tabular-nums shrink-0">
                    ★ {spotlightSeller.rating.toFixed(1)}
                  </span>
                </div>
                <p className="text-xs text-emerald-100/80 line-clamp-2 leading-relaxed">
                  {spotlightSeller.bio}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onOpenSeller(spotlightSeller.userId)}
                className="w-full min-h-[38px] px-3 rounded-xl bg-white/[0.09] hover:bg-[#F4C569] border border-white/20 hover:border-[#F4C569] text-white hover:text-[#0B231A] text-xs font-extrabold inline-flex items-center justify-between gap-2 transition-colors cursor-pointer"
              >
                <span>فتح ملف المراح وتقييماته ({spotlightSeller.totalSales} بيعة)</span>
                <ArrowLeft size={14} aria-hidden="true" />
              </button>
            </div>
          ) : null
        }
        interactiveDock={
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-emerald-100/85">
            <div className="flex flex-wrap items-center gap-3">
              {[
                'مطابقة الجوال السعودي',
                'تحديد المنطقة والمدينة',
                'سجل تقييمات مفتوح من المشترين',
              ].map((rule) => (
                <span key={rule} className="inline-flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 size={13} className="text-[#F4C569] shrink-0" aria-hidden="true" />
                  <span>{rule}</span>
                </span>
              ))}
            </div>
            <span className="font-bold text-[#F4C569] tabular-nums">
              إجمالي الدليل: {sellers.length.toLocaleString('en-US')} مراح وبائع
            </span>
          </div>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-12">
        {/* Verified Breeders */}
      <div>
        <div className="pb-4 border-b border-[var(--color-border)] flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-extrabold text-[var(--color-ink)]">
              المراحات والمربون الموثقون
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-[var(--color-muted)]">
              تصفح ملفات المربين المعتمدين واطلع على عروضهم النشطة وتقييمات العملاء.
            </p>
          </div>
        </div>

        {verifiedSellers.length === 0 ? (
          <div className="mt-6 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 text-center">
            <p className="text-sm font-semibold text-[var(--color-ink)]">
              لا يوجد مربون موثقون معروضون في هذه القائمة حالياً.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            {verifiedSellers.map((seller) => renderSellerCard(seller, true))}
          </div>
        )}

        {otherSellers.length > 0 && (
          <div className="mt-12 pt-8 border-t border-[var(--color-border)]">
            <div className="mb-6">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[var(--color-ink)]">
                مربون وبائعون آخرون في السوق
              </h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                حسابات مراحات وبائعين مسجلة في المنصة لم تُستكمل إجراءات توثيقها المعتمدة بعد.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {otherSellers.map((seller) => renderSellerCard(seller, false))}
            </div>
          </div>
        )}
      </div>

      {/* Indicative Price Strip */}
      <div className="bg-[var(--color-cream)] rounded-xl border border-[var(--color-border)] p-6">
        <h2 className="font-display text-xl font-bold text-[var(--color-ink)] mb-4">
          ملخص الأسعار الاسترشادية اليوم
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {indicativePrices.map((p) => (
            <div
              key={p.id}
              className="bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] p-4"
            >
              <p className="text-xs text-[var(--color-muted)]">{p.ageGroup}</p>
              <p className="font-display text-base font-bold text-[var(--color-ink)] mt-0.5">
                {p.breedName}
              </p>
              <p className="font-display text-lg font-extrabold text-[var(--color-green-ink)] tabular-nums mt-2">
                {formatPriceSar(p.avgPrice)}
              </p>
              <p className="text-[11px] text-[var(--color-muted)] tabular-nums mt-1">
                من {formatPriceSar(p.minPrice)} إلى {formatPriceSar(p.maxPrice)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ Accordion */}
      <div id="faq" className="max-w-3xl scroll-mt-24">
        <h2 className="font-display text-2xl font-bold text-[var(--color-ink)] mb-5">
          الأسئلة الشائعة
        </h2>
        <div className="divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-xl bg-[var(--color-surface)] overflow-hidden">
          {faqs.map((faq) => {
            const isOpen = openFaqId === faq.id;
            return (
              <div key={faq.id}>
                <button
                  type="button"
                  onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                  className="w-full px-5 py-4 text-right flex items-center justify-between gap-4 hover:bg-[var(--color-cream)]/50 cursor-pointer"
                  aria-expanded={isOpen}
                >
                  <span className="font-display text-base font-bold text-[var(--color-ink)]">
                    {faq.question}
                  </span>
                  <ChevronDown
                    size={18}
                    className={`shrink-0 text-[var(--color-muted)] transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-sm text-[var(--color-muted)] leading-relaxed">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </section>
  );
}
