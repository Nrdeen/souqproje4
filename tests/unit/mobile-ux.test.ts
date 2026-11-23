import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('MobileBottomNav provides 5 one-handed actions, unread badge, safe-area padding, and hide-on-detail support', () => {
  const navSrc = readFileSync(
    resolve(process.cwd(), 'src/components/MobileBottomNav.tsx'),
    'utf8'
  );
  const i18nSrc = readFileSync(resolve(process.cwd(), 'src/lib/i18n.tsx'), 'utf8');
  assert.match(navSrc, /data-testid="mobile-bottom-nav"/);
  assert.match(navSrc, /md:hidden fixed bottom-0/);
  assert.match(navSrc, /dir=\{dir\}/);
  assert.match(navSrc, /if \(hidden\) return null;/);
  assert.match(navSrc, /t\.bottomNavHome/);
  assert.match(navSrc, /t\.bottomNavListings/);
  assert.match(navSrc, /t\.bottomNavAdd/);
  assert.match(navSrc, /t\.bottomNavMessages/);
  assert.match(navSrc, /t\.bottomNavAccount/);
  assert.match(i18nSrc, /bottomNavHome:\s*'الرئيسية'/);
  assert.match(i18nSrc, /bottomNavListings:\s*'الإعلانات'/);
  assert.match(i18nSrc, /bottomNavAdd:\s*'أضف إعلان'/);
  assert.match(i18nSrc, /bottomNavMessages:\s*'الرسائل'/);
  assert.match(i18nSrc, /bottomNavAccount:\s*'حسابي'/);
  assert.match(navSrc, /unreadMessagesCount > 0/);
  assert.match(navSrc, /env\(safe-area-inset-bottom\)/);
});

test('App.tsx coordinates MobileBottomNav, detail bottom bar, toast offset, and AI launcher offset without collision', () => {
  const appSrc = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  assert.match(appSrc, /<MobileBottomNav/);
  assert.match(appSrc, /hidden=\{showDetailBottomBar\}/);
  assert.match(appSrc, /offsetForBottomBar=\{showDetailBottomBar \? 'detail' : 'nav'\}/);
  assert.match(appSrc, /totalUnreadMessages/);
  assert.match(appSrc, /pb-\[calc\(4\.6rem\+env\(safe-area-inset-bottom\)\)\] md:pb-0/);

  const aiSrc = readFileSync(
    resolve(process.cwd(), 'src/components/AiAssistantWidget.tsx'),
    'utf8'
  );
  assert.match(aiSrc, /offsetForBottomBar\?: boolean \| 'nav' \| 'detail'/);
  assert.match(aiSrc, /offsetForBottomBar === 'detail'/);
  assert.match(aiSrc, /bottom-\[calc\(4\.85rem\+env\(safe-area-inset-bottom\)\)\]/);
});

test('ListingsDirectory provides native mobile slide-up bottom sheet filters while preserving desktop sticky sidebar', () => {
  const dirSrc = readFileSync(
    resolve(process.cwd(), 'src/components/ListingsDirectory.tsx'),
    'utf8'
  );
  assert.match(dirSrc, /mobile-sheet-enter fixed inset-x-0 bottom-0 z-50/);
  assert.match(dirSrc, /aria-label="إغلاق الفلاتر"/);
  assert.match(dirSrc, /عرض النتائج \(\{totalCount\}\)/);
  assert.match(dirSrc, /مربون موثقون فقط/);
  assert.match(dirSrc, /محصّن بيطرياً/);
  assert.match(dirSrc, /يقبل السوم/);
  assert.match(dirSrc, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(dirSrc, /event\.key === 'Escape'/);
});

test('ListingDetailView supports touch-swipe gallery and mobile pagination dots', () => {
  const detailSrc = readFileSync(
    resolve(process.cwd(), 'src/components/ListingDetailView.tsx'),
    'utf8'
  );
  assert.match(detailSrc, /galleryTouchRef/);
  assert.match(detailSrc, /onTouchStart=/);
  assert.match(detailSrc, /onTouchEnd=/);
  assert.match(detailSrc, /sm:hidden/);
});

test('Seller AddListingView, DashboardView, and AdminDashboardPanel implement mobile ergonomics', () => {
  const addSrc = readFileSync(
    resolve(process.cwd(), 'src/components/AddListingView.tsx'),
    'utf8'
  );
  assert.match(addSrc, /aria-label="تنقل سريع بين خطوات الإعلان"/);
  assert.match(addSrc, /scroll-mt-32 sm:scroll-mt-20/);
  assert.match(addSrc, /inputMode="numeric"/);

  const dashSrc = readFileSync(
    resolve(process.cwd(), 'src/components/DashboardView.tsx'),
    'utf8'
  );
  assert.match(dashSrc, /overflow-x-auto no-scrollbar/);

  const adminSrc = readFileSync(
    resolve(process.cwd(), 'src/components/AdminDashboardPanel.tsx'),
    'utf8'
  );
  assert.match(adminSrc, /overflow-x-auto no-scrollbar/);
});
