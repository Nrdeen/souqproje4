import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { isDashboardTab, parseUrlToRoute, routeToUrl } from '../../src/lib/router';

test('router supports new post-login dashboard tabs: subscription, settings, notifications', () => {
  for (const tab of ['subscription', 'settings', 'notifications'] as const) {
    assert.equal(isDashboardTab(tab), true, `${tab} should be a valid dashboard tab`);
    const route = parseUrlToRoute(`/dashboard/${tab}`);
    assert.equal(route.page, 'dashboard');
    assert.equal(route.dashboardTab, tab);
    assert.equal(routeToUrl(route), `/dashboard/${tab}`);
  }
});

test('i18n defines complete post-login account and notification keys in Arabic and English', () => {
  const i18nSrc = readFileSync(resolve(process.cwd(), 'src/lib/i18n.tsx'), 'utf8');

  assert.match(i18nSrc, /menuProfile:\s*'ملفي الشخصي'/);
  assert.match(i18nSrc, /menuMyListings:\s*'إعلاناتي'/);
  assert.match(i18nSrc, /menuFavorites:\s*'المفضلة'/);
  assert.match(i18nSrc, /menuMessages:\s*'الرسائل'/);
  assert.match(i18nSrc, /menuSubscription:\s*'باقتي واشتراكي'/);
  assert.match(i18nSrc, /menuSettings:\s*'الإعدادات'/);
  assert.match(i18nSrc, /menuNotifications:\s*'الإشعارات'/);
  assert.match(i18nSrc, /memberBadge:\s*'عضو سوق الغنم'/);
  assert.match(i18nSrc, /viewAllNotifications:\s*'عرض كل الإشعارات'/);

  assert.match(i18nSrc, /menuProfile:\s*'My Profile'/);
  assert.match(i18nSrc, /menuMessages:\s*'Messages'/);
  assert.match(i18nSrc, /menuSubscription:\s*'My Subscription'/);
  assert.match(i18nSrc, /menuSettings:\s*'Settings'/);
  assert.match(i18nSrc, /viewAllNotifications:\s*'View all notifications'/);
});

test('Header implements Celebim-inspired post-login action bar, notification popover footer, initials avatar dropdown, and mobile account drawer', () => {
  const headerSrc = readFileSync(resolve(process.cwd(), 'src/components/Header.tsx'), 'utf8');

  // Initials avatar helper & trigger styling
  assert.match(headerSrc, /function getUserInitials/);
  assert.match(headerSrc, /className="souq-login souq-avatar-trigger"/);
  assert.match(headerSrc, /<span>\{t\.myAccount\}<\/span>/);

  // Notification bell footer navigates to full notifications center
  assert.match(headerSrc, /handleNav\('dashboard', \{ dashboardTab: 'notifications' \}\)/);
  assert.match(headerSrc, /\{t\.viewAllNotifications\}/);

  // Account dropdown order matches Celebim screenshot
  const menuIndex = (key: string) => headerSrc.indexOf(`key: '${key}'`);
  const order = [
    menuIndex('profile'),
    menuIndex('my-listings'),
    menuIndex('favorites'),
    menuIndex('messages'),
    menuIndex('subscription'),
    menuIndex('settings'),
  ];
  assert.ok(order.every((idx) => idx !== -1), 'All 6 Celebim menu entries must exist in Header');
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(order[i] > order[i - 1], `Menu entry at index ${i} should follow index ${i - 1}`);
  }

  // Mobile drawer post-login user badge & links
  assert.match(headerSrc, /key=\{`mob-\$\{item\.key\}`\}/);
  assert.match(headerSrc, /\{t\.memberBadge\}/);
});

test('DashboardView implements subscription, settings, and notifications tabs with Google/Facebook linking and logout-all support', () => {
  const dashSrc = readFileSync(resolve(process.cwd(), 'src/components/DashboardView.tsx'), 'utf8');
  const apiSrc = readFileSync(resolve(process.cwd(), 'src/lib/api.ts'), 'utf8');

  assert.match(apiSrc, /logoutAll:\s*\(\)\s*=>\s*apiFetch<\{\s*ok:\s*boolean\s*\}>\('\/api\/v1\/auth\/logout-all'/);
  assert.match(dashSrc, /\{activeTab === 'subscription' && \(/);
  assert.match(dashSrc, /\{activeTab === 'settings' && \(/);
  assert.match(dashSrc, /\{activeTab === 'notifications' && \(/);
  assert.match(dashSrc, /handleSaveAccountSettings/);
  assert.match(dashSrc, /handleStartAuthenticatedFacebookLink/);
  assert.match(dashSrc, /handleLogoutAllDevices/);
  assert.match(dashSrc, /api\.logoutAll\(\)/);
});
