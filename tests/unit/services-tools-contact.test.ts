import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../server';
import {
  calculateFeastEstimate,
  computeSeasonalPriceSeries,
  isValidSaudiMobile,
  normalizeSaudiPhoneDigits,
} from '../../src/lib/marketplace-tools';
import { getRoleAwareNavItems } from '../../src/lib/marketplace-helpers';
import { parseUrlToRoute, routeToUrl, createRoute } from '../../src/lib/router';

test('calculateFeastEstimate calculates exact heads, meat, rice, and spare logic', () => {
  // 40 guests * 550g = 22 kg meat; 50 kg sheep * 0.38 = 19 kg edible -> ceil(22/19)=2 + 1 spare = 3
  const wedding40 = calculateFeastEstimate({
    guests: 40,
    occasion: 'wedding',
    portionGrams: 550,
    animalType: 'sheep',
    weightKg: 50,
    headPriceSar: 1950,
    includeSpare: true,
  });
  assert.equal(wedding40.meatKg, 22);
  assert.equal(wedding40.baseHeads, 2);
  assert.equal(wedding40.spareHeads, 1);
  assert.equal(wedding40.totalHeads, 3);
  assert.equal(wedding40.riceKg, 6);
  assert.equal(wedding40.totalCostSar, 5850);
  assert.equal(wedding40.isLargeFeast, false);

  // Guests < 10 never add a spare head even when includeSpare=true
  const small6 = calculateFeastEstimate({
    guests: 6,
    occasion: 'aqiqa',
    portionGrams: 400,
    animalType: 'goat',
    weightKg: 30,
    headPriceSar: 1450,
    includeSpare: true,
  });
  assert.equal(small6.spareHeads, 0);
  assert.equal(small6.baseHeads, 1);
  assert.equal(small6.totalHeads, 1);

  // Large feast (>1500) flags notice
  const large1600 = calculateFeastEstimate({
    guests: 1600,
    occasion: 'wedding',
    portionGrams: 550,
    animalType: 'sheep',
    weightKg: 60,
    headPriceSar: 2100,
    includeSpare: false,
  });
  assert.equal(large1600.isLargeFeast, true);
  assert.equal(large1600.spareHeads, 0);
});

test('Saudi mobile normalization and seasonal series modeling behave accurately', () => {
  assert.equal(normalizeSaudiPhoneDigits('٠٥٠١٢٣٤٥٦٧'), '0501234567');
  assert.equal(isValidSaudiMobile('0501234567'), true);
  assert.equal(isValidSaudiMobile('٠٥٥٩٨٧٦٥٤٣'), true);
  assert.equal(isValidSaudiMobile('0401234567'), false);
  assert.equal(isValidSaudiMobile('050123'), false);

  const series = computeSeasonalPriceSeries(2000);
  assert.equal(series.length, 12);
  assert.equal(series[5].month, 'يونيو');
  assert.ok(series[5].priceSar > series[9].priceSar);
});

test('Router and role-aware nav handle services, pricing, weights, feast, occasions, how, and contact routes', () => {
  const routes = [
    ['/services', 'services'],
    ['/pricing', 'pricing'],
    ['/weights', 'weights'],
    ['/feast', 'feast'],
    ['/occasions', 'occasions'],
    ['/how', 'how'],
    ['/contact', 'contact'],
  ] as const;

  for (const [pathname, expectedPage] of routes) {
    const parsed = parseUrlToRoute(pathname);
    assert.equal(parsed.page, expectedPage);
    assert.equal(routeToUrl(createRoute({ page: expectedPage })), pathname);
  }

  const nav = getRoleAwareNavItems(null);
  assert.equal(nav.some((item) => item.page === 'services'), true);
  assert.equal(nav.some((item) => item.page === 'pricing'), true);
});

test('API endpoints POST /api/v1/contact, /api/v1/service-requests, and /api/v1/admin/inquiries validate inputs, enforce spam guards, and protect admin inbox', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-inquiries-test-'));
  const srv = await startServer({
    serveFrontend: false,
    config: {
      port: 0,
      dataDir: tempDir,
      storageBackend: 'json',
      demoAccounts: false,
    },
  });

  try {
    const origin = srv.config.allowedOrigins[0] || 'http://localhost:3000';
    const originHeader = {
      Origin: origin,
      'Content-Type': 'application/json',
    };

    // 1. Invalid contact payload rejected with 400
    const badContactRes = await fetch(`http://127.0.0.1:${srv.port}/api/v1/contact`, {
      method: 'POST',
      headers: originHeader,
      body: JSON.stringify({ name: 'أ', email: 'not-an-email', category: 'general', message: 'قصير' }),
    });
    assert.equal(badContactRes.status, 400);

    // 2. Honeypot spam field filled -> rejected with 400
    const honeypotRes = await fetch(`http://127.0.0.1:${srv.port}/api/v1/contact`, {
      method: 'POST',
      headers: originHeader,
      body: JSON.stringify({
        name: 'مرسل سبام',
        email: 'spam@example.com',
        category: 'استفسار عام',
        message: 'رسالة اختبار آلية تحتوي على رابط سبام',
        website: 'https://spam.example.invalid',
      }),
    });
    assert.equal(honeypotRes.status, 400);

    // 3. Valid email-based contact payload with category and region persists with 201 and MSG-* referenceId
    const okContactRes = await fetch(`http://127.0.0.1:${srv.port}/api/v1/contact`, {
      method: 'POST',
      headers: originHeader,
      body: JSON.stringify({
        name: 'خالد السبيعي',
        email: 'khalid@example.sa',
        category: 'استفسار عام',
        region: 'منطقة الرياض',
        message: 'أرغب في معرفة خطوات توثيق المراح ونشر أول إعلان في المنصة.',
      }),
    });
    assert.equal(okContactRes.status, 201);
    const contactJson = (await okContactRes.json()) as {
      ok: boolean;
      referenceId: string;
      preferredReply: string;
    };
    assert.equal(contactJson.ok, true);
    assert.match(contactJson.referenceId, /^MSG-/);
    assert.equal(contactJson.preferredReply, 'email');

    // 4. Duplicate submission within 60s from same sender & message rejected with 429
    const duplicateRes = await fetch(`http://127.0.0.1:${srv.port}/api/v1/contact`, {
      method: 'POST',
      headers: originHeader,
      body: JSON.stringify({
        name: 'خالد السبيعي',
        email: 'khalid@example.sa',
        category: 'استفسار عام',
        region: 'منطقة الرياض',
        message: 'أرغب في معرفة خطوات توثيق المراح ونشر أول إعلان في المنصة.',
      }),
    });
    assert.equal(duplicateRes.status, 429);

    // 5. Legacy contact + preferredReply fallback still works cleanly
    const fallbackContactRes = await fetch(`http://127.0.0.1:${srv.port}/api/v1/contact`, {
      method: 'POST',
      headers: originHeader,
      body: JSON.stringify({
        name: 'سعد الدوسري',
        contact: '0559876543',
        topic: 'توثيق حساب مربي أو تاجر',
        preferredReply: 'telegram',
        message: 'طلب تفعيل التوثيق وربط الحساب بخدمات التوصيل.',
      }),
    });
    assert.equal(fallbackContactRes.status, 201);
    const fallbackJson = (await fallbackContactRes.json()) as {
      ok: boolean;
      preferredReply: string;
    };
    assert.equal(fallbackJson.preferredReply, 'whatsapp');

    // 6. Invalid Saudi mobile on service-requests rejected
    const badSrvRes = await fetch(`http://127.0.0.1:${srv.port}/api/v1/service-requests`, {
      method: 'POST',
      headers: originHeader,
      body: JSON.stringify({
        serviceType: 'نقل المواشي والأغنام',
        region: 'منطقة الرياض',
        phone: '12345',
        details: 'نقل 15 رأس نعيمي من الرياض إلى القصيم',
      }),
    });
    assert.equal(badSrvRes.status, 400);

    // 7. Valid service request persists with SRV-* referenceId
    const okSrvRes = await fetch(`http://127.0.0.1:${srv.port}/api/v1/service-requests`, {
      method: 'POST',
      headers: originHeader,
      body: JSON.stringify({
        serviceType: 'نقل المواشي والأغنام',
        region: 'منطقة القصيم',
        phone: '0551234567',
        name: 'مراح القصيم',
        details: 'نقل 20 رأس نعيمي بسيارة مكيفة ومغطاة صباح الجمعة.',
      }),
    });
    assert.equal(okSrvRes.status, 201);
    const srvJson = (await okSrvRes.json()) as { ok: boolean; referenceId: string };
    assert.equal(srvJson.ok, true);
    assert.match(srvJson.referenceId, /^SRV-/);

    // 8. Admin inquiries queue: 401 unauthenticated, 403 non-admin, 200 admin + status PATCH
    const unauthAdminRes = await fetch(`http://127.0.0.1:${srv.port}/api/v1/admin/inquiries`);
    assert.equal(unauthAdminRes.status, 401);

    const registerAndGetAuth = async (name: string, phone: string) => {
      const regRes = await fetch(`http://127.0.0.1:${srv.port}/api/v1/auth/register`, {
        method: 'POST',
        headers: originHeader,
        body: JSON.stringify({ name, phone, password: 'StrongPass#2026!', role: 'buyer' }),
      });
      assert.equal(regRes.status, 201);
      const cookie = (regRes.headers.get('set-cookie') || '').split(';')[0];
      const body = (await regRes.json()) as { user: { id: string }; csrfToken: string };
      return { cookie, csrfToken: body.csrfToken, userId: body.user.id };
    };

    const buyerAuth = await registerAndGetAuth('مشتري اختبار', '0502223344');
    const buyerForbiddenRes = await fetch(`http://127.0.0.1:${srv.port}/api/v1/admin/inquiries`, {
      headers: { Cookie: buyerAuth.cookie },
    });
    assert.equal(buyerForbiddenRes.status, 403);

    const buyerPatchForbidden = await fetch(
      `http://127.0.0.1:${srv.port}/api/v1/admin/inquiries/${contactJson.referenceId}`,
      {
        method: 'PATCH',
        headers: {
          ...originHeader,
          Cookie: buyerAuth.cookie,
          'x-csrf-token': buyerAuth.csrfToken,
        },
        body: JSON.stringify({ status: 'resolved' }),
      }
    );
    assert.equal(buyerPatchForbidden.status, 403);

    const adminAuth = await registerAndGetAuth('مشرف النظام', '0508889900');
    const storeUser = srv.getStore().users.find((u: any) => u.id === adminAuth.userId);
    assert.ok(storeUser);
    storeUser.role = 'admin';

    const adminListRes = await fetch(`http://127.0.0.1:${srv.port}/api/v1/admin/inquiries`, {
      headers: { Cookie: adminAuth.cookie },
    });
    assert.equal(adminListRes.status, 200);
    const adminListJson = (await adminListRes.json()) as {
      inquiries: Array<{ referenceId: string; status: string; email?: string | null }>;
      summary: { total: number; newCount: number };
    };
    assert.equal(adminListJson.summary.total, 3);
    assert.equal(adminListJson.summary.newCount, 3);

    const patchRes = await fetch(
      `http://127.0.0.1:${srv.port}/api/v1/admin/inquiries/${contactJson.referenceId}`,
      {
        method: 'PATCH',
        headers: {
          ...originHeader,
          Cookie: adminAuth.cookie,
          'x-csrf-token': adminAuth.csrfToken,
        },
        body: JSON.stringify({
          status: 'resolved',
          adminNote: 'تم التواصل مع المرسل وتوضيح خطوات التوثيق',
        }),
      }
    );
    assert.equal(patchRes.status, 200);
    const patchJson = (await patchRes.json()) as {
      ok: boolean;
      inquiry: { status: string; adminNote: string; reviewedByName: string };
    };
    assert.equal(patchJson.ok, true);
    assert.equal(patchJson.inquiry.status, 'resolved');
    assert.equal(patchJson.inquiry.reviewedByName, 'مشرف النظام');

    const saved = JSON.parse(fs.readFileSync(path.join(tempDir, 'inquiries.json'), 'utf8'));
    assert.equal(Array.isArray(saved), true);
    assert.equal(saved.length, 3);
    assert.equal(saved[0].kind, 'contact');
    assert.equal(saved[0].email, 'khalid@example.sa');
    assert.equal(saved[0].status, 'resolved');
    assert.equal(saved[1].kind, 'contact');
    assert.equal(saved[1].preferredReply, 'whatsapp');
    assert.equal(saved[2].kind, 'service_request');
  } finally {
    await srv.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
