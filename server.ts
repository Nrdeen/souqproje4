import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { AdminValidationError } from './server/admin';
import { loadAiConfig } from './server/ai/config';
import { createAiRouter } from './server/ai/routes';
import { AiAssistantService } from './server/ai/service';
import type { AiConfig, AiProvider } from './server/ai/types';
import { GoogleAuthError, type GoogleIdTokenVerifier } from './server/auth/google';
import { createAuthMiddleware } from './server/auth/middleware';
import { hashPassword } from './server/auth/password';
import { RateLimiter } from './server/auth/rateLimit';
import { createAuthRouter } from './server/auth/routes';
import { CommentValidationError } from './server/comments';
import { loadConfig, type AppConfig } from './server/config';
import { createDb, createPgPool, verifyDatabaseStartup } from './server/db/client';
import { makeStorePaths, RepositoryError, type StorePaths } from './server/domain/marketplace';
import { loadEnvForEntryPoint } from './server/env';
import { LikeValidationError, parseLikeAction, type LikeAction } from './server/likes';
import {
  MAX_IMAGE_BYTES,
  MAX_UNBOUND_MEDIA_PER_USER,
  MAX_VIDEO_BYTES,
  MediaUploadError,
  parseUploadRequest,
  storeUploadedMediaWithAdapter,
  toPublicMedia,
} from './server/media';
import {
  createMediaStorageAdapter,
  LocalMediaStorageAdapter,
  parseHttpByteRange,
  resolveAssetObjectRef,
  RoutedMediaStorageAdapter,
} from './server/mediaStorage';
import { createRealtime } from './server/realtime';
import { JsonMarketplaceRepository } from './server/repositories/jsonRepository';
import { PostgresMarketplaceRepository } from './server/repositories/postgresRepository';
import type { MarketplaceRepository } from './server/repositories/types';
import { acquireStoreLock, resolveDataDir } from './server/storage';
import {
  INPUT_LIMITS,
  parsePositiveInteger,
  validateOptionalText,
  validateRequiredText,
  ValidationError,
} from './server/validation';
import { isValidSaudiMobile, normalizeSaudiPhoneDigits } from './src/lib/marketplace-tools';
import { validateAndParseListingQuery } from './src/lib/listing-search';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StartOptions {
  env?: Record<string, string | undefined>;
  config?: Partial<AppConfig>;
  aiConfig?: Partial<AiConfig>;
  aiProvider?: AiProvider;
  verifyGoogleIdToken?: GoogleIdTokenVerifier;
  /** Tests disable the Vite/static layer and only exercise the API. */
  serveFrontend?: boolean;
}

function asyncHandler(
  fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<unknown>
): express.RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Starts one isolated server instance configured cleanly for either JSON (`STORAGE_BACKEND=json`)
 * or PostgreSQL (`STORAGE_BACKEND=postgres`). Never falls back silently from PostgreSQL to JSON.
 */
export async function startServer(opts: StartOptions = {}) {
  const config = loadConfig(opts.env || process.env, opts.config);
  const paths = makeStorePaths(resolveDataDir(config.dataDir));

  let realtime: ReturnType<typeof createRealtime> | null = null;
  const onSessionsRevoked = (ids: string[]) => {
    realtime?.closeSessions(ids);
  };

  let repo: MarketplaceRepository;
  let releaseStorageLock: (() => void) | null = null;
  let pgPool: Pool | null = null;

  if (config.storageBackend === 'postgres') {
    if (!config.postgres) {
      throw new Error(
        'STORAGE_BACKEND=postgres is enabled, but PostgreSQL configuration is missing. Refusing to fall back to JSON.'
      );
    }
    fs.mkdirSync(paths.uploadsDir, { recursive: true });
    pgPool = createPgPool(config.postgres);
    try {
      await verifyDatabaseStartup(pgPool);
      const db = createDb(pgPool);
      repo = new PostgresMarketplaceRepository(pgPool, db, config, onSessionsRevoked);
    } catch (err) {
      await pgPool.end().catch(() => {});
      throw err;
    }
  } else {
    const lock = acquireStoreLock(paths.dataDir, 'server');
    const releaseOnExit = () => lock.release();
    process.once('exit', releaseOnExit);
    releaseStorageLock = () => {
      process.off('exit', releaseOnExit);
      lock.release();
    };
    try {
      repo = new JsonMarketplaceRepository(config, paths, onSessionsRevoked);
    } catch (err) {
      releaseStorageLock();
      throw err;
    }
  }

  try {
    const server = await runServer(opts, config, paths, repo, (rt) => {
      realtime = rt;
    });
    const closeServer = server.close;
    return {
      ...server,
      dataDir: paths.dataDir,
      backend: repo.backend,
      repository: repo,
      close: async () => {
        try {
          await closeServer();
        } finally {
          await repo.close();
          releaseStorageLock?.();
        }
      },
    };
  } catch (err) {
    await repo.close().catch(() => {});
    releaseStorageLock?.();
    throw err;
  }
}

async function runServer(
  opts: StartOptions,
  config: AppConfig,
  paths: StorePaths,
  repo: MarketplaceRepository,
  registerRealtime: (rt: ReturnType<typeof createRealtime>) => void
) {
  const primaryMediaStorage = createMediaStorageAdapter(config.mediaStorage, paths.uploadsDir);
  const localMediaStorage = new LocalMediaStorageAdapter(paths.uploadsDir);
  const mediaStorage = new RoutedMediaStorageAdapter(primaryMediaStorage, localMediaStorage);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  const httpServer = http.createServer(app);
  // Exceed typical reverse-proxy idle keep-alive windows (60s ALB/Nginx) to avoid 502 race conditions.
  httpServer.keepAliveTimeout = 65_000;
  httpServer.headersTimeout = 66_000;
  httpServer.requestTimeout = 120_000;

  let shuttingDown = false;
  if (config.isProd && config.trustProxy === 0) {
    console.warn(
      '[security] TRUST_PROXY=0 in production; set TRUST_PROXY=1 (or exact hop count) behind a reverse proxy so rate limiters and client IPs work accurately.'
    );
  }

  const authDeps = { config, repo };
  const { attachAuth, mutationGuard, requireAuth, requireAdmin, securityHeaders, noStoreApi } =
    createAuthMiddleware(authDeps);

  app.use(securityHeaders);
  app.use('/api', noStoreApi);
  // Small body limit for the unauthenticated auth endpoints; the global limit applies elsewhere.
  app.use('/api/v1/auth', express.json({ limit: '16kb' }));
  app.use(express.json({ limit: INPUT_LIMITS.jsonBodyLimit }));

  // Liveness, health, and readiness probes are registered before session cookie auth
  // so load balancer probes never incur session store lookups or touch cookies.
  app.get('/api/v1/live', (_req, res) => {
    if (shuttingDown) {
      return res.status(503).json({ ok: false, status: 'shutting_down' });
    }
    res.json({ ok: true, status: 'live', uptimeSec: Math.floor(process.uptime()) });
  });

  app.get(
    '/api/v1/health',
    asyncHandler(async (_req, res) => {
      if (shuttingDown) {
        return res.status(503).json({ ok: false, backend: repo.backend });
      }
      const [dbHealthy, mediaHealthy] = await Promise.all([
        repo.healthCheck(),
        mediaStorage.healthCheck(),
      ]);
      if (!dbHealthy || !mediaHealthy) {
        return res.status(503).json({ ok: false, backend: repo.backend });
      }
      res.json({ ok: true, backend: repo.backend });
    })
  );

  app.get(
    '/api/v1/ready',
    asyncHandler(async (_req, res) => {
      if (shuttingDown) {
        return res.status(503).json({
          ok: false,
          status: 'shutting_down',
          backend: repo.backend,
          mediaProvider: primaryMediaStorage.provider,
        });
      }
      const [dbHealthy, mediaHealthy] = await Promise.all([
        repo.healthCheck(),
        mediaStorage.healthCheck(),
      ]);
      const ok = Boolean(dbHealthy && mediaHealthy);
      res.status(ok ? 200 : 503).json({
        ok,
        status: ok ? 'ready' : 'degraded',
        backend: repo.backend,
        mediaProvider: primaryMediaStorage.provider,
        checks: {
          database: dbHealthy,
          mediaStorage: mediaHealthy,
        },
        uptimeSec: Math.floor(process.uptime()),
      });
    })
  );

  const sourceImagesDir = path.resolve(__dirname, 'src/assets/images');
  const distImagesDir = path.resolve(__dirname, 'dist/src/assets/images');
  const resolvedImagesDir = fs.existsSync(sourceImagesDir) ? sourceImagesDir : distImagesDir;
  app.use(
    '/src/assets/images',
    express.static(resolvedImagesDir, {
      maxAge: config.isProd ? '7d' : 0,
      etag: true,
      fallthrough: false,
    }),
    (_err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(404).end();
    }
  );

  // The local Google client authorizes the site origin (http://localhost:3000) as its
  // redirect URI. When the popup returns there with a code or error, hand the request
  // to the existing callback instead of the SPA.
  app.use((req, _res, next) => {
    if (req.method !== 'GET' || req.path !== '/') return next();
    const state = req.query.state;
    const code = req.query.code;
    const oauthError = req.query.error;
    const isOAuthReturn =
      typeof state === 'string' &&
      state.length > 0 &&
      (typeof code === 'string' || typeof oauthError === 'string');
    if (!isOAuthReturn) return next();
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    req.url = `/api/v1/auth/google/callback${query}`;
    next();
  });

  // Every API request: resolve identity from the session cookie, then enforce Origin + CSRF on mutations.
  app.use('/api/v1', attachAuth, mutationGuard);
  app.use(
    '/api/v1/auth',
    createAuthRouter({
      ...authDeps,
      verifyGoogleIdToken: opts.verifyGoogleIdToken,
    })
  );
  // AI assistant routes (protected by Origin + CSRF for authenticated users, plus dedicated rate & daily quotas)
  const aiService = new AiAssistantService({
    repo,
    config: loadAiConfig(opts.env || process.env, opts.aiConfig),
    provider: opts.aiProvider,
  });
  app.use('/api/v1/ai', createAiRouter(aiService));
  // All admin APIs: one gate in front of every /admin route.
  app.use('/api/v1/admin', requireAdmin);

  const mediaUploadLimiter = new RateLimiter({ max: 40, windowMs: 15 * 60_000 });
  const mediaDeleteLimiter = new RateLimiter({ max: 60, windowMs: 15 * 60_000 });
  const commentLimiter = new RateLimiter({ max: 15, windowMs: 10 * 60_000 });
  const likeLimiter = new RateLimiter({ max: 30, windowMs: 5 * 60_000 });
  const contactRevealLimiter = new RateLimiter({ max: 15, windowMs: 15 * 60_000 });
  const listingCreateLimiter = new RateLimiter({ max: 15, windowMs: 15 * 60_000 });
  const listingUpdateLimiter = new RateLimiter({ max: 40, windowMs: 15 * 60_000 });
  const conversationStartLimiter = new RateLimiter({ max: 25, windowMs: 15 * 60_000 });
  const messageLimiter = new RateLimiter({ max: 60, windowMs: 5 * 60_000 });
  const offerLimiter = new RateLimiter({ max: 20, windowMs: 15 * 60_000 });
  const offerRespondLimiter = new RateLimiter({ max: 40, windowMs: 15 * 60_000 });
  const reviewLimiter = new RateLimiter({ max: 10, windowMs: 15 * 60_000 });
  const reportLimiter = new RateLimiter({ max: 10, windowMs: 15 * 60_000 });
  const favoriteLimiter = new RateLimiter({ max: 60, windowMs: 5 * 60_000 });
  const verificationRequestLimiter = new RateLimiter({ max: 5, windowMs: 60 * 60_000 });
  const readReceiptLimiter = new RateLimiter({ max: 120, windowMs: 5 * 60_000 });
  const inquirySubmitLimiter = new RateLimiter({ max: 15, windowMs: 15 * 60_000 });
  const commissionLimiter = new RateLimiter({ max: 25, windowMs: 15 * 60_000 });

  const enforceRateLimit = (
    limiter: RateLimiter,
    key: string,
    res: express.Response,
    message: string
  ): boolean => {
    const state = limiter.consume(key);
    if (!state.allowed) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil(state.retryAfterMs / 1000))));
      res.status(429).json({ error: message, code: 'rate_limited' });
      return false;
    }
    return true;
  };

  const realtime = createRealtime({
    httpServer,
    config,
    validateSession: (token) => repo.validateSession({ token, idleMs: config.sessionIdleMs }),
    isSessionAlive: (sessionId) => repo.isSessionAlive({ sessionId, idleMs: config.sessionIdleMs }),
    findUser: (id) => repo.findUserById(id),
    getNotificationsFor: (userId) => repo.getNotificationsForUser(userId),
  });
  registerRealtime(realtime);
  const emitToUser = realtime.emitToUser;

  const inFlightMediaIds = new Set<string>();
  const mediaHooks = {
    onCandidateMediaIds: (ids: string[]) => {
      for (const id of ids) inFlightMediaIds.add(id);
    },
    onDoneMediaIds: (ids: string[]) => {
      for (const id of ids) inFlightMediaIds.delete(id);
    },
  };

  const runOrphanedMediaCleanup = (nowMs = Date.now()) =>
    repo.cleanupOrphanedMedia(mediaStorage, config.unboundMediaTtlMs, nowMs, inFlightMediaIds);

  // Development only: demo accounts get random one-time passwords (printed once), never a shared default.
  if (config.demoAccounts) {
    const createdDemos = await repo.ensureDemoCredentials(hashPassword);
    for (const demo of createdDemos) {
      console.log(`[demo-account] ${demo.phone} (${demo.role}) one-time password: ${demo.password}`);
    }
  }
  if (config.isProd && !(await repo.hasNonDemoAdminWithCredentials())) {
    console.warn('[security] No admin account with credentials exists. Create one with: npm run user:create-admin');
  }

  await runOrphanedMediaCleanup();

  const sweeper = setInterval(() => {
    void repo.sweepExpiredSessions(config.sessionIdleMs).catch((err) => {
      console.error('[sessions] Failed to sweep expired sessions:', err);
    });
  }, 10 * 60_000);
  sweeper.unref();

  const mediaSweeperIntervalMs = Math.max(
    60_000,
    Math.min(30 * 60_000, Math.floor(config.unboundMediaTtlMs / 2) || 60_000)
  );
  const mediaSweeper = setInterval(() => {
    void runOrphanedMediaCleanup().catch((err) => {
      console.error('[media] Failed to clean up orphaned media:', err);
    });
  }, mediaSweeperIntervalMs);
  mediaSweeper.unref();

  // Bootstrap endpoint: public data for everyone, private data only for the signed-in user.
  app.get(
    '/api/v1/bootstrap',
    asyncHandler(async (req, res) => {
      const me = req.auth?.user ?? null;
      const data = await repo.getBootstrap(me, req.auth?.csrfToken ?? null);
      res.json({
        ...data,
        googleAuth: {
          enabled: Boolean(config.googleClientId),
          clientId: config.googleClientId || null,
          codeFlowEnabled: Boolean(config.googleClientId && config.googleClientSecret),
        },
        facebookAuth: {
          enabled: Boolean(config.facebookAppId && config.facebookAppSecret),
          appId: config.facebookAppId || null,
        },
      });
    })
  );

  // Targeted user activity snapshot so messaging/offers/notifications refreshes do not reset directory pagination.
  app.get(
    '/api/v1/me/activity',
    requireAuth,
    asyncHandler(async (req, res) => {
      const data = await repo.getUserActivity(req.auth!.user);
      res.json(data);
    })
  );

  // Public Contact Inquiry & Partner Service Request Endpoints (Origin/CSRF guarded & rate-limited)
  const inquiriesFilePath = path.join(paths.dataDir, 'inquiries.json');
  const readInquiries = (): Record<string, unknown>[] => {
    if (!fs.existsSync(inquiriesFilePath)) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(inquiriesFilePath, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const writeInquiries = (records: Record<string, unknown>[]) => {
    fs.mkdirSync(paths.dataDir, { recursive: true });
    const tmpPath = `${inquiriesFilePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(records.slice(-500), null, 2), 'utf8');
    fs.renameSync(tmpPath, inquiriesFilePath);
  };
  const appendInquiryRecord = (record: Record<string, unknown>) => {
    const existing = readInquiries();
    existing.push(record);
    writeInquiries(existing);
  };

  app.post(
    '/api/v1/contact',
    asyncHandler(async (req, res) => {
      // Honeypot spam protection: real users never fill hidden website/hp fields
      const honeypot =
        (typeof req.body?.website === 'string' && req.body.website.trim()) ||
        (typeof req.body?.hp === 'string' && req.body.hp.trim()) ||
        '';
      if (honeypot.length > 0) {
        throw new ValidationError(400, 'تعذر إرسال النموذج: تم رصد إدخال غير صالح');
      }

      const rateKey = `contact:${req.auth?.user.id || req.ip || 'anon'}`;
      if (
        !enforceRateLimit(
          inquirySubmitLimiter,
          rateKey,
          res,
          'تجاوزت الحد المسموح لإرسال الرسائل مؤقتاً، حاول بعد قليل'
        )
      ) {
        return;
      }

      const name = validateRequiredText(req.body?.name, {
        label: 'الاسم',
        minLength: 2,
        maxLength: 100,
      });

      const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
      const rawContact = typeof req.body?.contact === 'string' ? req.body.contact.trim() : '';
      let email: string | null = null;
      let contact: string;

      if (rawEmail || !rawContact) {
        const validatedEmail = validateRequiredText(rawEmail, {
          label: 'البريد الإلكتروني',
          minLength: 5,
          maxLength: 150,
        });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(validatedEmail)) {
          throw new ValidationError(400, 'يرجى إدخال بريد إلكتروني صحيح');
        }
        email = validatedEmail.toLowerCase();
        contact = rawContact || email;
      } else {
        contact = validateRequiredText(rawContact, {
          label: 'رقم الجوال أو البريد الإلكتروني',
          minLength: 5,
          maxLength: 150,
        });
        if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact)) {
          email = contact.toLowerCase();
        }
      }

      const rawCategory = validateOptionalText(req.body?.category, {
        label: 'فئة الاستفسار',
        maxLength: 80,
      });
      const rawTopic = validateOptionalText(req.body?.topic, {
        label: 'موضوع الرسالة',
        maxLength: 120,
      });
      const category = rawCategory || rawTopic;
      if (!category || category.length < 2) {
        throw new ValidationError(400, 'يرجى اختيار فئة الاستفسار');
      }
      const topic = rawTopic || category;

      const message = validateRequiredText(req.body?.message, {
        label: 'تفاصيل الرسالة',
        minLength: 8,
        maxLength: 2000,
        allowNewlines: true,
      });
      const region = validateOptionalText(req.body?.region, {
        label: 'المنطقة',
        maxLength: 100,
      });
      const rawPreferredReply = validateOptionalText(req.body?.preferredReply, {
        label: 'طريقة الرد المفضلة',
        maxLength: 40,
      });
      const allowedReplyChannels = new Set(['whatsapp', 'phone', 'email']);
      const preferredReply = allowedReplyChannels.has(rawPreferredReply)
        ? rawPreferredReply
        : email
        ? 'email'
        : 'whatsapp';

      // Duplicate submission guard within 60s from same sender & identical message
      const nowMs = Date.now();
      const recentDuplicate = readInquiries().some((item) => {
        if (item.kind !== 'contact') return false;
        const itemSender = String(item.email || item.contact || '').toLowerCase();
        const currentSender = (email || contact).toLowerCase();
        if (itemSender !== currentSender) return false;
        if (String(item.message || '').trim() !== message) return false;
        const receivedMs = Date.parse(String(item.receivedAt || ''));
        return Number.isFinite(receivedMs) && nowMs - receivedMs < 60_000;
      });
      if (recentDuplicate) {
        return res.status(429).json({
          error: 'تم استلام هذه الرسالة بالفعل قبل قليل، يرجى الانتظار قبل إعادة الإرسال.',
        });
      }

      const referenceId = `MSG-${nowMs.toString(36).toUpperCase()}`;
      const receivedAt = new Date(nowMs).toISOString();
      appendInquiryRecord({
        kind: 'contact',
        referenceId,
        userId: req.auth?.user.id ?? null,
        name,
        email,
        contact,
        category,
        topic,
        region: region || null,
        preferredReply,
        message,
        status: 'new',
        adminNote: null,
        reviewedByName: null,
        reviewedAt: null,
        receivedAt,
      });
      res.status(201).json({ ok: true, referenceId, receivedAt, preferredReply, status: 'new' });
    })
  );

  app.post(
    '/api/v1/service-requests',
    asyncHandler(async (req, res) => {
      const rateKey = `service-req:${req.auth?.user.id || req.ip || 'anon'}`;
      if (
        !enforceRateLimit(
          inquirySubmitLimiter,
          rateKey,
          res,
          'تجاوزت الحد المسموح لإرسال طلبات الخدمات مؤقتاً، حاول بعد قليل'
        )
      ) {
        return;
      }
      const serviceType = validateRequiredText(req.body?.serviceType, {
        label: 'نوع الخدمة',
        minLength: 2,
        maxLength: 120,
      });
      const region = validateRequiredText(req.body?.region, {
        label: 'المنطقة',
        minLength: 2,
        maxLength: 100,
      });
      const rawPhone = validateRequiredText(req.body?.phone, {
        label: 'رقم الجوال',
        minLength: 10,
        maxLength: 20,
      });
      if (!isValidSaudiMobile(rawPhone)) {
        throw new ValidationError(400, 'أدخل رقم جوال سعودي صحيح يبدأ بـ 05 ويتكون من 10 أرقام');
      }
      const phone = normalizeSaudiPhoneDigits(rawPhone);
      const name = validateOptionalText(req.body?.name, {
        label: 'الاسم أو النشاط',
        maxLength: 100,
      });
      const details = validateRequiredText(req.body?.details, {
        label: 'تفاصيل الطلب',
        minLength: 6,
        maxLength: 2000,
        allowNewlines: true,
      });

      const referenceId = `SRV-${Date.now().toString(36).toUpperCase()}`;
      const receivedAt = new Date().toISOString();
      appendInquiryRecord({
        kind: 'service_request',
        referenceId,
        userId: req.auth?.user.id ?? null,
        serviceType,
        region,
        phone,
        name,
        details,
        receivedAt,
      });
      res.status(201).json({ ok: true, referenceId, serviceType, region, receivedAt });
    })
  );

  // Scoped, Paginated Seller Star Ratings & Reviews Endpoints
  app.get(
    '/api/v1/sellers/:sellerId/reviews',
    asyncHandler(async (req, res) => {
      const viewer = req.auth?.user ?? null;
      const sellerId = String(req.params.sellerId || '').trim();
      const limit =
        req.query.limit !== undefined
          ? parsePositiveInteger(req.query.limit, { label: 'عدد النتائج', min: 1, max: 50 })
          : 10;
      const offset =
        req.query.offset !== undefined
          ? parsePositiveInteger(req.query.offset, { label: 'مؤشر البداية', min: 0, max: 100_000 })
          : 0;

      const result = await repo.getSellerReviews(sellerId, viewer, { limit, offset });
      if (!result) {
        return res.status(404).json({ error: 'ملف المربي غير موجود' });
      }
      res.json(result);
    })
  );

  app.post(
    '/api/v1/sellers/:sellerId/reviews',
    requireAuth,
    asyncHandler(async (req, res) => {
      const currentUser = req.auth!.user;
      if (
        !enforceRateLimit(
          reviewLimiter,
          `review:${currentUser.id}`,
          res,
          'تجاوزت الحد المسموح لإرسال التقييمات مؤقتاً، حاول بعد قليل'
        )
      ) {
        return;
      }

      const sellerId = String(req.params.sellerId || '').trim();
      const result = await repo.upsertSellerReview(currentUser, sellerId, req.body);
      res.status(result.created ? 201 : 200).json({
        review: result.review,
        seller: result.seller,
        reviews: result.reviews,
      });
    })
  );

  // Notifications Read Endpoints
  app.post(
    '/api/v1/notifications/:id/read',
    requireAuth,
    asyncHandler(async (req, res) => {
      const currentUser = req.auth!.user;
      if (
        !enforceRateLimit(
          readReceiptLimiter,
          `read:${currentUser.id}`,
          res,
          'تجاوزت الحد المسموح لتحديث حالة الإشعارات مؤقتاً، حاول بعد قليل'
        )
      ) {
        return;
      }
      const updated = await repo.markNotificationRead(currentUser.id, String(req.params.id || ''));
      if (updated) {
        emitToUser(currentUser.id, {
          type: 'notifications:updated',
          notifications: updated,
        });
      }
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/v1/notifications/read-all',
    requireAuth,
    asyncHandler(async (req, res) => {
      const currentUser = req.auth!.user;
      if (
        !enforceRateLimit(
          readReceiptLimiter,
          `read:${currentUser.id}`,
          res,
          'تجاوزت الحد المسموح لتحديث حالة الإشعارات مؤقتاً، حاول بعد قليل'
        )
      ) {
        return;
      }
      const { notifications } = await repo.markAllNotificationsRead(currentUser.id);
      emitToUser(currentUser.id, {
        type: 'notifications:updated',
        notifications,
      });
      res.json({ ok: true });
    })
  );

  // GET /api/v1/listings with validated Arabic search, combined filters, strict authorization, deterministic sorting & pagination
  app.get(
    '/api/v1/listings',
    asyncHandler(async (req, res) => {
      const currentUser = req.auth?.user ?? null;
      const parsedQuery = validateAndParseListingQuery(req.query as Record<string, unknown>);
      if (!parsedQuery.ok) {
        return res.status(400).json({ error: parsedQuery.error, code: parsedQuery.code });
      }
      const result = await repo.queryListings(parsedQuery.value, currentUser);
      res.json(result);
    })
  );

  // GET /api/v1/listings/:id
  app.get(
    '/api/v1/listings/:id',
    asyncHandler(async (req, res) => {
      const viewer = req.auth?.user ?? null;
      const listing = await repo.getListingById(String(req.params.id || ''), viewer);
      if (!listing) {
        return res.status(404).json({ error: 'الإعلان غير موجود' });
      }
      res.json({ listing });
    })
  );

  // POST /api/v1/listings/:id/contact (Rate-limited, authenticated on-demand seller contact reveal)
  app.post(
    '/api/v1/listings/:id/contact',
    requireAuth,
    asyncHandler(async (req, res) => {
      const currentUser = req.auth!.user;
      if (
        !enforceRateLimit(
          contactRevealLimiter,
          `contact:${currentUser.id}`,
          res,
          'تجاوزت الحد المسموح لطلبات إظهار بيانات التواصل مؤقتاً، حاول بعد قليل'
        )
      ) {
        return;
      }
      const contact = await repo.revealListingContact(String(req.params.id || ''), currentUser);
      res.json(contact);
    })
  );

  // Public Listing Likes Endpoints (separate from private Favorites)
  app.get(
    '/api/v1/listings/:id/likes',
    asyncHandler(async (req, res) => {
      const viewer = req.auth?.user ?? null;
      const result = await repo.getListingLikes(String(req.params.id || ''), viewer);
      if (!result) {
        return res.status(404).json({ error: 'الإعلان غير موجود' });
      }
      res.json(result);
    })
  );

  const handleLikeMutation = async (
    req: express.Request,
    res: express.Response,
    forcedAction?: LikeAction
  ) => {
    const currentUser = req.auth!.user;
    let action: LikeAction;
    try {
      action = forcedAction ?? parseLikeAction(req.body?.action);
    } catch (err) {
      if (err instanceof LikeValidationError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      throw err;
    }

    if (
      !enforceRateLimit(
        likeLimiter,
        `like:${currentUser.id}`,
        res,
        'تجاوزت الحد المسموح لتحديث الإعجاب مؤقتاً، حاول بعد قليل'
      )
    ) {
      return;
    }

    const result = await repo.mutateListingLike(currentUser, String(req.params.id || ''), action);
    if (result.sellerNotification) {
      emitToUser(result.sellerNotification.userId, {
        type: 'notification:new',
        notification: result.sellerNotification.notification,
      });
    }
    if (result.changed) {
      realtime.broadcast({
        type: 'listing:likes-updated',
        listingId: result.listingId,
        likesCount: result.likesCount,
      });
    }

    res.json({
      listingId: result.listingId,
      likesCount: result.likesCount,
      isLiked: result.isLiked,
      likedListingIds: result.likedListingIds,
    });
  };

  app.post(
    '/api/v1/listings/:id/like',
    requireAuth,
    asyncHandler((req, res) => handleLikeMutation(req, res))
  );
  app.put(
    '/api/v1/listings/:id/like',
    requireAuth,
    asyncHandler((req, res) => handleLikeMutation(req, res, 'like'))
  );
  app.delete(
    '/api/v1/listings/:id/like',
    requireAuth,
    asyncHandler((req, res) => handleLikeMutation(req, res, 'unlike'))
  );

  // Public Listing Questions & Comments Endpoints
  app.get(
    '/api/v1/listings/:id/comments',
    asyncHandler(async (req, res) => {
      const viewer = req.auth?.user ?? null;
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
      const offset = req.query.offset !== undefined ? Number(req.query.offset) : undefined;
      const result = await repo.getListingComments(String(req.params.id || ''), viewer, {
        limit,
        offset,
      });
      if (!result) {
        return res.status(404).json({ error: 'الإعلان غير موجود' });
      }
      res.json(result);
    })
  );

  app.post(
    '/api/v1/listings/:id/comments',
    requireAuth,
    asyncHandler(async (req, res) => {
      const currentUser = req.auth!.user;
      if (
        !enforceRateLimit(
          commentLimiter,
          `comment:${currentUser.id}`,
          res,
          'تجاوزت الحد المسموح لإرسال التعليقات مؤقتاً، حاول بعد قليل'
        )
      ) {
        return;
      }
      const listingId = String(req.params.id || '');
      const result = await repo.createComment(
        currentUser,
        listingId,
        req.body?.body,
        req.body?.parentId
      );
      if (result.notifyUserId && result.notification) {
        emitToUser(result.notifyUserId, {
          type: 'notification:new',
          notification: result.notification,
        });
        emitToUser(result.notifyUserId, {
          type: 'listing:comments-updated',
          listingId,
        });
      }
      res.status(201).json({ comment: result.comment });
    })
  );

  app.patch(
    '/api/v1/comments/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const currentUser = req.auth!.user;
      if (
        !enforceRateLimit(
          commentLimiter,
          `comment:${currentUser.id}`,
          res,
          'تجاوزت الحد المسموح لتعديل التعليقات مؤقتاً، حاول بعد قليل'
        )
      ) {
        return;
      }
      const commentId = String(req.params.id || '').trim();
      const result = await repo.updateComment(currentUser, commentId, req.body?.body);
      res.json(result);
    })
  );

  app.delete(
    '/api/v1/comments/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const currentUser = req.auth!.user;
      if (
        !enforceRateLimit(
          commentLimiter,
          `comment:${currentUser.id}`,
          res,
          'تجاوزت الحد المسموح لإدارة التعليقات مؤقتاً، حاول بعد قليل'
        )
      ) {
        return;
      }
      const commentId = String(req.params.id || '').trim();
      const result = await repo.deleteComment(currentUser, commentId, req.body?.reason);
      res.json(result);
    })
  );

  // Media Upload / Retrieval / Range Streaming / Deletion Endpoints
  app.post(
    '/api/v1/media/upload',
    requireAuth,
    asyncHandler(async (req, res) => {
      const currentUser = req.auth!.user;
      const rateCheck = mediaUploadLimiter.consume(`upload:${currentUser.id}`);
      if (!rateCheck.allowed) {
        return res.status(429).json({
          error: 'تجاوزت الحد المسموح لرفع الملفات مؤقتاً، حاول بعد قليل',
        });
      }

      const unboundCount = await repo.countUnboundMedia(currentUser.id);
      if (unboundCount >= MAX_UNBOUND_MEDIA_PER_USER) {
        return res.status(429).json({
          error: 'لديك عدد كبير من الملفات المرفوعة غير المرتبطة بإعلانات؛ يرجى إكمال النشر أو حذف بعض الملفات أولاً',
        });
      }

      try {
        const parsed = await parseUploadRequest(req);
        const asset = await storeUploadedMediaWithAdapter({
          adapter: primaryMediaStorage,
          keyPrefix: config.mediaStorage.keyPrefix,
          parsed,
          uploaderId: currentUser.id,
        });
        try {
          await repo.insertMediaAsset(asset);
        } catch (dbErr) {
          await mediaStorage.deleteObject(resolveAssetObjectRef(asset)).catch(() => {});
          throw dbErr;
        }
        res.status(201).json({
          media: toPublicMedia(asset),
          limits: {
            maxImageBytes: MAX_IMAGE_BYTES,
            maxVideoBytes: MAX_VIDEO_BYTES,
          },
        });
      } catch (err) {
        if (err instanceof MediaUploadError) {
          return res.status(err.status).json({ error: err.message, code: err.code });
        }
        console.error('Media upload failed:', err);
        return res.status(500).json({ error: 'تعذر رفع الملف، حاول مرة أخرى' });
      }
    })
  );

  const handleMediaServe = asyncHandler(async (req, res) => {
    const mediaId = String(req.params.id || '').trim();
    const viewer = req.auth?.user ?? null;
    const resolved = await repo.getMediaAssetForViewer(mediaId, viewer);
    if (!resolved) {
      return res.status(404).json({ error: 'الملف غير موجود' });
    }

    const ref = resolveAssetObjectRef(resolved.asset);
    let head;
    try {
      head = await mediaStorage.headObject(ref);
    } catch {
      return res.status(404).json({ error: 'الملف غير موجود' });
    }
    if (!head.exists) {
      return res.status(404).json({ error: 'الملف غير موجود' });
    }

    const totalBytes = head.sizeBytes ?? resolved.asset.sizeBytes;
    const parsedRange = parseHttpByteRange(req.headers.range, totalBytes);
    if (!parsedRange.ok) {
      res.setHeader('Content-Range', `bytes */${totalBytes}`);
      res.setHeader('Accept-Ranges', 'bytes');
      return res.status(416).json({ error: 'نطاق البايتات المطلوب غير صالح' });
    }

    res.setHeader('Content-Type', resolved.asset.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader(
      'Cache-Control',
      resolved.isPublished ? 'private, max-age=300' : 'private, no-store'
    );
    if (resolved.asset.sha256Hex) {
      res.setHeader('ETag', `"${resolved.asset.sha256Hex}"`);
    } else if (head.etag) {
      res.setHeader('ETag', head.etag);
    }

    if (req.method === 'HEAD') {
      if (parsedRange.isPartial) {
        const len = parsedRange.end - parsedRange.start + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${parsedRange.start}-${parsedRange.end}/${totalBytes}`);
        res.setHeader('Content-Length', String(len));
      } else {
        res.status(200);
        res.setHeader('Content-Length', String(totalBytes));
      }
      return res.end();
    }

    const obj = await mediaStorage.getObjectStream(
      ref,
      parsedRange.isPartial ? { start: parsedRange.start, end: parsedRange.end } : undefined
    );
    if (!obj) {
      return res.status(404).json({ error: 'الملف غير موجود' });
    }

    if (obj.isPartial) {
      res.status(206);
      res.setHeader('Content-Range', `bytes ${obj.start}-${obj.end}/${obj.totalBytes}`);
      res.setHeader('Content-Length', String(obj.contentLength));
    } else {
      res.status(200);
      res.setHeader('Content-Length', String(obj.totalBytes));
    }

    const onClose = () => {
      if ('destroy' in obj.stream && typeof (obj.stream as any).destroy === 'function') {
        (obj.stream as any).destroy();
      }
    };
    res.once('close', onClose);
    obj.stream.once('error', (streamErr) => {
      res.removeListener('close', onClose);
      console.error(`[media] Stream failed for ${mediaId}:`, streamErr);
      if (!res.headersSent) {
        res.status(500).json({ error: 'تعذر قراءة الملف المطلوب' });
      } else {
        res.destroy();
      }
    });
    obj.stream.pipe(res);
  });

  app.get('/api/v1/media/:id', handleMediaServe);
  app.head('/api/v1/media/:id', handleMediaServe);

  app.delete(
    '/api/v1/media/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const currentUser = req.auth!.user;
      if (
        !enforceRateLimit(
          mediaDeleteLimiter,
          `media-del:${currentUser.id}`,
          res,
          'تجاوزت الحد المسموح لحذف الوسائط مؤقتاً، حاول بعد قليل'
        )
      ) {
        return;
      }
      const mediaId = String(req.params.id || '').trim();
      await repo.deleteMediaAsset(currentUser, mediaId, mediaStorage);
      res.json({ ok: true });
    })
  );

  // POST /api/v1/listings (Create listing -> Pending moderation)
  app.post(
    '/api/v1/listings',
    requireAuth,
    asyncHandler(async (req, res) => {
      const currentUser = req.auth!.user;
      if (
        !enforceRateLimit(
          listingCreateLimiter,
          `listing-create:${currentUser.id}`,
          res,
          'تجاوزت الحد المسموح لنشر الإعلانات مؤقتاً، حاول بعد قليل'
        )
      ) {
        return;
      }
      const listing = await repo.createListing(currentUser, req.body, mediaHooks);
      res.status(201).json({ listing });
    })
  );

  // PATCH /api/v1/listings/:id (Ownership enforced, cannot bypass Rejected status)
  app.patch(
    '/api/v1/listings/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const currentUser = req.auth!.user;
      if (
        !enforceRateLimit(
          listingUpdateLimiter,
          `listing-update:${currentUser.id}`,
          res,
          'تجاوزت الحد المسموح لتعديل الإعلانات مؤقتاً، حاول بعد قليل'
        )
      ) {
        return;
      }
      const listing = await repo.updateListing(
        currentUser,
        String(req.params.id || ''),
        req.body,
        mediaHooks
      );
      res.json({ listing });
    })
  );

  // Commission Settings, Mark Sold & Featured Listing Endpoints
  app.get(
    '/api/v1/commission/settings',
    asyncHandler(async (req, res) => {
      const result = await repo.getCommissionPublicInfo(req.auth?.user ?? null);
      res.json(result);
    })
  );

  app.post(
    '/api/v1/listings/:id/mark-sold',
    requireAuth,
    asyncHandler(async (req, res) => {
      const currentUser = req.auth!.user;
      if (
        !enforceRateLimit(
          listingUpdateLimiter,
          `mark-sold:${currentUser.id}`,
          res,
          'تجاوزت الحد المسموح لتحديث حالة الإعلانات مؤقتاً، حاول بعد قليل'
        )
      ) {
        return;
      }
      const result = await repo.markListingSold(
        currentUser,
        String(req.params.id || ''),
        req.body || {}
      );
      for (const ntf of result.adminNotifications) {
        emitToUser(ntf.userId, {
          type: 'notification:new',
          notification: ntf.notification,
        });
      }
      res.json({
        listing: result.listing,
        commissionRecord: result.commissionRecord,
        eligibility: result.eligibility,
      });
    })
  );

  app.post(
    '/api/v1/listings/:id/request-featured',
    requireAuth,
    asyncHandler(async (req, res) => {
      const currentUser = req.auth!.user;
      if (
        !enforceRateLimit(
          commissionLimiter,
          `featured:${currentUser.id}`,
          res,
          'تجاوزت الحد المسموح لطلبات التمييز مؤقتاً، حاول بعد قليل'
        )
      ) {
        return;
      }
      const result = await repo.requestListingFeatured(
        currentUser,
        String(req.params.id || ''),
        req.body || {}
      );
      for (const ntf of result.adminNotifications) {
        emitToUser(ntf.userId, {
          type: 'notification:new',
          notification: ntf.notification,
        });
      }
      res.json({
        listing: result.listing,
        commissionRecord: result.commissionRecord,
      });
    })
  );

  app.post(
    '/api/v1/commissions/submit',
    requireAuth,
    asyncHandler(async (req, res) => {
      const currentUser = req.auth!.user;
      if (
        !enforceRateLimit(
          commissionLimiter,
          `comm-submit:${currentUser.id}`,
          res,
          'تجاوزت الحد المسموح لإرسال تأكيدات الحوالات مؤقتاً، حاول بعد قليل'
        )
      ) {
        return;
      }
      const result = await repo.submitCommissionPayment(currentUser, req.body || {});
      for (const ntf of result.adminNotifications) {
        emitToUser(ntf.userId, {
          type: 'notification:new',
          notification: ntf.notification,
        });
      }
      res.status(201).json({ commissionRecord: result.commissionRecord });
    })
  );

  // POST /api/v1/favorites/toggle
  app.post(
    '/api/v1/favorites/toggle',
    requireAuth,
    asyncHandler(async (req, res) => {
      const currentUser = req.auth!.user;
      if (
        !enforceRateLimit(
          favoriteLimiter,
          `fav:${currentUser.id}`,
          res,
          'تجاوزت الحد المسموح لتحديث المفضلة مؤقتاً، حاول بعد قليل'
        )
      ) {
        return;
      }
      const rawListingId = req.body?.listingId;
      if (typeof rawListingId !== 'string' || !rawListingId.trim()) {
        return res.status(400).json({ error: 'معرف الإعلان مطلوب' });
      }
      const result = await repo.toggleFavorite(currentUser, rawListingId.trim());
      res.json(result);
    })
  );

  // Conversations & Messaging
  app.post(
    '/api/v1/conversations',
    requireAuth,
    asyncHandler(async (req, res) => {
      const currentUser = req.auth!.user;
      if (
        !enforceRateLimit(
          conversationStartLimiter,
          `conv:${currentUser.id}`,
          res,
          'تجاوزت الحد المسموح لبدء المحادثات مؤقتاً، حاول بعد قليل'
        )
      ) {
        return;
      }
      const result = await repo.startConversation(
        currentUser,
        req.body?.listingId,
        req.body?.initialMessage
      );
      if (result.recipientId && result.notification) {
        emitToUser(result.recipientId, {
          type: 'notification:new',
          notification: result.notification,
        });
      }
      if (result.recipientId && result.recipientConversation) {
        emitToUser(result.recipientId, {
          type: 'conversation:updated',
          conversation: result.recipientConversation,
        });
      }
      res.json({ conversation: result.conversation });
    })
  );

  app.post(
    '/api/v1/conversations/:id/messages',
    requireAuth,
    asyncHandler(async (req, res) => {
      const currentUser = req.auth!.user;
      if (
        !enforceRateLimit(
          messageLimiter,
          `msg:${currentUser.id}`,
          res,
          'تجاوزت الحد المسموح لإرسال الرسائل مؤقتاً، حاول بعد قليل'
        )
      ) {
        return;
      }
      const result = await repo.sendMessage(
        currentUser,
        String(req.params.id || ''),
        req.body?.body
      );
      if (result.recipientId && result.notification) {
        emitToUser(result.recipientId, {
          type: 'notification:new',
          notification: result.notification,
        });
      }
      if (result.recipientId && result.recipientConversation) {
        emitToUser(result.recipientId, {
          type: 'conversation:updated',
          conversation: result.recipientConversation,
        });
      }
      res.status(201).json({
        message: result.message,
        conversation: result.conversation,
      });
    })
  );

  app.post(
    '/api/v1/conversations/:id/read',
    requireAuth,
    asyncHandler(async (req, res) => {
      const currentUser = req.auth!.user;
      if (
        !enforceRateLimit(
          readReceiptLimiter,
          `read:${currentUser.id}`,
          res,
          'تجاوزت الحد المسموح لتحديث حالة القراءة مؤقتاً، حاول بعد قليل'
        )
      ) {
        return;
      }
      const result = await repo.markConversationRead(currentUser, String(req.params.id || ''));
      if (result.notificationsUpdatedUserId && result.notifications) {
        emitToUser(result.notificationsUpdatedUserId, {
          type: 'notifications:updated',
          notifications: result.notifications,
        });
      }
      res.json({ conversation: result.conversation });
    })
  );

  // Price Offers / Negotiation Endpoints
  app.post(
    '/api/v1/listings/:id/offers',
    requireAuth,
    asyncHandler(async (req, res) => {
      const currentUser = req.auth!.user;
      if (
        !enforceRateLimit(
          offerLimiter,
          `offer:${currentUser.id}`,
          res,
          'تجاوزت الحد المسموح لتقديم عروض الأسعار مؤقتاً، حاول بعد قليل'
        )
      ) {
        return;
      }
      const result = await repo.createOffer(currentUser, String(req.params.id || ''), req.body);
      if (result.recipientId && result.notification) {
        emitToUser(result.recipientId, {
          type: 'notification:new',
          notification: result.notification,
        });
      }
      if (result.recipientId && result.recipientConversation) {
        emitToUser(result.recipientId, {
          type: 'conversation:updated',
          conversation: result.recipientConversation,
        });
      }
      res.status(201).json({ offer: result.offer });
    })
  );

  app.post(
    '/api/v1/offers/:id/respond',
    requireAuth,
    asyncHandler(async (req, res) => {
      const currentUser = req.auth!.user;
      if (
        !enforceRateLimit(
          offerRespondLimiter,
          `offer-resp:${currentUser.id}`,
          res,
          'تجاوزت الحد المسموح للرد على العروض مؤقتاً، حاول بعد قليل'
        )
      ) {
        return;
      }
      const result = await repo.respondToOffer(
        currentUser,
        String(req.params.id || ''),
        req.body?.status
      );
      if (result.buyerNotification) {
        emitToUser(result.buyerNotification.userId, {
          type: 'notification:new',
          notification: result.buyerNotification.notification,
        });
      }
      emitToUser(result.offer.buyerId, { type: 'offer:updated', offer: result.offer });
      res.json({ offer: result.offer });
    })
  );

  // Seller Self-Service Verification Status & Re-submission
  app.get(
    '/api/v1/seller/verification',
    requireAuth,
    asyncHandler(async (req, res) => {
      const data = await repo.getSellerVerification(req.auth!.user);
      res.json(data);
    })
  );

  app.post(
    '/api/v1/seller/verification/request',
    requireAuth,
    asyncHandler(async (req, res) => {
      const currentUser = req.auth!.user;
      if (
        !enforceRateLimit(
          verificationRequestLimiter,
          `verify-req:${currentUser.id}`,
          res,
          'تجاوزت الحد المسموح لطلبات التوثيق مؤقتاً، حاول بعد قليل'
        )
      ) {
        return;
      }
      const data = await repo.requestSellerVerification(currentUser);
      res.json(data);
    })
  );

  // Reports (Listings & Comments)
  app.post(
    '/api/v1/reports',
    requireAuth,
    asyncHandler(async (req, res) => {
      const currentUser = req.auth!.user;
      if (
        !enforceRateLimit(
          reportLimiter,
          `report:${currentUser.id}`,
          res,
          'تجاوزت الحد المسموح لإرسال البلاغات مؤقتاً، حاول بعد قليل'
        )
      ) {
        return;
      }
      const result = await repo.createReport(currentUser, req.body);
      res.status(201).json(result);
    })
  );

  // Admin Overview & Management Endpoints (strictly guarded by requireAdmin)
  app.get(
    '/api/v1/admin/overview',
    requireAdmin,
    asyncHandler(async (_req, res) => {
      const overview = await repo.getAdminOverview();
      res.json({ overview });
    })
  );

  app.get(
    '/api/v1/admin/users',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await repo.listAdminUsers({
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
        role: typeof req.query.role === 'string' ? req.query.role : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        verificationStatus:
          typeof req.query.verificationStatus === 'string'
            ? req.query.verificationStatus
            : undefined,
        limit: req.query.limit,
        offset: req.query.offset,
      });
      res.json(result);
    })
  );

  app.post(
    '/api/v1/admin/users/:id/suspend',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await repo.suspendUser(
        req.auth!.user,
        String(req.params.id || ''),
        req.body?.reason
      );
      if (result.revokedSessionIds.length > 0) {
        realtime.closeSessions(result.revokedSessionIds);
      }
      res.json({ user: result.user, auditEntry: result.auditEntry });
    })
  );

  app.post(
    '/api/v1/admin/users/:id/reactivate',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await repo.reactivateUser(
        req.auth!.user,
        String(req.params.id || ''),
        req.body?.reason
      );
      res.json(result);
    })
  );

  app.get(
    '/api/v1/admin/sellers',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await repo.listAdminSellers({
        status: typeof req.query.status === 'string' ? req.query.status : 'all',
        q: typeof req.query.q === 'string' ? req.query.q : '',
        limit: req.query.limit,
        offset: req.query.offset,
      });
      res.json(result);
    })
  );

  app.post(
    '/api/v1/admin/sellers/:userId/verification',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await repo.reviewSellerVerification(
        req.auth!.user,
        String(req.params.userId || ''),
        req.body?.status,
        req.body?.reason
      );
      if (result.notification) {
        emitToUser(result.notification.userId, {
          type: 'notification:new',
          notification: result.notification.notification,
        });
      }
      res.json({ user: result.user, seller: result.seller, auditEntry: result.auditEntry });
    })
  );

  app.get(
    '/api/v1/admin/reports',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await repo.listAdminReports({
        status: typeof req.query.status === 'string' ? req.query.status : 'all',
        targetType: typeof req.query.targetType === 'string' ? req.query.targetType : 'all',
        q: typeof req.query.q === 'string' ? req.query.q : '',
        limit: req.query.limit,
        offset: req.query.offset,
      });
      res.json(result);
    })
  );

  app.post(
    '/api/v1/admin/reports/:id/resolve',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await repo.resolveReport(
        req.auth!.user,
        String(req.params.id || ''),
        req.body?.status,
        req.body?.note
      );
      res.json(result);
    })
  );

  app.get(
    '/api/v1/admin/audit-logs',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await repo.listAdminAuditLogs({
        targetType: typeof req.query.targetType === 'string' ? req.query.targetType : 'all',
        q: typeof req.query.q === 'string' ? req.query.q : '',
        limit: req.query.limit,
        offset: req.query.offset,
      });
      res.json(result);
    })
  );

  app.post(
    '/api/v1/admin/listings/:id/approve',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await repo.approveListing(req.auth!.user, String(req.params.id || ''));
      if (result.notification) {
        emitToUser(result.notification.userId, {
          type: 'notification:new',
          notification: result.notification.notification,
        });
      }
      res.json({ listing: result.listing });
    })
  );

  app.post(
    '/api/v1/admin/listings/:id/reject',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await repo.rejectListing(
        req.auth!.user,
        String(req.params.id || ''),
        req.body?.reason
      );
      if (result.notification) {
        emitToUser(result.notification.userId, {
          type: 'notification:new',
          notification: result.notification.notification,
        });
      }
      res.json({ listing: result.listing });
    })
  );

  app.post(
    '/api/v1/admin/breeds',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await repo.createBreed(req.auth!.user, req.body);
      res.status(201).json(result);
    })
  );

  // Smart Sub-Categories Admin Endpoints
  app.post(
    '/api/v1/admin/categories',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await repo.createCategory(req.auth!.user, req.body);
      res.status(201).json(result);
    })
  );

  app.patch(
    '/api/v1/admin/categories/:id',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await repo.updateCategory(
        req.auth!.user,
        String(req.params.id || ''),
        req.body
      );
      res.json(result);
    })
  );

  app.delete(
    '/api/v1/admin/categories/:id',
    requireAdmin,
    asyncHandler(async (req, res) => {
      await repo.deleteCategory(req.auth!.user, String(req.params.id || ''));
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/v1/admin/listings/auto-categorize',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await repo.autoCategorizeListings(req.auth!.user, req.body);
      res.json(result);
    })
  );

  app.get(
    '/api/v1/admin/comments',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await repo.listAdminComments({
        q: typeof req.query.q === 'string' ? req.query.q : '',
        listingId: typeof req.query.listingId === 'string' ? req.query.listingId.trim() : '',
        limit: req.query.limit,
        offset: req.query.offset,
      });
      res.json(result);
    })
  );

  app.get(
    '/api/v1/admin/commissions',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await repo.getAdminCommissions({
        status: typeof req.query.status === 'string' ? req.query.status : 'all',
        kind: typeof req.query.kind === 'string' ? req.query.kind : 'all',
        q: typeof req.query.q === 'string' ? req.query.q : '',
        limit: req.query.limit,
        offset: req.query.offset,
      });
      res.json(result);
    })
  );

  app.patch(
    '/api/v1/admin/commission-settings',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await repo.updateCommissionSettings(req.auth!.user, req.body || {});
      res.json(result);
    })
  );

  app.post(
    '/api/v1/admin/commissions/:id/review',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await repo.reviewCommissionRecord(
        req.auth!.user,
        String(req.params.id || ''),
        req.body?.status,
        req.body?.note
      );
      if (result.sellerNotification) {
        emitToUser(result.sellerNotification.userId, {
          type: 'notification:new',
          notification: result.sellerNotification.notification,
        });
      }
      res.json({
        commissionRecord: result.commissionRecord,
        ...(result.listing ? { listing: result.listing } : {}),
        auditEntry: result.auditEntry,
      });
    })
  );

  // Authorized Admin Endpoints: Contact Us & Service Inquiries Queue
  app.get(
    '/api/v1/admin/inquiries',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const statusFilter =
        typeof req.query.status === 'string' ? req.query.status.trim() : 'all';
      const kindFilter =
        typeof req.query.kind === 'string' ? req.query.kind.trim() : 'all';
      const q =
        typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
      const offset = Math.max(0, Number(req.query.offset) || 0);

      const allRecords = readInquiries()
        .map((item) => ({
          kind: item.kind === 'service_request' ? 'service_request' : 'contact',
          referenceId: String(item.referenceId || ''),
          userId: item.userId ? String(item.userId) : null,
          name: item.name ? String(item.name) : null,
          email: item.email ? String(item.email) : null,
          contact: item.contact ? String(item.contact) : null,
          category: item.category
            ? String(item.category)
            : item.topic
            ? String(item.topic)
            : null,
          topic: item.topic ? String(item.topic) : null,
          region: item.region ? String(item.region) : null,
          preferredReply: item.preferredReply ? String(item.preferredReply) : null,
          message: item.message ? String(item.message) : null,
          serviceType: item.serviceType ? String(item.serviceType) : null,
          phone: item.phone ? String(item.phone) : null,
          details: item.details ? String(item.details) : null,
          status:
            item.status === 'in_progress' || item.status === 'resolved'
              ? item.status
              : 'new',
          adminNote: item.adminNote ? String(item.adminNote) : null,
          reviewedByName: item.reviewedByName ? String(item.reviewedByName) : null,
          reviewedAt: item.reviewedAt ? String(item.reviewedAt) : null,
          receivedAt: String(item.receivedAt || ''),
        }))
        .sort((a, b) => Date.parse(b.receivedAt || '') - Date.parse(a.receivedAt || ''));

      const summary = {
        total: allRecords.length,
        newCount: allRecords.filter((r) => r.status === 'new').length,
        inProgressCount: allRecords.filter((r) => r.status === 'in_progress').length,
        resolvedCount: allRecords.filter((r) => r.status === 'resolved').length,
      };

      const filtered = allRecords.filter((item) => {
        if (statusFilter !== 'all' && item.status !== statusFilter) return false;
        if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
        if (q) {
          const hay = [
            item.referenceId,
            item.name,
            item.email,
            item.contact,
            item.category,
            item.topic,
            item.message,
            item.serviceType,
            item.details,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      const page = filtered.slice(offset, offset + limit);
      const hasMore = offset + page.length < filtered.length;
      res.json({
        inquiries: page,
        summary,
        totalCount: filtered.length,
        limit,
        offset,
        hasMore,
        nextOffset: hasMore ? offset + page.length : null,
      });
    })
  );

  app.patch(
    '/api/v1/admin/inquiries/:referenceId',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const referenceId = String(req.params.referenceId || '').trim();
      if (!referenceId) {
        throw new ValidationError(400, 'معرف الرسالة مطلوب');
      }
      const nextStatus = typeof req.body?.status === 'string' ? req.body.status.trim() : '';
      if (!['new', 'in_progress', 'resolved'].includes(nextStatus)) {
        throw new ValidationError(400, 'حالة المتابعة غير صالحة');
      }
      const adminNote = validateOptionalText(req.body?.adminNote, {
        label: 'ملاحظة الإدارة',
        maxLength: 1000,
        allowNewlines: true,
      });

      const allRecords = readInquiries();
      const idx = allRecords.findIndex(
        (item) => String(item.referenceId || '') === referenceId
      );
      if (idx === -1) {
        throw new ValidationError(404, 'تعذر العثور على رسالة التواصل المطلوبة');
      }

      const updated: Record<string, unknown> = {
        ...allRecords[idx],
        status: nextStatus,
        adminNote: adminNote || null,
        reviewedByName: req.auth!.user.name,
        reviewedAt: new Date().toISOString(),
      };
      allRecords[idx] = updated;
      writeInquiries(allRecords);

      res.json({ ok: true, inquiry: updated });
    })
  );

  // JSON error handler for the API (malformed JSON, oversized bodies, validation/repo errors): no stack traces leak.
  app.use('/api', (err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(err);
    if (
      err instanceof RepositoryError ||
      err instanceof GoogleAuthError ||
      err instanceof AdminValidationError ||
      err instanceof CommentValidationError ||
      err instanceof LikeValidationError ||
      err instanceof ValidationError ||
      err instanceof MediaUploadError
    ) {
      return res.status(err.status).json({
        error: err.message,
        ...(err.code ? { code: err.code } : {}),
      });
    }
    const status =
      err?.type === 'entity.too.large'
        ? 413
        : err?.status >= 400 && err?.status < 500
        ? err.status
        : 500;
    if (status === 500) console.error('API error:', err);
    res.status(status).json({
      error:
        status === 413
          ? 'حجم الطلب كبير جداً'
          : status === 500
          ? 'حدث خطأ غير متوقع في الخادم'
          : 'طلب غير صالح',
    });
  });

  // Static / Vite setup
  if (opts.serveFrontend !== false) {
    if (config.isProd) {
      const distPath = path.resolve(__dirname, 'dist');
      app.use(
        express.static(distPath, {
          index: false,
          setHeaders(res, filePath) {
            if (filePath.endsWith('index.html')) {
              res.setHeader('Cache-Control', 'no-cache');
            } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            }
          },
        })
      );
      app.get('*', (_req, res) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(path.join(distPath, 'index.html'));
      });
    } else {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    }
  }

  await new Promise<void>((resolve) => httpServer.listen(config.port, '0.0.0.0', () => resolve()));
  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
  console.log(
    `Souq Al-Ghanam server listening on http://localhost:${port} [${repo.backend} / media:${primaryMediaStorage.provider}]`
  );

  return {
    app,
    httpServer,
    port,
    config,
    mediaProvider: primaryMediaStorage.provider,
    getStore: () => {
      if (!repo.getRawJsonStore) {
        throw new Error(`getStore() is only supported when STORAGE_BACKEND=json (active: ${repo.backend})`);
      }
      return repo.getRawJsonStore();
    },
    cleanupOrphanedMedia: runOrphanedMediaCleanup,
    flushStore: () => repo.flush?.() ?? false,
    close: async () => {
      shuttingDown = true;
      clearInterval(sweeper);
      clearInterval(mediaSweeper);
      repo.flush?.();
      realtime.close();
      await new Promise<void>((resolve) => {
        const forceTimer = setTimeout(() => {
          httpServer.closeAllConnections?.();
          resolve();
        }, 10_000);
        forceTimer.unref();
        httpServer.close(() => {
          clearTimeout(forceTimer);
          resolve();
        });
        httpServer.closeIdleConnections?.();
      });
    },
  };
}

// Start automatically only when executed directly (`tsx server.ts`), not when imported by tests.
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  // .env is read only here (never on import), and real environment variables always take precedence.
  loadEnvForEntryPoint();
  startServer()
    .then((srv) => {
      // Release the data-directory lock / PG pool and close sockets cleanly on Ctrl+C / platform stop.
      let closing = false;
      const shutdown = (signal: string) => {
        if (closing) return;
        closing = true;
        console.log(`Received ${signal}, shutting down.`);
        srv.close().finally(() => process.exit(0));
      };
      process.once('SIGINT', () => shutdown('SIGINT'));
      process.once('SIGTERM', () => shutdown('SIGTERM'));
    })
    .catch((err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}
