import crypto from 'node:crypto';
import express from 'express';
import { RepositoryError } from '../domain/marketplace';
import {
  buildGoogleOAuthUrl,
  createSignedGoogleOAuthState,
  exchangeGoogleCodeForClaims,
  GoogleAuthError,
  verifyGoogleIdTokenWithLibrary,
  verifySignedGoogleOAuthState,
  type GoogleIdTokenVerifier,
} from './google';
import {
  buildFacebookOAuthUrl,
  createSignedFacebookLinkToken,
  createSignedFacebookOAuthState,
  exchangeFacebookCodeForClaims,
  FacebookAuthError,
  verifySignedFacebookLinkToken,
  verifySignedFacebookOAuthState,
  type VerifiedFacebookClaims,
} from './facebook';
import type { AuthDeps } from './middleware';
import { createAuthMiddleware } from './middleware';
import { serializeClearCookie, serializeSessionCookie } from './cookies';
import { csrfTokenFor } from './csrf';
import { normalizeEmail, normalizeSaudiMobile, validatePassword } from './phone';
import { hashPassword, passwordNeedsRehash, verifyAgainstDummy, verifyPassword } from './password';
import { RateLimiter } from './rateLimit';
import { toSelfUser } from './serialize';

export interface AuthRouterDeps extends AuthDeps {
  loginPhoneLimiter?: RateLimiter;
  loginIpLimiter?: RateLimiter;
  registerIpLimiter?: RateLimiter;
  /** Counts only registrations that hit an already-registered number (see the enumeration note in /register). */
  registerConflictIpLimiter?: RateLimiter;
  googleIpLimiter?: RateLimiter;
  facebookIpLimiter?: RateLimiter;
  /** Injectable verifier for tests; defaults to Google's official OAuth2Client verifier. */
  verifyGoogleIdToken?: GoogleIdTokenVerifier;
  /** Injectable Facebook code verifier for tests; defaults to Graph API exchange + debug_token. */
  exchangeFacebookCode?: (params: {
    code: string;
    appId: string;
    appSecret: string;
    redirectUri: string;
  }) => Promise<VerifiedFacebookClaims>;
}

const GENERIC_PHONE_LOGIN_ERROR = 'رقم الجوال أو كلمة المرور غير صحيحة';
const GENERIC_EMAIL_LOGIN_ERROR = 'البريد الإلكتروني أو كلمة المرور غير صحيحة';

function asyncHandler(
  fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<unknown>
): express.RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderGoogleCallbackHtml(
  payload: {
    ok: boolean;
    error?: string;
    code?: string;
    isNewUser?: boolean;
    needsProfileCompletion?: boolean;
  },
  targetOrigin: string
): string {
  const serializedPayload = JSON.stringify({
    type: 'souq-google-auth',
    ...payload,
  });
  const titleText = payload.ok
    ? 'تم تسجيل الدخول بنجاح'
    : payload.error || 'تعذر إتمام تسجيل الدخول عبر Google';

  return `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>سوق الغنم — تسجيل الدخول عبر Google</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; background: #F7F5EE; color: #1A241E; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; text-align: center; }
      .card { background: #FFFFFF; border: 1px solid #E5E0D5; border-radius: 18px; padding: 28px 24px; max-width: 400px; width: 100%; box-shadow: 0 12px 32px rgba(11, 61, 46, 0.08); }
      h1 { font-size: 18px; margin: 0 0 8px; color: #0B3D2E; }
      p { font-size: 14px; margin: 0 0 16px; color: #5B665F; line-height: 1.6; }
      a { display: inline-block; background: #0B3D2E; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 12px; font-weight: 700; font-size: 14px; }
    </style>
  </head>
  <body>
    <div
      id="google-auth-callback"
      class="card"
      data-payload="${escapeHtmlAttr(serializedPayload)}"
      data-origin="${escapeHtmlAttr(targetOrigin)}"
    >
      <h1>سوق الغنم</h1>
      <p id="status-msg">${escapeHtmlAttr(titleText)}</p>
      <a href="/">العودة إلى المنصة</a>
    </div>
    <script src="/api/v1/auth/google/callback.js" defer></script>
  </body>
</html>`;
}

function renderFacebookCallbackHtml(
  payload: {
    ok: boolean;
    error?: string;
    code?: string;
    intent?: 'auth' | 'link';
    linkToken?: string;
    email?: string | null;
    isNewUser?: boolean;
    needsProfileCompletion?: boolean;
  },
  targetOrigin: string
): string {
  const serializedPayload = JSON.stringify({
    type: 'souq-facebook-auth',
    ...payload,
  });
  const titleText = payload.ok
    ? 'تم التحقق عبر Facebook بنجاح'
    : payload.error || 'تعذر إتمام تسجيل الدخول عبر Facebook';

  return `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>سوق الغنم — تسجيل الدخول عبر Facebook</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; background: #F7F5EE; color: #1A241E; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; text-align: center; }
      .card { background: #FFFFFF; border: 1px solid #E5E0D5; border-radius: 18px; padding: 28px 24px; max-width: 400px; width: 100%; box-shadow: 0 12px 32px rgba(11, 61, 46, 0.08); }
      h1 { font-size: 18px; margin: 0 0 8px; color: #0B3D2E; }
      p { font-size: 14px; margin: 0 0 16px; color: #5B665F; line-height: 1.6; }
      a { display: inline-block; background: #0B3D2E; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 12px; font-weight: 700; font-size: 14px; }
    </style>
  </head>
  <body>
    <div
      id="facebook-auth-callback"
      class="card"
      data-payload="${escapeHtmlAttr(serializedPayload)}"
      data-origin="${escapeHtmlAttr(targetOrigin)}"
    >
      <h1>سوق الغنم</h1>
      <p id="status-msg">${escapeHtmlAttr(titleText)}</p>
      <a href="/">العودة إلى المنصة</a>
    </div>
    <script src="/api/v1/auth/facebook/callback.js" defer></script>
  </body>
</html>`;
}

export function createAuthRouter(deps: AuthRouterDeps) {
  const { config, repo } = deps;
  const { requireAuth } = createAuthMiddleware(deps);
  const router = express.Router();

  const loginPhoneLimiter = deps.loginPhoneLimiter || new RateLimiter({ max: 5, windowMs: 15 * 60_000 });
  const loginIpLimiter = deps.loginIpLimiter || new RateLimiter({ max: 30, windowMs: 15 * 60_000 });
  const registerIpLimiter = deps.registerIpLimiter || new RateLimiter({ max: config.registerMaxPerHour, windowMs: 60 * 60_000 });
  // A real person hits "number already registered" a couple of times at most; a script probing which numbers
  // have accounts hits it constantly. A much tighter budget for that outcome alone throttles the probing
  // without touching normal sign-ups.
  const registerConflictIpLimiter = deps.registerConflictIpLimiter || new RateLimiter({ max: 5, windowMs: 60 * 60_000 });
  const googleIpLimiter = deps.googleIpLimiter || new RateLimiter({ max: 25, windowMs: 15 * 60_000 });
  const facebookIpLimiter = deps.facebookIpLimiter || new RateLimiter({ max: 25, windowMs: 15 * 60_000 });
  const verifyGoogleToken = deps.verifyGoogleIdToken || verifyGoogleIdTokenWithLibrary;
  const exchangeFbCode = deps.exchangeFacebookCode || exchangeFacebookCodeForClaims;

  const getGooglePublicConfig = () => ({
    enabled: Boolean(config.googleClientId),
    clientId: config.googleClientId || null,
    codeFlowEnabled: Boolean(config.googleClientId && config.googleClientSecret),
  });

  const getFacebookPublicConfig = () => ({
    enabled: Boolean(config.facebookAppId && config.facebookAppSecret),
    appId: config.facebookAppId || null,
  });

  const allowedOriginSet = new Set(config.allowedOrigins);

  const resolveRequestOrigin = (req: express.Request): string => {
    const reqOrigin = req.header('origin');
    if (reqOrigin && allowedOriginSet.has(reqOrigin)) {
      return reqOrigin;
    }
    const host = req.get('host');
    if (host) {
      const proto =
        req.protocol === 'https' || req.header('x-forwarded-proto') === 'https' ? 'https' : 'http';
      const candidate = `${proto}://${host}`;
      if (allowedOriginSet.has(candidate)) {
        return candidate;
      }
      return candidate;
    }
    return config.allowedOrigins[0] || `http://localhost:${config.port}`;
  };

  const resolveOAuthOrigin = (req: express.Request): string => {
    const rawAppUrl = process.env.APP_URL?.trim();
    if (rawAppUrl && rawAppUrl !== 'MY_APP_URL') {
      try {
        const parsed = new URL(rawAppUrl);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          return parsed.origin;
        }
      } catch {
        // fallback to request origin
      }
    }
    return resolveRequestOrigin(req);
  };

  const resolveGoogleRedirectUri = (req: express.Request): string => {
    if (config.googleRedirectUri) return config.googleRedirectUri;
    return `${resolveRequestOrigin(req)}/api/v1/auth/google/callback`;
  };

  const resolveFacebookRedirectUri = (req: express.Request): string => {
    if (config.facebookRedirectUri) return config.facebookRedirectUri;
    return `${resolveOAuthOrigin(req)}/api/v1/auth/facebook/callback`;
  };

  const setSessionCookie = (res: express.Response, token: string) => {
    res.setHeader(
      'Set-Cookie',
      serializeSessionCookie(config.cookieName, token, { secure: config.cookieSecure, maxAgeMs: config.sessionAbsoluteMs })
    );
  };

  const tooMany = (res: express.Response, retryAfterMs: number) => {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
    return res.status(429).json({ error: 'محاولات كثيرة، حاول مرة أخرى لاحقاً', code: 'rate_limited' });
  };

  // Current session state + a fresh CSRF token + public social OAuth metadata for the SPA.
  router.get(
    '/me',
    asyncHandler(async (req, res) => {
      const google = getGooglePublicConfig();
      const facebook = getFacebookPublicConfig();
      if (!req.auth) return res.json({ user: null, csrfToken: null, google, facebook });
      const meta = await repo.getUserAuthMeta(req.auth.user.id);
      res.json({
        user: toSelfUser(req.auth.user, meta),
        csrfToken: req.auth.csrfToken,
        google,
        facebook,
      });
    })
  );

  router.get('/google/config', (_req, res) => {
    res.json(getGooglePublicConfig());
  });

  router.get('/facebook/config', (_req, res) => {
    res.json(getFacebookPublicConfig());
  });

  router.post(
    '/register',
    asyncHandler(async (req, res) => {
      const ip = req.ip || 'unknown';
      const gate = registerIpLimiter.consume(`ip:${ip}`);
      if (!gate.allowed) return tooMany(res, gate.retryAfterMs);
      const conflictGate = registerConflictIpLimiter.check(`ip:${ip}`);
      if (!conflictGate.allowed) return tooMany(res, conflictGate.retryAfterMs);

      const body = req.body || {};
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const phone = normalizeSaudiMobile(body.phone);
      const rawEmail = typeof body.email === 'string' ? body.email.trim() : '';
      let cleanEmail: string | undefined;
      if (rawEmail) {
        const normalizedEmail = normalizeEmail(rawEmail);
        if (!normalizedEmail) {
          return res.status(400).json({ error: 'صيغة البريد الإلكتروني غير صحيحة' });
        }
        cleanEmail = normalizedEmail;
      }

      if (name.length < 2 || name.length > 80) {
        return res.status(400).json({ error: 'يرجى إدخال الاسم الكامل' });
      }
      if (!phone) {
        return res.status(400).json({ error: 'رقم الجوال غير صحيح، استخدم صيغة 05XXXXXXXX' });
      }
      const pwError = validatePassword(body.password, phone);
      if (pwError) return res.status(400).json({ error: pwError });

      const existingPhone = await repo.findUserByPhone(phone);
      if (existingPhone) {
        await verifyAgainstDummy(body.password);
        registerConflictIpLimiter.hit(`ip:${ip}`);
        return res.status(409).json({ error: 'رقم الجوال مسجل مسبقاً، سجّل الدخول بدلاً من ذلك' });
      }
      if (cleanEmail) {
        const existingEmail = await repo.findUserByEmail(cleanEmail);
        if (existingEmail) {
          await verifyAgainstDummy(body.password);
          registerConflictIpLimiter.hit(`ip:${ip}`);
          return res
            .status(409)
            .json({ error: 'البريد الإلكتروني مسجل مسبقاً، سجّل الدخول بدلاً من ذلك' });
        }
      }

      // The role is chosen server-side from a closed list: 'admin' can never be requested by a client.
      const role: 'buyer' | 'seller' = body.role === 'seller' ? 'seller' : 'buyer';
      const passwordHash = await hashPassword(body.password);

      let registered: { user: any; seller?: any };
      try {
        registered = await repo.registerUser({
          name,
          phone,
          ...(cleanEmail ? { email: cleanEmail } : {}),
          role,
          passwordHash,
        });
      } catch (err) {
        if (err instanceof RepositoryError && err.status === 409) {
          registerConflictIpLimiter.hit(`ip:${ip}`);
          return res.status(409).json({ error: err.message });
        }
        throw err;
      }

      // Replace any session this browser already had (session fixation / account switch hygiene).
      if (req.auth) await repo.revokeSession(req.auth.session.id);
      const { token, session } = await repo.createSession({
        userId: registered.user.id,
        ip,
        userAgent: req.header('user-agent'),
        absoluteMs: config.sessionAbsoluteMs,
        maxPerUser: config.maxSessionsPerUser,
      });

      setSessionCookie(res, token);
      res.status(201).json({
        user: toSelfUser(registered.user, {
          googleLinked: false,
          facebookLinked: false,
          hasPassword: true,
        }),
        csrfToken: csrfTokenFor(session.id, config.csrfSecret),
      });
    })
  );

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const ip = req.ip || 'unknown';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
      const rawPhone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';

      const usingEmail = Boolean(rawEmail && !rawPhone);
      const phone = usingEmail ? null : normalizeSaudiMobile(req.body?.phone);
      const email = usingEmail ? normalizeEmail(rawEmail) : null;

      if (usingEmail) {
        if (!email || !password || password.length > 256) {
          return res.status(400).json({ error: 'أدخل البريد الإلكتروني وكلمة المرور' });
        }
      } else if (!phone || !password || password.length > 256) {
        return res.status(400).json({ error: 'أدخل رقم الجوال وكلمة المرور' });
      }

      const identifierKey = email ? `email:${email}` : `phone:${phone}`;
      const ipKey = `ip:${ip}`;
      const blockedIdentifier = loginPhoneLimiter.check(identifierKey);
      if (!blockedIdentifier.allowed) return tooMany(res, blockedIdentifier.retryAfterMs);
      const blockedIp = loginIpLimiter.check(ipKey);
      if (!blockedIp.allowed) return tooMany(res, blockedIp.retryAfterMs);

      const user = email
        ? await repo.findUserByEmail(email)
        : await repo.findUserByPhone(phone!);
      const credential = user ? await repo.getCredential(user.id) : undefined;

      let valid = false;
      if (user && credential) {
        valid = await verifyPassword(credential.passwordHash, password);
      } else {
        await verifyAgainstDummy(password); // equalise timing for unknown / credential-less accounts
      }

      if (!valid || !user || !credential) {
        loginPhoneLimiter.hit(identifierKey);
        loginIpLimiter.hit(ipKey);
        return res.status(401).json({
          error: usingEmail ? GENERIC_EMAIL_LOGIN_ERROR : GENERIC_PHONE_LOGIN_ERROR,
        });
      }
      if (user.status !== 'active') {
        return res.status(403).json({ error: 'هذا الحساب موقوف، تواصل مع إدارة المنصة' });
      }

      loginPhoneLimiter.reset(identifierKey);
      if (await passwordNeedsRehash(credential.passwordHash)) {
        await repo.updateCredential(user.id, await hashPassword(password));
      }

      // New session id on every login; the previous one (if any) is destroyed.
      if (req.auth) await repo.revokeSession(req.auth.session.id);
      const { token, session } = await repo.createSession({
        userId: user.id,
        ip,
        userAgent: req.header('user-agent'),
        absoluteMs: config.sessionAbsoluteMs,
        maxPerUser: config.maxSessionsPerUser,
      });

      const meta = await repo.getUserAuthMeta(user.id);
      setSessionCookie(res, token);
      res.json({
        user: toSelfUser(user, meta),
        csrfToken: csrfTokenFor(session.id, config.csrfSecret),
      });
    })
  );

  // Google Sign-In & Sign-Up (Google Identity Services ID token flow)
  router.post(
    '/google',
    asyncHandler(async (req, res) => {
      const ip = req.ip || 'unknown';
      const gate = googleIpLimiter.consume(`ip:${ip}`);
      if (!gate.allowed) return tooMany(res, gate.retryAfterMs);

      if (!config.googleClientId) {
        return res.status(503).json({
          error: 'تسجيل الدخول عبر Google غير مفعّل حالياً على الخادم (يرجى ضبط GOOGLE_CLIENT_ID)',
          code: 'google_not_configured',
        });
      }

      const body = req.body || {};
      const credential = typeof body.credential === 'string' ? body.credential : '';
      const role: 'buyer' | 'seller' = body.role === 'seller' ? 'seller' : 'buyer';
      const mode: 'login' | 'register' = body.mode === 'register' ? 'register' : 'login';

      const claims = await verifyGoogleToken({
        idToken: credential,
        clientId: config.googleClientId,
      });

      const authResult = await repo.authenticateWithGoogle({
        claims,
        role,
        mode,
      });

      if (authResult.user.status !== 'active') {
        return res.status(403).json({
          error: 'هذا الحساب موقوف، تواصل مع إدارة المنصة',
          code: 'account_suspended',
        });
      }

      if (req.auth) await repo.revokeSession(req.auth.session.id);
      const { token, session } = await repo.createSession({
        userId: authResult.user.id,
        ip,
        userAgent: req.header('user-agent'),
        absoluteMs: config.sessionAbsoluteMs,
        maxPerUser: config.maxSessionsPerUser,
      });

      setSessionCookie(res, token);
      const selfUser = toSelfUser(authResult.user, {
        googleLinked: authResult.googleLinked,
        facebookLinked: authResult.facebookLinked,
        hasPassword: authResult.hasPassword,
      });

      res.status(authResult.isNewUser ? 201 : 200).json({
        user: selfUser,
        csrfToken: csrfTokenFor(session.id, config.csrfSecret),
        isNewUser: authResult.isNewUser,
        needsProfileCompletion: !selfUser?.phone,
      });
    })
  );

  // Optional OIDC authorization code popup URL fallback (enabled when GOOGLE_CLIENT_SECRET is set)
  router.get(
    '/google/url',
    asyncHandler(async (req, res) => {
      if (!config.googleClientId || !config.googleClientSecret) {
        return res.status(503).json({
          error: 'مسار Google OAuth البديل يتطلب ضبط GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET',
          code: 'google_code_flow_disabled',
        });
      }

      const role: 'buyer' | 'seller' = req.query.role === 'seller' ? 'seller' : 'buyer';
      const mode: 'login' | 'register' = req.query.mode === 'register' ? 'register' : 'login';
      const nonce = crypto.randomBytes(24).toString('base64url');
      const state = createSignedGoogleOAuthState({ nonce, role, mode }, config.csrfSecret);
      const redirectUri = resolveGoogleRedirectUri(req);

      const url = buildGoogleOAuthUrl({
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
        redirectUri,
        state,
        nonce,
      });

      res.json({ url });
    })
  );

  // CSP-compliant script for Google popup OAuth callback page (avoids inline scripts under script-src 'self')
  router.get('/google/callback.js', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.send(
      [
        '(function () {',
        "  var root = document.getElementById('google-auth-callback');",
        '  if (!root) return;',
        '  try {',
        "    var rawPayload = root.getAttribute('data-payload') || '{}';",
        "    var targetOrigin = root.getAttribute('data-origin') || window.location.origin;",
        '    var payload = JSON.parse(rawPayload);',
        '    if (window.opener && !window.opener.closed) {',
        '      window.opener.postMessage(payload, targetOrigin);',
        '      window.close();',
        '    }',
        '  } catch (_) {}',
        '})();',
      ].join('\n')
    );
  });

  // OIDC authorization code popup callback
  router.get(
    ['/google/callback', '/google/callback/'],
    asyncHandler(async (req, res) => {
      const requestOrigin = resolveRequestOrigin(req);
      const targetOrigin = allowedOriginSet.has(requestOrigin)
        ? requestOrigin
        : config.allowedOrigins[0] || requestOrigin;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      // Override COOP for popup callback so window.opener.postMessage succeeds.
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

      if (!config.googleClientId || !config.googleClientSecret) {
        return res.status(503).send(
          renderGoogleCallbackHtml(
            {
              ok: false,
              code: 'google_code_flow_disabled',
              error: 'تسجيل الدخول عبر Google غير مفعّل حالياً على الخادم',
            },
            targetOrigin
          )
        );
      }

      const rawError = typeof req.query.error === 'string' ? req.query.error : '';
      if (rawError) {
        const canceled = rawError === 'access_denied' || rawError === 'user_cancelled';
        return res.status(400).send(
          renderGoogleCallbackHtml(
            {
              ok: false,
              code: canceled ? 'google_canceled' : 'google_oauth_error',
              error: canceled
                ? 'تم إلغاء تسجيل الدخول عبر Google'
                : 'تعذر إتمام المصادقة عبر Google',
            },
            targetOrigin
          )
        );
      }

      try {
        const statePayload = verifySignedGoogleOAuthState(req.query.state, config.csrfSecret);
        const code = typeof req.query.code === 'string' ? req.query.code : '';
        const redirectUri = resolveGoogleRedirectUri(req);
        const claims = await exchangeGoogleCodeForClaims({
          code,
          clientId: config.googleClientId,
          clientSecret: config.googleClientSecret,
          redirectUri,
          expectedNonce: statePayload.nonce,
          verifier: verifyGoogleToken,
        });

        const authResult = await repo.authenticateWithGoogle({
          claims,
          role: statePayload.role,
          mode: statePayload.mode,
        });

        if (authResult.user.status !== 'active') {
          return res.status(403).send(
            renderGoogleCallbackHtml(
              {
                ok: false,
                code: 'account_suspended',
                error: 'هذا الحساب موقوف، تواصل مع إدارة المنصة',
              },
              targetOrigin
            )
          );
        }

        if (req.auth) await repo.revokeSession(req.auth.session.id);
        const { token } = await repo.createSession({
          userId: authResult.user.id,
          ip: req.ip || 'unknown',
          userAgent: req.header('user-agent'),
          absoluteMs: config.sessionAbsoluteMs,
          maxPerUser: config.maxSessionsPerUser,
        });

        setSessionCookie(res, token);
        return res.status(200).send(
          renderGoogleCallbackHtml(
            {
              ok: true,
              isNewUser: authResult.isNewUser,
              needsProfileCompletion: !authResult.user.phone,
            },
            targetOrigin
          )
        );
      } catch (err) {
        if (err instanceof GoogleAuthError || err instanceof RepositoryError) {
          return res.status(err.status).send(
            renderGoogleCallbackHtml(
              {
                ok: false,
                code: err.code,
                error: err.message,
              },
              targetOrigin
            )
          );
        }
        throw err;
      }
    })
  );

  // Explicit account-linking with proof of ownership (existing Saudi phone + password + verified Google credential)
  router.post(
    '/google/link-with-password',
    asyncHandler(async (req, res) => {
      const ip = req.ip || 'unknown';
      const gate = googleIpLimiter.consume(`ip:${ip}`);
      if (!gate.allowed) return tooMany(res, gate.retryAfterMs);

      if (!config.googleClientId) {
        return res.status(503).json({
          error: 'تسجيل الدخول عبر Google غير مفعّل حالياً على الخادم',
          code: 'google_not_configured',
        });
      }

      const phone = normalizeSaudiMobile(req.body?.phone);
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const credentialInput = typeof req.body?.credential === 'string' ? req.body.credential : '';

      if (!phone || !password || password.length > 256 || !credentialInput.trim()) {
        return res.status(400).json({
          error: 'أدخل رقم الجوال وكلمة المرور ورمز Google لإتمام ربط الحساب',
          code: 'invalid_link_input',
        });
      }

      const phoneKey = `phone:${phone}`;
      const ipKey = `ip:${ip}`;
      const blockedPhone = loginPhoneLimiter.check(phoneKey);
      if (!blockedPhone.allowed) return tooMany(res, blockedPhone.retryAfterMs);
      const blockedIp = loginIpLimiter.check(ipKey);
      if (!blockedIp.allowed) return tooMany(res, blockedIp.retryAfterMs);

      const user = await repo.findUserByPhone(phone);
      const credential = user ? await repo.getCredential(user.id) : undefined;

      let valid = false;
      if (user && credential) {
        valid = await verifyPassword(credential.passwordHash, password);
      } else {
        await verifyAgainstDummy(password);
      }

      if (!valid || !user || !credential) {
        loginPhoneLimiter.hit(phoneKey);
        loginIpLimiter.hit(ipKey);
        return res.status(401).json({
          error: GENERIC_PHONE_LOGIN_ERROR,
          code: 'invalid_credentials',
        });
      }
      if (user.status !== 'active') {
        return res.status(403).json({
          error: 'هذا الحساب موقوف، تواصل مع إدارة المنصة',
          code: 'account_suspended',
        });
      }

      loginPhoneLimiter.reset(phoneKey);
      if (await passwordNeedsRehash(credential.passwordHash)) {
        await repo.updateCredential(user.id, await hashPassword(password));
      }

      const claims = await verifyGoogleToken({
        idToken: credentialInput,
        clientId: config.googleClientId,
      });

      const linked = await repo.linkGoogleIdentity({ userId: user.id, claims });

      if (req.auth) await repo.revokeSession(req.auth.session.id);
      const { token, session } = await repo.createSession({
        userId: linked.user.id,
        ip,
        userAgent: req.header('user-agent'),
        absoluteMs: config.sessionAbsoluteMs,
        maxPerUser: config.maxSessionsPerUser,
      });

      setSessionCookie(res, token);
      const selfUser = toSelfUser(linked.user, {
        googleLinked: linked.googleLinked,
        facebookLinked: linked.facebookLinked,
        hasPassword: linked.hasPassword,
      });

      res.json({
        user: selfUser,
        csrfToken: csrfTokenFor(session.id, config.csrfSecret),
        linked: true,
        needsProfileCompletion: !selfUser?.phone,
      });
    })
  );

  // Authenticated account-linking from Dashboard (requires current password proof if account has a password)
  router.post(
    '/google/link',
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!config.googleClientId) {
        return res.status(503).json({
          error: 'ربط حساب Google غير مفعّل حالياً على الخادم',
          code: 'google_not_configured',
        });
      }

      const credentialInput = typeof req.body?.credential === 'string' ? req.body.credential : '';
      if (!credentialInput.trim()) {
        return res.status(400).json({
          error: 'لم يتم استلام رمز التحقق من Google',
          code: 'missing_credential',
        });
      }

      const existingCred = await repo.getCredential(req.auth!.user.id);
      if (existingCred) {
        const password = typeof req.body?.password === 'string' ? req.body.password : '';
        if (!password || password.length > 256) {
          return res.status(401).json({
            error: 'يرجى إدخال كلمة المرور الحالية لإثبات ملكية الحساب قبل ربطه بـ Google',
            code: 'password_proof_required',
          });
        }
        const ok = await verifyPassword(existingCred.passwordHash, password);
        if (!ok) {
          return res.status(401).json({
            error: 'كلمة المرور الحالية غير صحيحة',
            code: 'invalid_credentials',
          });
        }
      }

      const claims = await verifyGoogleToken({
        idToken: credentialInput,
        clientId: config.googleClientId,
      });

      const linked = await repo.linkGoogleIdentity({
        userId: req.auth!.user.id,
        claims,
      });

      res.json({
        user: toSelfUser(linked.user, {
          googleLinked: linked.googleLinked,
          facebookLinked: linked.facebookLinked,
          hasPassword: linked.hasPassword,
        }),
        linked: true,
      });
    })
  );

  // Facebook OAuth 2.0 popup URL generator
  router.get(
    '/facebook/url',
    asyncHandler(async (req, res) => {
      if (!config.facebookAppId || !config.facebookAppSecret) {
        return res.status(503).json({
          error:
            'تسجيل الدخول عبر Facebook غير مفعّل حالياً على الخادم (يرجى ضبط FACEBOOK_APP_ID و FACEBOOK_APP_SECRET)',
          code: 'facebook_not_configured',
        });
      }

      const role: 'buyer' | 'seller' = req.query.role === 'seller' ? 'seller' : 'buyer';
      const mode: 'login' | 'register' = req.query.mode === 'register' ? 'register' : 'login';
      const intent: 'auth' | 'link' =
        req.query.intent === 'link' && req.auth ? 'link' : 'auth';
      const nonce = crypto.randomBytes(24).toString('base64url');
      const state = createSignedFacebookOAuthState(
        {
          nonce,
          role,
          mode,
          intent,
          ...(intent === 'link' && req.auth ? { userId: req.auth.user.id } : {}),
        },
        config.csrfSecret
      );
      const redirectUri = resolveFacebookRedirectUri(req);

      const url = buildFacebookOAuthUrl({
        appId: config.facebookAppId,
        redirectUri,
        state,
      });

      res.json({ url });
    })
  );

  // CSP-compliant script for Facebook popup OAuth callback page
  router.get('/facebook/callback.js', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.send(
      [
        '(function () {',
        "  var root = document.getElementById('facebook-auth-callback');",
        '  if (!root) return;',
        '  try {',
        "    var rawPayload = root.getAttribute('data-payload') || '{}';",
        "    var targetOrigin = root.getAttribute('data-origin') || window.location.origin;",
        '    var payload = JSON.parse(rawPayload);',
        '    if (window.opener && !window.opener.closed) {',
        '      window.opener.postMessage(payload, targetOrigin);',
        '      window.close();',
        '    }',
        '  } catch (_) {}',
        '})();',
      ].join('\n')
    );
  });

  // Facebook OAuth 2.0 popup callback
  router.get(
    ['/facebook/callback', '/facebook/callback/'],
    asyncHandler(async (req, res) => {
      const requestOrigin = resolveRequestOrigin(req);
      const targetOrigin = allowedOriginSet.has(requestOrigin)
        ? requestOrigin
        : config.allowedOrigins[0] || requestOrigin;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

      if (!config.facebookAppId || !config.facebookAppSecret) {
        return res.status(503).send(
          renderFacebookCallbackHtml(
            {
              ok: false,
              code: 'facebook_not_configured',
              error: 'تسجيل الدخول عبر Facebook غير مفعّل حالياً على الخادم',
            },
            targetOrigin
          )
        );
      }

      const rawError = typeof req.query.error === 'string' ? req.query.error : '';
      if (rawError) {
        const canceled = rawError === 'access_denied' || rawError === 'user_cancelled';
        return res.status(400).send(
          renderFacebookCallbackHtml(
            {
              ok: false,
              code: canceled ? 'facebook_canceled' : 'facebook_oauth_error',
              error: canceled
                ? 'تم إلغاء تسجيل الدخول عبر Facebook'
                : 'تعذر إتمام المصادقة عبر Facebook',
            },
            targetOrigin
          )
        );
      }

      let verifiedClaims: VerifiedFacebookClaims | null = null;
      try {
        const ip = req.ip || 'unknown';
        const gate = facebookIpLimiter.consume(`ip:${ip}`);
        if (!gate.allowed) {
          return res.status(429).send(
            renderFacebookCallbackHtml(
              {
                ok: false,
                code: 'rate_limited',
                error: 'محاولات كثيرة، حاول مرة أخرى لاحقاً',
              },
              targetOrigin
            )
          );
        }

        const statePayload = verifySignedFacebookOAuthState(req.query.state, config.csrfSecret);
        const code = typeof req.query.code === 'string' ? req.query.code : '';
        const redirectUri = resolveFacebookRedirectUri(req);
        verifiedClaims = await exchangeFbCode({
          code,
          appId: config.facebookAppId,
          appSecret: config.facebookAppSecret,
          redirectUri,
        });

        if (statePayload.intent === 'link') {
          const linkToken = createSignedFacebookLinkToken(verifiedClaims, config.csrfSecret);
          return res.status(200).send(
            renderFacebookCallbackHtml(
              {
                ok: true,
                intent: 'link',
                linkToken,
                email: verifiedClaims.email,
              },
              targetOrigin
            )
          );
        }

        const authResult = await repo.authenticateWithFacebook({
          claims: verifiedClaims,
          role: statePayload.role,
          mode: statePayload.mode,
        });

        if (authResult.user.status !== 'active') {
          return res.status(403).send(
            renderFacebookCallbackHtml(
              {
                ok: false,
                code: 'account_suspended',
                error: 'هذا الحساب موقوف، تواصل مع إدارة المنصة',
              },
              targetOrigin
            )
          );
        }

        if (req.auth) await repo.revokeSession(req.auth.session.id);
        const { token } = await repo.createSession({
          userId: authResult.user.id,
          ip,
          userAgent: req.header('user-agent'),
          absoluteMs: config.sessionAbsoluteMs,
          maxPerUser: config.maxSessionsPerUser,
        });

        setSessionCookie(res, token);
        return res.status(200).send(
          renderFacebookCallbackHtml(
            {
              ok: true,
              intent: 'auth',
              isNewUser: authResult.isNewUser,
              needsProfileCompletion: !authResult.user.phone,
            },
            targetOrigin
          )
        );
      } catch (err) {
        if (err instanceof RepositoryError && err.code === 'account_exists_link_required' && verifiedClaims) {
          const linkToken = createSignedFacebookLinkToken(verifiedClaims, config.csrfSecret);
          return res.status(err.status).send(
            renderFacebookCallbackHtml(
              {
                ok: false,
                code: 'account_exists_link_required',
                error: err.message,
                linkToken,
                email: verifiedClaims.email,
              },
              targetOrigin
            )
          );
        }
        if (err instanceof FacebookAuthError || err instanceof RepositoryError) {
          return res.status(err.status).send(
            renderFacebookCallbackHtml(
              {
                ok: false,
                code: err.code,
                error: err.message,
              },
              targetOrigin
            )
          );
        }
        throw err;
      }
    })
  );

  // Explicit account-linking for Facebook with proof of ownership (existing phone OR email + password + signed linkToken)
  router.post(
    '/facebook/link-with-password',
    asyncHandler(async (req, res) => {
      const ip = req.ip || 'unknown';
      const gate = facebookIpLimiter.consume(`ip:${ip}`);
      if (!gate.allowed) return tooMany(res, gate.retryAfterMs);

      const rawPhone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
      const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const linkToken = typeof req.body?.linkToken === 'string' ? req.body.linkToken : '';

      const usingEmail = Boolean(rawEmail && !rawPhone);
      const phone = usingEmail ? null : normalizeSaudiMobile(rawPhone);
      const email = usingEmail ? normalizeEmail(rawEmail) : null;

      if ((!phone && !email) || !password || password.length > 256 || !linkToken.trim()) {
        return res.status(400).json({
          error: 'أدخل رقم الجوال أو البريد الإلكتروني وكلمة المرور لإتمام ربط حساب Facebook',
          code: 'invalid_link_input',
        });
      }

      const identifierKey = email ? `email:${email}` : `phone:${phone}`;
      const ipKey = `ip:${ip}`;
      const blockedIdentifier = loginPhoneLimiter.check(identifierKey);
      if (!blockedIdentifier.allowed) return tooMany(res, blockedIdentifier.retryAfterMs);
      const blockedIp = loginIpLimiter.check(ipKey);
      if (!blockedIp.allowed) return tooMany(res, blockedIp.retryAfterMs);

      const user = email ? await repo.findUserByEmail(email) : await repo.findUserByPhone(phone!);
      const credential = user ? await repo.getCredential(user.id) : undefined;

      let valid = false;
      if (user && credential) {
        valid = await verifyPassword(credential.passwordHash, password);
      } else {
        await verifyAgainstDummy(password);
      }

      if (!valid || !user || !credential) {
        loginPhoneLimiter.hit(identifierKey);
        loginIpLimiter.hit(ipKey);
        return res.status(401).json({
          error: usingEmail ? GENERIC_EMAIL_LOGIN_ERROR : GENERIC_PHONE_LOGIN_ERROR,
          code: 'invalid_credentials',
        });
      }
      if (user.status !== 'active') {
        return res.status(403).json({
          error: 'هذا الحساب موقوف، تواصل مع إدارة المنصة',
          code: 'account_suspended',
        });
      }

      loginPhoneLimiter.reset(identifierKey);
      if (await passwordNeedsRehash(credential.passwordHash)) {
        await repo.updateCredential(user.id, await hashPassword(password));
      }

      const claims = verifySignedFacebookLinkToken(linkToken, config.csrfSecret);
      const linked = await repo.linkFacebookIdentity({ userId: user.id, claims });

      if (req.auth) await repo.revokeSession(req.auth.session.id);
      const { token, session } = await repo.createSession({
        userId: linked.user.id,
        ip,
        userAgent: req.header('user-agent'),
        absoluteMs: config.sessionAbsoluteMs,
        maxPerUser: config.maxSessionsPerUser,
      });

      setSessionCookie(res, token);
      const selfUser = toSelfUser(linked.user, {
        googleLinked: linked.googleLinked,
        facebookLinked: linked.facebookLinked,
        hasPassword: linked.hasPassword,
      });

      res.json({
        user: selfUser,
        csrfToken: csrfTokenFor(session.id, config.csrfSecret),
        linked: true,
        needsProfileCompletion: !selfUser?.phone,
      });
    })
  );

  // Authenticated Facebook account linking (from Dashboard)
  router.post(
    '/facebook/link',
    requireAuth,
    asyncHandler(async (req, res) => {
      const linkToken = typeof req.body?.linkToken === 'string' ? req.body.linkToken : '';
      if (!linkToken.trim()) {
        return res.status(400).json({
          error: 'لم يتم استلام رمز التحقق من Facebook',
          code: 'missing_link_token',
        });
      }

      const existingCred = await repo.getCredential(req.auth!.user.id);
      if (existingCred) {
        const password = typeof req.body?.password === 'string' ? req.body.password : '';
        if (!password || password.length > 256) {
          return res.status(401).json({
            error: 'يرجى إدخال كلمة المرور الحالية لإثبات ملكية الحساب قبل ربطه بـ Facebook',
            code: 'password_proof_required',
          });
        }
        const ok = await verifyPassword(existingCred.passwordHash, password);
        if (!ok) {
          return res.status(401).json({
            error: 'كلمة المرور الحالية غير صحيحة',
            code: 'invalid_credentials',
          });
        }
      }

      const claims = verifySignedFacebookLinkToken(linkToken, config.csrfSecret);
      const linked = await repo.linkFacebookIdentity({
        userId: req.auth!.user.id,
        claims,
      });

      res.json({
        user: toSelfUser(linked.user, {
          googleLinked: linked.googleLinked,
          facebookLinked: linked.facebookLinked,
          hasPassword: linked.hasPassword,
        }),
        linked: true,
      });
    })
  );

  // "إكمال بيانات الحساب": collects Saudi mobile (without forging OTP verification)
  router.post(
    '/complete-profile',
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = req.body || {};
      const phone = normalizeSaudiMobile(body.phone);
      if (!phone) {
        return res.status(400).json({
          error: 'رقم الجوال غير صحيح، استخدم صيغة 05XXXXXXXX',
          code: 'invalid_phone',
        });
      }

      let cleanName: string | undefined;
      if (typeof body.name === 'string' && body.name.trim()) {
        const trimmed = body.name.trim();
        if (trimmed.length < 2 || trimmed.length > 80) {
          return res.status(400).json({
            error: 'يرجى إدخال اسم صحيح بين حرفين و80 حرفاً',
            code: 'invalid_name',
          });
        }
        cleanName = trimmed;
      }

      const role: 'buyer' | 'seller' | undefined =
        body.role === 'seller' ? 'seller' : body.role === 'buyer' ? 'buyer' : undefined;

      const completed = await repo.completeUserProfile({
        userId: req.auth!.user.id,
        phone,
        name: cleanName,
        role,
      });

      res.json({
        user: toSelfUser(completed.user, {
          googleLinked: completed.googleLinked,
          facebookLinked: completed.facebookLinked,
          hasPassword: completed.hasPassword,
        }),
        needsProfileCompletion: false,
      });
    })
  );

  router.post(
    '/logout',
    asyncHandler(async (req, res) => {
      if (req.auth) await repo.revokeSession(req.auth.session.id);
      res.setHeader('Set-Cookie', serializeClearCookie(config.cookieName, config.cookieSecure));
      res.json({ ok: true });
    })
  );

  router.post(
    '/logout-all',
    requireAuth,
    asyncHandler(async (req, res) => {
      await repo.revokeAllSessionsForUser(req.auth!.user.id);
      res.setHeader('Set-Cookie', serializeClearCookie(config.cookieName, config.cookieSecure));
      res.json({ ok: true });
    })
  );

  router.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (res.headersSent) return next(err);
      if (err instanceof GoogleAuthError || err instanceof FacebookAuthError || err instanceof RepositoryError) {
        return res.status(err.status).json({
          error: err.message,
          ...(err.code ? { code: err.code } : {}),
        });
      }
      return next(err);
    }
  );

  return router;
}
