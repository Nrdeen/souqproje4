import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  HERO_AUTOPLAY_INTERVAL_MS,
  HERO_SLIDES,
  resolveHeroKeyAction,
  resolveHeroKeyDirection,
  resolveHeroSwipeDirection,
  stepHeroSlide,
} from '../../src/lib/hero-slider';
import { resolveMarketplaceWebp } from '../../src/lib/modal-focus';

test('HERO_SLIDES preserves original Slide 1 photograph and defines exact 3 Saudi marketplace slides', () => {
  assert.equal(HERO_AUTOPLAY_INTERVAL_MS, 7000);
  assert.equal(HERO_SLIDES.length, 3);

  const [slide1, slide2, slide3] = HERO_SLIDES;

  assert.equal(slide1.imageSrc, '/src/assets/images/hero_saudi_livestock_1794608168927.jpg');
  assert.equal(slide1.eyebrow, 'سوق المواشي السعودي');
  assert.equal(slide1.headline, 'سوق الغنم');
  assert.equal(slide1.subheadline, 'من المربّي إلى المشتري');
  assert.deepEqual(
    slide1.actions.map((a) => a.label),
    ['تصفح الإعلانات', 'أضف إعلانك']
  );

  assert.equal(slide2.headline, 'اكتشف السلالات الأصيلة');
  assert.deepEqual(
    slide2.actions.map((a) => a.label),
    ['استكشف السلالات', 'تصفح الإعلانات']
  );

  assert.equal(slide3.headline, 'مواشيك تستحق أفضل عرض');
  assert.deepEqual(
    slide3.actions.map((a) => a.label),
    ['أضف إعلانك', 'كيف تعمل المنصة؟']
  );

  for (const slide of HERO_SLIDES) {
    const jpgAbs = path.resolve(process.cwd(), slide.imageSrc.replace(/^\//, ''));
    const webpSrc = resolveMarketplaceWebp(slide.imageSrc);
    assert.ok(fs.existsSync(jpgAbs), `Missing slide JPG: ${jpgAbs}`);
    assert.ok(webpSrc, `Missing WebP mapping for ${slide.imageSrc}`);
    const webpAbs = path.resolve(process.cwd(), webpSrc.replace(/^\//, ''));
    assert.ok(fs.existsSync(webpAbs), `Missing slide WebP: ${webpAbs}`);
  }
});

test('Hero slider circular stepping, RTL keyboard, and swipe gesture math behave reliably', () => {
  assert.equal(stepHeroSlide(0, 3, 'next'), 1);
  assert.equal(stepHeroSlide(2, 3, 'next'), 0);
  assert.equal(stepHeroSlide(0, 3, 'prev'), 2);
  assert.equal(stepHeroSlide(1, 3, 'prev'), 0);

  assert.equal(resolveHeroKeyDirection('ArrowLeft'), 'next');
  assert.equal(resolveHeroKeyDirection('ArrowRight'), 'prev');
  assert.equal(resolveHeroKeyDirection('Enter'), null);

  assert.equal(resolveHeroKeyAction('ArrowLeft'), 'next');
  assert.equal(resolveHeroKeyAction('ArrowRight'), 'prev');
  assert.equal(resolveHeroKeyAction('Home'), 'first');
  assert.equal(resolveHeroKeyAction('End'), 'last');
  assert.equal(resolveHeroKeyAction('Tab'), null);

  // Horizontal RTL swipes
  assert.equal(resolveHeroSwipeDirection(-64, 12), 'next');
  assert.equal(resolveHeroSwipeDirection(70, -10), 'prev');
  // Small taps or vertical scrolls ignored
  assert.equal(resolveHeroSwipeDirection(-20, 4), null);
  assert.equal(resolveHeroSwipeDirection(-55, 80), null);
});

test('HeroSearch implements cinematic crossfade, directional scrim, accessible controls, and progressive image loading', () => {
  const heroSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/HeroSearch.tsx'),
    'utf8'
  );
  assert.match(heroSrc, /aria-roledescription="carousel"/);
  assert.match(heroSrc, /aria-label=\{.*'الشريحة السابقة'/);
  assert.match(heroSrc, /aria-label=\{.*'الشريحة التالية'/);
  assert.match(heroSrc, /role="tablist"/);
  assert.match(heroSrc, /hero-progress-bar/);
  assert.match(heroSrc, /prefers-reduced-motion:\s*reduce/);
  assert.match(heroSrc, /new Set\(\[0\]\)/);
  assert.match(heroSrc, /duration-\[900ms\]/);
  assert.match(heroSrc, /inert=\{!isActive\}/);
  assert.match(heroSrc, /matches\(':focus-visible'\)/);
  assert.match(heroSrc, /visibilitychange/);
  assert.doesNotMatch(heroSrc, /aria-live="polite"[\s\S]*HERO_SLIDES/);
});
