import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  HelpCircle,
  Lock,
  Search,
  ShieldCheck,
} from 'lucide-react';
import type { Article, FAQ } from '../types/marketplace';
import { useI18n } from '../lib/i18n';
import type { PageView } from '../lib/router';
import { DynamicHeroBanner } from './DynamicHeroBanner';
import { Modal } from './Modal';
import { SafeImage } from './SafeImage';

interface GuidesViewProps {
  articles: Article[];
  onNavigate: (page: PageView) => void;
}

export function GuidesView({ articles, onNavigate }: GuidesViewProps) {
  const { dir, isEn } = useI18n();
  const DirArrow = isEn ? ArrowRight : ArrowLeft;
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [openArticle, setOpenArticle] = useState<Article | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(articles.map((a) => a.category).filter(Boolean))),
    [articles]
  );

  const visibleArticles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return articles.filter((a) => {
      if (selectedCategory !== 'all' && a.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.excerpt.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
      );
    });
  }, [articles, selectedCategory, searchQuery]);

  return (
    <section dir={dir} className="bg-[var(--color-canvas)] transition-colors">
      <DynamicHeroBanner
        pageKey="guides"
        breadcrumbs={[
          { label: isEn ? 'Home' : 'الرئيسية', onClick: () => onNavigate('home') },
          { label: isEn ? 'Guides & Articles' : 'الأدلة والمقالات' },
        ]}
        contextLabel={
          isEn
            ? `${articles.length} field guides`
            : `${articles.length} دليل ومقال عملي`
        }
        actions={
          <button
            type="button"
            onClick={() => onNavigate('breeds')}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[#E6B85C] hover:bg-[#F0C670] text-[#0C261B] text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 cursor-pointer"
          >
            <BookOpen size={15} aria-hidden="true" />
            <span>{isEn ? 'Breeds & Market Prices' : 'دليل السلالات والأسعار'}</span>
            <DirArrow size={14} aria-hidden="true" />
          </button>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-7">
        {/* Filter + Search Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[var(--color-surface)] p-4 rounded-2xl border border-[var(--color-border)]">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`min-h-[36px] px-3.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-[var(--color-green)] text-white'
                  : 'bg-[var(--color-canvas)] text-[var(--color-muted)] hover:text-[var(--color-ink)]'
              }`}
            >
              {isEn ? 'All Topics' : 'جميع المواضيع'} ({articles.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`min-h-[36px] px-3.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-[var(--color-green)] text-white'
                    : 'bg-[var(--color-canvas)] text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search
              size={15}
              className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isEn ? 'Search livestock guides...' : 'ابحث في الأدلة والمقالات...'}
              className="w-full h-10 ps-9 pe-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] text-xs sm:text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
            />
          </div>
        </div>

        {visibleArticles.length === 0 ? (
          <div className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] p-10 text-center space-y-2">
            <p className="font-display text-lg font-bold text-[var(--color-ink)]">
              {isEn ? 'No guides matched your search' : 'لا توجد مقالات مطابقة للبحث'}
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('all');
                setSearchQuery('');
              }}
              className="text-xs font-bold text-[var(--color-green-ink)] hover:underline cursor-pointer"
            >
              {isEn ? 'Show all guides' : 'عرض جميع الأدلة'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleArticles.map((article) => (
              <article
                key={article.id}
                className="group bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] hover:border-[var(--color-gold)] overflow-hidden flex flex-col justify-between transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
              >
                <div>
                  <div className="aspect-[16/9] bg-[var(--color-cream)] overflow-hidden">
                    <SafeImage
                      src={article.imageUrl}
                      alt={article.title}
                      width={800}
                      height={450}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="p-5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--color-muted)]">
                      <span className="font-bold text-[var(--color-green-ink)]">{article.category}</span>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Clock size={12} aria-hidden="true" />
                        <span>
                          {isEn
                            ? `${article.readTimeMinutes} min read`
                            : `${article.readTimeMinutes} دقائق قراءة`}
                        </span>
                      </span>
                    </div>
                    <h2 className="font-display text-lg font-extrabold text-[var(--color-ink)] leading-snug">
                      {article.title}
                    </h2>
                    <p className="text-xs sm:text-sm text-[var(--color-muted)] leading-relaxed line-clamp-3">
                      {article.excerpt}
                    </p>
                  </div>
                </div>

                <div className="px-5 pb-5 pt-3 border-t border-[var(--color-border)]/70">
                  <button
                    type="button"
                    onClick={() => setOpenArticle(article)}
                    className="min-h-[40px] w-full px-4 rounded-xl bg-[var(--color-cream)]/70 hover:bg-[var(--color-green)] text-[var(--color-green-ink)] hover:text-white text-xs font-bold inline-flex items-center justify-between gap-2 transition-colors cursor-pointer"
                  >
                    <span>{isEn ? 'Read Full Guide' : 'اقرأ الدليل بالكامل'}</span>
                    <DirArrow size={14} aria-hidden="true" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={Boolean(openArticle)}
        onClose={() => setOpenArticle(null)}
        title={openArticle?.title || ''}
        subtitle={
          openArticle
            ? `${openArticle.category} · ${
                isEn
                  ? `${openArticle.readTimeMinutes} min`
                  : `${openArticle.readTimeMinutes} دقائق قراءة`
              }`
            : undefined
        }
        size="lg"
      >
        {openArticle && (
          <div className="space-y-4">
            <div className="aspect-[16/9] rounded-xl overflow-hidden bg-[var(--color-cream)]">
              <SafeImage
                src={openArticle.imageUrl}
                alt={openArticle.title}
                width={800}
                height={450}
                className="w-full h-full object-cover"
              />
            </div>
            <p className="text-sm font-semibold text-[var(--color-ink)] leading-relaxed">
              {openArticle.excerpt}
            </p>
            <div className="text-sm text-[var(--color-muted)] leading-loose whitespace-pre-line border-t border-[var(--color-border)] pt-4">
              {openArticle.content}
            </div>
            <div className="pt-3 border-t border-[var(--color-border)] flex flex-wrap justify-between items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setOpenArticle(null);
                  onNavigate('listings');
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--color-green)] text-white text-xs font-bold cursor-pointer"
              >
                {isEn ? 'Browse Matching Listings' : 'استعراض العروض المتاحة الآن'}
              </button>
              <button
                type="button"
                onClick={() => setOpenArticle(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-[var(--color-border)] text-xs font-bold cursor-pointer"
              >
                {isEn ? 'Close' : 'إغلاق'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}

interface HelpCenterViewProps {
  faqs: FAQ[];
  onNavigate: (page: PageView) => void;
}

export function HelpCenterView({ faqs, onNavigate }: HelpCenterViewProps) {
  const { dir, isEn } = useI18n();
  const DirArrow = isEn ? ArrowRight : ArrowLeft;
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(faqs[0]?.id || null);

  const visibleFaqs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return faqs;
    return faqs.filter(
      (f) => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q)
    );
  }, [faqs, query]);

  return (
    <section dir={dir} className="bg-[var(--color-canvas)] transition-colors">
      <DynamicHeroBanner
        pageKey="help"
        breadcrumbs={[
          { label: isEn ? 'Home' : 'الرئيسية', onClick: () => onNavigate('home') },
          { label: isEn ? 'Help Center & FAQ' : 'مركز المساعدة والأسئلة الشائعة' },
        ]}
        contextLabel={`${faqs.length} ${isEn ? 'verified answers' : 'سؤال شائع'}`}
        actions={
          <>
            <button
              type="button"
              onClick={() => onNavigate('contact')}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#E6B85C] hover:bg-[#F0C670] text-[#0C261B] text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 cursor-pointer"
            >
              <span>{isEn ? 'Contact Support Team' : 'تواصل مع فريق الدعم'}</span>
              <DirArrow size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('rules')}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-white/30 bg-[#0B2A1E]/80 text-white text-xs sm:text-sm font-bold cursor-pointer"
            >
              {isEn ? 'Listing Rules & Moderation' : 'شروط النشر والمراجعة'}
            </button>
          </>
        }
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-6">
        <div className="relative">
          <Search
            size={16}
            className="absolute start-3.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              isEn
                ? 'Search questions about listings, verification, commission...'
                : 'ابحث في الأسئلة الشائعة عن الإعلانات، التوثيق، أو العمولة...'
            }
            className="w-full h-12 ps-10 pe-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
          />
        </div>

        <div className="space-y-3">
          {visibleFaqs.map((item) => {
            const expanded = openId === item.id;
            return (
              <article
                key={item.id}
                className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden"
              >
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpenId(expanded ? null : item.id)}
                  className="w-full p-5 text-start flex items-center justify-between gap-4 cursor-pointer hover:bg-[var(--color-cream)]/40 transition-colors"
                >
                  <span className="font-display text-sm sm:text-base font-extrabold text-[var(--color-ink)]">
                    {item.question}
                  </span>
                  <ChevronDown
                    size={18}
                    className={`shrink-0 text-[var(--color-green-ink)] transition-transform duration-150 ${
                      expanded ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>
                {expanded && (
                  <div className="px-5 pb-5 pt-1 text-sm text-[var(--color-muted)] leading-relaxed border-t border-[var(--color-border)]/60">
                    {item.answer}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <div className="rounded-2xl bg-[var(--color-cream)]/70 border border-[var(--color-border)] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <HelpCircle size={22} className="text-[var(--color-green-ink)] shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h2 className="font-display text-base font-extrabold text-[var(--color-ink)]">
                {isEn ? 'Still need direct help?' : 'لم تجد إجابة سؤالك؟'}
              </h2>
              <p className="text-xs sm:text-sm text-[var(--color-muted)]">
                {isEn
                  ? 'Send a direct inquiry to our marketplace team with your phone or reference ID.'
                  : 'راسل فريق دعم سوق الغنم مباشرة وسنرد عليك في أقرب وقت.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('contact')}
            className="min-h-[42px] px-5 py-2 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs sm:text-sm font-bold whitespace-nowrap cursor-pointer shrink-0"
          >
            {isEn ? 'Contact Support' : 'تواصل معنا'}
          </button>
        </div>
      </div>
    </section>
  );
}

interface PolicyViewProps {
  mode: 'about' | 'rules' | 'privacy' | 'terms';
  onNavigate: (page: PageView) => void;
}

export function PolicyInfoView({ mode, onNavigate }: PolicyViewProps) {
  const { dir, isEn } = useI18n();
  const DirArrow = isEn ? ArrowRight : ArrowLeft;

  const contentMap = {
    about: {
      eyebrow: isEn ? 'Saudi Identity & Mission' : 'عن منصة سوق الغنم 2.0',
      sections: [
        {
          icon: ShieldCheck,
          title: isEn ? 'Direct Breeder-to-Buyer Marketplace' : 'سوق سعودي من المربي إلى المشتري',
          points: isEn
            ? [
                'Structured specs: breed, head count, age in months, approximate weight, vaccination status, and SAR pricing.',
                'Covers all 13 Saudi regions with verified breeder screening and authentic buyer reviews.',
                'No random middlemen or hidden broker markups.',
              ]
            : [
                'مواصفات منظمة تشمل السلالة، العدد، العمر بالأشهر، الوزن التقريبي، حالة التحصين، والسعر بالريال السعودي.',
                'تغطية شاملة لجميع مناطق المملكة الـ 13 مع نظام توثيق المربين وتقييمات المشترين الفعلية.',
                'تواصل مباشر بين البائع والمشتري بدون وسطاء عشوائيين.',
              ],
        },
        {
          icon: CheckCircle2,
          title: isEn ? 'Smart Tools & Transparent Commission' : 'أدوات تخطيط ذكية وعمولة واضحة',
          points: isEn
            ? [
                'Includes Feast Calculator, Carcass Weight Yield, Transport Cost Estimator, and Herd Feed Planner.',
                '100% free listing publication; only a 1% marketplace fee applies after an actual completed sale.',
              ]
            : [
                'حاسبات مجانية مدمجة: حاسبة الولائم، الأوزان والتصافي، تكلفة النقل، ومخطط الأعلاف والقطيع.',
                'نشر الإعلانات مجاني، وتُحتسب عمولة المنصة (1%) بعد إتمام البيع الفعلي فقط.',
              ],
        },
      ],
    },
    rules: {
      eyebrow: isEn ? 'Listing Moderation Standards' : 'ضوابط جودة الإعلانات والمراجعة',
      sections: [
        {
          icon: FileText,
          title: isEn ? 'Mandatory Specification Rules' : 'ضوابط المواصفات والصور المطلوبة',
          points: isEn
            ? [
                'Photos must clearly depict the actual livestock offered—no stock photos or misleading edits.',
                'Age in months, approximate weight, head count, region, and SAR price must reflect the real herd.',
                'Sold or unavailable listings must be updated promptly from My Account.',
              ]
            : [
                'يجب إرفاق صور حقيقية وواضحة للمواشي المعروضة وعدم استخدام صور مقتبسة أو مضللة.',
                'يشترط دقة البيانات المسجلة للعمر بالأشهر، الوزن التقريبي، العدد، المنطقة، والسعر بالريال السعودي.',
                'يلتزم البائع بتحديث حالة الإعلان إلى «مباع» فور إتمام الصفقة حفاظاً على وقت المشترين.',
              ],
        },
        {
          icon: ShieldCheck,
          title: isEn ? 'Moderation & Reporting' : 'المراجعة الإدارية ونظام البلاغات',
          points: isEn
            ? [
                'Duplicate, spam, or off-topic listings are rejected with clear moderation reasons.',
                'Any member can report inaccurate specifications directly from the listing detail page.',
              ]
            : [
                'ترفض الإدارة الإعلانات المكررة أو الوهمية أو المخالفة للضوابط مع توضيح سبب الرفض.',
                'يمكن لأي مستخدم الإبلاغ الفوري من صفحة الإعلان لمراجعة أي محتوى غير مطابق.',
              ],
        },
      ],
    },
    privacy: {
      eyebrow: isEn ? 'Member Privacy & Security' : 'سياسة الخصوصية وحماية البيانات',
      sections: [
        {
          icon: Lock,
          title: isEn ? 'How Account & Contact Data Are Protected' : 'حماية بيانات الحسابات وأرقام التواصل',
          points: isEn
            ? [
                'Phone numbers and account details are stored securely; direct phone reveals are rate-limited and protected.',
                'Passwords are hashed and protected with CSRF tokens and secure HTTP sessions.',
                'In-app conversations keep price offers and agreements logged safely without exposing sensitive info.',
              ]
            : [
                'تُحفظ بيانات الحساب وأرقام الجوال بأمان ولا يُكشف رقم البائع إلا عند الطلب المنظم من صفحة العرض.',
                'تخضع الجلسات لحماية متقدمة عبر التشفير ورموز التحقق لمنع الوصول غير المصرح به.',
                'تُحفظ سجل المحادثات وعروض السعر داخل المنصة لتوثيق التفاهم بين الطرفين.',
              ],
        },
      ],
    },
    terms: {
      eyebrow: isEn ? 'Terms & Service Agreement' : 'الشروط والأحكام واتفاقية الخدمة',
      sections: [
        {
          icon: FileText,
          title: isEn ? 'Marketplace Terms & 1% Fee Agreement' : 'أحكام الاستخدام ونظام العمولة 1%',
          points: isEn
            ? [
                'SouqAlGhanam serves as a specialized digital platform connecting livestock breeders and buyers directly.',
                'Buyers are advised to inspect livestock visually or request a veterinary check before final payment.',
                'Sellers agree to the 1% platform commission upon completed sales facilitated through the platform.',
              ]
            : [
                'يعمل سوق الغنم 2.0 كمنصة رقمية منظمة لربط المربين بالمشترين في المملكة العربية السعودية.',
                'يُوصى بالمعاينة المباشرة أو طلب الفحص البيطري قبل تسليم المبلغ النهائي واستلام القطيع.',
                'يلتزم البائع بسداد عمولة المنصة (1%) عن البيعات المكتملة عبر الموقع، وتُدار عبر حاسبة السداد واللوحة.',
              ],
        },
      ],
    },
  }[mode];

  return (
    <section dir={dir} className="bg-[var(--color-canvas)] transition-colors">
      <DynamicHeroBanner
        pageKey={mode}
        breadcrumbs={[
          { label: isEn ? 'Home' : 'الرئيسية', onClick: () => onNavigate('home') },
          { label: contentMap.eyebrow },
        ]}
        actions={
          <button
            type="button"
            onClick={() => onNavigate('listings')}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[#E6B85C] hover:bg-[#F0C670] text-[#0C261B] text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 cursor-pointer"
          >
            <span>{isEn ? 'Browse Active Listings' : 'تصفح الإعلانات الآن'}</span>
            <DirArrow size={14} aria-hidden="true" />
          </button>
        }
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-6">
        {contentMap.sections.map((sec) => {
          const Icon = sec.icon;
          return (
            <article
              key={sec.title}
              className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] p-6 sm:p-7 space-y-4"
            >
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)] text-[var(--color-green-ink)] flex items-center justify-center shrink-0">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <h2 className="font-display text-xl font-extrabold text-[var(--color-ink)]">
                  {sec.title}
                </h2>
              </div>
              <ul className="space-y-2.5 text-sm text-[var(--color-muted)]">
                {sec.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-2.5 leading-relaxed">
                    <CheckCircle2
                      size={15}
                      className="text-[var(--color-green-ink)] shrink-0 mt-1"
                      aria-hidden="true"
                    />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--color-cream)]/70 border border-[var(--color-border)] p-5">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { page: 'about' as const, label: isEn ? 'About Us' : 'من نحن' },
                { page: 'rules' as const, label: isEn ? 'Listing Rules' : 'شروط النشر' },
                { page: 'privacy' as const, label: isEn ? 'Privacy Policy' : 'سياسة الخصوصية' },
                { page: 'terms' as const, label: isEn ? 'Terms & Agreement' : 'الشروط والأحكام' },
                { page: 'help' as const, label: isEn ? 'Help Center' : 'مركز المساعدة' },
              ]
            ).map((navItem) => (
              <button
                key={navItem.page}
                type="button"
                onClick={() => onNavigate(navItem.page)}
                className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  mode === navItem.page
                    ? 'bg-[var(--color-green)] text-white'
                    : 'bg-[var(--color-surface)] text-[var(--color-green-ink)] border border-[var(--color-border)] hover:border-[var(--color-gold)]'
                }`}
              >
                {navItem.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onNavigate('contact')}
            className="text-xs font-bold text-[var(--color-green-ink)] hover:underline cursor-pointer"
          >
            {isEn ? 'Questions? Contact Support' : 'لديك استفسار؟ تواصل معنا'}
          </button>
        </div>
      </div>
    </section>
  );
}
