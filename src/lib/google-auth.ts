export interface GoogleCredentialResponse {
  credential?: string;
  select_by?: string;
}

export interface GooglePromptMomentNotification {
  isNotDisplayed: () => boolean;
  getNotDisplayedReason: () => string;
  isSkippedMoment: () => boolean;
  getSkippedReason: () => string;
  isDismissedMoment: () => boolean;
  getDismissedReason: () => string;
}

export interface GoogleAccountsId {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    cancel_on_tap_outside?: boolean;
    ux_mode?: 'popup' | 'redirect';
    itp_support?: boolean;
    use_fedcm_for_prompt?: boolean;
  }) => void;
  prompt: (momentListener?: (notification: GooglePromptMomentNotification) => void) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon';
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      logo_alignment?: 'left' | 'center';
      width?: number | string;
      locale?: string;
    }
  ) => void;
  cancel: () => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleAccountsId;
      };
    };
  }
}

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let gisLoadPromise: Promise<GoogleAccountsId> | null = null;

export function loadGoogleIdentityScript(timeoutMs = 10_000): Promise<GoogleAccountsId> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('المتصفح غير متاح لتحميل خدمة Google'));
  }
  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google.accounts.id);
  }
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise<GoogleAccountsId>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SCRIPT_SRC}"]`
    );

    let done = false;
    const timer = window.setTimeout(() => {
      if (done) return;
      done = true;
      gisLoadPromise = null;
      reject(
        new Error('انتهت مهلة الاتصال بخدمة Google، تحقق من اتصالك بالإنترنت وحاول مرة أخرى')
      );
    }, timeoutMs);

    const succeed = () => {
      if (done) return;
      if (window.google?.accounts?.id) {
        done = true;
        window.clearTimeout(timer);
        resolve(window.google.accounts.id);
      } else {
        done = true;
        window.clearTimeout(timer);
        gisLoadPromise = null;
        reject(new Error('تعذر تهيئة خدمة تسجيل الدخول عبر Google'));
      }
    };

    const fail = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      gisLoadPromise = null;
      reject(
        new Error('تعذر تحميل خدمة تسجيل الدخول من Google، تحقق من الاتصال أو إعدادات المتصفح')
      );
    };

    if (existing) {
      existing.addEventListener('load', succeed, { once: true });
      existing.addEventListener('error', fail, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = succeed;
    script.onerror = fail;
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

export type GooglePromptOutcome =
  | { kind: 'credential'; credential: string }
  | { kind: 'canceled'; message: string }
  | { kind: 'unavailable'; reason: string };

export async function promptGoogleOneTap(clientId: string): Promise<GooglePromptOutcome> {
  const gis = await loadGoogleIdentityScript();
  return new Promise<GooglePromptOutcome>((resolve) => {
    let settled = false;
    const finish = (outcome: GooglePromptOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const safetyTimer = window.setTimeout(() => {
      finish({ kind: 'unavailable', reason: 'timeout' });
    }, 60_000);

    gis.initialize({
      client_id: clientId,
      ux_mode: 'popup',
      cancel_on_tap_outside: true,
      itp_support: true,
      use_fedcm_for_prompt: true,
      callback: (response) => {
        window.clearTimeout(safetyTimer);
        if (response?.credential) {
          finish({ kind: 'credential', credential: response.credential });
        } else {
          finish({
            kind: 'canceled',
            message: 'لم يتم إكمال المصادقة عبر Google، يمكنك المحاولة مجدداً',
          });
        }
      },
    });

    gis.prompt((notification) => {
      if (settled) return;
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        window.clearTimeout(safetyTimer);
        const reason = notification.isNotDisplayed()
          ? notification.getNotDisplayedReason()
          : notification.getSkippedReason();
        finish({ kind: 'unavailable', reason: reason || 'not_displayed' });
        return;
      }
      if (notification.isDismissedMoment()) {
        const reason = notification.getDismissedReason();
        if (reason !== 'credential_returned') {
          window.clearTimeout(safetyTimer);
          finish({
            kind: 'canceled',
            message: 'تم إلغاء تسجيل الدخول عبر Google',
          });
        }
      }
    });
  });
}

export type GooglePopupResult =
  | {
      ok: true;
      isNewUser?: boolean;
      needsProfileCompletion?: boolean;
    }
  | {
      ok: false;
      code?: string;
      error: string;
    };

export function openGoogleOAuthPopup(authUrl: string): Promise<GooglePopupResult> {
  if (typeof window === 'undefined') {
    return Promise.resolve({ ok: false, code: 'no_window', error: 'المتصفح غير متاح' });
  }

  const width = 520;
  const height = 640;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));

  const popup = window.open(
    authUrl,
    'souq-google-auth',
    `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
  );

  if (!popup) {
    return Promise.resolve({
      ok: false,
      code: 'popup_blocked',
      error: 'تعذر فتح نافذة Google المنبثقة؛ يرجى السماح بالنوافذ المنبثقة أو استخدام زر Google الرسمي أدناه.',
    });
  }

  return new Promise<GooglePopupResult>((resolve) => {
    let settled = false;
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(pollTimer);
      window.clearTimeout(timeoutTimer);
    };
    const finish = (result: GooglePopupResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.type !== 'souq-google-auth') return;
      if (data.ok) {
        finish({
          ok: true,
          isNewUser: Boolean(data.isNewUser),
          needsProfileCompletion: Boolean(data.needsProfileCompletion),
        });
      } else {
        finish({
          ok: false,
          code: typeof data.code === 'string' ? data.code : 'google_oauth_error',
          error:
            typeof data.error === 'string' && data.error.trim()
              ? data.error
              : 'تعذر إتمام تسجيل الدخول عبر Google',
        });
      }
    };

    window.addEventListener('message', onMessage);

    const pollTimer = window.setInterval(() => {
      if (popup.closed) {
        finish({
          ok: false,
          code: 'google_canceled',
          error: 'تم إغلاق نافذة تسجيل الدخول عبر Google قبل إتمام العملية',
        });
      }
    }, 450);

    const timeoutTimer = window.setTimeout(() => {
      try {
        if (!popup.closed) popup.close();
      } catch {
        // ignore cross-origin window close restriction
      }
      finish({
        ok: false,
        code: 'google_timeout',
        error: 'انتهت مهلة المصادقة عبر Google، يرجى المحاولة مرة أخرى',
      });
    }, 3 * 60_000);
  });
}

export async function renderGoogleOfficialButton(params: {
  container: HTMLElement;
  clientId: string;
  mode: 'login' | 'register';
  isDark?: boolean;
  onCredential: (credential: string) => void;
}): Promise<void> {
  const gis = await loadGoogleIdentityScript();
  gis.initialize({
    client_id: params.clientId,
    ux_mode: 'popup',
    cancel_on_tap_outside: true,
    itp_support: true,
    callback: (response) => {
      if (response?.credential) {
        params.onCredential(response.credential);
      }
    },
  });
  params.container.innerHTML = '';
  gis.renderButton(params.container, {
    type: 'standard',
    theme: params.isDark ? 'filled_black' : 'outline',
    size: 'large',
    text: params.mode === 'register' ? 'signup_with' : 'continue_with',
    shape: 'rectangular',
    logo_alignment: 'center',
    locale: 'ar',
    width: Math.min(380, Math.max(240, params.container.clientWidth || 320)),
  });
}
