import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';

export const GOOGLE_VALID_ISSUERS = new Set([
  'accounts.google.com',
  'https://accounts.google.com',
]);

export interface VerifiedGoogleClaims {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
}

export class GoogleAuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

export type GoogleIdTokenVerifier = (params: {
  idToken: string;
  clientId: string;
  expectedNonce?: string;
}) => Promise<VerifiedGoogleClaims>;

const cachedClients = new Map<string, OAuth2Client>();

function getOAuthClient(clientId: string, clientSecret?: string, redirectUri?: string): OAuth2Client {
  const key = `${clientId}::${clientSecret || ''}::${redirectUri || ''}`;
  let client = cachedClients.get(key);
  if (!client) {
    client = new OAuth2Client(clientId, clientSecret, redirectUri);
    cachedClients.set(key, client);
  }
  return client;
}

export function validateVerifiedGooglePayload(
  payload: Record<string, any> | undefined | null,
  expectedClientId: string,
  expectedNonce?: string
): VerifiedGoogleClaims {
  if (!payload || typeof payload !== 'object') {
    throw new GoogleAuthError(401, 'رمز التحقق من Google غير صالح', 'invalid_google_token');
  }

  const cleanClientId = typeof expectedClientId === 'string' ? expectedClientId.trim() : '';
  if (!cleanClientId) {
    throw new GoogleAuthError(
      503,
      'تسجيل الدخول عبر Google غير مفعّل حالياً على الخادم',
      'google_not_configured'
    );
  }

  const iss = typeof payload.iss === 'string' ? payload.iss.trim() : '';
  if (!GOOGLE_VALID_ISSUERS.has(iss)) {
    throw new GoogleAuthError(401, 'مصدر المصادقة من Google غير موثوق', 'invalid_issuer');
  }

  const aud = payload.aud;
  const audMatches = Array.isArray(aud)
    ? aud.includes(cleanClientId)
    : typeof aud === 'string' && aud === cleanClientId;
  if (!audMatches) {
    throw new GoogleAuthError(
      401,
      'تعذر مطابقة تطبيق Google المصرح به لهذه المنصة',
      'invalid_audience'
    );
  }

  const azp = typeof payload.azp === 'string' ? payload.azp.trim() : '';
  if (azp && azp !== cleanClientId) {
    throw new GoogleAuthError(
      401,
      'تعذر مطابقة تطبيق Google المصرح به لهذه المنصة',
      'invalid_audience'
    );
  }

  const exp = typeof payload.exp === 'number' ? payload.exp : Number(payload.exp);
  if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) {
    throw new GoogleAuthError(
      401,
      'انتهت صلاحية جلسة التحقق من Google، يرجى المحاولة مرة أخرى',
      'expired_google_token'
    );
  }

  if (expectedNonce && payload.nonce !== expectedNonce) {
    throw new GoogleAuthError(
      401,
      'فشل التحقق الأمني من جلسة Google، حاول تسجيل الدخول مجدداً',
      'invalid_nonce'
    );
  }

  const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  const rawEmail = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!sub || !rawEmail || !rawEmail.includes('@')) {
    throw new GoogleAuthError(
      400,
      'حساب Google لا يوفر بيانات التعريف أو البريد الإلكتروني المطلوبة',
      'missing_profile_claims'
    );
  }

  if (payload.email_verified !== true) {
    throw new GoogleAuthError(
      403,
      'يجب أن يكون البريد الإلكتروني لحساب Google موثقاً للمتابعة',
      'unverified_google_email'
    );
  }

  const fallbackName = rawEmail.split('@')[0] || 'مستخدم';
  const rawName =
    typeof payload.name === 'string' && payload.name.trim()
      ? payload.name.trim()
      : typeof payload.given_name === 'string' && payload.given_name.trim()
      ? payload.given_name.trim()
      : fallbackName;

  const cleanName = rawName.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
  if (cleanName.length < 2) {
    throw new GoogleAuthError(
      400,
      'الاسم المسجل في حساب Google غير مكتمل للمتابعة',
      'missing_profile_claims'
    );
  }

  const picture =
    typeof payload.picture === 'string' && /^https:\/\//i.test(payload.picture.trim())
      ? payload.picture.trim().slice(0, 500)
      : undefined;

  return {
    sub,
    email: rawEmail.slice(0, 255),
    emailVerified: true,
    name: cleanName,
    ...(picture ? { picture } : {}),
  };
}

function classifyGoogleVerificationError(err: unknown): GoogleAuthError {
  if (err instanceof GoogleAuthError) return err;
  const msg = err instanceof Error ? err.message : String(err || '');
  const lower = msg.toLowerCase();

  if (lower.includes('used too late') || lower.includes('expired')) {
    return new GoogleAuthError(
      401,
      'انتهت صلاحية جلسة التحقق من Google، يرجى المحاولة مرة أخرى',
      'expired_google_token'
    );
  }
  if (lower.includes('wrong recipient') || lower.includes('audience')) {
    return new GoogleAuthError(
      401,
      'تعذر مطابقة تطبيق Google المصرح به لهذه المنصة',
      'invalid_audience'
    );
  }
  if (lower.includes('issuer')) {
    return new GoogleAuthError(401, 'مصدر المصادقة من Google غير موثوق', 'invalid_issuer');
  }
  if (
    lower.includes('enotfound') ||
    lower.includes('econnrefused') ||
    lower.includes('etimedout') ||
    lower.includes('fetch failed') ||
    lower.includes('network') ||
    lower.includes('certificate')
  ) {
    return new GoogleAuthError(
      503,
      'تعذر الوصول إلى خوادم التحقق من Google حالياً، حاول مرة أخرى بعد قليل',
      'google_verification_unavailable'
    );
  }
  return new GoogleAuthError(
    401,
    'تعذر التحقق من بيانات تسجيل الدخول عبر Google، يرجى المحاولة مجدداً',
    'invalid_google_token'
  );
}

export const verifyGoogleIdTokenWithLibrary: GoogleIdTokenVerifier = async ({
  idToken,
  clientId,
  expectedNonce,
}) => {
  const cleanClientId = typeof clientId === 'string' ? clientId.trim() : '';
  if (!cleanClientId) {
    throw new GoogleAuthError(
      503,
      'تسجيل الدخول عبر Google غير مفعّل حالياً على الخادم',
      'google_not_configured'
    );
  }
  if (typeof idToken !== 'string' || !idToken.trim()) {
    throw new GoogleAuthError(400, 'لم يتم استلام رمز التحقق من Google', 'missing_credential');
  }
  const cleanToken = idToken.trim();
  if (cleanToken.length > 8192) {
    throw new GoogleAuthError(401, 'رمز التحقق من Google غير صالح', 'invalid_google_token');
  }

  try {
    const client = getOAuthClient(cleanClientId);
    const ticket = await client.verifyIdToken({
      idToken: cleanToken,
      audience: cleanClientId,
    });
    const payload = ticket.getPayload();
    return validateVerifiedGooglePayload(payload, cleanClientId, expectedNonce);
  } catch (err) {
    throw classifyGoogleVerificationError(err);
  }
};

export interface SignedGoogleOAuthStatePayload {
  nonce: string;
  role: 'buyer' | 'seller';
  mode: 'login' | 'register';
  exp: number;
}

export function createSignedGoogleOAuthState(
  payload: Omit<SignedGoogleOAuthStatePayload, 'exp'>,
  secret: string,
  ttlMs = 10 * 60_000
): string {
  const full: SignedGoogleOAuthStatePayload = {
    ...payload,
    exp: Date.now() + ttlMs,
  };
  const encoded = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySignedGoogleOAuthState(
  stateToken: unknown,
  secret: string
): SignedGoogleOAuthStatePayload {
  if (typeof stateToken !== 'string' || !stateToken.includes('.')) {
    throw new GoogleAuthError(400, 'حالة التحقق من Google غير صالحة أو مفقودة', 'invalid_oauth_state');
  }
  const parts = stateToken.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new GoogleAuthError(400, 'حالة التحقق من Google غير صالحة', 'invalid_oauth_state');
  }
  const [encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new GoogleAuthError(401, 'فشل التحقق من أمان طلب Google', 'invalid_oauth_state');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new GoogleAuthError(400, 'تعذر قراءة حالة المصادقة من Google', 'invalid_oauth_state');
  }

  if (
    !parsed ||
    typeof parsed.nonce !== 'string' ||
    !parsed.nonce ||
    typeof parsed.exp !== 'number' ||
    parsed.exp <= Date.now()
  ) {
    throw new GoogleAuthError(
      401,
      'انتهت صلاحية نافذة تسجيل الدخول عبر Google، أعد المحاولة',
      'expired_oauth_state'
    );
  }

  return {
    nonce: parsed.nonce,
    role: parsed.role === 'seller' ? 'seller' : 'buyer',
    mode: parsed.mode === 'register' ? 'register' : 'login',
    exp: parsed.exp,
  };
}

export function buildGoogleOAuthUrl(params: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  state: string;
  nonce: string;
}): string {
  const client = getOAuthClient(params.clientId, params.clientSecret, params.redirectUri);
  return client.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
    state: params.state,
    nonce: params.nonce,
  });
}

export async function exchangeGoogleCodeForClaims(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  expectedNonce?: string;
  verifier?: GoogleIdTokenVerifier;
}): Promise<VerifiedGoogleClaims> {
  if (!params.code.trim()) {
    throw new GoogleAuthError(400, 'رمز التفويض من Google مفقود', 'missing_oauth_code');
  }
  const client = getOAuthClient(params.clientId, params.clientSecret, params.redirectUri);
  let idToken: string | undefined | null;
  try {
    const tokenRes = await client.getToken({
      code: params.code.trim(),
      redirect_uri: params.redirectUri,
    });
    idToken = tokenRes.tokens?.id_token;
  } catch (err) {
    throw classifyGoogleVerificationError(err);
  }
  if (!idToken) {
    throw new GoogleAuthError(
      401,
      'لم يعد خادم Google برمز هوية صالح (id_token)',
      'invalid_google_token'
    );
  }
  const verifyFn = params.verifier || verifyGoogleIdTokenWithLibrary;
  return verifyFn({
    idToken,
    clientId: params.clientId,
    expectedNonce: params.expectedNonce,
  });
}
