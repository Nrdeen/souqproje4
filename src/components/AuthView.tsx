import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Link2,
  Loader2,
  Lock,
  MessageSquare,
  Phone,
  ShieldCheck,
  ShoppingBag,
  Store,
  User as UserIcon,
} from 'lucide-react';
import { ApiError, api, setCsrfToken } from '../lib/api';
import {
  loadGoogleIdentityScript,
  openGoogleOAuthPopup,
  promptGoogleOneTap,
  renderGoogleOfficialButton,
} from '../lib/google-auth';
import {
  normalizeSaudiMobileClient,
  validatePasswordClient,
} from '../lib/auth-validation';
import type { AuthMode } from '../lib/router';
import type { GoogleAuthConfig, User } from '../types/marketplace';

export interface GoogleAuthSuccessPayload {
  user?: User;
  csrfToken?: string | null;
  isNewUser?: boolean;
  needsProfileCompletion?: boolean;
}

interface AuthViewProps {
  /** Shown when the visitor was sent here because an action needs an account. */
  reason?: string;
  initialMode?: AuthMode;
  onModeChange?: (mode: AuthMode) => void;
  googleAuth?: GoogleAuthConfig;
  onGoogleSuccess?: (payload: GoogleAuthSuccessPayload) => Promise<void> | void;
  onLogin: (phone: string, password: string) => Promise<void>;
  onRegister: (
    name: string,
    phone: string,
    password: string,
    role: 'buyer' | 'seller'
  ) => Promise<void>;
  onGoHome?: () => void;
}

const fieldCls =
  'w-full h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/75 focus:outline-none focus:border-[var(--color-green-ink)] focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/50 transition-colors';

function GoogleOfficialLogo() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3.01h3.88c2.27-2.09 3.54-5.17 3.54-8.88Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.94-2.9l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.96H1.28v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.28V6.61H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l4-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.76c1.76 0 3.34.61 4.58 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4 3.11c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

export function AuthView({
  reason,
  initialMode = 'login',
  onModeChange,
  googleAuth,
  onGoogleSuccess,
  onLogin,
  onRegister,
  onGoHome,
}: AuthViewProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<'buyer' | 'seller'>('buyer');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [resolvedGoogleConfig, setResolvedGoogleConfig] = useState<GoogleAuthConfig | null>(
    googleAuth ?? null
  );
  const [googleBusy, setGoogleBusy] = useState(false);
  const [showOfficialGisFallback, setShowOfficialGisFallback] = useState(false);
  const officialGisContainerRef = useRef<HTMLDivElement | null>(null);

  const [pendingLinkCredential, setPendingLinkCredential] = useState<string | null>(null);
  const [linkPhone, setLinkPhone] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);

  const activeGoogleConfig = googleAuth ?? resolvedGoogleConfig;
  const googleClientId = activeGoogleConfig?.clientId?.trim() || '';
  const isGoogleReady = Boolean(googleClientId && activeGoogleConfig?.enabled !== false);

  useEffect(() => {
    setMode(initialMode);
    setError('');
  }, [initialMode]);

  useEffect(() => {
    if (googleAuth) {
      setResolvedGoogleConfig(googleAuth);
      return;
    }
    let cancelled = false;
    api
      .getGoogleAuthConfig()
      .then((cfg) => {
        if (!cancelled) setResolvedGoogleConfig(cfg);
      })
      .catch(() => {
        // Leave null; click handler will report clear Arabic guidance
      });
    return () => {
      cancelled = true;
    };
  }, [googleAuth]);

  useEffect(() => {
    if (isGoogleReady) {
      loadGoogleIdentityScript().catch(() => {
        // Preload is best-effort; click flow handles network errors cleanly
      });
    }
  }, [isGoogleReady, googleClientId]);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError('');
    setPendingLinkCredential(null);
    setShowOfficialGisFallback(false);
    onModeChange?.(nextMode);
  };

  const normalizedPhone = normalizeSaudiMobileClient(phone);
  const phoneTouched = phone.trim().length > 0;
  const phoneValid = Boolean(normalizedPhone);

  const submitGoogleCredential = useCallback(
    async (credential: string) => {
      setError('');
      setGoogleBusy(true);
      try {
        const res = await api.loginWithGoogle({
          credential,
          role: mode === 'register' ? role : undefined,
          mode,
        });
        setCsrfToken(res.csrfToken);
        setPendingLinkCredential(null);
        setShowOfficialGisFallback(false);
        await onGoogleSuccess?.({
          user: res.user,
          csrfToken: res.csrfToken,
          isNewUser: res.isNewUser,
          needsProfileCompletion: res.needsProfileCompletion,
        });
      } catch (err: any) {
        if (err instanceof ApiError && err.code === 'account_exists_link_required') {
          setPendingLinkCredential(credential);
          setLinkPhone(normalizedPhone || '');
          setLinkPassword('');
          setShowOfficialGisFallback(false);
          setError(
            err.message ||
              'يوجد حساب مسجل مسبقاً بهذا البريد الإلكتروني. يرجى إثبات ملكيته برقم الجوال وكلمة المرور لإتمام الربط.'
          );
          return;
        }
        setError(err?.message || 'تعذر إتمام تسجيل الدخول عبر Google');
      } finally {
        setGoogleBusy(false);
      }
    },
    [mode, role, normalizedPhone, onGoogleSuccess]
  );

  useEffect(() => {
    if (!showOfficialGisFallback || !officialGisContainerRef.current || !isGoogleReady) {
      return;
    }
    const isDark =
      typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    renderGoogleOfficialButton({
      container: officialGisContainerRef.current,
      clientId: googleClientId,
      mode,
      isDark,
      onCredential: (credential) => {
        void submitGoogleCredential(credential);
      },
    }).catch((err: any) => {
      setError(err?.message || 'تعذر تحميل زر Google الرسمي');
    });
  }, [showOfficialGisFallback, isGoogleReady, googleClientId, mode, submitGoogleCredential]);

  const handleGoogleContinue = async () => {
    if (busy || googleBusy || linkBusy) return;
    setError('');
    setPendingLinkCredential(null);

    let cfg = activeGoogleConfig;
    if (!cfg || (!cfg.clientId && cfg.enabled !== false)) {
      setGoogleBusy(true);
      try {
        cfg = await api.getGoogleAuthConfig();
        setResolvedGoogleConfig(cfg);
      } catch (err: any) {
        setGoogleBusy(false);
        setError(err?.message || 'تعذر التحقق من إعدادات تسجيل الدخول عبر Google');
        return;
      }
      setGoogleBusy(false);
    }

    const clientId = cfg?.clientId?.trim() || '';
    if (!clientId || cfg?.enabled === false) {
      setError(
        'تسجيل الدخول عبر Google غير مفعّل حالياً في إعدادات الخادم (GOOGLE_CLIENT_ID غير مضبوط).'
      );
      return;
    }

    setGoogleBusy(true);
    try {
      const outcome = await promptGoogleOneTap(clientId);
      if (outcome.kind === 'credential') {
        await submitGoogleCredential(outcome.credential);
        return;
      }
      if (outcome.kind === 'canceled') {
        setError(outcome.message);
        return;
      }

      // One Tap suppressed or skipped by browser (FedCM / cooldown / privacy settings):
      if (cfg.codeFlowEnabled) {
        const { url } = await api.getGoogleOAuthUrl({
          role: mode === 'register' ? role : undefined,
          mode,
        });
        const popupResult = await openGoogleOAuthPopup(url);
        if (popupResult.ok) {
          setShowOfficialGisFallback(false);
          await onGoogleSuccess?.({
            isNewUser: popupResult.isNewUser,
            needsProfileCompletion: popupResult.needsProfileCompletion,
          });
          return;
        }
        if (popupResult.code === 'popup_blocked') {
          setShowOfficialGisFallback(true);
        }
        setError(popupResult.error);
        return;
      }

      // Without server client secret, fall back cleanly to official Google Identity button
      setShowOfficialGisFallback(true);
    } catch (err: any) {
      setError(err?.message || 'تعذر بدء المصادقة عبر Google');
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleConfirmAccountLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingLinkCredential || linkBusy) return;
    setError('');

    const cleanedPhone = normalizeSaudiMobileClient(linkPhone);
    if (!cleanedPhone) {
      setError('أدخل رقم جوال سعودي صحيح بصيغة 05XXXXXXXX لإثبات ملكية الحساب');
      return;
    }
    if (!linkPassword) {
      setError('أدخل كلمة المرور الخاصة بحسابك الحالي لتأكيد الربط');
      return;
    }

    setLinkBusy(true);
    try {
      const res = await api.linkGoogleWithPassword({
        phone: cleanedPhone,
        password: linkPassword,
        credential: pendingLinkCredential,
      });
      setCsrfToken(res.csrfToken);
      setPendingLinkCredential(null);
      setLinkPassword('');
      await onGoogleSuccess?.({
        user: res.user,
        csrfToken: res.csrfToken,
        needsProfileCompletion: res.needsProfileCompletion,
      });
    } catch (err: any) {
      setError(err?.message || 'تعذر ربط الحساب بـ Google، تحقق من البيانات وحاول مرة أخرى');
    } finally {
      setLinkBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedName = name.trim();
    const cleanedPhone = normalizeSaudiMobileClient(phone);

    if (mode === 'register') {
      if (trimmedName.length < 2 || trimmedName.length > 80) {
        setError('يرجى إدخال الاسم الكامل (حرفان على الأقل)');
        return;
      }
      if (!cleanedPhone) {
        setError('رقم الجوال غير صحيح، استخدم صيغة جوال سعودي مثل 05XXXXXXXX');
        return;
      }
      const pwError = validatePasswordClient(password, cleanedPhone);
      if (pwError) {
        setError(pwError);
        return;
      }
    } else {
      if (!cleanedPhone) {
        setError('أدخل رقم جوال سعودي صحيح بصيغة 05XXXXXXXX');
        return;
      }
      if (!password) {
        setError('أدخل كلمة المرور');
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        await onLogin(cleanedPhone, password);
      } else {
        await onRegister(trimmedName, cleanedPhone, password, role);
      }
      setPassword('');
    } catch (err: any) {
      setError(err?.message || 'تعذر إكمال العملية');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-[var(--color-canvas)] transition-colors">
      {onGoHome && (
        <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 pt-6 sm:pt-8">
          <button
            type="button"
            onClick={onGoHome}
            className="text-sm font-semibold text-[var(--color-green-ink)] hover:underline cursor-pointer"
          >
            العودة إلى الرئيسية
          </button>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Main Auth Card */}
        <div className="lg:col-span-7 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-8 space-y-6">
          {/* Mode Tabs */}
          <div
            role="tablist"
            aria-label="خيارات الحساب"
            className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              onClick={() => switchMode('login')}
              className={`min-h-[44px] sm:min-h-[40px] rounded-lg text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'bg-[var(--color-green)] text-white'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
              }`}
            >
              تسجيل الدخول
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              onClick={() => switchMode('register')}
              className={`min-h-[44px] sm:min-h-[40px] rounded-lg text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'bg-[var(--color-green)] text-white'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
              }`}
            >
              إنشاء حساب جديد
            </button>
          </div>

          <div className="space-y-2">
            <h2 className="font-display text-xl sm:text-2xl font-extrabold text-[var(--color-ink)]">
              {mode === 'login' ? 'تسجيل الدخول إلى حسابك' : 'إنشاء حساب جديد في سوق الغنم'}
            </h2>
            {reason ? (
              <div
                role="status"
                className="rounded-xl border border-[var(--color-gold)]/50 bg-[var(--color-cream)] px-3.5 py-2.5 text-xs sm:text-sm font-medium text-[var(--color-ink)] flex items-start gap-2"
              >
                <ShieldCheck
                  size={16}
                  className="text-[var(--color-green-ink)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <span>{reason}</span>
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-[var(--color-muted)] leading-relaxed">
                {mode === 'login'
                  ? 'ادخل برقم الجوال السعودي وكلمة المرور أو عبر حسابك في Google للوصول إلى لوحة حسابك وعروض السوم والمحادثات.'
                  : 'أنشئ حساباً جديداً عبر Google أو برقم الجوال السعودي واختر نوع الحساب المناسب لنشاطك في السوق.'}
              </p>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs sm:text-sm text-red-700 dark:text-red-300 leading-relaxed"
            >
              {error}
            </div>
          )}

          {/* Account-Linking Proof-of-Ownership Flow */}
          {pendingLinkCredential && (
            <form
              onSubmit={handleConfirmAccountLink}
              className="rounded-xl border border-[var(--color-gold)]/70 bg-[var(--color-cream)] p-4 sm:p-5 space-y-4"
              noValidate
            >
              <div className="flex items-start gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-green-ink)] flex items-center justify-center shrink-0">
                  <Link2 size={17} aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <h2 className="font-display text-sm sm:text-base font-bold text-[var(--color-ink)]">
                    تأكيد ملكية الحساب الحالي لربطه بـ Google
                  </h2>
                  <p className="text-xs text-[var(--color-muted)] leading-relaxed">
                    حمايةً لبياناتك، لا يتم ربط الحسابات تلقائياً بتطابق البريد الإلكتروني. أدخل رقم الجوال السعودي وكلمة المرور لإتمام الربط بأمان.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="link-account-phone"
                    className="block text-xs font-semibold text-[var(--color-ink)] mb-1"
                  >
                    رقم الجوال السعودي
                  </label>
                  <input
                    id="link-account-phone"
                    type="tel"
                    dir="ltr"
                    placeholder="05XXXXXXXX"
                    value={linkPhone}
                    onChange={(e) => setLinkPhone(e.target.value)}
                    autoComplete="tel"
                    inputMode="tel"
                    required
                    className={`${fieldCls} text-right tabular-nums`}
                  />
                </div>
                <div>
                  <label
                    htmlFor="link-account-password"
                    className="block text-xs font-semibold text-[var(--color-ink)] mb-1"
                  >
                    كلمة المرور الحالية
                  </label>
                  <input
                    id="link-account-password"
                    type="password"
                    placeholder="أدخل كلمة المرور"
                    value={linkPassword}
                    onChange={(e) => setLinkPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    className={fieldCls}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="submit"
                  disabled={linkBusy}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  {linkBusy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                  <span>{linkBusy ? 'جاري التحقق والربط...' : 'تأكيد الربط وتسجيل الدخول'}</span>
                </button>
                <button
                  type="button"
                  disabled={linkBusy}
                  onClick={() => {
                    setPendingLinkCredential(null);
                    setLinkPassword('');
                    setError('');
                  }}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream-hover)] text-xs sm:text-sm font-semibold text-[var(--color-ink)] cursor-pointer transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          )}

          {/* Google Authentication Section (Login & Registration) */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleGoogleContinue}
              disabled={busy || googleBusy || linkBusy}
              aria-busy={googleBusy}
              className="w-full min-h-[44px] h-11 px-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)] hover:border-[var(--color-gold)] disabled:opacity-60 text-sm font-semibold text-[var(--color-ink)] inline-flex items-center justify-center gap-2.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/50 shadow-2xs"
            >
              {googleBusy ? (
                <>
                  <Loader2
                    size={17}
                    className="animate-spin text-[var(--color-green-ink)] shrink-0"
                    aria-hidden="true"
                  />
                  <span className="whitespace-nowrap">جاري التحقق عبر Google...</span>
                </>
              ) : (
                <>
                  <GoogleOfficialLogo />
                  <span className="whitespace-nowrap">المتابعة باستخدام Google</span>
                </>
              )}
            </button>

            {showOfficialGisFallback && isGoogleReady && (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/60 p-3 flex flex-col items-center gap-2">
                <p className="text-[11px] text-[var(--color-muted)] text-center">
                  اختر حسابك مباشرة من زر Google الرسمي أدناه:
                </p>
                <div
                  ref={officialGisContainerRef}
                  className="min-h-[44px] flex items-center justify-center w-full"
                />
              </div>
            )}

            <div className="relative flex items-center py-1" aria-hidden="true">
              <div className="flex-grow border-t border-[var(--color-border)]" />
              <span className="shrink-0 mx-3 text-xs font-semibold text-[var(--color-muted)]">
                أو
              </span>
              <div className="flex-grow border-t border-[var(--color-border)]" />
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4" noValidate>
            {mode === 'register' && (
              <div>
                <label
                  htmlFor="auth-name"
                  className="block text-xs font-semibold text-[var(--color-ink)] mb-1.5"
                >
                  الاسم الكامل
                </label>
                <div className="relative">
                  <UserIcon
                    size={16}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="auth-name"
                    type="text"
                    placeholder="مثال: عبدالله القحطاني أو مراح الخير"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    required
                    className={`${fieldCls} pr-10`}
                  />
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label
                  htmlFor="auth-phone"
                  className="block text-xs font-semibold text-[var(--color-ink)]"
                >
                  رقم الجوال السعودي
                </label>
                {phoneTouched && phoneValid && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-green-ink)]">
                    <CheckCircle2 size={13} aria-hidden="true" />
                    <span>صيغة صحيحة</span>
                  </span>
                )}
              </div>
              <div className="relative">
                <Phone
                  size={16}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="auth-phone"
                  type="tel"
                  dir="ltr"
                  placeholder="05XXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  inputMode="tel"
                  aria-describedby="auth-phone-hint"
                  aria-invalid={phoneTouched && !phoneValid ? true : undefined}
                  required
                  className={`${fieldCls} pr-10 text-right tabular-nums ${
                    phoneTouched && !phoneValid
                      ? 'border-red-400 focus:border-red-600'
                      : ''
                  }`}
                />
              </div>
              <p
                id="auth-phone-hint"
                className={`mt-1.5 text-[11px] leading-relaxed ${
                  phoneTouched && !phoneValid
                    ? 'text-red-700 dark:text-red-400 font-medium'
                    : 'text-[var(--color-muted)]'
                }`}
              >
                صيغة الجوال السعودي: 10 أرقام تبدأ بـ{' '}
                <span className="tabular-nums font-semibold">05</span> (مثل{' '}
                <span className="tabular-nums">0501234567</span> أو{' '}
                <span className="tabular-nums" dir="ltr">
                  +966501234567
                </span>
                ).
              </p>
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block text-xs font-semibold text-[var(--color-ink)] mb-1.5"
              >
                كلمة المرور
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={
                    mode === 'register' ? '10 أحرف على الأقل' : 'أدخل كلمة المرور'
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={mode === 'register' ? 10 : undefined}
                  aria-describedby={mode === 'register' ? 'auth-password-hint' : undefined}
                  required
                  className={`${fieldCls} pr-10 pl-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  aria-pressed={showPassword}
                  className="absolute left-1 top-1/2 -translate-y-1/2 w-10 h-9 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-cream)] flex items-center justify-center cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--color-gold)]"
                >
                  {showPassword ? (
                    <EyeOff size={16} aria-hidden="true" />
                  ) : (
                    <Eye size={16} aria-hidden="true" />
                  )}
                </button>
              </div>
              {mode === 'register' && (
                <p
                  id="auth-password-hint"
                  className="mt-1.5 text-[11px] text-[var(--color-muted)]"
                >
                  10 أحرف على الأقل، وألا تكون رقم الجوال أو كلمة مرور شائعة.
                </p>
              )}
            </div>

            {mode === 'register' && (
              <fieldset className="space-y-2.5 pt-1">
                <legend className="text-xs font-semibold text-[var(--color-ink)] mb-1">
                  اختر نوع الحساب ومزاياه
                </legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label
                    htmlFor="role-buyer"
                    className={`relative rounded-xl border p-4 cursor-pointer transition-colors flex flex-col gap-2.5 focus-within:ring-2 focus-within:ring-[var(--color-gold)] ${
                      role === 'buyer'
                        ? 'border-[var(--color-green-ink)] bg-[var(--color-cream)] ring-1 ring-[var(--color-green-ink)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)]/50'
                    }`}
                  >
                    <input
                      id="role-buyer"
                      type="radio"
                      name="account-role"
                      value="buyer"
                      checked={role === 'buyer'}
                      onChange={() => setRole('buyer')}
                      className="sr-only"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 font-display text-sm font-bold text-[var(--color-ink)]">
                        <span className="w-7 h-7 rounded-lg bg-[var(--color-green)]/10 text-[var(--color-green-ink)] flex items-center justify-center shrink-0">
                          <ShoppingBag size={14} aria-hidden="true" />
                        </span>
                        <span>حساب مشتري</span>
                      </span>
                      {role === 'buyer' && (
                        <Check
                          size={16}
                          className="text-[var(--color-green-ink)] shrink-0"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <ul className="space-y-1 text-[11px] text-[var(--color-muted)] leading-relaxed">
                      <li>· عرض أرقام التواصل والواتساب للمربين</li>
                      <li>· تقديم عروض السوم والمراسلة المباشرة</li>
                      <li>· حفظ المفضلة والإعجاب وتقييم المربين</li>
                    </ul>
                  </label>

                  <label
                    htmlFor="role-seller"
                    className={`relative rounded-xl border p-4 cursor-pointer transition-colors flex flex-col gap-2.5 focus-within:ring-2 focus-within:ring-[var(--color-gold)] ${
                      role === 'seller'
                        ? 'border-[var(--color-green-ink)] bg-[var(--color-cream)] ring-1 ring-[var(--color-green-ink)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)]/50'
                    }`}
                  >
                    <input
                      id="role-seller"
                      type="radio"
                      name="account-role"
                      value="seller"
                      checked={role === 'seller'}
                      onChange={() => setRole('seller')}
                      className="sr-only"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 font-display text-sm font-bold text-[var(--color-ink)]">
                        <span className="w-7 h-7 rounded-lg bg-[var(--color-gold)]/20 text-[var(--color-gold)] flex items-center justify-center shrink-0">
                          <Store size={14} aria-hidden="true" />
                        </span>
                        <span>حساب مربي / بائع</span>
                      </span>
                      {role === 'seller' && (
                        <Check
                          size={16}
                          className="text-[var(--color-green-ink)] shrink-0"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <ul className="space-y-1 text-[11px] text-[var(--color-muted)] leading-relaxed">
                      <li>· نشر إعلانات المواشي مع الصور والفيديو</li>
                      <li>· صفحة مراح عامة وطلب شارة «مربي موثق»</li>
                      <li>· إدارة السوم والمحادثات ولوحة الأداء</li>
                    </ul>
                  </label>
                </div>
              </fieldset>
            )}

            <button
              type="submit"
              disabled={busy || googleBusy || linkBusy}
              className="w-full min-h-[44px] h-11 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] disabled:opacity-60 text-white text-sm font-semibold cursor-pointer transition-colors"
            >
              {busy
                ? 'جاري التنفيذ...'
                : mode === 'login'
                ? 'دخول إلى الحساب'
                : 'إنشاء الحساب والمتابعة'}
            </button>

            <div className="pt-3 border-t border-[var(--color-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
              <span className="inline-flex items-center gap-1.5 text-[var(--color-muted)]">
                <ShieldCheck
                  size={15}
                  className="text-[var(--color-green-ink)] shrink-0"
                  aria-hidden="true"
                />
                <span>جلسة محمية ومشفرة لخصوصية بياناتك</span>
              </span>

              <button
                type="button"
                onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
                className="min-h-[36px] font-semibold text-[var(--color-green-ink)] hover:underline cursor-pointer text-right sm:text-left"
              >
                {mode === 'login'
                  ? 'ليس لديك حساب؟ أنشئ حساباً جديداً'
                  : 'لديك حساب بالفعل؟ سجّل الدخول'}
              </button>
            </div>
          </form>
        </div>

        {/* Marketplace Trust & Safety Side Panel */}
        <aside
          aria-label="مزايا الحساب في سوق الغنم"
          className="lg:col-span-5 bg-[var(--color-cream)] rounded-2xl border border-[var(--color-border)] p-6 sm:p-8 space-y-6"
        >
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-green-ink)]">
              <ShieldCheck size={14} aria-hidden="true" />
              <span>سوق الغنم 2.0</span>
            </span>
            <h2 className="font-display text-xl font-extrabold text-[var(--color-ink)]">
              تعامل موثوق وبيانات منظمة للحلال في المملكة
            </h2>
            <p className="text-xs sm:text-sm text-[var(--color-muted)] leading-relaxed">
              تتيح لك العضوية تجربة متكاملة لبيع وشراء الأغنام والماعز والإبل بشفافية ووضوح عبر جميع مناطق المملكة.
            </p>
          </div>

          <div className="space-y-3.5 pt-2 border-t border-[var(--color-border)]">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-green-ink)] flex items-center justify-center shrink-0">
                <ShieldCheck size={17} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="font-display text-sm font-bold text-[var(--color-ink)]">
                  مربون موثقون ومراحات معتمدة
                </p>
                <p className="text-xs text-[var(--color-muted)] leading-relaxed mt-0.5">
                  مراجعة إدارية لطلبات التوثيق وإبراز المراحات المعتمدة بشارة التوثيق.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-gold)] flex items-center justify-center shrink-0">
                <MessageSquare size={17} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="font-display text-sm font-bold text-[var(--color-ink)]">
                  محادثات فورية وعروض سوم منظمة
                </p>
                <p className="text-xs text-[var(--color-muted)] leading-relaxed mt-0.5">
                  تواصل مباشر داخل المنصة مع إشعارات فورية لمتابعة السوم والردود دون تعقيد.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-green-ink)] flex items-center justify-center shrink-0">
                <Lock size={17} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="font-display text-sm font-bold text-[var(--color-ink)]">
                  حماية الخصوصية ورقم التواصل
                </p>
                <p className="text-xs text-[var(--color-muted)] leading-relaxed mt-0.5">
                  لا تُكشف أرقام الاتصال المباشر للزوار غير المسجلين وتخضع الجلسات لحماية مشفرة.
                </p>
              </div>
            </div>
          </div>
        </aside>
        </div>
      </div>
    </section>
  );
}

