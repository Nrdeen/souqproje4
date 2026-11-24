import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  HelpCircle,
  Link2,
  Loader2,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
} from 'lucide-react';
import { ApiError, api, setCsrfToken } from '../lib/api';
import {
  loadGoogleIdentityScript,
  openGoogleOAuthPopup,
  promptGoogleOneTap,
  renderGoogleOfficialButton,
} from '../lib/google-auth';
import { openFacebookOAuthPopup } from '../lib/facebook-auth';
import {
  normalizeSaudiMobileClient,
  validatePasswordClient,
} from '../lib/auth-validation';
import type { AuthMode } from '../lib/router';
import type { FacebookAuthConfig, GoogleAuthConfig, User } from '../types/marketplace';

export interface GoogleAuthSuccessPayload {
  provider?: 'google' | 'facebook';
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
  facebookAuth?: FacebookAuthConfig;
  onGoogleSuccess?: (payload: GoogleAuthSuccessPayload) => Promise<void> | void;
  onLogin: (payload: { phone?: string; email?: string; password: string }) => Promise<void>;
  onRegister: (
    name: string,
    phone: string,
    password: string,
    role: 'buyer' | 'seller',
    email?: string
  ) => Promise<void>;
  onGoHome?: () => void;
}

const fieldCls =
  'w-full h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/75 focus:outline-none focus:border-[var(--color-green-ink)] focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/45 transition-colors';

const EMAIL_CLIENT_REGEX = /^[^\s@<>()[\]\\,;:"']+@[^\s@<>()[\]\\,;:"']+\.[^\s@<>()[\]\\,;:"']{2,}$/;

function computePasswordStrength(password: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  barColor: string;
  textColor: string;
} {
  if (!password) {
    return { score: 0, label: '', barColor: 'bg-[var(--color-border)]', textColor: 'text-[var(--color-muted)]' };
  }
  const len = [...password].length;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasArabic = /[\u0600-\u06FF]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9\u0600-\u06FF\s]/.test(password);
  const variety =
    (hasLower || hasArabic ? 1 : 0) +
    (hasUpper ? 1 : 0) +
    (hasDigit ? 1 : 0) +
    (hasSymbol ? 1 : 0);

  if (len < 10 || /^(.)\1+$/u.test(password)) {
    return {
      score: 1,
      label: 'ضعيفة (10 أحرف على الأقل)',
      barColor: 'bg-red-500',
      textColor: 'text-red-600 dark:text-red-400',
    };
  }
  if (len >= 14 && variety >= 3) {
    return {
      score: 4,
      label: 'قوية جداً',
      barColor: 'bg-emerald-600',
      textColor: 'text-emerald-700 dark:text-emerald-400',
    };
  }
  if (len >= 11 && variety >= 2) {
    return {
      score: 3,
      label: 'جيدة وموثوقة',
      barColor: 'bg-[var(--color-green)]',
      textColor: 'text-[var(--color-green-ink)]',
    };
  }
  return {
    score: 2,
    label: 'مقبولة (أضف أرقاماً أو رموزاً لزيادة الأمان)',
    barColor: 'bg-amber-500',
    textColor: 'text-amber-700 dark:text-amber-400',
  };
}

function GoogleOfficialLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
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

function FacebookOfficialLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path
        fill="currentColor"
        d="M22.675 0H1.325C.593 0 0 .593 0 1.325v21.351C0 23.407.593 24 1.325 24H12.82v-9.294H9.692v-3.622h3.128V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116c.73 0 1.323-.593 1.323-1.325V1.325C24 .593 23.407 0 22.675 0Z"
      />
    </svg>
  );
}

function SaudiFlagPrefix() {
  return (
    <div
      dir="ltr"
      aria-hidden="true"
      className="h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/75 inline-flex items-center gap-1.5 text-xs font-extrabold text-[var(--color-ink)] shrink-0 select-none"
    >
      <span
        className="inline-flex items-center justify-center w-5 h-3.5 rounded-[3px] bg-[#006C35] text-white text-[9px] font-bold tracking-tight"
        title="المملكة العربية السعودية"
      >
        SA
      </span>
      <span className="tabular-nums text-[var(--color-green-ink)]">+966</span>
    </div>
  );
}

export function AuthView({
  reason,
  initialMode = 'login',
  onModeChange,
  googleAuth,
  facebookAuth,
  onGoogleSuccess,
  onLogin,
  onRegister,
  onGoHome,
}: AuthViewProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);

  // Login state (Phone OR Email switcher inspired by Celebim)
  const [loginMethod, setLoginMethod] = useState<'phone' | 'email'>('phone');
  const [loginEmail, setLoginEmail] = useState('');
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);

  // Register state (First Name + Last Name + optional Email + Saudi Phone + Role + Password + Legal Consent)
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedAlerts, setAcceptedAlerts] = useState(false);
  const [termsPreviewOpen, setTermsPreviewOpen] = useState(false);

  // Shared credentials
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Google OAuth / GIS state
  const [resolvedGoogleConfig, setResolvedGoogleConfig] = useState<GoogleAuthConfig | null>(
    googleAuth ?? null
  );
  const [googleBusy, setGoogleBusy] = useState(false);
  const [showOfficialGisFallback, setShowOfficialGisFallback] = useState(false);
  const officialGisContainerRef = useRef<HTMLDivElement | null>(null);

  // Facebook OAuth state
  const [resolvedFacebookConfig, setResolvedFacebookConfig] = useState<FacebookAuthConfig | null>(
    facebookAuth ?? null
  );
  const [facebookBusy, setFacebookBusy] = useState(false);

  // Proof-of-ownership inline account linking (shared securely for Google or Facebook collisions)
  const [pendingLinkProvider, setPendingLinkProvider] = useState<'google' | 'facebook' | null>(null);
  const [pendingLinkCredential, setPendingLinkCredential] = useState<string | null>(null);
  const [pendingLinkEmailHint, setPendingLinkEmailHint] = useState<string>('');
  const [linkPhoneOrEmail, setLinkPhoneOrEmail] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);

  const activeGoogleConfig = googleAuth ?? resolvedGoogleConfig;
  const googleClientId = activeGoogleConfig?.clientId?.trim() || '';
  const isGoogleReady = Boolean(googleClientId && activeGoogleConfig?.enabled !== false);

  const activeFacebookConfig = facebookAuth ?? resolvedFacebookConfig;

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
        // Handled cleanly on click
      });
    return () => {
      cancelled = true;
    };
  }, [googleAuth]);

  useEffect(() => {
    if (facebookAuth) {
      setResolvedFacebookConfig(facebookAuth);
      return;
    }
    let cancelled = false;
    api
      .getFacebookAuthConfig()
      .then((cfg) => {
        if (!cancelled) setResolvedFacebookConfig(cfg);
      })
      .catch(() => {
        // Handled cleanly on click
      });
    return () => {
      cancelled = true;
    };
  }, [facebookAuth]);

  useEffect(() => {
    if (isGoogleReady) {
      loadGoogleIdentityScript().catch(() => {
        // Preload is best-effort
      });
    }
  }, [isGoogleReady, googleClientId]);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError('');
    setPendingLinkProvider(null);
    setPendingLinkCredential(null);
    setShowOfficialGisFallback(false);
    setForgotPasswordOpen(false);
    onModeChange?.(nextMode);
  };

  const normalizedPhone = normalizeSaudiMobileClient(phone);
  const phoneTouched = phone.trim().length > 0;
  const phoneValid = Boolean(normalizedPhone);

  const loginEmailTrimmed = loginEmail.trim().toLowerCase();
  const loginEmailValid = EMAIL_CLIENT_REGEX.test(loginEmailTrimmed);

  const passwordStrength = useMemo(
    () => (mode === 'register' ? computePasswordStrength(password) : null),
    [mode, password]
  );

  const submitGoogleCredential = useCallback(
    async (credential: string) => {
      setError('');
      setGoogleBusy(true);
      try {
        const res = await api.loginWithGoogle({
          credential,
          role: mode === 'register' ? 'seller' : undefined,
          mode,
        });
        setCsrfToken(res.csrfToken);
        setPendingLinkProvider(null);
        setPendingLinkCredential(null);
        setShowOfficialGisFallback(false);
        await onGoogleSuccess?.({
          provider: 'google',
          user: res.user,
          csrfToken: res.csrfToken,
          isNewUser: res.isNewUser,
          needsProfileCompletion: res.needsProfileCompletion,
        });
      } catch (err: any) {
        if (err instanceof ApiError && err.code === 'account_exists_link_required') {
          setPendingLinkProvider('google');
          setPendingLinkCredential(credential);
          setPendingLinkEmailHint('');
          setLinkPhoneOrEmail(normalizedPhone || '');
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
    [mode, normalizedPhone, onGoogleSuccess]
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
    if (busy || googleBusy || facebookBusy || linkBusy) return;
    setError('');
    setPendingLinkProvider(null);
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
        'تسجيل الدخول عبر Google غير مفعّل حالياً في إعدادات الخادم (يرجى إضافة GOOGLE_CLIENT_ID في الأسرار).'
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

      if (cfg.codeFlowEnabled) {
        const { url } = await api.getGoogleOAuthUrl({
          role: mode === 'register' ? 'seller' : undefined,
          mode,
        });
        const popupResult = await openGoogleOAuthPopup(url);
        if (popupResult.ok) {
          setShowOfficialGisFallback(false);
          await onGoogleSuccess?.({
            provider: 'google',
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

      setShowOfficialGisFallback(true);
    } catch (err: any) {
      setError(err?.message || 'تعذر بدء المصادقة عبر Google');
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleFacebookContinue = async () => {
    if (busy || googleBusy || facebookBusy || linkBusy) return;
    setError('');
    setPendingLinkProvider(null);
    setPendingLinkCredential(null);
    setShowOfficialGisFallback(false);

    let cfg = activeFacebookConfig;
    if (!cfg) {
      setFacebookBusy(true);
      try {
        cfg = await api.getFacebookAuthConfig();
        setResolvedFacebookConfig(cfg);
      } catch (err: any) {
        setFacebookBusy(false);
        setError(err?.message || 'تعذر التحقق من إعدادات تسجيل الدخول عبر Facebook');
        return;
      }
      setFacebookBusy(false);
    }

    if (!cfg?.enabled) {
      setError(
        'تسجيل الدخول عبر Facebook غير مفعّل حالياً في إعدادات الخادم (يرجى إضافة FACEBOOK_APP_ID و FACEBOOK_APP_SECRET في الأسرار).'
      );
      return;
    }

    setFacebookBusy(true);
    try {
      const { url } = await api.getFacebookOAuthUrl({
        role: mode === 'register' ? 'seller' : undefined,
        mode,
        intent: 'auth',
      });
      const popupResult = await openFacebookOAuthPopup(url);
      if (popupResult.ok && popupResult.intent === 'auth') {
        await onGoogleSuccess?.({
          provider: 'facebook',
          isNewUser: popupResult.isNewUser,
          needsProfileCompletion: popupResult.needsProfileCompletion,
        });
        return;
      }
      if (!popupResult.ok && popupResult.code === 'account_exists_link_required' && popupResult.linkToken) {
        setPendingLinkProvider('facebook');
        setPendingLinkCredential(popupResult.linkToken);
        setPendingLinkEmailHint(popupResult.email || '');
        setLinkPhoneOrEmail(popupResult.email || normalizedPhone || '');
        setLinkPassword('');
        setError(
          popupResult.error ||
            'يوجد حساب مسجل مسبقاً بهذا البريد الإلكتروني. أدخل بيانات حسابك الحالي لتأكيد ملكيته وربطه بحساب Facebook.'
        );
        return;
      }
      if (!popupResult.ok) {
        setError(popupResult.error);
      }
    } catch (err: any) {
      setError(err?.message || 'تعذر إتمام تسجيل الدخول عبر Facebook');
    } finally {
      setFacebookBusy(false);
    }
  };

  const handleConfirmAccountLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingLinkProvider || !pendingLinkCredential || linkBusy) return;
    setError('');

    const rawIdentifier = linkPhoneOrEmail.trim();
    const cleanedPhone = normalizeSaudiMobileClient(rawIdentifier);
    const cleanedEmail = EMAIL_CLIENT_REGEX.test(rawIdentifier.toLowerCase())
      ? rawIdentifier.toLowerCase()
      : null;

    if (pendingLinkProvider === 'google' && !cleanedPhone) {
      setError('أدخل رقم جوال سعودي صحيح بصيغة 05XXXXXXXX لإثبات ملكية الحساب');
      return;
    }
    if (pendingLinkProvider === 'facebook' && !cleanedPhone && !cleanedEmail) {
      setError('أدخل رقم جوال سعودي (05XXXXXXXX) أو البريد الإلكتروني المسجل للحساب');
      return;
    }
    if (!linkPassword) {
      setError('أدخل كلمة المرور الخاصة بحسابك الحالي لتأكيد الربط');
      return;
    }

    setLinkBusy(true);
    try {
      if (pendingLinkProvider === 'facebook') {
        const res = await api.linkFacebookWithPassword({
          ...(cleanedPhone ? { phone: cleanedPhone } : { email: cleanedEmail! }),
          password: linkPassword,
          linkToken: pendingLinkCredential,
        });
        setCsrfToken(res.csrfToken);
        setPendingLinkProvider(null);
        setPendingLinkCredential(null);
        setLinkPassword('');
        await onGoogleSuccess?.({
          provider: 'facebook',
          user: res.user,
          csrfToken: res.csrfToken,
          needsProfileCompletion: res.needsProfileCompletion,
        });
      } else {
        const res = await api.linkGoogleWithPassword({
          phone: cleanedPhone!,
          password: linkPassword,
          credential: pendingLinkCredential,
        });
        setCsrfToken(res.csrfToken);
        setPendingLinkProvider(null);
        setPendingLinkCredential(null);
        setLinkPassword('');
        await onGoogleSuccess?.({
          provider: 'google',
          user: res.user,
          csrfToken: res.csrfToken,
          needsProfileCompletion: res.needsProfileCompletion,
        });
      }
    } catch (err: any) {
      setError(
        err?.message ||
          `تعذر ربط الحساب بـ ${pendingLinkProvider === 'facebook' ? 'Facebook' : 'Google'}، تحقق من البيانات وحاول مرة أخرى`
      );
    } finally {
      setLinkBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'register') {
      const f = firstName.trim();
      const l = lastName.trim();
      const combinedName = `${f} ${l}`.trim();
      if (f.length < 2 || l.length < 2 || combinedName.length > 80) {
        setError('يرجى إدخال الاسم الأول واسم العائلة (حرفان على الأقل لكل منهما)');
        return;
      }
      const cleanEmail = registerEmail.trim().toLowerCase();
      if (cleanEmail && !EMAIL_CLIENT_REGEX.test(cleanEmail)) {
        setError('صيغة البريد الإلكتروني غير صحيحة');
        return;
      }
      const cleanedPhone = normalizeSaudiMobileClient(phone);
      if (!cleanedPhone) {
        setError('رقم الجوال غير صحيح، استخدم صيغة جوال سعودي مثل 05XXXXXXXX');
        return;
      }
      const pwError = validatePasswordClient(password, cleanedPhone);
      if (pwError) {
        setError(pwError);
        return;
      }
      if (!acceptedTerms) {
        setError('يرجى الموافقة على شروط الاستخدام وسياسة الخصوصية لإتمام التسجيل');
        return;
      }

      setBusy(true);
      try {
        await onRegister(combinedName, cleanedPhone, password, 'seller', cleanEmail || undefined);
        setPassword('');
      } catch (err: any) {
        setError(err?.message || 'تعذر إنشاء الحساب');
      } finally {
        setBusy(false);
      }
      return;
    }

    // Login mode
    if (loginMethod === 'email') {
      if (!loginEmailValid) {
        setError('أدخل بريداً إلكترونياً صحيحاً');
        return;
      }
      if (!password) {
        setError('أدخل كلمة المرور');
        return;
      }
      setBusy(true);
      try {
        await onLogin({ email: loginEmailTrimmed, password });
        setPassword('');
      } catch (err: any) {
        setError(err?.message || 'تعذر تسجيل الدخول');
      } finally {
        setBusy(false);
      }
      return;
    }

    const cleanedPhone = normalizeSaudiMobileClient(phone);
    if (!cleanedPhone) {
      setError('أدخل رقم جوال سعودي صحيح بصيغة 05XXXXXXXX');
      return;
    }
    if (!password) {
      setError('أدخل كلمة المرور');
      return;
    }

    setBusy(true);
    try {
      await onLogin({ phone: cleanedPhone, password });
      setPassword('');
    } catch (err: any) {
      setError(err?.message || 'تعذر تسجيل الدخول');
    } finally {
      setBusy(false);
    }
  };

  const socialBusy = googleBusy || facebookBusy;

  return (
    <section
      aria-label={mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
      className="min-h-[calc(100vh-120px)] w-full py-7 sm:py-11 px-3 sm:px-6 bg-gradient-to-b from-[var(--color-surface)] via-[var(--color-canvas)] to-[var(--color-cream)]/65 flex flex-col items-center justify-center transition-colors"
    >
      {/* Back link + Centered Brand Logo Header (Celebim-style framing) */}
      <div className="w-full max-w-[490px] mb-5 space-y-4">
        {onGoHome && (
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onGoHome}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[var(--color-green-ink)] hover:underline cursor-pointer"
            >
              <ArrowRight size={15} aria-hidden="true" />
              <span>العودة إلى الرئيسية</span>
            </button>
            <span className="text-[11px] font-semibold text-[var(--color-muted)] inline-flex items-center gap-1">
              <ShieldCheck size={13} className="text-[var(--color-green-ink)]" aria-hidden="true" />
              اتصال مشفر وآمن
            </span>
          </div>
        )}

        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center gap-2.5">
            <span className="w-11 h-11 rounded-2xl bg-[var(--color-green)] border-2 border-[var(--color-gold)]/70 shadow-sm inline-flex items-center justify-center text-[#F4C569]">
              <ShieldCheck size={22} aria-hidden="true" />
            </span>
            <div className="text-start">
              <p className="font-display text-xl sm:text-2xl font-extrabold text-[var(--color-ink)] leading-none">
                سوق الغنم
              </p>
              <p className="text-[11px] font-semibold text-[var(--color-green-ink)] mt-1">
                المنصة السعودية الموثوقة لتجارة المواشي
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Centered Elevated Auth Card */}
      <div className="w-full max-w-[490px] bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-[0_18px_46px_-16px_rgba(11,61,46,0.14)] overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-[var(--color-green)] via-[var(--color-gold)] to-[var(--color-green)]" />

        <div className="p-5 sm:p-7 space-y-5">
          {/* Segmented Top Switcher */}
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
              className={`min-h-[44px] sm:min-h-[40px] rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-[var(--color-green)] text-white shadow-sm'
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
              className={`min-h-[44px] sm:min-h-[40px] rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                mode === 'register'
                  ? 'bg-[var(--color-green)] text-white shadow-sm'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
              }`}
            >
              إنشاء حساب جديد
            </button>
          </div>

          {/* Card Title & Subtitle */}
          <div className="text-center space-y-1">
            <h1 className="font-display text-xl sm:text-2xl font-extrabold text-[var(--color-ink)]">
              {mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
            </h1>
            <p className="text-xs sm:text-sm text-[var(--color-muted)] leading-relaxed">
              {mode === 'login'
                ? 'للدخول، يرجى إدخال بياناتك.'
                : 'أنشئ حسابك في سوق الغنم 2.0 للمزايدة والشراء وعرض الحلال مباشرة.'}
            </p>
          </div>

          {/* Redirect Reason Notice */}
          {reason && (
            <div className="p-3 rounded-xl bg-[var(--color-cream)] border border-[var(--color-gold)]/45 text-xs font-semibold text-[var(--color-ink)] flex items-center gap-2">
              <Sparkles size={15} className="text-[var(--color-gold)] shrink-0" aria-hidden="true" />
              <span>{reason}</span>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <p
              role="alert"
              className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs sm:text-sm text-red-700 dark:text-red-300 leading-relaxed"
            >
              {error}
            </p>
          )}

          {/* Proof-of-Ownership Inline Linking Panel (Google OR Facebook email collision protection) */}
          {pendingLinkProvider && pendingLinkCredential ? (
            <form
              onSubmit={handleConfirmAccountLink}
              className="rounded-xl border-2 border-[var(--color-gold)]/55 bg-[var(--color-cream)]/55 p-4 space-y-3.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <Link2
                    size={18}
                    className="text-[var(--color-green-ink)] shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div>
                    <h2 className="font-display text-sm font-extrabold text-[var(--color-ink)]">
                      تأكيد ملكية الحساب لربطه بـ{' '}
                      {pendingLinkProvider === 'facebook' ? 'Facebook' : 'Google'}
                    </h2>
                    <p className="text-xs text-[var(--color-muted)] mt-0.5 leading-relaxed">
                      لحماية حسابك، أدخل بيانات الدخول المسجلة{' '}
                      {pendingLinkEmailHint ? `(${pendingLinkEmailHint}) ` : ''}
                      مع كلمة المرور لإتمام الربط بأمان.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPendingLinkProvider(null);
                    setPendingLinkCredential(null);
                    setLinkPassword('');
                    setError('');
                  }}
                  className="text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-ink)] cursor-pointer shrink-0"
                >
                  إلغاء
                </button>
              </div>

              <div>
                <label
                  htmlFor="link-account-identifier"
                  className="block text-xs font-semibold text-[var(--color-ink)] mb-1"
                >
                  {pendingLinkProvider === 'facebook'
                    ? 'رقم الجوال السعودي أو البريد الإلكتروني'
                    : 'رقم الجوال السعودي المسجل'}
                </label>
                <input
                  id="link-account-identifier"
                  type="text"
                  dir="ltr"
                  placeholder={pendingLinkProvider === 'facebook' ? '05XXXXXXXX أو name@example.com' : '05XXXXXXXX'}
                  value={linkPhoneOrEmail}
                  onChange={(e) => setLinkPhoneOrEmail(e.target.value)}
                  className={`${fieldCls} text-right`}
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
                  value={linkPassword}
                  onChange={(e) => setLinkPassword(e.target.value)}
                  placeholder="أدخل كلمة مرور حسابك"
                  className={fieldCls}
                />
              </div>

              <button
                type="submit"
                disabled={linkBusy}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] disabled:opacity-60 text-white text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                {linkBusy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                <span>
                  {linkBusy
                    ? 'جاري تأكيد الربط...'
                    : `تأكيد الملكية وربط حساب ${
                        pendingLinkProvider === 'facebook' ? 'Facebook' : 'Google'
                      }`}
                </span>
              </button>
            </form>
          ) : (
            <>
              {/* Primary Credentials Form (Celebim-first layout) */}
              <form onSubmit={submit} className="space-y-4" noValidate>
                {/* REGISTER FIELDS */}
                {mode === 'register' && (
                  <>
                    {/* First Name + Last Name (2-column row inspired by Celebim) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="auth-name"
                          className="block text-xs font-bold text-[var(--color-ink)] mb-1.5"
                        >
                          الاسم الأول <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <UserIcon
                            size={15}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none"
                            aria-hidden="true"
                          />
                          <input
                            id="auth-name"
                            type="text"
                            autoComplete="given-name"
                            placeholder="مثال: فهد"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            required
                            className={`${fieldCls} pr-10`}
                          />
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="auth-last-name"
                          className="block text-xs font-bold text-[var(--color-ink)] mb-1.5"
                        >
                          اسم العائلة <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <UserIcon
                            size={15}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none"
                            aria-hidden="true"
                          />
                          <input
                            id="auth-last-name"
                            type="text"
                            autoComplete="family-name"
                            placeholder="مثال: الدوسري"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            required
                            className={`${fieldCls} pr-10`}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Email field (optional, supports email login) */}
                    <div>
                      <label
                        htmlFor="auth-register-email"
                        className="block text-xs font-bold text-[var(--color-ink)] mb-1.5"
                      >
                        البريد الإلكتروني{' '}
                        <span className="font-normal text-[var(--color-muted)]">(اختياري للدخول بالبريد)</span>
                      </label>
                      <div className="relative">
                        <Mail
                          size={15}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none"
                          aria-hidden="true"
                        />
                        <input
                          id="auth-register-email"
                          type="email"
                          dir="ltr"
                          autoComplete="email"
                          placeholder="name@example.com"
                          value={registerEmail}
                          onChange={(e) => setRegisterEmail(e.target.value)}
                          className={`${fieldCls} pr-10 text-right`}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* LOGIN METHOD SWITCHER (Phone vs Email - segmented tabs like Celebim Telefon / Email) */}
                {mode === 'login' && (
                  <div
                    role="radiogroup"
                    aria-label="طريقة تسجيل الدخول"
                    className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)]"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={loginMethod === 'phone'}
                      onClick={() => {
                        setLoginMethod('phone');
                        setError('');
                      }}
                      className={`min-h-[40px] px-3 rounded-lg text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        loginMethod === 'phone'
                          ? 'bg-[var(--color-surface)] text-[var(--color-green-ink)] shadow-sm'
                          : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                      }`}
                    >
                      <Phone size={14} aria-hidden="true" />
                      <span>رقم الجوال</span>
                    </button>

                    <button
                      type="button"
                      role="radio"
                      aria-checked={loginMethod === 'email'}
                      onClick={() => {
                        setLoginMethod('email');
                        setError('');
                      }}
                      className={`min-h-[40px] px-3 rounded-lg text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        loginMethod === 'email'
                          ? 'bg-[var(--color-surface)] text-[var(--color-green-ink)] shadow-sm'
                          : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                      }`}
                    >
                      <Mail size={14} aria-hidden="true" />
                      <span>البريد الإلكتروني</span>
                    </button>
                  </div>
                )}

                {/* PHONE INPUT (Always in register; or in login when loginMethod === 'phone') */}
                {(mode === 'register' || loginMethod === 'phone') && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="auth-phone"
                        className="text-xs font-bold text-[var(--color-ink)]"
                      >
                        رقم الجوال السعودي <span className="text-red-500">*</span>
                      </label>
                      {phoneTouched && (
                        <span
                          className={`text-[11px] font-bold inline-flex items-center gap-1 ${
                            phoneValid
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {phoneValid ? (
                            <>
                              <CheckCircle2 size={12} aria-hidden="true" />
                              <span>صيغة صحيحة ({normalizedPhone})</span>
                            </>
                          ) : (
                            'يبدأ بـ 05 ويتكون من 10 أرقام'
                          )}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative flex-1 min-w-0">
                        <Phone
                          size={15}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none"
                          aria-hidden="true"
                        />
                        <input
                          id="auth-phone"
                          type="tel"
                          inputMode="tel"
                          dir="ltr"
                          autoComplete="tel"
                          placeholder="05XXXXXXXX"
                          aria-describedby="auth-phone-hint"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          required
                          className={`${fieldCls} pr-10 text-right tabular-nums`}
                        />
                      </div>
                      <SaudiFlagPrefix />
                    </div>

                    <p id="auth-phone-hint" className="mt-1 text-[11px] text-[var(--color-muted)]">
                      يدعم الصيغ السعودية: 05XXXXXXXX أو 5XXXXXXXX أو +966 5XXXXXXXX.
                    </p>
                  </div>
                )}

                {/* EMAIL LOGIN INPUT */}
                {mode === 'login' && loginMethod === 'email' && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="auth-login-email"
                        className="text-xs font-bold text-[var(--color-ink)]"
                      >
                        البريد الإلكتروني <span className="text-red-500">*</span>
                      </label>
                      {loginEmail.trim().length > 0 && (
                        <span
                          className={`text-[11px] font-bold ${
                            loginEmailValid
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {loginEmailValid ? 'بريد صحيح' : 'أدخل بريداً إلكترونياً صحيحاً'}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Mail
                        size={15}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none"
                        aria-hidden="true"
                      />
                      <input
                        id="auth-login-email"
                        type="email"
                        dir="ltr"
                        autoComplete="email"
                        placeholder="name@example.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        required
                        className={`${fieldCls} pr-10 text-right`}
                      />
                    </div>
                  </div>
                )}

                {/* PASSWORD INPUT */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="auth-password"
                      className="text-xs font-bold text-[var(--color-ink)]"
                    >
                      كلمة المرور <span className="text-red-500">*</span>
                    </label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => setForgotPasswordOpen((v) => !v)}
                        className="text-[11px] font-bold text-[var(--color-green-ink)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <HelpCircle size={12} aria-hidden="true" />
                        <span>نسيت كلمة المرور؟</span>
                      </button>
                    )}
                  </div>

                  <div className="relative">
                    <Lock
                      size={15}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                      placeholder={mode === 'register' ? '10 أحرف على الأقل' : 'أدخل كلمة المرور'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className={`${fieldCls} pr-10 pl-12`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      aria-pressed={showPassword}
                      className="absolute left-1 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[40px] flex items-center justify-center rounded-lg text-[var(--color-muted)] hover:text-[var(--color-ink)] cursor-pointer"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  {/* Password Recovery Inline Guidance */}
                  {mode === 'login' && forgotPasswordOpen && (
                    <div className="mt-2 p-3 rounded-xl border border-[var(--color-gold)]/45 bg-[var(--color-cream)]/60 text-xs text-[var(--color-ink)] space-y-1 leading-relaxed">
                      <p className="font-bold text-[var(--color-green-ink)]">
                        خيارات استعادة الوصول إلى حسابك:
                      </p>
                      <p className="text-[var(--color-muted)]">
                        إذا ربطت حسابك سابقاً بـ Google أو Facebook يمكنك الدخول عبر خيارات الدخول الإضافية بالأسفل، أو التواصل مع الدعم الفني عبر صفحة «تواصل معنا» لاستعادة الوصول.
                      </p>
                    </div>
                  )}

                  {/* Password Strength Meter (Register Mode) */}
                  {mode === 'register' && passwordStrength && passwordStrength.score > 0 && (
                    <div className="mt-2 space-y-1.5" aria-live="polite">
                      <div className="grid grid-cols-4 gap-1.5">
                        {[1, 2, 3, 4].map((step) => (
                          <span
                            key={step}
                            className={`h-1.5 rounded-full transition-colors ${
                              passwordStrength.score >= step
                                ? passwordStrength.barColor
                                : 'bg-[var(--color-border)]'
                            }`}
                          />
                        ))}
                      </div>
                      <p className={`text-[11px] font-semibold ${passwordStrength.textColor}`}>
                        قوة كلمة المرور: {passwordStrength.label}
                      </p>
                    </div>
                  )}
                </div>

                {/* LEGAL CONSENT CHECKBOXES (Celebim-style bordered panel on Register Mode) */}
                {mode === 'register' && (
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/45 p-3.5 space-y-2.5">
                    <label className="flex items-start gap-2.5 cursor-pointer text-xs text-[var(--color-ink)] leading-relaxed">
                      <input
                        id="auth-accept-terms"
                        type="checkbox"
                        checked={acceptedTerms}
                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-[var(--color-border)] accent-[var(--color-green)] cursor-pointer shrink-0"
                      />
                      <span>
                        أوافق على{' '}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setTermsPreviewOpen((v) => !v);
                          }}
                          className="font-bold text-[var(--color-green-ink)] underline hover:opacity-80 cursor-pointer"
                        >
                          شروط الاستخدام وسياسة الخصوصية
                        </button>{' '}
                        الخاصة بسوق الغنم 2.0 <span className="text-red-500">*</span>
                      </span>
                    </label>

                    {termsPreviewOpen && (
                      <div className="p-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[11px] text-[var(--color-muted)] leading-relaxed">
                        تلتزم منصة سوق الغنم بحماية بياناتك وعدم مشاركة رقم جوالك إلا مع المستخدمين المسجلين عند طلب التواصل، مع خضوع جميع الإعلانات لمراجعة الإدارة لضمان المصداقية.
                      </div>
                    )}

                    <label className="flex items-start gap-2.5 cursor-pointer text-xs text-[var(--color-muted)] leading-relaxed">
                      <input
                        id="auth-accept-alerts"
                        type="checkbox"
                        checked={acceptedAlerts}
                        onChange={(e) => setAcceptedAlerts(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-[var(--color-border)] accent-[var(--color-green)] cursor-pointer shrink-0"
                      />
                      <span>أرغب بتلقي تنبيهات الأسعار الموسمية وعروض المربين الموثقين (اختياري)</span>
                    </label>
                  </div>
                )}

                {/* SUBMIT CTA */}
                <button
                  type="submit"
                  disabled={busy || socialBusy || linkBusy}
                  className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] disabled:opacity-60 text-white text-sm font-extrabold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
                >
                  {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                  <span>
                    {busy
                      ? mode === 'login'
                        ? 'جاري تسجيل الدخول...'
                        : 'جاري إنشاء الحساب...'
                      : mode === 'login'
                      ? 'تسجيل الدخول'
                      : 'إنشاء الحساب والبدء الآن'}
                  </span>
                </button>
              </form>

              {/* Extra Social Sign-In / Sign-Up Options at Bottom (Google + Facebook) */}
              <div className="space-y-2.5 pt-1">
                <div className="relative py-1 flex items-center" role="separator">
                  <div className="flex-1 border-t border-[var(--color-border)]" />
                  <span className="px-3 text-[11px] font-semibold text-[var(--color-muted)]">
                    {mode === 'login' ? 'أو خيارات دخول إضافية' : 'أو التسجيل السريع عبر'}
                  </span>
                  <div className="flex-1 border-t border-[var(--color-border)]" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={busy || socialBusy || linkBusy}
                    onClick={handleGoogleContinue}
                    aria-label={
                      mode === 'register' ? 'إنشاء حساب عبر Google' : 'المتابعة باستخدام Google'
                    }
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)]/75 hover:border-[var(--color-green-ink)]/45 disabled:opacity-60 text-[var(--color-ink)] text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    {googleBusy ? (
                      <Loader2 size={16} className="animate-spin text-[var(--color-green-ink)]" aria-hidden="true" />
                    ) : (
                      <GoogleOfficialLogo />
                    )}
                    <span>{googleBusy ? 'جاري التحقق...' : 'المتابعة عبر Google'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={busy || socialBusy || linkBusy}
                    onClick={handleFacebookContinue}
                    aria-label={
                      mode === 'register'
                        ? 'إنشاء حساب عبر Facebook'
                        : 'المتابعة باستخدام Facebook'
                    }
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-60 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
                  >
                    {facebookBusy ? (
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <FacebookOfficialLogo />
                    )}
                    <span>{facebookBusy ? 'جاري التحقق...' : 'المتابعة عبر Facebook'}</span>
                  </button>
                </div>

                {showOfficialGisFallback && isGoogleReady && (
                  <div className="pt-1 flex flex-col items-center gap-1.5">
                    <div
                      ref={officialGisContainerRef}
                      className="min-h-[44px] flex items-center justify-center w-full"
                    />
                    <p className="text-[11px] text-[var(--color-muted)] text-center">
                      اختر حساب Google عبر الزر الرسمي أعلاه للمتابعة الآمنة.
                    </p>
                  </div>
                )}
              </div>

              {/* Footer Toggle Prompt */}
              <div className="pt-2 border-t border-[var(--color-border)] text-center text-xs sm:text-sm text-[var(--color-muted)]">
                {mode === 'login' ? (
                  <p>
                    ليس لديك حساب؟{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('register')}
                      className="font-extrabold text-[var(--color-green-ink)] hover:underline cursor-pointer"
                    >
                      أنشئ حساباً جديداً
                    </button>
                  </p>
                ) : (
                  <p>
                    لديك حساب بالفعل؟{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="font-extrabold text-[var(--color-green-ink)] hover:underline cursor-pointer"
                    >
                      سجّل الدخول
                    </button>
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Compact Security & Platform Trust Strip Below Card */}
      <div className="w-full max-w-[490px] mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] font-semibold text-[var(--color-muted)] text-center">
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 size={13} className="text-[var(--color-green-ink)]" aria-hidden="true" />
          تشفير كلمات المرور Argon2id
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 size={13} className="text-[var(--color-green-ink)]" aria-hidden="true" />
          حسابات ومراحات موثقة
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 size={13} className="text-[var(--color-green-ink)]" aria-hidden="true" />
          عمولة 0% خلال فترة التأسيس
        </span>
      </div>
    </section>
  );
}
