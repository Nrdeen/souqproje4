import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hashPassword } from '../../server/auth/password';
import {
  attachDiagnostics,
  inspectViewportLayout,
  launchChromiumBrowser,
  startE2EServer,
  type TestServerHandle,
} from './helpers/browser';

const STRONG_PASSWORD = 'SouqTest!2026#Safe';
const ADMIN_PHONE = '0509998877';
const SCREENSHOT_DIR = process.env.E2E_SCREENSHOT_DIR || '';

let srvHandle: TestServerHandle;
let browser: any;

function buildMinimalMp4Buffer(): Buffer {
  // Valid ISO Base Media (MP4 isom) ftyp box + minimal moov/mdat stub accepted by magic-byte validator
  const ftyp = Buffer.from([
    0x00, 0x00, 0x00, 0x18, // size 24
    0x66, 0x74, 0x79, 0x70, // 'ftyp'
    0x69, 0x73, 0x6f, 0x6d, // 'isom'
    0x00, 0x00, 0x02, 0x00, // minor version
    0x69, 0x73, 0x6f, 0x6d, // 'isom'
    0x6d, 0x70, 0x34, 0x31, // 'mp41'
  ]);
  const mdat = Buffer.from([0x00, 0x00, 0x00, 0x10, 0x6d, 0x64, 0x61, 0x74, 0, 0, 0, 0, 0, 0, 0, 0]);
  return Buffer.concat([ftyp, mdat]);
}

async function saveScreenshot(page: any, name: string) {
  if (!SCREENSHOT_DIR) return;
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: false });
}

async function scrollAndWaitImages(page: any) {
  await page.evaluate(async () => {
    const g = globalThis as any;
    const step = Math.max(220, Math.floor(g.window.innerHeight * 0.7));
    const maxY = Math.max(0, g.document.body.scrollHeight - g.window.innerHeight);
    for (let y = 0; y <= maxY; y += step) {
      g.window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    g.window.scrollTo(0, maxY);
    await new Promise((r) => setTimeout(r, 200));
    for (const img of Array.from(g.document.querySelectorAll('img')) as any[]) {
      if (!img.complete || img.naturalWidth === 0) {
        img.scrollIntoView({ block: 'center' });
        await new Promise((r) => setTimeout(r, 120));
      }
    }
  });
  await page.waitForFunction(
    () => {
      const imgs = Array.from((globalThis as any).document.querySelectorAll('img')) as any[];
      return imgs.every((img) => img.complete && img.naturalWidth > 0);
    },
    null,
    { timeout: 15_000 }
  );
  await page.evaluate(() => (globalThis as any).window.scrollTo(0, 0));
  await page.waitForLoadState('networkidle');
}

before(async () => {
  srvHandle = await startE2EServer();

  // Seed a deterministic isolated admin account with known credentials
  const store = srvHandle.server.getStore();
  const adminId = 'usr_e2e_admin';
  if (!store.users.some((u: any) => u.id === adminId)) {
    store.users.push({
      id: adminId,
      phone: ADMIN_PHONE,
      email: 'e2e-admin@souq.test',
      name: 'مشرف الاختبار',
      role: 'admin',
      status: 'active',
      createdAt: new Date().toISOString(),
      phoneVerifiedAt: null,
    });
    store.credentials.push({
      userId: adminId,
      passwordHash: await hashPassword(STRONG_PASSWORD),
      updatedAt: new Date().toISOString(),
    });
    srvHandle.server.flushStore();
  }

  const launched = await launchChromiumBrowser();
  browser = launched.browser;
});

after(async () => {
  if (browser) await browser.close();
  if (srvHandle) await srvHandle.cleanup();
});

test('Responsive RTL layout, WebP images, mobile drawer, and zero overflow across 320px–1920px', async () => {
  const viewports = [
    { name: 'mobile-320', width: 320, height: 568, mobile: true },
    { name: 'mobile-360', width: 360, height: 800, mobile: true },
    { name: 'mobile-375', width: 375, height: 812, mobile: true },
    { name: 'mobile-390', width: 390, height: 844, mobile: true },
    { name: 'mobile-430', width: 430, height: 932, mobile: true },
    { name: 'tablet-768', width: 768, height: 1024, mobile: false },
    { name: 'desktop-1280', width: 1280, height: 800, mobile: false },
    { name: 'desktop-1920', width: 1920, height: 1080, mobile: false },
  ];

  const reportSummary: Array<Record<string, unknown>> = [];

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: 'ar-SA',
    });
    const page = await context.newPage();
    const diag = attachDiagnostics(page);

    try {
      await page.goto(srvHandle.baseUrl, { waitUntil: 'networkidle' });
      await page.waitForSelector('h1');

      // Scroll incrementally so loading="lazy" images enter the viewport and decode cleanly
      await scrollAndWaitImages(page);

      const homeLayout = await inspectViewportLayout(page);
      assert.equal(homeLayout.dir, 'rtl', `${vp.name} expected dir="rtl"`);
      assert.equal(homeLayout.lang, 'ar', `${vp.name} expected lang="ar"`);
      assert.equal(
        homeLayout.overflowPx,
        0,
        `${vp.name} home horizontal overflow: scrollWidth=${homeLayout.scrollWidth} > innerWidth=${homeLayout.innerWidth}`
      );
      assert.equal(homeLayout.brokenImages.length, 0, `${vp.name} broken images: ${JSON.stringify(homeLayout.brokenImages)}`);
      assert.equal(homeLayout.headerOverflow, false, `${vp.name} header overflowed viewport`);
      assert.equal(homeLayout.headerOverlapCount, 0, `${vp.name} header buttons overlapped`);

      // Verify WebP negotiated for hero image in modern Chromium
      const heroSrc = await page.evaluate(() => {
        const g = globalThis as any;
        const heroImg = g.document.querySelector('section img');
        return heroImg ? heroImg.currentSrc || heroImg.src : '';
      });
      assert.match(heroSrc, /\.webp($|\?)/, `${vp.name} expected WebP hero currentSrc, got ${heroSrc}`);

      await saveScreenshot(page, `home-${vp.name}`);

      if (vp.mobile) {
        // Verify MobileBottomNav visibility, 5 actions, and non-overlap with AI Assistant launcher
        const mobileNav = page.getByTestId('mobile-bottom-nav');
        await mobileNav.waitFor({ state: 'visible' });
        assert.equal(await mobileNav.locator('button').count(), 5, `${vp.name} bottom nav must have 5 buttons`);
        const aiLauncher = page.getByTestId('ai-assistant-launcher');
        await aiLauncher.waitFor({ state: 'visible' });
        const [navBox, aiBox] = await Promise.all([mobileNav.boundingBox(), aiLauncher.boundingBox()]);
        assert.ok(navBox && aiBox, `${vp.name} expected bottom nav and AI launcher bounding boxes`);
        assert.ok(
          aiBox.y + aiBox.height <= navBox.y + 2,
          `${vp.name} AI launcher overlapped MobileBottomNav (aiBottom=${aiBox.y + aiBox.height}, navTop=${navBox.y})`
        );

        // Test mobile navigation drawer open + Escape dismiss
        const toggleBtn = page.getByRole('button', { name: 'فتح القائمة' });
        await toggleBtn.click();
        await page.waitForSelector('#mobile-nav-drawer');
        await page.keyboard.press('Escape');
        await page.waitForSelector('#mobile-nav-drawer', { state: 'detached' });
      }

      // Navigate to Listings Directory
      await page.goto(`${srvHandle.baseUrl}/listings`, { waitUntil: 'networkidle' });
      await page.waitForSelector('#flt-q');
      await scrollAndWaitImages(page);
      const dirLayout = await inspectViewportLayout(page);
      assert.equal(
        dirLayout.overflowPx,
        0,
        `${vp.name} directory horizontal overflow: ${dirLayout.overflowPx}px`
      );
      assert.equal(dirLayout.brokenImages.length, 0, `${vp.name} broken directory images`);
      await saveScreenshot(page, `directory-${vp.name}`);

      if (vp.mobile && vp.width === 375) {
        // Test Mobile Bottom-Sheet Advanced Filters open & close
        await page.getByRole('button', { name: /الفلاتر المتقدمة/ }).click();
        await page.waitForSelector('#directory-advanced-filters');
        assert.equal(
          await page.locator('#directory-advanced-filters').isVisible(),
          true,
          'Mobile bottom-sheet filters should be visible after click'
        );
        await page.getByRole('button', { name: 'إغلاق الفلاتر' }).click();
        await page.waitForSelector('#directory-advanced-filters', { state: 'hidden' });

        // Test ListingDetailView mobile sticky buyer CTA bar vs MobileBottomNav + AI launcher clearance
        const firstCard = page.locator('article button[aria-label^="عرض تفاصيل "]').first();
        await firstCard.click();
        const detailBar = page.getByLabel('إجراءات التواصل السريعة');
        await detailBar.waitFor({ state: 'visible' });
        assert.equal(
          await page.getByTestId('mobile-bottom-nav').count(),
          0,
          'MobileBottomNav should hide when detail buyer sticky bar is active'
        );
        const [barBox, aiDetailBox] = await Promise.all([
          detailBar.boundingBox(),
          page.getByTestId('ai-assistant-launcher').boundingBox(),
        ]);
        assert.ok(barBox && aiDetailBox, 'Expected detail bar and AI launcher bounding boxes');
        assert.ok(
          aiDetailBox.y + aiDetailBox.height <= barBox.y + 2,
          `Mobile detail AI launcher overlapped sticky bar (aiBottom=${aiDetailBox.y + aiDetailBox.height}, barTop=${barBox.y})`
        );
        const detailLayout = await inspectViewportLayout(page);
        assert.equal(detailLayout.overflowPx, 0, 'Mobile 375px listing detail horizontal overflow');
      }

      // Navigate to Auth page
      await page.goto(`${srvHandle.baseUrl}/login`, { waitUntil: 'networkidle' });
      await page.waitForSelector('#auth-phone');
      const authLayout = await inspectViewportLayout(page);
      assert.equal(
        authLayout.overflowPx,
        0,
        `${vp.name} auth horizontal overflow: ${authLayout.overflowPx}px`
      );

      assert.deepEqual(diag.pageErrors, [], `${vp.name} uncaught page errors: ${diag.pageErrors}`);
      assert.deepEqual(diag.consoleErrors, [], `${vp.name} console errors: ${diag.consoleErrors}`);
      assert.deepEqual(
        diag.failedResponses,
        [],
        `${vp.name} failed HTTP responses: ${JSON.stringify(diag.failedResponses)}`
      );

      reportSummary.push({
        viewport: vp.name,
        homeOverflowPx: homeLayout.overflowPx,
        dirOverflowPx: dirLayout.overflowPx,
        authOverflowPx: authLayout.overflowPx,
        brokenImages: homeLayout.brokenImages.length + dirLayout.brokenImages.length,
        heroWebp: /\.webp/.test(heroSrc),
      });
    } finally {
      await context.close();
    }
  }

  console.log('[E2E Responsive Summary]', JSON.stringify(reportSummary));
});

test('Visitor discovery, filters, accessible ImageLightbox (focus trap + RTL + returnFocus), and contact privacy', async () => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'ar-SA',
  });
  const page = await context.newPage();
  const diag = attachDiagnostics(page, { allowHttpStatuses: [401] });

  try {
    await page.goto(srvHandle.baseUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1');

    // Quick search from homepage hero
    await page.locator('#hero-search-q').fill('نعيمي');
    await page.getByRole('button', { name: 'ابحث الآن' }).click();
    await page.waitForSelector('#flt-q');
    assert.ok(page.url().includes('/listings'), `Expected /listings URL, got ${page.url()}`);

    // Apply reset filters & verify cards appear
    await page.waitForSelector('article');
    const firstCardBtn = page.locator('article button[aria-label^="عرض تفاصيل "]').first();
    await firstCardBtn.click();

    await page.waitForSelector('[aria-label="معرض صور وفيديو الإعلان"]');

    // Contact privacy: unauthenticated visitor must NOT see seller phone or direct WhatsApp contact link
    // (note: public share link `https://wa.me/?text=...` is allowed, as long as it contains no seller phone)
    const contactText = await page.locator('main, section').first().innerText();
    assert.ok(contactText.includes('تسجيل الدخول للتواصل'), 'Expected login prompt for unauthenticated contact');
    assert.equal(
      await page.locator('a[href^="tel:"], a[href*="wa.me/966"], a[href*="wa.me/05"]').count(),
      0,
      'Unauthenticated visitor must never see tel: or direct seller wa.me phone links in DOM'
    );
    const leakedPhoneInDom = await page.evaluate(() => {
      const g = globalThis as any;
      const waHrefs = Array.from(g.document.querySelectorAll('a[href*="wa.me"]')).map(
        (a: any) => a.getAttribute('href') || ''
      );
      return waHrefs.some((href) => /(9665|05)\d{8}/.test(href));
    });
    assert.equal(leakedPhoneInDom, false, 'Share WhatsApp links must not expose seller phone digits');

    // Direct API contact reveal without auth must return 401
    const listingId = new URL(page.url()).pathname.split('/').pop();
    const unauthContactStatus = await page.evaluate(async (id: string) => {
      const r = await fetch(`/api/v1/listings/${id}/contact`, { method: 'POST' });
      return r.status;
    }, listingId);
    assert.equal(unauthContactStatus, 401);

    // Open Accessible Lightbox via Zoom button (zoomBtnRef target)
    const zoomBtn = page.getByRole('button', { name: 'عرض الصورة بالحجم الكامل' });
    await zoomBtn.focus();
    await zoomBtn.click();

    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible' });

    // Body scroll must be locked while lightbox is open
    const lockedOverflow = await page.evaluate(() => (globalThis as any).document.body.style.overflow);
    assert.equal(lockedOverflow, 'hidden');

    // Tab stays trapped inside the lightbox dialog
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      const insideDialog = await page.evaluate(() => {
        const doc = (globalThis as any).document;
        const dlg = doc.querySelector('[role="dialog"]');
        return Boolean(dlg && dlg.contains(doc.activeElement));
      });
      assert.equal(insideDialog, true, 'Tab escaped ImageLightbox focus trap');
    }

    // RTL keyboard arrow navigation (ArrowLeft advances in RTL)
    const beforeCounter = await dialog.locator('p[aria-live="polite"]').innerText();
    if (await dialog.getByRole('button', { name: 'الصورة التالية' }).isVisible()) {
      await page.keyboard.press('ArrowLeft');
      const afterCounter = await dialog.locator('p[aria-live="polite"]').innerText();
      assert.notEqual(afterCounter, beforeCounter, 'ArrowLeft should advance RTL lightbox slide');
    }

    await saveScreenshot(page, 'lightbox-open');

    // Escape closes lightbox, unlocks scroll, and restores focus to zoom button
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    const restoredOverflow = await page.evaluate(() => (globalThis as any).document.body.style.overflow);
    assert.notEqual(restoredOverflow, 'hidden');
    const restoredFocusLabel = await page.evaluate(
      () => (globalThis as any).document.activeElement?.getAttribute('aria-label') || ''
    );
    assert.equal(restoredFocusLabel, 'عرض الصورة بالحجم الكامل');

    // Visit Seller Profile and confirm privacy
    await page.locator('button', { hasText: /عرض ملف المربي|عرض المراح|عرض الملف/ }).first().click();
    await page.waitForSelector('h1');
    assert.equal(await page.locator('a[href^="tel:"], a[href*="wa.me/966"], a[href*="wa.me/05"]').count(), 0);

    assert.deepEqual(diag.pageErrors, []);
    assert.deepEqual(diag.consoleErrors, []);
  } finally {
    await context.close();
  }
});

test('Full E2E Seller -> Admin -> Buyer journeys, upload, moderation, analytics, WebSocket, security, and restart persistence', async () => {
  const sellerContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar-SA' });
  const buyerContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar-SA' });
  const adminContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar-SA' });

  const sellerPage = await sellerContext.newPage();
  const buyerPage = await buyerContext.newPage();
  const adminPage = await adminContext.newPage();

  const sellerDiag = attachDiagnostics(sellerPage);
  const buyerDiag = attachDiagnostics(buyerPage, { allowHttpStatuses: [401, 403] });
  const adminDiag = attachDiagnostics(adminPage);

  // Create isolated temporary upload files (real marketplace JPEG + valid MP4 ftyp header)
  const tmpFilesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-e2e-files-'));
  const sampleImgPath = path.join(tmpFilesDir, 'sheep-sample.jpg');
  const sampleVideoPath = path.join(tmpFilesDir, 'herd-clip.mp4');
  fs.copyFileSync(
    path.resolve(process.cwd(), 'src/assets/images/breed_naimi_sheep_1794608169331.jpg'),
    sampleImgPath
  );
  fs.writeFileSync(sampleVideoPath, buildMinimalMp4Buffer());

  const sellerPhone = '0511223344';
  const buyerPhone = '0522334455';
  const listingTitle = 'جذعان نعيمي E2E تربية فاخرة';
  let createdListingId = '';

  try {
    // 1. SELLER: Register via UI
    await sellerPage.goto(`${srvHandle.baseUrl}/register`, { waitUntil: 'networkidle' });
    await sellerPage.fill('#auth-name', 'مراح السديري للاختبار');
    await sellerPage.fill('#auth-phone', sellerPhone);
    await sellerPage.fill('#auth-password', STRONG_PASSWORD);
    await sellerPage.locator('label[for="role-seller"]').click();
    await sellerPage.getByRole('button', { name: 'إنشاء الحساب والمتابعة' }).click();
    await sellerPage.waitForSelector('button:has-text("أضف إعلانك")');
    await sellerPage.waitForFunction(() => !(globalThis as any).window.location.pathname.includes('/register'));

    // 2. SELLER: Navigate to AddListingView, upload image & video, save as DRAFT
    await sellerPage.getByRole('banner').getByRole('button', { name: 'أضف إعلانك' }).click();
    await sellerPage.waitForSelector('#add-title');
    await sellerPage.fill('#add-city', 'الرياض — المزاحمية');
    await sellerPage.fill('#add-title', listingTitle);
    await sellerPage.fill('#add-price', '1950');
    await sellerPage.fill('#add-expected-price', '1850');
    await sellerPage.fill('#add-age', '9');
    await sellerPage.fill('#add-weight', '48');
    await sellerPage.fill('#add-qty', '12');
    await sellerPage.fill('#add-desc', 'جذعان نعيمي محصنة دموي ومعوي بصحة ممتازة جاهزة للمعاينة والنقل.');

    // Upload real image and video via file inputs
    const uploadImgRes = sellerPage.waitForResponse(
      (r: any) => r.url().includes('/api/v1/media') && r.request().method() === 'POST'
    );
    await sellerPage.setInputFiles('#add-images-input', sampleImgPath);
    assert.equal((await uploadImgRes).status(), 201);
    await sellerPage.waitForSelector('text=صورة الغلاف');

    const uploadVidRes = sellerPage.waitForResponse(
      (r: any) => r.url().includes('/api/v1/media') && r.request().method() === 'POST'
    );
    await sellerPage.setInputFiles('#add-video-input', sampleVideoPath);
    assert.equal((await uploadVidRes).status(), 201);
    await sellerPage.waitForSelector('button:has-text("إزالة الفيديو")');

    // Save as Draft
    await sellerPage.getByRole('button', { name: 'حفظ كمسودة' }).click();
    await sellerPage
      .locator('tr:visible, article:visible')
      .filter({ hasText: listingTitle })
      .first()
      .waitFor({ state: 'visible' });

    // Confirm Draft is visible in Seller Dashboard, NOT in public directory
    await buyerPage.goto(`${srvHandle.baseUrl}/listings`, { waitUntil: 'networkidle' });
    const publicTextWhileDraft = await buyerPage.evaluate(() => (globalThis as any).document.body.innerText);
    assert.equal(publicTextWhileDraft.includes(listingTitle), false, 'Draft must NOT appear publicly');

    // Edit Draft & Submit for Review -> Pending
    await sellerPage
      .locator('tr:visible, article:visible')
      .filter({ hasText: listingTitle })
      .getByRole('button', { name: /تعديل/ })
      .first()
      .click();
    await sellerPage.waitForSelector('#add-title');
    await sellerPage.fill('#add-title', `${listingTitle} محدث`);
    await sellerPage.getByRole('button', { name: 'حفظ وإعادة الإرسال للمراجعة' }).click();
    await sellerPage.waitForSelector(`h1:has-text("${listingTitle} محدث")`);
    createdListingId = new URL(sellerPage.url()).pathname.split('/').pop() || '';
    assert.ok(createdListingId.startsWith('lst_'), `Expected listing id, got ${createdListingId}`);

    // Verify Seller Analytics tab loads cleanly
    await sellerPage.goto(`${srvHandle.baseUrl}/dashboard`, { waitUntil: 'networkidle' });
    await sellerPage.getByRole('tab', { name: 'تحليلات إعلاناتي' }).click();
    await sellerPage.waitForSelector('text=النسبة من إعلاناتك');
    await saveScreenshot(sellerPage, 'seller-analytics');

    // 3. ADMIN: Sign in, Reject listing with reason -> Seller Resubmits -> Admin Approves & Verifies Seller
    await adminPage.goto(`${srvHandle.baseUrl}/login`, { waitUntil: 'networkidle' });
    await adminPage.fill('#auth-phone', ADMIN_PHONE);
    await adminPage.fill('#auth-password', STRONG_PASSWORD);
    await adminPage.getByRole('button', { name: 'دخول إلى الحساب' }).click();
    await adminPage.waitForFunction(() => !(globalThis as any).window.location.pathname.includes('/login'));

    await adminPage.goto(`${srvHandle.baseUrl}/dashboard/admin`, { waitUntil: 'networkidle' });
    await adminPage.waitForSelector('[aria-label="أقسام لوحة المشرف"]');
    await saveScreenshot(adminPage, 'admin-overview');

    // Go to Listings Moderation tab and Reject first
    await adminPage.getByRole('button', { name: /مراجعة الإعلانات/ }).click();
    const pendingCard = adminPage
      .locator('div')
      .filter({ hasText: `${listingTitle} محدث` })
      .filter({ has: adminPage.getByRole('button', { name: 'رفض', exact: true }) })
      .last();
    await pendingCard.getByRole('button', { name: 'رفض', exact: true }).click();
    const rejectModal = adminPage.getByRole('dialog');
    await rejectModal.waitFor({ state: 'visible' });
    await rejectModal.locator('#reject-listing-reason').fill('يرجى إضافة تفاصيل التحصين والتوصيل بوضوح.');
    await rejectModal.getByRole('button', { name: 'تأكيد الرفض' }).click();
    await rejectModal.waitFor({ state: 'hidden' });

    // Seller sees Rejected status in dashboard (navigating back from analytics tab), edits & resubmits
    await sellerPage.goto(`${srvHandle.baseUrl}/dashboard`, { waitUntil: 'networkidle' });
    await sellerPage
      .locator('tr:visible, article:visible')
      .filter({ hasText: 'يرجى إضافة تفاصيل التحصين والتوصيل بوضوح.' })
      .first()
      .waitFor({ state: 'visible' });
    await sellerPage
      .locator('tr:visible, article:visible')
      .filter({ hasText: `${listingTitle} محدث` })
      .getByRole('button', { name: /تعديل وإعادة إرسال/ })
      .first()
      .click();
    await sellerPage.waitForSelector('#add-desc');
    await sellerPage.fill('#add-desc', 'جذعان نعيمي محصنة بالكامل مع شهادة بيطرية وتوصيل متاح للرياض.');
    await sellerPage.getByRole('button', { name: 'حفظ وإعادة الإرسال للمراجعة' }).click();
    await sellerPage.waitForSelector(`h1:has-text("${listingTitle} محدث")`);

    // Admin approves resubmission
    await adminPage.reload({ waitUntil: 'networkidle' });
    await adminPage.getByRole('button', { name: /مراجعة الإعلانات/ }).click();
    const resubmitCard = adminPage
      .locator('div')
      .filter({ hasText: `${listingTitle} محدث` })
      .filter({ has: adminPage.getByRole('button', { name: 'اعتماد ونشر' }) })
      .last();
    await resubmitCard.getByRole('button', { name: 'اعتماد ونشر' }).click();
    await adminPage.waitForSelector('text=تم اعتماد الإعلان ونشره في السوق');

    // Admin verifies seller
    await adminPage.getByRole('button', { name: /توثيق المربين/ }).click();
    const sellerVerifyCard = adminPage.locator('article').filter({ hasText: 'مراح السديري للاختبار' }).first();
    await sellerVerifyCard.getByRole('button', { name: 'اعتماد التوثيق' }).click();
    await adminPage.waitForSelector('text=تم اعتماد توثيق');

    // Admin checks Audit Logs & Users pagination controls
    await adminPage.getByRole('button', { name: /سجل التدقيق/ }).click();
    await adminPage
      .locator('tr:visible, article:visible')
      .filter({ hasText: 'اعتماد ونشر إعلان' })
      .first()
      .waitFor({ state: 'visible' });
    await adminPage.getByRole('button', { name: /إدارة المستخدمين/ }).click();
    await adminPage.waitForSelector('input[aria-label="البحث عن مستخدم"]');
    await saveScreenshot(adminPage, 'admin-users');

    // 4. BUYER: Register via UI, Like & Favorite, Reveal Contact, Price Offer, Message, Review
    await buyerPage.goto(`${srvHandle.baseUrl}/register`, { waitUntil: 'networkidle' });
    await buyerPage.fill('#auth-name', 'سعود المشتري');
    await buyerPage.fill('#auth-phone', buyerPhone);
    await buyerPage.fill('#auth-password', STRONG_PASSWORD);
    await buyerPage.locator('label[for="role-buyer"]').click();
    await buyerPage.getByRole('button', { name: 'إنشاء الحساب والمتابعة' }).click();
    await buyerPage.waitForFunction(() => !(globalThis as any).window.location.pathname.includes('/register'));

    // Open the newly published listing
    await buyerPage.goto(`${srvHandle.baseUrl}/listing/${createdListingId}`, { waitUntil: 'networkidle' });
    await buyerPage.waitForSelector(`h1:has-text("${listingTitle} محدث")`);

    // Like & Favorite
    await buyerPage.getByRole('button', { name: /إعجاب/ }).first().click();
    await buyerPage.getByRole('button', { name: /^حفظ$/ }).first().click();

    // Reveal seller contact
    await buyerPage.getByRole('button', { name: 'إظهار رقم البائع والتواصل' }).click();
    await buyerPage.waitForSelector(`text=${sellerPhone}`);

    // Submit valid price offer
    await buyerPage.getByRole('button', { name: 'تقديم عرض سعر للمربي (سوم)' }).click();
    const offerModal = buyerPage.getByRole('dialog');
    await offerModal.waitFor({ state: 'visible' });
    await offerModal.locator('#offer-price').fill('1880');
    await offerModal.locator('#offer-note').fill('الشراء نقداً عند المعاينة');
    await offerModal.getByRole('button', { name: /إرسال عرض السعر/ }).click();
    await offerModal.waitFor({ state: 'hidden' });

    // Send direct message
    await buyerPage.locator('#direct-msg').fill('السلام عليكم، متى يناسب موعد المعاينة؟');
    await buyerPage.getByRole('button', { name: 'إرسال رسالة للبائع' }).click();
    await buyerPage.waitForSelector('text=تم إرسال رسالتك بنجاح');

    // Verify seller receives real-time notification via WebSocket (unread bell badge updates)
    await sellerPage.waitForSelector('header button[aria-label*="غير مقروء"]');

    // Submit eligible seller review on Seller Profile
    await buyerPage.locator('button', { hasText: /عرض ملف المربي|عرض المراح|عرض الملف/ }).first().click();
    await buyerPage.waitForSelector('#seller-review-comment');
    await buyerPage.locator('#seller-review-comment').fill('تعامل صادق وسرعة في الرد والمواصفات مطابقة.');
    await buyerPage.getByRole('button', { name: /إرسال التقييم|تحديث تقييمك/ }).click();
    await buyerPage.waitForSelector('text=تعامل صادق وسرعة في الرد والمواصفات مطابقة.');

    // Security regression check from buyer browser session: buyer CANNOT call /api/v1/admin/overview (403)
    const buyerAdminAttempt = await buyerPage.evaluate(async () => {
      const r = await fetch('/api/v1/admin/overview');
      return r.status;
    });
    assert.equal(buyerAdminAttempt, 403);

    // 5. SELLER: Accepts offer & marks listing as Sold
    await sellerPage.goto(`${srvHandle.baseUrl}/listing/${createdListingId}`, { waitUntil: 'networkidle' });
    await sellerPage.getByRole('button', { name: /قبول/ }).first().click();
    await sellerPage.getByRole('button', { name: 'تحديد كمباع' }).click();
    await sellerPage.locator('text=حالة الإعلان: تم البيع').first().waitFor({ state: 'visible' });

    // 6. ADMIN: Suspends buyer -> verify buyer loses API access -> Admin reinstates buyer
    await adminPage.getByRole('button', { name: /إدارة المستخدمين/ }).click();
    await adminPage.fill('input[aria-label="البحث عن مستخدم"]', 'سعود المشتري');
    const buyerRow = adminPage
      .locator('tr:visible, article:visible')
      .filter({ hasText: 'سعود المشتري' })
      .filter({ has: adminPage.getByRole('button', { name: 'إيقاف الحساب' }) })
      .first();
    await buyerRow.waitFor({ state: 'visible' });
    await buyerRow.getByRole('button', { name: 'إيقاف الحساب' }).click();
    const suspendModal = adminPage.getByRole('dialog');
    await suspendModal.waitFor({ state: 'visible' });
    await suspendModal.locator('#suspend-reason-input').fill('اختبار إيقاف أمني مؤقت');
    await suspendModal.getByRole('button', { name: 'تأكيد إيقاف الحساب' }).click();
    await suspendModal.waitFor({ state: 'hidden' });

    // Suspended buyer gets null session on /auth/me immediately
    const suspendedAuthCheck = await buyerPage.evaluate(async () => {
      const me = await fetch('/api/v1/auth/me');
      return me.json();
    });
    assert.equal(suspendedAuthCheck.user, null, 'Suspended user session must be invalidated immediately');

    // Admin reinstates buyer
    const suspendedRow = adminPage
      .locator('tr:visible, article:visible')
      .filter({ hasText: 'سعود المشتري' })
      .filter({ has: adminPage.getByRole('button', { name: 'إعادة التفعيل' }) })
      .first();
    await suspendedRow.waitFor({ state: 'visible' });
    await suspendedRow.getByRole('button', { name: 'إعادة التفعيل' }).click();
    const reactivateModal = adminPage.getByRole('dialog');
    await reactivateModal.waitFor({ state: 'visible' });
    await reactivateModal.getByRole('button', { name: 'تأكيد إعادة التفعيل' }).click();
    await reactivateModal.waitFor({ state: 'hidden' });
    await Promise.all([
      adminPage.waitForLoadState('networkidle'),
      sellerPage.waitForLoadState('networkidle'),
    ]);

    assert.deepEqual(sellerDiag.pageErrors, []);
    assert.deepEqual(sellerDiag.consoleErrors, []);
    assert.deepEqual(buyerDiag.pageErrors, []);
    assert.deepEqual(adminDiag.pageErrors, []);
    assert.deepEqual(adminDiag.consoleErrors, []);

    // Park open tabs on about:blank so live WebSocket reconnects don't race against server.close()
    await Promise.all([
      adminPage.goto('about:blank'),
      buyerPage.goto('about:blank'),
      sellerPage.goto('about:blank'),
    ]);

    // 7. SERVER RESTART PERSISTENCE: Restart server on same dataDir, reload sellerPage, verify session + Sold listing + review survive
    await srvHandle.restart();
    await sellerPage.goto(`${srvHandle.baseUrl}/dashboard`, { waitUntil: 'networkidle' });
    await sellerPage
      .locator('tr:visible, article:visible')
      .filter({ hasText: `${listingTitle} محدث` })
      .filter({ hasText: 'تم البيع' })
      .first()
      .waitFor({ state: 'visible' });
    const sellerStillAuthed = await sellerPage.evaluate(async () => {
      const r = await fetch('/api/v1/auth/me');
      const d: any = await r.json();
      return d.user?.phone || null;
    });
    assert.equal(sellerStillAuthed, sellerPhone, 'Seller session must persist after server restart');

    assert.deepEqual(sellerDiag.pageErrors, []);
    assert.deepEqual(sellerDiag.consoleErrors, []);
  } finally {
    await sellerContext.close();
    await buyerContext.close();
    await adminContext.close();
    fs.rmSync(tmpFilesDir, { recursive: true, force: true });
  }
});

test('Performance measurements (LCP, CLS, transfer sizes, API timings) and >55 listings dashboard scalability', async () => {
  // Seed 58 listings + 35 extra users in the isolated E2E store to benchmark scalability
  const store = srvHandle.server.getStore();
  const baseListing = store.listings[0];
  const baseIso = Date.parse('2026-08-01T10:00:00Z');
  for (let i = 1; i <= 58; i++) {
    const id = `lst_perf_${i}`;
    if (!store.listings.some((l: any) => l.id === id)) {
      store.listings.push({
        ...baseListing,
        id,
        title: `عرض قياس الأداء والتوسع ${i}`,
        status: i % 5 === 0 ? 'Pending' : 'Published',
        priceAmount: 1400 + i * 10,
        createdAt: new Date(baseIso + i * 60_000).toISOString(),
        updatedAt: new Date(baseIso + i * 60_000).toISOString(),
      });
    }
  }
  srvHandle.server.flushStore();

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar-SA' });
  const page = await context.newPage();

  // Install Web Vitals observers before first navigation
  await page.addInitScript(() => {
    const g = globalThis as any;
    g.__perfMetrics = { lcpMs: null, cls: 0 };
    try {
      new g.PerformanceObserver((list: any) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) g.__perfMetrics.lcpMs = Math.round(last.startTime);
      }).observe({ type: 'largest-contentful-paint', buffered: true });

      new g.PerformanceObserver((list: any) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            g.__perfMetrics.cls += entry.value;
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      // Older observer fallback
    }
  });

  try {
    const t0 = Date.now();
    await page.goto(srvHandle.baseUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1');
    const wallHomeLoadMs = Date.now() - t0;

    // Wait two animation frames for LCP/CLS observer flush
    await page.evaluate(
      () =>
        new Promise<void>((r) =>
          (globalThis as any).requestAnimationFrame(() =>
            (globalThis as any).requestAnimationFrame(() => r())
          )
        )
    );

    const metrics = await page.evaluate(() => {
      const g = globalThis as any;
      const perf = g.performance;
      const nav = perf.getEntriesByType('navigation')[0];
      const resources = perf.getEntriesByType('resource') as any[];
      const jsResources = resources.filter((r) => String(r.name).includes('.js'));
      const cssResources = resources.filter((r) => String(r.name).includes('.css'));
      const imgResources = resources.filter((r) => /\.(webp|jpg|jpeg|png)/.test(String(r.name)));
      const jsBytes = jsResources.reduce((acc, r) => acc + (r.transferSize || r.encodedBodySize || 0), 0);
      const cssBytes = cssResources.reduce((acc, r) => acc + (r.transferSize || r.encodedBodySize || 0), 0);
      const imgBytes = imgResources.reduce((acc, r) => acc + (r.transferSize || r.encodedBodySize || 0), 0);

      return {
        domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
        loadEventMs: nav ? Math.round(nav.loadEventEnd) : null,
        lcpMs: g.__perfMetrics?.lcpMs ?? null,
        cls: Number((g.__perfMetrics?.cls ?? 0).toFixed(4)),
        jsCount: jsResources.length,
        jsTransferKB: Math.round((jsBytes / 1024) * 10) / 10,
        cssTransferKB: Math.round((cssBytes / 1024) * 10) / 10,
        imgCount: imgResources.length,
        imgTransferKB: Math.round((imgBytes / 1024) * 10) / 10,
      };
    });

    // Measure live API timings from browser
    const apiTimings = await page.evaluate(async () => {
      const perf = (globalThis as any).performance;
      const out: Record<string, { url: string; status: number; ms: number }> = {};
      const urls: Array<[string, string]> = [
        ['bootstrap', '/api/v1/bootstrap'],
        ['listingsPage1', '/api/v1/listings?status=Published&limit=20&offset=0'],
        ['listingsSearch', '/api/v1/listings?q=%D9%86%D8%B9%D9%8A%D9%85%D9%8A&limit=20&offset=0'],
      ];
      for (const [key, url] of urls) {
        const s = perf.now();
        const res = await fetch(url);
        await res.arrayBuffer();
        out[key] = { url, status: res.status, ms: Math.round((perf.now() - s) * 10) / 10 };
      }
      return out;
    });

    // Login as Admin and verify >55 listings load cleanly + measure admin paginated endpoint latency
    await page.goto(`${srvHandle.baseUrl}/login`, { waitUntil: 'networkidle' });
    await page.fill('#auth-phone', ADMIN_PHONE);
    await page.fill('#auth-password', STRONG_PASSWORD);
    await page.getByRole('button', { name: 'دخول إلى الحساب' }).click();
    await page.waitForFunction(() => !(globalThis as any).window.location.pathname.includes('/login'));

    await page.goto(`${srvHandle.baseUrl}/dashboard/admin`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[aria-label="أقسام لوحة المشرف"]');
    const adminListingsTabText = await page.getByRole('button', { name: /مراجعة الإعلانات/ }).innerText();
    const pendingMatch = adminListingsTabText.match(/\d+/);
    assert.ok(pendingMatch && Number(pendingMatch[0]) >= 10, `Expected >=10 pending listings counted, got ${adminListingsTabText}`);

    const adminUsersTiming = await page.evaluate(async () => {
      const perf = (globalThis as any).performance;
      const s = perf.now();
      const res = await fetch('/api/v1/admin/users?limit=20&offset=0');
      const data: any = await res.json();
      return { status: res.status, ms: Math.round((perf.now() - s) * 10) / 10, totalCount: data.totalCount };
    });

    assert.equal(metrics.cls < 0.1, true, `Expected CLS < 0.1, got ${metrics.cls}`);
    console.log('[E2E Performance Telemetry]', JSON.stringify({ wallHomeLoadMs, metrics, apiTimings, adminUsersTiming }));
  } finally {
    store.listings = store.listings.filter((l: any) => !String(l.id).startsWith('lst_perf_'));
    srvHandle.server.flushStore();
    await context.close();
  }
});

test('AI Assistant widget works on desktop (50px circular launcher & 330x440 dialog) and mobile 320px–430px with Saudi dialect search and clickable cards', async () => {
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'ar-SA',
  });
  const desktopPage = await desktopContext.newPage();
  const desktopDiag = attachDiagnostics(desktopPage);

  try {
    await desktopPage.goto(srvHandle.baseUrl, { waitUntil: 'networkidle' });
    const launcher = desktopPage.locator('[data-testid="ai-assistant-launcher"]');
    await launcher.waitFor({ state: 'visible' });

    const launcherBox = await launcher.boundingBox();
    assert.ok(launcherBox, 'Expected launcher boundingBox on desktop');
    assert.ok(launcherBox.width >= 48 && launcherBox.width <= 54, `Expected ~50px launcher width, got ${launcherBox.width}`);
    assert.ok(launcherBox.height >= 48 && launcherBox.height <= 54, `Expected ~50px launcher height, got ${launcherBox.height}`);
    assert.ok(launcherBox.x < 100, `Expected bottom-left launcher x < 100, got ${launcherBox.x}`);
    const launcherText = (await launcher.innerText()).trim();
    assert.equal(launcherText, '', `Expected icon-only launcher with zero text, got "${launcherText}"`);

    await launcher.click();
    const dialog = desktopPage.locator('[data-testid="ai-assistant-dialog"]');
    await dialog.waitFor({ state: 'visible' });

    const dialogBox = await dialog.boundingBox();
    assert.ok(dialogBox, 'Expected dialog boundingBox on desktop');
    assert.ok(dialogBox.width >= 320 && dialogBox.width <= 340, `Expected ~330px desktop dialog width, got ${dialogBox.width}`);
    assert.ok(dialogBox.height >= 430 && dialogBox.height <= 450, `Expected ~440px desktop dialog height, got ${dialogBox.height}`);
    assert.ok(dialogBox.x < 100, `Expected bottom-left desktop dialog x < 100, got ${dialogBox.x}`);

    // Starter prompt assertions & clicking minimal chip submits real prompt
    await desktopPage.waitForSelector('text=كيف أقدر أخدمك اليوم؟');
    await desktopPage.click('button:has-text("أبي نعيمي بالرياض")');

    const firstCard = desktopPage.locator('[data-testid="ai-listing-cards"] button[data-testid^="ai-listing-card-"]').first();
    await firstCard.waitFor({ state: 'visible' });
    const cardTestId = await firstCard.getAttribute('data-testid');
    assert.ok(cardTestId && cardTestId.startsWith('ai-listing-card-lst_'), `Expected listing card testid, got ${cardTestId}`);
    const targetListingId = cardTestId.replace('ai-listing-card-', '');

    // Reset chat returns cleanly to starter state, then keyboard Enter submits manual query
    await desktopPage.click('button[aria-label="إعادة بدء المحادثة"]');
    await desktopPage.waitForSelector('text=كيف أقدر أخدمك اليوم؟');

    await desktopPage.fill('[data-testid="ai-assistant-input"]', 'أبي جذعان نعيمي بالرياض تحت 2000');
    await desktopPage.press('[data-testid="ai-assistant-input"]', 'Enter');
    await desktopPage.locator(`[data-testid="ai-listing-card-${targetListingId}"]`).first().waitFor({ state: 'visible' });

    await desktopPage.locator(`[data-testid="ai-listing-card-${targetListingId}"]`).first().click();
    await desktopPage.waitForFunction(
      (expectedId: string) => (globalThis as any).window.location.pathname.includes(`/listings/${expectedId}`),
      targetListingId
    );
    await desktopPage.waitForSelector('h1');

    assert.deepEqual(desktopDiag.pageErrors, []);
    assert.deepEqual(desktopDiag.consoleErrors, []);
    assert.deepEqual(desktopDiag.failedResponses, []);
  } finally {
    await desktopContext.close();
  }

  for (const width of [320, 360, 375, 390, 430]) {
    const mobileContext = await browser.newContext({
      viewport: { width, height: width === 320 ? 568 : 844 },
      locale: 'ar-SA',
    });
    const mobilePage = await mobileContext.newPage();
    const mobileDiag = attachDiagnostics(mobilePage);

    try {
      await mobilePage.goto(srvHandle.baseUrl, { waitUntil: 'networkidle' });
      const mobileLauncher = mobilePage.locator('[data-testid="ai-assistant-launcher"]');
      await mobileLauncher.waitFor({ state: 'visible' });
      const mobileLauncherBox = await mobileLauncher.boundingBox();
      assert.ok(mobileLauncherBox, `Expected mobile launcher boundingBox at ${width}px`);
      assert.ok(mobileLauncherBox.width >= 48 && mobileLauncherBox.width <= 54, `Expected ~50px mobile launcher width at ${width}px, got ${mobileLauncherBox.width}`);
      assert.ok(mobileLauncherBox.height >= 48 && mobileLauncherBox.height <= 54, `Expected ~50px mobile launcher height at ${width}px, got ${mobileLauncherBox.height}`);

      // Verify launcher does not overlap MobileBottomNav on mobile viewports
      const navBox = await mobilePage.locator('[data-testid="mobile-bottom-nav"]').boundingBox();
      if (navBox) {
        assert.ok(
          mobileLauncherBox.y + mobileLauncherBox.height <= navBox.y + 1,
          `Expected mobile launcher bottom (${mobileLauncherBox.y + mobileLauncherBox.height}) above MobileBottomNav top (${navBox.y}) at ${width}px`
        );
      }

      await mobileLauncher.click();
      await mobilePage.waitForSelector('[data-testid="ai-assistant-dialog"]');

      const mobileLayout = await inspectViewportLayout(mobilePage);
      assert.equal(mobileLayout.overflowPx, 0, `Mobile ${width}px AI drawer overflowed: ${mobileLayout.overflowPx}px`);

      if (width === 320 || width === 375) {
        await mobilePage.fill('[data-testid="ai-assistant-input"]', 'كم أسعار الحري والنجدي؟');
        await mobilePage.click('[data-testid="ai-assistant-send"]');
        await mobilePage.waitForSelector('text=الحري');
      }

      assert.deepEqual(mobileDiag.pageErrors, []);
      assert.deepEqual(mobileDiag.consoleErrors, []);
      assert.deepEqual(mobileDiag.failedResponses, []);
    } finally {
      await mobileContext.close();
    }
  }
});

