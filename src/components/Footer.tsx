import { useEffect, useState } from 'react';
import { Mail, Phone, X } from 'lucide-react';
import type { Breed, User } from '../types/marketplace';
import { trBreedName } from '../lib/bilingual';
import { useI18n } from '../lib/i18n';
import { getRoleAwareFooterAccountLinks } from '../lib/marketplace-helpers';
import type { AuthMode, DashboardTab, PageView } from '../lib/router';

interface FooterProps {
  currentUser: User | null;
  breeds?: Breed[];
  onNavigate: (
    page: PageView,
    options?: {
      authMode?: AuthMode;
      dashboardTab?: DashboardTab;
      hash?: string;
      listingFilters?: { breedId?: string };
    }
  ) => void;
}

type LegalDocKey = 'privacy' | 'terms' | 'agreement';

export function Footer({ currentUser, breeds = [], onNavigate }: FooterProps) {
  const { dir, lang, t } = useI18n();
  const isEn = lang === 'en';
  const accountLinks = getRoleAwareFooterAccountLinks(currentUser?.role ?? null, lang);

  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [subscribedEmail, setSubscribedEmail] = useState<string | null>(null);
  const [newsletterError, setNewsletterError] = useState('');
  const [activeLegalDoc, setActiveLegalDoc] = useState<LegalDocKey | null>(null);

  useEffect(() => {
    if (!activeLegalDoc) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveLegalDoc(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeLegalDoc]);

  const handleNewsletterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newsletterEmail.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setNewsletterError(t.footerNewsletterError);
      return;
    }
    setNewsletterError('');
    setSubscribedEmail(trimmed);
    setNewsletterEmail('');
  };

  const breedLinks =
    breeds.length > 0
      ? breeds.slice(0, 5)
      : [
          { id: 'brd_naimi', name: 'نعيمي' },
          { id: 'brd_najdi', name: 'نجدي' },
          { id: 'brd_harri', name: 'حري' },
          { id: 'brd_ardhi', name: 'عارضي' },
          { id: 'brd_sawakni', name: 'سواكني' },
        ];

  const legalDocs: Record<
    LegalDocKey,
    { title: string; summary: string; points: string[] }
  > = {
    privacy: {
      title: isEn ? 'Privacy Policy' : 'سياسة الخصوصية وحماية البيانات',
      summary: isEn
        ? 'We protect seller and buyer contact information and only display verified listing specifications.'
        : 'نلتزم بحماية بيانات المربين والمشترين وعدم مشاركة أرقام التواصل أو البريد الإلكتروني مع أي طرف ثالث غير مصرح به.',
      points: isEn
        ? [
            'Account phone numbers and verification records are encrypted and used strictly for marketplace trust.',
            'Direct messaging keeps negotiations organized inside the platform with clear offer logs.',
            'You can request data updates or account closure anytime via the support center.',
          ]
        : [
            'تُستخدم بيانات التسجيل وتوثيق المراح للتحقق من موثوقية الإعلانات وحماية حقوق الأطراف فقط.',
            'تتم المحادثات وعروض السعر داخل المنصة مع حفظ سجل واضح لتفاصيل الاتفاق.',
            'يمكنك طلب تحديث بياناتك أو إغلاق حسابك في أي وقت عبر صفحة تواصل معنا.',
          ],
    },
    terms: {
      title: isEn ? 'Terms of Use' : 'شروط الاستخدام',
      summary: isEn
        ? 'Clear rules that ensure truthful livestock specifications, fair pricing, and respectful communication.'
        : 'ضوابط استخدام منصة سوق الغنم 2.0 لضمان مصداقية المواصفات والأسعار وتنظيم التعامل بين المربين والمشترين.',
      points: isEn
        ? [
            'Listings must accurately reflect breed, age, head count, approximate weight, and vaccination status.',
            'Duplicate, misleading, or off-topic listings are automatically paused during moderation review.',
            'All listed prices are in Saudi Riyals (SAR) and reflect direct breeder-to-buyer negotiations.',
          ]
        : [
            'يجب أن تعكس جميع الإعلانات المواصفات الحقيقية للسلالة والعمر والعدد والوزن التقريبي وحالة التحصين.',
            'تخضع الإعلانات لمراجعة الإدارة لضمان خلوها من التكرار أو المعلومات المضللة.',
            'تُعرض جميع الأسعار بالريال السعودي وبصيغة شفافة بين المربي والمشتري.',
          ],
    },
    agreement: {
      title: isEn ? 'Service Agreement' : 'اتفاقية الخدمة والوساطة',
      summary: isEn
        ? 'Transparent 1% marketplace commission upon completed sale, supporting ongoing platform moderation and verification.'
        : 'توضح اتفاقية الخدمة آلية الوساطة الرقمية واحتساب عمولة المنصة البالغة 1% بعد إتمام البيع الفعلي فقط.',
      points: isEn
        ? [
            'Publishing standard listings is free; the 1% service fee applies solely after a completed sale.',
            'Payment slips and commission settlements can be calculated and submitted directly from your dashboard.',
            'Breeder verification badges are granted after reviewing ranch details and direct identity confirmation.',
          ]
        : [
            'إضافة الإعلانات الأساسية مجانية، وتُستحق عمولة المنصة (1%) بعد إتمام صفقة البيع فقط.',
            'يمكن احتساب قيمة العمولة وإرفاق إيصال السداد مباشرة من حاسبة السداد أو لوحة التحكم.',
            'تُمنح شارة المربي الموثق بعد التحقق من بيانات المراح ومطابقة معلومات التواصل.',
          ],
    },
  };

  const activeDoc = activeLegalDoc ? legalDocs[activeLegalDoc] : null;

  return (
    <div className="mt-12" dir={dir}>
      {/* Animated Saudi Desert Horizon Banner */}
      <div className="souq-ft-ban" aria-hidden="true">
        <div className="souq-ft-banbox">
          <div className="souq-ft-stage">
            <img
              className="souq-ft-base"
              src="/assets/footer/banner-base.png?v=2"
              alt=""
            />
            <span className="souq-ft-dust souq-ft-dust-1" />
            <span className="souq-ft-dust souq-ft-dust-2" />
            <span className="souq-ft-dust souq-ft-dust-3" />
            <img
              className="souq-ft-sp souq-ft-palm1"
              src="/assets/footer/palm-1.png?v=2"
              alt=""
            />
            <img
              className="souq-ft-sp souq-ft-palm2"
              src="/assets/footer/palm-2.png?v=2"
              alt=""
            />
            <img
              className="souq-ft-sp souq-ft-palm3"
              src="/assets/footer/palm-3.png?v=2"
              alt=""
            />
            <img
              className="souq-ft-sp souq-ft-palm4"
              src="/assets/footer/palm-4.png?v=2"
              alt=""
            />
            <img
              className="souq-ft-sp souq-ft-ram-head"
              src="/assets/footer/ram-head.png?v=2"
              alt=""
            />
            <img
              className="souq-ft-sp souq-ft-lamb-head"
              src="/assets/footer/lamb-head.png?v=2"
              alt=""
            />
            <div className="souq-ft-shine">
              <i />
            </div>
          </div>
        </div>
      </div>

      <footer className="relative bg-[var(--color-footer)] text-[#FAF6EC] transition-colors overflow-hidden">
        <svg
          aria-hidden="true"
          viewBox="0 0 1200 320"
          preserveAspectRatio="xMidYMid slice"
          className="pointer-events-none absolute inset-0 w-full h-full text-white/[0.045]"
        >
          <defs>
            <pattern id="saudi-sadu-band" width="48" height="24" patternUnits="userSpaceOnUse">
              <path
                d="M0 12L12 2L24 12L36 2L48 12L36 22L24 12L12 22Z"
                fill="none"
                stroke="#D79A3D"
                strokeOpacity="0.16"
                strokeWidth="1"
              />
              <path d="M12 7L17 12L12 17L7 12Z" fill="#D79A3D" fillOpacity="0.09" />
              <path d="M36 7L41 12L36 17L31 12Z" fill="currentColor" />
            </pattern>
          </defs>
          <rect x="0" y="6" width="1200" height="24" fill="url(#saudi-sadu-band)" />
          <g transform="translate(36 84)" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path
              d="M16 210V92C16 48 52 22 86 22C120 22 156 48 156 92V210"
              stroke="#D79A3D"
              strokeOpacity="0.16"
            />
            <path d="M34 210V100C34 66 58 44 86 44C114 44 138 66 138 100V210" />
            <path
              d="M24 22L36 8L48 22L60 8L72 22L86 6L100 22L112 8L124 22L136 8L148 22"
              stroke="#D79A3D"
              strokeOpacity="0.16"
            />
            <path d="M86 210V108" strokeWidth="2.4" />
            <path d="M86 112C64 98 44 102 32 116" />
            <path d="M86 108C66 84 46 82 32 92" />
            <path d="M86 106C76 80 64 70 50 70" />
            <path d="M86 106C96 80 108 70 122 70" />
            <path d="M86 108C106 84 126 82 140 92" />
            <path d="M86 112C108 98 128 102 140 116" />
          </g>
        </svg>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-24 md:pb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-[1.5fr_repeat(5,minmax(0,1fr))] gap-7 lg:gap-6 pb-8 border-b border-white/10">
            {/* Brand Column */}
            <div className="sm:col-span-2 md:col-span-3 lg:col-span-1 space-y-4">
              <button
                type="button"
                onClick={() => onNavigate('home')}
                className="inline-flex items-center gap-2.5 text-white font-display text-xl font-extrabold cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-gold)]"
              >
                <svg
                  width="34"
                  height="34"
                  viewBox="0 0 32 32"
                  fill="none"
                  aria-hidden="true"
                  className="shrink-0"
                >
                  <rect width="32" height="32" rx="8" fill="#145C42" />
                  <rect
                    x="0.75"
                    y="0.75"
                    width="30.5"
                    height="30.5"
                    rx="7.25"
                    stroke="#D79A3D"
                    strokeOpacity="0.6"
                    strokeWidth="1.25"
                  />
                  <path
                    d="M9.5 18.5C9.5 14.5 12.4 11.5 16 11.5C19.6 11.5 22.5 14.5 22.5 18.5C22.5 21 20.6 22.5 18.5 22.5H13.5C11.4 22.5 9.5 21 9.5 18.5Z"
                    stroke="#FAF6EC"
                    strokeWidth="1.75"
                  />
                  <path
                    d="M11.5 12.5C9.2 11.2 8 12.6 8.5 14.8M20.5 12.5C22.8 11.2 24 12.6 23.5 14.8"
                    stroke="#D79A3D"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                </svg>
                <span>{t.brandName}</span>
              </button>

              <p className="text-sm text-[#FAF6EC]/80 max-w-md leading-relaxed">
                {t.footerDescription}
              </p>

              <div
                className="flex items-center gap-2.5 pt-1"
                aria-label={isEn ? 'Direct Contact' : 'التواصل المباشر'}
              >
                <a
                  href="tel:+966564419966"
                  title="+966564419966"
                  aria-label={isEn ? 'Call +966564419966' : 'اتصال على +966564419966'}
                  className="w-11 h-11 sm:w-9 sm:h-9 rounded-full border border-white/25 bg-white/5 hover:bg-white/15 hover:border-[#D79A3D] grid place-items-center text-white/90 transition-colors"
                >
                  <Phone size={16} aria-hidden="true" />
                </a>
                <a
                  href="https://wa.me/966564419966"
                  target="_blank"
                  rel="noopener noreferrer"
                  title={isEn ? 'WhatsApp +966564419966' : 'واتساب +966564419966'}
                  aria-label={isEn ? 'WhatsApp +966564419966' : 'تواصل عبر واتساب +966564419966'}
                  className="w-11 h-11 sm:w-9 sm:h-9 rounded-full border border-white/25 bg-white/5 hover:bg-[#25D366]/20 hover:border-[#D79A3D] grid place-items-center text-white/90 hover:text-[#25D366] transition-colors"
                >
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.85"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
                    <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
                  </svg>
                </a>
                <a
                  href="mailto:kkfjahdali@icloud.com"
                  title="kkfjahdali@icloud.com"
                  aria-label={
                    isEn
                      ? 'Email kkfjahdali@icloud.com'
                      : 'البريد الإلكتروني kkfjahdali@icloud.com'
                  }
                  className="w-11 h-11 sm:w-9 sm:h-9 rounded-full border border-white/25 bg-white/5 hover:bg-white/15 hover:border-[#D79A3D] grid place-items-center text-white/90 transition-colors"
                >
                  <Mail size={16} aria-hidden="true" />
                </a>
              </div>
            </div>

            {/* Marketplace Sections */}
            <div>
              <h2 className="text-sm font-bold text-[var(--color-gold)] mb-3.5">
                {t.footerSectionsTitle}
              </h2>
              <ul className="space-y-1.5 text-sm text-[#FAF6EC]/85">
                {[
                  { page: 'home' as PageView, label: t.navHome },
                  { page: 'listings' as PageView, label: t.footerLinkAllListings },
                  { page: 'breeds' as PageView, label: t.navBreeds },
                  { page: 'breeders' as PageView, label: t.navBreeders },
                  { page: 'pricing' as PageView, label: t.footerLinkPricing },
                  { page: 'services' as PageView, label: t.footerLinkServices },
                  { page: 'add' as PageView, label: t.footerLinkAdd },
                ].map((link) => (
                  <li key={link.page}>
                    <button
                      type="button"
                      onClick={() => onNavigate(link.page)}
                      className="min-h-[38px] sm:min-h-[28px] inline-flex items-center py-0.5 hover:text-[var(--color-gold)] transition-colors cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Smart Calculators & Tools */}
            <div>
              <h2 className="text-sm font-bold text-[var(--color-gold)] mb-3.5">
                {isEn ? 'Smart Calculators' : 'الحاسبات والأدوات'}
              </h2>
              <ul className="space-y-1.5 text-sm text-[#FAF6EC]/85">
                {[
                  { key: 'transport', page: 'transport' as PageView, label: t.footerLinkTransport },
                  { key: 'feed', page: 'feed' as PageView, label: t.footerLinkFeed },
                  { key: 'feast', page: 'feast' as PageView, label: t.footerLinkFeast },
                  { key: 'weights', page: 'weights' as PageView, label: t.footerLinkWeights },
                  { key: 'occasions', page: 'occasions' as PageView, label: t.footerLinkOccasions },
                  { key: 'commission', page: 'commission' as PageView, label: t.footerLinkCommission },
                ].map((link) => (
                  <li key={link.key}>
                    <button
                      type="button"
                      onClick={() => onNavigate(link.page)}
                      className="min-h-[38px] sm:min-h-[28px] inline-flex items-center py-0.5 hover:text-[var(--color-gold)] transition-colors cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Help, Knowledge & Policies */}
            <div>
              <h2 className="text-sm font-bold text-[var(--color-gold)] mb-3.5">
                {t.footerHelpTitle}
              </h2>
              <ul className="space-y-1.5 text-sm text-[#FAF6EC]/85">
                {[
                  { key: 'guides', page: 'guides' as PageView, label: t.helpGuides },
                  { key: 'help', page: 'help' as PageView, label: t.helpFaq },
                  { key: 'how', page: 'how' as PageView, label: t.helpHow },
                  { key: 'about', page: 'about' as PageView, label: t.helpAbout },
                  { key: 'rules', page: 'rules' as PageView, label: t.helpRules },
                  { key: 'contact', page: 'contact' as PageView, label: t.helpContact },
                ].map((link) => (
                  <li key={link.key}>
                    <button
                      type="button"
                      onClick={() => onNavigate(link.page)}
                      className="min-h-[38px] sm:min-h-[28px] inline-flex items-center py-0.5 hover:text-[var(--color-gold)] transition-colors cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Popular Breeds */}
            <div>
              <h2 className="text-sm font-bold text-[var(--color-gold)] mb-3.5">
                {t.footerBreedsTitle}
              </h2>
              <ul className="space-y-1.5 text-sm text-[#FAF6EC]/85">
                {breedLinks.map((breed) => (
                  <li key={breed.id}>
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate('listings', { listingFilters: { breedId: breed.id } })
                      }
                      className="min-h-[38px] sm:min-h-[28px] inline-flex items-center py-0.5 hover:text-[var(--color-gold)] transition-colors cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
                    >
                      {t.footerLinkBreedAdsPrefix} {trBreedName(breed.name, lang)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Role-Aware Account Links */}
            <div>
              <h2 className="text-sm font-bold text-[var(--color-gold)] mb-3.5">
                {currentUser ? t.footerAccountTitleUser : t.footerAccountTitleVisitor}
              </h2>
              <ul className="space-y-1.5 text-sm text-[#FAF6EC]/85">
                {accountLinks.map((link) => (
                  <li key={link.key}>
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate(link.page, {
                          authMode: link.authMode,
                          dashboardTab: link.dashboardTab,
                        })
                      }
                      className="min-h-[38px] sm:min-h-[28px] inline-flex items-center py-0.5 hover:text-[var(--color-gold)] transition-colors cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Newsletter Subscription Strip */}
          <div className="py-6 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4 md:pr-20">
            <div className="min-w-0">
              <h3 className="font-display text-sm sm:text-base font-bold text-white">
                {t.footerNewsletterTitle}
              </h3>
              <p className="mt-0.5 text-xs text-[#FAF6EC]/75">
                {t.footerNewsletterSubtitle}
              </p>
            </div>

            {subscribedEmail ? (
              <p
                role="status"
                className="text-sm font-bold text-[#D79A3D] bg-white/10 border border-[#D79A3D]/40 rounded-full px-5 py-2.5"
              >
                {t.footerNewsletterSuccess} ({subscribedEmail})
              </p>
            ) : (
              <form
                onSubmit={handleNewsletterSubmit}
                noValidate
                className="w-full md:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
              >
                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-2.5 h-11 rounded-full border border-white/30 bg-white/5 px-4 focus-within:border-[#D79A3D]">
                    <Mail size={17} className="text-white/80 shrink-0" aria-hidden="true" />
                    <span className="sr-only">{t.footerNewsletterTitle}</span>
                    <input
                      id="nl-email"
                      type="email"
                      value={newsletterEmail}
                      onChange={(e) => {
                        setNewsletterEmail(e.target.value);
                        if (newsletterError) setNewsletterError('');
                      }}
                      placeholder={t.footerNewsletterPlaceholder}
                      autoComplete="email"
                      className="w-full sm:w-64 bg-transparent border-0 outline-none text-sm text-white placeholder:text-white/65"
                    />
                  </label>
                  {newsletterError && (
                    <span className="text-xs text-[#f4c569] pr-3">{newsletterError}</span>
                  )}
                </div>
                <button
                  type="submit"
                  className="h-11 px-7 rounded-full bg-gradient-to-b from-[#e0a64c] to-[#c98f33] hover:brightness-105 text-white font-bold text-sm whitespace-nowrap cursor-pointer transition-all shrink-0"
                >
                  {t.footerNewsletterCta}
                </button>
              </form>
            )}
          </div>

          {/* Bottom Copyright & Legal Links */}
          <div className="pt-6 md:pr-20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#FAF6EC]/70">
            <p>{t.footerCopyright}</p>
            <nav
              aria-label={isEn ? 'Legal & support links' : 'روابط قانونية'}
              className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5"
            >
              <button
                type="button"
                onClick={() => onNavigate('contact')}
                className="hover:text-[var(--color-gold)] transition-colors cursor-pointer"
              >
                {t.helpContact}
              </button>
              <span aria-hidden="true" className="text-white/25">
                ·
              </span>
              <button
                type="button"
                onClick={() => onNavigate('about')}
                className="hover:text-[var(--color-gold)] transition-colors cursor-pointer"
              >
                {t.helpAbout}
              </button>
              <span aria-hidden="true" className="text-white/25">
                ·
              </span>
              <button
                type="button"
                onClick={() => onNavigate('privacy')}
                className="hover:text-[var(--color-gold)] transition-colors cursor-pointer"
              >
                {isEn ? 'Privacy Policy' : 'سياسة الخصوصية'}
              </button>
              <span aria-hidden="true" className="text-white/25">
                ·
              </span>
              <button
                type="button"
                onClick={() => onNavigate('terms')}
                className="hover:text-[var(--color-gold)] transition-colors cursor-pointer"
              >
                {isEn ? 'Terms of Use' : 'شروط الاستخدام'}
              </button>
              <span aria-hidden="true" className="text-white/25">
                ·
              </span>
              <button
                type="button"
                onClick={() => setActiveLegalDoc('agreement')}
                className="hover:text-[var(--color-gold)] transition-colors cursor-pointer"
              >
                {isEn ? 'Service Agreement' : 'اتفاقية الخدمة'}
              </button>
            </nav>
          </div>
        </div>
      </footer>

      {/* Legal Policy Modal */}
      {activeDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4"
          onClick={() => setActiveLegalDoc(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="souq-legal-modal-title"
            className="w-full max-w-lg rounded-2xl bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-border)] shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-3">
              <div>
                <h2
                  id="souq-legal-modal-title"
                  className="font-display text-lg font-extrabold text-[var(--color-green-ink)]"
                >
                  {activeDoc.title}
                </h2>
                <p className="mt-1 text-xs text-[var(--color-muted)]">{t.brandName}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveLegalDoc(null)}
                aria-label={isEn ? 'Close' : 'إغلاق'}
                className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-cream)] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm leading-relaxed text-[var(--color-ink)]">
              {activeDoc.summary}
            </p>

            <ul className="space-y-2.5 text-sm text-[var(--color-muted)] list-disc ps-5">
              {activeDoc.points.map((point) => (
                <li key={point} className="leading-relaxed">
                  {point}
                </li>
              ))}
            </ul>

            <div className="pt-2 flex flex-wrap items-center justify-end gap-2.5 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => {
                  setActiveLegalDoc(null);
                  onNavigate('contact');
                }}
                className="px-4 py-2 rounded-xl border border-[var(--color-border)] text-sm font-semibold hover:bg-[var(--color-cream)] transition-colors cursor-pointer"
              >
                {t.helpContact}
              </button>
              <button
                type="button"
                onClick={() => setActiveLegalDoc(null)}
                className="px-5 py-2 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-bold transition-colors cursor-pointer"
              >
                {isEn ? 'Close' : 'فهمت'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
