import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AppConfig } from '../config';
import type { MarketplaceRepository } from '../repositories/types';
import { parseCookies } from './cookies';
import { checkMutationOrigin, csrfTokenFor, verifyCsrfToken } from './csrf';
import type { AuthContext } from './types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export interface AuthDeps {
  config: AppConfig;
  repo: MarketplaceRepository;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Pre-session endpoints: protected by the Origin check but cannot carry a session-bound CSRF token yet. */
const CSRF_TOKEN_EXEMPT = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/google',
  '/auth/google/link-with-password',
  '/auth/facebook/link-with-password',
]);

export function createAuthMiddleware(deps: AuthDeps) {
  const { config, repo } = deps;

  /** Resolves the session cookie to a user. The only source of identity in the whole API. */
  const attachAuth: RequestHandler = (req, _res, next) => {
    const token = parseCookies(req.headers.cookie)[config.cookieName];
    if (!token) {
      next();
      return;
    }

    void (async () => {
      const session = await repo.validateSession({ token, idleMs: config.sessionIdleMs });
      if (session) {
        const user = await repo.findUserById(session.userId);
        if (user && user.status === 'active') {
          req.auth = { user, session, csrfToken: csrfTokenFor(session.id, config.csrfSecret) };
        } else {
          await repo.revokeSession(session.id);
        }
      }
      next();
    })().catch(next);
  };

  /** Origin + CSRF-token enforcement for every state-changing request. */
  const mutationGuard: RequestHandler = (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = checkMutationOrigin(
      {
        origin: req.header('origin'),
        referer: req.header('referer'),
        secFetchSite: req.header('sec-fetch-site'),
      },
      config.allowedOrigins
    );
    if (!origin.ok) {
      return res.status(403).json({ error: 'تم رفض الطلب: مصدر غير مسموح', code: 'bad_origin' });
    }

    if (req.auth && !CSRF_TOKEN_EXEMPT.has(req.path)) {
      if (!verifyCsrfToken(req.auth.session.id, req.header('x-csrf-token'), config.csrfSecret)) {
        return res.status(403).json({ error: 'رمز الحماية غير صالح، أعد تحميل الصفحة', code: 'bad_csrf' });
      }
    }
    next();
  };

  const requireAuth: RequestHandler = (req, res, next) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً', code: 'unauthenticated' });
    }
    next();
  };

  const requireAdmin: RequestHandler = (req, res, next) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً', code: 'unauthenticated' });
    }
    if (req.auth.user.role !== 'admin') {
      return res.status(403).json({ error: 'صلاحيات المشرف مطلوبة لهذا الإجراء', code: 'forbidden' });
    }
    next();
  };

  const securityHeaders: RequestHandler = (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (config.isProd) {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
      res.setHeader(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          "script-src 'self' https://accounts.google.com/gsi/client",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
          "font-src 'self' https://fonts.gstatic.com data:",
          "img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.googleusercontent.com https://*.fbcdn.net https://graph.facebook.com https://platform-lookaside.fbsbx.com",
          "media-src 'self' blob:",
          "connect-src 'self' ws: wss: https://accounts.google.com/gsi/",
          "frame-src 'self' https://accounts.google.com/gsi/",
          "object-src 'none'",
          "base-uri 'self'",
          "frame-ancestors 'none'",
          "form-action 'self' https://accounts.google.com https://www.facebook.com",
        ].join('; ')
      );
    }
    next();
  };

  const noStoreApi: RequestHandler = (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  };

  return { attachAuth, mutationGuard, requireAuth, requireAdmin, securityHeaders, noStoreApi };
}
