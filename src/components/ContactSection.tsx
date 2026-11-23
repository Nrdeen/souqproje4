import { useState } from 'react';
import {
  CheckCircle2,
  Headphones,
  HelpCircle,
  Loader2,
  Mail,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  INQUIRY_CATEGORY_KEYS,
  type InquiryCategoryKey,
  useI18n,
} from '../lib/i18n';
import { SAUDI_REGIONS_13 } from '../lib/marketplace-tools';
import type { PageView } from '../lib/router';
import { DynamicHeroBanner } from './DynamicHeroBanner';

interface ContactSectionProps {
  onNavigate?: (page: PageView, options?: { hash?: string }) => void;
  onNotify: (msg: string) => void;
  embedded?: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function ContactSection({ onNavigate, onNotify, embedded = true }: ContactSectionProps) {
  const { dir, isEn, t } = useI18n();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [categoryKey, setCategoryKey] = useState<InquiryCategoryKey>('general');
  const [region, setRegion] = useState<string>('');
  const [message, setMessage] = useState('');
  const [websiteHoneypot, setWebsiteHoneypot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submittedSummary, setSubmittedSummary] = useState<{
    referenceId: string;
    categoryLabel: string;
    email: string;
  } | null>(null);

  const selectedCategoryLabel = t.contactCategories[categoryKey];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedMessage = message.trim();

    if (trimmedName.length < 2) {
      setError(t.contactErrName);
      return;
    }
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError(t.contactErrEmail);
      return;
    }
    if (trimmedMessage.length < 8) {
      setError(t.contactErrMessage);
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.submitContactMessage({
        name: trimmedName,
        email: trimmedEmail,
        contact: trimmedEmail,
        category: selectedCategoryLabel,
        topic: selectedCategoryLabel,
        region: region || undefined,
        preferredReply: 'email',
        message: trimmedMessage,
        website: websiteHoneypot,
      });
      setSubmittedSummary({
        referenceId: res.referenceId,
        categoryLabel: selectedCategoryLabel,
        email: trimmedEmail,
      });
      setName('');
      setEmail('');
      setRegion('');
      setMessage('');
      setWebsiteHoneypot('');
      onNotify(`${t.contactSuccessTitle} (${res.referenceId})`);
    } catch (err: any) {
      setError(err?.message || t.contactErrGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      id="contact-section"
      dir={dir}
      aria-labelledby="contact-section-heading"
      className={`${
        embedded
          ? 'bg-[var(--color-canvas)] border-t border-[var(--color-border)] py-12 lg:py-16'
          : 'bg-[var(--color-canvas)]'
      } transition-colors`}
    >
      {!embedded && (
        <DynamicHeroBanner
          pageKey="contact"
          variant="emerald-royal"
          eyebrow={t.contactBadge}
          title={t.contactTitle}
          subHeadline={t.contactIntro}
          breadcrumbs={[
            { label: dir === 'rtl' ? 'الرئيسية' : 'Home', onClick: onNavigate ? () => onNavigate('home') : undefined },
            { label: t.helpContact },
          ]}
          contextLabel={t.contactSupportCardTitle}
          actions={
            onNavigate ? (
              <>
                <button
                  type="button"
                  onClick={() => onNavigate('help')}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-white/25 bg-white/[0.08] hover:border-[#F4C569] text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <HelpCircle size={14} className="text-[#F4C569]" aria-hidden="true" />
                  <span>{t.helpFaq}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('how')}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-white/25 bg-white/[0.08] hover:border-[#F4C569] text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ShieldCheck size={14} className="text-[#F4C569]" aria-hidden="true" />
                  <span>{t.helpHow}</span>
                </button>
              </>
            ) : undefined
          }
          interactiveDock={
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-emerald-100/85 font-semibold">
                {dir === 'rtl' ? 'القسم المختار الآن:' : 'Selected track:'}{' '}
                <strong className="text-[#F4C569]">{selectedCategoryLabel}</strong>
                {region ? ` · ${region}` : ''}
              </span>
              <a
                href="#contact-name"
                className="min-h-[34px] px-3.5 py-1 rounded-lg bg-[#F4C569] hover:bg-[#ffd582] text-[#0B231A] font-extrabold inline-flex items-center gap-1.5"
              >
                <Send size={13} aria-hidden="true" />
                <span>{dir === 'rtl' ? 'ابدأ كتابة الرسالة' : 'Write Message'}</span>
              </a>
            </div>
          }
        />
      )}
      <div className={embedded ? 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10'}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 lg:gap-8 items-stretch">
          {/* Guidance & Help Column (no fabricated numbers or social handles) */}
          <div className="lg:col-span-5 bg-[var(--color-cream)]/75 rounded-2xl border border-[var(--color-border)] p-6 sm:p-8 flex flex-col justify-between gap-6">
            <div className="space-y-5">
              {embedded ? (
                <div>
                  <div className="inline-flex items-center gap-2 text-xs font-bold text-[var(--color-green-ink)] mb-1.5">
                    <Headphones size={16} className="text-[var(--color-gold)]" aria-hidden="true" />
                    <span>{t.contactBadge}</span>
                  </div>
                  <h2
                    id="contact-section-heading"
                    className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--color-ink)]"
                  >
                    {t.contactTitle}
                  </h2>
                  <p className="mt-2 text-sm text-[var(--color-muted)] leading-relaxed">
                    {t.contactIntro}
                  </p>
                </div>
              ) : (
                <div>
                  <div className="inline-flex items-center gap-2 text-xs font-bold text-[var(--color-green-ink)] mb-1.5">
                    <Headphones size={16} className="text-[var(--color-gold)]" aria-hidden="true" />
                    <span>{isEn ? 'Direct Support Channels' : 'قنوات الدعم والمتابعة'}</span>
                  </div>
                  <h2
                    id="contact-section-heading"
                    className="font-display text-xl sm:text-2xl font-extrabold text-[var(--color-ink)]"
                  >
                    {isEn ? 'How Our Support Team Helps' : 'كيف يتعامل فريقنا مع رسالتك؟'}
                  </h2>
                  <p className="mt-2 text-sm text-[var(--color-muted)] leading-relaxed">
                    {isEn
                      ? 'Every inquiry receives an instant tracking reference and is routed directly to the right marketplace specialist.'
                      : 'تحصل كل رسالة على رقم متابعة مرجعي فوري وتُحال مباشرة إلى القسم المختص لضمان سرعة المعالجة.'}
                  </p>
                </div>
              )}

              <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-green-ink)]/20 p-4 space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-xl bg-[#103C2C] text-[#F4C569] flex items-center justify-center shrink-0">
                    <Mail size={17} aria-hidden="true" />
                  </span>
                  <h3 className="font-display text-sm font-extrabold text-[var(--color-ink)]">
                    {t.contactSupportCardTitle}
                  </h3>
                </div>
                <p className="text-xs text-[var(--color-muted)] leading-relaxed">
                  {t.contactSupportCardBody}
                </p>
              </div>

              <div className="space-y-2.5 pt-1">
                <h3 className="text-xs font-bold text-[var(--color-ink)]">
                  {t.contactPointsTitle}
                </h3>
                <ul className="space-y-2 text-xs text-[var(--color-muted)]">
                  {[t.contactPoint1, t.contactPoint2, t.contactPoint3].map((point) => (
                    <li key={point} className="flex items-start gap-2">
                      <CheckCircle2
                        size={14}
                        className="text-[var(--color-green-ink)] shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <span className="leading-relaxed">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {onNavigate && (
              <div className="pt-4 border-t border-[var(--color-border)] space-y-2.5">
                <p className="text-xs font-bold text-[var(--color-ink)]">
                  {t.contactQuickLinksTitle}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigate('help')}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream-hover)] text-xs font-bold text-[var(--color-green-ink)] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <HelpCircle size={14} aria-hidden="true" />
                    <span>{t.helpFaq}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('how')}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream-hover)] text-xs font-bold text-[var(--color-green-ink)] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <ShieldCheck size={14} aria-hidden="true" />
                    <span>{t.helpHow}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('rules')}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream-hover)] text-xs font-bold text-[var(--color-green-ink)] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {t.helpRules}
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('pricing')}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream-hover)] text-xs font-bold text-[var(--color-green-ink)] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {t.footerLinkPricing}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Dedicated Contact Us Messaging Form */}
          <div className="lg:col-span-7 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 sm:p-8 shadow-xs flex flex-col justify-center">
            {submittedSummary ? (
              <div
                role="status"
                className="rounded-xl bg-[var(--color-cream)]/70 border border-[var(--color-green-ink)]/30 p-6 sm:p-8 text-center space-y-4"
              >
                <CheckCircle2
                  size={40}
                  className="mx-auto text-[var(--color-green-ink)]"
                  aria-hidden="true"
                />
                <div className="space-y-1.5">
                  <h3 className="font-display text-xl font-extrabold text-[var(--color-ink)]">
                    {t.contactSuccessTitle}
                  </h3>
                  <p className="text-sm text-[var(--color-muted)]">
                    {t.contactSuccessBody}
                  </p>
                </div>

                <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 text-xs space-y-1.5 max-w-md mx-auto">
                  <p className="font-bold text-[var(--color-green-ink)] tabular-nums">
                    {t.contactRefLabel}: {submittedSummary.referenceId}
                  </p>
                  <p className="text-[var(--color-muted)]">
                    {submittedSummary.categoryLabel}
                  </p>
                  <p className="text-[var(--color-muted)]" dir="ltr">
                    {submittedSummary.email}
                  </p>
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSubmittedSummary(null)}
                    className="min-h-[42px] px-5 py-2 rounded-xl border border-[var(--color-green-ink)] text-[var(--color-green-ink)] hover:bg-[var(--color-green)] hover:text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    {t.contactSendAnother}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <div className="pb-4 border-b border-[var(--color-border)]">
                  <h3 className="font-display text-xl font-extrabold text-[var(--color-ink)]">
                    {t.contactFormTitle}
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm text-[var(--color-muted)]">
                    {t.contactFormSubtitle}
                  </p>
                </div>

                {/* Hidden Honeypot Spam Guard */}
                <div className="sr-only" aria-hidden="true">
                  <label htmlFor="contact-website-hp">Website</label>
                  <input
                    id="contact-website-hp"
                    name="website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={websiteHoneypot}
                    onChange={(e) => setWebsiteHoneypot(e.target.value)}
                  />
                </div>

                {/* Inquiry Category Buttons */}
                <div className="space-y-2">
                  <span className="block text-xs font-bold text-[var(--color-ink)]">
                    {t.contactCategoryLabel}
                  </span>
                  <div
                    role="group"
                    aria-label={t.contactCategoryLabel}
                    className="flex flex-wrap gap-2"
                  >
                    {INQUIRY_CATEGORY_KEYS.map((key) => {
                      const active = categoryKey === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setCategoryKey(key)}
                          className={`min-h-[36px] px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                            active
                              ? 'bg-[var(--color-green)] text-white border-[var(--color-green)]'
                              : 'bg-[var(--color-canvas)] text-[var(--color-ink)] border-[var(--color-border)] hover:border-[var(--color-gold)]'
                          }`}
                        >
                          {t.contactCategories[key]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="contact-name"
                      className="block text-xs font-bold text-[var(--color-ink)] mb-1.5"
                    >
                      {t.contactNameLabel}
                    </label>
                    <input
                      id="contact-name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t.contactNamePlaceholder}
                      className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] px-3.5 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/60 focus:outline-none focus:border-[var(--color-green-ink)]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="contact-email"
                      className="block text-xs font-bold text-[var(--color-ink)] mb-1.5"
                    >
                      {t.contactEmailLabel}
                    </label>
                    <input
                      id="contact-email"
                      type="email"
                      dir="ltr"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t.contactEmailPlaceholder}
                      autoComplete="email"
                      className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] px-3.5 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/60 focus:outline-none focus:border-[var(--color-green-ink)]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label
                      htmlFor="contact-region"
                      className="block text-xs font-bold text-[var(--color-ink)] mb-1.5"
                    >
                      {t.contactRegionLabel}
                    </label>
                    <select
                      id="contact-region"
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] px-3.5 text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                    >
                      <option value="">{t.contactAllRegions}</option>
                      {SAUDI_REGIONS_13.map((reg) => (
                        <option key={reg} value={reg}>
                          {reg}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label
                      htmlFor="contact-message"
                      className="block text-xs font-bold text-[var(--color-ink)]"
                    >
                      {t.contactMessageLabel}
                    </label>
                    <span className="text-[11px] text-[var(--color-muted)] tabular-nums">
                      {message.length} / 2000
                    </span>
                  </div>
                  <textarea
                    id="contact-message"
                    rows={4}
                    maxLength={2000}
                    required
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={t.contactMessagePlaceholder}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] px-3.5 py-2.5 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/60 focus:outline-none focus:border-[var(--color-green-ink)]"
                  />
                </div>

                {error && (
                  <p role="alert" className="text-xs font-semibold text-red-700 dark:text-red-400">
                    {error}
                  </p>
                )}

                <div className="pt-1 flex justify-end">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] disabled:opacity-60 text-white text-sm font-bold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {submitting ? (
                      <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Send size={15} aria-hidden="true" />
                    )}
                    <span>{submitting ? t.contactSubmitting : t.contactSubmit}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
