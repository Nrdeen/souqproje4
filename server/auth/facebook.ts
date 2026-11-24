import crypto from 'node:crypto';
import { normalizeEmail } from './phone';

const FACEBOOK_GRAPH_VERSION = 'v21.0';
const FACEBOOK_OAUTH_DIALOG = `https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth`;
const FACEBOOK_GRAPH_BASE = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}`;

export interface VerifiedFacebookClaims {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string;
  picture?: string;
}

export class FacebookAuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'FacebookAuthError';
  }
}

export type FacebookFetchLike = typeof fetch;

export function computeFacebookAppSecretProof(accessToken: string, appSecret: string): string {
  return crypto.createHmac('sha256', appSecret).update(accessToken).digest('hex');
}

export interface SignedFacebookOAuthStatePayload {
  nonce: string;
  role: 'buyer' | 'seller';
  mode: 'login' | 'register';
  intent: 'auth' | 'link';
  userId?: string;
  exp: number;
}

function signEncodedPayload(payload: unknown, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyAndDecodeSignedPayload(token: unknown, secret: string, errorCodePrefix: string): any {
  if (typeof token !== 'string' || !token.includes('.')) {
    throw new FacebookAuthError(
      400,
      'بيانات التحقق من جلسة Facebook غير صالحة أو مفقودة',
      `invalid_${errorCodePrefix}`
    );
  }
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new FacebookAuthError(
      400,
      'بيانات التحقق من جلسة Facebook غير صالحة',
      `invalid_${errorCodePrefix}`
    );
  }
  const [encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new FacebookAuthError(
      401,
      'فشل التحقق الأمني من جلسة Facebook',
      `invalid_${errorCodePrefix}`
    );
  }

  let parsed: any;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new FacebookAuthError(
      400,
      'تعذر قراءة بيانات جلسة Facebook',
      `invalid_${errorCodePrefix}`
    );
  }

  if (!parsed || typeof parsed.exp !== 'number' || parsed.exp <= Date.now()) {
    throw new FacebookAuthError(
      401,
      'انتهت صلاحية نافذة التحقق من Facebook، يرجى المحاولة مرة أخرى',
      `expired_${errorCodePrefix}`
    );
  }

  return parsed;
}

export function createSignedFacebookOAuthState(
  payload: Omit<SignedFacebookOAuthStatePayload, 'exp'>,
  secret: string,
  ttlMs = 10 * 60_000
): string {
  const full: SignedFacebookOAuthStatePayload = {
    ...payload,
    exp: Date.now() + ttlMs,
  };
  return signEncodedPayload(full, secret);
}

export function verifySignedFacebookOAuthState(
  stateToken: unknown,
  secret: string
): SignedFacebookOAuthStatePayload {
  const parsed = verifyAndDecodeSignedPayload(stateToken, secret, 'oauth_state');
  if (typeof parsed.nonce !== 'string' || !parsed.nonce) {
    throw new FacebookAuthError(
      400,
      'حالة التحقق من Facebook غير مكتملة',
      'invalid_oauth_state'
    );
  }
  return {
    nonce: parsed.nonce,
    role: parsed.role === 'seller' ? 'seller' : 'buyer',
    mode: parsed.mode === 'register' ? 'register' : 'login',
    intent: parsed.intent === 'link' ? 'link' : 'auth',
    ...(typeof parsed.userId === 'string' && parsed.userId ? { userId: parsed.userId } : {}),
    exp: parsed.exp,
  };
}

export function createSignedFacebookLinkToken(
  claims: VerifiedFacebookClaims,
  secret: string,
  ttlMs = 10 * 60_000
): string {
  return signEncodedPayload(
    {
      purpose: 'fb_link_v1',
      claims,
      exp: Date.now() + ttlMs,
    },
    secret
  );
}

export function verifySignedFacebookLinkToken(
  token: unknown,
  secret: string
): VerifiedFacebookClaims {
  const parsed = verifyAndDecodeSignedPayload(token, secret, 'link_token');
  if (
    parsed.purpose !== 'fb_link_v1' ||
    !parsed.claims ||
    typeof parsed.claims.sub !== 'string' ||
    !parsed.claims.sub.trim()
  ) {
    throw new FacebookAuthError(
      401,
      'رمز ربط حساب Facebook غير صالح، أعد تسجيل الدخول عبر Facebook',
      'invalid_link_token'
    );
  }
  const cleanSub = parsed.claims.sub.trim().slice(0, 128);
  const cleanEmail = parsed.claims.email ? normalizeEmail(parsed.claims.email) : null;
  const cleanName =
    typeof parsed.claims.name === 'string' && parsed.claims.name.trim().length >= 2
      ? parsed.claims.name.trim().slice(0, 80)
      : 'مستخدم Facebook';
  const cleanPicture =
    typeof parsed.claims.picture === 'string' && /^https:\/\//i.test(parsed.claims.picture)
      ? parsed.claims.picture.slice(0, 500)
      : undefined;

  return {
    sub: cleanSub,
    email: cleanEmail,
    emailVerified: Boolean(cleanEmail && parsed.claims.emailVerified),
    name: cleanName,
    ...(cleanPicture ? { picture: cleanPicture } : {}),
  };
}

export function buildFacebookOAuthUrl(params: {
  appId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(FACEBOOK_OAUTH_DIALOG);
  url.searchParams.set('client_id', params.appId.trim());
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('state', params.state);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'email,public_profile');
  return url.toString();
}

export function normalizeFacebookGraphProfile(
  profile: Record<string, any> | null | undefined
): VerifiedFacebookClaims {
  if (!profile || typeof profile !== 'object') {
    throw new FacebookAuthError(
      401,
      'تعذر قراءة بيانات الملف الشخصي من Facebook',
      'invalid_facebook_profile'
    );
  }
  const sub = typeof profile.id === 'string' ? profile.id.trim() : '';
  if (!sub || sub.length > 128) {
    throw new FacebookAuthError(
      400,
      'لم يوفر حساب Facebook معرف المستخدم المطلوب',
      'missing_profile_claims'
    );
  }

  const email = normalizeEmail(profile.email);
  const rawName = typeof profile.name === 'string' ? profile.name : '';
  const cleanName = rawName.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
  const resolvedName =
    cleanName.length >= 2
      ? cleanName
      : email
      ? email.split('@')[0].slice(0, 80) || 'مستخدم Facebook'
      : 'مستخدم Facebook';

  const picUrl =
    typeof profile.picture?.data?.url === 'string' &&
    /^https:\/\//i.test(profile.picture.data.url.trim())
      ? profile.picture.data.url.trim().slice(0, 500)
      : undefined;

  return {
    sub,
    email,
    emailVerified: Boolean(email),
    name: resolvedName,
    ...(picUrl ? { picture: picUrl } : {}),
  };
}

async function fetchJsonSafe(
  url: string,
  fetchImpl: FacebookFetchLike,
  failureMessage: string
): Promise<any> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new FacebookAuthError(
      503,
      'تعذر الوصول إلى خوادم Facebook حالياً، حاول مرة أخرى بعد قليل',
      'facebook_verification_unavailable'
    );
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok || data?.error) {
    const fbMsg = typeof data?.error?.message === 'string' ? data.error.message.toLowerCase() : '';
    if (fbMsg.includes('expired')) {
      throw new FacebookAuthError(
        401,
        'انتهت صلاحية جلسة التحقق من Facebook، يرجى المحاولة مرة أخرى',
        'expired_facebook_token'
      );
    }
    throw new FacebookAuthError(
      res.status >= 500 ? 503 : 401,
      failureMessage,
      'facebook_oauth_failed'
    );
  }

  return data;
}

export async function exchangeFacebookCodeForClaims(params: {
  code: string;
  appId: string;
  appSecret: string;
  redirectUri: string;
  fetchImpl?: FacebookFetchLike;
}): Promise<VerifiedFacebookClaims> {
  const cleanCode = params.code.trim();
  if (!cleanCode) {
    throw new FacebookAuthError(400, 'رمز التفويض من Facebook مفقود', 'missing_oauth_code');
  }
  const cleanAppId = params.appId.trim();
  const cleanSecret = params.appSecret.trim();
  if (!cleanAppId || !cleanSecret) {
    throw new FacebookAuthError(
      503,
      'تسجيل الدخول عبر Facebook غير مفعّل حالياً على الخادم',
      'facebook_not_configured'
    );
  }

  const fetchImpl = params.fetchImpl || fetch;

  const tokenUrl = new URL(`${FACEBOOK_GRAPH_BASE}/oauth/access_token`);
  tokenUrl.searchParams.set('client_id', cleanAppId);
  tokenUrl.searchParams.set('redirect_uri', params.redirectUri);
  tokenUrl.searchParams.set('client_secret', cleanSecret);
  tokenUrl.searchParams.set('code', cleanCode);

  const tokenPayload = await fetchJsonSafe(
    tokenUrl.toString(),
    fetchImpl,
    'تعذر إتمام المصادقة عبر Facebook، حاول مرة أخرى'
  );
  const accessToken =
    typeof tokenPayload?.access_token === 'string' ? tokenPayload.access_token.trim() : '';
  if (!accessToken) {
    throw new FacebookAuthError(
      401,
      'لم يعد خادم Facebook برمز وصول صالح',
      'invalid_facebook_token'
    );
  }

  const debugUrl = new URL(`${FACEBOOK_GRAPH_BASE}/debug_token`);
  debugUrl.searchParams.set('input_token', accessToken);
  debugUrl.searchParams.set('access_token', `${cleanAppId}|${cleanSecret}`);

  const debugPayload = await fetchJsonSafe(
    debugUrl.toString(),
    fetchImpl,
    'تعذر التحقق من صلاحية رمز Facebook'
  );
  const debugData = debugPayload?.data;
  if (!debugData || debugData.is_valid !== true || String(debugData.app_id) !== cleanAppId) {
    throw new FacebookAuthError(
      401,
      'رمز المصادقة من Facebook لا يخص هذا التطبيق أو منتهي الصلاحية',
      'invalid_facebook_audience'
    );
  }

  const proof = computeFacebookAppSecretProof(accessToken, cleanSecret);
  const meUrl = new URL(`${FACEBOOK_GRAPH_BASE}/me`);
  meUrl.searchParams.set('fields', 'id,name,email,picture.type(large)');
  meUrl.searchParams.set('access_token', accessToken);
  meUrl.searchParams.set('appsecret_proof', proof);

  const mePayload = await fetchJsonSafe(
    meUrl.toString(),
    fetchImpl,
    'تعذر جلب بيانات الحساب من Facebook'
  );

  return normalizeFacebookGraphProfile(mePayload);
}
