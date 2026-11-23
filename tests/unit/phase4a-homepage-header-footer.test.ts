import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('Phase 4A Homepage, Header, and Footer preserve core contracts and implement the complete marketplace modernization', () => {
  const headerSrc = readFileSync(resolve(process.cwd(), 'src/components/Header.tsx'), 'utf8');
  assert.match(headerSrc, /getRoleAwareNavItems/);
  assert.match(headerSrc, /aria-label=\{t\.navAriaLabel\}/);
  assert.match(headerSrc, /id="mobile-nav-drawer"/);
  assert.match(headerSrc, /souq-mobile-panel/);
  assert.match(headerSrc, /onMarkAllNotificationsRead/);

  const heroSrc = readFileSync(resolve(process.cwd(), 'src/components/HeroSearch.tsx'), 'utf8');
  assert.match(heroSrc, /id="hero-search-q"/);
  assert.match(heroSrc, /id="hero-cat"/);
  assert.match(heroSrc, /id="hero-breed"/);
  assert.match(heroSrc, /id="hero-reg"/);
  assert.match(heroSrc, /id="hero-price"/);
  assert.match(heroSrc, /onBrowseAll/);
  assert.match(heroSrc, /onAddListing/);
  assert.match(heroSrc, /تصفح الإعلانات/);
  assert.match(heroSrc, /أضف إعلانك/);

  const sectionsSrc = readFileSync(
    resolve(process.cwd(), 'src/components/HomeSections.tsx'),
    'utf8'
  );
  assert.match(sectionsSrc, /export function HomeStatsStrip/);
  assert.match(sectionsSrc, /export function HomeCategoriesSection/);
  assert.match(sectionsSrc, /export function HomeBreedsSection/);
  assert.match(sectionsSrc, /export function HomeRegionsSection/);
  assert.match(sectionsSrc, /export function HomeServicesSection/);
  assert.match(sectionsSrc, /export function HomeBreedersSection/);
  assert.match(sectionsSrc, /export function HomeTrustSection/);
  assert.match(sectionsSrc, /export function HomeGuidesPreviewSection/);
  assert.match(sectionsSrc, /export function HomePricingSection/);
  assert.match(sectionsSrc, /export function HomeQuickContactSection/);
  assert.doesNotMatch(sectionsSrc, /export function HomeGuidesSection/);
  assert.match(sectionsSrc, /verifiedSellers\.length === 0/);
  assert.match(sectionsSrc, /VerifiedSellerBadge/);

  const categoriesSectionSrc = readFileSync(
    resolve(process.cwd(), 'src/components/HomeCategoriesSection.tsx'),
    'utf8'
  );
  assert.match(categoriesSectionSrc, /export function HomeCategoriesSection/);
  assert.match(categoriesSectionSrc, /MedallionLivestockIcon/);
  assert.match(categoriesSectionSrc, /'naimi'/);
  assert.match(categoriesSectionSrc, /'najdi'/);
  assert.match(categoriesSectionSrc, /'harri'/);
  assert.match(categoriesSectionSrc, /'ardhi'/);
  assert.match(categoriesSectionSrc, /'sawakni'/);
  assert.match(categoriesSectionSrc, /grid-cols-\[repeat\(auto-fit,minmax\(152px,1fr\)\)\]/);

  const footerSrc = readFileSync(resolve(process.cwd(), 'src/components/Footer.tsx'), 'utf8');
  const i18nSrc = readFileSync(resolve(process.cwd(), 'src/lib/i18n.tsx'), 'utf8');
  assert.match(footerSrc, /getRoleAwareFooterAccountLinks/);
  assert.match(footerSrc, /t\.footerSectionsTitle/);
  assert.match(footerSrc, /t\.footerHelpTitle/);
  assert.match(footerSrc, /t\.footerBreedsTitle/);
  assert.match(footerSrc, /t\.footerLinkPricing/);
  assert.match(footerSrc, /t\.footerLinkTransport/);
  assert.match(footerSrc, /t\.footerLinkFeed/);
  assert.match(footerSrc, /t\.footerNewsletterCta/);
  assert.match(i18nSrc, /أقسام المنصة/);
  assert.match(i18nSrc, /المساعدة والدعم/);
  assert.match(i18nSrc, /السلالات الشائعة/);
  assert.match(i18nSrc, /الباقات والأسعار/);
  assert.match(i18nSrc, /اشترك الآن/);
  assert.match(footerSrc, /saudi-sadu-band/);
  assert.doesNotMatch(footerSrc, /href="#"/);

  const routerSrc = readFileSync(resolve(process.cwd(), 'src/lib/router.ts'), 'utf8');
  for (const route of [
    'pricing',
    'weights',
    'transport',
    'feed',
    'guides',
    'help',
    'about',
    'rules',
    'privacy',
    'terms',
  ]) {
    assert.match(routerSrc, new RegExp(`'${route}'`));
    assert.match(routerSrc, new RegExp(`/${route}`));
  }

  const pricingSrc = readFileSync(resolve(process.cwd(), 'src/components/PricingView.tsx'), 'utf8');
  assert.match(pricingSrc, /export function PricingView/);
  assert.match(pricingSrc, /الباقات والأسعار/);
  assert.match(pricingSrc, /مقارنة بين الباقات/);

  const appSrc = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  assert.match(appSrc, /<HomeStatsStrip/);
  assert.match(appSrc, /<HomeCategoriesSection/);
  assert.match(appSrc, /<HomeBreedsSection/);
  assert.match(appSrc, /<HomeRegionsSection/);
  assert.match(appSrc, /<HomeServicesSection/);
  assert.match(appSrc, /<HomeBreedersSection/);
  assert.match(appSrc, /<HomeTrustSection/);
  assert.match(appSrc, /<HomeGuidesPreviewSection/);
  assert.match(appSrc, /<HomePricingSection/);
  assert.match(appSrc, /<HomeQuickContactSection/);
  assert.match(appSrc, /<PricingView/);
  assert.match(appSrc, /<WeightsCalculatorView/);
  assert.match(appSrc, /<TransportCalculatorView/);
  assert.match(appSrc, /<FeedCalculatorView/);
  assert.match(appSrc, /<GuidesView/);
  assert.match(appSrc, /<HelpCenterView/);
  assert.match(appSrc, /<PolicyInfoView/);
  assert.match(appSrc, /verifiedSellers=\{verifiedHomeSellers\}/);
});

test('Header implements 7-item Saudi marketplace navigation with visible Contact link, compact Globe language menu, single Login CTA, and 2-column Services mega menu', () => {
  const headerSrc = readFileSync(resolve(process.cwd(), 'src/components/Header.tsx'), 'utf8');
  const i18nSrc = readFileSync(resolve(process.cwd(), 'src/lib/i18n.tsx'), 'utf8');

  // Compact identity & subtitle
  assert.match(i18nSrc, /brandName:\s*'سوق الغنم 2\.0'/);
  assert.match(i18nSrc, /brandSubtitle:\s*'منصة سعودية لبيع وشراء المواشي'/);

  // 7 primary navigation items: Home, Listings, Breeds, Breeders, Packages & Pricing, Services (Mega), Contact Us (Standalone visible)
  assert.match(i18nSrc, /navHome:\s*'الرئيسية'/);
  assert.match(i18nSrc, /navListings:\s*'الإعلانات'/);
  assert.match(i18nSrc, /navBreeds:\s*'السلالات'/);
  assert.match(i18nSrc, /navBreeders:\s*'المربون'/);
  assert.match(i18nSrc, /navPricing:\s*'الباقات والأسعار'/);
  assert.match(i18nSrc, /navServices:\s*'الخدمات'/);
  assert.match(i18nSrc, /navContact:\s*'تواصل معنا'/);

  // Standalone Contact Us link directly visible in desktop nav
  assert.match(headerSrc, /onClick=\{\(\) => handleNav\('contact'\)\}/);
  assert.match(headerSrc, /t\.navContact/);

  // 2-column mega menus including Services + Tools & Knowledge
  assert.match(headerSrc, /souq-editorial-menu/);
  assert.match(headerSrc, /souq-services-mega-columns/);

  // Single Login button pre-auth (no separate Register button in header), Account dropdown post-auth
  assert.match(headerSrc, /className="souq-login"/);
  assert.doesNotMatch(
    headerSrc,
    /onClick=\{\(\)\s*=>\s*handleNav\('login',\s*\{\s*authMode:\s*'register'\s*\}\)\}/
  );
  assert.match(headerSrc, /<span>\{t\.myAccount\}<\/span>/);

  // Compact Globe + Chevron language toggle with real AR/EN languages only (no fake Turkish)
  assert.match(headerSrc, /id="languageToggle"/);
  assert.match(headerSrc, /Globe/);
  assert.match(i18nSrc, /code:\s*'ar'.*label:\s*'العربية'/);
  assert.match(i18nSrc, /code:\s*'en'.*label:\s*'English'/);
  assert.doesNotMatch(i18nSrc, /Türkçe/);

  // No fabricated contact numbers/emails anywhere in ContactSection
  const contactSrc = readFileSync(
    resolve(process.cwd(), 'src/components/ContactSection.tsx'),
    'utf8'
  );
  assert.doesNotMatch(contactSrc, /9200/);
  assert.doesNotMatch(contactSrc, /0500/);
  assert.doesNotMatch(contactSrc, /support@souqalghanam\.sa/);
});
