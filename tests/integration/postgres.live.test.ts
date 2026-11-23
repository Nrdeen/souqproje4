import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { WebSocket } from 'ws';
import { executeMigration, prepareMigrationSnapshot } from '../../scripts/migrate-json-to-pg';
import {
  prepareReferenceCatalogSnapshot,
  seedReferenceCatalog,
} from '../../scripts/seed-reference-catalog';
import { verifyPostgresAgainstSnapshot } from '../../scripts/verify-pg-migration';
import { startServer } from '../../server';
import { hashPassword } from '../../server/auth/password';
import { hashToken } from '../../server/auth/sessions';
import { createDb, createPgPool } from '../../server/db/client';
import { createSeedData, hydrateStore } from '../../server/domain/marketplace';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const ORIGIN = 'http://souq.test';

const EXPECTED_TABLES = [
  'articles',
  'audit_logs',
  'breeds',
  'categories',
  'conversation_read_states',
  'conversations',
  'faqs',
  'google_identities',
  'indicative_prices',
  'like_notification_cooldowns',
  'listing_comments',
  'listing_favorites',
  'listing_images',
  'listing_likes',
  'listing_videos',
  'listings',
  'media_assets',
  'messages',
  'notifications',
  'price_offers',
  'regions',
  'reports',
  'seller_profiles',
  'seller_reviews',
  'sessions',
  'user_credentials',
  'users',
].sort();

const DRIZZLE_DIR = path.resolve(process.cwd(), 'drizzle');

interface HttpResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  json: any;
  buffer: Buffer;
}

function requestHttp(
  port: number,
  method: string,
  urlPath: string,
  opts: {
    cookie?: string;
    csrf?: string;
    origin?: string | null;
    headers?: Record<string, string>;
    rawBody?: Buffer;
    body?: unknown;
  } = {}
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const payload =
      opts.rawBody !== undefined
        ? opts.rawBody
        : opts.body !== undefined
        ? Buffer.from(JSON.stringify(opts.body), 'utf-8')
        : undefined;
    const headers: Record<string, string> = { ...(opts.headers || {}) };
    if (payload !== undefined) {
      if (opts.rawBody === undefined && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      headers['Content-Length'] = String(payload.length);
    }
    if (opts.cookie) headers['Cookie'] = opts.cookie;
    if (opts.csrf) headers['X-CSRF-Token'] = opts.csrf;
    if (opts.origin !== null) headers['Origin'] = opts.origin ?? ORIGIN;

    const req = http.request(
      { host: '127.0.0.1', port, path: urlPath, method, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          let json: any = null;
          if (String(res.headers['content-type'] || '').includes('application/json')) {
            try {
              json = JSON.parse(buffer.toString('utf-8'));
            } catch {
              json = null;
            }
          }
          resolve({ status: res.statusCode || 0, headers: res.headers, json, buffer });
        });
      }
    );
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

function extractCookie(res: HttpResult): string {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] || [])[0] || '';
  return raw.split(';')[0];
}

function buildMultipartUpload(kind: 'image' | 'video', filename: string, contentType: string, bytes: Buffer) {
  const boundary = `----PgLiveBoundary${Math.random().toString(16).slice(2)}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\n${kind}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
      'utf-8'
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8'),
  ]);
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body,
  };
}

function connectWs(port: number, cookie: string): Promise<{ ws: WebSocket; messages: any[] }> {
  return new Promise((resolve, reject) => {
    const messages: any[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { Origin: ORIGIN, Cookie: cookie },
    });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('Timed out waiting for WebSocket notifications:init'));
    }, 5000);
    ws.on('message', (data) => {
      const parsed = JSON.parse(String(data));
      messages.push(parsed);
      if (parsed.type === 'notifications:init') {
        clearTimeout(timer);
        resolve({ ws, messages });
      }
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function waitForWsEvent(
  messages: any[],
  predicate: (m: any) => boolean,
  timeoutMs = 4000
): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = messages.find(predicate);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`Timed out waiting for WebSocket event; received=${JSON.stringify(messages)}`);
}

test(
  'Phase 6B.1 Live PostgreSQL schema, pg_trgm, constraints, and migration verification',
  {
    skip: !TEST_DATABASE_URL
      ? 'Live PostgreSQL server not configured (set TEST_DATABASE_URL or DATABASE_URL to execute live DB verification)'
      : false,
  },
  async () => {
    const pool = createPgPool({
      connectionString: TEST_DATABASE_URL,
      port: 5432,
      sslMode: 'disable',
      poolMax: 5,
      connectionTimeoutMs: 5000,
    });

    try {
      const db = createDb(pool);
      await migrate(db, { migrationsFolder: DRIZZLE_DIR });

      // 1. Verify PostgreSQL version >= 15 and pg_trgm extension active
      const verRes = await db.execute<{ num: string }>(
        sql`SELECT current_setting('server_version_num') AS num`
      );
      assert.ok(Number(verRes.rows[0]?.num || 0) >= 150000);

      const extRes = await db.execute<{ extname: string }>(
        sql`SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`
      );
      assert.equal(extRes.rows.length, 1);

      // 2. Verify all 26 tables, GIN trigram indexes, FKs, and CHECK constraints
      const tablesRes = await db.execute<{ tablename: string }>(
        sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
      );
      assert.deepEqual(
        tablesRes.rows.map((r) => r.tablename),
        EXPECTED_TABLES
      );

      const idxRes = await db.execute<{ indexname: string; indexdef: string }>(
        sql`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`
      );
      const indexNames = new Set(idxRes.rows.map((r) => r.indexname));
      for (const expectedIdx of [
        'listings_search_doc_trgm_idx',
        'listings_city_norm_trgm_idx',
        'media_assets_one_video_per_listing_uidx',
        'reports_unique_open_listing_uidx',
        'reports_unique_open_comment_uidx',
      ]) {
        assert.ok(indexNames.has(expectedIdx), `Missing expected index ${expectedIdx}`);
      }

      const trigramIdx = idxRes.rows.find((r) => r.indexname === 'listings_search_doc_trgm_idx');
      assert.ok(trigramIdx?.indexdef.includes('gin') && trigramIdx.indexdef.includes('gin_trgm_ops'));

      const fkCountRes = await db.execute<{ cnt: string }>(
        sql`SELECT count(*)::text AS cnt FROM pg_constraint con JOIN pg_namespace nsp ON nsp.oid = con.connamespace WHERE nsp.nspname = 'public' AND con.contype = 'f'`
      );
      const chkCountRes = await db.execute<{ cnt: string }>(
        sql`SELECT count(*)::text AS cnt FROM pg_constraint con JOIN pg_namespace nsp ON nsp.oid = con.connamespace WHERE nsp.nspname = 'public' AND con.contype = 'c'`
      );
      assert.ok(Number(fkCountRes.rows[0]?.cnt || 0) >= 45);
      assert.ok(Number(chkCountRes.rows[0]?.cnt || 0) >= 30);

      // 3. Build rich synthetic store covering all entities (credentials, sessions, media image/video, read states, cooldowns, likes, comments, offers, reviews, reports, audit logs)
      const seed = hydrateStore(createSeedData());
      const now = Date.now();
      const adminHash = await hashPassword('AdminLivePg#2026');
      const sellerHash = await hashPassword('SellerLivePg#2026');
      const buyerHash = await hashPassword('BuyerLivePg#2026');

      seed.credentials = [
        { userId: 'usr_admin_1', passwordHash: adminHash, updatedAt: new Date(now).toISOString() },
        { userId: 'usr_seller_1', passwordHash: sellerHash, updatedAt: new Date(now).toISOString() },
        { userId: 'usr_buyer_1', passwordHash: buyerHash, updatedAt: new Date(now).toISOString() },
      ];
      seed.sessions = [
        {
          id: hashToken('migrated-session-token-pg-verification-0123456789'),
          userId: 'usr_buyer_1',
          createdAt: now - 10_000,
          lastSeenAt: now - 1_000,
          expiresAt: now + 3_600_000,
          ip: '127.0.0.1',
          userAgent: 'MigrationTest/1.0',
        },
      ];
      seed.media = [
        {
          id: 'med_mig_img',
          filename: 'mig-img.png',
          url: '/api/v1/media/med_mig_img',
          kind: 'image',
          mimeType: 'image/png',
          sizeBytes: 1234,
          originalName: 'mig.png',
          uploaderId: 'usr_seller_1',
          listingId: 'lst_101',
          createdAt: new Date(now - 50_000).toISOString(),
        },
        {
          id: 'med_mig_vid',
          filename: 'mig-vid.mp4',
          url: '/api/v1/media/med_mig_vid',
          kind: 'video',
          mimeType: 'video/mp4',
          sizeBytes: 54321,
          originalName: 'mig.mp4',
          uploaderId: 'usr_seller_1',
          listingId: 'lst_101',
          createdAt: new Date(now - 45_000).toISOString(),
        },
      ];
      const lst101 = seed.listings.find((l) => l.id === 'lst_101')!;
      lst101.images.push({
        id: 'img_mig_1',
        url: '/api/v1/media/med_mig_img',
        position: lst101.images.length + 1,
        mediaId: 'med_mig_img',
      });
      lst101.video = {
        id: 'vid_mig_1',
        url: '/api/v1/media/med_mig_vid',
        mimeType: 'video/mp4',
        sizeBytes: 54321,
        mediaId: 'med_mig_vid',
        originalName: 'mig.mp4',
      };
      if (seed.conversations[0]) {
        seed.conversations[0].readAtByUserId = { usr_buyer_1: new Date(now - 2_000).toISOString() };
      }
      seed.likeNotificationHistory = { 'lst_101:usr_buyer_1': new Date(now - 5_000).toISOString() };
      seed.reports.push({
        id: 'rep_mig_1',
        targetType: 'listing',
        reporterId: 'usr_buyer_1',
        listingId: 'lst_102',
        commentId: null,
        reason: 'تأكد من السعر',
        details: 'مراجعة بيانات الهجرة',
        status: 'open',
        createdAt: new Date(now - 10_000).toISOString(),
        resolvedAt: null,
        resolutionNote: null,
      });
      seed.auditLogs.push({
        id: 'aud_mig_1',
        actorId: 'usr_admin_1',
        actorName: 'إدارة المنصة',
        action: 'توثيق حساب مربي',
        targetType: 'seller',
        targetId: 'usr_seller_1',
        note: 'سجل تدقيق مرحل',
        createdAt: new Date(now - 10_000).toISOString(),
      });

      const snapshot = prepareMigrationSnapshot(seed);
      assert.equal(snapshot.warnings.length, 0, JSON.stringify(snapshot.warnings));

      // Truncate outside dry-run so we can verify dry-run transaction rolls back to exact zero rows
      await db.execute(
        sql`TRUNCATE TABLE audit_logs, users, categories, regions, articles, faqs CASCADE`
      );
      await executeMigration(db, snapshot, { dryRun: true, truncate: false });
      const afterDryRun = await db.execute<{ cnt: string }>(
        sql`SELECT count(*)::text AS cnt FROM listings`
      );
      assert.equal(Number(afterDryRun.rows[0]?.cnt || 0), 0);

      // Live migration + parity check across all 26 tables
      const liveMig = await executeMigration(db, snapshot, { dryRun: false, truncate: true });
      assert.equal(liveMig.committed, true);
      const report = await verifyPostgresAgainstSnapshot(db, snapshot);
      assert.equal(report.ok, true, JSON.stringify(report.checks));

      // Non-empty DB guard without --truncate refuses cleanly
      await assert.rejects(
        () => executeMigration(db, snapshot, { dryRun: false, truncate: false }),
        /Refusing to overwrite without --truncate/
      );

      // Verify SQL CHECK constraints actively reject malformed data
      await assert.rejects(
        () =>
          db.execute(
            sql`INSERT INTO users (id, phone, email, name, role, status) VALUES ('usr_bad_chk', '0400000000', 'bad@example.com', 'Bad', 'buyer', 'active')`
          ),
        (err: any) => (err?.code || err?.cause?.code) === '23514'
      );
      await assert.rejects(
        () =>
          db.execute(
            sql`INSERT INTO listings (id, seller_id, category_id, breed_id, region_id, city, city_norm, title, slug, description, search_doc, price_amount, expected_price, sex, age_months, weight_kg, quantity, status)
                VALUES ('lst_bad_chk', 'usr_seller_1', 'cat_sheep', 'brd_naimi', 'reg_riyadh', 'الرياض', 'الرياض', 'اختبار قيد', 'lst-bad-chk', '', 'اختبار', 1000, 1500, 'ذكر', 6, 40, 1, 'Pending')`
          ),
        (err: any) => (err?.code || err?.cause?.code) === '23514'
      );
    } finally {
      await pool.end().catch(() => {});
    }
  }
);

test(
  'Phase 6B.1 Live Express + WebSocket + PostgreSQL operations: Auth, Argon2id, Sessions, Media, Moderation, Likes, Chat, Offers, Comments, Reviews, Reports, Admin, Concurrency, Rollback & JSON Parity',
  {
    skip: !TEST_DATABASE_URL
      ? 'Live PostgreSQL server not configured (set TEST_DATABASE_URL or DATABASE_URL to execute live DB verification)'
      : false,
  },
  async () => {
    const tmpPgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-pg-ops-'));
    const tmpJsonDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-json-parity-'));
    const pool = createPgPool({
      connectionString: TEST_DATABASE_URL,
      port: 5432,
      sslMode: 'disable',
      poolMax: 8,
      connectionTimeoutMs: 5000,
    });

    const seed = hydrateStore(createSeedData());
    const adminPassword = 'AdminLiveOp#2026';
    const adminHash = await hashPassword(adminPassword);
    // Make usr_admin_1 non-demo for real credential login check while keeping seeded entities intact
    const adminUser = seed.users.find((u) => u.id === 'usr_admin_1')!;
    adminUser.isDemo = false;
    seed.credentials.push({
      userId: 'usr_admin_1',
      passwordHash: adminHash,
      updatedAt: new Date().toISOString(),
    });

    const serverEnv = {
      PORT: '0',
      NODE_ENV: 'test',
      DATA_DIR: tmpPgDir,
      ALLOWED_ORIGINS: ORIGIN,
      SESSION_SECRET: 'phase6b1-live-postgres-test-secret-0123456789abcdef',
      DEMO_ACCOUNTS: 'false',
      STORAGE_BACKEND: 'postgres',
      DATABASE_URL: TEST_DATABASE_URL,
    };

    try {
      const db = createDb(pool);
      await migrate(db, { migrationsFolder: DRIZZLE_DIR });
      const snapshot = prepareMigrationSnapshot(seed);
      await executeMigration(db, snapshot, { dryRun: false, truncate: true });

      const srv1 = await startServer({ serveFrontend: false, env: serverEnv });
      let sellerCookie = '';
      let sellerCsrf = '';
      let sellerId = '';
      let buyerCookie = '';
      let buyerCsrf = '';
      let buyerId = '';
      let adminCookie = '';
      let adminCsrf = '';
      let publishedListingId = '';
      let createdOfferId = '';
      let convId = '';
      let commentId = '';
      let replyCommentId = '';

      try {
        // Health check confirms active postgres backend
        const health = await requestHttp(srv1.port, 'GET', '/api/v1/health');
        assert.equal(health.status, 200);
        assert.deepEqual(health.json, { ok: true, backend: 'postgres' });

        // Admin login (Argon2id verification against PostgreSQL)
        const adminLogin = await requestHttp(srv1.port, 'POST', '/api/v1/auth/login', {
          body: { phone: adminUser.phone, password: adminPassword },
        });
        assert.equal(adminLogin.status, 200);
        adminCookie = extractCookie(adminLogin);
        adminCsrf = adminLogin.json.csrfToken;

        // Wrong password returns 401
        const badLogin = await requestHttp(srv1.port, 'POST', '/api/v1/auth/login', {
          body: { phone: adminUser.phone, password: 'WrongPassword#999' },
        });
        assert.equal(badLogin.status, 401);

        // Concurrent duplicate registration check -> 1 succeeds (201), 1 conflicts (409), 0 duplicate rows
        const [regA, regB] = await Promise.all([
          requestHttp(srv1.port, 'POST', '/api/v1/auth/register', {
            body: {
              name: 'سلمان المربي',
              phone: '0558881122',
              password: 'SellerPass#2026',
              role: 'seller',
            },
          }),
          requestHttp(srv1.port, 'POST', '/api/v1/auth/register', {
            body: {
              name: 'سلمان مكرر',
              phone: '0558881122',
              password: 'SellerPass#2026',
              role: 'seller',
            },
          }),
        ]);
        const statuses = [regA.status, regB.status].sort();
        assert.deepEqual(statuses, [201, 409]);
        const winnerSeller = regA.status === 201 ? regA : regB;
        sellerCookie = extractCookie(winnerSeller);
        sellerCsrf = winnerSeller.json.csrfToken;
        sellerId = winnerSeller.json.user.id;

        // Verify password stored as Argon2id hash in PG (never plaintext)
        const credCheck = await db.execute<{ password_hash: string }>(
          sql`SELECT password_hash FROM user_credentials WHERE user_id = ${sellerId}`
        );
        assert.ok(credCheck.rows[0]?.password_hash.startsWith('$argon2id$'));
        assert.equal(credCheck.rows[0]?.password_hash.includes('SellerPass#2026'), false);

        // Register two buyers
        const regBuyer1 = await requestHttp(srv1.port, 'POST', '/api/v1/auth/register', {
          body: {
            name: 'ناصر المشتري',
            phone: '0558883344',
            password: 'BuyerPass#2026',
            role: 'buyer',
          },
        });
        assert.equal(regBuyer1.status, 201);
        buyerCookie = extractCookie(regBuyer1);
        buyerCsrf = regBuyer1.json.csrfToken;
        buyerId = regBuyer1.json.user.id;

        const regBuyer2 = await requestHttp(srv1.port, 'POST', '/api/v1/auth/register', {
          body: {
            name: 'فيصل المشتري',
            phone: '0558885566',
            password: 'BuyerTwoPass#2026',
            role: 'buyer',
          },
        });
        assert.equal(regBuyer2.status, 201);
        const buyer2Cookie = extractCookie(regBuyer2);
        const buyer2Csrf = regBuyer2.json.csrfToken;

        // Connect live WebSockets for seller & buyer
        const sellerWs = await connectWs(srv1.port, sellerCookie);
        const buyerWs = await connectWs(srv1.port, buyerCookie);

        try {
          // Upload valid PNG media to bind to listing
          const pngBytes = Buffer.from(
            '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
            'hex'
          );
          const mp = buildMultipartUpload('image', 'herd.png', 'image/png', pngBytes);
          const upRes = await requestHttp(srv1.port, 'POST', '/api/v1/media/upload', {
            cookie: sellerCookie,
            csrf: sellerCsrf,
            headers: { 'Content-Type': mp.contentType },
            rawBody: mp.body,
          });
          assert.equal(upRes.status, 201);
          const mediaId = upRes.json.media.id as string;

          // Transaction rollback check: invalid listing creation with valid mediaId MUST roll back without partial listing or binding mediaId
          const failCreate = await requestHttp(srv1.port, 'POST', '/api/v1/listings', {
            cookie: sellerCookie,
            csrf: sellerCsrf,
            body: {
              title: 'إعلان اختبار فاشل للتراجع',
              description: 'يجب أن يتراجع المعاملة بالكامل',
              priceAmount: 1800,
              breedId: 'brd_nonexistent_invalid',
              regionId: 'reg_riyadh',
              city: 'الدرعية',
              images: [{ mediaId }],
            },
          });
          assert.equal(failCreate.status, 400);
          const rollbackCheck = await db.execute<{ cnt: string }>(
            sql`SELECT count(*)::text AS cnt FROM listings WHERE title = 'إعلان اختبار فاشل للتراجع'`
          );
          assert.equal(Number(rollbackCheck.rows[0]?.cnt || 0), 0);
          const mediaStillUnbound = await db.execute<{ listing_id: string | null }>(
            sql`SELECT listing_id FROM media_assets WHERE id = ${mediaId}`
          );
          assert.equal(mediaStillUnbound.rows[0]?.listing_id, null);

          // Valid listing creation -> Pending
          const createRes = await requestHttp(srv1.port, 'POST', '/api/v1/listings', {
            cookie: sellerCookie,
            csrf: sellerCsrf,
            body: {
              title: 'حلال حري فاخر بالدرعية',
              description: 'طليان حري طيبة ومحصنة بالكامل ١٢٣',
              priceAmount: 1850,
              expectedPrice: 1700,
              breedId: 'brd_harri',
              regionId: 'reg_riyadh',
              city: 'الدرعية',
              quantity: 8,
              ageMonths: 7,
              weightKg: 43,
              vaccinated: true,
              isNegotiable: true,
              allowPriceOffers: true,
              images: [{ mediaId }],
            },
          });
          assert.equal(createRes.status, 201);
          publishedListingId = createRes.json.listing.id;
          assert.equal(createRes.json.listing.status, 'Pending');

          // Listing not visible publicly while Pending
          const anonBefore = await requestHttp(
            srv1.port,
            'GET',
            `/api/v1/listings?q=${encodeURIComponent('بالدرعية')}`
          );
          assert.equal(anonBefore.json.listings.length, 0);

          // Seller verification request + Admin approve
          const verReq = await requestHttp(srv1.port, 'POST', '/api/v1/seller/verification/request', {
            cookie: sellerCookie,
            csrf: sellerCsrf,
          });
          assert.equal(verReq.status, 200);
          const verApprove = await requestHttp(
            srv1.port,
            'POST',
            `/api/v1/admin/sellers/${sellerId}/verification`,
            {
              cookie: adminCookie,
              csrf: adminCsrf,
              body: { status: 'Verified', reason: 'تم التحقق من بيانات المراح' },
            }
          );
          assert.equal(verApprove.status, 200);
          await waitForWsEvent(
            sellerWs.messages,
            (m) => m.type === 'notification:new' && m.notification?.type === 'seller_verified'
          );

          // Admin approves listing -> Published + WS notification
          const appRes = await requestHttp(
            srv1.port,
            'POST',
            `/api/v1/admin/listings/${publishedListingId}/approve`,
            { cookie: adminCookie, csrf: adminCsrf }
          );
          assert.equal(appRes.status, 200);
          assert.equal(appRes.json.listing.status, 'Published');
          await waitForWsEvent(
            sellerWs.messages,
            (m) =>
              m.type === 'notification:new' &&
              m.notification?.type === 'listing_approved' &&
              m.notification?.listingId === publishedListingId
          );

          // Media retrieval & Phase 6C metadata (storage_provider, object_key, sha256_hex, Range) work cleanly
          const mediaFetch = await requestHttp(srv1.port, 'GET', `/api/v1/media/${mediaId}`);
          assert.equal(mediaFetch.status, 200);
          assert.ok(mediaFetch.buffer.equals(pngBytes));

          const mediaRangeFetch = await requestHttp(srv1.port, 'GET', `/api/v1/media/${mediaId}`, {
            headers: { Range: 'bytes=0-15' },
          });
          assert.equal(mediaRangeFetch.status, 206);
          assert.ok(mediaRangeFetch.buffer.equals(pngBytes.subarray(0, 16)));

          const mediaMetaPg = await db.execute<{
            storage_provider: string;
            object_key: string;
            sha256_hex: string | null;
          }>(
            sql`SELECT storage_provider, object_key, sha256_hex FROM media_assets WHERE id = ${mediaId}`
          );
          assert.equal(mediaMetaPg.rows[0]?.storage_provider, 'local');
          assert.match(String(mediaMetaPg.rows[0]?.object_key || ''), /^med_.*\.png$/);
          assert.match(String(mediaMetaPg.rows[0]?.sha256_hex || ''), /^[a-f0-9]{64}$/);

          // Second listing created & rejected by admin
          const createRejRes = await requestHttp(srv1.port, 'POST', '/api/v1/listings', {
            cookie: sellerCookie,
            csrf: sellerCsrf,
            body: {
              title: 'عرض تجريبي للرفض',
              description: 'بيانات غير مكتملة',
              priceAmount: 1400,
              breedId: 'brd_naimi',
              regionId: 'reg_riyadh',
              city: 'الرياض',
            },
          });
          assert.equal(createRejRes.status, 201);
          const rejRes = await requestHttp(
            srv1.port,
            'POST',
            `/api/v1/admin/listings/${createRejRes.json.listing.id}/reject`,
            {
              cookie: adminCookie,
              csrf: adminCsrf,
              body: { reason: 'يرجى إضافة صور حقيقية للقطيع' },
            }
          );
          assert.equal(rejRes.status, 200);
          assert.equal(rejRes.json.listing.status, 'Rejected');

          // Arabic normalized search (no diacritics, ه instead of ة, ASCII 123 instead of ١٢٣) finds published listing
          const arabicSearch = await requestHttp(
            srv1.port,
            'GET',
            `/api/v1/listings?q=${encodeURIComponent('حرى الدرعيه 123')}&verifiedOnly=1`
          );
          assert.equal(arabicSearch.status, 200);
          assert.ok(arabicSearch.json.listings.some((l: any) => l.id === publishedListingId));

          // Favorite toggle
          const favRes = await requestHttp(srv1.port, 'POST', '/api/v1/favorites/toggle', {
            cookie: buyerCookie,
            csrf: buyerCsrf,
            body: { listingId: publishedListingId },
          });
          assert.equal(favRes.status, 200);
          assert.equal(favRes.json.isFavorite, true);

          // Concurrent likes by buyer1 and buyer2 -> exact count parity (2)
          const [like1, like2] = await Promise.all([
            requestHttp(srv1.port, 'PUT', `/api/v1/listings/${publishedListingId}/like`, {
              cookie: buyerCookie,
              csrf: buyerCsrf,
            }),
            requestHttp(srv1.port, 'PUT', `/api/v1/listings/${publishedListingId}/like`, {
              cookie: buyer2Cookie,
              csrf: buyer2Csrf,
            }),
          ]);
          assert.equal(like1.status, 200);
          assert.equal(like2.status, 200);
          const likesState = await requestHttp(srv1.port, 'GET', `/api/v1/listings/${publishedListingId}/likes`);
          assert.equal(likesState.status, 200);
          assert.equal(likesState.json.likesCount, 2);

          // Conversations + messages + WS events + unreadCount + read state
          const startConv = await requestHttp(srv1.port, 'POST', '/api/v1/conversations', {
            cookie: buyerCookie,
            csrf: buyerCsrf,
            body: { listingId: publishedListingId, initialMessage: 'السلام عليكم، هل السعر قابل للتفاوض؟' },
          });
          assert.equal(startConv.status, 200);
          convId = startConv.json.conversation.id;
          await waitForWsEvent(
            sellerWs.messages,
            (m) => m.type === 'conversation:updated' && m.conversation?.id === convId
          );

          const sendMsg = await requestHttp(srv1.port, 'POST', `/api/v1/conversations/${convId}/messages`, {
            cookie: buyerCookie,
            csrf: buyerCsrf,
            body: { body: 'كم الوزن التقريبي للرأس؟' },
          });
          assert.equal(sendMsg.status, 201);

          const sellerBoot = await requestHttp(srv1.port, 'GET', '/api/v1/bootstrap', {
            cookie: sellerCookie,
          });
          assert.equal(
            sellerBoot.json.conversations.find((c: any) => c.id === convId)?.unreadCount,
            2
          );

          const markRead = await requestHttp(srv1.port, 'POST', `/api/v1/conversations/${convId}/read`, {
            cookie: sellerCookie,
            csrf: sellerCsrf,
          });
          assert.equal(markRead.status, 200);
          assert.equal(markRead.json.conversation.unreadCount, 0);

          // Non-binding price offer + seller accept + buyer WS offer:updated
          const createOffer = await requestHttp(srv1.port, 'POST', `/api/v1/listings/${publishedListingId}/offers`, {
            cookie: buyerCookie,
            csrf: buyerCsrf,
            body: { offeredPrice: 1750, quantity: 4, note: 'سوم جاد بالاستلام من الموقع' },
          });
          assert.equal(createOffer.status, 201);
          createdOfferId = createOffer.json.offer.id;

          const respondOffer = await requestHttp(srv1.port, 'POST', `/api/v1/offers/${createdOfferId}/respond`, {
            cookie: sellerCookie,
            csrf: sellerCsrf,
            body: { status: 'accepted' },
          });
          assert.equal(respondOffer.status, 200);
          assert.equal(respondOffer.json.offer.status, 'accepted');
          await waitForWsEvent(
            buyerWs.messages,
            (m) => m.type === 'offer:updated' && m.offer?.id === createdOfferId && m.offer?.status === 'accepted'
          );

          // Seller review (eligible due to conversation/offer) + aggregate rating check
          const revPost = await requestHttp(srv1.port, 'POST', `/api/v1/sellers/${sellerId}/reviews`, {
            cookie: buyerCookie,
            csrf: buyerCsrf,
            body: { rating: 5, comment: 'تعامل راقٍ وحلال مطابق للوصف' },
          });
          assert.equal(revPost.status, 201);
          assert.equal(revPost.json.seller.ratingCount, 1);
          assert.equal(revPost.json.seller.rating, 5);

          // Comments + seller reply + comment edit
          const postCmt = await requestHttp(srv1.port, 'POST', `/api/v1/listings/${publishedListingId}/comments`, {
            cookie: buyerCookie,
            csrf: buyerCsrf,
            body: { body: 'هل يوجد توصيل لمدينة الخرج؟' },
          });
          assert.equal(postCmt.status, 201);
          commentId = postCmt.json.comment.id;

          const postReply = await requestHttp(srv1.port, 'POST', `/api/v1/listings/${publishedListingId}/comments`, {
            cookie: sellerCookie,
            csrf: sellerCsrf,
            body: { body: 'نعم يتوفر توصيل على حساب المشتري.', parentId: commentId },
          });
          assert.equal(postReply.status, 201);
          replyCommentId = postReply.json.comment.id;

          const patchCmt = await requestHttp(srv1.port, 'PATCH', `/api/v1/comments/${commentId}`, {
            cookie: buyerCookie,
            csrf: buyerCsrf,
            body: { body: 'هل يوجد توصيل لمدينة الخرج اليوم؟' },
          });
          assert.equal(patchCmt.status, 200);
          assert.equal(patchCmt.json.comment.isEdited, true);

          // Report creation + duplicate 409 + admin resolve
          const repRes = await requestHttp(srv1.port, 'POST', '/api/v1/reports', {
            cookie: buyer2Cookie,
            csrf: buyer2Csrf,
            body: {
              listingId: publishedListingId,
              commentId: replyCommentId,
              reason: 'مراجعة محتوى تعليق',
              details: 'بلاغ اختباري للتحقق من قاعدة البيانات',
            },
          });
          assert.equal(repRes.status, 201);
          const repId = repRes.json.report.id as string;

          const dupRep = await requestHttp(srv1.port, 'POST', '/api/v1/reports', {
            cookie: buyer2Cookie,
            csrf: buyer2Csrf,
            body: {
              listingId: publishedListingId,
              commentId: replyCommentId,
              reason: 'بلاغ مكرر',
            },
          });
          assert.equal(dupRep.status, 409);

          const resRep = await requestHttp(srv1.port, 'POST', `/api/v1/admin/reports/${repId}/resolve`, {
            cookie: adminCookie,
            csrf: adminCsrf,
            body: { status: 'resolved', note: 'تم التحقق والتعليق نظامي' },
          });
          assert.equal(resRep.status, 200);
          assert.equal(resRep.json.report.status, 'resolved');

          // Admin smart sub-category CRUD + search_doc refresh check
          const subCreate = await requestHttp(srv1.port, 'POST', '/api/v1/admin/categories', {
            cookie: adminCookie,
            csrf: adminCsrf,
            body: {
              name: 'نوادر حرية',
              parentId: 'cat_sheep',
              description: 'فئة اختبار',
              keywords: ['بالدرعية'],
            },
          });
          assert.equal(subCreate.status, 201);
          const subId = subCreate.json.category.id as string;

          const autoCat = await requestHttp(srv1.port, 'POST', '/api/v1/admin/listings/auto-categorize', {
            cookie: adminCookie,
            csrf: adminCsrf,
            body: { listingId: publishedListingId, subCategoryId: subId },
          });
          assert.equal(autoCat.status, 200);

          const subRename = await requestHttp(srv1.port, 'PATCH', `/api/v1/admin/categories/${subId}`, {
            cookie: adminCookie,
            csrf: adminCsrf,
            body: { name: 'فئة حلال مميزة محدثة' },
          });
          assert.equal(subRename.status, 200);

          // Search now matches updated sub-category name in listings.search_doc!
          const subSearch = await requestHttp(
            srv1.port,
            'GET',
            `/api/v1/listings?q=${encodeURIComponent('محدثة بالدرعية')}`
          );
          assert.equal(subSearch.status, 200);
          assert.ok(subSearch.json.listings.some((l: any) => l.id === publishedListingId));

          // Notifications mark read-all
          const readAll = await requestHttp(srv1.port, 'POST', '/api/v1/notifications/read-all', {
            cookie: sellerCookie,
            csrf: sellerCsrf,
          });
          assert.equal(readAll.status, 200);

          // Admin overview & audit logs & reports & readiness + user suspend + session revocation + reactivate
          const readyLive = await requestHttp(srv1.port, 'GET', '/api/v1/ready');
          assert.equal(readyLive.status, 200);
          assert.equal(readyLive.json.ok, true);
          assert.equal(readyLive.json.backend, 'postgres');

          const overviewRes = await requestHttp(srv1.port, 'GET', '/api/v1/admin/overview', {
            cookie: adminCookie,
          });
          assert.equal(overviewRes.status, 200);
          assert.ok(overviewRes.json.overview.users.total >= 4);
          assert.ok(overviewRes.json.overview.sellers.verified >= 1);
          assert.ok(overviewRes.json.overview.listings.published >= 1);
          assert.ok(overviewRes.json.overview.listings.rejected >= 1);
          assert.ok(overviewRes.json.overview.reports.resolved >= 1);
          assert.ok(overviewRes.json.overview.comments.total >= 2);
          assert.ok(overviewRes.json.overview.recentActivity.length >= 1);

          const auditPageRes = await requestHttp(
            srv1.port,
            'GET',
            `/api/v1/admin/audit-logs?targetType=listing&q=${encodeURIComponent(publishedListingId)}&limit=1&offset=0`,
            { cookie: adminCookie }
          );
          assert.equal(auditPageRes.status, 200);
          assert.equal(auditPageRes.json.auditLogs.length, 1);
          assert.ok(auditPageRes.json.totalCount >= 1);

          const reportPageRes = await requestHttp(
            srv1.port,
            'GET',
            '/api/v1/admin/reports?status=resolved&targetType=comment&limit=5&offset=0',
            { cookie: adminCookie }
          );
          assert.equal(reportPageRes.status, 200);
          assert.ok(reportPageRes.json.reports.some((r: any) => r.id === repId));
          assert.ok(reportPageRes.json.totalCount >= 1);

          const suspRes = await requestHttp(srv1.port, 'POST', `/api/v1/admin/users/${buyerId}/suspend`, {
            cookie: adminCookie,
            csrf: adminCsrf,
            body: { reason: 'اختبار تعليق الجلسات' },
          });
          assert.equal(suspRes.status, 200);

          // Suspended buyer's session is immediately revoked in PostgreSQL
          const buyerMeAfterSuspend = await requestHttp(srv1.port, 'GET', '/api/v1/auth/me', {
            cookie: buyerCookie,
          });
          assert.equal(buyerMeAfterSuspend.json.user, null);

          const reactRes = await requestHttp(srv1.port, 'POST', `/api/v1/admin/users/${buyerId}/reactivate`, {
            cookie: adminCookie,
            csrf: adminCsrf,
            body: { reason: 'انتهاء الاختبار' },
          });
          assert.equal(reactRes.status, 200);

          // Material edit by seller on published listing reverts status to Pending
          const matEdit = await requestHttp(srv1.port, 'PATCH', `/api/v1/listings/${publishedListingId}`, {
            cookie: sellerCookie,
            csrf: sellerCsrf,
            body: { priceAmount: 1920 },
          });
          assert.equal(matEdit.status, 200);
          assert.equal(matEdit.json.listing.status, 'Pending');

          // Re-approve so it remains Published for restart persistence test
          const reApprove = await requestHttp(
            srv1.port,
            'POST',
            `/api/v1/admin/listings/${publishedListingId}/approve`,
            { cookie: adminCookie, csrf: adminCsrf }
          );
          assert.equal(reApprove.status, 200);

          // Unbound orphan media cleanup test (upload + backdate created_at -> cleanupOrphanedMedia deletes from DB & disk)
          const mpOrphan = buildMultipartUpload('image', 'orphan.png', 'image/png', pngBytes);
          const upOrphan = await requestHttp(srv1.port, 'POST', '/api/v1/media/upload', {
            cookie: sellerCookie,
            csrf: sellerCsrf,
            headers: { 'Content-Type': mpOrphan.contentType },
            rawBody: mpOrphan.body,
          });
          assert.equal(upOrphan.status, 201);
          const orphanId = upOrphan.json.media.id as string;
          await db.execute(
            sql`UPDATE media_assets SET created_at = NOW() - INTERVAL '48 hours' WHERE id = ${orphanId}`
          );
          const cleaned = await srv1.cleanupOrphanedMedia();
          assert.ok(cleaned.includes(orphanId));
          const orphanGone = await db.execute<{ cnt: string }>(
            sql`SELECT count(*)::text AS cnt FROM media_assets WHERE id = ${orphanId}`
          );
          assert.equal(Number(orphanGone.rows[0]?.cnt || 0), 0);
        } finally {
          sellerWs.ws.terminate();
          buyerWs.ws.terminate();
        }
      } finally {
        await srv1.close();
      }

      // Server restart persistence: existing session cookie & all records survive restart
      const srv2 = await startServer({ serveFrontend: false, env: serverEnv });
      try {
        const meAfterRestart = await requestHttp(srv2.port, 'GET', '/api/v1/auth/me', {
          cookie: sellerCookie,
        });
        assert.equal(meAfterRestart.status, 200);
        assert.equal(meAfterRestart.json.user?.id, sellerId);

        const listingAfterRestart = await requestHttp(
          srv2.port,
          'GET',
          `/api/v1/listings/${publishedListingId}`,
          { cookie: sellerCookie }
        );
        assert.equal(listingAfterRestart.status, 200);
        assert.equal(listingAfterRestart.json.listing.likesCount, 2);

        const sellerBootRestart = await requestHttp(srv2.port, 'GET', '/api/v1/bootstrap', {
          cookie: sellerCookie,
        });
        assert.equal(sellerBootRestart.status, 200);
        assert.ok(
          sellerBootRestart.json.conversations.some(
            (c: any) => c.id === convId && c.messages.length >= 3
          )
        );
        assert.ok(
          sellerBootRestart.json.priceOffers.some(
            (o: any) => o.id === createdOfferId && o.status === 'accepted'
          )
        );

        const reviewsRestart = await requestHttp(
          srv2.port,
          'GET',
          `/api/v1/sellers/${sellerId}/reviews`
        );
        assert.equal(reviewsRestart.status, 200);
        assert.equal(reviewsRestart.json.averageRating, 5);
        assert.equal(reviewsRestart.json.totalCount, 1);

        const commentsRestart = await requestHttp(
          srv2.port,
          'GET',
          `/api/v1/listings/${publishedListingId}/comments`
        );
        assert.equal(commentsRestart.status, 200);
        assert.ok(commentsRestart.json.threads.some((t: any) => t.id === commentId && t.replies.length === 1));

        // Logout-all revokes all sessions for seller
        const logoutAll = await requestHttp(srv2.port, 'POST', '/api/v1/auth/logout-all', {
          cookie: sellerCookie,
          csrf: sellerCsrf,
        });
        assert.equal(logoutAll.status, 200);
        const meAfterLogoutAll = await requestHttp(srv2.port, 'GET', '/api/v1/auth/me', {
          cookie: sellerCookie,
        });
        assert.equal(meAfterLogoutAll.json.user, null);

        // JSON vs PostgreSQL API parity comparison on identical seed dataset queries
        const jsonSrv = await startServer({
          serveFrontend: false,
          env: {
            PORT: '0',
            NODE_ENV: 'test',
            DATA_DIR: tmpJsonDir,
            ALLOWED_ORIGINS: ORIGIN,
            DEMO_ACCOUNTS: 'false',
            STORAGE_BACKEND: 'json',
          },
        });
        try {
          const [pgSearch, jsonSearch] = await Promise.all([
            requestHttp(
              srv2.port,
              'GET',
              `/api/v1/listings?q=${encodeURIComponent('نعيمى المزاحميه')}&sort=price_asc&limit=5`
            ),
            requestHttp(
              jsonSrv.port,
              'GET',
              `/api/v1/listings?q=${encodeURIComponent('نعيمى المزاحميه')}&sort=price_asc&limit=5`
            ),
          ]);
          assert.equal(pgSearch.status, 200);
          assert.equal(jsonSearch.status, 200);
          assert.deepEqual(
            pgSearch.json.listings.map((l: any) => l.id),
            jsonSearch.json.listings.map((l: any) => l.id)
          );

          const [pgBoot, jsonBoot] = await Promise.all([
            requestHttp(srv2.port, 'GET', '/api/v1/bootstrap'),
            requestHttp(jsonSrv.port, 'GET', '/api/v1/bootstrap'),
          ]);
          assert.deepEqual(
            pgBoot.json.regions.map((r: any) => r.id),
            jsonBoot.json.regions.map((r: any) => r.id)
          );
          assert.deepEqual(
            pgBoot.json.breeds.map((b: any) => b.id).sort(),
            jsonBoot.json.breeds.map((b: any) => b.id).sort()
          );
        } finally {
          await jsonSrv.close();
        }
      } finally {
        await srv2.close();
      }
    } finally {
      await pool.end().catch(() => {});
      fs.rmSync(tmpPgDir, { recursive: true, force: true });
      fs.rmSync(tmpJsonDir, { recursive: true, force: true });
    }
  }
);

test(
  'Pre-staging catalog seed populates fresh empty PostgreSQL idempotently without demo accounts/listings and supports seller listing creation',
  { skip: !TEST_DATABASE_URL },
  async () => {
    const tmpPgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-pg-catalog-seed-'));
    const pool = createPgPool({
      connectionString: TEST_DATABASE_URL!,
      port: 5432,
      sslMode: 'disable',
      poolMax: 5,
      connectionTimeoutMs: 5000,
    });
    const db = createDb(pool);

    try {
      await migrate(db, { migrationsFolder: DRIZZLE_DIR });

      // Simulate a completely empty freshly migrated production database
      await db.execute(sql`
        TRUNCATE TABLE
          audit_logs, notifications, reports, seller_reviews, listing_comments,
          price_offers, messages, conversation_read_states, conversations,
          like_notification_cooldowns, listing_likes, listing_favorites,
          listing_videos, listing_images, media_assets, listings,
          seller_profiles, indicative_prices, breeds, categories, regions,
          articles, faqs, sessions, user_credentials, users
        CASCADE
      `);

      const snapshot = prepareReferenceCatalogSnapshot();

      // 1. Dry-run executes cleanly inside transaction and leaves tables empty
      const dryRunResult = await seedReferenceCatalog(db, snapshot, { dryRun: true });
      assert.equal(dryRunResult.committed, false);
      assert.equal(dryRunResult.tables.regions.inserted, snapshot.counts.regions);
      const countAfterDryRun = await db.execute<{ cnt: number }>(
        sql`SELECT count(*)::int AS cnt FROM regions`
      );
      assert.equal(countAfterDryRun.rows[0]?.cnt, 0);

      // 2. First live run populates all 6 reference catalog tables and zero demo/user/listing rows
      const firstRun = await seedReferenceCatalog(db, snapshot, { dryRun: false });
      assert.equal(firstRun.committed, true);
      assert.equal(firstRun.tables.regions.inserted, snapshot.counts.regions);
      assert.equal(firstRun.tables.categories.inserted, snapshot.counts.categories);
      assert.equal(firstRun.tables.breeds.inserted, snapshot.counts.breeds);
      assert.equal(firstRun.tables.indicative_prices.inserted, snapshot.counts.indicative_prices);
      assert.equal(firstRun.tables.articles.inserted, snapshot.counts.articles);
      assert.equal(firstRun.tables.faqs.inserted, snapshot.counts.faqs);

      const nonCatalogCounts = await db.execute<{
        users_cnt: number;
        creds_cnt: number;
        sellers_cnt: number;
        listings_cnt: number;
      }>(sql`
        SELECT
          (SELECT count(*)::int FROM users) AS users_cnt,
          (SELECT count(*)::int FROM user_credentials) AS creds_cnt,
          (SELECT count(*)::int FROM seller_profiles) AS sellers_cnt,
          (SELECT count(*)::int FROM listings) AS listings_cnt
      `);
      assert.equal(nonCatalogCounts.rows[0]?.users_cnt, 0);
      assert.equal(nonCatalogCounts.rows[0]?.creds_cnt, 0);
      assert.equal(nonCatalogCounts.rows[0]?.sellers_cnt, 0);
      assert.equal(nonCatalogCounts.rows[0]?.listings_cnt, 0);

      // 3. Simulate an operator customizing an existing production FAQ record, then run seed a second time
      await db.execute(
        sql`UPDATE faqs SET question = 'سؤال مخصص في الإنتاج' WHERE id = 'faq_1'`
      );
      const secondRun = await seedReferenceCatalog(db, snapshot, { dryRun: false });
      assert.equal(secondRun.committed, true);
      for (const stats of Object.values(secondRun.tables)) {
        assert.equal(stats.inserted, 0, 'Second seed run must not insert duplicates');
        assert.equal(stats.skipped, stats.planned);
      }

      const preservedFaq = await db.execute<{ question: string }>(
        sql`SELECT question FROM faqs WHERE id = 'faq_1'`
      );
      assert.equal(preservedFaq.rows[0]?.question, 'سؤال مخصص في الإنتاج');

      // 4. Boot server against freshly seeded PostgreSQL (no demo accounts), register a seller, and create a listing
      const srv = await startServer({
        serveFrontend: false,
        env: {
          PORT: '0',
          NODE_ENV: 'test',
          DATA_DIR: tmpPgDir,
          ALLOWED_ORIGINS: ORIGIN,
          DEMO_ACCOUNTS: 'false',
          STORAGE_BACKEND: 'postgres',
          DATABASE_URL: TEST_DATABASE_URL!,
          PG_SSL_MODE: 'disable',
        },
      });

      try {
        const boot = await requestHttp(srv.port, 'GET', '/api/v1/bootstrap');
        assert.equal(boot.status, 200);
        assert.equal(boot.json.regions.length, snapshot.counts.regions);
        assert.equal(boot.json.categories.length, snapshot.counts.categories);
        assert.equal(boot.json.breeds.length, snapshot.counts.breeds);
        assert.equal(boot.json.indicativePrices.length, snapshot.counts.indicative_prices);
        assert.equal(boot.json.articles.length, snapshot.counts.articles);
        assert.equal(boot.json.faqs.length, snapshot.counts.faqs);

        const regRes = await requestHttp(srv.port, 'POST', '/api/v1/auth/register', {
          body: {
            name: 'مربي ساحة الإنتاج',
            phone: '0551122334',
            password: 'StrongPassword#2026',
            role: 'seller',
          },
        });
        assert.equal(regRes.status, 201);
        const cookie = extractCookie(regRes);
        const csrf = regRes.json.csrfToken as string;

        const createListingRes = await requestHttp(srv.port, 'POST', '/api/v1/listings', {
          cookie,
          csrf,
          body: {
            title: 'نعيمي بلدي من قاعدة بيانات نظيفة',
            description: 'إعلان اختبار للتحقق من البيانات المرجعية في PostgreSQL',
            categoryId: 'cat_sheep',
            subCategoryId: 'sub_slaughter',
            breedId: 'brd_naimi',
            regionId: 'reg_riyadh',
            city: 'الرياض',
            priceAmount: 1750,
            sex: 'ذكر',
            ageMonths: 8,
            weightKg: 45,
            quantity: 5,
            vaccinated: true,
          },
        });
        assert.equal(createListingRes.status, 201);
        assert.equal(createListingRes.json.listing.regionId, 'reg_riyadh');
        assert.equal(createListingRes.json.listing.breedId, 'brd_naimi');
        assert.equal(createListingRes.json.listing.categoryId, 'cat_sheep');
        assert.equal(createListingRes.json.listing.subCategoryId, 'sub_slaughter');
      } finally {
        await srv.close();
      }
    } finally {
      await pool.end().catch(() => {});
      fs.rmSync(tmpPgDir, { recursive: true, force: true });
    }
  }
);
