import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('Phase 4C Dashboard, Messaging, Analytics, Auth, Forms, Admin, and Seller Profile preserve contracts and upgrade UX', () => {
  const authSrc = readFileSync(resolve(process.cwd(), 'src/components/AuthView.tsx'), 'utf8');
  assert.match(authSrc, /lg:grid-cols-12/);
  assert.match(authSrc, /htmlFor="auth-phone"/);
  assert.match(authSrc, /htmlFor="auth-password"/);
  assert.match(authSrc, /aria-pressed=\{showPassword\}/);
  assert.match(authSrc, /صيغة صحيحة/);
  assert.match(authSrc, /min-h-\[44px\]/);

  const addSrc = readFileSync(resolve(process.cwd(), 'src/components/AddListingView.tsx'), 'utf8');
  assert.match(addSrc, /#step-classification/);
  assert.match(addSrc, /#step-details/);
  assert.match(addSrc, /#step-media/);
  assert.match(addSrc, /computeHerdSummary/);
  assert.match(addSrc, /validateExpectedPriceRule/);
  assert.match(addSrc, /<Modal/);
  assert.match(addSrc, /beforeunload/);
  assert.match(addSrc, /min-w-\[44px\] min-h-\[44px\]/);

  const dashSrc = readFileSync(resolve(process.cwd(), 'src/components/DashboardView.tsx'), 'utf8');
  assert.match(dashSrc, /getListingStatusBadge/);
  assert.match(dashSrc, /notificationsOpen/);
  assert.match(dashSrc, /onMarkAllNotificationsRead/);
  assert.match(dashSrc, /SafeImage/);
  assert.match(dashSrc, /messagesContainerRef/);
  assert.match(dashSrc, /messagesEndRef/);
  assert.match(dashSrc, /mobileThreadOpen/);
  assert.match(dashSrc, /onMarkConversationRead/);
  assert.match(dashSrc, /md:hidden space-y-3/);
  assert.match(dashSrc, /hidden md:block[\s\S]*overflow-x-auto/);
  assert.match(dashSrc, /مراسلة آمنة داخل المنصة/);

  const analyticsSrc = readFileSync(
    resolve(process.cwd(), 'src/components/DashboardAnalytics.tsx'),
    'utf8'
  );
  assert.match(analyticsSrc, /النسبة من إعلاناتك/);
  assert.match(analyticsSrc, /النسبة من السوق/);
  assert.match(analyticsSrc, /buildDailyAnalyticsSeries/);
  assert.match(analyticsSrc, /rounded-xl border border-\[var\(--color-border\)\] bg-\[var\(--color-cream\)\]\/20/);

  const adminSrc = readFileSync(
    resolve(process.cwd(), 'src/components/AdminDashboardPanel.tsx'),
    'utf8'
  );
  assert.match(adminSrc, /Mobile Users Cards/);
  assert.match(adminSrc, /Mobile Sub-Categories Cards/);
  assert.match(adminSrc, /Mobile Audit Cards/);
  assert.match(adminSrc, /min-h-\[44px\]/);

  const sellerSrc = readFileSync(
    resolve(process.cwd(), 'src/components/SellerProfileView.tsx'),
    'utf8'
  );
  assert.match(sellerSrc, /categories\?: Category\[\]/);
  assert.match(sellerSrc, /VerifiedSellerBadge/);
  assert.match(sellerSrc, /min-w-\[44px\] min-h-\[44px\]/);

  const appSrc = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  assert.match(appSrc, /<SellerProfileView[\s\S]*categories=\{bootstrap\.categories\}/);
  assert.match(appSrc, /<DashboardView[\s\S]*notifications=\{notifications\}/);
  assert.match(appSrc, /onOpenNotification=\{handleOpenNotification\}/);
  assert.match(appSrc, /onMarkAllNotificationsRead=\{handleMarkAllNotificationsRead\}/);
});
